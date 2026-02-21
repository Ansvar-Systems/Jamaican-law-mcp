#!/usr/bin/env tsx
/**
 * Jamaican Law MCP -- Real-data ingestion pipeline.
 *
 * Source of record:
 *   https://laws.moj.gov.jm (Ministry of Justice, Jamaica)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { fetchBinary, fetchText } from './lib/fetcher.js';
import {
  KEY_JAMAICAN_ACTS,
  buildParsedAct,
  getActDownloadUrl,
  getActPageUrl,
  parseStatutePageDetails,
  type ActConfig,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const PAGE_DIR = path.join(SOURCE_DIR, 'pages');
const PDF_DIR = path.join(SOURCE_DIR, 'pdf');
const TEXT_DIR = path.join(SOURCE_DIR, 'text');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

const MIN_TEXT_CHARS = 1500;

interface Args {
  limit: number | null;
  skipFetch: boolean;
}

interface PerActResult {
  id: string;
  title: string;
  status: 'ok' | 'skipped' | 'failed';
  reason?: string;
  provisions: number;
  definitions: number;
  textChars: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function ensureDirs(): void {
  for (const dir of [SOURCE_DIR, PAGE_DIR, PDF_DIR, TEXT_DIR, SEED_DIR]) {
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

function textCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function runPdfToText(pdfPath: string, textPath: string): { ok: boolean; stderr: string } {
  const result = spawnSync('pdftotext', ['-layout', pdfPath, textPath], {
    encoding: 'utf-8',
  });

  return {
    ok: result.status === 0,
    stderr: result.stderr ?? '',
  };
}

function buildSeedFileName(index: number, act: ActConfig): string {
  const prefix = String(index + 1).padStart(2, '0');
  return `${prefix}-${act.id}.json`;
}

async function fetchActInputs(act: ActConfig, skipFetch: boolean): Promise<{
  html: string;
  text: string;
  textChars: number;
  sourceFiles: { page: string; pdf: string; text: string };
}> {
  const pageFile = path.join(PAGE_DIR, `${act.id}.html`);
  const pdfFile = path.join(PDF_DIR, `${act.id}.pdf`);
  const textFile = path.join(TEXT_DIR, `${act.id}.txt`);

  let html: string;
  if (skipFetch && fs.existsSync(pageFile)) {
    html = fs.readFileSync(pageFile, 'utf-8');
  } else {
    const pageResult = await fetchText(getActPageUrl(act));
    if (pageResult.status !== 200) {
      throw new Error(`HTTP ${pageResult.status} fetching statute page`);
    }
    html = pageResult.body;
    fs.writeFileSync(pageFile, html);
  }

  if (!(skipFetch && fs.existsSync(pdfFile))) {
    const pdfResult = await fetchBinary(getActDownloadUrl(act));
    if (pdfResult.status !== 200) {
      throw new Error(`HTTP ${pdfResult.status} downloading PDF`);
    }

    fs.writeFileSync(pdfFile, pdfResult.body);
  }

  if (!(skipFetch && fs.existsSync(textFile))) {
    const pdfToText = runPdfToText(pdfFile, textFile);
    if (!pdfToText.ok) {
      throw new Error(`pdftotext failed: ${pdfToText.stderr.trim() || 'unknown error'}`);
    }
  }

  const text = fs.readFileSync(textFile, 'utf-8');
  const chars = textCharCount(text);

  return {
    html,
    text,
    textChars: chars,
    sourceFiles: {
      page: pageFile,
      pdf: pdfFile,
      text: textFile,
    },
  };
}

async function ingestActs(acts: ActConfig[], skipFetch: boolean): Promise<void> {
  ensureDirs();
  clearSeedDir();

  const results: PerActResult[] = [];
  let totalProvisions = 0;
  let totalDefinitions = 0;

  for (let i = 0; i < acts.length; i++) {
    const act = acts[i];
    const seedFile = path.join(SEED_DIR, buildSeedFileName(i, act));

    process.stdout.write(`Processing ${act.shortName}... `);

    try {
      const { html, text, textChars } = await fetchActInputs(act, skipFetch);

      if (textChars < MIN_TEXT_CHARS) {
        console.log('SKIPPED (scan-only PDF or no extractable text)');
        results.push({
          id: act.id,
          title: act.title,
          status: 'skipped',
          reason: `Extracted text too small (${textChars} chars)`,
          provisions: 0,
          definitions: 0,
          textChars,
        });
        continue;
      }

      const pageDetails = parseStatutePageDetails(html, act.title);
      const parsed = buildParsedAct(act, pageDetails, text);

      if (parsed.provisions.length < 3) {
        console.log(`SKIPPED (insufficient provisions: ${parsed.provisions.length})`);
        results.push({
          id: act.id,
          title: act.title,
          status: 'skipped',
          reason: `Insufficient parsed provisions (${parsed.provisions.length})`,
          provisions: parsed.provisions.length,
          definitions: parsed.definitions.length,
          textChars,
        });
        continue;
      }

      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));

      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;

      console.log(`OK (${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions)`);
      results.push({
        id: act.id,
        title: parsed.title,
        status: 'ok',
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        textChars,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAILED (${message})`);
      results.push({
        id: act.id,
        title: act.title,
        status: 'failed',
        reason: message,
        provisions: 0,
        definitions: 0,
        textChars: 0,
      });
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('Ingestion Report (Laws of Jamaica)');
  console.log('='.repeat(80));
  console.log(`Acts requested:      ${acts.length}`);
  console.log(`Seed JSONs written:  ${results.filter(r => r.status === 'ok').length}`);
  console.log(`Skipped acts:        ${results.filter(r => r.status === 'skipped').length}`);
  console.log(`Failed acts:         ${results.filter(r => r.status === 'failed').length}`);
  console.log(`Total provisions:    ${totalProvisions}`);
  console.log(`Total definitions:   ${totalDefinitions}`);

  console.log('\nPer-act status:');
  for (const row of results) {
    const status = row.status.toUpperCase().padEnd(7);
    const stats = row.status === 'ok'
      ? `${String(row.provisions).padStart(4)} provisions`
      : row.reason ?? '';
    console.log(`  ${status} ${row.id.padEnd(34)} ${stats}`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    source: 'https://laws.moj.gov.jm',
    requested: acts.length,
    written: results.filter(r => r.status === 'ok').length,
    skipped: results.filter(r => r.status === 'skipped'),
    failed: results.filter(r => r.status === 'failed'),
    totals: {
      provisions: totalProvisions,
      definitions: totalDefinitions,
    },
  };

  fs.writeFileSync(path.join(SOURCE_DIR, 'ingestion-report.json'), JSON.stringify(report, null, 2));
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();

  console.log('Jamaican Law MCP -- Real Data Ingestion');
  console.log('========================================\n');
  console.log('Source: https://laws.moj.gov.jm');
  console.log('Rate limit: 1.2s/request');

  if (limit) console.log(`Limit: ${limit}`);
  if (skipFetch) console.log('Mode: --skip-fetch (reuse downloaded source files)');

  const acts = limit ? KEY_JAMAICAN_ACTS.slice(0, limit) : KEY_JAMAICAN_ACTS;
  await ingestActs(acts, skipFetch);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
