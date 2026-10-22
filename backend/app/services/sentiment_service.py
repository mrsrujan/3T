"""Lexicon-based news sentiment - a small keyword word-list scorer over
headline titles, no LLM/NLP model/API calls.

Provides get_live_sentiment (used by forecast_service) and score_headlines.
"""

from __future__ import annotations

import logging
import re

from app.services.news_service import get_news

logger = logging.getLogger(__name__)

POSITIVE_WORDS = {
    "beat", "beats", "beating", "surge", "surges", "surged", "soar", "soars", "soared",
    "rally", "rallies", "rallied", "upgrade", "upgrades", "upgraded", "outperform",
    "record", "growth", "grows", "growing", "profit", "profits", "profitable",
    "bullish", "expand", "expands", "expanding", "wins", "win", "winning", "gain",
    "gains", "gained", "jump", "jumps", "jumped", "boost", "boosts", "boosted",
    "strong", "strength", "beat estimates", "raises", "raised", "raise",
}

NEGATIVE_WORDS = {
    "miss", "misses", "missed", "plunge", "plunges", "plunged", "slump", "slumps",
    "slumped", "downgrade", "downgrades", "downgraded", "underperform", "loss",
    "losses", "lawsuit", "lawsuits", "bearish", "recall", "recalls", "recalled",
    "investigation", "investigated", "cuts", "cut", "cutting", "fall", "falls",
    "fell", "falling", "drop", "drops", "dropped", "weak", "weakness", "warns",
    "warned", "warning", "layoffs", "layoff", "fraud", "probe", "sues", "sued",
}

_WORD_RE = re.compile(r"[a-zA-Z']+")


def _tokenize(text_value: str) -> set[str]:
    return {w.lower() for w in _WORD_RE.findall(text_value)}


def score_headlines(titles: list[str]) -> dict:
    """{sentiment_score in [-1,1], positive_hits, negative_hits, article_count,
    matched_keywords}. score = 0 when nothing matches (or hits cancel out),
    so "no signal" reads as neutral, not falsely positive/negative."""
    positive_hits = 0
    negative_hits = 0
    matched: set[str] = set()
    for title in titles:
        words = _tokenize(title)
        pos = words & POSITIVE_WORDS
        neg = words & NEGATIVE_WORDS
        positive_hits += len(pos)
        negative_hits += len(neg)
        matched |= pos | neg

    total_hits = positive_hits + negative_hits
    score = (positive_hits - negative_hits) / max(1, total_hits)
    return {
        "sentiment_score": score,
        "positive_hits": positive_hits,
        "negative_hits": negative_hits,
        "article_count": len(titles),
        "matched_keywords": sorted(matched),
    }


def get_live_sentiment(market: str, symbol: str, name: str | None) -> dict:
    """Reuses news_service.get_news's existing 30-min cache - zero extra
    fetch cost beyond what the stock detail / news pages already warm."""
    articles = get_news(market, symbol, name)
    titles = [a["title"] for a in articles if a.get("title")]
    return score_headlines(titles)


