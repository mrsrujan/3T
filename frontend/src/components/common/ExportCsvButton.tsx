import { downloadCsv, type CsvColumn } from "../../lib/csv";

interface Props<T> {
  rows: T[];
  columns: CsvColumn<T>[];
  filename: string;
}

export function ExportCsvButton<T extends object>({ rows, columns, filename }: Props<T>) {
  return (
    <button
      onClick={() => downloadCsv(rows, columns, filename)}
      disabled={rows.length === 0}
      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      Export CSV
    </button>
  );
}
