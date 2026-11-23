import logging

from freqtrade.constants import Config
from freqtrade.enums import RunMode
from freqtrade.exceptions import OperationalException
from freqtrade.exchange import available_exchanges, is_exchange_known_ccxt, validate_exchange
from freqtrade.exchange.common import MAP_EXCHANGE_CHILDCLASS, SUPPORTED_EXCHANGES


logger = logging.getLogger(__name__)


def check_exchange(config: Config, check_for_bad: bool = True) -> bool:
    """
    Check if the exchange name in the config file is supported by Freqtrade
    :param check_for_bad: if True, check the exchange against the list of known 'bad'
                          exchanges
    :return: False if exchange is 'bad', i.e. is known to work with the bot with
             critical issues or does not work at all, crashes, etc. True otherwise.
             raises an exception if the exchange if not supported by ccxt
             and thus is not known for the Freqtrade at all.
    """

    if config["runmode"] in [
        RunMode.PLOT,
        RunMode.UTIL_NO_EXCHANGE,
        RunMode.OTHER,
    ] and not config.get("exchange", {}).get("name"):
        # Skip checking exchange in plot mode, since it requires no exchange
        return True
    logger.info("正在检查交易所 ...")

    exchange = config.get("exchange", {}).get("name", "").lower()
    if not exchange:
        raise OperationalException(
            f"This command requires a configured exchange. You should either use "
            f"`--exchange <exchange_name>` or specify a configuration file via `--config`.\n"
            f"The following exchanges are available for Freqtrade: "
            f"{', '.join(available_exchanges())}"
        )

    if not is_exchange_known_ccxt(exchange):
        raise OperationalException(
            f'Exchange "{exchange}" is not known to the ccxt library '
            f"and therefore not available for the bot.\n"
            f"The following exchanges are available for Freqtrade: "
            f"{', '.join(available_exchanges())}"
        )

    valid, reason, _, _ = validate_exchange(exchange)
    if not valid:
        if check_for_bad:
            raise OperationalException(
                f'Exchange "{exchange}" will not work with Freqtrade. Reason: {reason}.'
            )
        else:
            logger.warning(f'交易所 "{exchange}" 无法与 Freqtrade 配合使用，原因：{reason}。')

    if MAP_EXCHANGE_CHILDCLASS.get(exchange, exchange) in SUPPORTED_EXCHANGES:
        logger.info(
            f'交易所 "{exchange}" 获得 Freqtrade 开发团队官方支持。'
        )
    else:
        logger.warning(
            f'交易所 "{exchange}" 已被 ccxt 识别，可用于机器人，'
            f"但未获得 Freqtrade 开发团队官方支持。"
            f"它可能运行正常（欢迎反馈），也可能存在严重问题。"
            f"请自行评估后使用。"
        )

    return True
