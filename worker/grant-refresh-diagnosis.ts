import { HttpError } from "./utils.ts";

const MAX_SECRET_BYTES = 64 * 1024;
export const MAX_REFRESH_RESPONSE_BYTES = 128 * 1024;

export async function boundedRefreshJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await boundedResponseJson(response, MAX_REFRESH_RESPONSE_BYTES);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    throw new HttpError(502, "grant_refresh_failed", "provider refresh response was invalid");
  }
}

export async function boundedResponseJson(response: Response, limit: number): Promise<unknown> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) throw new HttpError(502, "grant_response_invalid", "provider response was invalid");
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(502, "grant_response_invalid", "provider response was invalid");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  try {
    const value = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}

export function permanentRefreshFailure(status: number, code: unknown): boolean {
  return [400, 401].includes(status) && typeof code === "string" && ["invalid_grant", "invalid_token", "refresh_token_reused"].includes(code);
}

// Strict allowlist, not truncation: even a short provider "code" can contain a
// credential fragment. Unknown strings/descriptions never cross the owner boundary.
export function safeOAuthError(code: unknown): string {
  return typeof code === "string" && ["invalid_grant", "invalid_token", "refresh_token_reused", "invalid_client", "unauthorized_client", "invalid_request", "unsupported_grant_type", "invalid_scope", "temporarily_unavailable", "server_error", "network_error", "invalid_response"].includes(code) ? code : "unknown_error";
}

export function optionalSecret(value: string | null | undefined, name: string): string | null | undefined {
  return value == null ? value : boundedSecret(value, name);
}

export function boundedSecret(value: unknown, name: string): string {
  if (typeof value !== "string" || !value || new TextEncoder().encode(value).byteLength > MAX_SECRET_BYTES) throw new HttpError(400, "invalid_upstream_grant", `${name} must be a non-empty bounded string`);
  return value;
}
