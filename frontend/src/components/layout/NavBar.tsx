import { NavLink } from "react-router-dom";
import { RefreshButton } from "./RefreshButton";
import { SearchBar } from "../search/SearchBar";
import { AlertBell } from "../alerts/AlertBell";
import { SettingsLink } from "./SettingsLink";
import { ThemeToggle } from "./ThemeToggle";


export function NavBar() {
  return (
    <header className="sticky top-0 z-20 h-14 border-b border-slate-200 bg-white/90 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90">
      <div className="flex h-full items-center gap-3 px-4">
        <NavLink to="/" className="mr-2 flex items-center gap-2 shrink-0">
          <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="7" fill="#0f172a"/>
            <rect x="4" y="21" width="5" height="7" rx="1.2" fill="#0e7490"/>
            <rect x="10.5" y="16" width="5" height="12" rx="1.2" fill="#0891b2"/>
            <rect x="17" y="10" width="5" height="18" rx="1.2" fill="#06b6d4"/>
            <rect x="23.5" y="5" width="5" height="23" rx="1.2" fill="#22d3ee"/>
            <polyline points="6.5,19.5 13,14 19.5,8.5 26,3.5" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="26" cy="3.5" r="2" fill="#f97316"/>
          </svg>
          <span className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
            Stock Mantra
          </span>
        </NavLink>
        <SearchBar />
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <AlertBell />
          <SettingsLink />
          <RefreshButton />
        </div>
      </div>
    </header>
  );
}
