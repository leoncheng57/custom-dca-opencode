import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";

import { ThemeEffects } from "../components/theme-effects.js";
import { GuideApp } from "./GuideApp.js";
import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme>
      <ThemeEffects />
      <GuideApp />
    </ThemeProvider>
  </StrictMode>,
);
