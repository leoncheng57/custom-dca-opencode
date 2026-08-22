import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, MoreHorizontal, Settings, Smartphone, Wrench } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Button } from "../ds/button.js";
import { cn } from "../ds/utils.js";

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-2 rounded px-2 text-sm text-[var(--color-text-default)] " +
  "hover:bg-[var(--color-background-surface-neutral-muted)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]";

const LINKS = [
  { to: "/docs", label: "Docs", testId: "opencode-nav-docs", Icon: BookOpen },
  { to: "/tools", label: "Tools", testId: "opencode-nav-tools", Icon: Wrench },
  { to: "/settings", label: "Settings", testId: "opencode-nav-settings", Icon: Settings },
] as const;

/**
 * Secondary navigation. These destinations stay reachable — and stay in the
 * command palette unchanged — but they no longer compete with the brand,
 * search and the notification centre for the top bar.
 */
export function NavOverflowMenu({
  scopedPath,
  onOpenPhoneTransfer,
}: {
  scopedPath: (path: string) => string;
  onOpenPhoneTransfer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const moveFocus = (delta: number) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[(current + delta + items.length) % items.length].focus();
  };

  return (
    <div
      className="relative"
      ref={wrapperRef}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(event.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      <Button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More navigation"
        className="gap-1.5 px-2 pointer-coarse:min-h-11"
        onClick={() => (open ? close() : setOpen(true))}
        ref={triggerRef}
        size="sm"
        title="More navigation"
        type="button"
        variant="ghost"
        data-testid="opencode-nav-more"
      >
        <MoreHorizontal aria-hidden="true" size={16} />
        <span className="hidden sm:inline">More</span>
      </Button>
      {open && (
        <div
          aria-label="More navigation"
          className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-1 shadow-xl"
          id={menuId}
          ref={menuRef}
          role="menu"
          data-testid="opencode-nav-more-menu"
        >
          <button
            className={ITEM_CLASS}
            onClick={() => {
              close(false);
              onOpenPhoneTransfer();
            }}
            role="menuitem"
            type="button"
            data-testid="opencode-phone-transfer-open"
          >
            <Smartphone aria-hidden="true" size={15} />
            Phone
          </button>
          {LINKS.map(({ to, label, testId, Icon }) => (
            <NavLink
              key={to}
              className={({ isActive }) => cn(ITEM_CLASS, isActive && "bg-[var(--color-background-surface-neutral-muted)] font-semibold")}
              onClick={() => close(false)}
              role="menuitem"
              to={scopedPath(to)}
              data-testid={testId}
            >
              <Icon aria-hidden="true" size={15} />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
