import { useHoldings, useHoldingsSummary } from "../hooks/useHoldings";
import { PortfolioSummaryCards } from "../components/portfolio/PortfolioSummaryCards";
import { AddHoldingForm } from "../components/portfolio/AddHoldingForm";
import { HoldingsTable } from "../components/portfolio/HoldingsTable";
import { AllocationDonut } from "../components/portfolio/AllocationDonut";
import { PortfolioRiskPanel } from "../components/portfolio/PortfolioRiskPanel";
import { SkeletonCards, SkeletonTable } from "../components/common/Skeleton";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";

export function PortfolioPage() {
  const { data: holdings, isLoading: holdingsLoading, error: holdingsError } = useHoldings();
  const { data: summary, isLoading: summaryLoading } = useHoldingsSummary();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">My Portfolio</h2>

      {summaryLoading && <SkeletonCards />}
      {summary && !summaryLoading && <PortfolioSummaryCards summary={summary} />}

      <AddHoldingForm />

      {holdingsLoading && <SkeletonTable rows={4} />}
      {holdingsError && <ErrorBanner message="Failed to load holdings." />}
      {holdings && !holdingsLoading && holdings.items.length === 0 && (
        <EmptyState
          icon={<svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>}
          title="No holdings tracked yet"
          description="No holdings tracked yet. Add your first position."
        />
      )}
      {holdings && !holdingsLoading && holdings.items.length > 0 && <HoldingsTable items={holdings.items} />}

      {summary && summary.allocation.length > 0 && (
        <div className="mt-6">
          <AllocationDonut allocation={summary.allocation} />
        </div>
      )}

      <PortfolioRiskPanel />
    </div>
  );
}
