# Stocks App — Performance, UI/UX & Feature Improvements

**Date:** 2026-07-16  
**Status:** Approved  
**Scope:** Three parallel tracks — performance/DB lightening, visual design refresh, three new features

---

## Guiding Principle

Only persist data that requires historical accumulation. Point-in-time lookups (news, fundamentals, earnings, macro) go direct-to-internet and cache in Python memory — never SQLite.

---

## Track 1 — Performance & DB Lightening

### 1.1 Database tables to remove

| Table | Reason for removal |
|---|---|
| `news_cache` | News is point-in-time; cached in Python memory instead |
| `macro_series` | Live yfinance fetch (^TNX, ^FVX) + 1h in-memory cache |
| `news_sentiment_snapshots` | Computed on-the-fly from live news; not worth persisting |
| `fundamentals` | On-demand per-symbol yfinance fetch + 6h in-memory cache |

**Stays in SQLite:** `symbols`, `daily_metrics`, `trading_calendar`, `refresh_log`, `watchlist`, `holdings`, `alert_rules`, `alert_triggers`, `forecast_models`.

### 1.2 Scheduler simplification

Remove cron jobs: weekly fundamentals (US + India), daily macro refresh, daily sentiment. APScheduler drops from 13 jobs to 7:
- US daily refresh (5 PM ET)
- India daily refresh (6 PM IST)
- Catch-up watchdog (every 30 min)
- Weekly US universe (Sunday 3 AM ET)
- Weekly sector refresh (Sunday 3:15 AM ET)
- Weekly forecast training US (Sunday 5 AM ET)
- Weekly forecast training India (Sunday 5:30 AM ET)

### 1.3 InMemoryCache utility

New file: `backend/app/services/cache.py`

```python
class InMemoryCache:
    def get(self, key: str) -> Any | None
    def set(self, key: str, value: Any, ttl_seconds: int) -> None
    def invalidate(self, key: str) -> None
```

Single global instance imported by services that previously wrote to DB: `news_service`, `fundamentals`, `earnings_service`, `macro_service`. Uses `threading.Lock` for thread safety (FastAPI may run sync endpoints in a thread pool).

### 1.4 Fundamentals refactor

`fundamentals.py` becomes on-demand: `get_fundamentals(symbol, market) -> dict`. Fetches from yfinance if not in cache, stores with 6h TTL. No DB writes. Called by `/api/stock/{market}/{symbol}` (stock detail) and `/api/screener` (for matching results only).

### 1.5 TanStack Query staleTime tuning

Each hook sets an appropriate `staleTime` so navigating back to a page doesn't reflash skeletons:

| Hook | staleTime |
|---|---|
| `useTradingDays` | 10 min |
| `useRankings` | 5 min |
| `useGlobalMarkets` | 3 min |
| `useHeatmap` | 5 min |
| `usePersistence` | 5 min |
| `useStockDetail` | 2 min |
| `useWatchlist` | 30 sec |

### 1.6 Optimistic mutations

Three mutation hooks get `onMutate` / `onError` / `onSettled` optimistic patterns:

**`useWatchlist`** — `addToWatchlist` / `removeFromWatchlist`: immediately update the cached watchlist item list; revert on network error.

**`useAlertRules`** — `setAlertRuleActive`: flip `is_active` in cached list immediately; revert on error.

**`useHoldings`** — `deleteHolding`: remove from cached list immediately; revert on error.

### 1.7 Prefetch on hover

`RankingTable` and `WatchlistTable` call `queryClient.prefetchQuery({ queryKey: ['stock-detail', market, symbol], queryFn: () => getStockDetail(market, symbol), staleTime: 2 * 60 * 1000 })` in `onMouseEnter` with a 200ms debounce. By click time, the detail page renders with data already in cache.

---

## Track 2 — Visual Design Refresh

### 2.1 Typography

- Page/section titles: `text-base font-semibold` (down from `text-lg`) — consistent across all pages
- Labels and UI text: `font-sans` (remove `font-mono` from non-numeric labels)
- Prices, % change, volume, dates: keep `font-mono`
- Table row padding: `py-2` (down from `py-3`) — fits more rows without scrolling

### 2.2 Cards & surfaces

Consistent card treatment applied everywhere:
```
border border-slate-200 dark:border-slate-700
rounded-xl
bg-white dark:bg-slate-900
shadow-sm
```
Currently some panels have borders, some don't, some have no background — unify.

### 2.3 Positive/negative colors

Standardize across all components:
- Positive: `text-green-600 dark:text-green-400`
- Negative: `text-red-600 dark:text-red-400`
- Neutral/zero: `text-slate-500 dark:text-slate-400`

Currently mixed between `text-emerald-*`, `text-green-*`, `text-red-*` inconsistently.

### 2.4 NavBar

Add `border-b border-slate-200 dark:border-slate-800` + `backdrop-blur-sm bg-white/90 dark:bg-slate-950/90` — currently flat white/dark with no depth.

### 2.5 BottomTabBar

Active tab: small dot indicator (`w-1 h-1 rounded-full bg-cyan-500`) below the icon in addition to color change. Clearer active state on mobile.

### 2.6 RankingTable rows

Add `cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50` — currently no hover feedback.

### 2.7 Skeleton loaders

Match exact card/table dimensions so layout doesn't shift when data loads.

### 2.8 EmptyState component

New reusable component: `frontend/src/components/common/EmptyState.tsx`

Props: `icon`, `title`, `description`, optional `action` (button label + onClick).

Used in:
- `WatchlistPage` — "No stocks in your watchlist yet. Search above to add one."
- `PortfolioPage` — "No holdings tracked yet. Add your first position."
- `AlertsPage` — "No alert rules set. Create one from any stock's detail page."

---

## Track 3 — New Features

### 3.1 Stock Screener

**Backend**

New files: `backend/app/routers/screener.py`, `backend/app/services/screener_service.py`

Endpoint: `GET /api/screener`

Query params:
- `market` (required): `US` | `IN`
- `sector` (optional): string
- `min_pct_change`, `max_pct_change` (optional): float
- `min_rel_volume` (optional): float (e.g. 1.5 = 50% above avg)
- `market_cap_tier` (optional): `small` | `mid` | `large` (< $2B / $2B–$10B / > $10B)
- `min_pe`, `max_pe` (optional): float
- `sort_by` (optional): `pct_change` | `volume` | `rel_volume` | `market_cap` (default: `pct_change`)
- `limit` (optional): int, max 200, default 50

Logic: query `daily_metrics` joined with `symbols` for the latest trading day with SQL WHERE clauses. For fundamentals filters (market_cap_tier, pe), cross-reference the in-memory fundamentals cache — only filter on fundamentals if cache has data for that symbol, otherwise include it (don't exclude unknowns).

Response: same shape as `RankingsResponse` + `sector` and `market_cap` fields per item.

**Frontend**

New page: `frontend/src/pages/ScreenerPage.tsx`  
New components: `frontend/src/components/screener/FilterPanel.tsx`, `frontend/src/components/screener/ScreenerTable.tsx`  
New hook: `frontend/src/hooks/useScreener.ts`

Layout: filter panel (collapsible on mobile, sidebar on desktop) + results table. Results table reuses `RankingTable` column styling. Shows result count ("47 stocks matched").

Route: `/screener` added to `App.tsx`. Replaces the News tab in `BottomTabBar` (News remains accessible from the NavBar on desktop; mobile users reach it via `/news` directly).

### 3.2 Technical Indicators

**No backend changes.**

New file: `frontend/src/lib/indicators.ts`

Exports pure functions:
```ts
function calcRSI(closes: number[], period = 14): (number | null)[]
function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9): { macd: number[], signal: number[], histogram: number[] }
function calcBollingerBands(closes: number[], period = 20, stdDev = 2): { upper: number[], middle: number[], lower: number[] }
```

Returns `null` for the warm-up period (first `period - 1` values) so charts don't show misleading data.

`PriceVolumeChart` receives new optional prop `activeIndicators: ('rsi' | 'macd' | 'bb')[]`. When non-empty:
- **Bollinger Bands**: rendered as a filled area series on the main price pane
- **RSI**: rendered in a new `lightweight-charts` pane below price (height 80px), dashed lines at 70/30
- **MACD**: rendered in a new pane below RSI (height 80px), histogram bars + signal line

`StockDetailPage` adds toggle buttons above the chart: `[BB] [RSI] [MACD]`. State: `useState<Set<string>>`.

History already fetches up to 2100 days — sufficient warm-up for all three indicators.

### 3.3 Earnings Calendar

**Backend**

New files: `backend/app/routers/earnings.py`, `backend/app/services/earnings_service.py`

Endpoint: `GET /api/earnings`

Query params:
- `market` (required): `US` | `IN`  
- `symbols` (required): comma-separated list, max 50

Logic: for each symbol, check `InMemoryCache`. If miss, fetch `yfinance.Ticker(symbol).calendar` (returns a dict with `Earnings Date` key). Cache result with 6h TTL. Return array of `{ symbol, name, earnings_date, eps_estimate }`. Symbols with no upcoming earnings date are omitted from results.

India note: yfinance earnings data is sparse for NSE stocks — return what's available, silently skip misses.

**Frontend**

Two integration points:

1. **`KeyStatsGrid`** in `StockDetailPage`: fetch `/api/earnings?market=X&symbols=SYMBOL`, show "Next earnings: Jul 29" badge if within 60 days. Uses new `useEarnings(market, [symbol])` hook with `staleTime: 6h`.

2. **Dashboard earnings widget**: new `EarningsCalendarWidget` component on `DashboardPage`. Fetches earnings for all watchlist symbols. Shows list of upcoming earnings in next 30 days sorted by date. Max 10 entries. Shows "No upcoming earnings in your watchlist" if empty.

---

## File Inventory

### New backend files
- `backend/app/services/cache.py`
- `backend/app/services/earnings_service.py`
- `backend/app/routers/screener.py`
- `backend/app/services/screener_service.py`
- `backend/app/routers/earnings.py`

### Forecast model feature impact

`forecast_training_service.py` currently uses `macro_series` and `news_sentiment_snapshots` as ML features. Removing those tables requires dropping those columns from the feature set before training. The model retrain on the next weekly Sunday run will produce a new model without them. Prior trained model artifacts on disk remain valid until superseded — no manual cleanup needed.

---

### Modified backend files
- `backend/app/models.py` — remove 4 tables
- `backend/app/services/news_service.py` — remove DB writes, use InMemoryCache
- `backend/app/services/fundamentals.py` — remove DB writes, use InMemoryCache
- `backend/app/services/macro_service.py` — remove DB writes, use InMemoryCache
- `backend/app/services/scheduler.py` — remove 6 cron jobs
- `backend/app/main.py` — remove migration/startup calls for dropped tables
- `backend/app/routers/news.py` — remove DB cache reads
- `backend/app/schemas.py` — add screener + earnings response types
- `backend/app/main.py` — register screener + earnings routers

### New frontend files
- `frontend/src/lib/indicators.ts`
- `frontend/src/components/common/EmptyState.tsx`
- `frontend/src/pages/ScreenerPage.tsx`
- `frontend/src/components/screener/FilterPanel.tsx`
- `frontend/src/components/screener/ScreenerTable.tsx`
- `frontend/src/hooks/useScreener.ts`
- `frontend/src/hooks/useEarnings.ts`
- `frontend/src/components/stock-detail/IndicatorToggles.tsx`
- `frontend/src/components/dashboard/EarningsCalendarWidget.tsx`

### Modified frontend files
- `frontend/src/App.tsx` — add `/screener` route
- `frontend/src/components/layout/BottomTabBar.tsx` — add Screener tab
- `frontend/src/components/layout/NavBar.tsx` — backdrop blur, border
- `frontend/src/components/stock-detail/PriceVolumeChart.tsx` — indicator panes
- `frontend/src/components/stock-detail/KeyStatsGrid.tsx` — earnings badge
- `frontend/src/pages/DashboardPage.tsx` — earnings widget
- `frontend/src/pages/WatchlistPage.tsx` — EmptyState
- `frontend/src/pages/PortfolioPage.tsx` — EmptyState
- `frontend/src/pages/AlertsPage.tsx` — EmptyState
- `frontend/src/components/rankings/RankingTable.tsx` — hover styles, prefetch
- `frontend/src/components/watchlist/WatchlistTable.tsx` — prefetch on hover
- All hook files — staleTime tuning
- `useWatchlist`, `useAlertRules`, `useHoldings` — optimistic mutations
- Visual polish: `Skeleton`, card components, color tokens
