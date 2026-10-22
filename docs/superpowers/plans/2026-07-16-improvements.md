# Stocks App Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lighten the database and container by removing 4 SQLite tables and 6 cron jobs, add visual polish, and ship three new features: stock screener, technical indicators (RSI/MACD/Bollinger Bands), and earnings calendar.

**Architecture:** Backend gets an `InMemoryCache` utility that replaces all SQLite-based point-in-time caches (news, fundamentals, macro, sentiment); two new FastAPI routers (screener, earnings) sit on top of it. Frontend gains `staleTime` tuning and optimistic mutations for instant feel, a visual refresh using existing Tailwind tokens, and three new features built from existing hooks/chart infrastructure.

**Tech Stack:** FastAPI + SQLAlchemy + SQLite (WAL) + APScheduler · React 19 + TanStack Query v5 + Tailwind CSS 3 + lightweight-charts v5 · Python 3.11 · TypeScript 6

## Global Constraints

- yfinance pinned to `1.5.1` — do not upgrade
- India fetch uses `curl_cffi` — never replace with `requests`/`httpx`
- Backend listens on port 8001 (bare dev) / 8010 (Docker) — port 8000 is blocked
- SQLite WAL mode — batch INSERTs must stay under 999 params per statement
- TypeScript: type-check with `npm run typecheck` (`tsc -p tsconfig.app.json`), not bare `tsc --noEmit`
- All new tests use the existing `conftest.py` `db` fixture (in-memory SQLite)
- Run backend tests from `backend/` with `./venv/Scripts/python -m pytest`

---

## Task 1: InMemoryCache utility

**Files:**
- Create: `backend/app/services/cache.py`
- Create: `backend/tests/test_cache.py`

**Interfaces:**
- Produces: `_cache: InMemoryCache` global instance; methods `get(key) -> Any | None`, `set(key, value, ttl_seconds)`, `invalidate(key)`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_cache.py
import time
from app.services.cache import InMemoryCache


def test_set_and_get():
    c = InMemoryCache()
    c.set("k", "v", ttl_seconds=60)
    assert c.get("k") == "v"


def test_miss_returns_none():
    c = InMemoryCache()
    assert c.get("missing") is None


def test_expired_returns_none():
    c = InMemoryCache()
    c.set("k", "v", ttl_seconds=0)
    time.sleep(0.01)
    assert c.get("k") is None


def test_invalidate():
    c = InMemoryCache()
    c.set("k", "v", ttl_seconds=60)
    c.invalidate("k")
    assert c.get("k") is None


def test_overwrite():
    c = InMemoryCache()
    c.set("k", "a", ttl_seconds=60)
    c.set("k", "b", ttl_seconds=60)
    assert c.get("k") == "b"
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && ./venv/Scripts/python -m pytest tests/test_cache.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.services.cache'`

- [ ] **Step 3: Implement**

```python
# backend/app/services/cache.py
from __future__ import annotations

import threading
import time
from typing import Any


class InMemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}  # key -> (value, expires_at)
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic() + ttl_seconds)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)


# Single global instance shared across all services.
_cache = InMemoryCache()
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && ./venv/Scripts/python -m pytest tests/test_cache.py -v
```
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cache.py backend/tests/test_cache.py
git commit -m "feat: add InMemoryCache utility with TTL and thread-safety"
```

---

## Task 2: Refactor news_service to use InMemoryCache

**Files:**
- Modify: `backend/app/services/news_service.py`
- Modify: `backend/app/routers/news.py`

**Interfaces:**
- Consumes: `_cache` from `app.services.cache`
- Produces: `get_news(market, symbol, name) -> list[dict]` (no `db` arg); `get_market_news(db, market, limit) -> list[dict]` (db still needed for watchlist fallback query)

- [ ] **Step 1: Rewrite `news_service.py`**

Replace the entire file. The only change is removing DB read/write and replacing with `_cache`:

```python
# backend/app/services/news_service.py
from __future__ import annotations

import logging
from calendar import timegm
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

import feedparser
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.cache import _cache

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30 * 60  # 30 minutes
MAX_ARTICLES = 15
MAX_ARTICLE_AGE_DAYS = 7

MARKET_QUERY_PARAMS = {
    "US": {"hl": "en-US", "gl": "US", "ceid": "US:en"},
    "IN": {"hl": "en-IN", "gl": "IN", "ceid": "IN:en"},
}


def _build_rss_url(query: str, market: str) -> str:
    params = MARKET_QUERY_PARAMS.get(market, MARKET_QUERY_PARAMS["US"])
    q = quote_plus(query)
    return f"https://news.google.com/rss/search?q={q}&hl={params['hl']}&gl={params['gl']}&ceid={params['ceid']}"


def _fetch_live(market: str, symbol: str, name: str | None) -> list[dict]:
    query = f"{name} stock" if name else f"{symbol} stock"
    url = _build_rss_url(query, market)
    try:
        feed = feedparser.parse(url)
    except Exception:
        logger.exception("Google News RSS fetch failed for %s/%s", market, symbol)
        return []

    cutoff = datetime.utcnow() - timedelta(days=MAX_ARTICLE_AGE_DAYS)
    articles = []
    for entry in feed.entries:
        published_parsed = entry.get("published_parsed")
        if not published_parsed:
            continue
        published_at = datetime.utcfromtimestamp(timegm(published_parsed))
        if published_at < cutoff:
            continue
        source = entry.get("source", {})
        articles.append({
            "title": entry.get("title", ""),
            "link": entry.get("link", ""),
            "source": source.get("title") if isinstance(source, dict) else None,
            "published_at": entry.get("published"),
        })
        if len(articles) >= MAX_ARTICLES:
            break
    return articles


def get_news(market: str, symbol: str, name: str | None = None) -> list[dict]:
    cache_key = f"news:{market}:{symbol}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    articles = _fetch_live(market, symbol, name)
    _cache.set(cache_key, articles, CACHE_TTL_SECONDS)
    return articles


def _sortable_published_at(article: dict) -> datetime:
    raw = article.get("published_at")
    if not raw:
        return datetime.min
    try:
        return parsedate_to_datetime(raw).replace(tzinfo=None)
    except (TypeError, ValueError):
        return datetime.min


def get_market_news(db: Session, market: str, limit: int = 20) -> list[dict]:
    from app.services.watchlist_service import get_watchlist

    watchlist = get_watchlist(db, market)
    symbols = [(w["symbol"], w["name"]) for w in watchlist]

    if not symbols:
        rows = db.execute(
            text(
                """
                SELECT s.symbol, s.name FROM daily_metrics dm
                JOIN symbols s ON s.symbol_id = dm.symbol_id
                WHERE dm.market = :market AND dm.pct_change IS NOT NULL
                  AND dm.trade_date = (SELECT MAX(trade_date) FROM trading_calendar WHERE market = :market)
                ORDER BY dm.pct_change DESC LIMIT 5
                """
            ),
            {"market": market},
        ).all()
        symbols = [(r.symbol, r.name) for r in rows]

    seen_links: set[str] = set()
    all_articles: list[dict] = []
    for symbol, name in symbols:
        for article in get_news(market, symbol, name):
            if article["link"] in seen_links:
                continue
            seen_links.add(article["link"])
            all_articles.append({**article, "symbol": symbol})

    all_articles.sort(key=_sortable_published_at, reverse=True)
    return all_articles[:limit]
```

- [ ] **Step 2: Update `routers/news.py` — remove `db` from `get_news` calls**

Find all calls to `get_news(db, ...)` in `backend/app/routers/news.py` and change them to `get_news(...)` (drop the `db` arg). Keep `db` in the router for `get_market_news` calls which still need it. Verify the import no longer imports `NewsCache` from models.

- [ ] **Step 3: Run existing tests**

```
cd backend && ./venv/Scripts/python -m pytest -v
```
Expected: all previously passing tests still pass

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/news_service.py backend/app/routers/news.py
git commit -m "refactor: news_service uses InMemoryCache instead of SQLite news_cache"
```

---

## Task 3: Refactor fundamentals to on-demand in-memory

**Files:**
- Modify: `backend/app/services/fundamentals.py`
- Modify: `backend/app/services/stock_detail_service.py` (wherever it reads from `fundamentals` table)

**Interfaces:**
- Produces: `get_fundamentals(symbol: str, market: str) -> dict` — on-demand yfinance fetch, cached 6h

- [ ] **Step 1: Replace the DB-writing half of `fundamentals.py`**

Keep `_fetch_one`, `_yf_ticker_symbol`, `_is_rate_limit_error`, `_clean`, `fetch_sector_for_symbols`, `fetch_fundamentals_for_symbols` unchanged (they're pure fetch functions, still needed by sector_service). Remove `fetch_fundamentals_for_universe`, `upsert_fundamentals`, `refresh_fundamentals`. Add:

```python
# Add at the top of backend/app/services/fundamentals.py (after existing imports)
from app.services.cache import _cache

FUNDAMENTALS_CACHE_TTL = 6 * 3600  # 6 hours


def get_fundamentals(symbol: str, market: str) -> dict:
    """On-demand fetch for a single symbol. Returns {} on any failure."""
    cache_key = f"fundamentals:{market}:{symbol}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    result = _fetch_one(market, symbol)
    _cache.set(cache_key, result, FUNDAMENTALS_CACHE_TTL)
    return result
```

- [ ] **Step 2: Update `stock_detail_service.py` to use `get_fundamentals`**

Find where `stock_detail_service.py` queries the `fundamentals` table (look for `Fundamentals` model or `db.query(Fundamentals...)`). Replace that DB query with a call to `get_fundamentals(symbol, market)`. The returned dict has the same keys as before: `market_cap`, `pe_ratio`, `forward_pe`, `dividend_yield`, `roe`, `book_value`. Construct `FundamentalsData` from those values.

Example replacement (adjust to match actual code):
```python
# Before (reading from DB):
# fund_row = db.query(Fundamentals).filter(Fundamentals.symbol_id == sym.symbol_id).first()

# After (on-demand fetch):
from app.services.fundamentals import get_fundamentals
fund_data = get_fundamentals(symbol, market)
fundamentals = FundamentalsData(
    market_cap=fund_data.get("market_cap"),
    pe_ratio=fund_data.get("pe_ratio"),
    forward_pe=fund_data.get("forward_pe"),
    dividend_yield=fund_data.get("dividend_yield"),
    roe=fund_data.get("roe"),
    book_value=fund_data.get("book_value"),
    fetched_at=datetime.utcnow(),
    fetch_status=fund_data.get("fetch_status", "partial"),
) if fund_data else None
```

- [ ] **Step 3: Run tests**

```
cd backend && ./venv/Scripts/python -m pytest -v
```
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/fundamentals.py backend/app/services/stock_detail_service.py
git commit -m "refactor: fundamentals fetched on-demand via InMemoryCache, no DB writes"
```

---

## Task 4: Remove macro + sentiment tables; slim down forecast training; clean main.py and scheduler

This is the biggest single task — it removes 4 cron jobs and 2 DB tables.

**Files:**
- Modify: `backend/app/services/forecast_training_service.py`
- Modify: `backend/app/services/scheduler.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `FEATURE_COLUMNS` drops 8 macro/fundamentals features → 15 remaining technical features

- [ ] **Step 1: Remove features from `forecast_training_service.py`**

Replace `FEATURE_COLUMNS` at the top of the file:

```python
# backend/app/services/forecast_training_service.py
FEATURE_COLUMNS = [
    "sma_20_ratio", "sma_50_ratio", "sma_200_ratio",
    "rsi_14", "macd_line", "macd_signal", "macd_hist", "bb_pct_b", "bb_bandwidth",
    "volatility_20d", "return_5d", "return_10d", "return_20d",
    "pct_change", "rel_volume",
]
```

Remove the import: `from app.services.macro_service import MACRO_SERIES, get_macro_history`

Remove functions: `_load_fundamentals_snapshot`, `add_fundamentals_features`, `add_macro_features`

Update `build_feature_frame` — remove the fundamentals and macro steps:

```python
def build_feature_frame(
    db: Session, market: str, symbol_ids: list[int] | None = None
) -> pd.DataFrame:
    price_df = _load_price_history(db, market, symbol_ids)
    if price_df.empty:
        return price_df
    price_df = add_technical_indicators(price_df)
    price_df = _add_scale_free_features(price_df)
    price_df["market"] = market
    return price_df
```

- [ ] **Step 2: Run forecast training tests to confirm they still pass**

```
cd backend && ./venv/Scripts/python -m pytest tests/test_forecast_training_service.py -v
```
Expected: all pass (the tests don't require macro/fundamentals data)

- [ ] **Step 3: Remove cron jobs from `scheduler.py`**

Remove these imports from `scheduler.py`:
```python
from app.services.fundamentals import refresh_fundamentals
from app.services.macro_service import refresh_macro_series
from app.services.sentiment_service import capture_daily_sentiment_snapshot
```

Remove functions: `_run_weekly_fundamentals_refresh`, `_run_daily_macro_refresh`, `_run_daily_sentiment_snapshot`

In `start_scheduler()`, remove these 6 `scheduler.add_job()` calls:
- `weekly_fundamentals_refresh_us`
- `weekly_fundamentals_refresh_in`
- `daily_macro_refresh`
- `daily_sentiment_snapshot_us`
- `daily_sentiment_snapshot_in`
- (keep: `us_daily_refresh`, `in_daily_refresh`, `weekly_us_universe_refresh`, `weekly_sector_refresh`, `weekly_forecast_training_us`, `weekly_forecast_training_in`, `catchup_watchdog`)

- [ ] **Step 4: Clean up `main.py`**

Remove these imports:
```python
from app.services.macro_service import backfill_macro_series, has_any_macro_data
```

Remove `_backfill_macro_if_empty()` function entirely.

Update `_train_forecast_model_if_none_exists` — remove the `has_macro` check. The function should poll only for `has_prices`:

```python
async def _train_forecast_model_if_none_exists(market: str) -> None:
    db = SessionLocal()
    try:
        has_active_model = (
            db.query(ForecastModel)
            .filter(ForecastModel.market == market, ForecastModel.status == "active")
            .first() is not None
        )
    finally:
        db.close()
    if has_active_model:
        return

    for _attempt in range(FORECAST_BOOTSTRAP_MAX_ATTEMPTS):
        db = SessionLocal()
        try:
            has_prices = (
                db.query(TradingCalendar).filter(TradingCalendar.market == market).first() is not None
            )
        finally:
            db.close()

        if has_prices:
            def _run() -> None:
                db = SessionLocal()
                try:
                    summary = run_weekly_training(db, market)
                    logger.info("Startup forecast training bootstrap for %s: %s", market, summary)
                finally:
                    db.close()
            await asyncio.to_thread(_run)
            return

        await asyncio.sleep(FORECAST_BOOTSTRAP_RETRY_SECONDS)

    logger.info(
        "Forecast training bootstrap for %s gave up waiting for data - deferring to the weekly cron",
        market,
    )
```

In `lifespan`, remove:
```python
asyncio.create_task(_backfill_macro_if_empty())
```

- [ ] **Step 5: Run all backend tests**

```
cd backend && ./venv/Scripts/python -m pytest -v
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/forecast_training_service.py \
        backend/app/services/scheduler.py \
        backend/app/main.py
git commit -m "refactor: remove macro/sentiment DB deps from forecast training; drop 6 cron jobs"
```

---

## Task 5: Remove the 4 ORM table classes; fix db_migrations.py

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/services/db_migrations.py`

**Interfaces:** None — these are purely deletions

- [ ] **Step 1: Remove ORM classes from `models.py`**

Delete the following class definitions entirely from `backend/app/models.py`:
- `NewsCache` (lines ~100–107)
- `Fundamentals` (lines ~109–135)
- `MacroSeries` (lines ~227–244)
- `NewsSentimentSnapshot` (lines ~245–268)

The file should retain: `Symbol`, `DailyMetric`, `TradingCalendar`, `RefreshLog`, `Watchlist`, `Holding`, `AlertRule`, `ForecastModel`, `AlertTrigger`.

- [ ] **Step 2: Remove `ensure_fundamentals_columns` from `db_migrations.py`**

In `backend/app/services/db_migrations.py`, delete the `ensure_fundamentals_columns` function and remove its call from `run_all_migrations`. The remaining migrations (`ensure_symbols_columns`, `ensure_holdings_columns`) operate on tables that still exist and are unaffected.

```python
def run_all_migrations(engine: Engine) -> None:
    ensure_symbols_columns(engine)
    ensure_holdings_columns(engine)
```

- [ ] **Step 3: Verify app starts without errors**

Check that no remaining service file imports the removed classes. Search for any remaining imports:

```bash
cd backend && grep -r "NewsCache\|MacroSeries\|NewsSentimentSnapshot\|from app.models import.*Fundamentals" app/
```
Expected: no matches (only `Fundamentals` reference left should be the deleted class itself — already gone).

- [ ] **Step 4: Run all tests**

```
cd backend && ./venv/Scripts/python -m pytest -v
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/services/db_migrations.py
git commit -m "chore: remove NewsCache, Fundamentals, MacroSeries, NewsSentimentSnapshot ORM tables"
```

---

## Task 6: Screener backend

**Files:**
- Create: `backend/app/services/screener_service.py`
- Create: `backend/app/routers/screener.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_screener.py`

**Interfaces:**
- Consumes: `_cache` from `cache.py`; `get_fundamentals` from `fundamentals.py`; DB session
- Produces: `GET /api/screener` → `ScreenerResponse`

- [ ] **Step 1: Add schemas**

Append to `backend/app/schemas.py`:

```python
class ScreenerItem(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    close: float | None = None
    pct_change: float | None = None
    volume: int | None = None
    rel_volume: float | None = None
    market_cap: float | None = None


class ScreenerResponse(BaseModel):
    market: Market
    date: date
    total: int
    items: list[ScreenerItem]
```

- [ ] **Step 2: Write failing test**

```python
# backend/tests/test_screener.py
from datetime import date as date_type
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Symbol, DailyMetric, TradingCalendar

client = TestClient(app)


def _seed(db: Session) -> None:
    sym = Symbol(market="US", symbol="AAPL", name="Apple", sector="Technology", is_active=1)
    db.add(sym)
    db.flush()
    today = date_type.today()
    db.add(TradingCalendar(market="US", trade_date=today))
    db.add(DailyMetric(
        symbol_id=sym.symbol_id, market="US", trade_date=today,
        close=150.0, pct_change=2.5, volume=1000000, rel_volume=1.2,
        avg_volume_20d=800000,
    ))
    db.commit()


def test_screener_returns_results(db: Session) -> None:
    _seed(db)
    resp = client.get("/api/screener?market=US")
    assert resp.status_code == 200
    body = resp.json()
    assert body["market"] == "US"
    assert isinstance(body["items"], list)


def test_screener_pct_change_filter(db: Session) -> None:
    _seed(db)
    resp = client.get("/api/screener?market=US&min_pct_change=3.0")
    assert resp.status_code == 200
    # AAPL has pct_change=2.5, below filter, so no results
    assert resp.json()["total"] == 0


def test_screener_invalid_market(db: Session) -> None:
    resp = client.get("/api/screener?market=XX")
    assert resp.status_code == 400
```

- [ ] **Step 3: Run tests to verify they fail**

```
cd backend && ./venv/Scripts/python -m pytest tests/test_screener.py -v
```
Expected: errors (no screener router registered yet)

- [ ] **Step 4: Implement `screener_service.py`**

```python
# backend/app/services/screener_service.py
from __future__ import annotations

from datetime import date
from typing import Literal

from sqlalchemy import text
from sqlalchemy.orm import Session


SortBy = Literal["pct_change", "volume", "rel_volume", "market_cap"]
MarketCapTier = Literal["small", "mid", "large"]

_MARKET_CAP_BOUNDS: dict[MarketCapTier, tuple[float | None, float | None]] = {
    "small": (None, 2e9),
    "mid": (2e9, 10e9),
    "large": (10e9, None),
}

_SORT_COL: dict[str, str] = {
    "pct_change": "dm.pct_change",
    "volume": "dm.volume",
    "rel_volume": "dm.rel_volume",
    "market_cap": "dm.close",  # proxy until fundamentals cache is consulted
}


def screen(
    db: Session,
    market: str,
    sector: str | None = None,
    min_pct_change: float | None = None,
    max_pct_change: float | None = None,
    min_rel_volume: float | None = None,
    market_cap_tier: MarketCapTier | None = None,
    min_pe: float | None = None,
    max_pe: float | None = None,
    sort_by: SortBy = "pct_change",
    limit: int = 50,
) -> tuple[list[dict], date | None]:
    """Returns (items, trade_date). Items are dicts matching ScreenerItem fields."""
    conditions = [
        "dm.market = :market",
        "s.is_active = 1",
        "dm.trade_date = (SELECT MAX(trade_date) FROM trading_calendar WHERE market = :market)",
        "dm.close IS NOT NULL",
    ]
    params: dict = {"market": market, "limit": min(limit, 200)}

    if sector:
        conditions.append("s.sector = :sector")
        params["sector"] = sector

    if min_pct_change is not None:
        conditions.append("dm.pct_change >= :min_pct")
        params["min_pct"] = min_pct_change

    if max_pct_change is not None:
        conditions.append("dm.pct_change <= :max_pct")
        params["max_pct"] = max_pct_change

    if min_rel_volume is not None:
        conditions.append("dm.rel_volume >= :min_relvol")
        params["min_relvol"] = min_rel_volume

    sort_col = _SORT_COL.get(sort_by, "dm.pct_change")
    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT s.symbol, s.name, s.sector,
               dm.close, dm.pct_change, dm.volume, dm.rel_volume, dm.trade_date
        FROM daily_metrics dm
        JOIN symbols s ON s.symbol_id = dm.symbol_id
        WHERE {where_clause}
        ORDER BY {sort_col} DESC NULLS LAST
        LIMIT :limit
    """
    rows = db.execute(text(sql), params).all()

    trade_date = rows[0].trade_date if rows else None

    # Post-filter fundamentals from in-memory cache.
    # We include symbols with no cache entry (unknowns) to avoid excluding
    # everything on a fresh start when the cache is cold.
    from app.services.fundamentals import get_fundamentals

    items = []
    for r in rows:
        fund = get_fundamentals(r.symbol, market) if (market_cap_tier or min_pe or max_pe) else {}

        market_cap = fund.get("market_cap")
        pe = fund.get("pe_ratio")

        if market_cap_tier and market_cap is not None:
            lo, hi = _MARKET_CAP_BOUNDS[market_cap_tier]
            if lo is not None and market_cap < lo:
                continue
            if hi is not None and market_cap >= hi:
                continue

        if min_pe is not None and pe is not None and pe < min_pe:
            continue
        if max_pe is not None and pe is not None and pe > max_pe:
            continue

        items.append({
            "symbol": r.symbol,
            "name": r.name,
            "sector": r.sector,
            "close": r.close,
            "pct_change": r.pct_change,
            "volume": r.volume,
            "rel_volume": r.rel_volume,
            "market_cap": market_cap,
        })

    return items, trade_date
```

- [ ] **Step 5: Implement `routers/screener.py`**

```python
# backend/app/routers/screener.py
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import ScreenerItem, ScreenerResponse
from app.services.screener_service import MarketCapTier, SortBy, screen

router = APIRouter(prefix="/api", tags=["screener"])

VALID_MARKETS = {"US", "IN"}


@router.get("/screener", response_model=ScreenerResponse)
def screener(
    market: str = Query(...),
    sector: str | None = Query(None),
    min_pct_change: float | None = Query(None),
    max_pct_change: float | None = Query(None),
    min_rel_volume: float | None = Query(None),
    market_cap_tier: MarketCapTier | None = Query(None),
    min_pe: float | None = Query(None),
    max_pe: float | None = Query(None),
    sort_by: SortBy = Query("pct_change"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ScreenerResponse:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")

    items, trade_date = screen(
        db, market,
        sector=sector,
        min_pct_change=min_pct_change,
        max_pct_change=max_pct_change,
        min_rel_volume=min_rel_volume,
        market_cap_tier=market_cap_tier,
        min_pe=min_pe,
        max_pe=max_pe,
        sort_by=sort_by,
        limit=limit,
    )

    if trade_date is None:
        raise HTTPException(status_code=404, detail="No trading data available for this market")

    return ScreenerResponse(
        market=market,
        date=trade_date,
        total=len(items),
        items=[ScreenerItem(**i) for i in items],
    )
```

- [ ] **Step 6: Register router in `main.py`**

In `backend/app/main.py`, add:
```python
from app.routers import screener
# ...
app.include_router(screener.router)
```

- [ ] **Step 7: Run tests**

```
cd backend && ./venv/Scripts/python -m pytest tests/test_screener.py -v
```
Expected: 3 passed

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/screener_service.py \
        backend/app/routers/screener.py \
        backend/app/schemas.py \
        backend/app/main.py \
        backend/tests/test_screener.py
git commit -m "feat: add /api/screener endpoint with dynamic SQL filters"
```

---

## Task 7: Earnings calendar backend

**Files:**
- Create: `backend/app/services/earnings_service.py`
- Create: `backend/app/routers/earnings.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_earnings.py`

**Interfaces:**
- Consumes: `_cache` from `cache.py`; yfinance
- Produces: `GET /api/earnings?market=US&symbols=AAPL,MSFT` → `EarningsResponse`

- [ ] **Step 1: Add schemas**

Append to `backend/app/schemas.py`:

```python
class EarningsItem(BaseModel):
    symbol: str
    name: str | None = None
    earnings_date: str  # ISO date string, e.g. "2026-07-29"
    eps_estimate: float | None = None


class EarningsResponse(BaseModel):
    items: list[EarningsItem]
```

- [ ] **Step 2: Write failing tests**

```python
# backend/tests/test_earnings.py
from unittest.mock import patch, MagicMock
import pandas as pd
from datetime import date as date_type

from app.services.earnings_service import get_earnings_for_symbols


def _mock_calendar(earnings_date: date_type | None):
    """Returns what yfinance Ticker.calendar looks like."""
    if earnings_date is None:
        return {}
    return {"Earnings Date": [pd.Timestamp(earnings_date)]}


def test_returns_upcoming_earnings():
    future_date = date_type(2027, 1, 15)
    with patch("yfinance.Ticker") as mock_ticker_cls:
        instance = MagicMock()
        instance.calendar = _mock_calendar(future_date)
        mock_ticker_cls.return_value = instance

        results = get_earnings_for_symbols(["AAPL"], "US")

    assert len(results) == 1
    assert results[0]["symbol"] == "AAPL"
    assert results[0]["earnings_date"] == "2027-01-15"


def test_skips_symbols_with_no_calendar():
    with patch("yfinance.Ticker") as mock_ticker_cls:
        instance = MagicMock()
        instance.calendar = {}
        mock_ticker_cls.return_value = instance

        results = get_earnings_for_symbols(["UNKNOWN"], "US")

    assert results == []


def test_skips_past_dates():
    past_date = date_type(2020, 1, 1)
    with patch("yfinance.Ticker") as mock_ticker_cls:
        instance = MagicMock()
        instance.calendar = _mock_calendar(past_date)
        mock_ticker_cls.return_value = instance

        results = get_earnings_for_symbols(["AAPL"], "US")

    assert results == []
```

- [ ] **Step 3: Run tests to verify they fail**

```
cd backend && ./venv/Scripts/python -m pytest tests/test_earnings.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.services.earnings_service'`

- [ ] **Step 4: Implement `earnings_service.py`**

```python
# backend/app/services/earnings_service.py
from __future__ import annotations

import logging
from datetime import date, datetime

import pandas as pd
import yfinance as yf

from app.services.cache import _cache

logger = logging.getLogger(__name__)

EARNINGS_CACHE_TTL = 6 * 3600  # 6 hours


def _yf_symbol(market: str, symbol: str) -> str:
    return f"{symbol}.NS" if market == "IN" else symbol


def _fetch_one(symbol: str, market: str) -> dict | None:
    """Returns {'symbol', 'earnings_date', 'eps_estimate'} or None."""
    try:
        ticker = yf.Ticker(_yf_symbol(market, symbol))
        cal = ticker.calendar
        if not cal:
            return None

        # cal is a dict: {'Earnings Date': [Timestamp, ...], 'EPS Estimate': X, ...}
        dates = cal.get("Earnings Date", [])
        if not dates:
            return None

        # Pick the nearest future date.
        today = date.today()
        future_dates = [
            d.date() if isinstance(d, (pd.Timestamp, datetime)) else d
            for d in dates
            if (d.date() if isinstance(d, (pd.Timestamp, datetime)) else d) >= today
        ]
        if not future_dates:
            return None

        next_date = min(future_dates)
        eps = cal.get("Earnings Average") or cal.get("EPS Estimate")
        try:
            eps = float(eps) if eps is not None else None
        except (TypeError, ValueError):
            eps = None

        return {
            "symbol": symbol,
            "earnings_date": next_date.isoformat(),
            "eps_estimate": eps,
        }
    except Exception:
        logger.debug("Earnings fetch failed for %s/%s", market, symbol)
        return None


def get_earnings_for_symbols(symbols: list[str], market: str) -> list[dict]:
    """Returns list of earnings dicts for symbols that have upcoming dates."""
    results = []
    for symbol in symbols:
        cache_key = f"earnings:{market}:{symbol}"
        cached = _cache.get(cache_key)
        if cached is not None:
            if cached:  # non-empty dict means a real result
                results.append(cached)
            continue

        data = _fetch_one(symbol, market)
        # Cache both hits and misses (None → empty dict to mark "checked")
        _cache.set(cache_key, data or {}, EARNINGS_CACHE_TTL)
        if data:
            results.append(data)

    return results
```

- [ ] **Step 5: Implement `routers/earnings.py`**

```python
# backend/app/routers/earnings.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import Depends

from app.deps import get_db
from app.schemas import EarningsItem, EarningsResponse
from app.services.earnings_service import get_earnings_for_symbols

router = APIRouter(prefix="/api", tags=["earnings"])

VALID_MARKETS = {"US", "IN"}


@router.get("/earnings", response_model=EarningsResponse)
def earnings(
    market: str = Query(...),
    symbols: str = Query(..., description="Comma-separated list of symbols, max 50"),
    db: Session = Depends(get_db),
) -> EarningsResponse:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:50]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="symbols must be a non-empty comma-separated list")

    # Resolve names from DB for the response.
    name_map: dict[str, str | None] = {}
    rows = db.execute(
        text("SELECT symbol, name FROM symbols WHERE market = :market AND symbol IN :syms"),
        {"market": market, "syms": tuple(symbol_list)},
    ).all()
    for r in rows:
        name_map[r.symbol] = r.name

    raw = get_earnings_for_symbols(symbol_list, market)
    items = [
        EarningsItem(
            symbol=r["symbol"],
            name=name_map.get(r["symbol"]),
            earnings_date=r["earnings_date"],
            eps_estimate=r.get("eps_estimate"),
        )
        for r in raw
    ]
    items.sort(key=lambda x: x.earnings_date)

    return EarningsResponse(items=items)
```

- [ ] **Step 6: Register router in `main.py`**

```python
from app.routers import earnings
# ...
app.include_router(earnings.router)
```

- [ ] **Step 7: Run tests**

```
cd backend && ./venv/Scripts/python -m pytest tests/test_earnings.py -v
```
Expected: 3 passed

- [ ] **Step 8: Run full test suite**

```
cd backend && ./venv/Scripts/python -m pytest -v
```
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/earnings_service.py \
        backend/app/routers/earnings.py \
        backend/app/schemas.py \
        backend/app/main.py \
        backend/tests/test_earnings.py
git commit -m "feat: add /api/earnings endpoint with yfinance calendar + InMemoryCache"
```

---

## Task 8: Frontend staleTime tuning + prefetch on hover

**Files:**
- Modify: `frontend/src/hooks/useTradingDays.ts`
- Modify: `frontend/src/hooks/useRankings.ts`
- Modify: `frontend/src/hooks/useGlobalMarkets.ts`
- Modify: `frontend/src/hooks/useHeatmap.ts`
- Modify: `frontend/src/hooks/usePersistence.ts`
- Modify: `frontend/src/hooks/useStockDetail.ts`
- Modify: `frontend/src/hooks/useWatchlist.ts`
- Modify: `frontend/src/components/rankings/RankingTable.tsx`
- Modify: `frontend/src/components/watchlist/WatchlistTable.tsx`

**Interfaces:** None (internals only)

- [ ] **Step 1: Add staleTime to all hooks**

For each hook file, add `staleTime` to the `useQuery` call. The pattern is identical each time — add one property:

`useTradingDays.ts`:
```typescript
staleTime: 10 * 60 * 1000,  // 10 min
```

`useRankings.ts`:
```typescript
staleTime: 5 * 60 * 1000,  // 5 min
```

`useGlobalMarkets.ts`:
```typescript
staleTime: 3 * 60 * 1000,  // 3 min
```

`useHeatmap.ts`:
```typescript
staleTime: 5 * 60 * 1000,  // 5 min
```

`usePersistence.ts`:
```typescript
staleTime: 5 * 60 * 1000,  // 5 min
```

`useStockDetail.ts`:
```typescript
staleTime: 2 * 60 * 1000,  // 2 min
```

`useWatchlist.ts` (`useWatchlist` query only, not the mutations):
```typescript
staleTime: 30 * 1000,  // 30 sec
```

- [ ] **Step 2: Add prefetch on hover to `RankingTable.tsx`**

Add `useQueryClient` import. Add a debounce ref. Add `onMouseEnter` to the `<tr>`:

```typescript
// At top of RankingTable.tsx, add:
import { useQueryClient } from "@tanstack/react-query";
import { getStockDetail } from "../../api/client";

// Inside RankingTable component, add:
const queryClient = useQueryClient();
const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

function handleMouseEnter(symbol: string) {
  prefetchTimer.current = setTimeout(() => {
    queryClient.prefetchQuery({
      queryKey: ["stock-detail", market, symbol],
      queryFn: () => getStockDetail(market, symbol),
      staleTime: 2 * 60 * 1000,
    });
  }, 200);
}

function handleMouseLeave() {
  if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
}
```

Add `useRef` to the React import. Add `onMouseEnter={() => handleMouseEnter(item.symbol)} onMouseLeave={handleMouseLeave}` to the desktop `<tr>` element (the one that already has `onClick`).

- [ ] **Step 3: Add same prefetch to `WatchlistTable.tsx`**

Apply the same pattern as Step 2 to the watchlist table rows — same imports, same `handleMouseEnter`/`handleMouseLeave`, same 200ms debounce.

- [ ] **Step 4: Type-check**

```
cd frontend && npm run typecheck
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/ \
        frontend/src/components/rankings/RankingTable.tsx \
        frontend/src/components/watchlist/WatchlistTable.tsx
git commit -m "perf: add staleTime to all queries; prefetch stock detail on row hover"
```

---

## Task 9: Optimistic mutations (watchlist, alerts, holdings)

**Files:**
- Modify: `frontend/src/hooks/useWatchlist.ts`
- Modify: `frontend/src/hooks/useAlerts.ts`
- Modify: `frontend/src/hooks/useHoldings.ts`

**Interfaces:** Exported hook signatures unchanged; internal mutation behavior changes

- [ ] **Step 1: Add optimistic add/remove to `useWatchlist.ts`**

Replace `useWatchlistMutations`:

```typescript
export function useWatchlistMutations() {
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: ({ market, symbol }: { market: Market; symbol: string }) =>
      addToWatchlist(market, symbol),
    onMutate: async ({ market, symbol }) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const prev = queryClient.getQueryData<WatchlistResponse>(["watchlist", "ALL"]);
      queryClient.setQueryData<WatchlistResponse>(["watchlist", "ALL"], (old) => {
        if (!old) return old;
        const optimistic: WatchlistItem = {
          id: -1, market, symbol, name: null,
          added_at: new Date().toISOString(), close: null, pct_change: null,
        };
        return { items: [...old.items, optimistic] };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["watchlist", "ALL"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const remove = useMutation({
    mutationFn: ({ market, symbol }: { market: Market; symbol: string }) =>
      removeFromWatchlist(market, symbol),
    onMutate: async ({ symbol }) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const prev = queryClient.getQueryData<WatchlistResponse>(["watchlist", "ALL"]);
      queryClient.setQueryData<WatchlistResponse>(["watchlist", "ALL"], (old) => {
        if (!old) return old;
        return { items: old.items.filter((i) => i.symbol !== symbol) };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["watchlist", "ALL"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return { add, remove };
}
```

Add the needed imports: `import type { WatchlistItem, WatchlistResponse } from "../api/types";`

- [ ] **Step 2: Add optimistic toggle to `useAlerts.ts`**

Replace `setActive` inside `useAlertRuleMutations`:

```typescript
const setActive = useMutation({
  mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
    setAlertRuleActive(id, isActive),
  onMutate: async ({ id, isActive }) => {
    await queryClient.cancelQueries({ queryKey: ["alert-rules"] });
    const prev = queryClient.getQueryData(["alert-rules", "ALL"]);
    queryClient.setQueriesData<AlertRulesResponse>(
      { queryKey: ["alert-rules"] },
      (old) => {
        if (!old) return old;
        return {
          items: old.items.map((r) =>
            r.id === id ? { ...r, is_active: isActive } : r
          ),
        };
      }
    );
    return { prev };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(["alert-rules", "ALL"], ctx.prev);
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] }),
});
```

Add import: `import type { AlertRulesResponse } from "../api/types";`

- [ ] **Step 3: Add optimistic delete to `useHoldings.ts`**

Replace `remove` inside `useHoldingsMutations`:

```typescript
const remove = useMutation({
  mutationFn: (id: number) => deleteHolding(id),
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ["holdings"] });
    const prev = queryClient.getQueryData(["holdings"]);
    queryClient.setQueryData<HoldingsResponse>(["holdings"], (old) => {
      if (!old) return old;
      return { items: old.items.filter((h) => h.id !== id) };
    });
    return { prev };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(["holdings"], ctx.prev);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["holdings"] });
    queryClient.invalidateQueries({ queryKey: ["holdings-summary"] });
  },
});
```

Add import: `import type { HoldingsResponse } from "../api/types";`

- [ ] **Step 4: Type-check**

```
cd frontend && npm run typecheck
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useWatchlist.ts \
        frontend/src/hooks/useAlerts.ts \
        frontend/src/hooks/useHoldings.ts
git commit -m "perf: optimistic mutations for watchlist, alert toggles, and holding deletes"
```

---

## Task 10: Visual design refresh

**Files:**
- Modify: `frontend/src/components/layout/NavBar.tsx`
- Modify: `frontend/src/components/layout/BottomTabBar.tsx`
- Modify: `frontend/src/components/rankings/RankingTable.tsx`
- Create: `frontend/src/components/common/EmptyState.tsx`
- Modify: `frontend/src/pages/WatchlistPage.tsx`
- Modify: `frontend/src/pages/PortfolioPage.tsx`
- Modify: `frontend/src/pages/AlertsPage.tsx`

**Interfaces:**
- Produces: `EmptyState` component with props `{ icon: React.ReactNode; title: string; description: string; action?: { label: string; onClick: () => void } }`

- [ ] **Step 1: Add backdrop blur to NavBar**

In `NavBar.tsx` line 18, change the `<header>` className from:
```
"border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
```
to:
```
"sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90"
```

- [ ] **Step 2: Add dot indicator to BottomTabBar active tab**

In `BottomTabBar.tsx`, update the `Tab` component to show a dot when active:

```typescript
function Tab({ to, label, end, children }: { to: string; label: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
          isActive ? "text-cyan-600 dark:text-cyan-400" : "text-slate-500 dark:text-slate-400"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {children}
          {label}
          <span className={`h-1 w-1 rounded-full transition-opacity ${isActive ? "bg-cyan-500 opacity-100" : "opacity-0"}`} />
        </>
      )}
    </NavLink>
  );
}
```

- [ ] **Step 3: Typography — tighten page titles and table row padding**

In every page file (`DashboardPage`, `RankingsPage`, `HeatmapPage`, `WatchlistPage`, `PortfolioPage`, `AlertsPage`, `MarketNewsPage`, `SettingsPage`), change the `<h2>` from `font-mono text-lg` to `text-base font-semibold font-sans`.

In `RankingTable.tsx` table headers, change `font-mono uppercase tracking-wide` labels (`#`, `Symbol`, `Name` etc.) to just `text-xs text-slate-500 dark:text-slate-400` — drop the `font-mono` from the non-numeric headers.

Table row padding: verify `py-2` is used (it already is in `RankingTable`). If any table uses `py-3`, change to `py-2`.

- [ ] **Step 3a: Card surfaces — unify card styling**

In `DashboardPage` sections that wrap content in a div without a border/background, add:
```
className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
```
Apply the same to `GlobalMarketsTable`'s wrapper div and `PortfolioSummaryCards`. Verify `KeyStatsGrid` and `DetailsPanel` on StockDetailPage already have a consistent card wrapper; add if missing.

- [ ] **Step 4: Fix positive/negative color in `RankingTable.tsx`**

Note: `cursor-pointer` and hover styles on table rows already exist in the current code — skip that change.

Change `pctClassOf`:
```typescript
function pctClassOf(pct: number | null): string {
  return pct === null
    ? "text-slate-400"
    : pct >= 0
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";
}
```
(was `text-emerald-600 dark:text-emerald-400`)

- [ ] **Step 4: Create `EmptyState.tsx`**

```typescript
// frontend/src/components/common/EmptyState.tsx
interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Use EmptyState in WatchlistPage, PortfolioPage, AlertsPage**

In `WatchlistPage.tsx`, find the block that renders when `watchlist.data.items.length === 0` (or add a check before rendering the table). Import and use `EmptyState`:

```typescript
import { EmptyState } from "../components/common/EmptyState";

// When watchlist is empty:
{watchlist.data && watchlist.data.items.length === 0 && (
  <EmptyState
    icon={<svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>}
    title="Your watchlist is empty"
    description="No stocks in your watchlist yet. Search above to add one."
  />
)}
```

Apply the same pattern in `PortfolioPage.tsx` ("No holdings tracked yet. Add your first position.") and `AlertsPage.tsx` ("No alert rules set. Create one from any stock's detail page.").

- [ ] **Step 6: Type-check and build**

```
cd frontend && npm run typecheck && npm run build
```
Expected: 0 errors, build succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ frontend/src/pages/WatchlistPage.tsx \
        frontend/src/pages/PortfolioPage.tsx frontend/src/pages/AlertsPage.tsx
git commit -m "style: NavBar blur, BottomTabBar dot, green/red colors, EmptyState component"
```

---

## Task 11: Technical indicators frontend

**Files:**
- Create: `frontend/src/lib/indicators.ts`
- Modify: `frontend/src/components/stock-detail/PriceVolumeChart.tsx`
- Modify: `frontend/src/pages/StockDetailPage.tsx`

**Interfaces:**
- Produces: `calcRSI(closes, period?) -> (number|null)[]`, `calcMACD(closes, fast?, slow?, signal?) -> {macd, signal, histogram}`, `calcBollingerBands(closes, period?, stdDev?) -> {upper, middle, lower}`
- `PriceVolumeChart` gains optional prop `activeIndicators: Set<'rsi' | 'macd' | 'bb'>`

- [ ] **Step 1: Create `indicators.ts`**

```typescript
// frontend/src/lib/indicators.ts

export function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) avgGain += delta; else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const delta = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(0, delta)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -delta)) / period;
    }
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function calcMACD(
  closes: number[],
  fast = 12, slow = 26, signal = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const n = closes.length;
  const nulls = () => new Array<number | null>(n).fill(null);
  if (n < slow + signal) return { macd: nulls(), signal: nulls(), histogram: nulls() };

  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  const macdLine: (number | null)[] = closes.map((_, i) =>
    i >= slow - 1 ? fastEma[i] - slowEma[i] : null
  );

  const macdValues = macdLine.filter((v): v is number => v !== null);
  const sigEma = ema(macdValues, signal);

  const signalLine: (number | null)[] = nulls();
  const histogram: (number | null)[] = nulls();

  let sigIdx = 0;
  for (let i = slow - 1; i < n; i++) {
    const offset = i - (slow - 1);
    if (offset >= signal - 1) {
      signalLine[i] = sigEma[sigIdx];
      histogram[i] = (macdLine[i] as number) - sigEma[sigIdx];
      sigIdx++;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

export function calcBollingerBands(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const n = closes.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const middle: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    middle[i] = mean;
    upper[i] = mean + stdDev * sd;
    lower[i] = mean - stdDev * sd;
  }
  return { upper, middle, lower };
}
```

- [ ] **Step 2: Update `PriceVolumeChart.tsx` to accept and render indicators**

The chart uses a single `lightweight-charts` instance. RSI and MACD need separate chart instances (v5 removed multi-pane API). Create three stacked divs, three chart instances, synced time ranges.

Add to the Props interface:
```typescript
activeIndicators?: Set<'rsi' | 'macd' | 'bb'>;
```

Add RSI and MACD chart refs alongside the existing chart:
```typescript
const rsiContainerRef = useRef<HTMLDivElement>(null);
const macdContainerRef = useRef<HTMLDivElement>(null);
const rsiChartRef = useRef<IChartApi | null>(null);
const macdChartRef = useRef<IChartApi | null>(null);
```

In the `useEffect`, after the main chart is created, compute indicators from `points` closes:
```typescript
import { calcRSI, calcMACD, calcBollingerBands } from "../../lib/indicators";
import { AreaSeries } from "lightweight-charts";

// After main chart setup, inside useEffect:
const closes = points.map(p => p.close ?? 0);

// Build a date→index lookup once — used by BB, RSI, and MACD to avoid O(n²) indexOf calls.
const dateToIdx = new Map(points.map((p, i) => [p.trade_date, i]));

if (activeIndicators?.has('bb')) {
  const bb = calcBollingerBands(closes);
  const upperSeries = chart.addSeries(LineSeries, { priceScaleId: "right", color: "#94a3b8", lineWidth: 1, lineStyle: 2 });
  const lowerSeries = chart.addSeries(LineSeries, { priceScaleId: "right", color: "#94a3b8", lineWidth: 1, lineStyle: 2 });
  upperSeries.setData(
    visiblePoints
      .map((p) => ({ time: toUtcTimestamp(p.trade_date), value: bb.upper[dateToIdx.get(p.trade_date)!] ?? null }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value !== null)
  );
  lowerSeries.setData(
    visiblePoints
      .map((p) => ({ time: toUtcTimestamp(p.trade_date), value: bb.lower[dateToIdx.get(p.trade_date)!] ?? null }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value !== null)
  );
}

if (activeIndicators?.has('rsi') && rsiContainerRef.current) {
  const rsiChart = createChart(rsiContainerRef.current, {
    ...chartOptions, height: 100,
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
  });
  rsiChartRef.current = rsiChart;
  const rsiValues = calcRSI(closes);
  const rsiSeries = rsiChart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1 });
  rsiSeries.setData(
    visiblePoints.map((p) => ({ time: toUtcTimestamp(p.trade_date), value: rsiValues[points.indexOf(p)] ?? 50 }))
      .filter((_, i) => rsiValues[points.indexOf(visiblePoints[i])] !== null)
  );
  // Dashed lines at 70 and 30
  rsiChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (range) chart.timeScale().setVisibleRange(range);
  });
}

if (activeIndicators?.has('macd') && macdContainerRef.current) {
  const macdChart = createChart(macdContainerRef.current, {
    layout: {
      background: { color: "transparent" },
      textColor: isDark ? "#cbd5e1" : "#475569",
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    },
    grid: {
      vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
      horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
    },
    width: macdContainerRef.current.clientWidth,
    height: 100,
    timeScale: { borderVisible: false },
    rightPriceScale: { borderVisible: false },
  });
  macdChartRef.current = macdChart;

  // Build date→index map so we can look up values for visible points.
  const dateToIdx = new Map(points.map((p, i) => [p.trade_date, i]));
  const { macd: macdVals, signal: sigVals, histogram: histVals } = calcMACD(closes);

  const histSeries = macdChart.addSeries(HistogramSeries, { color: "#0891b2" });
  histSeries.setData(
    visiblePoints
      .map((p) => ({ time: toUtcTimestamp(p.trade_date), value: histVals[dateToIdx.get(p.trade_date)!] ?? 0 }))
      .filter((d) => d.value !== 0)
  );

  const macdLineSeries = macdChart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1 });
  macdLineSeries.setData(
    visiblePoints
      .map((p) => ({ time: toUtcTimestamp(p.trade_date), value: macdVals[dateToIdx.get(p.trade_date)!] ?? null }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value !== null)
  );

  const sigLineSeries = macdChart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1 });
  sigLineSeries.setData(
    visiblePoints
      .map((p) => ({ time: toUtcTimestamp(p.trade_date), value: sigVals[dateToIdx.get(p.trade_date)!] ?? null }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value !== null)
  );

  macdChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (range) chart.timeScale().setVisibleRange(range);
  });
}
```

Add the RSI/MACD divs in the JSX:
```tsx
<div ref={containerRef} />
{activeIndicators?.has('rsi') && <div ref={rsiContainerRef} className="mt-1" />}
{activeIndicators?.has('macd') && <div ref={macdContainerRef} className="mt-1" />}
```

Clean up RSI/MACD charts in the cleanup function.

Note: The BB implementation above has an index lookup bug — fix by building a date→index map for `points` before the effect runs.

- [ ] **Step 3: Add indicator toggle buttons to `StockDetailPage.tsx`**

Add state above the range buttons:
```typescript
const [activeIndicators, setActiveIndicators] = useState<Set<'rsi' | 'macd' | 'bb'>>(new Set());

function toggleIndicator(ind: 'rsi' | 'macd' | 'bb') {
  setActiveIndicators(prev => {
    const next = new Set(prev);
    if (next.has(ind)) next.delete(ind); else next.add(ind);
    return next;
  });
}
```

Add toggle buttons between the range selector and the chart:
```tsx
{!isIntraday && (
  <div className="mb-2 flex gap-1">
    {(['bb', 'rsi', 'macd'] as const).map((ind) => (
      <button
        key={ind}
        onClick={() => toggleIndicator(ind)}
        className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase ${
          activeIndicators.has(ind)
            ? "bg-violet-600 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        }`}
      >
        {ind === 'bb' ? 'Bollinger' : ind.toUpperCase()}
      </button>
    ))}
  </div>
)}
```

Pass `activeIndicators` to `PriceVolumeChart`:
```tsx
<PriceVolumeChart points={history.points} visibleDays={days} activeIndicators={activeIndicators} />
```

- [ ] **Step 4: Type-check and build**

```
cd frontend && npm run typecheck && npm run build
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/indicators.ts \
        frontend/src/components/stock-detail/PriceVolumeChart.tsx \
        frontend/src/pages/StockDetailPage.tsx
git commit -m "feat: technical indicators (RSI, MACD, Bollinger Bands) on price chart"
```

---

## Task 12: Screener frontend

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/hooks/useScreener.ts`
- Create: `frontend/src/components/screener/FilterPanel.tsx`
- Create: `frontend/src/components/screener/ScreenerTable.tsx`
- Create: `frontend/src/pages/ScreenerPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/BottomTabBar.tsx`
- Modify: `frontend/src/components/layout/NavBar.tsx`

**Interfaces:**
- Produces: `useScreener(params) -> UseQueryResult<ScreenerResponse>`; route `/screener`

- [ ] **Step 1: Add types to `api/types.ts`**

```typescript
// Append to frontend/src/api/types.ts
export interface ScreenerItem {
  symbol: string;
  name: string | null;
  sector: string | null;
  close: number | null;
  pct_change: number | null;
  volume: number | null;
  rel_volume: number | null;
  market_cap: number | null;
}

export interface ScreenerResponse {
  market: Market;
  date: string;
  total: number;
  items: ScreenerItem[];
}

export type ScreenerSortBy = 'pct_change' | 'volume' | 'rel_volume' | 'market_cap';
export type MarketCapTier = 'small' | 'mid' | 'large';

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
}
```

- [ ] **Step 2: Add `getScreener` to `api/client.ts`**

```typescript
// Append to frontend/src/api/client.ts
import type { ScreenerParams, ScreenerResponse } from "./types";

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
```

- [ ] **Step 3: Create `useScreener.ts`**

```typescript
// frontend/src/hooks/useScreener.ts
import { useQuery } from "@tanstack/react-query";
import { getScreener } from "../api/client";
import type { ScreenerParams } from "../api/types";

export function useScreener(params: ScreenerParams) {
  return useQuery({
    queryKey: ["screener", params],
    queryFn: () => getScreener(params),
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Create `FilterPanel.tsx`**

```typescript
// frontend/src/components/screener/FilterPanel.tsx
import type { Market, ScreenerParams, MarketCapTier, ScreenerSortBy } from "../../api/types";

interface Props {
  market: Market;
  filters: Omit<ScreenerParams, "market">;
  onChange: (f: Omit<ScreenerParams, "market">) => void;
  sectors: string[];
}

export function FilterPanel({ market: _market, filters, onChange, sectors }: Props) {
  function set<K extends keyof typeof filters>(key: K, value: typeof filters[K]) {
    onChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filters</h3>

      {sectors.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sector</label>
          <select
            value={filters.sector ?? ""}
            onChange={(e) => set("sector", e.target.value || undefined)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">All sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Min % Change</label>
          <input type="number" step="0.1" value={filters.min_pct_change ?? ""}
            onChange={(e) => set("min_pct_change", e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Max % Change</label>
          <input type="number" step="0.1" value={filters.max_pct_change ?? ""}
            onChange={(e) => set("max_pct_change", e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Min Rel. Volume</label>
        <input type="number" step="0.1" min="0" value={filters.min_rel_volume ?? ""}
          onChange={(e) => set("min_rel_volume", e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Market Cap</label>
        <div className="flex gap-1">
          {(["small", "mid", "large"] as MarketCapTier[]).map((t) => (
            <button key={t} onClick={() => set("market_cap_tier", filters.market_cap_tier === t ? undefined : t)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize ${
                filters.market_cap_tier === t
                  ? "bg-cyan-600 text-white"
                  : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
              }`}
            >{t}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Sort By</label>
        <select value={filters.sort_by ?? "pct_change"}
          onChange={(e) => set("sort_by", e.target.value as ScreenerSortBy)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="pct_change">% Change</option>
          <option value="volume">Volume</option>
          <option value="rel_volume">Rel. Volume</option>
          <option value="market_cap">Market Cap</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `ScreenerTable.tsx`**

```typescript
// frontend/src/components/screener/ScreenerTable.tsx
import { useNavigate } from "react-router-dom";
import type { Market, ScreenerItem } from "../../api/types";

function fmt(v: number | null, d = 2) {
  return v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtMCap(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function pctClass(v: number | null) {
  return v == null ? "text-slate-400" : v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

export function ScreenerTable({ items, market }: { items: ScreenerItem[]; market: Market }) {
  const navigate = useNavigate();
  if (items.length === 0) return (
    <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No stocks matched your filters.</p>
  );

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            {["Symbol", "Name", "Sector", "Close", "% Chg", "Volume", "Rel Vol", "Mkt Cap"].map(h => (
              <th key={h} className="px-3 py-2 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <tr key={item.symbol} onClick={() => navigate(`/stock/${market}/${item.symbol}`)}
              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">{item.symbol}</td>
              <td className="max-w-[160px] truncate px-3 py-2 text-slate-500 dark:text-slate-400">{item.name ?? "—"}</td>
              <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500">{item.sector ?? "—"}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{fmt(item.close)}</td>
              <td className={`px-3 py-2 font-mono tabular-nums font-medium ${pctClass(item.pct_change)}`}>
                {item.pct_change == null ? "—" : `${item.pct_change >= 0 ? "+" : ""}${fmt(item.pct_change)}%`}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums">{item.volume?.toLocaleString() ?? "—"}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{item.rel_volume == null ? "—" : `${fmt(item.rel_volume)}x`}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{fmtMCap(item.market_cap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Create `ScreenerPage.tsx`**

```typescript
// frontend/src/pages/ScreenerPage.tsx
import { useState } from "react";
import { useMarket } from "../context/MarketContext";
import { useScreener } from "../hooks/useScreener";
import { FilterPanel } from "../components/screener/FilterPanel";
import { ScreenerTable } from "../components/screener/ScreenerTable";
import { SkeletonTable } from "../components/common/Skeleton";
import type { ScreenerParams } from "../api/types";

export function ScreenerPage() {
  const { market } = useMarket();
  const [filters, setFilters] = useState<Omit<ScreenerParams, "market">>({});
  const { data, isLoading } = useScreener({ market, ...filters, limit: 100 });

  // Derive available sectors from results for the filter dropdown.
  const sectors = [...new Set(data?.items.map(i => i.sector).filter(Boolean) as string[])].sort();

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <h2 className="mb-6 text-base font-semibold text-slate-900 dark:text-slate-100">Stock Screener</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <FilterPanel market={market} filters={filters} onChange={setFilters} sectors={sectors} />
        </div>
        <div className="lg:col-span-3">
          {data && (
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {data.total} stock{data.total === 1 ? "" : "s"} matched · {data.date}
            </p>
          )}
          {isLoading && <SkeletonTable />}
          {data && <ScreenerTable items={data.items} market={market} />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add route in `App.tsx`**

```typescript
const ScreenerPage = lazy(() => import("./pages/ScreenerPage").then((m) => ({ default: m.ScreenerPage })));
// Inside Routes:
<Route path="/screener" element={<ScreenerPage />} />
```

- [ ] **Step 8: Add Screener to `BottomTabBar.tsx` and `NavBar.tsx`**

In `BottomTabBar.tsx`, add `{ to: "/screener", label: "Screener" }` to `MORE_LINKS` (alongside existing Heatmap, News, Alerts, Settings).

In `NavBar.tsx`, add a `<NavLink to="/screener">` in the nav list alongside Rankings, Watchlist, etc.

- [ ] **Step 9: Type-check and build**

```
cd frontend && npm run typecheck && npm run build
```
Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts \
        frontend/src/hooks/useScreener.ts \
        frontend/src/components/screener/ \
        frontend/src/pages/ScreenerPage.tsx \
        frontend/src/App.tsx \
        frontend/src/components/layout/
git commit -m "feat: stock screener page with sector/pct/volume/market-cap filters"
```

---

## Task 13: Earnings frontend

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/hooks/useEarnings.ts`
- Modify: `frontend/src/components/stock-detail/KeyStatsGrid.tsx`
- Create: `frontend/src/components/dashboard/EarningsCalendarWidget.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- Produces: `useEarnings(market, symbols) -> UseQueryResult<EarningsResponse>`

- [ ] **Step 1: Add earnings types to `api/types.ts`**

```typescript
// Append to frontend/src/api/types.ts
export interface EarningsItem {
  symbol: string;
  name: string | null;
  earnings_date: string;  // "2026-07-29"
  eps_estimate: number | null;
}

export interface EarningsResponse {
  items: EarningsItem[];
}
```

- [ ] **Step 2: Add `getEarnings` to `api/client.ts`**

```typescript
// Append to frontend/src/api/client.ts
import type { EarningsResponse } from "./types";

export function getEarnings(market: Market, symbols: string[]): Promise<EarningsResponse> {
  return request(`/api/earnings?market=${market}&symbols=${symbols.join(",")}`);
}
```

- [ ] **Step 3: Create `useEarnings.ts`**

```typescript
// frontend/src/hooks/useEarnings.ts
import { useQuery } from "@tanstack/react-query";
import { getEarnings } from "../api/client";
import type { Market } from "../api/types";

export function useEarnings(market: Market, symbols: string[]) {
  return useQuery({
    queryKey: ["earnings", market, symbols.slice().sort().join(",")],
    queryFn: () => getEarnings(market, symbols),
    enabled: symbols.length > 0,
    staleTime: 6 * 60 * 60 * 1000,  // 6 hours
  });
}
```

- [ ] **Step 4: Add earnings badge to `KeyStatsGrid.tsx`**

Import `useEarnings` and call it for the current symbol. Find where the stat grid is rendered and append an "Earnings" cell if the next earnings date is within 60 days:

```typescript
import { useEarnings } from "../../hooks/useEarnings";

// Inside KeyStatsGrid (receives market + symbol as props — add these if missing):
const { data: earnings } = useEarnings(market, [symbol]);
const nextEarnings = earnings?.items[0];
const daysToEarnings = nextEarnings
  ? Math.ceil((new Date(nextEarnings.earnings_date).getTime() - Date.now()) / 86400000)
  : null;

// Add to the stat grid, only if within 60 days:
{daysToEarnings !== null && daysToEarnings <= 60 && (
  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
    <p className="text-xs text-amber-600 dark:text-amber-400">Next Earnings</p>
    <p className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-300">
      {nextEarnings!.earnings_date} <span className="text-xs font-normal">({daysToEarnings}d)</span>
    </p>
  </div>
)}
```

Note: `KeyStatsGrid` currently receives `detail: StockDetailResponse`. Check its actual props and add `market` + `symbol` as additional props if not already present. Update `StockDetailPage.tsx` to pass them.

- [ ] **Step 5: Create `EarningsCalendarWidget.tsx`**

```typescript
// frontend/src/components/dashboard/EarningsCalendarWidget.tsx
import { Link } from "react-router-dom";
import { useEarnings } from "../../hooks/useEarnings";
import { useWatchlist } from "../../hooks/useWatchlist";
import type { Market } from "../../api/types";

export function EarningsCalendarWidget({ market }: { market: Market }) {
  const { data: watchlist } = useWatchlist(market);
  const symbols = watchlist?.items.map((i) => i.symbol) ?? [];
  const { data: earnings, isLoading } = useEarnings(market, symbols);

  const upcoming = (earnings?.items ?? [])
    .filter((e) => {
      const days = Math.ceil((new Date(e.earnings_date).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 30;
    })
    .slice(0, 10);

  if (isLoading) return null;
  if (symbols.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-semibold font-sans uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Upcoming Earnings
      </h3>
      {upcoming.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No earnings in your watchlist in the next 30 days.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.symbol} className="flex items-center justify-between">
              <Link to={`/stock/${market}/${e.symbol}`}
                className="font-mono text-sm font-medium text-cyan-600 hover:underline dark:text-cyan-400">
                {e.symbol}
              </Link>
              <span className="font-mono text-xs text-slate-500">{e.earnings_date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add widget to `DashboardPage.tsx`**

In `DashboardPage.tsx`, add `<EarningsCalendarWidget market={market} />` below the `GlobalMarketsTable` in the right column:

```typescript
import { EarningsCalendarWidget } from "../components/dashboard/EarningsCalendarWidget";

// In JSX, right column:
<div className="lg:col-span-1 space-y-6">
  <GlobalMarketsTable />
  <EarningsCalendarWidget market={market} />
</div>
```

- [ ] **Step 7: Type-check and build**

```
cd frontend && npm run typecheck && npm run build
```
Expected: 0 errors

- [ ] **Step 8: Run full backend test suite one final time**

```
cd backend && ./venv/Scripts/python -m pytest -v
```
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts \
        frontend/src/hooks/useEarnings.ts \
        frontend/src/components/stock-detail/KeyStatsGrid.tsx \
        frontend/src/components/dashboard/EarningsCalendarWidget.tsx \
        frontend/src/pages/DashboardPage.tsx
git commit -m "feat: earnings calendar — stock detail badge and dashboard widget"
```
