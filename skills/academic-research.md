# Academic Research Skill

Conduct rigorous academic research with proper methodology and citations.

## Research Framework

```javascript
class AcademicResearch {
  constructor(options = {}) {
    this.topic = options.topic;
    this.discipline = options.discipline;
    this.methodology = options.methodology;
    this.sources = [];
    this.notes = [];
  }

  // Define research question
  defineResearchQuestion(params) {
    return {
      mainQuestion: params.question,
      subQuestions: params.subQuestions || [],
      hypothesis: params.hypothesis,
      scope: {
        timeframe: params.timeframe,
        geography: params.geography,
        population: params.population
      },
      significance: params.significance,
      limitations: params.limitations
    };
  }

  // Literature review structure
  createLitReviewOutline(themes) {
    return {
      introduction: {
        purpose: 'Establish context and scope of review',
        elements: ['Topic background', 'Review objectives', 'Search methodology']
      },
      thematicSections: themes.map(theme => ({
        theme: theme.name,
        keyAuthors: theme.authors,
        mainFindings: theme.findings,
        debates: theme.debates,
        gaps: theme.gaps
      })),
      synthesis: {
        commonFindings: [],
        contradictions: [],
        gaps: [],
        futureDirections: []
      },
      conclusion: {
        summary: '',
        implications: '',
        researchAgenda: ''
      }
    };
  }
}
```

## Citation Management

```javascript
class CitationManager {
  constructor() {
    this.sources = [];
  }

  addSource(source) {
    const id = this._generateId(source);
    this.sources.push({ id, ...source });
    return id;
  }

  // Format citation in various styles
  formatCitation(sourceId, style = 'apa7') {
    const source = this.sources.find(s => s.id === sourceId);
    if (!source) return null;

    switch (style) {
      case 'apa7':
        return this._formatAPA7(source);
      case 'mla9':
        return this._formatMLA9(source);
      case 'chicago':
        return this._formatChicago(source);
      case 'harvard':
        return this._formatHarvard(source);
      default:
        return this._formatAPA7(source);
    }
  }

  _formatAPA7(source) {
    const authors = this._formatAuthorsAPA(source.authors);
    const year = source.year;
    const title = source.title;

    switch (source.type) {
      case 'journal':
        return `${authors} (${year}). ${title}. *${source.journal}*, *${source.volume}*(${source.issue}), ${source.pages}. ${source.doi ? `https://doi.org/${source.doi}` : ''}`;

      case 'book':
        return `${authors} (${year}). *${title}*. ${source.publisher}.`;

      case 'chapter':
        const editors = this._formatEditorsAPA(source.editors);
        return `${authors} (${year}). ${title}. In ${editors} (Eds.), *${source.bookTitle}* (pp. ${source.pages}). ${source.publisher}.`;

      case 'website':
        return `${authors} (${year}). ${title}. ${source.siteName}. ${source.url}`;

      default:
        return `${authors} (${year}). ${title}.`;
    }
  }

  _formatMLA9(source) {
    const authors = this._formatAuthorsMLA(source.authors);
    const title = `"${source.title}"`;

    switch (source.type) {
      case 'journal':
        return `${authors}. ${title} *${source.journal}*, vol. ${source.volume}, no. ${source.issue}, ${source.year}, pp. ${source.pages}.`;

      case 'book':
        return `${authors}. *${source.title}*. ${source.publisher}, ${source.year}.`;

      default:
        return `${authors}. ${title} ${source.year}.`;
    }
  }

  _formatAuthorsAPA(authors) {
    if (!authors || authors.length === 0) return '';
    if (authors.length === 1) return `${authors[0].lastName}, ${authors[0].initials}`;
    if (authors.length === 2) return `${authors[0].lastName}, ${authors[0].initials}, & ${authors[1].lastName}, ${authors[1].initials}`;
    if (authors.length <= 20) {
      const all = authors.map(a => `${a.lastName}, ${a.initials}`);
      return all.slice(0, -1).join(', ') + ', & ' + all.slice(-1);
    }
    return authors.slice(0, 19).map(a => `${a.lastName}, ${a.initials}`).join(', ') + ', ... ' + `${authors[authors.length - 1].lastName}, ${authors[authors.length - 1].initials}`;
  }

  _formatAuthorsMLA(authors) {
    if (!authors || authors.length === 0) return '';
    if (authors.length === 1) return `${authors[0].lastName}, ${authors[0].firstName}`;
    if (authors.length === 2) return `${authors[0].lastName}, ${authors[0].firstName}, and ${authors[1].firstName} ${authors[1].lastName}`;
    return `${authors[0].lastName}, ${authors[0].firstName}, et al.`;
  }

  _formatEditorsAPA(editors) {
    if (!editors || editors.length === 0) return '';
    return editors.map(e => `${e.initials} ${e.lastName}`).join(', ');
  }

  _generateId(source) {
    const author = source.authors?.[0]?.lastName || 'unknown';
    const year = source.year || 'nd';
    return `${author}${year}`.toLowerCase();
  }

  // In-text citation
  inTextCitation(sourceId, style = 'apa7', page = null) {
    const source = this.sources.find(s => s.id === sourceId);
    if (!source) return '';

    const author = source.authors?.[0]?.lastName || source.organization || 'Unknown';
    const year = source.year;

    switch (style) {
      case 'apa7':
        return page ? `(${author}, ${year}, p. ${page})` : `(${author}, ${year})`;
      case 'mla9':
        return page ? `(${author} ${page})` : `(${author})`;
      default:
        return `(${author}, ${year})`;
    }
  }

  // Generate bibliography
  generateBibliography(style = 'apa7') {
    return this.sources
      .map(s => this.formatCitation(s.id, style))
      .sort()
      .join('\n\n');
  }
}
```

## Research Methodology

```javascript
class ResearchMethodology {
  // Qualitative methods
  static qualitativeMethods() {
    return {
      interviews: {
        types: ['structured', 'semi-structured', 'unstructured'],
        sampleSize: '10-30 participants typical',
        analysis: ['thematic analysis', 'grounded theory', 'narrative analysis']
      },
      focusGroups: {
        groupSize: '6-10 participants',
        sessions: '3-6 groups recommended',
        analysis: ['content analysis', 'discourse analysis']
      },
      ethnography: {
        duration: 'Extended fieldwork',
        methods: ['participant observation', 'field notes', 'interviews'],
        analysis: ['thick description', 'cultural analysis']
      },
      caseStudy: {
        types: ['single', 'multiple', 'embedded'],
        data: ['documents', 'interviews', 'observations'],
        analysis: ['within-case', 'cross-case', 'pattern matching']
      }
    };
  }

  // Quantitative methods
  static quantitativeMethods() {
    return {
      survey: {
        design: ['cross-sectional', 'longitudinal'],
        sampling: ['random', 'stratified', 'cluster'],
        analysis: ['descriptive', 'inferential', 'regression']
      },
      experiment: {
        design: ['RCT', 'quasi-experimental', 'factorial'],
        variables: ['independent', 'dependent', 'control'],
        analysis: ['ANOVA', 't-test', 'chi-square']
      },
      correlational: {
        purpose: 'Examine relationships between variables',
        analysis: ['Pearson', 'Spearman', 'regression']
      }
    };
  }

  // Sample size calculation
  static calculateSampleSize(params) {
    const { population, confidenceLevel, marginOfError } = params;

    const zScores = { 90: 1.645, 95: 1.96, 99: 2.576 };
    const z = zScores[confidenceLevel] || 1.96;
    const p = 0.5; // Maximum variability
    const e = marginOfError / 100;

    if (population) {
      // Finite population
      const n0 = (z * z * p * (1 - p)) / (e * e);
      return Math.ceil(n0 / (1 + (n0 - 1) / population));
    } else {
      // Infinite population
      return Math.ceil((z * z * p * (1 - p)) / (e * e));
    }
  }

  // Validity and reliability
  static assessValidity(research) {
    return {
      internal: {
        threats: ['history', 'maturation', 'selection', 'mortality'],
        controls: research.internalControls || []
      },
      external: {
        threats: ['population', 'ecological', 'temporal'],
        generalizability: research.generalizability
      },
      construct: {
        measures: research.measures,
        operationalization: research.operationalization
      }
    };
  }
}
```

## Academic Database Search

```javascript
class AcademicSearch {
  constructor() {
    this.databases = {
      googleScholar: 'https://scholar.google.com/scholar?q=',
      pubmed: 'https://pubmed.ncbi.nlm.nih.gov/?term=',
      jstor: 'https://www.jstor.org/action/doBasicSearch?Query=',
      scopus: 'https://www.scopus.com/results/results.uri?query=',
      webOfScience: 'https://www.webofscience.com/wos/woscc/basic-search'
    };
  }

  // Build search query with Boolean operators
  buildSearchQuery(params) {
    const { keywords, mustInclude, exclude, dateRange, authors } = params;

    let query = keywords.map(k => `"${k}"`).join(' OR ');

    if (mustInclude) {
      query = `(${query}) AND (${mustInclude.map(k => `"${k}"`).join(' AND ')})`;
    }

    if (exclude) {
      query += ` NOT (${exclude.map(k => `"${k}"`).join(' OR ')})`;
    }

    return query;
  }

  // Search strategy documentation
  documentSearch(params) {
    return {
      databases: params.databases,
      query: this.buildSearchQuery(params),
      dateRange: params.dateRange,
      filters: params.filters,
      resultsCount: params.results,
      dateSearched: new Date().toISOString(),
      inclusion: params.inclusionCriteria,
      exclusion: params.exclusionCriteria
    };
  }

  // PRISMA flow for systematic reviews
  prismaFlow(counts) {
    return {
      identification: {
        databaseRecords: counts.database,
        otherSources: counts.other,
        duplicatesRemoved: counts.duplicates
      },
      screening: {
        screened: counts.screened,
        excluded: counts.screenExcluded
      },
      eligibility: {
        fullTextAssessed: counts.fullText,
        excluded: counts.fullTextExcluded,
        reasons: counts.exclusionReasons
      },
      included: {
        qualitative: counts.qualitative,
        quantitative: counts.quantitative
      }
    };
  }
}
```

## Data Analysis Tools

```javascript
class QualitativeAnalysis {
  // Thematic analysis (Braun & Clarke)
  thematicAnalysis(data) {
    return {
      phase1: 'Familiarization with data',
      phase2: 'Generating initial codes',
      phase3: 'Searching for themes',
      phase4: 'Reviewing themes',
      phase5: 'Defining and naming themes',
      phase6: 'Producing the report',
      codes: [],
      themes: [],
      subthemes: []
    };
  }

  // Coding framework
  createCodingScheme(data) {
    return {
      descriptiveCodes: [],    // What is happening
      interpretiveCodes: [],   // What it means
      patternCodes: [],        // Recurring patterns
      theoreticalCodes: []     // Connection to theory
    };
  }

  // Inter-rater reliability
  calculateKappa(rater1, rater2) {
    // Cohen's Kappa calculation
    const n = rater1.length;
    let agree = 0;

    for (let i = 0; i < n; i++) {
      if (rater1[i] === rater2[i]) agree++;
    }

    const po = agree / n;
    const pe = 0.5; // Expected agreement by chance (simplified)
    const kappa = (po - pe) / (1 - pe);

    return {
      kappa: kappa.toFixed(3),
      interpretation: kappa > 0.8 ? 'Almost perfect' :
                     kappa > 0.6 ? 'Substantial' :
                     kappa > 0.4 ? 'Moderate' :
                     kappa > 0.2 ? 'Fair' : 'Slight'
    };
  }
}
```

## Academic Writing

```javascript
class AcademicWriting {
  // Paper structure (IMRaD)
  imradStructure() {
    return {
      introduction: {
        elements: ['Background', 'Problem statement', 'Purpose', 'Research questions', 'Significance'],
        length: '10-15% of paper'
      },
      methods: {
        elements: ['Design', 'Participants', 'Materials', 'Procedure', 'Analysis'],
        length: '15-20% of paper'
      },
      results: {
        elements: ['Findings', 'Tables', 'Figures', 'Statistical analyses'],
        length: '20-30% of paper'
      },
      discussion: {
        elements: ['Interpretation', 'Comparison', 'Limitations', 'Implications', 'Future research'],
        length: '25-35% of paper'
      }
    };
  }

  // Argument structure
  createArgument(params) {
    return {
      claim: params.claim,
      evidence: params.evidence,
      warrant: params.warrant, // Why evidence supports claim
      backing: params.backing,  // Support for warrant
      qualifier: params.qualifier, // Limitations
      rebuttal: params.rebuttal   // Counter-arguments
    };
  }

  // Transition words
  transitionWords() {
    return {
      addition: ['furthermore', 'moreover', 'additionally', 'in addition'],
      contrast: ['however', 'nevertheless', 'conversely', 'on the other hand'],
      cause: ['therefore', 'consequently', 'as a result', 'thus'],
      example: ['for instance', 'for example', 'specifically', 'in particular'],
      summary: ['in conclusion', 'to summarize', 'overall', 'in summary']
    };
  }
}
```

## Usage Examples

```javascript
// Citation management
const citations = new CitationManager();
const id = citations.addSource({
  type: 'journal',
  authors: [{ lastName: 'Smith', firstName: 'John', initials: 'J.' }],
  year: 2023,
  title: 'The impact of AI on research methods',
  journal: 'Journal of Research Methods',
  volume: 15,
  issue: 2,
  pages: '123-145',
  doi: '10.1234/jrm.2023.001'
});

console.log(citations.formatCitation(id, 'apa7'));
console.log(citations.inTextCitation(id, 'apa7', 130));

// Sample size calculation
const sampleSize = ResearchMethodology.calculateSampleSize({
  population: 10000,
  confidenceLevel: 95,
  marginOfError: 5
});
console.log(`Required sample size: ${sampleSize}`);

// Search strategy
const search = new AcademicSearch();
const query = search.buildSearchQuery({
  keywords: ['artificial intelligence', 'machine learning'],
  mustInclude: ['healthcare'],
  exclude: ['review']
});
console.log(`Search query: ${query}`);
```
