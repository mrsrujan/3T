import { useTradingDays } from "../../hooks/useTradingDays";
import { AvailableDaysCalendar } from "../common/AvailableDaysCalendar";
import type { Market } from "../../api/types";

interface Props {
  market: Market;
  selected: string[];
  onChange: (dates: string[]) => void;
}

export function DateRangePicker({ market, selected, onChange }: Props) {
  const { data, isLoading } = useTradingDays(market, 60);

  if (isLoading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading dates…</p>;
  if (!data?.dates.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No dates available.</p>;
  }

  return (
    <div className="inline-block rounded-lg border border-slate-200 p-2 dark:border-slate-800">
      <AvailableDaysCalendar
        availableDates={data.dates}
        mode="multiple"
        selected={selected}
        onChange={onChange}
      />
      {selected.length > 0 && (
        <p className="mt-1 border-t border-slate-100 px-1 pt-1 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {selected.length} date{selected.length === 1 ? "" : "s"} selected
        </p>
      )}
    </div>
  );
}
