import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";

import { HubPage } from "./pages/Hub.js";
import { ConversationPage } from "./pages/Conversation.js";
import { SettingsPage } from "./pages/Settings.js";
import { NotificationsPage } from "./pages/Notifications.js";
import { ToolsPage } from "./pages/Tools.js";
import { DocsPage } from "./pages/Docs.js";
import { DocPage } from "./pages/DocPage.js";
import { AppShell } from "./components/app-shell.js";
import { LoadingIndicator } from "./ds/loading-indicator.js";
import { ThemeEffects } from "./components/theme-effects.js";
import { NotificationCenterProvider } from "./lib/useNotificationCenter.js";

// The only lazily loaded route. xterm.js is ~250 kB and the terminal is off by
// default (AGENTS.md #16), so every other page would otherwise pay for a
// feature most deployments never enable.
const TerminalPage = lazy(async () => ({ default: (await import("./pages/Terminal.js")).TerminalPage }));
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme>
      <ThemeEffects />
      <BrowserRouter>
        <NotificationCenterProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HubPage />} />
              <Route path="/sessions/:id" element={<ConversationPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/notifications" element={<NotificationsPage />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route
                path="/terminal"
                element={
                  <Suspense fallback={<LoadingIndicator className="p-12" label="Loading terminal…" />}>
                    <TerminalPage />
                  </Suspense>
                }
              />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/docs/:slug" element={<DocPage />} />
            </Route>
          </Routes>
        </NotificationCenterProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
