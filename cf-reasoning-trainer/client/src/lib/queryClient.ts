import { QueryClient } from "@tanstack/react-query";
import type { PublicUser } from "@shared/contracts";

export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 0, retry: false, refetchOnWindowFocus: true }, mutations: { retry: false },
} });
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
let csrfToken: string | undefined;
export function setCsrfToken(value?: string) { csrfToken = value; }
export async function apiRequest(method: string, url: string, data?: unknown, signal?: AbortSignal): Promise<Response> {
  if (method !== "GET" && !csrfToken) {
    const response = await fetch("/api/csrf", { credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok) throw new ApiError(response.status, "Unable to establish a secure session");
    csrfToken = (await response.json()).csrfToken;
  }
  const response = await fetch(url, {
    method, credentials: "same-origin", cache: "no-store", signal,
    headers: method === "GET" ? {} : { "Content-Type": "application/json", "X-CSRF-Token": csrfToken! },
    body: method === "GET" ? undefined : JSON.stringify(data ?? {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 403) csrfToken = undefined;
    if (response.status === 401 && url !== "/api/user" && typeof window !== "undefined") window.dispatchEvent(new Event("cf-session-expired"));
    throw new ApiError(response.status, error.message ?? "Request failed");
  }
  return response;
}
// Cancellation prevents an old account's in-flight response repopulating the cache.
export async function resetSessionCache(client: QueryClient, user: PublicUser | null) {
  await client.cancelQueries();
  client.clear();
  client.setQueryData(["/api/user"], user);
}
