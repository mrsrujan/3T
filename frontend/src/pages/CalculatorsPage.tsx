import { useState } from "react";

// ── Generic helpers ──────────────────────────────────────────────────────────

function fmtCrore(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toFixed(0)}`;
}

function InputRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {value.toLocaleString("en-IN")}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-600"
      />
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className={`font-semibold ${highlight ? "text-cyan-600 dark:text-cyan-400" : "text-slate-800 dark:text-slate-200"}`}>
        {value}
      </span>
    </div>
  );
}

function CalcCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
      {children}
    </div>
  );
}

// ── SIP Calculator ────────────────────────────────────────────────────────────

function SipCalc() {
  const [monthly, setMonthly] = useState(5000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(10);

  const months = years * 12;
  const r = rate / 100 / 12;
  const fv = r === 0 ? monthly * months : monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  const invested = monthly * months;
  const gains = fv - invested;

  return (
    <CalcCard title="SIP Calculator">
      <div className="space-y-4 mb-5">
        <InputRow label="Monthly Investment" value={monthly} onChange={setMonthly} min={500} max={200000} step={500} suffix=" ₹" />
        <InputRow label="Expected Return (p.a.)" value={rate} onChange={setRate} min={1} max={30} step={0.5} suffix="%" />
        <InputRow label="Time Period" value={years} onChange={setYears} min={1} max={40} suffix=" yrs" />
      </div>
      <ResultRow label="Amount Invested" value={fmtCrore(invested)} />
      <ResultRow label="Estimated Returns" value={fmtCrore(gains)} />
      <ResultRow label="Total Value" value={fmtCrore(fv)} highlight />
    </CalcCard>
  );
}

// ── Lumpsum Calculator ────────────────────────────────────────────────────────

function LumpsumCalc() {
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(10);

  const fv = principal * Math.pow(1 + rate / 100, years);
  const gains = fv - principal;

  return (
    <CalcCard title="Lumpsum Calculator">
      <div className="space-y-4 mb-5">
        <InputRow label="Investment Amount" value={principal} onChange={setPrincipal} min={1000} max={10000000} step={1000} suffix=" ₹" />
        <InputRow label="Expected Return (p.a.)" value={rate} onChange={setRate} min={1} max={30} step={0.5} suffix="%" />
        <InputRow label="Time Period" value={years} onChange={setYears} min={1} max={40} suffix=" yrs" />
      </div>
      <ResultRow label="Amount Invested" value={fmtCrore(principal)} />
      <ResultRow label="Estimated Returns" value={fmtCrore(gains)} />
      <ResultRow label="Total Value" value={fmtCrore(fv)} highlight />
    </CalcCard>
  );
}

// ── CAGR Calculator ───────────────────────────────────────────────────────────

function CagrCalc() {
  const [initial, setInitial] = useState(100000);
  const [final, setFinal] = useState(250000);
  const [years, setYears] = useState(5);

  const cagr = (Math.pow(final / initial, 1 / years) - 1) * 100;

  return (
    <CalcCard title="CAGR Calculator">
      <div className="space-y-4 mb-5">
        <InputRow label="Initial Investment" value={initial} onChange={setInitial} min={1000} max={10000000} step={1000} suffix=" ₹" />
        <InputRow label="Final Value" value={final} onChange={setFinal} min={1000} max={50000000} step={1000} suffix=" ₹" />
        <InputRow label="Time Period" value={years} onChange={setYears} min={1} max={40} suffix=" yrs" />
      </div>
      <ResultRow label="Total Returns" value={`${(((final - initial) / initial) * 100).toFixed(1)}%`} />
      <ResultRow label="CAGR" value={`${cagr.toFixed(2)}%`} highlight />
    </CalcCard>
  );
}

// ── Fixed Deposit Calculator ──────────────────────────────────────────────────

function FdCalc() {
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(7);
  const [years, setYears] = useState(3);
  const [quarterly, setQuarterly] = useState(true);

  const n = quarterly ? 4 : 1;
  const fv = principal * Math.pow(1 + rate / 100 / n, n * years);
  const interest = fv - principal;

  return (
    <CalcCard title="Fixed Deposit Calculator">
      <div className="space-y-4 mb-5">
        <InputRow label="Principal Amount" value={principal} onChange={setPrincipal} min={1000} max={10000000} step={1000} suffix=" ₹" />
        <InputRow label="Interest Rate (p.a.)" value={rate} onChange={setRate} min={1} max={15} step={0.25} suffix="%" />
        <InputRow label="Tenure" value={years} onChange={setYears} min={1} max={10} suffix=" yrs" />
      </div>
      <div className="mb-3 flex gap-3">
        {[true, false].map((q) => (
          <button
            key={String(q)}
            onClick={() => setQuarterly(q)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              quarterly === q
                ? "bg-cyan-600 text-white"
                : "border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"
            }`}
          >
            {q ? "Quarterly compounding" : "Annual compounding"}
          </button>
        ))}
      </div>
      <ResultRow label="Principal" value={fmtCrore(principal)} />
      <ResultRow label="Interest Earned" value={fmtCrore(interest)} />
      <ResultRow label="Maturity Value" value={fmtCrore(fv)} highlight />
    </CalcCard>
  );
}

// ── SWP Calculator ────────────────────────────────────────────────────────────

function SwpCalc() {
  const [corpus, setCorpus] = useState(1000000);
  const [monthly, setMonthly] = useState(8000);
  const [rate, setRate] = useState(10);

  const r = rate / 100 / 12;
  // Months until corpus depletes: solve corpus * r / (1 - (1+r)^-n) = monthly
  // => (1+r)^-n = 1 - corpus*r/monthly => n = -log(1 - corpus*r/monthly)/log(1+r)
  let months = Infinity;
  const ratio = (corpus * r) / monthly;
  if (ratio < 1) {
    months = -Math.log(1 - ratio) / Math.log(1 + r);
  }
  const years = months === Infinity ? "∞" : `${(months / 12).toFixed(1)} yrs`;
  const total_withdrawn = months === Infinity ? monthly * 12 * 100 : monthly * months;

  return (
    <CalcCard title="SWP (Systematic Withdrawal) Calculator">
      <div className="space-y-4 mb-5">
        <InputRow label="Total Corpus" value={corpus} onChange={setCorpus} min={100000} max={50000000} step={100000} suffix=" ₹" />
        <InputRow label="Monthly Withdrawal" value={monthly} onChange={setMonthly} min={1000} max={500000} step={1000} suffix=" ₹" />
        <InputRow label="Expected Return (p.a.)" value={rate} onChange={setRate} min={1} max={20} step={0.5} suffix="%" />
      </div>
      <ResultRow label="Corpus lasts for" value={years} highlight />
      <ResultRow label="Total Withdrawn (est.)" value={months === Infinity ? "Indefinite" : fmtCrore(total_withdrawn)} />
    </CalcCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = ["SIP", "Lumpsum", "CAGR", "FD", "SWP"] as const;
type TabKey = typeof TABS[number];

export function CalculatorsPage() {
  const [tab, setTab] = useState<TabKey>("SIP");

  const tabContent: Record<TabKey, React.ReactNode> = {
    SIP: <SipCalc />,
    Lumpsum: <LumpsumCalc />,
    CAGR: <CagrCalc />,
    FD: <FdCalc />,
    SWP: <SwpCalc />,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h2 className="mb-6 text-base font-semibold text-slate-900 dark:text-slate-100">
        Financial Calculators
      </h2>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-cyan-600 text-white"
                : "border border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tabContent[tab]}

      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        Results are illustrative. Actual returns may vary. Not financial advice.
      </p>
    </div>
  );
}
