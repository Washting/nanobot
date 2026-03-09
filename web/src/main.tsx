import { StrictMode, Suspense, lazy, useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ToastViewport } from "@/components/ui/ToastViewport";
import { StatusPill } from "@/components/primitives/StatusPill";
import { useAppStore } from "@/lib/store";

import "@/styles/globals.css";

const ChatPage = lazy(() => import("@/routes/index"));
const ConfigPage = lazy(() => import("@/routes/config"));
const SessionsPage = lazy(() => import("@/routes/sessions"));
const LogsPage = lazy(() => import("@/routes/logs"));
const MonitoringPage = lazy(() => import("@/routes/monitoring"));

type SidebarIconName = "chat" | "config" | "sessions" | "logs" | "monitoring";

type SidebarNavItem = {
  to: string;
  label: string;
  icon: SidebarIconName;
};

const navGroups: Array<{ label: string; items: SidebarNavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Chat", icon: "chat" },
      { to: "/config", label: "Config", icon: "config" },
      { to: "/sessions", label: "Sessions", icon: "sessions" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/logs", label: "Logs", icon: "logs" },
      { to: "/monitoring", label: "Monitoring", icon: "monitoring" },
    ],
  },
];

const SIDEBAR_COLLAPSED_KEY = "nanobot_sidebar_collapsed";

function getInitialSidebarCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

function PageLoader() {
  return (
    <div className="loading-overlay">
      <span className="loading-dot" />
      <p>Loading module...</p>
    </div>
  );
}

function SidebarIcon({ name }: { name: SidebarIconName }) {
  if (name === "chat") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6.75 4A2.75 2.75 0 0 0 4 6.75v7.1A2.75 2.75 0 0 0 6.75 16.6h.35v2.67c0 .48.57.74.94.42l3.72-3.1h5.49A2.75 2.75 0 0 0 20 13.85v-7.1A2.75 2.75 0 0 0 17.25 4z" />
      </svg>
    );
  }
  if (name === "config") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 7a1 1 0 0 1 1-1h6.1a2.9 2.9 0 0 1 5.8 0H19a1 1 0 1 1 0 2h-2.1a2.9 2.9 0 0 1-5.8 0H5a1 1 0 0 1-1-1M4 17a1 1 0 0 1 1-1h2.1a2.9 2.9 0 0 1 5.8 0H19a1 1 0 1 1 0 2h-6.1a2.9 2.9 0 0 1-5.8 0H5a1 1 0 0 1-1-1" />
      </svg>
    );
  }
  if (name === "sessions") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5.8 4h4.4A1.8 1.8 0 0 1 12 5.8v4.4A1.8 1.8 0 0 1 10.2 12H5.8A1.8 1.8 0 0 1 4 10.2V5.8A1.8 1.8 0 0 1 5.8 4M13.8 4h4.4A1.8 1.8 0 0 1 20 5.8v4.4a1.8 1.8 0 0 1-1.8 1.8h-4.4a1.8 1.8 0 0 1-1.8-1.8V5.8A1.8 1.8 0 0 1 13.8 4M5.8 12h4.4a1.8 1.8 0 0 1 1.8 1.8v4.4A1.8 1.8 0 0 1 10.2 20H5.8A1.8 1.8 0 0 1 4 18.2v-4.4A1.8 1.8 0 0 1 5.8 12M13.8 12h4.4a1.8 1.8 0 0 1 1.8 1.8v4.4a1.8 1.8 0 0 1-1.8 1.8h-4.4a1.8 1.8 0 0 1-1.8-1.8v-4.4a1.8 1.8 0 0 1 1.8-1.8" />
      </svg>
    );
  }
  if (name === "logs") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5.8 4A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20h12.4a1.8 1.8 0 0 0 1.8-1.8V5.8A1.8 1.8 0 0 0 18.2 4zm2.1 3h8.2c.5 0 .9.4.9.9s-.4.9-.9.9H7.9a.9.9 0 0 1 0-1.8m0 4h8.2c.5 0 .9.4.9.9s-.4.9-.9.9H7.9a.9.9 0 0 1 0-1.8m0 4h5.1c.5 0 .9.4.9.9s-.4.9-.9.9H7.9a.9.9 0 0 1 0-1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.8 19.2h16.4c.5 0 .8.3.8.8s-.3.8-.8.8H3.8a.8.8 0 0 1 0-1.6M5.2 18a1.2 1.2 0 0 1-1.2-1.2V9.2A1.2 1.2 0 0 1 5.2 8h1.6A1.2 1.2 0 0 1 8 9.2v7.6A1.2 1.2 0 0 1 6.8 18zm6 0a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 11.2 5h1.6A1.2 1.2 0 0 1 14 6.2v10.6a1.2 1.2 0 0 1-1.2 1.2zm6 0a1.2 1.2 0 0 1-1.2-1.2v-5.6a1.2 1.2 0 0 1 1.2-1.2h1.6a1.2 1.2 0 0 1 1.2 1.2v5.6a1.2 1.2 0 0 1-1.2 1.2z" />
    </svg>
  );
}

function ShellHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const token = useAppStore((state) => state.ui.token);
  const phase = useAppStore((state) => state.connection.phase);
  const reconnectInMs = useAppStore((state) => state.connection.reconnectInMs);
  const setToken = useAppStore((state) => state.actions.setToken);
  const addToast = useAppStore((state) => state.actions.addToast);
  const [draft, setDraft] = useState(token);

  return (
    <header className="shell-header card">
      <div>
        <div className="shell-header-row">
          <Button
            className="mobile-nav-toggle"
            variant="ghost"
            size="sm"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            Menu
          </Button>
          <p className="brand-tag">Nanobot Interface</p>
        </div>
        <h1 className="brand-title">Control Surface</h1>
        <p className="brand-subtitle">
          Live conversation, runtime controls, and observability in one workspace.
        </p>
      </div>
      <div className="header-actions">
        <StatusPill phase={phase} countdownMs={reconnectInMs} />
        <div className="token-editor">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Bearer token"
            aria-label="Nanobot token"
          />
          <Button
            variant="secondary"
            onClick={() => {
              setToken(draft.trim());
              addToast("Token updated", "Realtime reconnection will use the new token.", "success");
            }}
          >
            Save token
          </Button>
        </div>
      </div>
    </header>
  );
}

function Shell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore persistence failure
      }
      return next;
    });
  };

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`}
    >
      <aside className="sidebar card" aria-label="Main menu">
        <div className="sidebar-header">
          <div className="sidebar-brand-copy">
            <p className="brand-tag">Nanobot</p>
            <p className="sidebar-brand-title">Workspace</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="sidebar-toggle-text">{sidebarCollapsed ? "Expand" : "Collapse"}</span>
            <span className="sidebar-toggle-mini" aria-hidden="true">
              {sidebarCollapsed ? "+" : "-"}
            </span>
          </Button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navGroups.map((group) => (
            <section className="sidebar-group" key={group.label}>
              <p className="sidebar-group-label">{group.label}</p>
              <div className="sidebar-group-items">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="sidebar-link"
                    activeProps={{ className: "sidebar-link active" }}
                    onClick={() => setMobileOpen(false)}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      <SidebarIcon name={item.icon} />
                    </span>
                    <span className="sidebar-link-label">{item.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <button
        type="button"
        className="sidebar-overlay"
        aria-label="Close menu"
        onClick={() => setMobileOpen(false)}
      />

      <div className="content-shell">
        <ShellHeader onMenuClick={() => setMobileOpen((v) => !v)} />
        <main className="page-container">
          <Outlet />
        </main>
      </div>
      <ToastViewport />
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <ChatPage />
    </Suspense>
  ),
});

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/config",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <ConfigPage />
    </Suspense>
  ),
});

const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <SessionsPage />
    </Suspense>
  ),
});

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/logs",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <LogsPage />
    </Suspense>
  ),
});

const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/monitoring",
  component: () => (
    <Suspense fallback={<PageLoader />}>
      <MonitoringPage />
    </Suspense>
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  configRoute,
  sessionsRoute,
  logsRoute,
  monitoringRoute,
]);

const router = createRouter({ routeTree });
const queryClient = new QueryClient();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
