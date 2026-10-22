import type {
  ChatMessage,
  ChatResponse,
  Market,
  Category,
  RankingsResponse,
  TradingDaysResponse,
  PersistenceResponse,
  NewsResponse,
  RefreshStatusResponse,
  SearchResponse,
  StockDetailResponse,
  StockHistoryResponse,
  StockPeersResponse,
  HeatmapResponse,
  WatchlistResponse,
  WatchlistItem,
  HoldingsResponse,
  HoldingsSummaryResponse,
  HoldingItem,
  HoldingCreateRequest,
  HoldingUpdateRequest,
  GlobalMarketsResponse,
  AlertRulesResponse,
  AlertRuleItem,
  AlertRuleCreateRequest,
  AlertTriggersResponse,
  MarketNewsResponse,
  LiveQuoteResponse,
  IntradayResponse,
  IndexHistoryResponse,
  ScreenerParams,
  ScreenerResponse,
  EarningsResponse,
  NewsSentimentResponse,
  QuarterlyResponse,
  AnnualResponse,
  ScannerParams,
  ScannerResponse,
  SectorRotationResponse,
  StockTechnicalsResponse,
  FiiDiiResponse,
  PortfolioRiskResponse,
} from "./types";

import { getApiBaseUrlOverride } from "../lib/preferences";

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8010";

// Read per-request (not once at module load) so a Settings change takes
// effect immediately without reloading the app.
export function getApiBaseUrl(): string {
  return getApiBaseUrlOverride() ?? DEFAULT_API_BASE_URL;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail;
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function getTradingDays(market: Market, limit = 30): Promise<TradingDaysResponse> {
  return request(`/api/trading-days?market=${market}&limit=${limit}`);
}

export function getRankings(
  market: Market,
  date: string,
  category: Category,
  topN: number,
): Promise<RankingsResponse> {
  return request(
    `/api/rankings?market=${market}&date=${date}&category=${category}&top_n=${topN}`,
  );
}

export interface PersistenceParams {
  market: Market;
  category: Category;
  topN: number;
  mode: "last_n" | "explicit";
  n?: number;
  dates?: string[];
  minDays?: number;
}

export function getPersistence(params: PersistenceParams): Promise<PersistenceResponse> {
  const search = new URLSearchParams({
    market: params.market,
    category: params.category,
    top_n: String(params.topN),
    mode: params.mode,
  });
  if (params.mode === "last_n" && params.n) {
    search.set("n", String(params.n));
  }
  if (params.mode === "explicit" && params.dates) {
    search.set("dates", params.dates.join(","));
  }
  if (params.minDays) {
    search.set("min_days", String(params.minDays));
  }
  return request(`/api/persistence?${search.toString()}`);
}

export function getNews(market: Market, symbol: string, name?: string | null): Promise<NewsResponse> {
  const search = new URLSearchParams({ market, symbol });
  if (name) search.set("name", name);
  return request(`/api/news?${search.toString()}`);
}

export function postRefresh(market: Market | "BOTH"): Promise<{ status: string; markets: string[] }> {
  return request(`/api/refresh`, {
    method: "POST",
    body: JSON.stringify({ market }),
  });
}

export function getRefreshStatus(market?: Market): Promise<RefreshStatusResponse> {
  const search = market ? `?market=${market}` : "";
  return request(`/api/refresh/status/latest${search}`);
}

export function searchSymbols(
  q: string,
  market: Market | "ALL" = "ALL",
  limit = 20,
): Promise<SearchResponse> {
  const search = new URLSearchParams({ q, market, limit: String(limit) });
  return request(`/api/search?${search.toString()}`);
}

export function getStockDetail(market: Market, symbol: string): Promise<StockDetailResponse> {
  return request(`/api/stock/${market}/${symbol}`);
}

export function getStockHistory(
  market: Market,
  symbol: string,
  days = 180,
): Promise<StockHistoryResponse> {
  return request(`/api/stock/${market}/${symbol}/history?days=${days}`);
}

export function getStockPeers(
  market: Market,
  symbol: string,
  limit = 10,
): Promise<StockPeersResponse> {
  return request(`/api/stock/${market}/${symbol}/peers?limit=${limit}`);
}

export function getHeatmap(market: Market, date: string): Promise<HeatmapResponse> {
  return request(`/api/heatmap?market=${market}&date=${date}`);
}

export function getWatchlist(market: Market | "ALL" = "ALL"): Promise<WatchlistResponse> {
  return request(`/api/watchlist?market=${market}`);
}

export function addToWatchlist(market: Market, symbol: string): Promise<WatchlistItem> {
  return request(`/api/watchlist`, {
    method: "POST",
    body: JSON.stringify({ market, symbol }),
  });
}

export function removeFromWatchlist(market: Market, symbol: string): Promise<void> {
  return request(`/api/watchlist/${market}/${symbol}`, { method: "DELETE" });
}

export function getHoldings(): Promise<HoldingsResponse> {
  return request(`/api/holdings`);
}

export function getHoldingsSummary(): Promise<HoldingsSummaryResponse> {
  return request(`/api/holdings/summary`);
}

export function createHolding(payload: HoldingCreateRequest): Promise<HoldingItem> {
  return request(`/api/holdings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHolding(id: number, payload: HoldingUpdateRequest): Promise<HoldingItem> {
  return request(`/api/holdings/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteHolding(id: number): Promise<void> {
  return request(`/api/holdings/${id}`, { method: "DELETE" });
}

export function sellHolding(id: number, sellPrice: number, sellDate: string): Promise<HoldingItem> {
  return request(`/api/holdings/${id}/sell`, {
    method: "POST",
    body: JSON.stringify({ sell_price: sellPrice, sell_date: sellDate }),
  });
}

export function getGlobalMarkets(): Promise<GlobalMarketsResponse> {
  return request(`/api/global-markets`);
}

export function getAlertRules(market?: Market): Promise<AlertRulesResponse> {
  const search = market ? `?market=${market}` : "";
  return request(`/api/alerts/rules${search}`);
}

export function createAlertRule(payload: AlertRuleCreateRequest): Promise<AlertRuleItem> {
  return request(`/api/alerts/rules`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function setAlertRuleActive(id: number, isActive: boolean): Promise<AlertRuleItem> {
  return request(`/api/alerts/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
}

export function deleteAlertRule(id: number): Promise<void> {
  return request(`/api/alerts/rules/${id}`, { method: "DELETE" });
}

export function getAlertTriggers(unreadOnly = false): Promise<AlertTriggersResponse> {
  return request(`/api/alerts/triggers?unread_only=${unreadOnly}`);
}

export function markTriggersRead(triggerIds?: number[]): Promise<{ marked_read: number }> {
  return request(`/api/alerts/triggers/mark-read`, {
    method: "POST",
    body: JSON.stringify({ trigger_ids: triggerIds ?? null }),
  });
}

export function getMarketNews(market: Market, limit = 20): Promise<MarketNewsResponse> {
  return request(`/api/news/market?market=${market}&limit=${limit}`);
}

export function getLiveQuote(market: Market, symbol: string): Promise<LiveQuoteResponse> {
  return request(`/api/stock/${market}/${symbol}/live`);
}

export function getIntraday(market: Market, symbol: string): Promise<IntradayResponse> {
  return request(`/api/stock/${market}/${symbol}/intraday`);
}

export function getIndexHistory(market: Market, days = 180): Promise<IndexHistoryResponse> {
  return request(`/api/index-history?market=${market}&days=${days}`);
}

export function getSymbolHistory(symbol: string, days = 180): Promise<IndexHistoryResponse> {
  return request(`/api/symbol-history?symbol=${encodeURIComponent(symbol)}&days=${days}`);
}

export function getScreener(params: ScreenerParams): Promise<ScreenerResponse> {
  const search = new URLSearchParams({ market: params.market });
  if (params.sector) search.set("sector", params.sector);
  if (params.min_pct_change !== undefined) search.set("min_pct_change", String(params.min_pct_change));
  if (params.max_pct_change !== undefined) search.set("max_pct_change", String(params.max_pct_change));
  if (params.min_rel_volume !== undefined) search.set("min_rel_volume", String(params.min_rel_volume));
  if (params.market_cap_tier) search.set("market_cap_tier", params.market_cap_tier);
  if (params.min_pe !== undefined) search.set("min_pe", String(params.min_pe));
  if (params.max_pe !== undefined) search.set("max_pe", String(params.max_pe));
  if (params.sort_by) search.set("sort_by", params.sort_by);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  return request(`/api/screener?${search.toString()}`);
}

export function getEarnings(market: Market, symbols: string[]): Promise<EarningsResponse> {
  return request(`/api/earnings?market=${market}&symbols=${symbols.join(",")}`);
}

export function getNewsSentiment(market: Market, symbol: string, name = ""): Promise<NewsSentimentResponse> {
  return request(`/api/news/sentiment?market=${market}&symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`);
}

export function getStockQuarterly(market: Market, symbol: string): Promise<QuarterlyResponse> {
  return request(`/api/stock/${market}/${symbol}/quarterly`);
}

export function getStockAnnual(market: Market, symbol: string): Promise<AnnualResponse> {
  return request(`/api/stock/${market}/${symbol}/annual`);
}


export function getScanner(params: ScannerParams): Promise<ScannerResponse> {
  const search = new URLSearchParams({ market: params.market });
  if (params.setups?.length) search.set("setups", params.setups.join(","));
  if (params.sector) search.set("sector", params.sector);
  if (params.sort_by) search.set("sort_by", params.sort_by);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  return request(`/api/scanner?${search.toString()}`);
}

export function getSectorRotation(market: Market): Promise<SectorRotationResponse> {
  return request(`/api/sector-rotation?market=${market}`);
}

export function getStockTechnicals(market: Market, symbol: string): Promise<StockTechnicalsResponse> {
  return request(`/api/stock/${market}/${symbol}/technicals`);
}

export function sendChatMessage(
  market: Market,
  message: string,
  history: ChatMessage[],
): Promise<ChatResponse> {
  return request(`/api/ai/chat`, {
    method: "POST",
    body: JSON.stringify({ market, message, history }),
  });
}

export function getFiiDii(days = 20): Promise<FiiDiiResponse> {
  return request(`/api/fii-dii?days=${days}`);
}

export function getPortfolioRisk(): Promise<PortfolioRiskResponse> {
  return request(`/api/portfolio/risk`);
}
