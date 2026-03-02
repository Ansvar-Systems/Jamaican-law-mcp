# Jamaican Law MCP Server

**The Ministry of Justice Laws alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fjamaican-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/jamaican-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Jamaican-law-mcp?style=social)](https://github.com/Ansvar-Systems/Jamaican-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Jamaican-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Jamaican-law-mcp/actions/workflows/ci.yml)
[![Provisions](https://img.shields.io/badge/provisions-16%2C310-blue)]()

Query **910 Jamaican Acts** -- from the Data Protection Act and Cybercrime Act to the Companies Act, Judicature Act, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Jamaican legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Jamaican legal research means navigating [laws.moj.gov.jm](https://laws.moj.gov.jm), downloading PDFs from the Ministry of Justice, and manually cross-referencing across Acts. Whether you're:

- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking Data Protection Act obligations or Cybercrime Act requirements
- A **legal tech developer** building tools on Jamaican law
- A **researcher** tracing legislative provisions across 910 Acts

...you shouldn't need dozens of browser tabs and manual cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Jamaican law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://jamaican-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add jamaican-law --transport http https://jamaican-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jamaican-law": {
      "type": "url",
      "url": "https://jamaican-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "jamaican-law": {
      "type": "http",
      "url": "https://jamaican-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/jamaican-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jamaican-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/jamaican-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "jamaican-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/jamaican-law-mcp"]
    }
  }
}
```

---

## Example Queries

Once connected, just ask naturally:

- *"What does the Data Protection Act say about consent for processing personal data?"*
- *"Is the Cybercrime Act still in force?"*
- *"Find provisions about unauthorized computer access in Jamaican law"*
- *"What does the Companies Act require for director disclosures?"*
- *"Search for data breach notification obligations across Jamaican statutes"*
- *"What does the Judicature Act say about civil jurisdiction of the Supreme Court?"*
- *"Validate the citation 'Section 4 of the Data Protection Act'"*
- *"Build a legal stance on employment termination requirements under Jamaican law"*
- *"What are the penalty provisions under the Proceeds of Crime Act?"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Acts** | 910 statutes | Comprehensive Jamaican legislation from laws.moj.gov.jm |
| **Provisions** | 16,310 sections | Full-text searchable with FTS5 |
| **Database Size** | ~45 MB | Optimized SQLite, portable |
| **Freshness Checks** | Automated | Drift detection against Ministry of Justice source |

**Verified data only** -- every citation is validated against official sources (laws.moj.gov.jm). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from the [Jamaica Ministry of Justice Laws website](https://laws.moj.gov.jm) (official source)
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains Act text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by Act name and section number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
MoJ Laws Website --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                      ^                        ^
               Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search laws.moj.gov.jm by Act name | Search by plain language: *"personal data consent"* |
| Navigate multi-part Acts manually | Get the exact provision with context |
| Manual cross-referencing between Acts | `build_legal_stance` aggregates across sources |
| "Is this Act still in force?" -- check manually | `check_currency` tool -- answer in seconds |
| Find CARICOM/Commonwealth alignment -- dig manually | `get_eu_basis` -- linked frameworks instantly |
| No API, no integration | MCP protocol -- AI-native |

**Traditional:** Search MoJ website --> Download PDF --> Ctrl+F --> Cross-reference between Acts --> Check for amendments --> Repeat

**This MCP:** *"What are the data breach notification requirements under the Data Protection Act and how do they compare to GDPR?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 16,310 provisions with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by Act name and section number |
| `check_currency` | Check if an Act is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check |
| `build_legal_stance` | Aggregate citations from multiple Acts for a legal topic |
| `format_citation` | Format citations per Jamaican legal conventions (full/short/pinpoint) |
| `list_sources` | List all available Acts with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international frameworks (CARICOM, Commonwealth, GDPR adequacy) that a Jamaican Act aligns with |
| `get_jamaican_implementations` | Find Jamaican laws implementing a specific CARICOM decision or international convention |
| `search_eu_implementations` | Search international documents with Jamaican implementation counts |
| `get_provision_eu_basis` | Get international law references for a specific provision |
| `validate_eu_compliance` | Check alignment status of Jamaican Acts against international frameworks |

---

## International Law Alignment

Jamaica is a Commonwealth country and CARICOM member state. Several Jamaican laws have significant international alignment:

- **CARICOM (Caribbean Community):** Jamaica is a founding CARICOM member. CARICOM Decisions on trade, intellectual property, and competition law inform domestic legislation
- **Commonwealth Legal Framework:** Jamaica's common law system is rooted in English common law, and significant Commonwealth frameworks including the Harare Declaration on human rights apply
- **Data Protection:** Jamaica's Data Protection Act (2020) draws heavily on GDPR principles, and Jamaica is pursuing adequacy-equivalent status for data transfers to the UK and EU
- **Financial Action Task Force (FATF):** Jamaica implements FATF recommendations through the Proceeds of Crime Act, Terrorism Prevention Act, and related legislation
- **UN Conventions:** Jamaica has ratified major UN conventions (UNCAC, UNTOC) which are implemented in domestic criminal law

The international alignment tools allow you to explore these relationships -- checking which Jamaican provisions correspond to international obligations, and vice versa.

> **Note:** International cross-references reflect alignment and implementation relationships, not direct transposition. Jamaica adopts its own legislative approach through Parliament.

---

## Data Sources & Freshness

All content is sourced from authoritative Jamaican legal databases:

- **[Ministry of Justice Laws Website](https://laws.moj.gov.jm)** -- Official consolidated Acts, Ministry of Justice Jamaica

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Ministry of Justice, Jamaica |
| **Retrieval method** | Structured scrape from laws.moj.gov.jm |
| **Language** | English |
| **Coverage** | 910 Jamaican Acts |
| **Database size** | ~45 MB |

### Automated Freshness Checks

A GitHub Actions workflow monitors the Ministry of Justice Laws website for changes:

| Check | Method |
|-------|--------|
| **Act amendments** | Drift detection against known provision anchors |
| **New Acts** | Comparison against MoJ A-Z index |
| **Repealed Acts** | Status change detection |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from the Jamaica Ministry of Justice Laws website. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against the official Ministry of Justice website for court filings
> - **International cross-references** reflect alignment relationships, not direct transposition
> - **Parish-level regulations and bylaws** are not included -- this covers national Acts only

For professional legal advice in Jamaica, consult a member of the **Jamaica Bar Association**.

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Jamaican-law-mcp
cd Jamaican-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                         # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js    # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest          # Ingest Acts from Ministry of Justice Laws
npm run build:db        # Rebuild SQLite database
npm run drift:detect    # Run drift detection against anchors
npm run check-updates   # Check for amendments and new Acts
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~45 MB (efficient, portable)
- **Reliability:** 100% ingestion success rate across 910 Acts

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/trinidadian-law-mcp](https://github.com/Ansvar-Systems/Trinidadian-law-mcp)
**Query Trinidad and Tobago legislation** -- fellow CARICOM member with 533 Acts and 21,562 provisions. `npx @ansvar/trinidadian-law-mcp`

### [@ansvar/guyanese-law-mcp](https://github.com/Ansvar-Systems/Guyanese-law-mcp)
**Query Guyanese legislation** -- fellow CARICOM member with 1,655 laws and CCJ case law. `npx @ansvar/guyanese-law-mcp`

**70+ national law MCPs** covering Australia, Brazil, Canada, Denmark, Finland, France, Germany, Ghana, India, Ireland, Italy, Kenya, Netherlands, Nigeria, Norway, Singapore, Sweden, Switzerland, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion (Supreme Court and Court of Appeal decisions)
- CARICOM Decision integration
- Historical Act versions and amendment tracking
- Privy Council decisions affecting Jamaican law

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] Full corpus ingestion (910 Acts, 16,310 provisions)
- [x] International law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Court case law expansion (Supreme Court, Court of Appeal)
- [ ] Historical Act versions (amendment tracking)
- [ ] CARICOM Decision integration
- [ ] Privy Council decisions

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{jamaican_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Jamaican Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Jamaican-law-mcp},
  note = {910 Jamaican Acts with 16,310 provisions and international law alignment}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Ministry of Justice Jamaica (public domain)
- **International Metadata:** CARICOM Secretariat, Commonwealth (public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server started as our internal reference tool -- turns out everyone building compliance tools for the Caribbean region has the same research frustrations.

So we're open-sourcing it. Navigating 910 Jamaican Acts shouldn't require hours of manual searching.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
