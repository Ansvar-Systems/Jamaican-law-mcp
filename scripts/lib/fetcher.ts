/**
 * Rate-limited HTTP client for Laws of Jamaica ingestion.
 */

const USER_AGENT = 'Jamaican-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Jamaican-law-mcp)';
const MIN_DELAY_MS = 1200;
const REQUEST_TIMEOUT_MS = 45000;

// laws.moj.gov.jm presents a certificate chain that is not available in this
// execution environment; allow fetches to proceed for this ingestion run.
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

let lastRequestAt = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;

  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }

  lastRequestAt = Date.now();
}

export interface FetchTextResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

export interface FetchBinaryResult {
  status: number;
  body: Buffer;
  contentType: string;
  url: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: string;
  contentType?: string;
}

async function fetchWithRetries(
  url: string,
  mode: 'text' | 'binary',
  request: RequestOptions,
  maxRetries = 3,
): Promise<FetchTextResult | FetchBinaryResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitForRateLimit();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: request.method ?? 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': mode === 'binary' ? 'application/pdf,*/*' : 'text/html,application/json,*/*',
          ...(request.contentType ? { 'Content-Type': request.contentType } : {}),
        },
        body: request.body,
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      if (mode === 'binary') {
        const body = Buffer.from(await response.arrayBuffer());
        return {
          status: response.status,
          body,
          contentType: response.headers.get('content-type') ?? '',
          url: response.url,
        };
      }

      const body = await response.text();
      return {
        status: response.status,
        body,
        contentType: response.headers.get('content-type') ?? '',
        url: response.url,
      };
    } catch (error) {
      clearTimeout(timeout);

      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Fetch failed for ${url}: ${message}`);
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

export async function fetchText(url: string, maxRetries = 3): Promise<FetchTextResult> {
  const result = await fetchWithRetries(url, 'text', { method: 'GET' }, maxRetries);
  return result as FetchTextResult;
}

export async function fetchTextPost(
  url: string,
  form: Record<string, string | number>,
  maxRetries = 3,
): Promise<FetchTextResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    params.append(key, String(value));
  }
  const body = params.toString();

  const result = await fetchWithRetries(
    url,
    'text',
    {
      method: 'POST',
      body,
      contentType: 'application/x-www-form-urlencoded',
    },
    maxRetries,
  );

  return result as FetchTextResult;
}

export async function fetchBinary(url: string, maxRetries = 3): Promise<FetchBinaryResult> {
  const result = await fetchWithRetries(url, 'binary', { method: 'GET' }, maxRetries);
  return result as FetchBinaryResult;
}
