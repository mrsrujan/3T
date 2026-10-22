"""Stock AI assistant backed by Claude (Anthropic).

Falls back to Kimchi (OpenAI-compatible) when STOCKS_ANTHROPIC_API_KEY is
not set.  Builds a rich per-request context block from live app data
(watchlist, holdings, today's rankings, sector snapshot) and calls the
appropriate inference provider.
"""
from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)

# ── System prompt ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are **StockMantra AI**, an expert financial analyst assistant embedded in a \
self-hosted stock portfolio platform. You combine the skills of a seasoned \
equity analyst, technical chartist, portfolio manager, and macro economist.

## Core Analysis Skills

### 1 · Fundamental Analysis
- Revenue growth, gross/operating/net margin trends, YoY and QoQ comparisons
- EPS (diluted), P/E (trailing + forward), PEG ratio, P/S, P/B, EV/EBITDA
- Return on equity (ROE), return on capital (ROIC), debt-to-equity, interest coverage
- Free cash flow yield, dividend yield, payout ratio, buyback yield
- Balance sheet health: current ratio, quick ratio, net cash vs net debt
- Quality signals: earnings consistency, revenue predictability, promoter/institutional holding changes

### 2 · Technical Analysis
- Trend identification: price vs 20/50/200-DMA, golden cross, death cross
- Momentum: RSI (14) — overbought >70, oversold <30, divergences
- MACD (12,26,9): histogram expansion/compression, signal crossovers
- Volume analysis: relative volume spikes, accumulation vs distribution
- Bollinger Bands: squeeze breakouts, band walks, mean-reversion setups
- Key levels: 52-week high/low, round numbers, prior resistance/support
- Chart patterns: breakouts, pullbacks, consolidations, flags/pennants
- Breadth context: sector leadership, FII/DII flows for India stocks

### 3 · Valuation
- DCF intuition: explain discount rate, terminal value, and sensitivity
- Relative valuation: compare P/E, EV/EBITDA, P/S vs sector peers and historical range
- India-specific: Price/Book for PSU banks, EV/EBITDA for infrastructure plays
- US-specific: Rule-of-40 for SaaS, P/S for high-growth tech, sector-specific multiples
- Fair value estimates: provide a bull / base / bear scenario with key assumptions

### 4 · Earnings Analysis
- Beat/miss vs consensus EPS and revenue estimates
- Guidance quality: raised, maintained, or lowered; management tone
- Margin trajectory: expanding or compressing, one-time vs recurring
- Surprise factor: positive/negative surprises and typical post-earnings drift
- Historical earnings trend: accelerating, decelerating, or mean-reverting

### 5 · Macro & Sector Context
- Interest rate environment: Fed (US) / RBI (India) — impact on sector multiples
- Currency: USD/INR impact on exporters vs importers
- Commodity prices: crude, metals, agri — sector read-throughs
- FII flows (India): institutional buying/selling as sentiment indicator
- Sector rotation: which sectors outperform in different rate/growth cycles
- Global linkages: beta to S&P 500, correlation with gold/crude/yield

### 6 · India-Specific Knowledge
- NSE/BSE listing, SEBI regulations, F&O stocks vs non-F&O
- SEBI categories: large-cap (top 100), mid-cap (101–250), small-cap (251+)
- Promoter holding trends: pledge changes, creeping acquisitions
- Institutional data: FII vs DII daily flows and their sector preferences
- Budget/policy sensitivity: capex stocks, PSUs, defense, PLI beneficiaries
- India valuation context: Nifty 50 historical P/E band (15–25x), premium sectors

### 7 · US-Specific Knowledge
- S&P 500 / Nasdaq-100 composition and sector weights
- Earnings season calendar, analyst estimate revisions (EPS revisions momentum)
- Options market: implied volatility, put/call ratio as sentiment indicators
- Fed policy cycle: impact on growth vs value, duration sensitivity
- Sector ETFs as proxies (XLF, XLK, XLE, XLV etc.) for institutional flows

### 8 · Portfolio & Risk Analysis
- Concentration risk: position sizing, single-stock exposure
- Sector/market diversification across US and India
- Portfolio beta: sensitivity to broader market moves
- Correlation analysis: which holdings move together (risk clustering)
- Drawdown analysis: max drawdown, recovery time
- Risk/reward: suggest position sizing, stop-loss levels, trim/add triggers

### 9 · Screener & Scanner Interpretation
- Explain what RSI pullback, MACD cross, breakout, RS leader setups mean
- Help interpret screener results: which metrics matter most for the setup
- Volume surge context: distinguish institutional accumulation vs retail fomo

---

## Identity & Scope
**Only discuss finance, investing, markets, and this application.**
If asked off-topic: *"I'm focused on stocks and markets — happy to discuss \
your portfolio or any specific stock instead."*

Never give explicit buy/sell orders. Use phrases like "worth monitoring", \
"fundamental case is", "technically set up for", "risk is". Always caveat \
with market conditions and individual risk tolerance.

---

## About This App
Self-hosted tracker with US (S&P 500 + Nasdaq-100, ~600 tickers) and India \
(NSE ~2,500 tickers). Key features: daily rankings, OHLCV charts with RSI/MACD/\
Bollinger, watchlist, portfolio P&L, price alerts, screener (sector/P/E/market cap), \
technical scanner (breakout/RS leader/52W high-low/RSI pullback/MACD/volume surge), \
global markets, ML forecast (5-day directional probability), news sentiment \
(AI-categorized per stock), quarterly financials, earnings calendar, FII/DII \
flows, bulk/block deals, corporate actions, IPO calendar.

**ML Forecast caveats**: Short (5d) = trained model output. Medium/Long/X-Long \
are momentum extrapolations, NOT separate trained models — confidence collapses \
beyond 5 days. Always state this when discussing forecasts.

---

## Response Style
- Markdown formatting. Bold key terms. Bullet points for multi-part analysis.
- US stocks: $ and millions/billions/trillions. India stocks: ₹ and lakh/crore.
- Structure longer analysis as: **Summary → Fundamentals → Technicals → Risks → Watch**.
- Be concise by default; offer to go deeper on any dimension.
- Qualify uncertainty: "likely", "as of [date]", "based on available data".
- Never present speculation as fact or as investment advice.

---

## Live App Data (injected for this session)
{context}
"""


# ── Context builder ────────────────────────────────────────────────────────────

def _build_context(db: Session, market: str) -> str:
    today = date.today().isoformat()
    lines: list[str] = [f"**Date**: {today}", f"**Active market**: {market}"]

    # Watchlist
    try:
        rows = db.execute(
            text(
                """
                SELECT s.symbol, s.name, s.sector, dm.close, dm.pct_change, dm.rel_volume
                FROM watchlist w
                JOIN symbols s ON s.symbol_id = w.symbol_id
                LEFT JOIN daily_metrics dm
                    ON dm.symbol_id = s.symbol_id
                    AND dm.trade_date = (
                        SELECT MAX(trade_date) FROM daily_metrics
                        WHERE symbol_id = s.symbol_id
                    )
                WHERE s.market = :market OR :market = 'ALL'
                ORDER BY w.added_at DESC
                LIMIT 20
                """
            ),
            {"market": market},
        ).all()
        if rows:
            lines.append("\n**Watchlist (latest prices)**:")
            for r in rows:
                pct = f" ({r.pct_change:+.1f}%)" if r.pct_change is not None else ""
                rvol = f" relVol={r.rel_volume:.1f}x" if r.rel_volume is not None else ""
                price = f"${r.close:.2f}" if r.close is not None else "—"
                sector = f" [{r.sector}]" if r.sector else ""
                lines.append(f"  - {r.symbol}{sector} ({r.name or '—'}): {price}{pct}{rvol}")
        else:
            lines.append("\n**Watchlist**: empty")
    except Exception:
        logger.warning("Could not fetch watchlist for AI context", exc_info=True)

    # Portfolio summary + top positions
    try:
        row = db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS n,
                    SUM(h.quantity * h.buy_price) AS invested,
                    SUM(h.quantity * COALESCE(dm.close, h.buy_price)) AS market_value
                FROM holdings h
                JOIN symbols s ON s.symbol_id = h.symbol_id
                LEFT JOIN daily_metrics dm
                    ON dm.symbol_id = s.symbol_id
                    AND dm.trade_date = (
                        SELECT MAX(trade_date) FROM daily_metrics
                        WHERE symbol_id = s.symbol_id
                    )
                WHERE h.is_closed = 0
                """
            )
        ).first()
        if row and row.n and row.n > 0:
            inv = row.invested or 0
            mv = row.market_value or 0
            pnl = mv - inv
            pnl_pct = (pnl / inv * 100) if inv else 0
            lines.append(
                f"\n**Portfolio** ({row.n} open positions): "
                f"invested ${inv:,.0f} · current ${mv:,.0f} · "
                f"P&L {pnl:+,.0f} ({pnl_pct:+.1f}%)"
            )
            # Top 5 by current value
            top = db.execute(
                text(
                    """
                    SELECT s.symbol, s.sector, h.quantity, h.buy_price,
                           COALESCE(dm.close, h.buy_price) AS cur
                    FROM holdings h
                    JOIN symbols s ON s.symbol_id = h.symbol_id
                    LEFT JOIN daily_metrics dm
                        ON dm.symbol_id = s.symbol_id
                        AND dm.trade_date = (SELECT MAX(trade_date) FROM daily_metrics WHERE symbol_id = s.symbol_id)
                    WHERE h.is_closed = 0
                    ORDER BY h.quantity * COALESCE(dm.close, h.buy_price) DESC
                    LIMIT 5
                    """
                )
            ).all()
            if top:
                lines.append("  Top positions:")
                for r in top:
                    val = r.quantity * r.cur
                    pnl_pos = r.quantity * (r.cur - r.buy_price)
                    sector = f" [{r.sector}]" if r.sector else ""
                    lines.append(f"    - {r.symbol}{sector}: {r.quantity} shares @ buy ${r.buy_price:.2f} · cur ${r.cur:.2f} · P&L {pnl_pos:+,.0f}")
        else:
            lines.append("\n**Portfolio**: no open positions")
    except Exception:
        logger.warning("Could not fetch holdings for AI context", exc_info=True)

    # Today's market movers
    try:
        latest_date = db.execute(
            text("SELECT MAX(trade_date) FROM daily_metrics WHERE market = :m"),
            {"m": market},
        ).scalar()

        if latest_date:
            gainers = db.execute(
                text(
                    "SELECT s.symbol, s.sector, dm.close, dm.pct_change FROM daily_metrics dm "
                    "JOIN symbols s ON s.symbol_id = dm.symbol_id "
                    "WHERE dm.market = :m AND dm.trade_date = :d AND dm.pct_change IS NOT NULL "
                    "ORDER BY dm.pct_change DESC LIMIT 5"
                ),
                {"m": market, "d": latest_date},
            ).all()
            losers = db.execute(
                text(
                    "SELECT s.symbol, s.sector, dm.close, dm.pct_change FROM daily_metrics dm "
                    "JOIN symbols s ON s.symbol_id = dm.symbol_id "
                    "WHERE dm.market = :m AND dm.trade_date = :d AND dm.pct_change IS NOT NULL "
                    "ORDER BY dm.pct_change ASC LIMIT 5"
                ),
                {"m": market, "d": latest_date},
            ).all()
            if gainers:
                lines.append(f"\n**Top gainers ({market}, {latest_date})**:")
                for r in gainers:
                    sector = f" [{r.sector}]" if r.sector else ""
                    lines.append(f"  - {r.symbol}{sector}: {r.pct_change:+.1f}% @ ${r.close:.2f}" if r.close else f"  - {r.symbol}{sector}: {r.pct_change:+.1f}%")
            if losers:
                lines.append(f"\n**Top losers ({market}, {latest_date})**:")
                for r in losers:
                    sector = f" [{r.sector}]" if r.sector else ""
                    lines.append(f"  - {r.symbol}{sector}: {r.pct_change:+.1f}%" )
    except Exception:
        logger.warning("Could not fetch rankings for AI context", exc_info=True)

    # Sector snapshot
    try:
        sectors = db.execute(
            text(
                """
                SELECT s.sector,
                       COUNT(*) AS cnt,
                       AVG(dm.pct_change) AS avg_pct
                FROM daily_metrics dm
                JOIN symbols s ON s.symbol_id = dm.symbol_id
                WHERE dm.market = :m AND dm.trade_date = (
                    SELECT MAX(trade_date) FROM daily_metrics WHERE market = :m
                )
                AND s.sector IS NOT NULL AND dm.pct_change IS NOT NULL
                GROUP BY s.sector
                ORDER BY avg_pct DESC
                LIMIT 8
                """
            ),
            {"m": market},
        ).all()
        if sectors:
            lines.append(f"\n**Sector snapshot ({market} today)**:")
            for r in sectors:
                lines.append(f"  - {r.sector}: avg {r.avg_pct:+.1f}% ({r.cnt} stocks)")
    except Exception:
        logger.warning("Could not fetch sector snapshot for AI context", exc_info=True)

    return "\n".join(lines)


# ── Claude call ────────────────────────────────────────────────────────────────

def _chat_claude(system: str, message: str, history: list[dict]) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    messages: list[dict] = []
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=2048,
        system=system,
        messages=messages,
    )

    reply = response.content[0].text if response.content else ""
    return {"reply": reply, "sources": []}


# ── OpenAI-compatible providers (Groq, Kimchi) ────────────────────────────────

def _chat_openai_compat(
    api_key: str,
    base_url: str,
    model: str,
    system: str,
    message: str,
    history: list[dict],
) -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    messages: list[dict] = [{"role": "system", "content": system}]
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    response = client.chat.completions.create(model=model, messages=messages)
    reply = response.choices[0].message.content or ""
    return {"reply": reply, "sources": []}


# ── Public entry point ─────────────────────────────────────────────────────────

def chat(db: Session, market: str, message: str, history: list[dict]) -> dict:
    """Call the configured AI provider with full app context.

    Provider priority: Claude → Groq → Kimchi (first non-empty key wins).
    history items: {"role": "user"|"assistant", "content": str}
    Returns {"reply": str, "sources": list[str]}
    """
    context = _build_context(db, market)
    system = SYSTEM_PROMPT.replace("{context}", context)

    if settings.anthropic_api_key:
        return _chat_claude(system, message, history)

    if settings.groq_api_key:
        return _chat_openai_compat(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
            model=settings.groq_model,
            system=system,
            message=message,
            history=history,
        )

    if settings.kimchi_api_key:
        return _chat_openai_compat(
            api_key=settings.kimchi_api_key,
            base_url="https://llm.kimchi.dev/openai/v1",
            model=settings.kimchi_model,
            system=system,
            message=message,
            history=history,
        )

    raise ValueError(
        "No AI key configured. Set STOCKS_GROQ_API_KEY (free at console.groq.com) "
        "or STOCKS_ANTHROPIC_API_KEY on the backend."
    )
