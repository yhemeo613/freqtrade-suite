import asyncio
import logging
from collections import deque
from copy import deepcopy
from functools import partial
from threading import Event, RLock, Thread

import ccxt

from freqtrade.constants import Config, PairWithTimeframe
from freqtrade.enums.candletype import CandleType
from freqtrade.exceptions import TemporaryError
from freqtrade.exchange.common import retrier
from freqtrade.exchange.exchange import timeframe_to_seconds
from freqtrade.exchange.exchange_types import OHLCVResponse, OrderBook
from freqtrade.util import dt_ts, format_ms_time, format_ms_time_det


logger = logging.getLogger(__name__)


def _config_int(config: Config, key: str, default: int, label: str) -> int:
    """
    从配置读取正整数配额键；缺失/非法时回退默认值，避免配置写错导致启动失败。
    """
    try:
        value = int(config.get(key, default))
        if value > 0:
            return value
        logger.warning(f"{label}配置 {key} 必须为正整数，使用默认值 {default}")
    except (TypeError, ValueError):
        logger.warning(f"{label}配置 {key} 非法，使用默认值 {default}")
    return default


class ExchangeWS:
    # TODO: should either be configurable or use the main timeframe.
    ob_timeout = 60  # 1m
    # Timeout for the get orderbook snapshot round trip to the websocket thread.
    ob_snapshot_timeout = 1.0
    # 交易所 WS 订阅配额：OKX 官方限制每连接 subscribe+unsubscribe+login 共 480 次/小时。
    # 超出配额时跳过订阅，上层 get_ohlcv 会自动回退 REST（REST 侧由 ccxt rateLimit 限流）。
    # 默认值可通过 config 键 `exchange_ws_sub_limit_per_hour` 覆盖。
    ws_sub_limit_per_hour = 480
    # 交易所 WS 单连接频道上限：OKX 每连接最多 240 个订阅频道。
    # 超过时不再订阅新频道（回退 REST），避免对端以 1006 关闭连接。
    # 默认值可通过 config 键 `exchange_ws_max_channels` 覆盖。
    ws_max_channels = 240
    # 交易所 WS 写入频率：OKX 约 3 条消息/秒 → 订阅请求至少间隔 0.34s
    ws_sub_min_interval = 0.34

    def __init__(
        self, config: Config, ccxt_object: ccxt.Exchange, orderbook_depth: int | None = None
    ) -> None:
        self.config = config
        self._ccxt_object = ccxt_object
        self._orderbook_depth = orderbook_depth
        self._background_tasks: set[asyncio.Task] = set()
        self._state_lock = RLock()
        self._loop_ready = Event()
        self._stopping = False

        # WS 订阅限流状态（OKX 480 次/小时 + 3 条/秒）
        self._ws_sub_lock = RLock()
        self._ws_sub_history: deque[float] = deque()
        self._ws_rate_limited_until = 0.0

        # 从配置覆盖 WS 配额（默认值不变，兼容旧配置；非法值回退默认）
        self.ws_sub_limit_per_hour = _config_int(
            config, "exchange_ws_sub_limit_per_hour", self.ws_sub_limit_per_hour, "WS 订阅配额"
        )
        self.ws_max_channels = _config_int(
            config, "exchange_ws_max_channels", self.ws_max_channels, "WS 单连接频道上限"
        )

        self._klines_watching: set[PairWithTimeframe] = set()
        self._klines_scheduled: set[PairWithTimeframe] = set()
        self._klines_last_refresh: dict[PairWithTimeframe, float] = {}
        self._klines_last_request: dict[PairWithTimeframe, float] = {}

        self._ob_watching: set[str] = set()
        self._ob_scheduled: set[str] = set()
        self._ob_last_request: dict[str, float] = {}
        # Timestamp (ms) of the last orderbook update received from the websocket, per pair.
        # Used by orderbook_is_fresh() to detect a stuck feed.
        self._ob_last_refresh: dict[str, float] = {}

        self._thread = Thread(name="ccxt_ws", target=self._start_forever)
        self._thread.start()

    def _start_forever(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._loop_ready.set()
        try:
            self._loop.run_forever()
        finally:
            if not self._loop.is_closed():
                # Cancel remaining tasks and close the loop in the owning thread.
                pending = asyncio.all_tasks(self._loop)
                for task in pending:
                    task.cancel()
                if pending:
                    self._loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
                self._loop.run_until_complete(self._loop.shutdown_asyncgens())
                self._loop.close()
            self._loop_ready.clear()

    def _wait_for_loop(self, timeout: float = 1.0) -> bool:
        """
        Wait for the event loop to be ready
        Returns True once the loop is ready.
        Will probably only return false during startup/shutdown.
        """
        if hasattr(self, "_loop"):
            return True
        return self._loop_ready.wait(timeout=timeout) and hasattr(self, "_loop")

    def cleanup(self) -> None:
        logger.debug("Cleanup called - stopping")
        with self._state_lock:
            self._stopping = True
            self._klines_watching.clear()
            self._ob_watching.clear()
            tasks = list(self._background_tasks)
        if self._wait_for_loop(timeout=0.2) and not self._loop.is_closed():
            for task in tasks:
                self._loop.call_soon_threadsafe(task.cancel)
            self.reset_connections(cleanup=True)
            self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)
        if self._thread.is_alive():
            logger.warning("Websocket loop thread did not stop within timeout.")
        logger.debug("Stopped")

    def reset_connections(self, cleanup: bool = False) -> None:
        """
        Reset all connections - avoids "connection-reset" errors that happen after ~9 days
        """
        if self._wait_for_loop() and not self._loop.is_closed():
            logger.info(f"{'Cleaning up' if cleanup else 'Resetting'} exchange WS connections.")
            try:
                fut = asyncio.run_coroutine_threadsafe(self._cleanup_async(), loop=self._loop)
                fut.result(timeout=10)
            except TimeoutError:
                logger.warning("Timed out while resetting websocket connections.")
            except Exception:
                logger.exception("Exception while resetting websocket connections")

    async def _cleanup_async(self) -> None:
        try:
            await self._ccxt_object.close()
            # Clear the cache.
            # Not doing this will cause problems on startup with dynamic pairlists
            self._ccxt_object.ohlcvs.clear()
            self._ccxt_object.orderbooks.clear()
            with self._state_lock:
                self._ob_last_refresh.clear()
        except Exception:
            logger.exception("Exception in _cleanup_async")

    def _pop_history(self, paircomb: PairWithTimeframe) -> None:
        """
        Remove history for a pair/timeframe combination from ccxt cache
        """
        with self._state_lock:
            self._ccxt_object.ohlcvs.get(paircomb[0], {}).pop(paircomb[1], None)
            self._klines_last_refresh.pop(paircomb, None)

    def _pop_orderbook(self, pair: str) -> None:
        """
        Remove a pair's orderbook from the ccxt cache.
        Avoids unbounded growth for pairs we no longer watch - and ensures a stale book
        can't be served should the pair be re-scheduled later.
        """
        with self._state_lock:
            self._ccxt_object.orderbooks.pop(pair, None)
            self._ob_last_refresh.pop(pair, None)

    @retrier(retries=3)
    def ohlcvs(self, pair: str, timeframe: str) -> list[list]:
        """
        Returns a copy of the klines for a pair/timeframe combination
        Note: this will only contain the data received from the websocket
            so the data will build up over time.
        """
        try:
            return deepcopy(self._ccxt_object.ohlcvs.get(pair, {}).get(timeframe, []))
        except RuntimeError as e:
            # Capture runtime errors and retry
            # TemporaryError does not cause backoff - so we're essentially retrying immediately
            raise TemporaryError(f"Error deepcopying: {e}") from e

    def get_ohlcv_with_refresh(
        self, pair: str, timeframe: str, candle_type: CandleType
    ) -> tuple[list[list], float]:
        """
        Get deepcopied klines and update the last refresh time
        """
        ohlcvs = self.ohlcvs(pair, timeframe)
        with self._state_lock:
            last_refresh = self._klines_last_refresh.get((pair, timeframe, candle_type), 0)
        return ohlcvs, last_refresh

    def cleanup_expired(self) -> None:
        """
        Remove pairs from watchlist if they've not been requested within
        the last timeframe (+ offset)
        """
        changed = False
        with self._state_lock:
            for p in list(self._klines_watching):
                _, timeframe, _ = p
                timeframe_s = timeframe_to_seconds(timeframe)
                last_refresh = self._klines_last_request.get(p, 0)
                if last_refresh > 0 and (dt_ts() - last_refresh) > ((timeframe_s + 20) * 1000):
                    logger.info(f"Removing {p} from OHLCV watchlist.")
                    self._klines_watching.discard(p)
                    # Pop history to avoid getting stale data
                    self._pop_history(p)
                    changed = True
        if changed:
            logger.info(f"Removal done: new watch list ({len(self._klines_watching)})")

        with self._state_lock:
            for pair in list(self._ob_watching):
                last_refresh = self._ob_last_request.get(pair, 0)
                if last_refresh > 0 and (dt_ts() - last_refresh) > ((self.ob_timeout + 20) * 1000):
                    logger.info(f"Removing {pair} from orderbook watchlist")
                    self._ob_watching.discard(pair)

    def _reserve_ws_subscription(self) -> bool:
        """
        在 WS 订阅配额内预留一次订阅/取消订阅请求。

        OKX 官方限制：每个连接 subscribe/unsubscribe/login 合计 480 次/小时；
        超出时返回 False，调用方跳过本次订阅（上层 get_ohlcv 自动回退 REST），
        避免触发 60014 "Requests too frequent" 并产生重连风暴。
        """
        now = dt_ts() / 1000
        with self._ws_sub_lock:
            if now < self._ws_rate_limited_until:
                return False
            cutoff = now - 3600
            while self._ws_sub_history and self._ws_sub_history[0] < cutoff:
                self._ws_sub_history.popleft()
            if len(self._ws_sub_history) >= self.ws_sub_limit_per_hour:
                return False
            self._ws_sub_history.append(now)
            return True

    async def _schedule_while_true(self) -> None:
        # For the ones we should be watching
        with self._state_lock:
            pairs_to_check = list(self._klines_watching)

        for p in pairs_to_check:
            # Check if they're already scheduled
            with self._state_lock:
                if p in self._klines_scheduled:
                    continue
                # 单连接频道上限保护：已订阅频道数达到上限时不再订阅新频道
                active_channels = len(self._klines_scheduled) + len(self._ob_scheduled)
                if active_channels >= self.ws_max_channels:
                    logger.debug(
                        "WS 频道数已达单连接上限 %s，跳过 %s %s %s",
                        self.ws_max_channels,
                        p[0],
                        p[1],
                        p[2],
                    )
                    continue
                if not self._reserve_ws_subscription():
                    # 订阅配额已用尽：不标记 scheduled，后续周期再尝试；本次由 REST 兜底
                    logger.debug(
                        "WS 订阅配额已用尽，跳过 %s %s %s", p[0], p[1], p[2]
                    )
                    continue
                self._klines_scheduled.add(p)
            pair, timeframe, candle_type = p
            task = asyncio.create_task(
                self._continuously_async_watch_ohlcv(pair, timeframe, candle_type)
            )
            with self._state_lock:
                self._background_tasks.add(task)
            task.add_done_callback(
                partial(
                    self._ohlcv_stopped,
                    pair=pair,
                    timeframe=timeframe,
                    candle_type=candle_type,
                )
            )
            await asyncio.sleep(self.ws_sub_min_interval)

        with self._state_lock:
            ob_pairs_to_check = list(self._ob_watching)

        for ob_pair in ob_pairs_to_check:
            # Check if they're already scheduled
            with self._state_lock:
                if ob_pair in self._ob_scheduled:
                    continue
                active_channels = len(self._klines_scheduled) + len(self._ob_scheduled)
                if active_channels >= self.ws_max_channels:
                    continue
                if not self._reserve_ws_subscription():
                    continue
                self._ob_scheduled.add(ob_pair)
            ob_task = asyncio.create_task(self._continuously_async_watch_orderbook(ob_pair))
            with self._state_lock:
                self._background_tasks.add(ob_task)
            ob_task.add_done_callback(partial(self._orderbook_stopped, pair=ob_pair))
            await asyncio.sleep(self.ws_sub_min_interval)

    def _orderbook_stopped(self, task: asyncio.Task, pair: str) -> None:
        with self._state_lock:
            self._background_tasks.discard(task)
        result = "done"
        try:
            if task.cancelled():
                result = "cancelled"
            else:
                # Retrieve the result - surfaces exceptions the watch loop didn't handle,
                # which would otherwise sit unretrieved on the task.
                task.result()
        except Exception:
            result = "error"
            logger.exception(f"Unhandled exception in orderbook watch task callback for {pair}")
        finally:
            logger.info(f"{pair} - Orderbook task finished - {result}")
            if not self._stopping and hasattr(self, "_loop") and not self._loop.is_closed():
                asyncio.run_coroutine_threadsafe(self._unwatch_orderbook(pair), loop=self._loop)

            with self._state_lock:
                self._ob_scheduled.discard(pair)
            self._pop_orderbook(pair)

    def exchange_has(self, endpoint: str) -> bool:
        """
        Checks if exchange implements a specific API endpoint.
        Wrapper around ccxt 'has' attribute
        :param endpoint: Name of endpoint (e.g. 'fetchOHLCV', 'fetchTickers')
        :return: bool
        """
        return endpoint in self._ccxt_object.has and self._ccxt_object.has[endpoint]

    async def _unwatch_ohlcv(self, pair: str, timeframe: str, candle_type: CandleType) -> None:
        if self._stopping:
            # Unsubscribing from a connection that's going away is pointless.
            logger.debug("Shutting down - skipping OHLCV unwatch for %s, %s", pair, timeframe)
            return
        try:
            async with asyncio.timeout(3):
                if self.exchange_has("unWatchOHLCVForSymbols"):
                    await self._ccxt_object.un_watch_ohlcv_for_symbols([[pair, timeframe]])
                elif self.exchange_has("unWatchOHLCV"):
                    await self._ccxt_object.un_watch_ohlcv(pair, timeframe)
                else:
                    logger.debug("un_watch_ohlcv not supported for %s, %s", pair, timeframe)

        except TimeoutError:
            logger.warning(f"Timed out while unwatching OHLCV for {pair}, {timeframe}.")
        except ccxt.NotSupported as e:
            logger.debug("un_watch_ohlcv_for_symbols not supported: %s", e)
        except ccxt.NetworkError as e:
            # Network errors are common on shutdown so we can ignore them.
            # It's a network error - which most likely means that the connection is already closed.
            logger.debug("Network error during OHLCV unwatch for %s, %s: %s", pair, timeframe, e)
        except Exception:
            logger.exception(f"Exception in _unwatch_ohlcv for {pair}, {timeframe},")

    async def _unwatch_orderbook(self, pair: str) -> None:
        if self._stopping:
            # Unsubscribing from a connection that's going away is pointless.
            logger.debug("Shutting down - skipping orderbook unwatch for %s", pair)
            return
        # Unsubscribe from the same depth we subscribed to
        params = {"limit": self._orderbook_depth} if self._orderbook_depth else {}
        try:
            async with asyncio.timeout(3):
                if self.exchange_has("unWatchOrderBookForSymbols"):
                    await self._ccxt_object.un_watch_order_book_for_symbols([pair], params)
                elif self.exchange_has("unWatchOrderBook"):
                    await self._ccxt_object.un_watch_order_book(pair, params)
                else:
                    logger.debug("un_watch_order_book not supported for %s", pair)

        except TimeoutError:
            logger.warning(f"Timed out while unwatching orderbook for {pair}.")
        except ccxt.NotSupported as e:
            logger.debug("un_watch_order_book not supported: %s", e)
        except ccxt.NetworkError as e:
            # Network errors are common on shutdown so we can ignore them.
            # It's a network error - which most likely means that the connection is already closed.
            logger.debug("Network error during orderbook unwatch for %s: %s", pair, e)
        except Exception:
            logger.exception(f"Exception in _unwatch_orderbook for {pair}")

    def _ohlcv_stopped(
        self, task: asyncio.Task, pair: str, timeframe: str, candle_type: CandleType
    ) -> None:
        with self._state_lock:
            self._background_tasks.discard(task)
        result = "done"
        try:
            if task.cancelled():
                result = "cancelled"
            else:
                if (result1 := task.result()) is not None:
                    result = str(result1)
        except Exception:
            result = "error"
            logger.exception(
                f"Unhandled exception in ohlcv watch task callback for {pair}, {timeframe}"
            )
        finally:
            logger.info(f"{pair}, {timeframe}, {candle_type} - Task finished - {result}")
            if not self._stopping and hasattr(self, "_loop") and not self._loop.is_closed():
                asyncio.run_coroutine_threadsafe(
                    self._unwatch_ohlcv(pair, timeframe, candle_type), loop=self._loop
                )

            with self._state_lock:
                self._klines_scheduled.discard((pair, timeframe, candle_type))
            self._pop_history((pair, timeframe, candle_type))

    async def _continuously_async_watch_orderbook(self, pair: str) -> None:
        try:
            while pair in self._ob_watching:
                await self._ccxt_object.watch_order_book(pair, self._orderbook_depth)
                # watch_order_book returns on every applied frame - record the time so
                # get_orderbook callers can tell whether the feed is still alive.
                with self._state_lock:
                    self._ob_last_refresh[pair] = dt_ts()
        except ccxt.ExchangeClosedByUser:
            logger.debug("Exchange connection closed by user")
        except ccxt.BaseError:
            logger.exception(f"Exception in continuously_async_watch_orderbook for {pair}")
        finally:
            with self._state_lock:
                self._ob_watching.discard(pair)
                self._ob_last_refresh.pop(pair, None)

    async def _continuously_async_watch_ohlcv(
        self, pair: str, timeframe: str, candle_type: CandleType
    ) -> None:
        try:
            while True:
                with self._state_lock:
                    if (pair, timeframe, candle_type) not in self._klines_watching:
                        break
                start = dt_ts()
                data = await self._ccxt_object.watch_ohlcv(pair, timeframe)
                with self._state_lock:
                    self._klines_last_refresh[(pair, timeframe, candle_type)] = dt_ts()
                logger.debug(
                    f"watch done {pair}, {timeframe}, data {len(data)} "
                    f"in {(dt_ts() - start) / 1000:.3f}s"
                )
        except ccxt.ExchangeClosedByUser:
            logger.debug("Exchange connection closed by user")
        except ccxt.RateLimitExceeded:
            # 订阅请求触发交易所限流（OKX 60014）：进入冷却期，暂停后续订阅，数据回退 REST
            logger.warning(
                f"WS 订阅触发交易所限流（{pair}, {timeframe}），暂停订阅 60 秒并使用 REST 数据"
            )
            with self._ws_sub_lock:
                self._ws_rate_limited_until = dt_ts() / 1000 + 60
        except ccxt.BaseError:
            logger.exception(f"Exception in continuously_async_watch_ohlcv for {pair}, {timeframe}")
        finally:
            with self._state_lock:
                self._klines_watching.discard((pair, timeframe, candle_type))

    def schedule_ohlcv(self, pair: str, timeframe: str, candle_type: CandleType) -> None:
        """
        Schedule a pair/timeframe combination to be watched
        """
        if not self._wait_for_loop():
            logger.warning(f"Websocket loop not ready. Could not schedule {pair}, {timeframe}.")
            return
        with self._state_lock:
            self._klines_watching.add((pair, timeframe, candle_type))
            self._klines_last_request[(pair, timeframe, candle_type)] = dt_ts()
        # asyncio.run_coroutine_threadsafe(self.schedule_schedule(), loop=self._loop)
        asyncio.run_coroutine_threadsafe(self._schedule_while_true(), loop=self._loop)
        self.cleanup_expired()

    async def get_ohlcv(
        self,
        pair: str,
        timeframe: str,
        candle_type: CandleType,
        candle_ts: int,
    ) -> OHLCVResponse:
        """
        Returns cached klines from ccxt's "watch" cache.
        :param candle_ts: timestamp of the end-time of the candle we expect.
        """
        candles, refresh_date = self.get_ohlcv_with_refresh(pair, timeframe, candle_type)
        received_ts = candles[-1][0] if candles else 0
        drop_hint = received_ts >= candle_ts
        if refresh_date and received_ts > refresh_date:
            logger.warning(
                f"{pair}, {timeframe} - Candle date > last refresh "
                f"({format_ms_time(received_ts)} > {format_ms_time_det(refresh_date)}). "
                "This usually suggests a problem with time synchronization."
            )
        logger.debug(
            f"watch result for {pair}, {timeframe} with length {len(candles)}, "
            f"r_ts={format_ms_time(received_ts)}, "
            f"lref={format_ms_time_det(refresh_date)}, "
            f"candle_ts={format_ms_time(candle_ts)}, {drop_hint=}"
        )
        return pair, timeframe, candle_type, candles, drop_hint

    def _empty_orderbook(self, pair: str) -> OrderBook:
        return {
            "symbol": pair,
            "bids": [],
            "asks": [],
            "timestamp": None,
            "datetime": None,
            "nonce": None,
        }

    async def _orderbook_snapshot(self, pair: str, limit: int) -> OrderBook:
        """
        Copy the cached orderbook, truncated to `limit` entries per side.
        Must run on the websocket event loop, and must not await while copying  to make
        the snapshot atomic with regards to ccxt's updates.
        Slicing before copying keeps this cheap, and the copy detaches
        the [price, size] lists, which ccxt mutates in place on subsequent updates.
        """
        ob = self._ccxt_object.orderbooks.get(pair)
        if ob is None:
            return self._empty_orderbook(pair)
        return {
            "symbol": ob.get("symbol", pair),
            "bids": deepcopy(ob.get("bids", [])[:limit]),
            "asks": deepcopy(ob.get("asks", [])[:limit]),
            "timestamp": ob.get("timestamp"),
            "datetime": ob.get("datetime"),
            "nonce": ob.get("nonce"),
        }

    def get_orderbook(self, pair: str, limit: int) -> OrderBook:
        """
        Returns a copy of the cached orderbook from ccxt's "watch" cache,
        truncated to `limit` entries per side.

        The copy is taken on the websocket thread's event loop to ensure atomicity
        assuming ccxt applies orderbook updates synchronously within a single websocket callback.

        Returns an empty orderbook if there is no cached book yet, or if the loop did not
        respond within `ob_snapshot_timeout`, which makes the caller fall back to REST.
        :param pair: Pair to get the orderbook for
        :param limit: Maximum number of entries per side to return.
        """
        if not self._wait_for_loop(timeout=0.2) or self._loop.is_closed():
            logger.debug("Websocket loop not available - no orderbook snapshot for %s", pair)
            return self._empty_orderbook(pair)
        fut = asyncio.run_coroutine_threadsafe(
            self._orderbook_snapshot(pair, limit), loop=self._loop
        )
        try:
            return fut.result(timeout=self.ob_snapshot_timeout)
        except TimeoutError:
            fut.cancel()
            logger.warning(
                f"Timed out after {self.ob_snapshot_timeout}s while copying the websocket "
                f"orderbook for {pair} - falling back to REST."
            )
        except Exception:
            logger.exception(f"Exception while copying the websocket orderbook for {pair}")
        return self._empty_orderbook(pair)

    def orderbook_is_fresh(self, pair: str, max_age: float) -> bool:
        """
        Whether the cached orderbook was refreshed within the last `max_age` seconds.
        Returns False if no update arrived within that window (feed likely stuck),
        prompting callers to fall back to REST.
        """
        with self._state_lock:
            last_refresh = self._ob_last_refresh.get(pair, 0)
        return last_refresh > 0 and (dt_ts() - last_refresh) < (max_age * 1000)

    def schedule_orderbook(self, pair: str) -> None:
        """
        Schedule a pair to be watched for orderbook updates
        """
        if not self._wait_for_loop():
            logger.warning(f"Websocket loop not ready. Could not schedule orderbook for {pair}.")
            return
        with self._state_lock:
            self._ob_watching.add(pair)
            self._ob_last_request[pair] = dt_ts()
        asyncio.run_coroutine_threadsafe(self._schedule_while_true(), loop=self._loop)
        self.cleanup_expired()
