import { NavLink, Outlet } from "react-router-dom";

import { useNotifyWatcher } from "../lib/useNotifyWatcher.js";

export function AppShell() {
  useNotifyWatcher();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-border-default)] px-3" aria-label="Main">
        <NavLink to="/" className="mr-auto text-sm font-bold tracking-tight" data-testid="opencode-nav-home">
          OpenCode
        </NavLink>
        {[
          ["/tools", "Tools"],
          ["/settings/notifications", "Notifications"],
          ["/settings", "Settings"],
        ].map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `rounded px-2 py-1 text-xs ${isActive ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold" : "text-[var(--color-text-muted)]"}`
            }
            data-testid={`opencode-nav-${label.toLowerCase()}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
