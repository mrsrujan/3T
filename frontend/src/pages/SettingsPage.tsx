import { useTheme, type ThemeMode } from "../context/ThemeContext";
import {
  getApiBaseUrlOverride,
  getDefaultTopN,
  setApiBaseUrlOverride,
  setDefaultTopN,
} from "../lib/preferences";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match system" },
];

const TOP_N_OPTIONS = [10, 25, 50, 100];

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 py-4 last:border-0 dark:border-slate-800">
      <div>
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>
      </div>
      {children}
    </div>
  );
}

function ApiServerSetting() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(getApiBaseUrlOverride() ?? "");
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  async function testAndSave() {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (!trimmed) {
      setApiBaseUrlOverride(null);
      setStatus("idle");
      queryClient.invalidateQueries();
      return;
    }
    setStatus("testing");
    try {
      const res = await fetch(`${trimmed}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(String(res.status));
      setApiBaseUrlOverride(trimmed);
      setStatus("ok");
      // Everything cached so far came from the old server.
      queryClient.invalidateQueries();
    } catch {
      setStatus("fail");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setStatus("idle");
          }}
          placeholder="http://10.0.0.238:8010"
          className="w-56 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <button
          onClick={testAndSave}
          disabled={status === "testing"}
          className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          {status === "testing" ? "Testing…" : "Test & save"}
        </button>
      </div>
      {status === "ok" && (
        <span className="text-xs text-emerald-600 dark:text-emerald-400">Connected and saved.</span>
      )}
      {status === "fail" && (
        <span className="text-xs text-red-600 dark:text-red-400">
          Couldn't reach that address — not saved.
        </span>
      )}
    </div>
  );
}

function NotificationSetting() {
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported",
  );

  if (permission === "unsupported") {
    return <span className="text-xs text-slate-400">Not supported in this browser.</span>;
  }
  if (permission === "granted") {
    return <span className="text-xs text-emerald-600 dark:text-emerald-400">Enabled.</span>;
  }
  if (permission === "denied") {
    return (
      <span className="text-xs text-slate-400">
        Blocked — re-enable in your browser's site settings.
      </span>
    );
  }
  return (
    <button
      onClick={async () => setPermission(await Notification.requestPermission())}
      className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700"
    >
      Enable notifications
    </button>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [topN, setTopN] = useState(getDefaultTopN());

  function handleTopNChange(n: number) {
    setTopN(n);
    setDefaultTopN(n);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h2 className="mb-1 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Preferences are saved on this device only.
      </p>

      <div className="rounded-lg border border-slate-200 px-4 dark:border-slate-800">
        <SettingRow label="Theme" description="Override your OS light/dark preference.">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  theme === opt.value
                    ? "bg-cyan-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Default Top-N" description="How many rows rankings tables show by default.">
          <select
            value={topN}
            onChange={(e) => handleTopNChange(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {TOP_N_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          label="Alert notifications"
          description="System notification when an alert triggers (while the app is open)."
        >
          <NotificationSetting />
        </SettingRow>

        <SettingRow
          label="API server"
          description="Backend address. Leave blank to use the built-in default. Useful on the Android app if the PC's IP changes."
        >
          <ApiServerSetting />
        </SettingRow>

      </div>
    </div>
  );
}
