import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { MarketProvider } from "./context/MarketContext";
import { ThemeProvider } from "./context/ThemeContext";
import { NavBar } from "./components/layout/NavBar";
import { Sidebar } from "./components/layout/Sidebar";
import { BottomTabBar } from "./components/layout/BottomTabBar";
import { LoadingSpinner } from "./components/common/LoadingSpinner";
import { ChatWidget } from "./components/ai/ChatWidget";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const RankingsPage = lazy(() => import("./pages/RankingsPage").then((m) => ({ default: m.RankingsPage })));
const StockDetailPage = lazy(() => import("./pages/StockDetailPage").then((m) => ({ default: m.StockDetailPage })));
const HeatmapPage = lazy(() => import("./pages/HeatmapPage").then((m) => ({ default: m.HeatmapPage })));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage").then((m) => ({ default: m.WatchlistPage })));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage").then((m) => ({ default: m.PortfolioPage })));
const AlertsPage = lazy(() => import("./pages/AlertsPage").then((m) => ({ default: m.AlertsPage })));
const MarketNewsPage = lazy(() => import("./pages/MarketNewsPage").then((m) => ({ default: m.MarketNewsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ScreenerPage = lazy(() => import("./pages/ScreenerPage").then((m) => ({ default: m.ScreenerPage })));
const EarningsPage = lazy(() => import("./pages/EarningsPage").then((m) => ({ default: m.EarningsPage })));
const CalculatorsPage = lazy(() => import("./pages/CalculatorsPage").then((m) => ({ default: m.CalculatorsPage })));

function App() {
  return (
    <ThemeProvider>
      <MarketProvider>
        {/* Fixed top navbar */}
        <NavBar />

        {/* Below navbar: sidebar + scrollable content */}
        <div className="flex min-h-[calc(100vh-3.5rem)] pb-16 sm:pb-0">
          {/* Left sidebar — desktop only, fixed, handled inside Sidebar */}
          <Sidebar />

          {/* Main content — offset by sidebar width on desktop */}
          <main className="flex-1 min-w-0 lg:ml-56">
            <Suspense
              fallback={
                <div className="mx-auto max-w-6xl px-4 py-10">
                  <LoadingSpinner label="Loading…" />
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/rankings" element={<RankingsPage />} />
                <Route path="/stock/:market/:symbol" element={<StockDetailPage />} />
                <Route path="/heatmap" element={<HeatmapPage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/news" element={<MarketNewsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/screener" element={<ScreenerPage />} />
                <Route path="/earnings" element={<EarningsPage />} />
                <Route path="/calculators" element={<CalculatorsPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>

        <BottomTabBar />
        <ChatWidget />
      </MarketProvider>
    </ThemeProvider>
  );
}

export default App;
