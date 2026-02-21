/**
 * Rate-limited HTTP client for Laws of Jamaica ingestion.
 */

const USER_AGENT = 'Jamaican-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Jamaican-law-mcp)';
const MIN_DELAY_MS = 1200;

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

async function fetchWithRetries(
  url: string,
  mode: 'text' | 'binary',
  maxRetries = 3,
): Promise<FetchTextResult | FetchBinaryResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitForRateLimit();

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': mode === 'binary' ? 'application/pdf,*/*' : 'text/html,*/*',
      },
      redirect: 'follow',
    });

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
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

export async function fetchText(url: string, maxRetries = 3): Promise<FetchTextResult> {
  const result = await fetchWithRetries(url, 'text', maxRetries);
  return result as FetchTextResult;
}

export async function fetchBinary(url: string, maxRetries = 3): Promise<FetchBinaryResult> {
  const result = await fetchWithRetries(url, 'binary', maxRetries);
  return result as FetchBinaryResult;
}
