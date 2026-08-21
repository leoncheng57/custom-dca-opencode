import { useEffect, useRef, useState } from "react";
import { Search, Smartphone } from "lucide-react";
import { useTheme } from "next-themes";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Badge } from "../ds/badge.js";
import { Button } from "../ds/button.js";
import { CommandPalette } from "../ds/command-palette.js";
import { api, type SessionSummary } from "../lib/api.js";
import { useNotificationCenter } from "../lib/useNotificationCenter.js";
import {
  DIRECTORY_STORAGE_KEY,
  buildPaletteCommands,
  rankPaletteCommands,
  resolvePaletteDirectory,
  type PaletteCommand,
} from "../lib/palette.js";
import { selectPhoneUrl } from "../lib/phoneTransfer.js";
import { useNotifyWatcher } from "../lib/useNotifyWatcher.js";
import { PhoneTransferDialog } from "./phone-transfer-dialog.js";

export function AppShell() {
  const { activeCount, refresh } = useNotificationCenter();
  useNotifyWatcher(refresh);
  const location = useLocation();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteSessions, setPaletteSessions] = useState<SessionSummary[]>([]);
  const [paletteStatus, setPaletteStatus] = useState<string | undefined>();
  const paletteRequest = useRef(0);

  const directory = resolvePaletteDirectory(location.search, localStorage.getItem(DIRECTORY_STORAGE_KEY));
  const scopedPath = (path: string) =>
    directory ? `${path}?${new URLSearchParams({ directory })}` : path;

  const openPhoneTransfer = async () => {
    let configuredUrl: string | null = null;
    try {
      configuredUrl = (await api.appConfig()).publicAppUrl;
    } catch {
      // The browser origin is still useful when the optional config route is unavailable.
    }
    setPhoneUrl(selectPhoneUrl(configuredUrl, window.location.origin));
  };

  const closePalette = () => {
    paletteRequest.current += 1;
    setPaletteOpen(false);
  };

  const openPalette = () => {
    if (phoneUrl) return;
    const request = ++paletteRequest.current;
    setPaletteOpen(true);
    setPaletteQuery("");
    setPaletteSessions([]);
    if (!directory) {
      setPaletteStatus("Set a project directory to search conversations.");
      return;
    }

    setPaletteStatus("Loading conversations...");
    void api
      .sessions(directory, 100)
      .then(({ sessions }) => {
        if (request !== paletteRequest.current) return;
        setPaletteSessions(sessions);
        setPaletteStatus(sessions.length ? undefined : "No conversations in this project.");
      })
      .catch(() => {
        if (request !== paletteRequest.current) return;
        setPaletteStatus("Conversation search unavailable; commands still work.");
      });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      if (paletteOpen) closePalette();
      else openPalette();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });

  const commands = buildPaletteCommands({
    navigation: [
      { id: "home", title: "Home", to: scopedPath("/"), keywords: ["sessions"] },
      { id: "tools", title: "Tools", to: scopedPath("/tools"), keywords: ["mcp", "lsp", "permissions"] },
      {
        id: "notifications",
        title: "Notifications",
        to: scopedPath("/settings/notifications"),
        ...(activeCount > 0 ? { subtitle: `${activeCount} unresolved` } : {}),
      },
      { id: "settings", title: "Settings", to: scopedPath("/settings") },
    ],
    actions: [
      {
        id: "open-phone",
        title: "Open on phone",
        subtitle: "Show the phone transfer QR code",
        keywords: ["phone", "qr", "transfer"],
        run: () => void openPhoneTransfer(),
      },
      ...(["system", "light", "dark"] as const).map((appearance) => ({
        id: `appearance-${appearance}`,
        title: `Use ${appearance[0].toUpperCase()}${appearance.slice(1)} appearance`,
        subtitle: appearance === "system" ? "Follow this device's color scheme" : `Always use ${appearance} mode`,
        keywords: ["appearance", "theme", "light", "dark", "system"],
        run: () => setTheme(appearance),
      })),
    ],
    sessions: paletteSessions,
  });
  const rankedCommands = rankPaletteCommands(commands, paletteQuery);

  const selectCommand = (command: PaletteCommand) => {
    closePalette();
    if (command.to) {
      navigate(command.to);
      return;
    }
    command.run?.();
  };

  return (
    <div className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col" inert={paletteOpen ? true : undefined}>
        <nav className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-border-default)] px-3" aria-label="Main">
          <NavLink to={scopedPath("/")} className="mr-auto text-sm font-bold tracking-tight" data-testid="opencode-nav-home">
            OpenCode
          </NavLink>
          <Button
            aria-label="Search commands"
            aria-keyshortcuts="Meta+K Control+K"
            className="w-8 shrink-0 px-0"
            size="sm"
            title="Search commands (Cmd/Ctrl+K)"
            type="button"
            variant="secondary"
            onClick={openPalette}
            data-testid="opencode-palette-open"
          >
            <Search aria-hidden="true" size={16} />
          </Button>
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
          ].map(([to, label]) => {
            const badged = label === "Notifications" && activeCount > 0;
            return (
              <NavLink
                key={to}
                to={scopedPath(to)}
                // The count is in the label so screen readers announce it; the
                // badge itself is decorative.
                aria-label={badged ? `${label}, ${activeCount} unresolved` : undefined}
                className={({ isActive }) =>
                  `relative flex items-center rounded px-2 py-1 text-xs ${isActive ? "bg-[var(--color-background-surface-neutral-muted)] font-semibold" : "text-[var(--color-text-muted)]"}`
                }
                data-testid={`opencode-nav-${label.toLowerCase()}`}
              >
                {label}
                {badged && (
                  <Badge
                    variant="counter"
                    className="absolute -top-1 left-full -translate-x-1/2"
                    aria-hidden="true"
                    data-testid="opencode-nav-notifications-badge"
                  >
                    {activeCount}
                  </Badge>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        commands={rankedCommands}
        query={paletteQuery}
        status={paletteStatus}
        onClose={closePalette}
        onQueryChange={setPaletteQuery}
        onSelect={selectCommand}
      />
      {phoneUrl && <PhoneTransferDialog targetUrl={phoneUrl} onClose={() => setPhoneUrl(null)} />}
    </div>
  );
}
