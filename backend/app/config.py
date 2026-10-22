from pathlib import Path

from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_PATH = BACKEND_DIR / "stocks.db"


class Settings(BaseSettings):
    # Full SQLAlchemy URL. Env override: STOCKS_DATABASE_URL.
    # Local dev default stays SQLite; K8s sets postgresql+psycopg://...
    database_url: str = f"sqlite:///{_DEFAULT_SQLITE_PATH}"
    # Legacy path kept for callers that still write joblib artifacts next to it
    # (e.g. forecast_training_service). Not used for the DB connection anymore.
    db_path: Path = _DEFAULT_SQLITE_PATH
    default_top_n: int = 25
    # 10 calendar days ≈ 5-7 trading days (one business week, with slack for
    # a holiday). Enough for daily rankings, watchlist, and portfolio P&L.
    # Chart-heavy / analytics features (20-day rel_volume, 52W high/low,
    # 200-day MA, forecast training, scanner setups) will show null/empty
    # at this window — explicit trade-off for a lean DB footprint.
    backfill_calendar_days: int = 10
    rolling_window_days: int = 20
    # Wildcard because clients arrive from several origins with no way to
    # enumerate them: the dev server, the dockerized frontend on the LAN IP,
    # and the Capacitor Android WebView (origin https://localhost). The API
    # is cookie-less and unauthenticated on a private LAN, so this doesn't
    # weaken anything credentials-based.
    cors_origins: list[str] = ["*"]

    # Below this row count, run_weekly_training records a 'failed' run and
    # leaves the currently-active forecast model untouched rather than
    # fitting on too little data.
    forecast_min_training_rows: int = 5000
    # Fraction of the unique trade_date range held out as a strictly-future,
    # never-trained-on chronological validation set.
    forecast_holdout_fraction: float = 0.15
    # Forecast inputs are daily_metrics-derived and can't change intraday;
    # 30 min matches news_service's own cache window (the one input - live
    # sentiment - that does change within a day).
    forecast_cache_ttl_seconds: int = 1800
    forecast_models_to_keep: int = 3

    # AI provider keys — priority: Claude → Groq → Kimchi (first non-empty wins)
    # Claude:  get key at api.anthropic.com  (paid, best quality)
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    # Groq:   get free key at console.groq.com
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Kimchi (legacy fallback)
    kimchi_api_key: str = ""
    kimchi_model: str = "kimi-k2.7"

    # Enable in-process APScheduler. True for local dev; set False in K8s
    # API pods so only the dedicated CronJobs run scheduled work.
    scheduler_enabled: bool = True

    class Config:
        env_prefix = "STOCKS_"


settings = Settings()
