import { useEffect, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  NavLink,
  Outlet,
  useLocation,
} from "react-router";
import {
  LayoutDashboard,
  Layers,
  ShieldAlert,
  Sliders,
  BarChart3,
  Database,
  Sun,
  Moon,
} from "lucide-react";
import { ReadinessDashboardPage } from "./pages/ReadinessDashboardPage";
import { QueueReviewPage } from "./pages/QueueReviewPage";
import { ShortlistPage } from "./pages/ShortlistPage";
import { ScenariosPage } from "./pages/ScenariosPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";

function Layout() {
  const location = useLocation();
  const [anomalyCount, setAnomalyCount] = useState<number | null>(null);
  const [indicatorCount, setIndicatorCount] = useState<number | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return "dark"; // Default to dark since it is very premium
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const fetchCounts = async () => {
    try {
      const [readinessRes, indicatorRes] = await Promise.all([
        fetch("/api/readiness/summary"),
        fetch("/api/indicator-reviews/summary"),
      ]);

      if (readinessRes.ok) {
        const data = await readinessRes.json();
        const pending = Number(data.totals?.pending ?? 0);
        const reopened = Number(data.totals?.reopened ?? 0);
        setAnomalyCount(pending + reopened);
      }

      if (indicatorRes.ok) {
        const data = await indicatorRes.json();
        const pending = Number(data.totals?.pending ?? 0);
        const reopened = Number(data.totals?.reopened ?? 0);
        setIndicatorCount(pending + reopened);
      }
    } catch (err) {
      console.error("Failed to load layout counts:", err);
    }
  };

  useEffect(() => {
    void fetchCounts();
    window.addEventListener("review-saved", fetchCounts);
    
    // Fallback polling every 15s to keep in sync with other clients
    const interval = setInterval(fetchCounts, 15000);
    
    return () => {
      window.removeEventListener("review-saved", fetchCounts);
      clearInterval(interval);
    };
  }, []);

  const isQueueActive = location.pathname.startsWith("/queue/");

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 border ${
      isActive
        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
        : "text-muted-foreground hover:text-foreground dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border-transparent"
    }`;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between transition-colors duration-200">
        <div className="flex items-center gap-8 w-full">
          {/* Logo / Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-lg shadow-purple-500/20">
              <Database className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
                Data Readiness
              </h1>
              <span className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase leading-none mt-0.5 block">
                Control Desk
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <NavLink to="/" end className={linkClass}>
              <LayoutDashboard className="h-3.5 w-3.5" />
              Overview
            </NavLink>

            <NavLink
              to="/queue/zip"
              className={() =>
                `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 border ${
                  isQueueActive
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                    : "text-muted-foreground hover:text-foreground dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border-transparent"
                }`
              }
            >
              <Layers className="h-3.5 w-3.5" />
              Anomaly Review
              {anomalyCount !== null && anomalyCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-amber-950 dark:bg-amber-500 dark:text-amber-950 animate-pulse">
                  {anomalyCount}
                </span>
              )}
            </NavLink>

            <NavLink to="/indicators" className={linkClass}>
              <ShieldAlert className="h-3.5 w-3.5" />
              Indicator Review
              {indicatorCount !== null && indicatorCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500 text-purple-100">
                  {indicatorCount}
                </span>
              )}
            </NavLink>

            <NavLink to="/scenarios" className={linkClass}>
              <Sliders className="h-3.5 w-3.5" />
              Scenarios
            </NavLink>

            <NavLink to="/analytics" className={linkClass}>
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </NavLink>
          </nav>
        </div>

        {/* Right Label & Theme Toggle */}
        <div className="flex items-center gap-3.5 shrink-0">
          <button
            onClick={toggleTheme}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-secondary/80 text-foreground transition-all duration-200 cursor-pointer"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-purple-600" />
            )}
          </button>

          <div className="flex items-center gap-1.5 bg-success/10 border border-success/20 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest text-success uppercase">
            <span className="pulse-indicator bg-success" />
            Live Ops
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 w-full animate-fade-in-up">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <ReadinessDashboardPage /> },
      { path: "/queue/:fieldName", element: <QueueReviewPage /> },
      { path: "/shortlist", element: <Navigate to="/indicators" replace /> },
      { path: "/indicators", element: <ShortlistPage /> },
      { path: "/scenarios", element: <ScenariosPage /> },
      { path: "/analytics", element: <AnalyticsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
