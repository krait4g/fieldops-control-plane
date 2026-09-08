import { catalogs, type CopyCatalog } from "@/shared/lib/copy";

export interface FieldOpsProblem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  traceId?: string;
  timestamp?: string;
  retryAfterSeconds?: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly problem: FieldOpsProblem | null;
  readonly traceId: string | undefined;

  constructor(
    status: number,
    problem: FieldOpsProblem | null,
    message?: string,
  ) {
    super(message ?? problem?.title ?? `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.problem = problem;
    this.traceId = problem?.traceId;
  }
}

const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 409, 422]);

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}

/**
 * TanStack Query retry policy. Do not retry client/session/scope/validation
 * errors. 429 is retried at most once and only when a short Retry-After is
 * present (enforced by the caller).
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return true;
  if (NON_RETRYABLE_STATUS.has(error.status)) return false;
  if (error.status === 429) {
    const after = error.problem?.retryAfterSeconds;
    return typeof after === "number" && after > 0 && after <= 10;
  }
  return error.status >= 500;
}

export function retryCountForQueries(): number {
  return 2;
}

export function problemTitle(problem: FieldOpsProblem | null | undefined, messages: CopyCatalog = catalogs.en): string {
  if (problem?.title) return problem.title;
  return messages.errors.genericTitle;
}

export function problemMessage(
  problem: FieldOpsProblem | null | undefined,
  messages: CopyCatalog = catalogs.en,
): string {
  if (problem?.code) return problem.detail ?? problem.title;
  return messages.errors.genericMessage;
}
