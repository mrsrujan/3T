from __future__ import annotations

from app.services.cache import _cache
from app.services.news_service import get_news

CATEGORIES: dict[str, dict] = {
    "geopolitical": {
        "label": "Geopolitical",
        "icon": "🌐",
        "keywords": [
            "war", "sanction", "tariff", "trade war", "conflict", "military",
            "geopolit", "invasion", "embargo", "nuclear", "missile", "nato",
            "russia", "ukraine", "taiwan", "china", "iran", "israel", "gaza",
            "tension", "alliance", "diplomat",
        ],
    },
    "competitive": {
        "label": "Competition",
        "icon": "⚔️",
        "keywords": [
            "competi", "rival", "market share", "disrupt", "new product", "launch",
            "startup", "alternative", "challenger", "undercut", "price war",
            "patent", "copycat", "entry",
        ],
    },
    "regulatory": {
        "label": "Regulatory",
        "icon": "⚖️",
        "keywords": [
            "regulat", "lawsuit", "antitrust", "sec ", "fine", "penalty",
            "probe", "investigat", "compliance", "gdpr", "lawsuit", "court",
            "doj", "ftc", "sebi", "rbi order", "ban", "recall",
        ],
    },
    "macro": {
        "label": "Macro / Economy",
        "icon": "📊",
        "keywords": [
            "interest rate", "inflation", "fed ", "federal reserve", "recession",
            "gdp", "unemployment", "stimulus", "central bank", "rbi", "cpi",
            "rate hike", "rate cut", "bond yield", "oil price", "supply chain",
        ],
    },
    "earnings": {
        "label": "Earnings & Finance",
        "icon": "💰",
        "keywords": [
            "earnings", "revenue", "profit", "loss", "guidance", "forecast",
            "quarterly", "eps", "dividend", "buyback", "debt", "cash flow",
            "margin", "beat", "miss", "outlook",
        ],
    },
    "leadership": {
        "label": "Leadership & Strategy",
        "icon": "👔",
        "keywords": [
            "ceo", "cfo", "cto", "resign", "appoint", "acqui", "merger",
            "restructur", "layoff", "spinoff", "ipo", "strategy", "pivot",
            "partnership", "joint venture",
        ],
    },
}

POSITIVE_WORDS = [
    "surge", "soar", "beat", "strong", "record", "growth", "rally", "gain",
    "profit", "expand", "win", "upgrade", "outperform", "bullish", "boost",
    "partner", "innovate", "launch", "approve",
]

NEGATIVE_WORDS = [
    "drop", "fall", "miss", "weak", "loss", "decline", "cut", "layoff",
    "recall", "fine", "probe", "downgrade", "underperform", "bearish",
    "risk", "warn", "concern", "reject", "ban", "crash", "fail",
]


def _articles_for_category(articles: list[dict], keywords: list[str]) -> list[dict]:
    """Return articles that mention any keyword in title or summary (case-insensitive)."""
    matched = []
    for a in articles:
        text = (a.get("title", "") + " " + a.get("summary", "")).lower()
        if any(kw in text for kw in keywords):
            matched.append(a)
    return matched


def _sentiment_direction(articles: list[dict]) -> str:
    """Returns 'positive', 'negative', or 'neutral' based on keyword counts."""
    pos = sum(
        sum(1 for w in POSITIVE_WORDS if w in (a.get("title", "") + " " + a.get("summary", "")).lower())
        for a in articles
    )
    neg = sum(
        sum(1 for w in NEGATIVE_WORDS if w in (a.get("title", "") + " " + a.get("summary", "")).lower())
        for a in articles
    )
    if pos > neg + 1:
        return "positive"
    elif neg > pos + 1:
        return "negative"
    return "neutral"


def _overall_sentiment(articles: list[dict]) -> str:
    if not articles:
        return "neutral"
    return _sentiment_direction(articles)


def analyze_sentiment(market: str, symbol: str, name: str) -> dict:
    """Returns categorized sentiment analysis from recent news.
    Cached 30min (same as news_service TTL)."""
    cache_key = f"news_sentiment:{market}:{symbol}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    articles = get_news(market, symbol, name)

    category_results: dict[str, dict] = {}
    for cat_id, cat in CATEGORIES.items():
        matching = _articles_for_category(articles, cat["keywords"])
        if matching:
            category_results[cat_id] = {
                "label": cat["label"],
                "icon": cat["icon"],
                "article_count": len(matching),
                "sentiment": _sentiment_direction(matching),
                "headlines": [a["title"] for a in matching[:3]],
            }

    overall = _overall_sentiment(articles)
    result: dict = {
        "symbol": symbol,
        "market": market,
        "article_count": len(articles),
        "overall_sentiment": overall,
        "categories": category_results,
    }
    _cache.set(cache_key, result, 30 * 60)
    return result
