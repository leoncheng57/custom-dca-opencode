import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";

import { HubPage } from "./pages/Hub.js";
import { ConversationPage } from "./pages/Conversation.js";
import { SettingsPage } from "./pages/Settings.js";
import { NotificationsPage } from "./pages/Notifications.js";
import { ToolsPage } from "./pages/Tools.js";
import { AppShell } from "./components/app-shell.js";
import { ThemeEffects } from "./components/theme-effects.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme>
      <ThemeEffects />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HubPage />} />
            <Route path="/sessions/:id" element={<ConversationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/notifications" element={<NotificationsPage />} />
            <Route path="/tools" element={<ToolsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
