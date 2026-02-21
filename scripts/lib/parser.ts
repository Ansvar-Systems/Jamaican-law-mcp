/**
 * Parsers and source configuration for Jamaican law ingestion.
 *
 * Data source: https://laws.moj.gov.jm (Ministry of Justice, Jamaica)
 */

export interface ActConfig {
  id: string;
  title: string;
  shortName: string;
  pagePath: string;
  downloadPath: string;
}

export interface StatutePageDetails {
  title: string;
  issuedDate?: string;
  inForceDate?: string;
  lastAmendmentDate?: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

const BASE_URL = 'https://laws.moj.gov.jm';

/**
 * 10 official statutes selected for cybersecurity, privacy, communications,
 * and financial compliance use cases.
 */
export const KEY_JAMAICAN_ACTS: ActConfig[] = [
  {
    id: 'jm-atia',
    title: 'The Access to Information Act',
    shortName: 'Access to Information Act',
    pagePath: '/library/statute/the-access-to-information-act',
    downloadPath: '/library/statute/the-access-to-information-act/download',
  },
  {
    id: 'jm-telecommunications',
    title: 'The Telecommunications Act',
    shortName: 'Telecommunications Act',
    pagePath: '/library/statute/the-telecommunications-act',
    downloadPath: '/library/statute/the-telecommunications-act/download',
  },
  {
    id: 'jm-electronic-transactions',
    title: 'The Electronic Transactions Act',
    shortName: 'Electronic Transactions Act',
    pagePath: '/library/statute/the-electronic-transactions-act',
    downloadPath: '/library/statute/the-electronic-transactions-act/download',
  },
  {
    id: 'jm-evidence',
    title: 'The Evidence Act',
    shortName: 'Evidence Act',
    pagePath: '/library/statute/the-evidence-act',
    downloadPath: '/library/statute/the-evidence-act/download',
  },
  {
    id: 'jm-interception-communications',
    title: 'The Interception of Communications Act',
    shortName: 'Interception of Communications Act',
    pagePath: '/library/statute/the-interception-of-communications-act',
    downloadPath: '/library/statute/the-interception-of-communications-act/download',
  },
  {
    id: 'jm-fair-competition',
    title: 'The Fair Competition Act',
    shortName: 'Fair Competition Act',
    pagePath: '/library/statute/the-fair-competition-act',
    downloadPath: '/library/statute/the-fair-competition-act/download',
  },
  {
    id: 'jm-money-laundering',
    title: 'The Money Laundering Act',
    shortName: 'Money Laundering Act',
    pagePath: '/library/statute/the-money-laundering-act',
    downloadPath: '/library/statute/the-money-laundering-act/download',
  },
  {
    id: 'jm-financial-institutions',
    title: 'The Financial Institutions Act',
    shortName: 'Financial Institutions Act',
    pagePath: '/library/statute/the-financial-institutions-act',
    downloadPath: '/library/statute/the-financial-institutions-act/download',
  },
  {
    id: 'jm-credit-reporting',
    title: 'The Credit Reporting Act',
    shortName: 'Credit Reporting Act',
    pagePath: '/library/statute/the-credit-reporting-act',
    downloadPath: '/library/statute/the-credit-reporting-act/download',
  },
  {
    id: 'jm-payment-clearing-settlement',
    title: 'The Payment Clearing and Settlement',
    shortName: 'Payment Clearing and Settlement Act',
    pagePath: '/library/statute/the-payment-clearing-and-settlement',
    downloadPath: '/library/statute/the-payment-clearing-and-settlement/download',
  },
];

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseDateToIso(value: string): string | undefined {
  const cleaned = value.trim();
  if (!cleaned) return undefined;

  const timestamp = Date.parse(cleaned);
  if (Number.isNaN(timestamp)) return undefined;

  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getActPageUrl(act: ActConfig): string {
  return `${BASE_URL}${act.pagePath}`;
}

export function getActDownloadUrl(act: ActConfig): string {
  return `${BASE_URL}${act.downloadPath}`;
}

export function parseStatutePageDetails(html: string, fallbackTitle: string): StatutePageDetails {
  const titleMatch = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : fallbackTitle;

  const operationalDateMatch = html.match(/<strong>\s*Operational Date\s*<\/strong>\s*:\s*<em>(.*?)<\/em>/i);
  const lastAmendmentMatch = html.match(/<strong>\s*Last Amendment\s*<\/strong>\s*:\s*<em>(.*?)<\/em>/i);

  const inForceDate = operationalDateMatch ? parseDateToIso(stripTags(operationalDateMatch[1])) : undefined;
  const lastAmendmentDate = lastAmendmentMatch ? parseDateToIso(stripTags(lastAmendmentMatch[1])) : undefined;

  return {
    title,
    inForceDate,
    lastAmendmentDate,
  };
}

function normalizeLine(line: string): string {
  return line
    .replace(/\u000c/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldDropLine(line: string): boolean {
  if (!line) return true;

  const lowered = line.toLowerCase();
  if (lowered.includes('[the inclusion of this page is authorized')) return true;

  return false;
}

function sectionToProvisionRef(section: string): string {
  return `sec${section.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

/**
 * Parses section-based provisions from pdftotext output.
 *
 * We intentionally keep extracted text as-is (including OCR artefacts) to
 * preserve exact source wording and avoid fabrication.
 */
export function parseProvisionsFromText(rawText: string): ParsedProvision[] {
  const lines = rawText.replace(/\r/g, '').split('\n');

  const sectionStarts: Array<{ index: number; section: string }> = [];
  const sectionRegex = /^\s*(\d{1,3}[A-Za-z]?)\s*([.,\-)])\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;

    const match = line.match(sectionRegex);
    if (!match) continue;

    const section = match[1];
    sectionStarts.push({ index: i, section });
  }

  if (sectionStarts.length === 0) return [];

  const bySection = new Map<string, ParsedProvision>();

  for (let i = 0; i < sectionStarts.length; i++) {
    const start = sectionStarts[i];
    const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].index : lines.length;

    const segment = lines
      .slice(start.index, end)
      .map(line => line.replace(/\u000c/g, '').replace(/\r/g, ''))
      .filter(line => !shouldDropLine(normalizeLine(line)));

    const rawContent = segment.join('\n').trim();
    if (!rawContent) continue;

    // Skip tiny fragments that are almost always table-of-contents residues.
    if (rawContent.length < 80) continue;

    const section = start.section;
    const provision: ParsedProvision = {
      provision_ref: sectionToProvisionRef(section),
      section,
      title: `Section ${section}`,
      content: rawContent,
    };

    const existing = bySection.get(section);
    if (!existing || provision.content.length > existing.content.length) {
      bySection.set(section, provision);
    }
  }

  const sorted = Array.from(bySection.values()).sort((a, b) => {
    const numA = Number.parseInt(a.section, 10);
    const numB = Number.parseInt(b.section, 10);

    if (Number.isNaN(numA) || Number.isNaN(numB)) {
      return a.section.localeCompare(b.section, undefined, { numeric: true });
    }

    if (numA !== numB) return numA - numB;
    return a.section.localeCompare(b.section, undefined, { numeric: true });
  });

  return sorted;
}

function extractDefinitions(provisions: ParsedProvision[]): ParsedDefinition[] {
  const defs: ParsedDefinition[] = [];
  const seen = new Set<string>();

  const quotedMeans = /"([^"]{2,80})"\s+means\s+([^.;\n]{10,400})/gi;

  for (const prov of provisions) {
    const text = prov.content;

    let match: RegExpExecArray | null;
    while ((match = quotedMeans.exec(text)) !== null) {
      const term = match[1].trim();
      const definition = match[2].trim();
      const key = `${term.toLowerCase()}::${definition.toLowerCase()}`;

      if (seen.has(key)) continue;
      seen.add(key);

      defs.push({
        term,
        definition,
        source_provision: prov.provision_ref,
      });
    }
  }

  return defs;
}

export function buildParsedAct(
  act: ActConfig,
  pageDetails: StatutePageDetails,
  extractedText: string,
): ParsedAct {
  const provisions = parseProvisionsFromText(extractedText);
  const definitions = extractDefinitions(provisions);

  return {
    id: act.id,
    type: 'statute',
    title: pageDetails.title || act.title,
    title_en: pageDetails.title || act.title,
    short_name: act.shortName,
    status: 'in_force',
    issued_date: pageDetails.issuedDate,
    in_force_date: pageDetails.inForceDate,
    url: getActPageUrl(act),
    description: 'Official statute text from the Ministry of Justice Laws of Jamaica portal.',
    provisions,
    definitions,
  };
}
