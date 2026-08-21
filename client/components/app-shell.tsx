import { useState } from "react";
import { Smartphone } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { Button } from "../ds/button.js";
import { api } from "../lib/api.js";
import { selectPhoneUrl } from "../lib/phoneTransfer.js";
import { useNotifyWatcher } from "../lib/useNotifyWatcher.js";
import { PhoneTransferDialog } from "./phone-transfer-dialog.js";

export function AppShell() {
  useNotifyWatcher();
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);

  const openPhoneTransfer = async () => {
    let configuredUrl: string | null = null;
    try {
      configuredUrl = (await api.appConfig()).publicAppUrl;
    } catch {
      // The browser origin is still useful when the optional config route is unavailable.
    }
    setPhoneUrl(selectPhoneUrl(configuredUrl, window.location.origin));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-border-default)] px-3" aria-label="Main">
        <NavLink to="/" className="mr-auto text-sm font-bold tracking-tight" data-testid="opencode-nav-home">
          OpenCode
        </NavLink>
        <Button
          aria-label="Open on phone"
          className="gap-1.5 px-2"
          size="sm"
          variant="ghost"
          onClick={() => void openPhoneTransfer()}
          data-testid="opencode-phone-transfer-open"
        >
          <Smartphone aria-hidden="true" size={15} />
          <span className="hidden sm:inline">Phone</span>
        </Button>
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
      {phoneUrl && <PhoneTransferDialog targetUrl={phoneUrl} onClose={() => setPhoneUrl(null)} />}
    </div>
  );
}
