import { StrictMode } from "react";
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
import { PlanningPage } from "./pages/Planning.js";
import { GuideApp } from "./guide/GuideApp.js";
import { AppShell } from "./components/app-shell.js";
import { ThemeEffects } from "./components/theme-effects.js";
import { NotificationCenterProvider } from "./lib/useNotificationCenter.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme>
      <ThemeEffects />
      <BrowserRouter>
        <Routes>
          <Route path="/guide" element={<GuideApp />} />
          <Route element={<NotificationCenterProvider><AppShell /></NotificationCenterProvider>}>
            <Route path="/" element={<HubPage />} />
            <Route path="/sessions/:id" element={<ConversationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/notifications" element={<NotificationsPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/:slug" element={<DocPage />} />
            <Route path="/planning" element={<PlanningPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
