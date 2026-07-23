// One fetch helper for every write-path dialog. Normalizes the three outcomes
// the dashboard already models: a typed success body, an expired session
// (callers route this to /login), or a structured error carrying the machine
// code (+ duplicateId on 409s). Never throws for HTTP errors; a network
// failure surfaces as an error result with status 0.
import type { ApiError } from "../../lib/api-types";

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "error"; status: number; code: string; duplicateId?: string };

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { kind: "error", status: 0, code: "network" };
  }
  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) {
    let code = "generic";
    let duplicateId: string | undefined;
    try {
      const body = (await res.json()) as ApiError;
      if (typeof body.error === "string") code = body.error;
      if (typeof body.duplicateId === "string") duplicateId = body.duplicateId;
    } catch {
      // non-JSON error body — keep the generic code
    }
    return { kind: "error", status: res.status, code, duplicateId };
  }
  const data = (await res.json().catch(() => null)) as T;
  return { kind: "ok", data };
}
