// Table — design-system addition (LDI Sync board). Thin styled wrappers over native elements.
import React from "react";

type DivProps = React.HTMLAttributes<HTMLTableElement>;
type RowProps = React.HTMLAttributes<HTMLTableRowElement>;
type CellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export function Table({ className = "", ...p }: DivProps): React.ReactElement {
  return <table className={`w-full border-collapse text-sm ${className}`} {...p} />;
}
export function THead(p: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement {
  return <thead {...p} />;
}
export function TBody(p: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement {
  return <tbody {...p} />;
}
export function TR({ className = "", ...p }: RowProps): React.ReactElement {
  return <tr className={`border-b border-[var(--color-border-default)] ${className}`} {...p} />;
}
export function TH({ className = "", ...p }: CellProps): React.ReactElement {
  return <th className={`px-2 py-1.5 text-left font-medium text-[var(--color-text-muted)] ${className}`} {...p} />;
}
export function TD({ className = "", ...p }: CellProps): React.ReactElement {
  return <td className={`px-2 py-1.5 align-top ${className}`} {...p} />;
}
