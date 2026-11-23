/**
 * freqtrade REST API 响应类型
 * 与服务端 freqtrade/rpc/api_server/api_schemas.py 对齐，避免视图层散落 any。
 */

export interface Balance {
    currency: string;
    free: number;
    balance: number;
    used: number;
    bot_owned?: number;
    est_stake: number;
    est_stake_bot?: number;
    stake: string;
    side: string;
    is_position: boolean;
    position: number;
    is_bot_managed: boolean;
}

export interface BalanceResponse {
    currencies: Balance[];
    total: number;
    total_bot: number;
    symbol: string;
    value: number;
    value_bot: number;
    stake: string;
    note: string;
    starting_capital: number;
    starting_capital_ratio: number;
    starting_capital_pct: number;
    starting_capital_fiat: number;
    starting_capital_fiat_ratio: number;
    starting_capital_fiat_pct: number;
}

export interface ProfitResponse {
    profit_closed_coin: number;
    profit_closed_percent_mean: number;
    profit_closed_ratio_mean: number;
    profit_closed_percent_sum: number;
    profit_closed_ratio_sum: number;
    profit_closed_percent: number;
    profit_closed_ratio: number;
    profit_closed_fiat: number;
    profit_all_coin: number;
    profit_all_percent_mean: number;
    profit_all_ratio_mean: number;
    profit_all_percent_sum: number;
    profit_all_ratio_sum: number;
    profit_all_percent: number;
    profit_all_ratio: number;
    profit_all_fiat: number;
    trade_count: number;
    closed_trade_count: number;
    first_trade_date: string;
    first_trade_humanized: string;
    first_trade_timestamp: number;
    latest_trade_date: string;
    latest_trade_humanized: string;
    latest_trade_timestamp: number;
    avg_duration: string;
    best_pair: string;
    best_rate: number;
    best_pair_profit_ratio: number;
    best_pair_profit_abs: number;
    winning_trades: number;
    losing_trades: number;
    profit_factor: number;
    winrate: number;
    expectancy: number;
    expectancy_ratio: number;
    sharpe: number;
    sortino: number;
    sqn: number;
    calmar: number;
    cagr: number;
    max_drawdown: number;
    max_drawdown_abs: number;
    current_drawdown: number;
    current_drawdown_abs: number;
    trading_volume?: number;
    bot_start_timestamp: number;
    bot_start_date: string;
}

export interface DailyRecord {
    date: string;
    abs_profit: number;
    rel_profit: number;
    starting_balance: number;
    fiat_value: number;
    trade_count: number;
}

export interface DailyResponse {
    data: DailyRecord[];
    fiat_display_currency: string;
    stake_currency: string;
}

export interface ShowConfigResponse {
    version: string;
    strategy_version?: string;
    api_version: number;
    dry_run: boolean;
    trading_mode: string;
    margin_mode: string;
    short_allowed: boolean;
    stake_currency: string;
    stake_amount: string;
    max_open_trades: number;
    stoploss?: number;
    stoploss_on_exchange: boolean;
    trailing_stop?: boolean;
    trailing_stop_positive?: number;
    trailing_stop_positive_offset?: number;
    trailing_only_offset_is_reached?: boolean;
    timeframe?: string;
    exchange: string;
    demo_trading: boolean;
    strategy?: string;
    force_entry_enable: boolean;
    bot_name: string;
    state: string;
    runmode: string;
    position_adjustment_enable: boolean;
    max_entry_position_adjustment: number;
}

export interface SysInfoResponse {
    cpu_pct: number[];
    cpu_load_avg: Record<string, number>;
    cpu_count: number;
    cpu_avg: number;
    ram_pct: number;
}

/** freqtrade 日志行：[时间字符串, 毫秒时间戳, 来源, 级别, 消息] */
export type LogEntry = [string, number, string, string, string];

export interface LogsResponse {
    log_count: number;
    logs: LogEntry[];
}

export interface WhitelistResponse {
    whitelist: string[];
    length: number;
    method: string[];
}

export interface Order {
    pair: string;
    order_id: string;
    status: string;
    remaining?: number;
    amount: number;
    safe_price?: number;
    price?: number;
    side?: string;
    order_type?: string;
    order_date?: string;
    is_open?: boolean;
    ft_order_side?: string;
    ft_is_entry?: boolean;
    filled?: boolean;
}

/** 回测汇总（/backtest 结果 strategy[策略名]） */
export interface BacktestSummary {
    total_trades?: number;
    profit_total?: number;
    profit_total_abs?: number;
    wins?: number;
    draws?: number;
    losses?: number;
    max_drawdown?: number;
    winrate?: number;
    trades?: unknown[];
}

export interface BacktestResult {
    strategy?: Record<string, BacktestSummary>;
    trades?: unknown[];
    backtesting_start?: string;
    backtesting_end?: string;
    metadata?: { filename?: string; strategy?: string };
}

/** 历史回测列表项（/backtest/history） */
export interface BacktestHistoryItem {
    filename: string;
    strategy?: string;
    timeframe?: string;
    timerange?: string;
    backtest_start_time?: string;
}

/** 高级分析任务状态（/recursive_analysis、/lookahead_analysis） */
export interface AnalysisJobResult {
    status?: string;
    status_msg?: string;
    result?: unknown;
}

/** 交易自定义数据项（/trades/{id}/custom-data） */
export interface CustomDataEntry {
    key: string;
    type?: string;
    value?: unknown;
    created_at?: string;
    updated_at?: string | null;
}

/** 市场变动评估（/backtest/history/{f}/market_change） */
export interface MarketChange {
    market_change?: number;
    profit_total?: number;
    profit_total_abs?: number;
    total_trades?: number;
}

/** 币对表现（/performance） */
export interface PerformanceEntry {
    pair: string;
    profit_ratio: number;
    profit_abs: number;
    profit_pct: number;
    count: number;
    trade_count?: number;
}

/** 入场标签（/entries） */
export interface EntryTagEntry {
    enter_tag: string;
    profit_ratio: number;
    profit_abs: number;
    count: number;
    trade_count?: number;
}

/** 出场原因（/exits） */
export interface ExitReasonEntry {
    exit_reason: string;
    profit_ratio: number;
    profit_abs: number;
    count: number;
    trade_count?: number;
}

/** 组合标签（/mix_tags） */
export interface MixTagEntry {
    mix_tag: string;
    profit_ratio: number;
    profit_abs: number;
    count: number;
    trade_count?: number;
}

/** 保护锁定（/locks） */
export interface Lock {
    id: number;
    pair: string;
    lock_end_time: string;
    reason: string;
    active: boolean;
}
