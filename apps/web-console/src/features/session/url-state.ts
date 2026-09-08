import type { TimeRange } from "@/shared/lib/view-models";

export const RANGE_VALUES: TimeRange[] = ["PT1H", "PT6H", "PT24H", "P7D"];

export function parseRange(value?: string | null): TimeRange {
  if (value && (RANGE_VALUES as string[]).includes(value)) {
    return value as TimeRange;
  }
  return "PT24H";
}