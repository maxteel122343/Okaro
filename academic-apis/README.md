# Academic Literature APIs (OpenAlex, PubMed, Crossref)

Python clients and tools for searching scholarly literature via OpenAlex, PubMed, and Crossref.

All copies are shallow clones (`.git` removed). Original licenses apply.

## Included

| Project | Source | Focus | Notes |
|---------|--------|-------|-------|
| **pyopenalex** | nthomsencph/pyopenalex | OpenAlex | Modern Pydantic-powered client |
| **habanero** | sckott/habanero | Crossref | Mature, well-documented Crossref client |
| **crossrefapi** | fabiobatalha/crossrefapi | Crossref | Alternative Crossref REST client |
| **pubmedclient** | grll/pubmedclient | PubMed | Simple async SDK for NCBI Entrez |
| **litsearch-ii** | seun-john/litsearch-ii | Multi (OpenAlex + Crossref + PubMed + arXiv + ...) | Keyless MCP server for literature search |
| **findpapers** | jonatasgrosman/findpapers | Multi (OpenAlex, Crossref, PubMed, arXiv, etc.) | Unified search across many databases |

## Quick tips

- OpenAlex and Crossref generally do not require API keys for basic use (polite pool with email recommended).
- PubMed (NCBI) benefits from an API key for higher rate limits.
- `litsearch-ii` and `findpapers` are useful when you want one interface for multiple sources.

These are reference copies for use with the research tools already in `ai-research-repos/` and multi-agent frameworks in `multi-agents/`.
