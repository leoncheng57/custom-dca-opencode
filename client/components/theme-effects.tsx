import { useEffect } from "react";
import { useTheme } from "next-themes";

export function ThemeEffects() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    const frame = requestAnimationFrame(() => {
      const themeColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-browser-chrome")
        .trim();
      if (themeColor) {
        document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", themeColor);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return null;
}
