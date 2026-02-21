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

Official statutes from the Ministry of Justice Laws of Jamaica portal (`https://laws.moj.gov.jm`), ingested from source PDFs into section-level seed data.

## License

Apache-2.0
