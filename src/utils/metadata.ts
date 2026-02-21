/**
 * Response metadata utilities for Jamaican Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Laws of Jamaica (laws.moj.gov.jm) — Ministry of Justice, Jamaica',
    jurisdiction: 'JM',
    disclaimer:
      'This data is sourced from the Ministry of Justice Laws of Jamaica portal. ' +
      'Per the portal disclaimer, online versions are for information and printed official versions prevail. ' +
      'Always verify with the official portal (laws.moj.gov.jm).',
    freshness,
  };
}
