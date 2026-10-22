"""Fetch quarterly income statement + shareholding + cash flow from yfinance.
Cached in-process for 6 hours since earnings only change quarterly.
"""
from __future__ import annotations

import logging
import time

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL = 6 * 3600  # 6 hours


def _yf_symbol(market: str, symbol: str) -> str:
    return f"{symbol}.NS" if market == "IN" else symbol


def get_quarterly(market: str, symbol: str) -> dict:
    key = f"{market}:{symbol}"
    cached = _CACHE.get(key)
    if cached and time.time() - cached[0] < _TTL:
        return cached[1]

    yf_sym = _yf_symbol(market, symbol)
    result = {"quarterly": [], "shareholding": None}
    try:
        ticker = yf.Ticker(yf_sym)
        result["quarterly"] = _quarterly_results(ticker, market)
        result["shareholding"] = _shareholding(ticker)
    except Exception:
        logger.exception("Quarterly fetch failed for %s", yf_sym)

    _CACHE[key] = (time.time(), result)
    return result


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if pd.isna(f) else f
    except Exception:
        return None


def _get_row(df: pd.DataFrame, *names: str):
    """Return the first matching row from a DataFrame index, or None."""
    for name in names:
        if name in df.index:
            return df.loc[name]
    return None


def _quarterly_results(ticker, market: str) -> list[dict]:
    try:
        stmt = ticker.quarterly_income_stmt
    except Exception:
        return []

    if stmt is None or stmt.empty:
        return []

    # Optionally fetch cash flow and balance sheet (non-fatal if unavailable)
    cf_stmt: pd.DataFrame | None = None
    bs_stmt: pd.DataFrame | None = None
    try:
        cf_stmt = ticker.quarterly_cashflow
        if cf_stmt is not None and cf_stmt.empty:
            cf_stmt = None
    except Exception:
        pass
    try:
        bs_stmt = ticker.quarterly_balance_sheet
        if bs_stmt is not None and bs_stmt.empty:
            bs_stmt = None
    except Exception:
        pass

    # Income statement rows
    revenue_row = _get_row(stmt, "Total Revenue", "Revenue")
    net_row = _get_row(
        stmt,
        "Net Income",
        "Net Income Common Stockholders",
        "Net Income From Continuing Operation Net Minority Interest",
    )
    gross_row = _get_row(stmt, "Gross Profit")
    operating_row = _get_row(stmt, "Operating Income", "EBIT")
    ebitda_row = _get_row(stmt, "EBITDA", "Normalized EBITDA")
    interest_row = _get_row(stmt, "Interest Expense", "Interest Expense Non Operating")
    eps_row = _get_row(stmt, "Diluted EPS", "Basic EPS")

    # Cash flow rows
    fcf_row = _get_row(cf_stmt, "Free Cash Flow") if cf_stmt is not None else None

    # Balance sheet rows
    debt_row = _get_row(bs_stmt, "Total Debt", "Long Term Debt") if bs_stmt is not None else None

    if revenue_row is None:
        return []

    cols = list(stmt.columns)
    # yfinance returns absolute values in the local currency;
    # convert to crores (India) or millions (US) for display.
    divisor = 10_000_000 if market == "IN" else 1_000_000

    def get_cf_bs_col(row, col):
        """Get value from cf/bs dataframe column, handle date-index mismatch."""
        if row is None:
            return None
        try:
            return _safe_float(row.get(col))
        except Exception:
            return None

    results = []
    for i, col in enumerate(cols[:8]):  # Extended from 5 to 8 quarters
        rev = _safe_float(revenue_row.get(col))
        net = _safe_float(net_row.get(col)) if net_row is not None else None
        gross = _safe_float(gross_row.get(col)) if gross_row is not None else None
        operating = _safe_float(operating_row.get(col)) if operating_row is not None else None
        ebitda = _safe_float(ebitda_row.get(col)) if ebitda_row is not None else None
        interest = _safe_float(interest_row.get(col)) if interest_row is not None else None
        eps = _safe_float(eps_row.get(col)) if eps_row is not None else None
        fcf = get_cf_bs_col(fcf_row, col)
        debt = get_cf_bs_col(debt_row, col)

        rev_sc = rev / divisor if rev is not None else None
        net_sc = net / divisor if net is not None else None
        gross_sc = gross / divisor if gross is not None else None
        operating_sc = operating / divisor if operating is not None else None
        ebitda_sc = ebitda / divisor if ebitda is not None else None
        fcf_sc = fcf / divisor if fcf is not None else None
        debt_sc = debt / divisor if debt is not None else None
        # EPS is per-share — no scaling

        rev_qoq = None
        if i + 1 < len(cols) and rev is not None:
            prev = _safe_float(revenue_row.get(cols[i + 1]))
            if prev and prev != 0:
                rev_qoq = (rev - prev) / abs(prev) * 100

        rev_yoy = None
        if i + 4 < len(cols) and rev is not None:
            prev_y = _safe_float(revenue_row.get(cols[i + 4]))
            if prev_y and prev_y != 0:
                rev_yoy = (rev - prev_y) / abs(prev_y) * 100

        net_margin = (net / rev * 100) if rev and rev != 0 and net is not None else None
        gross_margin = (gross / rev * 100) if rev and rev != 0 and gross is not None else None
        op_margin = (operating / rev * 100) if rev and rev != 0 and operating is not None else None
        # Interest coverage = EBIT / interest_expense (absolute value)
        interest_coverage = None
        if operating is not None and interest is not None and interest != 0:
            interest_coverage = abs(operating) / abs(interest)

        try:
            ts = pd.Timestamp(col)
            quarter_str = ts.strftime("%b %Y")
            period_end_date = ts.strftime("%Y-%m-%d")
        except Exception:
            quarter_str = str(col)[:7]
            period_end_date = None

        results.append(
            {
                "quarter": quarter_str,
                "period_end_date": period_end_date,
                "revenue": rev_sc,
                "revenue_qoq": rev_qoq,
                "revenue_yoy": rev_yoy,
                "gross_profit": gross_sc,
                "gross_margin": gross_margin,
                "operating_income": operating_sc,
                "op_margin": op_margin,
                "ebitda": ebitda_sc,
                "net_profit": net_sc,
                "net_margin": net_margin,
                "eps": eps,
                "free_cash_flow": fcf_sc,
                "total_debt": debt_sc,
                "interest_coverage": interest_coverage,
            }
        )

    return results


def get_annual(market: str, symbol: str) -> dict:
    key = f"annual:{market}:{symbol}"
    cached = _CACHE.get(key)
    if cached and time.time() - cached[0] < _TTL:
        return cached[1]

    yf_sym = _yf_symbol(market, symbol)
    result: dict = {
        "annual_pl": [], "annual_bs": [], "annual_cf": [],
        "efficiency": None, "cagr": None, "signals": [],
        "face_value": None, "website": None,
    }
    try:
        ticker = yf.Ticker(yf_sym)
        info = {}
        try:
            info = ticker.info or {}
        except Exception:
            pass

        inc, bs_df, cf_df = None, None, None
        try:
            inc = ticker.income_stmt
            if inc is not None and inc.empty:
                inc = None
        except Exception:
            pass
        try:
            bs_df = ticker.balance_sheet
            if bs_df is not None and bs_df.empty:
                bs_df = None
        except Exception:
            pass
        try:
            cf_df = ticker.cashflow
            if cf_df is not None and cf_df.empty:
                cf_df = None
        except Exception:
            pass

        divisor = 10_000_000 if market == "IN" else 1_000_000

        if inc is not None:
            result["annual_pl"] = _annual_pl(inc, divisor, info)
        if bs_df is not None:
            result["annual_bs"] = _annual_bs(bs_df, divisor)
        if cf_df is not None:
            result["annual_cf"] = _annual_cf(cf_df, divisor)
        if inc is not None and bs_df is not None:
            result["efficiency"] = _efficiency_ratios(inc, bs_df)
            result["cagr"] = _compute_cagr(result["annual_pl"])

        result["signals"] = _generate_signals(result, info)
        result["face_value"] = _safe_float(info.get("faceValue"))
        result["website"] = info.get("website") or None

    except Exception:
        logger.exception("Annual fetch failed for %s", yf_sym)

    _CACHE[key] = (time.time(), result)
    return result


def _year_label(col) -> str:
    try:
        ts = pd.Timestamp(col)
        return ts.strftime("%b %Y")
    except Exception:
        return str(col)[:7]


def _annual_pl(inc: "pd.DataFrame", divisor: int, info: dict) -> list[dict]:
    revenue_row = _get_row(inc, "Total Revenue", "Operating Revenue", "Revenue")
    gross_row = _get_row(inc, "Gross Profit")
    ebit_row = _get_row(inc, "Operating Income", "EBIT")
    ebitda_row = _get_row(inc, "EBITDA", "Normalized EBITDA")
    net_row = _get_row(inc, "Net Income", "Net Income Common Stockholders",
                       "Net Income From Continuing Operation Net Minority Interest")
    eps_row = _get_row(inc, "Diluted EPS", "Basic EPS")
    interest_row = _get_row(inc, "Interest Expense", "Interest Expense Non Operating")
    dep_row = _get_row(inc, "Reconciled Depreciation", "Depreciation And Amortization",
                       "Depreciation Amortization Depletion")
    tax_row = _get_row(inc, "Tax Provision")
    pbt_row = _get_row(inc, "Pretax Income")
    other_row = _get_row(inc, "Total Other Income Expense Net", "Other Income Expense",
                         "Non Operating Income Total Other")

    # Dividend per share from info (single value, applied to latest year only)
    div_ps = _safe_float(info.get("dividendRate") or info.get("lastDividendValue"))

    results = []
    for i, col in enumerate(inc.columns):
        rev = _safe_float(revenue_row.get(col)) if revenue_row is not None else None
        ebit = _safe_float(ebit_row.get(col)) if ebit_row is not None else None
        ebitda = _safe_float(ebitda_row.get(col)) if ebitda_row is not None else None
        gross = _safe_float(gross_row.get(col)) if gross_row is not None else None
        net = _safe_float(net_row.get(col)) if net_row is not None else None
        eps = _safe_float(eps_row.get(col)) if eps_row is not None else None
        interest = _safe_float(interest_row.get(col)) if interest_row is not None else None
        dep = _safe_float(dep_row.get(col)) if dep_row is not None else None
        tax = _safe_float(tax_row.get(col)) if tax_row is not None else None
        pbt = _safe_float(pbt_row.get(col)) if pbt_row is not None else None
        other = _safe_float(other_row.get(col)) if other_row is not None else None

        # Operating profit for screener-style display: prefer EBIT, fallback gross
        op = ebit if ebit is not None else gross
        # Expenses = Revenue - Operating Profit
        expenses = (rev - op) if rev is not None and op is not None else None
        op_margin = (op / rev * 100) if rev and rev != 0 and op is not None else None
        net_sc = net / divisor if net is not None else None
        rev_sc = rev / divisor if rev is not None else None
        expenses_sc = expenses / divisor if expenses is not None else None
        op_sc = op / divisor if op is not None else None
        dep_sc = dep / divisor if dep is not None else None
        interest_sc = abs(interest) / divisor if interest is not None else None
        pbt_sc = pbt / divisor if pbt is not None else None
        other_sc = other / divisor if other is not None else None
        tax_pct = (tax / pbt * 100) if pbt and pbt != 0 and tax is not None else None
        net_margin = (net / rev * 100) if rev and rev != 0 and net is not None else None

        results.append({
            "year": _year_label(col),
            "revenue": rev_sc,
            "expenses": expenses_sc,
            "operating_profit": op_sc,
            "op_margin": op_margin,
            "other_income": other_sc,
            "depreciation": dep_sc,
            "interest": interest_sc,
            "pbt": pbt_sc,
            "tax_pct": tax_pct,
            "net_profit": net_sc,
            "net_margin": net_margin,
            "eps": eps,
            "dividend_per_share": div_ps if i == 0 else None,
        })
    return results


def _annual_bs(bs_df: "pd.DataFrame", divisor: int) -> list[dict]:
    total_assets_row = _get_row(bs_df, "Total Assets")
    total_liab_row = _get_row(bs_df, "Total Liabilities Net Minority Interest")
    equity_row = _get_row(bs_df, "Stockholders Equity", "Common Stock Equity",
                          "Total Equity Gross Minority Interest")
    capital_row = _get_row(bs_df, "Common Stock", "Ordinary Shares Number")
    reserves_row = _get_row(bs_df, "Retained Earnings", "Retained Earnings Deficit")
    debt_row = _get_row(bs_df, "Total Debt", "Long Term Debt")
    curr_assets_row = _get_row(bs_df, "Current Assets")
    curr_liab_row = _get_row(bs_df, "Current Liabilities")
    ppe_row = _get_row(bs_df, "Net PPE", "Net Property Plant And Equipment")

    results = []
    for col in bs_df.columns:
        def sc(row):
            v = _safe_float(row.get(col)) if row is not None else None
            return v / divisor if v is not None else None

        equity = sc(equity_row)
        capital = sc(capital_row)
        reserves = sc(reserves_row)
        # If we have equity but not separate capital/reserves, put equity in reserves
        if equity is not None and reserves is None and capital is None:
            reserves = equity

        results.append({
            "year": _year_label(col),
            "equity_capital": capital,
            "reserves": reserves,
            "total_debt": sc(debt_row),
            "current_liabilities": sc(curr_liab_row),
            "total_liabilities": sc(total_liab_row),
            "fixed_assets": sc(ppe_row),
            "current_assets": sc(curr_assets_row),
            "total_assets": sc(total_assets_row),
        })
    return results


def _annual_cf(cf_df: "pd.DataFrame", divisor: int) -> list[dict]:
    op_row = _get_row(cf_df, "Operating Cash Flow")
    inv_row = _get_row(cf_df, "Investing Cash Flow")
    fin_row = _get_row(cf_df, "Financing Cash Flow")
    fcf_row = _get_row(cf_df, "Free Cash Flow")
    capex_row = _get_row(cf_df, "Capital Expenditure")

    results = []
    for col in cf_df.columns:
        def sc(row):
            v = _safe_float(row.get(col)) if row is not None else None
            return v / divisor if v is not None else None

        results.append({
            "year": _year_label(col),
            "operating_cf": sc(op_row),
            "investing_cf": sc(inv_row),
            "financing_cf": sc(fin_row),
            "free_cash_flow": sc(fcf_row),
            "capex": sc(capex_row),
        })
    return results


def _efficiency_ratios(inc: "pd.DataFrame", bs_df: "pd.DataFrame") -> dict | None:
    try:
        # Use most recent column
        inc_col = inc.columns[0]
        bs_col = bs_df.columns[0]

        revenue = _safe_float((_get_row(inc, "Total Revenue", "Operating Revenue", "Revenue") or pd.Series()).get(inc_col))
        receivables = _safe_float((_get_row(bs_df, "Net Receivables", "Receivables", "Accounts Receivable") or pd.Series()).get(bs_col))
        inventory = _safe_float((_get_row(bs_df, "Inventory") or pd.Series()).get(bs_col))
        payables = _safe_float((_get_row(bs_df, "Payables And Accrued Expenses", "Accounts Payable",
                                          "Current Payables") or pd.Series()).get(bs_col))
        curr_assets = _safe_float((_get_row(bs_df, "Current Assets") or pd.Series()).get(bs_col))
        curr_liab = _safe_float((_get_row(bs_df, "Current Liabilities") or pd.Series()).get(bs_col))
        total_assets = _safe_float((_get_row(bs_df, "Total Assets") or pd.Series()).get(bs_col))
        ebit = _safe_float((_get_row(inc, "Operating Income", "EBIT") or pd.Series()).get(inc_col))

        if not revenue or revenue == 0:
            return None

        debtor_days = (receivables / revenue * 365) if receivables is not None else None
        inventory_days = (inventory / revenue * 365) if inventory is not None else None
        days_payable = (payables / revenue * 365) if payables is not None else None

        ccc = None
        if debtor_days is not None and inventory_days is not None and days_payable is not None:
            ccc = debtor_days + inventory_days - days_payable

        wc = None
        wc_days = None
        if curr_assets is not None and curr_liab is not None:
            wc = curr_assets - curr_liab
            wc_days = wc / revenue * 365

        roce = None
        if ebit is not None and total_assets is not None and curr_liab is not None:
            capital_employed = total_assets - curr_liab
            if capital_employed and capital_employed != 0:
                roce = ebit / capital_employed * 100

        return {
            "debtor_days": round(debtor_days, 1) if debtor_days is not None else None,
            "inventory_days": round(inventory_days, 1) if inventory_days is not None else None,
            "days_payable": round(days_payable, 1) if days_payable is not None else None,
            "cash_conversion_cycle": round(ccc, 1) if ccc is not None else None,
            "working_capital_days": round(wc_days, 1) if wc_days is not None else None,
            "roce": round(roce, 1) if roce is not None else None,
        }
    except Exception:
        logger.warning("Efficiency ratio computation failed", exc_info=True)
        return None


def _compute_cagr(annual_pl: list[dict]) -> dict | None:
    if not annual_pl:
        return None

    def _cagr(start, end, years):
        if start and end and start > 0 and years > 0:
            return ((end / start) ** (1 / years) - 1) * 100
        return None

    revs = [p["revenue"] for p in annual_pl if p["revenue"] is not None]
    nets = [p["net_profit"] for p in annual_pl if p["net_profit"] is not None]

    return {
        "revenue_3yr": _cagr(revs[3], revs[0], 3) if len(revs) > 3 else None,
        "revenue_5yr": _cagr(revs[5], revs[0], 5) if len(revs) > 5 else None,
        "profit_3yr": _cagr(nets[3], nets[0], 3) if len(nets) > 3 else None,
        "profit_5yr": _cagr(nets[5], nets[0], 5) if len(nets) > 5 else None,
    }


def _generate_signals(result: dict, info: dict) -> list[dict]:
    signals = []
    cagr = result.get("cagr") or {}
    eff = result.get("efficiency") or {}
    annual_pl = result.get("annual_pl") or []

    # Revenue growth
    r3 = cagr.get("revenue_3yr")
    if r3 is not None:
        if r3 >= 15:
            signals.append({"type": "pro", "text": f"Revenue growing at {r3:.0f}% CAGR over 3 years"})
        elif r3 < 5:
            signals.append({"type": "con", "text": f"Slow revenue growth ({r3:.0f}% CAGR over 3 years)"})

    # Profit growth
    p3 = cagr.get("profit_3yr")
    if p3 is not None:
        if p3 >= 20:
            signals.append({"type": "pro", "text": f"Profit growing at {p3:.0f}% CAGR over 3 years"})
        elif p3 < 0:
            signals.append({"type": "con", "text": f"Profit declining ({p3:.0f}% CAGR over 3 years)"})

    # ROCE
    roce = eff.get("roce")
    if roce is not None:
        if roce >= 20:
            signals.append({"type": "pro", "text": f"Strong return on capital employed ({roce:.0f}% ROCE)"})
        elif roce < 10:
            signals.append({"type": "con", "text": f"Low return on capital employed ({roce:.0f}% ROCE)"})

    # Debt
    de = _safe_float(info.get("debtToEquity"))
    if de is not None:
        if de < 30:
            signals.append({"type": "pro", "text": "Low debt — near debt-free"})
        elif de > 100:
            signals.append({"type": "con", "text": f"High debt-to-equity ratio ({de:.0f}%)"})

    # Dividend
    if annual_pl:
        latest = annual_pl[0]
        has_div = latest.get("dividend_per_share") and latest["dividend_per_share"] > 0
        net = latest.get("net_profit")
        if not has_div and net and net > 0:
            signals.append({"type": "con", "text": "Company has not paid dividends despite consistent profits"})
        elif has_div:
            signals.append({"type": "pro", "text": "Pays regular dividends"})

    # Debtor days trend
    debtor = eff.get("debtor_days")
    if debtor is not None and debtor > 90:
        signals.append({"type": "con", "text": f"High debtor days ({debtor:.0f} days) — receivables piling up"})
    elif debtor is not None and debtor < 30:
        signals.append({"type": "pro", "text": f"Low debtor days ({debtor:.0f} days) — efficient collections"})

    # Margin stability
    if len(annual_pl) >= 2:
        latest_margin = annual_pl[0].get("op_margin")
        prev_margin = annual_pl[1].get("op_margin")
        if latest_margin is not None and prev_margin is not None:
            if latest_margin >= 20:
                signals.append({"type": "pro", "text": f"High operating margin ({latest_margin:.0f}%)"})
            if latest_margin < prev_margin - 5:
                signals.append({"type": "con", "text": f"Operating margin contracted from {prev_margin:.0f}% to {latest_margin:.0f}%"})

    return signals


def _shareholding(ticker) -> dict | None:
    try:
        info = ticker.info or {}
        insider = _safe_float(info.get("heldPercentInsiders"))
        inst = _safe_float(info.get("heldPercentInstitutions"))
        if insider is None and inst is None:
            return None
        insider_pct = (insider or 0.0) * 100
        inst_pct = (inst or 0.0) * 100
        public_pct = max(0.0, 100.0 - insider_pct - inst_pct)
        return {
            "promoters": round(insider_pct, 1),
            "institutions": round(inst_pct, 1),
            "public_other": round(public_pct, 1),
        }
    except Exception:
        logger.warning("Shareholding parse failed", exc_info=True)
        return None
