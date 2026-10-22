"""Tests for on-demand fundamentals fetching with InMemoryCache."""
from unittest.mock import MagicMock, patch

from app.services import fundamentals as fund_module
from app.services.cache import InMemoryCache


def _make_cache() -> InMemoryCache:
    return InMemoryCache()


def test_get_fundamentals_fetches_and_caches(monkeypatch):
    """First call fetches from yfinance and stores in cache."""
    cache = _make_cache()
    monkeypatch.setattr(fund_module, "_cache", cache)

    mock_info = {
        "marketCap": 1_000_000,
        "trailingPE": 20.0,
        "forwardPE": 18.0,
        "dividendYield": 0.02,
        "returnOnEquity": 0.15,
        "bookValue": 50.0,
    }
    mock_ticker = MagicMock()
    mock_ticker.info = mock_info

    with patch("yfinance.Ticker", return_value=mock_ticker) as mock_yf:
        result = fund_module.get_fundamentals("AAPL", "IN")

    assert mock_yf.call_count == 1
    assert result["market_cap"] == 1_000_000
    assert result["pe_ratio"] == 20.0
    assert result["fetch_status"] == "ok"

    # Value should now be in cache
    cached = cache.get("fundamentals:IN:AAPL")
    assert cached is not None
    assert cached["market_cap"] == 1_000_000


def test_get_fundamentals_cache_hit_avoids_second_fetch(monkeypatch):
    """Second call for same symbol must not call yfinance again."""
    cache = _make_cache()
    monkeypatch.setattr(fund_module, "_cache", cache)

    mock_info = {"marketCap": 500_000, "trailingPE": None, "forwardPE": None,
                 "dividendYield": None, "returnOnEquity": None, "bookValue": None}
    mock_ticker = MagicMock()
    mock_ticker.info = mock_info

    with patch("yfinance.Ticker", return_value=mock_ticker) as mock_yf:
        first = fund_module.get_fundamentals("MSFT", "IN")
        second = fund_module.get_fundamentals("MSFT", "IN")

    # yfinance should only have been called once
    assert mock_yf.call_count == 1
    assert first == second


def test_get_fundamentals_india_symbol_suffix(monkeypatch):
    """India symbols get .NS suffix when calling yfinance."""
    cache = _make_cache()
    monkeypatch.setattr(fund_module, "_cache", cache)

    mock_ticker = MagicMock()
    mock_ticker.info = {"marketCap": None}

    with patch("yfinance.Ticker", return_value=mock_ticker) as mock_yf:
        fund_module.get_fundamentals("RELIANCE", "IN")

    mock_yf.assert_called_once_with("RELIANCE.NS")


def test_get_fundamentals_returns_failed_on_exception(monkeypatch):
    """When yfinance raises, returns failed record and still caches it."""
    cache = _make_cache()
    monkeypatch.setattr(fund_module, "_cache", cache)

    with patch("yfinance.Ticker", side_effect=Exception("network error")):
        result = fund_module.get_fundamentals("ERR", "IN")

    assert result["fetch_status"] == "failed"
    assert result["market_cap"] is None
    # Result is still cached to avoid hammering yfinance on repeated failures
    cached = cache.get("fundamentals:IN:ERR")
    assert cached is not None
    assert cached["fetch_status"] == "failed"
