/** Client-side GET helper for admin read APIs.
 * Server Actions POST to the current page URL and can snap the App Router
 * back to that page when they complete after a navigation. Plain fetch does not. */
export async function fetchAdminJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  let payload: T;
  try {
    payload = (await response.json()) as T;
  } catch {
    throw new Error(`Request failed (${response.status})`);
  }
  if (!response.ok) {
    const message = (payload as { error?: string }).error;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return payload;
}

export function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
