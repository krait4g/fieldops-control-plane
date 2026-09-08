"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/cn";

export function PageHeading({
  children,
  focusKey,
  className,
}: {
  children: React.ReactNode;
  focusKey: string;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <h1 ref={ref} tabIndex={-1} className={cn("text-xl font-bold text-text-primary", className)}>
      {children}
    </h1>
  );
}
