/**
 * @file Provides utility functions for making network requests.
 */

/**
 * A utility function to make a `fetch` request with a specified timeout.
 * @param url The URL to fetch.
 * @param options The options for the `fetch` request.
 * @param timeoutMs The timeout in milliseconds.
 * @returns A promise that resolves with the `Response` object.
 */
export async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}
