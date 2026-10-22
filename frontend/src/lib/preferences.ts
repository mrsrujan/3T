const DEFAULT_TOP_N_KEY = "stocks-tracker-default-top-n";
const API_BASE_URL_KEY = "stocks-tracker-api-base-url";

// Runtime override for the build-time VITE_API_BASE_URL. Exists mainly for
// the Android APK, where the backend address is baked in at build time and
// would otherwise require a rebuild whenever the PC's LAN IP changes.
export function getApiBaseUrlOverride(): string | null {
  const raw = localStorage.getItem(API_BASE_URL_KEY);
  return raw && raw.trim() ? raw.trim().replace(/\/+$/, "") : null;
}

export function setApiBaseUrlOverride(url: string | null) {
  if (url && url.trim()) {
    localStorage.setItem(API_BASE_URL_KEY, url.trim());
  } else {
    localStorage.removeItem(API_BASE_URL_KEY);
  }
}

export function getDefaultTopN(): number {
  const raw = localStorage.getItem(DEFAULT_TOP_N_KEY);
  const n = raw ? Number(raw) : NaN;
  return [10, 25, 50, 100].includes(n) ? n : 25;
}

export function setDefaultTopN(n: number) {
  localStorage.setItem(DEFAULT_TOP_N_KEY, String(n));
}

