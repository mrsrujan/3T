export type Market = "IN";
export type Category = "gainers" | "losers" | "most_active" | "trending";

export interface RankingItem {
  symbol: string;
  name: string | null;
  sector: string | null;
  close: number | null;
  prev_close: number | null;
  pct_change: number | null;
  volume: number | null;
  turnover: number | null;
  rel_volume: number | null;
  spark: number[] | null;
}

export interface RankingsResponse {
  market: Market;
  date: string;
  category: Category;
  top_n: number;
  items: RankingItem[];
}

export interface TradingDaysResponse {
  market: Market;
  dates: string[];
}

export interface PersistenceItem {
  symbol: string;
  name: string | null;
  sector: string | null;
  days_present: number;
  num_dates_requested: number;
  avg_rank: number;
  current_price: number | null;
  change_value: number | null;
  change_pct: number | null;
}

export interface PersistenceResponse {
  market: Market;
  category: Category;
  top_n: number;
  mode: string;
  dates_used: string[];
  dropped_dates: string[];
  items: PersistenceItem[];
}

export interface NewsArticle {
  title: string;
  link: string;
  source: string | null;
  published_at: string | null;
}

export interface NewsResponse {
  market: Market;
  symbol: string;
  articles: NewsArticle[];
}

export interface RefreshStatusResponse {
  job_id: number;
  market: string | null;
  job_type: string;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  started_at: string;
  finished_at: string | null;
  symbols_processed: number;
  symbols_failed: number;
  error_message: string | null;
}

export interface ApiErrorDetail {
  error?: string;
  nearest_available_date?: string | null;
}

export interface SearchResultItem {
  symbol: string;
  name: string | null;
  market: Market;
  sector: string | null;
  industry: string | null;
}

export interface SearchResponse {
  query: string;
  items: SearchResultItem[];
}

export interface StockLatestMetrics {
  trade_date: string;
  close: number | null;
  prev_close: number | null;
  pct_change: number | null;
  volume: number | null;
  rel_volume: number | null;
}

export interface FundamentalsData {
  market_cap: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  dividend_yield: number | null;
  roe: number | null;
  book_value: number | null;
  debt_to_equity: number | null;
  fetched_at: string;
  fetch_status: "ok" | "partial" | "failed";
}

export interface StockDetailResponse {
  market: Market;
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  last_seen: string | null;
  latest: StockLatestMetrics | null;
  week52_high: number | null;
  week52_low: number | null;
  fundamentals: FundamentalsData | null;
}

export interface HistoryPoint {
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface StockHistoryResponse {
  market: Market;
  symbol: string;
  points: HistoryPoint[];
}

export interface PeerItem {
  symbol: string;
  name: string | null;
  close: number | null;
  pct_change: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
}

export interface StockPeersResponse {
  market: Market;
  symbol: string;
  sector: string | null;
  sector_median_pe: number | null;
  peers: PeerItem[];
}

export interface HeatmapSymbol {
  symbol: string;
  name: string | null;
  pct_change: number | null;
  volume: number | null;
  market_cap: number | null;
}

export interface HeatmapSector {
  sector: string;
  symbols: HeatmapSymbol[];
}

export interface HeatmapResponse {
  market: Market;
  date: string;
  sectors: HeatmapSector[];
}


export interface WatchlistItem {
  id: number;
  market: Market;
  symbol: string;
  name: string | null;
  added_at: string;
  close: number | null;
  pct_change: number | null;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
}

export interface HoldingItem {
  id: number;
  market: Market;
  symbol: string;
  name: string | null;
  sector: string | null;
  quantity: number;
  buy_price: number;
  buy_date: string;
  sell_price: number | null;
  sell_date: string | null;
  is_closed: boolean;
  notes: string | null;
  current_price: number | null;
  market_value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
}

export interface HoldingsResponse {
  items: HoldingItem[];
}

export interface MarketSummary {
  invested: number;
  market_value: number;
  pnl: number;
  pnl_pct: number | null;
  realized_pnl: number;
}

export interface AllocationSlice {
  label: string;
  value_inr: number;
  pct: number;
}

export interface HoldingsSummaryResponse {
  fx_rate_usd_inr: number | null;
  total_invested_inr: number | null;
  total_market_value_inr: number | null;
  total_pnl_inr: number | null;
  total_pnl_pct: number | null;
  total_market_value_usd: number | null;
  total_realized_pnl_inr: number | null;
  by_market: Record<string, MarketSummary>;
  allocation: AllocationSlice[];
}

export interface HoldingCreateRequest {
  market: Market;
  symbol: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  notes?: string;
}

export interface HoldingUpdateRequest {
  quantity?: number;
  buy_price?: number;
  buy_date?: string;
  notes?: string;
}

export interface GlobalMarketItem {
  symbol: string;
  name: string;
  code: string;
  price: number | null;
  change_value: number | null;
  change_pct: number | null;
}

export interface GlobalMarketsResponse {
  indexes: GlobalMarketItem[];
  commodities: GlobalMarketItem[];
  fetched_at: string;
}

export type AlertRuleType =
  | "pct_change_above"
  | "pct_change_below"
  | "price_above"
  | "price_below"
  | "rel_volume_above";

export interface AlertRuleItem {
  id: number;
  market: Market;
  symbol: string;
  name: string | null;
  rule_type: AlertRuleType;
  threshold: number;
  is_active: boolean;
  created_at: string;
}

export interface AlertRulesResponse {
  items: AlertRuleItem[];
}

export interface AlertRuleCreateRequest {
  market: Market;
  symbol: string;
  rule_type: AlertRuleType;
  threshold: number;
}

export interface AlertTriggerItem {
  id: number;
  market: Market;
  symbol: string;
  name: string | null;
  trade_date: string;
  triggered_at: string;
  trigger_value: number;
  message: string;
  is_read: boolean;
}

export interface AlertTriggersResponse {
  items: AlertTriggerItem[];
}

export interface MarketNewsArticle {
  title: string;
  link: string;
  source: string | null;
  published_at: string | null;
  symbol: string;
}

export interface MarketNewsResponse {
  market: Market;
  articles: MarketNewsArticle[];
}

export interface LiveQuoteResponse {
  market: Market;
  symbol: string;
  price: number | null;
  change_value: number | null;
  change_pct: number | null;
  is_market_open: boolean;
  as_of: string;
}

export interface IntradayPoint {
  time: number;
  price: number;
  volume: number | null;
}

export interface IntradayResponse {
  market: Market;
  symbol: string;
  points: IntradayPoint[];
}

export interface IndexHistoryPoint {
  trade_date: string;
  close: number;
}

export interface IndexHistoryResponse {
  market: Market;
  symbol: string;
  name: string;
  points: IndexHistoryPoint[];
}

export type ScannerSetup =
  | "breakout"
  | "rs_leader"
  | "new_52w_high"
  | "new_52w_low"
  | "swing_rsi"
  | "swing_macd"
  | "volume_surge";

export const SETUP_META: Record<ScannerSetup, { label: string; color: string }> = {
  breakout:    { label: "Breakout",     color: "emerald" },
  rs_leader:   { label: "RS Leader",   color: "cyan" },
  new_52w_high:{ label: "52W High",    color: "amber" },
  new_52w_low: { label: "52W Low",     color: "red" },
  swing_rsi:   { label: "RSI Pullback",color: "purple" },
  swing_macd:  { label: "MACD Cross",  color: "blue" },
  volume_surge:{ label: "Vol Surge",   color: "orange" },
};

export interface ScreenerItem {
  symbol: string;
  name: string | null;
  sector: string | null;
  close: number | null;
  pct_change: number | null;
  volume: number | null;
  rel_volume: number | null;
  market_cap: number | null;
  setups: ScannerSetup[];
}

export interface ScreenerResponse {
  market: Market;
  date: string;
  total: number;
  items: ScreenerItem[];
}

export type ScreenerSortBy = "pct_change" | "volume" | "rel_volume" | "market_cap";
export type MarketCapTier = "small" | "mid" | "large";

export interface ScreenerParams {
  market: Market;
  sector?: string;
  min_pct_change?: number;
  max_pct_change?: number;
  min_rel_volume?: number;
  market_cap_tier?: MarketCapTier;
  min_pe?: number;
  max_pe?: number;
  sort_by?: ScreenerSortBy;
  limit?: number;
  setups?: ScannerSetup[];
}

export interface EarningsItem {
  symbol: string;
  name: string | null;
  earnings_date: string;  // "2026-07-29"
  eps_estimate: number | null;
}

export interface EarningsResponse {
  items: EarningsItem[];
}

export interface NewsSentimentCategory {
  label: string;
  icon: string;
  article_count: number;
  sentiment: "positive" | "negative" | "neutral";
  headlines: string[];
}

export interface NewsSentimentResponse {
  symbol: string;
  market: string;
  article_count: number;
  overall_sentiment: "positive" | "negative" | "neutral";
  categories: Record<string, NewsSentimentCategory>;
}

export interface QuarterlyPoint {
  quarter: string;
  period_end_date: string | null;
  revenue: number | null;
  revenue_qoq: number | null;
  revenue_yoy: number | null;
  gross_profit: number | null;
  gross_margin: number | null;
  operating_income: number | null;
  op_margin: number | null;
  ebitda: number | null;
  net_profit: number | null;
  net_margin: number | null;
  eps: number | null;
  free_cash_flow: number | null;
  total_debt: number | null;
  interest_coverage: number | null;
  price_reaction: number | null;
}

export interface ShareholdingData {
  promoters: number;
  institutions: number;
  public_other: number;
}

export interface QuarterlyResponse {
  market: Market;
  symbol: string;
  quarterly: QuarterlyPoint[];
  shareholding: ShareholdingData | null;
}

export interface AnnualPLPoint {
  year: string;
  revenue: number | null;
  expenses: number | null;
  operating_profit: number | null;
  op_margin: number | null;
  other_income: number | null;
  depreciation: number | null;
  interest: number | null;
  pbt: number | null;
  tax_pct: number | null;
  net_profit: number | null;
  net_margin: number | null;
  eps: number | null;
  dividend_per_share: number | null;
}

export interface AnnualBSPoint {
  year: string;
  equity_capital: number | null;
  reserves: number | null;
  total_debt: number | null;
  current_liabilities: number | null;
  total_liabilities: number | null;
  fixed_assets: number | null;
  current_assets: number | null;
  total_assets: number | null;
}

export interface AnnualCFPoint {
  year: string;
  operating_cf: number | null;
  investing_cf: number | null;
  financing_cf: number | null;
  free_cash_flow: number | null;
  capex: number | null;
}

export interface EfficiencyRatios {
  debtor_days: number | null;
  inventory_days: number | null;
  days_payable: number | null;
  cash_conversion_cycle: number | null;
  working_capital_days: number | null;
  roce: number | null;
}

export interface AnnualCAGR {
  revenue_3yr: number | null;
  revenue_5yr: number | null;
  profit_3yr: number | null;
  profit_5yr: number | null;
}

export interface SignalItem {
  type: "pro" | "con";
  text: string;
}

export interface AnnualResponse {
  market: Market;
  symbol: string;
  annual_pl: AnnualPLPoint[];
  annual_bs: AnnualBSPoint[];
  annual_cf: AnnualCFPoint[];
  efficiency: EfficiencyRatios | null;
  cagr: AnnualCAGR | null;
  signals: SignalItem[];
  face_value: number | null;
  website: string | null;
}

export interface ScannerItem {
  symbol: string;
  name: string | null;
  sector: string | null;
  close: number | null;
  pct_change: number | null;
  volume: number | null;
  rel_volume: number | null;
  week52_high: number | null;
  week52_low: number | null;
  distance_from_52w_high_pct: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  macd_hist: number | null;
  rs_percentile: number | null;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
  setups: ScannerSetup[];
}

export interface ScannerResponse {
  market: Market;
  date: string;
  total: number;
  items: ScannerItem[];
}

export interface ScannerParams {
  market: Market;
  setups?: ScannerSetup[];
  sector?: string;
  sort_by?: "rs_score" | "pct_change" | "rel_volume" | "volume";
  limit?: number;
}

export interface SectorItem {
  sector: string;
  symbol_count: number;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
}

export interface SectorRotationResponse {
  market: Market;
  date: string;
  sectors: SectorItem[];
}

export interface StockTechnicalsResponse {
  market: Market;
  symbol: string;
  setups: ScannerSetup[];
  rs_percentile: number | null;
  rsi_14: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  macd_hist: number | null;
  week52_high: number | null;
  week52_low: number | null;
  distance_from_52w_high_pct: number | null;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  sources: string[];
}

// ── FII / DII ──────────────────────────────────────────────────────────────────
export interface FiiDiiItem {
  date: string;
  fii_buy: number | null;
  fii_sell: number | null;
  fii_net: number | null;
  dii_buy: number | null;
  dii_sell: number | null;
  dii_net: number | null;
}
export interface FiiDiiResponse { items: FiiDiiItem[] }

// ── Portfolio Risk ─────────────────────────────────────────────────────────────
export interface SectorWeight {
  sector: string;
  value: number;
  weight_pct: number;
}
export interface PortfolioRiskResponse {
  total_value: number;
  position_count: number;
  sector_weights: SectorWeight[];
  annualised_volatility_pct: number | null;
  annualised_return_pct: number | null;
  sharpe_ratio: number | null;
  portfolio_beta: number | null;
  data_days: number;
}
