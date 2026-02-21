#!/usr/bin/env tsx
/**
 * Verifies that selected DB provisions match official source text
 * character-for-character (based on pdftotext extraction).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import Database from 'better-sqlite3';
import { fetchBinary } from './lib/fetcher.js';
import {
  KEY_JAMAICAN_ACTS,
  getActDownloadUrl,
  parseProvisionsFromText,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../data/database.db');
const VERIFY_DIR = path.resolve(__dirname, '../data/source/verify');

interface VerificationCheck {
  documentId: string;
  section: string;
}

const CHECKS: VerificationCheck[] = [
  { documentId: 'jm-atia', section: '1' },
  { documentId: 'jm-electronic-transactions', section: '6' },
  { documentId: 'jm-money-laundering', section: '3' },
];

function runPdfToText(pdfPath: string, textPath: string): void {
  const result = spawnSync('pdftotext', ['-layout', pdfPath, textPath], {
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(`pdftotext failed for ${path.basename(pdfPath)}: ${result.stderr?.trim() ?? 'unknown error'}`);
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(VERIFY_DIR, { recursive: true });

  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = DELETE');

  let passed = 0;

  for (const check of CHECKS) {
    const act = KEY_JAMAICAN_ACTS.find(item => item.id === check.documentId);
    if (!act) {
      throw new Error(`Missing act configuration for ${check.documentId}`);
    }

    const pdfPath = path.join(VERIFY_DIR, `${check.documentId}.pdf`);
    const textPath = path.join(VERIFY_DIR, `${check.documentId}.txt`);

    const fetched = await fetchBinary(getActDownloadUrl(act));
    if (fetched.status !== 200) {
      throw new Error(`Failed to download official PDF for ${check.documentId}: HTTP ${fetched.status}`);
    }

    fs.writeFileSync(pdfPath, fetched.body);
    runPdfToText(pdfPath, textPath);

    const extractedText = fs.readFileSync(textPath, 'utf-8');
    const parsed = parseProvisionsFromText(extractedText);
    const sourceProv = parsed.find(p => p.section === check.section);

    if (!sourceProv) {
      throw new Error(`Source section ${check.section} not parsed for ${check.documentId}`);
    }

    const row = db.prepare(
      `SELECT content FROM legal_provisions
       WHERE document_id = ? AND section = ?
       ORDER BY LENGTH(content) DESC
       LIMIT 1`
    ).get(check.documentId, check.section) as { content: string } | undefined;

    if (!row) {
      throw new Error(`Database section ${check.section} not found for ${check.documentId}`);
    }

    const isExact = row.content === sourceProv.content;
    if (!isExact) {
      throw new Error(
        `Character mismatch for ${check.documentId} section ${check.section}: ` +
        `db_len=${row.content.length}, source_len=${sourceProv.content.length}`
      );
    }

    passed++;
    console.log(`PASS ${check.documentId} section ${check.section} (len=${row.content.length})`);
  }

  console.log(`\nVerified ${passed}/${CHECKS.length} provisions with exact character match.`);
}

main().catch(error => {
  console.error('Verification failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
