import { DayPicker } from "react-day-picker";
import { format, parseISO } from "date-fns";

// Tailwind classNames mapped onto react-day-picker v10's UI/DayFlag/SelectionState
// keys, matching this app's slate/indigo design language instead of the
// library's default stylesheet.
const CLASS_NAMES = {
  root: "text-sm relative",
  months: "flex flex-col",
  month: "space-y-2 relative",
  month_caption: "flex items-center justify-center px-8 py-1",
  caption_label: "text-sm font-medium text-slate-700 dark:text-slate-200",
  nav: "flex items-center justify-between absolute inset-x-0 top-0",
  button_previous:
    "h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800",
  button_next:
    "h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800",
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "text-slate-400 w-8 h-8 text-xs font-medium flex items-center justify-center",
  weeks: "",
  week: "flex",
  day: "w-8 h-8 p-0 text-center",
  day_button:
    "w-8 h-8 rounded-md text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 " +
    "disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed dark:disabled:text-slate-700",
  today: "font-semibold text-cyan-600 dark:text-cyan-400",
  selected: "!bg-cyan-600 !text-white hover:!bg-cyan-600",
  outside: "text-slate-300 dark:text-slate-700",
  hidden: "invisible",
};

interface Props {
  availableDates: string[];
  mode: "single" | "multiple";
  selected: string[];
  onChange: (dates: string[]) => void;
}

export function AvailableDaysCalendar({ availableDates, mode, selected, onChange }: Props) {
  const availableSet = new Set(availableDates);
  const isUnavailable = (day: Date) => !availableSet.has(format(day, "yyyy-MM-dd"));

  const defaultMonth = selected[0]
    ? parseISO(selected[0])
    : availableDates[0]
      ? parseISO(availableDates[0])
      : undefined;

  if (mode === "single") {
    return (
      <DayPicker
        mode="single"
        selected={selected[0] ? parseISO(selected[0]) : undefined}
        onSelect={(day) => onChange(day ? [format(day, "yyyy-MM-dd")] : [])}
        disabled={isUnavailable}
        defaultMonth={defaultMonth}
        classNames={CLASS_NAMES}
        showOutsideDays
      />
    );
  }

  return (
    <DayPicker
      mode="multiple"
      selected={selected.map((d) => parseISO(d))}
      onSelect={(days) => onChange((days ?? []).map((d) => format(d, "yyyy-MM-dd")))}
      disabled={isUnavailable}
      defaultMonth={defaultMonth}
      classNames={CLASS_NAMES}
      showOutsideDays
    />
  );
}
