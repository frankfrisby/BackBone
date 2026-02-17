---
name: academic-research
description: Conduct academic research — literature reviews, paper analysis, citation management, and research methodology. Use when the user needs to find academic papers, review literature, analyze research methodology, or write research-style documents. Triggers on "literature review", "research paper", "academic", "citation", "peer review", "methodology".
---

# Academic Research

Structured methodology for academic-quality research and analysis.

## Workflow

1. **Define question** — Clear, specific research question with scope boundaries
2. **Search literature** — Web search for papers, preprints, meta-analyses
3. **Screen sources** — Evaluate relevance, methodology quality, recency, citation count
4. **Extract findings** — Key results, methodology, limitations, conflicts of interest
5. **Synthesize** — Identify themes, gaps, contradictions, consensus
6. **Document** — Proper citations, methodology section, limitations disclosure

## Source Hierarchy

| Priority | Source | Trust Level |
|----------|--------|-------------|
| 1 | Peer-reviewed journals, meta-analyses | High |
| 2 | Preprints (arXiv, bioRxiv, SSRN) | Medium-High |
| 3 | Government reports (NIH, WHO, NIST) | High |
| 4 | University research centers | Medium-High |
| 5 | Industry white papers | Medium (check funding) |
| 6 | News articles, blogs | Low (verify claims) |

## Citation Format

Default to APA 7th edition unless specified:
```
Author, A. A. (Year). Title of article. Journal Name, Volume(Issue), Pages. https://doi.org/xxx
```

## Search Strategy

- **Google Scholar**: Broad academic search
- **PubMed**: Biomedical and life sciences
- **arXiv**: Physics, math, CS, quantitative fields
- **SSRN**: Social sciences, economics, finance
- **Semantic Scholar**: AI-powered paper discovery

## BACKBONE Integration

- **Output**: Save to `projects/<research-topic>/` with full bibliography
- **Spreadsheet**: Track sources in `data/spreadsheets/<topic>-literature.xlsx`
- **Knowledge DB**: Store key findings via `knowledge-db.js` for future reference
