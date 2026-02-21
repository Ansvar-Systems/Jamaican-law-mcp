# Jamaican Law MCP

Jamaican law database for cybersecurity compliance via Model Context Protocol (MCP).

## Features

- **Full-text search** across legislation provisions (FTS5 with BM25 ranking)
- **Article-level retrieval** for specific legal provisions
- **Citation validation** to prevent hallucinated references
- **Currency checks** to verify if laws are still in force

## Quick Start

### Claude Code (Remote)
```bash
claude mcp add jamaican-law --transport http https://jamaican-law-mcp.vercel.app/mcp
```

### Local (npm)
```bash
npx @ansvar/jamaican-law-mcp
```

## Data Sources

Comprehensive laws corpus from the Ministry of Justice Laws of Jamaica portal (`https://laws.moj.gov.jm`), including revised statutes, Acts of Parliament, and revised subsidiary legislation, with section-level extraction where machine-readable text is available.

## License

Apache-2.0
