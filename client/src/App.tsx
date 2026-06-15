import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  NavLink,
  Outlet,
} from "react-router";
import { ReadinessDashboardPage } from "./pages/ReadinessDashboardPage";
import { QueueReviewPage } from "./pages/QueueReviewPage";
import { ShortlistPage } from "./pages/ShortlistPage";
import { ScenariosPage } from "./pages/ScenariosPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-foreground/10 text-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`;

function Layout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Data Readiness Desk
          </h1>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/indicators" className={navLinkClass}>
              Indicator Review
            </NavLink>
            <NavLink to="/scenarios" className={navLinkClass}>
              Scenarios
            </NavLink>
            <NavLink to="/analytics" className={navLinkClass}>
              Analytics
            </NavLink>
          </nav>
        </div>
        <span className="text-xs text-muted-foreground uppercase tracking-widest">
          Data Ops
        </span>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
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
