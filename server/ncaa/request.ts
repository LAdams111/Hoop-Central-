/**
 * Request helpers for NCAA scraper. Single delay after each request to avoid blocking.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 15000;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPage(
  url: string,
  options: { delayAfterMs?: number } = {}
): Promise<string> {
  const delayMs = options.delayAfterMs ?? DEFAULT_DELAY_MS;
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.sports-reference.com/",
      },
    });
    lastRes = res;

    if (res.status === 429) {
      const wait =
        parseInt(res.headers.get("Retry-After") ?? "", 10) * 1000 ||
        RETRY_BACKOFF_MS * Math.pow(2, attempt);
      console.log("[scraper] rate limited, retrying after", wait, "ms");
      await delay(wait);
      continue;
    }
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await delay(RETRY_BACKOFF_MS * Math.pow(2, attempt));
      continue;
    }
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status} ${url}`);
    }

    const html = res.status === 404 ? "" : await res.text();
    await delay(delayMs);
    return html;
  }

  throw new Error(`Failed after ${MAX_RETRIES + 1} attempts: ${url}`);
}

/** Strip HTML comments so Cheerio can see tables Sports Reference hides in comments. */
export function stripComments(html: string): string {
  return html.replace(/<!--/g, "").replace(/-->/g, "");
}
