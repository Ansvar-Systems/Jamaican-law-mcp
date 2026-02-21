#!/usr/bin/env tsx
/**
 * Jamaican Law MCP -- Full-corpus real-data ingestion pipeline.
 *
 * Source of record: https://laws.moj.gov.jm (Ministry of Justice, Jamaica)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { fetchBinary, fetchText, fetchTextPost } from './lib/fetcher.js';
import { parseProvisionsFromText } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://laws.moj.gov.jm';
const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const TMP_DIR = path.resolve('/tmp/jamaican-law-mcp-ingest');

interface Args {
  limit: number | null;
  resume: boolean;
  metadataOnly: boolean;
  allText: boolean;
}

type CatalogCategory = 'statute' | 'act_of_parliament' | 'subsidiary_legislation';

interface CatalogEntry {
  category: CatalogCategory;
  title: string;
  pagePath: string;
  downloadPath: string;
  legalAreas?: string;
  year?: string;
}

interface SeedDocument {
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
  provisions: Array<{
    provision_ref: string;
    chapter?: string;
    section: string;
    title: string;
    content: string;
  }>;
  definitions: Array<{
    term: string;
    definition: string;
    source_provision?: string;
  }>;
}

interface PerDocResult {
  id: string;
  category: CatalogCategory;
  title: string;
  status: 'full_text' | 'metadata_only' | 'failed';
  reason?: string;
  provisions: number;
  definitions: number;
  textChars: number;
  seedFile: string;
}

const CORE_ID_OVERRIDES: Record<string, string> = {
  'statute:/library/statute/the-access-to-information-act': 'jm-atia',
  'statute:/library/statute/the-telecommunications-act': 'jm-telecommunications',
  'statute:/library/statute/the-electronic-transactions-act': 'jm-electronic-transactions',
  'statute:/library/statute/the-evidence-act': 'jm-evidence',
  'statute:/library/statute/the-interception-of-communications-act': 'jm-interception-communications',
  'statute:/library/statute/the-fair-competition-act': 'jm-fair-competition',
  'statute:/library/statute/the-money-laundering-act': 'jm-money-laundering',
  'statute:/library/statute/the-financial-institutions-act': 'jm-financial-institutions',
  'statute:/library/statute/the-credit-reporting-act': 'jm-credit-reporting',
  'statute:/library/statute/the-payment-clearing-and-settlement': 'jm-payment-clearing-settlement',
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let resume = true;
  let metadataOnly = false;
  let allText = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--no-resume') {
      resume = false;
    } else if (args[i] === '--metadata-only') {
      metadataOnly = true;
    } else if (args[i] === '--all-text') {
      allText = true;
    }
  }

  return { limit, resume, metadataOnly, allText };
}

function ensureDirs(): void {
  for (const dir of [SOURCE_DIR, SEED_DIR, TMP_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function clearSeedDir(): void {
  if (!fs.existsSync(SEED_DIR)) return;

  for (const file of fs.readdirSync(SEED_DIR)) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    fs.unlinkSync(path.join(SEED_DIR, file));
  }
}

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

function extractHref(input: string): string | undefined {
  const match = input.match(/href="([^"]+)"/i);
  return match?.[1];
}

function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${BASE_URL}${pathOrUrl}`;
}

function normalizeTitle(title: string): string {
  return stripTags(title)
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function buildDocumentId(entry: CatalogEntry): string {
  const overrideKey = `${entry.category}:${entry.pagePath}`;
  const override = CORE_ID_OVERRIDES[overrideKey];
  if (override) return override;

  const slug = slugify(entry.pagePath.split('/').pop() ?? entry.title);
  const prefix = entry.category === 'statute'
    ? 'stat'
    : entry.category === 'act_of_parliament'
      ? 'aop'
      : 'subs';

  return `jm-${prefix}-${slug}`;
}

function buildSeedFileName(index: number, id: string): string {
  return `${String(index + 1).padStart(4, '0')}-${id}.json`;
}

function textCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function runPdfToText(pdfPath: string, textPath: string): { ok: boolean; stderr: string } {
  const result = spawnSync('pdftotext', ['-layout', pdfPath, textPath], {
    encoding: 'utf-8',
    timeout: 120000,
    killSignal: 'SIGKILL',
  });

  return {
    ok: result.status === 0,
    stderr: result.stderr ?? '',
  };
}

function extractDefinitions(
  provisions: SeedDocument['provisions'],
): SeedDocument['definitions'] {
  const defs: SeedDocument['definitions'] = [];
  const seen = new Set<string>();
  const quotedMeans = /"([^"]{2,80})"\s+means\s+([^.;\n]{10,400})/gi;

  for (const prov of provisions) {
    let match: RegExpExecArray | null;
    while ((match = quotedMeans.exec(prov.content)) !== null) {
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

async function discoverRevisedStatutes(): Promise<CatalogEntry[]> {
  const url = `${BASE_URL}/library/statutes/revised?_dt=dt&_init=1&start=0&length=5000&draw=1`;
  const response = await fetchText(url);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch revised statutes index: HTTP ${response.status}`);
  }

  const payload = JSON.parse(response.body) as { data: Array<Record<string, string>> };

  return payload.data.flatMap(row => {
    const shortTitleHtml = row.shortTitle ?? '';
    const pagePath = extractHref(shortTitleHtml);
    const title = normalizeTitle(shortTitleHtml);
    const downloadPath = extractHref(row.actions ?? '') ?? (pagePath ? `${pagePath}/download` : '');

    if (!pagePath || !title || !downloadPath) return [];

    const entry: CatalogEntry = {
      category: 'statute',
      title,
      pagePath,
      downloadPath,
      legalAreas: normalizeTitle(row.legalAreas ?? ''),
    };

    return [entry];
  });
}

async function discoverActsOfParliament(): Promise<CatalogEntry[]> {
  const url = `${BASE_URL}/library/acts-of-parliament`;
  const response = await fetchTextPost(url, {
    _dt: 'dt',
    _init: 1,
    start: 0,
    length: 5000,
    draw: 1,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch Acts of Parliament index: HTTP ${response.status}`);
  }

  const payload = JSON.parse(response.body) as { data: Array<Record<string, string>> };

  return payload.data.flatMap(row => {
    const shortTitleHtml = row.shortTitle ?? '';
    const pagePath = extractHref(shortTitleHtml);
    const title = normalizeTitle(shortTitleHtml);
    const downloadPath = extractHref(row.actions ?? '') ?? (pagePath ? `${pagePath}/download` : '');

    if (!pagePath || !title || !downloadPath) return [];

    const entry: CatalogEntry = {
      category: 'act_of_parliament',
      title,
      pagePath,
      downloadPath,
      year: normalizeTitle(row.year ?? ''),
    };

    return [entry];
  });
}

async function discoverSubsidiaryLegislation(): Promise<CatalogEntry[]> {
  const entriesByPath = new Map<string, CatalogEntry>();
  const indexes = [''].concat(Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));

  for (const index of indexes) {
    const suffix = index ? `?index=${index}` : '';
    const url = `${BASE_URL}/library/subsidiary-legislation/revised${suffix}`;
    const response = await fetchText(url);

    if (response.status !== 200) {
      continue;
    }

    const linkRegex = /<a\s+href="(\/library\/subsidiary-legislation\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(response.body)) !== null) {
      const pagePath = match[1];
      if (pagePath.includes('/revised')) continue;

      const title = normalizeTitle(match[2]);
      if (!title) continue;

      entriesByPath.set(pagePath, {
        category: 'subsidiary_legislation',
        title,
        pagePath,
        downloadPath: `${pagePath}/download`,
      });
    }
  }

  return Array.from(entriesByPath.values());
}

async function discoverCatalog(): Promise<CatalogEntry[]> {
  const [statutes, acts, subsidiary] = await Promise.all([
    discoverRevisedStatutes(),
    discoverActsOfParliament(),
    discoverSubsidiaryLegislation(),
  ]);

  const deduped = new Map<string, CatalogEntry>();
  for (const entry of [...statutes, ...acts, ...subsidiary]) {
    deduped.set(`${entry.category}:${entry.pagePath}`, entry);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.title.localeCompare(b.title);
  });
}

async function buildSeedFromEntry(entry: CatalogEntry, metadataOnly: boolean): Promise<{
  seed: SeedDocument;
  status: PerDocResult['status'];
  reason?: string;
  textChars: number;
}> {
  const id = buildDocumentId(entry);

  const descriptionParts: string[] = [
    `Category: ${entry.category}`,
    `Source: ${absoluteUrl(entry.pagePath)}`,
  ];
  if (entry.legalAreas) descriptionParts.push(`Legal areas: ${entry.legalAreas}`);
  if (entry.year) descriptionParts.push(`Year: ${entry.year}`);

  const baseSeed: SeedDocument = {
    id,
    type: 'statute',
    title: entry.title,
    title_en: entry.title,
    short_name: entry.title.replace(/^The\s+/i, ''),
    status: 'in_force',
    url: absoluteUrl(entry.pagePath),
    description: descriptionParts.join(' | '),
    provisions: [],
    definitions: [],
  };

  if (metadataOnly) {
    return { seed: baseSeed, status: 'metadata_only', reason: 'metadata-only mode', textChars: 0 };
  }

  const pdfUrl = absoluteUrl(entry.downloadPath);
  const pdfPath = path.join(TMP_DIR, `${id}.pdf`);
  const textPath = path.join(TMP_DIR, `${id}.txt`);

  try {
    const pdfResult = await fetchBinary(pdfUrl);

    if (pdfResult.status !== 200 || pdfResult.body.length === 0) {
      return {
        seed: baseSeed,
        status: 'metadata_only',
        reason: `download failed (HTTP ${pdfResult.status})`,
        textChars: 0,
      };
    }

    fs.writeFileSync(pdfPath, pdfResult.body);

    const pdfToText = runPdfToText(pdfPath, textPath);
    if (!pdfToText.ok) {
      return {
        seed: baseSeed,
        status: 'metadata_only',
        reason: `pdftotext failed (${pdfToText.stderr.trim() || 'unknown error'})`,
        textChars: 0,
      };
    }

    const text = fs.readFileSync(textPath, 'utf-8');
    const chars = textCharCount(text);
    const provisions = parseProvisionsFromText(text);

    if (chars < 400 || provisions.length === 0) {
      return {
        seed: baseSeed,
        status: 'metadata_only',
        reason: `no extractable section text (chars=${chars}, sections=${provisions.length})`,
        textChars: chars,
      };
    }

    const definitions = extractDefinitions(provisions);

    return {
      seed: {
        ...baseSeed,
        provisions,
        definitions,
      },
      status: 'full_text',
      textChars: chars,
    };
  } finally {
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    if (fs.existsSync(textPath)) fs.unlinkSync(textPath);
  }
}

async function ingestCatalog(entries: CatalogEntry[], args: Args): Promise<void> {
  ensureDirs();
  if (!args.resume) clearSeedDir();

  const toProcess = args.limit ? entries.slice(0, args.limit) : entries;
  const results: PerDocResult[] = [];

  let totalProvisions = 0;
  let totalDefinitions = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i];
    const id = buildDocumentId(entry);
    const seedFile = path.join(SEED_DIR, buildSeedFileName(i, id));
    let wroteProgressLine = false;

    if (args.resume && fs.existsSync(seedFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as SeedDocument;
        const existingStatus: PerDocResult['status'] =
          existing.provisions.length > 0 ? 'full_text' : 'metadata_only';
        const shouldReprocessForAllText =
          args.allText &&
          !args.metadataOnly &&
          existingStatus === 'metadata_only';

        if (!shouldReprocessForAllText) {
          results.push({
            id,
            category: entry.category,
            title: existing.title,
            status: existingStatus,
            reason: existingStatus === 'metadata_only'
              ? 'existing metadata-only seed (text extraction unavailable in prior ingestion run)'
              : undefined,
            provisions: existing.provisions.length,
            definitions: existing.definitions.length,
            textChars: textCharCount(existing.provisions.map(p => p.content).join(' ')),
            seedFile,
          });
          totalProvisions += existing.provisions.length;
          totalDefinitions += existing.definitions.length;
          continue;
        }

        process.stdout.write(`[${i + 1}/${toProcess.length}] ${entry.category} :: ${entry.title} ... `);
        wroteProgressLine = true;
      } catch {
        // Fall through to rebuild this seed file.
      }
    }

    if (!wroteProgressLine) {
      process.stdout.write(`[${i + 1}/${toProcess.length}] ${entry.category} :: ${entry.title} ... `);
    }

    try {
      const overrideKey = `${entry.category}:${entry.pagePath}`;
      const isCoreTextDoc = Boolean(CORE_ID_OVERRIDES[overrideKey]);
      const metadataOnlyForEntry = args.metadataOnly || (!args.allText && !isCoreTextDoc);

      const built = await buildSeedFromEntry(entry, metadataOnlyForEntry);
      fs.writeFileSync(seedFile, JSON.stringify(built.seed, null, 2));

      const provisions = built.seed.provisions.length;
      const definitions = built.seed.definitions.length;
      totalProvisions += provisions;
      totalDefinitions += definitions;

      results.push({
        id,
        category: entry.category,
        title: built.seed.title,
        status: built.status,
        reason: built.reason,
        provisions,
        definitions,
        textChars: built.textChars,
        seedFile,
      });

      if (built.status === 'full_text') {
        console.log(`FULL (${provisions} sections, ${definitions} defs)`);
      } else {
        console.log(`META (${built.reason ?? 'no section text'})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAILED (${message})`);
      results.push({
        id,
        category: entry.category,
        title: entry.title,
        status: 'failed',
        reason: message,
        provisions: 0,
        definitions: 0,
        textChars: 0,
        seedFile,
      });
    }
  }

  const fullTextCount = results.filter(r => r.status === 'full_text').length;
  const metadataOnlyCount = results.filter(r => r.status === 'metadata_only').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  const byCategory = {
    statute: results.filter(r => r.category === 'statute').length,
    act_of_parliament: results.filter(r => r.category === 'act_of_parliament').length,
    subsidiary_legislation: results.filter(r => r.category === 'subsidiary_legislation').length,
  };

  console.log(`\n${'='.repeat(88)}`);
  console.log('Ingestion Report (Full Laws of Jamaica Catalog)');
  console.log('='.repeat(88));
  console.log(`Catalog entries processed: ${toProcess.length}`);
  console.log(`  Revised statutes:       ${byCategory.statute}`);
  console.log(`  Acts of Parliament:     ${byCategory.act_of_parliament}`);
  console.log(`  Subsidiary legislation: ${byCategory.subsidiary_legislation}`);
  console.log(`Seed files written:       ${results.length}`);
  console.log(`Full text extracted:      ${fullTextCount}`);
  console.log(`Metadata-only:            ${metadataOnlyCount}`);
  console.log(`Failed:                   ${failedCount}`);
  console.log(`Total provisions:         ${totalProvisions}`);
  console.log(`Total definitions:        ${totalDefinitions}`);

  const report = {
    generated_at: new Date().toISOString(),
    source: BASE_URL,
    processed: toProcess.length,
    categories: byCategory,
    full_text: fullTextCount,
    metadata_only: metadataOnlyCount,
    failed: results.filter(r => r.status === 'failed').map(r => ({
      id: r.id,
      category: r.category,
      title: r.title,
      reason: r.reason,
    })),
    metadata_only_reasons: results
      .filter(r => r.status === 'metadata_only')
      .map(r => ({
        id: r.id,
        category: r.category,
        title: r.title,
        reason: r.reason,
      })),
    totals: {
      provisions: totalProvisions,
      definitions: totalDefinitions,
    },
  };

  fs.writeFileSync(path.join(SOURCE_DIR, 'ingestion-report.json'), JSON.stringify(report, null, 2));

  const notesLines = [
    '# Laws Portal Access Notes',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Source: ${BASE_URL}`,
    '',
    `Catalog entries processed: ${toProcess.length}`,
    `Full text extracted: ${fullTextCount}`,
    `Metadata-only: ${metadataOnlyCount}`,
    `Failed: ${failedCount}`,
    '',
    'Metadata-only entries represent documents where section-level text extraction was not possible in this environment (for example, scan-only PDFs or download failures).',
  ];

  fs.writeFileSync(path.join(SOURCE_DIR, 'portal-access-notes.md'), `${notesLines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('Jamaican Law MCP -- Full Data Ingestion');
  console.log('========================================\n');
  console.log(`Source: ${BASE_URL}`);
  console.log('Rate limit: 1.2s/request');
  if (args.limit) console.log(`Limit: ${args.limit}`);
  if (!args.resume) console.log('Mode: rebuild seed directory');
  if (args.metadataOnly) console.log('Mode: metadata-only (skip PDF text extraction)');
  if (!args.metadataOnly && !args.allText) {
    console.log('Mode: core-text extraction (all laws ingested; full text attempted for core benchmark laws only)');
  }
  if (args.allText) console.log('Mode: all-text extraction (attempt PDF section extraction for every discovered law)');

  const catalog = await discoverCatalog();
  console.log(`\nDiscovered catalog entries: ${catalog.length}`);

  await ingestCatalog(catalog, args);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
