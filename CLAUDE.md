# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavioral Guidelines

**Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them. Push back when a simpler approach exists. Stop and ask when something is unclear.

**Simplicity first.** Minimum code that solves the problem. No speculative features, abstractions, or flexibility that wasn't requested. If you write 200 lines and it could be 50, rewrite it.

**Surgical changes.** Touch only what you must. Don't improve adjacent code, comments, or formatting. Match existing style. Remove only imports/variables made unused by *your* changes.

**Goal-driven execution.** For multi-step tasks, state a brief plan with verifiable steps before implementing.

---

## Commands

### Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/pip install -r requirements.txt
./venv/Scripts/python scripts/init_db.py                          # Create tables (idempotent)
./venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

API docs: `http://127.0.0.1:8001/docs`

```bash
# Run tests
./venv/Scripts/python -m pytest
./venv/Scripts/python -m pytest tests/test_computation.py         # Single test file

# Manual data ops
./venv/Scripts/python scripts/run_backfill.py --market US|IN|BOTH [--days N]
./venv/Scripts/python scripts/fetch_us_once.py
./venv/Scripts/python scripts/fetch_india_bhavcopy_once.py
./venv/Scripts/python scripts/refresh_sector_once.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # Dev server at http://localhost:5173
npm run build        # TypeScript compile + Vite bundle → dist/
npm run typecheck    # tsc -p tsconfig.app.json (must use this flag, not bare tsc --noEmit)
npm run lint         # oxlint
npm run preview      # Serve built dist/ locally
```

### Docker (full stack)

```bash
docker compose up --build -d       # Frontend :5173, Backend :8010
docker compose logs -f backend     # Watch backfill progress
docker compose down -v             # Wipe database volume
```

---

## Architecture

### What the app does

Self-hosted stock market tracker for **US** (S&P 500 + Nasdaq-100, ~600 symbols) and **India** (all NSE equities, ~2,500 symbols via daily Bhavcopy CSV). Features: daily rankings (gainers/losers/most-active/trending), multi-day persistence tracking, per-stock detail with OHLCV charts, watchlist, portfolio P&L, price alerts, news, heatmap, and ML-based next-day forecasts.

### Stack

- **Backend:** FastAPI + SQLAlchemy + SQLite (WAL mode) + APScheduler
- **Frontend:** React 19 + React Router 7 + TanStack Query + Tailwind CSS + lightweight-charts
- **India data:** NSE Bhavcopy CSV via `curl_cffi` (bypasses Akamai TLS fingerprinting — do not replace with `requests`)
- **US data:** `yfinance` — batched in groups of 75 tickers

### Database

SQLite at `backend/stocks.db` (Docker: `/data/stocks.db` on named volume `stocks_data`). Tables auto-created via `Base.metadata.create_all()` on startup. Post-launch schema changes go in `services/db_migrations.py` as idempotent ALTER TABLE statements — no Alembic.

Key tables: `symbols`, `daily_metrics` (OHLCV + pct_change/rel_volume), `trading_calendar`, `refresh_log`, `fundamentals`, `watchlist`, `holdings`, `alert_rules`, `alert_triggers`, `forecast_models`, `macro_series`, `news_sentiment_snapshots`, `news_cache`.

`daily_metrics` composite PK is `(symbol_id, trade_date)`. Upserts are idempotent.

### Backend structure

```
backend/app/
  main.py              — FastAPI lifespan: create tables → run migrations → sweep locks → backfill/catchup → start scheduler
  config.py            — Pydantic settings (env prefix STOCKS_)
  models.py            — SQLAlchemy ORM tables
  db.py                — Engine (WAL mode, 5s busy timeout), session factory
  routers/             — 12 routers, all mounted under /api
  services/
    refresh_orchestrator.py   — Daily refresh logic (DB-backed job locks, idempotent)
    scheduler.py              — APScheduler cron jobs (US close 5PM ET, India close 6PM IST, 30min watchdog)
    backfill.py               — First-run & manual backfill (400 calendar days default)
    computation.py            — Derive pct_change, rel_volume, avg_volume_20d; upsert daily_metrics
    us_universe.py            — Weekly S&P 500 + Nasdaq-100 constituent refresh
    forecast_training_service.py — RandomForest on daily_metrics + macro features
```

### Frontend structure

```
frontend/src/
  App.tsx              — Routes + MarketContext + ThemeContext providers; pages are lazy-loaded
  api/client.ts        — Centralized fetch wrapper + all API methods
  api/types.ts         — TypeScript types for API responses
  context/
    MarketContext.tsx  — Global US/IN toggle (consumed by nearly every component)
  pages/               — 9 route pages (Dashboard, Rankings, StockDetail, Heatmap, Watchlist, Portfolio, Alerts, MarketNews, Settings)
  components/          — Shared UI components organized by feature
  lib/preferences.ts   — localStorage-based user preferences (including API URL override)
```

### API URL resolution (frontend)

1. Runtime override from `localStorage` (`apiBaseUrlOverride`)
2. Build-time `VITE_API_BASE_URL` env var
3. Fallback: `http://127.0.0.1:8010` (Docker host) / `8001` (bare dev)

### Scheduler jobs

| Job | Schedule |
|-----|----------|
| US daily refresh | 5:00 PM ET (after NYSE close) |
| India daily refresh | 6:00 PM IST (after NSE close) |
| Catch-up watchdog | Every 30 min (heals missed refreshes) |
| Weekly US universe | Sunday 3:00 AM ET |
| Weekly sector refresh | Sunday 3:15 AM ET |
| Weekly fundamentals (US + India) | Sunday 3:30–4:00 AM ET |
| Weekly forecast training | Sunday 5:00–5:30 AM ET |
| Daily macro refresh | 7:00 PM ET |
| Daily sentiment | 5:30 PM ET (US) / 6:30 PM IST (India) |

### Known gotchas

- **NSE/Akamai:** India fetch uses `curl_cffi` for TLS fingerprint bypass. Never swap for `requests` or `httpx`.
- **yfinance version:** Pinned to `1.5.1`. Do not upgrade without testing — breaking changes are common.
- **Port 8000 blocked:** Backend listens on 8001 (bare dev) / 8010 (Docker). Port 8000 is blocked in this environment.
- **SQLite WAL + param limits:** WAL mode enabled for concurrent reads. Large batch INSERTs must stay under SQLite's 999-parameter limit.
- **TypeScript check:** Use `npm run typecheck` (`tsc -p tsconfig.app.json`), not bare `tsc --noEmit` — the latter is vacuous in this setup.
- **Docker cp + WAL:** Before `docker cp` of the SQLite file, run a WAL checkpoint to flush WAL into the main DB file.
- **India name wipe:** Daily upsert uses `COALESCE(new_name, existing_name)` to avoid nulling out names. Don't bypass this logic.
- **Refresh lock:** Stuck `running` rows in `refresh_log` block future refreshes. The startup sweep marks them failed; the watchdog catches live hangs.
