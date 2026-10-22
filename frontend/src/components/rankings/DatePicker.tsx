import { useEffect, useRef, useState } from "react";
import { useTradingDays } from "../../hooks/useTradingDays";
import { AvailableDaysCalendar } from "../common/AvailableDaysCalendar";
import { todayInMarket } from "../../lib/marketTime";
import type { Market } from "../../api/types";

interface Props {
  market: Market;
  date: string;
  onChange: (date: string) => void;
}

export function DatePicker({ market, date, onChange }: Props) {
  const { data, isLoading } = useTradingDays(market, 60);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const todayIso = todayInMarket(market);
  const isToday = date === todayIso;
  // "Most recent available" doubles as "today" when today isn't a trading
  // day yet (market hasn't closed / data hasn't landed) or is a weekend/holiday.
  const mostRecentAvailable = data?.dates[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={isLoading || !data?.dates.length}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {isLoading ? "Loading dates…" : isToday ? `Today · ${date}` : date || "No dates available"}
      </button>
      {isOpen && data && data.dates.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <AvailableDaysCalendar
            availableDates={data.dates}
            mode="single"
            selected={date ? [date] : []}
            onChange={(dates) => {
              if (dates[0]) onChange(dates[0]);
              setIsOpen(false);
            }}
          />
          {mostRecentAvailable && mostRecentAvailable !== date && (
            <button
              type="button"
              onClick={() => {
                onChange(mostRecentAvailable);
                setIsOpen(false);
              }}
              className="mt-1 w-full rounded-md border-t border-slate-100 px-2 py-1.5 text-center text-xs font-medium text-cyan-600 hover:bg-slate-50 dark:border-slate-800 dark:text-cyan-400 dark:hover:bg-slate-800"
            >
              Jump to today ({mostRecentAvailable})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
