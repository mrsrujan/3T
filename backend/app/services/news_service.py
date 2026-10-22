# backend/app/services/news_service.py
from __future__ import annotations

import logging
from calendar import timegm
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

import feedparser

from app.services.cache import _cache

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30 * 60  # 30 minutes
MAX_ARTICLES = 15
MAX_ARTICLE_AGE_DAYS = 7

MARKET_QUERY_PARAMS = {
    "IN": {"hl": "en-IN", "gl": "IN", "ceid": "IN:en"},
}


def _build_rss_url(query: str, market: str) -> str:
    params = MARKET_QUERY_PARAMS.get(market, MARKET_QUERY_PARAMS["IN"])
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


# Hardcoded representative tickers for market-wide news.
_MARKET_NEWS_TICKERS: dict[str, list[str]] = {
    "IN": ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"],
}


def get_market_news(market: str, limit: int = 30) -> list[dict]:
    """Aggregate news for representative market tickers.
    Each article dict includes a 'symbol' key identifying its source ticker."""
    cache_key = f"market_news:{market}:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    tickers = _MARKET_NEWS_TICKERS.get(market, _MARKET_NEWS_TICKERS["IN"])
    articles: list[dict] = []
    per_ticker = max(1, limit // len(tickers))

    for symbol in tickers:
        raw = _fetch_live(market, symbol, None)
        for a in raw[:per_ticker]:
            articles.append({**a, "symbol": symbol})

    articles.sort(key=_sortable_published_at, reverse=True)
    articles = articles[:limit]
    _cache.set(cache_key, articles, CACHE_TTL_SECONDS)
    return articles
