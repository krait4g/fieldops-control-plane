"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { TableSkeleton } from "./skeleton";
import { useI18n } from "@/shared/i18n";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  minWidth?: number;
  hideBelow?: "xl" | "lg" | "md";
  align?: "left" | "right";
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  emptyView: ReactNode;
  loading: boolean;
  nextCursor?: string | null;
  onNextPage?: () => void;
  ariaLabel: string;
}

const hideClass: Record<NonNullable<DataTableColumn<unknown>["hideBelow"]>, string> = {
  xl: "hidden xl:table-cell",
  lg: "hidden lg:table-cell",
  md: "hidden md:table-cell",
};

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  emptyView,
  loading,
  nextCursor,
  onNextPage,
  ariaLabel,
}: DataTableProps<T>) {
  const { messages } = useI18n();
  if (loading) {
    return <TableSkeleton rows={Math.max(3, Math.min(rows.length, 5))} />;
  }

  if (rows.length === 0) {
    return <>{emptyView}</>;
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      className="overflow-x-auto rounded-sm"
    >
      <table className="w-full border-collapse text-left" aria-label={ariaLabel}>
        <thead>
          <tr className="border-b border-border-subtle">
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted",
                  column.align === "right" && "text-right",
                  column.hideBelow && hideClass[column.hideBelow],
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            return (
              <tr key={id} className="border-b border-border-subtle/60 transition-colors hover:bg-console-surface-2 focus-within:bg-console-surface-2">
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5 text-xs text-text-primary",
                      column.align === "right" && "text-right",
                      column.hideBelow && hideClass[column.hideBelow],
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {nextCursor && onNextPage ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onNextPage}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
          >
            {messages.actions.nextPage}
          </button>
        </div>
      ) : null}
    </div>
  );
}
