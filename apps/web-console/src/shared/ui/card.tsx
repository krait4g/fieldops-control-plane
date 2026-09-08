import { cn } from "@/shared/lib/cn";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-subtle/90 bg-console-surface-1 p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface WidgetFrameProps {
  title: string;
  id?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Contracted widget container: keeps the title across state changes. */
export function WidgetFrame({ title, id, action, className, children }: WidgetFrameProps) {
  return (
    <section
      aria-label={title}
      data-testid={id}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border-subtle/90 bg-console-surface-1 p-5",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-text-primary">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
