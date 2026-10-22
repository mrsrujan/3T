from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Symbol(Base):
    __tablename__ = "symbols"
    __table_args__ = (
        UniqueConstraint("market", "symbol", name="uq_symbols_market_symbol"),
        CheckConstraint("market IN ('US','IN')", name="ck_symbols_market"),
    )

    symbol_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    first_seen: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_seen: Mapped[date | None] = mapped_column(Date, nullable=True)
    sector: Mapped[str | None] = mapped_column(String(128), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(128), nullable=True)

    daily_metrics: Mapped[list["DailyMetric"]] = relationship(back_populates="symbol_ref")


class DailyMetric(Base):
    __tablename__ = "daily_metrics"
    __table_args__ = (
        UniqueConstraint("symbol_id", "trade_date", name="uq_daily_metrics_symbol_date"),
        CheckConstraint("market IN ('US','IN')", name="ck_daily_metrics_market"),
        Index("idx_dm_date_market_pct", "trade_date", "market", "pct_change"),
        Index("idx_dm_date_market_vol", "trade_date", "market", "volume"),
        Index("idx_dm_date_market_relvol", "trade_date", "market", "rel_volume"),
        Index("idx_dm_symbol_date", "symbol_id", "trade_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.symbol_id"), nullable=False)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)

    open: Mapped[float | None] = mapped_column(Float, nullable=True)
    high: Mapped[float | None] = mapped_column(Float, nullable=True)
    low: Mapped[float | None] = mapped_column(Float, nullable=True)
    close: Mapped[float | None] = mapped_column(Float, nullable=True)
    prev_close: Mapped[float | None] = mapped_column(Float, nullable=True)
    volume: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turnover: Mapped[float | None] = mapped_column(Float, nullable=True)

    pct_change: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_volume_20d: Mapped[float | None] = mapped_column(Float, nullable=True)
    rel_volume: Mapped[float | None] = mapped_column(Float, nullable=True)

    symbol_ref: Mapped["Symbol"] = relationship(back_populates="daily_metrics")


class TradingCalendar(Base):
    __tablename__ = "trading_calendar"

    market: Mapped[str] = mapped_column(String(2), primary_key=True)
    trade_date: Mapped[date] = mapped_column(Date, primary_key=True)


class RefreshLog(Base):
    __tablename__ = "refresh_log"
    __table_args__ = (
        CheckConstraint(
            "job_type IN ('scheduled','manual','backfill')", name="ck_refresh_log_job_type"
        ),
        CheckConstraint(
            "status IN ('running','success','partial','failed','skipped')",
            name="ck_refresh_log_status",
        ),
    )

    job_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    market: Mapped[str | None] = mapped_column(String(4), nullable=True)
    job_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    symbols_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    symbols_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(String(2048), nullable=True)


class Watchlist(Base):
    """Single-user watchlist - no auth/user_id concept, this is a personal
    self-hosted app."""

    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("symbol_id", name="uq_watchlist_symbol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.symbol_id"), nullable=False)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Holding(Base):
    """Single-user portfolio holdings. No uniqueness constraint - multiple
    lots of the same symbol are legitimate, separate rows. P&L is always
    computed live at read time against the latest daily_metrics close, never
    stored."""

    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.symbol_id"), nullable=False)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    buy_price: Mapped[float] = mapped_column(Float, nullable=False)
    buy_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Set when the position is closed - P&L becomes realized at sell_price.
    sell_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    sell_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class AlertRule(Base):
    __tablename__ = "alert_rules"
    __table_args__ = (
        CheckConstraint(
            "rule_type IN ('pct_change_above','pct_change_below','price_above','price_below','rel_volume_above')",
            name="ck_alert_rules_type",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.symbol_id"), nullable=False)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(24), nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class ForecastModel(Base):
    """One row per training run of the per-market pooled classifier. The
    joblib artifact lives on disk (settings.db_path.parent / 'forecast_models');
    this table is the introspectable record of which model is currently
    serving inference, and its honest walk-forward holdout metrics."""

    __tablename__ = "forecast_models"
    __table_args__ = (
        CheckConstraint("market IN ('US','IN')", name="ck_forecast_models_market"),
        CheckConstraint(
            "status IN ('active','superseded','failed')", name="ck_forecast_models_status"
        ),
        Index("idx_forecast_models_market_status", "market", "status"),
    )

    model_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    trained_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    training_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    holdout_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    train_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    train_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    holdout_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    holdout_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    holdout_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    holdout_auc: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Majority-class accuracy on the SAME holdout split, so the UI never
    # presents a bare 55% as impressive on its own.
    holdout_baseline_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Ordered feature column list - source of truth for inference column order.
    feature_list_json: Mapped[str] = mapped_column(String, nullable=False)
    feature_importance_json: Mapped[str | None] = mapped_column(String, nullable=True)
    model_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    error_message: Mapped[str | None] = mapped_column(String(2048), nullable=True)


class AlertTrigger(Base):
    """UNIQUE(rule_id, trade_date) + on_conflict_do_nothing makes the daily
    alert checker idempotent if re-run for the same trading day."""

    __tablename__ = "alert_triggers"
    __table_args__ = (
        UniqueConstraint("rule_id", "trade_date", name="uq_alert_triggers_rule_date"),
        Index("idx_alert_triggers_triggered_at", "triggered_at"),
        Index("idx_alert_triggers_is_read", "is_read"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id"), nullable=False)
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.symbol_id"), nullable=False)
    market: Mapped[str] = mapped_column(String(2), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    trigger_value: Mapped[float] = mapped_column(Float, nullable=False)
    message: Mapped[str] = mapped_column(String(256), nullable=False)
    is_read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
