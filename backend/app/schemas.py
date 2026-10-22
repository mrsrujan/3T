from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

Category = str  # "gainers" | "losers" | "most_active" | "trending"
Market = str  # "IN"


class RankingItem(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    close: float | None = None
    prev_close: float | None = None
    pct_change: float | None = None
    volume: int | None = None
    turnover: float | None = None
    rel_volume: float | None = None
    # Last ~30 trading-day closes, ascending - drives the row sparkline.
    spark: list[float] | None = None


class RankingsResponse(BaseModel):
    market: Market
    date: date
    category: Category
    top_n: int
    items: list[RankingItem]


class TradingDaysResponse(BaseModel):
    market: Market
    dates: list[date]


class PersistenceItem(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    days_present: int
    num_dates_requested: int
    avg_rank: float
    current_price: float | None = None
    change_value: float | None = None
    change_pct: float | None = None


class PersistenceResponse(BaseModel):
    market: Market
    category: Category
    top_n: int
    mode: str
    dates_used: list[date]
    dropped_dates: list[date]
    items: list[PersistenceItem]


class NewsArticle(BaseModel):
    title: str
    link: str
    source: str | None = None
    published_at: str | None = None


class NewsResponse(BaseModel):
    market: Market
    symbol: str
    articles: list[NewsArticle]


class MarketNewsArticle(BaseModel):
    title: str
    link: str
    source: str | None = None
    published_at: str | None = None
    symbol: str


class MarketNewsResponse(BaseModel):
    market: Market
    articles: list[MarketNewsArticle]


class SearchResultItem(BaseModel):
    symbol: str
    name: str | None = None
    market: Market
    sector: str | None = None
    industry: str | None = None


class SearchResponse(BaseModel):
    query: str
    items: list[SearchResultItem]


class StockLatestMetrics(BaseModel):
    trade_date: date
    close: float | None = None
    prev_close: float | None = None
    pct_change: float | None = None
    volume: int | None = None
    rel_volume: float | None = None


class FundamentalsData(BaseModel):
    market_cap: float | None = None
    pe_ratio: float | None = None
    forward_pe: float | None = None
    dividend_yield: float | None = None
    roe: float | None = None
    book_value: float | None = None
    debt_to_equity: float | None = None
    fetched_at: datetime
    fetch_status: str


class StockDetailResponse(BaseModel):
    market: Market
    symbol: str
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    last_seen: date | None = None
    latest: StockLatestMetrics | None = None
    week52_high: float | None = None
    week52_low: float | None = None
    fundamentals: FundamentalsData | None = None


class HistoryPoint(BaseModel):
    trade_date: date
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None


class StockHistoryResponse(BaseModel):
    market: Market
    symbol: str
    points: list[HistoryPoint]


class PeerItem(BaseModel):
    symbol: str
    name: str | None = None
    close: float | None = None
    pct_change: float | None = None
    market_cap: float | None = None
    pe_ratio: float | None = None


class StockPeersResponse(BaseModel):
    market: Market
    symbol: str
    sector: str | None = None
    sector_median_pe: float | None = None
    peers: list[PeerItem]


class HeatmapSymbol(BaseModel):
    symbol: str
    name: str | None = None
    pct_change: float | None = None
    volume: int | None = None
    market_cap: float | None = None


class HeatmapSector(BaseModel):
    sector: str
    symbols: list[HeatmapSymbol]


class HeatmapResponse(BaseModel):
    market: Market
    date: date
    sectors: list[HeatmapSector]




class WatchlistItem(BaseModel):
    id: int
    market: Market
    symbol: str
    name: str | None = None
    added_at: datetime
    close: float | None = None
    pct_change: float | None = None


class WatchlistResponse(BaseModel):
    items: list[WatchlistItem]


class WatchlistAddRequest(BaseModel):
    market: Market
    symbol: str


class HoldingItem(BaseModel):
    id: int
    market: Market
    symbol: str
    name: str | None = None
    sector: str | None = None
    quantity: float
    buy_price: float
    buy_date: date
    sell_price: float | None = None
    sell_date: date | None = None
    is_closed: bool = False
    notes: str | None = None
    current_price: float | None = None
    market_value: float | None = None
    pnl: float | None = None
    pnl_pct: float | None = None


class HoldingsResponse(BaseModel):
    items: list[HoldingItem]


class MarketSummary(BaseModel):
    invested: float
    market_value: float
    pnl: float
    pnl_pct: float | None = None
    realized_pnl: float = 0.0


class AllocationSlice(BaseModel):
    label: str
    value_inr: float
    pct: float


class HoldingsSummaryResponse(BaseModel):
    fx_rate_usd_inr: float | None = None
    total_invested_inr: float | None = None
    total_market_value_inr: float | None = None
    total_pnl_inr: float | None = None
    total_pnl_pct: float | None = None
    total_market_value_usd: float | None = None
    total_realized_pnl_inr: float | None = None
    by_market: dict[str, MarketSummary]
    allocation: list[AllocationSlice] = []


class SellHoldingRequest(BaseModel):
    sell_price: float
    sell_date: date


class HoldingCreateRequest(BaseModel):
    market: Market
    symbol: str
    quantity: float
    buy_price: float
    buy_date: date
    notes: str | None = None


class HoldingUpdateRequest(BaseModel):
    quantity: float | None = None
    buy_price: float | None = None
    buy_date: date | None = None
    notes: str | None = None


class RefreshRequest(BaseModel):
    market: Market = "BOTH"
    refresh_date: date | None = None


class RefreshStatusResponse(BaseModel):
    job_id: int
    market: str | None
    job_type: str
    status: str
    started_at: str
    finished_at: str | None
    symbols_processed: int
    symbols_failed: int
    error_message: str | None


class GlobalMarketItem(BaseModel):
    symbol: str
    name: str
    code: str
    price: float | None = None
    change_value: float | None = None
    change_pct: float | None = None


class GlobalMarketsResponse(BaseModel):
    indexes: list[GlobalMarketItem]
    commodities: list[GlobalMarketItem]
    fetched_at: str


class AlertRuleCreateRequest(BaseModel):
    market: Market
    symbol: str
    rule_type: str
    threshold: float


class AlertRuleUpdateRequest(BaseModel):
    is_active: bool | None = None


class AlertRuleItem(BaseModel):
    id: int
    market: Market
    symbol: str
    name: str | None = None
    rule_type: str
    threshold: float
    is_active: bool
    created_at: datetime


class AlertRulesResponse(BaseModel):
    items: list[AlertRuleItem]


class AlertTriggerItem(BaseModel):
    id: int
    market: Market
    symbol: str
    name: str | None = None
    trade_date: date
    triggered_at: datetime
    trigger_value: float
    message: str
    is_read: bool


class AlertTriggersResponse(BaseModel):
    items: list[AlertTriggerItem]


class MarkTriggersReadRequest(BaseModel):
    trigger_ids: list[int] | None = None


class LiveQuoteResponse(BaseModel):
    market: Market
    symbol: str
    price: float | None = None
    change_value: float | None = None
    change_pct: float | None = None
    is_market_open: bool
    as_of: str


class IntradayPoint(BaseModel):
    time: int  # epoch seconds UTC
    price: float
    volume: int | None = None


class IntradayResponse(BaseModel):
    market: Market
    symbol: str
    points: list[IntradayPoint]


class IndexHistoryPoint(BaseModel):
    trade_date: date
    close: float


class IndexHistoryResponse(BaseModel):
    market: Market
    symbol: str
    name: str
    points: list[IndexHistoryPoint]


class ForecastFactor(BaseModel):
    label: str
    direction: str  # "bullish" | "bearish" | "neutral"
    source: str  # "model" | "sentiment"


class ForecastPriceRangePoint(BaseModel):
    horizon_days: int
    low: float
    mid: float
    high: float


class ForecastModelInfo(BaseModel):
    market: Market
    trained_at: datetime
    training_row_count: int
    holdout_accuracy: float | None = None
    holdout_auc: float | None = None
    holdout_baseline_accuracy: float | None = None


class ForecastResponse(BaseModel):
    market: Market
    symbol: str
    status: str  # "ok" | "cold_start" | "insufficient_history"
    as_of: date | None = None
    direction: str | None = None
    confidence_pct: float | None = None
    probability_up: float | None = None
    price_range: list[ForecastPriceRangePoint] = []
    factors: list[ForecastFactor] = []
    model_info: ForecastModelInfo | None = None
    message: str | None = None


class ForecastModelRunItem(BaseModel):
    market: Market
    trained_at: datetime
    training_row_count: int
    holdout_accuracy: float | None = None
    holdout_auc: float | None = None
    holdout_baseline_accuracy: float | None = None
    status: str
    error_message: str | None = None


class ForecastModelStatusResponse(BaseModel):
    models: dict[str, ForecastModelInfo | None]
    recent_runs: list[ForecastModelRunItem]


class ScreenerItem(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    close: float | None = None
    pct_change: float | None = None
    volume: int | None = None
    rel_volume: float | None = None
    market_cap: float | None = None
    setups: list[str] = []


class ScreenerResponse(BaseModel):
    market: Market
    date: date
    total: int
    items: list[ScreenerItem]


class ScannerItem(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    close: float | None = None
    pct_change: float | None = None
    volume: int | None = None
    rel_volume: float | None = None
    week52_high: float | None = None
    week52_low: float | None = None
    distance_from_52w_high_pct: float | None = None
    sma_20: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    rsi_14: float | None = None
    macd_hist: float | None = None
    rs_percentile: float | None = None
    return_1w: float | None = None
    return_1m: float | None = None
    return_3m: float | None = None
    setups: list[str] = []


class ScannerResponse(BaseModel):
    market: Market
    date: date
    total: int
    items: list[ScannerItem]


class SectorItem(BaseModel):
    sector: str
    symbol_count: int
    return_1w: float | None = None
    return_1m: float | None = None
    return_3m: float | None = None


class SectorRotationResponse(BaseModel):
    market: Market
    date: date
    sectors: list[SectorItem]


class StockTechnicalsResponse(BaseModel):
    market: Market
    symbol: str
    setups: list[str] = []
    rs_percentile: float | None = None
    rsi_14: float | None = None
    sma_20: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    macd_hist: float | None = None
    week52_high: float | None = None
    week52_low: float | None = None
    distance_from_52w_high_pct: float | None = None
    return_1w: float | None = None
    return_1m: float | None = None
    return_3m: float | None = None


class EarningsItem(BaseModel):
    symbol: str
    name: str | None = None
    earnings_date: str  # ISO date string, e.g. "2026-07-29"
    eps_estimate: float | None = None


class EarningsResponse(BaseModel):
    items: list[EarningsItem]


class NewsSentimentCategory(BaseModel):
    label: str
    icon: str
    article_count: int
    sentiment: str  # "positive" | "negative" | "neutral"
    headlines: list[str]


class NewsSentimentResponse(BaseModel):
    symbol: str
    market: str
    article_count: int
    overall_sentiment: str
    categories: dict[str, NewsSentimentCategory]


class QuarterlyPoint(BaseModel):
    quarter: str
    period_end_date: str | None = None
    revenue: float | None = None
    revenue_qoq: float | None = None
    revenue_yoy: float | None = None
    gross_profit: float | None = None
    gross_margin: float | None = None
    operating_income: float | None = None
    op_margin: float | None = None
    ebitda: float | None = None
    net_profit: float | None = None
    net_margin: float | None = None
    eps: float | None = None
    free_cash_flow: float | None = None
    total_debt: float | None = None
    interest_coverage: float | None = None
    price_reaction: float | None = None


class ShareholdingData(BaseModel):
    promoters: float
    institutions: float
    public_other: float


class QuarterlyResponse(BaseModel):
    market: Market
    symbol: str
    quarterly: list[QuarterlyPoint]
    shareholding: ShareholdingData | None = None


class AnnualPLPoint(BaseModel):
    year: str
    revenue: float | None = None
    expenses: float | None = None
    operating_profit: float | None = None
    op_margin: float | None = None
    other_income: float | None = None
    depreciation: float | None = None
    interest: float | None = None
    pbt: float | None = None
    tax_pct: float | None = None
    net_profit: float | None = None
    net_margin: float | None = None
    eps: float | None = None
    dividend_per_share: float | None = None


class AnnualBSPoint(BaseModel):
    year: str
    equity_capital: float | None = None
    reserves: float | None = None
    total_debt: float | None = None
    current_liabilities: float | None = None
    total_liabilities: float | None = None
    fixed_assets: float | None = None
    current_assets: float | None = None
    total_assets: float | None = None


class AnnualCFPoint(BaseModel):
    year: str
    operating_cf: float | None = None
    investing_cf: float | None = None
    financing_cf: float | None = None
    free_cash_flow: float | None = None
    capex: float | None = None


class EfficiencyRatios(BaseModel):
    debtor_days: float | None = None
    inventory_days: float | None = None
    days_payable: float | None = None
    cash_conversion_cycle: float | None = None
    working_capital_days: float | None = None
    roce: float | None = None


class AnnualCAGR(BaseModel):
    revenue_3yr: float | None = None
    revenue_5yr: float | None = None
    profit_3yr: float | None = None
    profit_5yr: float | None = None


class SignalItem(BaseModel):
    type: str  # "pro" | "con"
    text: str


class AnnualResponse(BaseModel):
    market: Market
    symbol: str
    annual_pl: list[AnnualPLPoint]
    annual_bs: list[AnnualBSPoint]
    annual_cf: list[AnnualCFPoint]
    efficiency: EfficiencyRatios | None = None
    cagr: AnnualCAGR | None = None
    signals: list[SignalItem]
    face_value: float | None = None
    website: str | None = None
