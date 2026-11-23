"""
This module contains class to manage RPC communications (Telegram, API, ...)
"""

import logging
import time
from collections import deque
from queue import Empty, Queue
from threading import Thread

from freqtrade.constants import Config
from freqtrade.enums import NO_ECHO_MESSAGES, RPCMessageType
from freqtrade.rpc import RPC, RPCHandler
from freqtrade.rpc.rpc_types import RPCSendMsg


logger = logging.getLogger(__name__)


class RPCManager:
    """
    Class to manage RPC objects (Telegram, API, ...)
    """

    def __init__(self, freqtrade) -> None:
        """Initializes all enabled rpc modules"""
        self.registered_modules: list[RPCHandler] = []
        self._queues: dict[str, Queue[RPCSendMsg | None]] = {}
        self._workers: dict[str, Thread] = {}
        self._rpc = RPC(freqtrade)
        config = freqtrade.config
        # Enable telegram
        if config.get("telegram", {}).get("enabled", False):
            logger.info("正在启用 RPC：telegram ...")
            from freqtrade.rpc.telegram import Telegram

            self._register(Telegram(self._rpc, config))

        # Enable discord
        if config.get("discord", {}).get("enabled", False):
            logger.info("正在启用 RPC：discord ...")
            from freqtrade.rpc.discord import Discord

            self._register(Discord(self._rpc, config))

        # Enable Webhook
        if config.get("webhook", {}).get("enabled", False):
            logger.info("正在启用 RPC：webhook ...")
            from freqtrade.rpc.webhook import Webhook

            self._register(Webhook(self._rpc, config))

        # Enable local rest api server for cmd line control
        if config.get("api_server", {}).get("enabled", False):
            logger.info("正在启用 RPC：api_server")
            from freqtrade.rpc.api_server import ApiServer

            apiserver = ApiServer(config)
            apiserver.add_rpc_handler(self._rpc)
            self._register(apiserver)

    def _register(self, mod: RPCHandler) -> None:
        """
        Register a rpc module.
        Modules using a queue get a dedicated worker thread, so slow handlers
        (e.g. a slow webhook endpoint) don't block the bot.
        """
        self.registered_modules.append(mod)
        if mod._use_queue:
            q: Queue[RPCSendMsg | None] = Queue()
            worker = Thread(
                target=self._worker, args=(mod, q), name=f"FTRPC-{mod.name}", daemon=True
            )
            self._queues[mod.name] = q
            self._workers[mod.name] = worker
            worker.start()

    def _worker(self, mod: RPCHandler, q: "Queue[RPCSendMsg | None]") -> None:
        """
        Deliver queued messages to the given module until the stop sentinel (None) is received.
        """
        while True:
            msg = q.get()
            try:
                if msg is None:
                    return
                self._deliver(mod, msg)
            finally:
                q.task_done()

    @staticmethod
    def _deliver(mod: RPCHandler, msg: RPCSendMsg) -> None:
        try:
            mod.send_msg(msg)
        except NotImplementedError:
            logger.error(f"消息类型 '{msg['type']}' 未被处理器 {mod.name} 实现。")
        except Exception:
            logger.exception(f"RPC 模块 {mod.name} 发生异常")

    def _dispatch(self, mod: RPCHandler, msg: RPCSendMsg) -> None:
        """
        Send a message to a module - either queued or directly.
        """
        if q := self._queues.get(mod.name):
            # Shallow copy - handlers may modify the message, and it's shared across threads.
            q.put(msg.copy())
            if (size := q.qsize()) > 0 and size % 100 == 0:
                # Warn if a queue has 100 messages pending
                logger.warning(f"RPC 模块 {mod.name} 处理缓慢——{size} 条消息待发送。")
        else:
            self._deliver(mod, msg)

    def flush(self) -> None:
        """
        Block until all queued messages have been processed.
        Only used in tests.
        """
        for q in self._queues.values():
            q.join()

    @staticmethod
    def _discard_pending(q: "Queue[RPCSendMsg | None]") -> int:
        """
        Remove all pending messages from the queue, leaving only the stop sentinel.
        :return: Number of discarded messages
        """
        discarded = 0
        while True:
            try:
                msg = q.get_nowait()
            except Empty:
                break
            q.task_done()
            discarded += msg is not None
        q.put(None)
        return discarded

    def _stop_workers(self) -> None:
        """
        Stop all worker threads after delivering pending messages.
        Waits at most 10 seconds in total for pending messages - afterwards, remaining
        messages are discarded and the message currently being sent gets another 10 seconds.
        """
        for q in self._queues.values():
            q.put(None)
        deadline = time.monotonic() + 10
        for name, worker in self._workers.items():
            worker.join(timeout=max(deadline - time.monotonic(), 0))
            if worker.is_alive():
                discarded = self._discard_pending(self._queues[name])
                logger.warning(
                    f"RPC 模块 {name} 未发送完待处理消息——" f"丢弃 {discarded} 条消息。"
                )
                # Give the current message a chance to finish before the module is torn down.
                worker.join(timeout=10)
                if worker.is_alive():
                    logger.warning(f"RPC 模块 {name} 仍在发送——继续清理。")
        self._queues = {}
        self._workers = {}

    def cleanup(self) -> None:
        """Stops all enabled rpc modules"""
        logger.info("正在清理 RPC 模块 ...")
        self._stop_workers()
        while self.registered_modules:
            mod = self.registered_modules.pop()
            logger.info(f"正在清理 RPC：{mod.name} ...")
            mod.cleanup()
            del mod

    def send_msg(self, msg: RPCSendMsg) -> None:
        """
        Send given message to all registered rpc modules.
        A message consists of one or more key value pairs of strings.
        e.g.:
        {
            'status': 'stopping bot'
        }
        """
        if msg.get("type") not in NO_ECHO_MESSAGES:
            logger.info(f"发送 RPC 消息：{msg}")
        for mod in self.registered_modules:
            logger.debug("转发消息到 RPC：%s", mod.name)
            self._dispatch(mod, msg)

    def process_msg_queue(self, queue: deque) -> None:
        """
        Process all messages in the queue.
        """
        while queue:
            msg = queue.popleft()
            logger.info(f"发送 RPC 策略消息：{msg}")
            for mod in self.registered_modules:
                if mod._config.get(mod.name, {}).get("allow_custom_messages", False):
                    self._dispatch(
                        mod,
                        {
                            "type": RPCMessageType.STRATEGY_MSG,
                            "msg": msg,
                        },
                    )

    def startup_messages(self, config: Config, pairlist, protections) -> None:
        if config["dry_run"]:
            self.send_msg(
                {
                    "type": RPCMessageType.WARNING,
                    "status": "模拟盘已开启，所有交易均为模拟。",
                }
            )
        stake_currency = config["stake_currency"]
        stake_amount = config["stake_amount"]
        minimal_roi = config["minimal_roi"]
        stoploss = config["stoploss"]
        trailing_stop = config["trailing_stop"]
        timeframe = config["timeframe"]
        exchange_name = config["exchange"]["name"]
        if config["exchange"].get("demo_trading"):
            exchange_name += " (demo trading)"
        strategy_name = config.get("strategy", "")
        pos_adjust_enabled = "开启" if config["position_adjustment_enable"] else "关闭"
        self.send_msg(
            {
                "type": RPCMessageType.STARTUP,
                "status": f"*交易所:* `{exchange_name}`\n"
                f"*单笔投入:* `{stake_amount} {stake_currency}`\n"
                f"*最小 ROI:* `{minimal_roi}`\n"
                f"*{'移动' if trailing_stop else ''}止损:* `{stoploss}`\n"
                f"*仓位调整:* `{pos_adjust_enabled}`\n"
                f"*周期:* `{timeframe}`\n"
                f"*策略:* `{strategy_name}`",
            }
        )
        self.send_msg(
            {
                "type": RPCMessageType.STARTUP,
                "status": f"正在基于 {pairlist.short_desc()} "
                f"寻找 {stake_currency} 交易机会。",
            }
        )
        if len(protections.name_list) > 0:
            prots = "\n".join([p for prot in protections.short_desc() for k, p in prot.items()])
            self.send_msg(
                {"type": RPCMessageType.STARTUP, "status": f"已启用保护机制: \n{prots}"}
            )
