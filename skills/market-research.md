# Market Research Skill

Conduct comprehensive market research and competitive analysis.

## Overview

This skill provides frameworks and methods for conducting market research including competitor analysis, market sizing, consumer insights, and trend analysis.

## Market Analysis Framework

```javascript
class MarketResearch {
  constructor(options = {}) {
    this.industry = options.industry;
    this.region = options.region || 'global';
    this.data = {};
  }

  // Define research scope
  defineScope(params) {
    return {
      industry: params.industry,
      geography: params.geography,
      timeframe: params.timeframe,
      segments: params.segments,
      objectives: params.objectives
    };
  }

  // Market sizing (TAM, SAM, SOM)
  calculateMarketSize(data) {
    return {
      tam: {  // Total Addressable Market
        value: data.totalMarketValue,
        units: data.totalMarketUnits,
        methodology: 'top-down from industry reports'
      },
      sam: {  // Serviceable Addressable Market
        value: data.totalMarketValue * data.serviceablePercent,
        segments: data.targetSegments,
        methodology: 'geographic and segment filtering'
      },
      som: {  // Serviceable Obtainable Market
        value: data.totalMarketValue * data.serviceablePercent * data.obtainablePercent,
        assumptions: data.marketShareAssumptions,
        methodology: 'realistic capture rate'
      }
    };
  }

  // Growth projections
  projectGrowth(currentSize, cagr, years) {
    const projections = [];
    let size = currentSize;

    for (let i = 1; i <= years; i++) {
      size = size * (1 + cagr);
      projections.push({
        year: new Date().getFullYear() + i,
        marketSize: Math.round(size),
        growth: cagr * 100
      });
    }

    return projections;
  }
}
```

## Competitor Analysis

```javascript
class CompetitorAnalysis {
  constructor() {
    this.competitors = [];
  }

  addCompetitor(competitor) {
    this.competitors.push({
      name: competitor.name,
      website: competitor.website,
      founded: competitor.founded,
      funding: competitor.funding,
      employees: competitor.employees,
      revenue: competitor.revenue,
      products: competitor.products,
      pricing: competitor.pricing,
      strengths: competitor.strengths,
      weaknesses: competitor.weaknesses,
      marketShare: competitor.marketShare
    });
  }

  // SWOT Analysis
  swotAnalysis(company) {
    return {
      strengths: company.strengths || [],
      weaknesses: company.weaknesses || [],
      opportunities: company.opportunities || [],
      threats: company.threats || []
    };
  }

  // Porter's Five Forces
  portersFiveForces(industry) {
    return {
      competitiveRivalry: {
        score: industry.rivalry,
        factors: ['Number of competitors', 'Industry growth', 'Product differentiation']
      },
      supplierPower: {
        score: industry.supplierPower,
        factors: ['Supplier concentration', 'Switching costs', 'Substitute inputs']
      },
      buyerPower: {
        score: industry.buyerPower,
        factors: ['Buyer concentration', 'Price sensitivity', 'Switching costs']
      },
      threatOfSubstitutes: {
        score: industry.substitutes,
        factors: ['Substitute availability', 'Price-performance', 'Switching costs']
      },
      threatOfNewEntrants: {
        score: industry.newEntrants,
        factors: ['Capital requirements', 'Economies of scale', 'Regulatory barriers']
      }
    };
  }

  // Competitive positioning map
  positioningMap(competitors, xAxis, yAxis) {
    return competitors.map(c => ({
      name: c.name,
      x: c[xAxis],
      y: c[yAxis],
      size: c.marketShare || c.revenue
    }));
  }

  // Feature comparison matrix
  featureMatrix(competitors, features) {
    const matrix = {};

    for (const feature of features) {
      matrix[feature] = {};
      for (const competitor of competitors) {
        matrix[feature][competitor.name] = competitor.features?.[feature] || 'N/A';
      }
    }

    return matrix;
  }
}
```

## Consumer Research

```javascript
class ConsumerResearch {
  // Customer segmentation
  segmentCustomers(customers, criteria) {
    const segments = {};

    for (const customer of customers) {
      const segmentKey = criteria.map(c => customer[c]).join('-');
      if (!segments[segmentKey]) {
        segments[segmentKey] = { customers: [], profile: {} };
        criteria.forEach(c => segments[segmentKey].profile[c] = customer[c]);
      }
      segments[segmentKey].customers.push(customer);
    }

    return Object.values(segments).map(s => ({
      ...s.profile,
      count: s.customers.length,
      percentage: (s.customers.length / customers.length * 100).toFixed(1)
    }));
  }

  // Customer persona builder
  buildPersona(data) {
    return {
      name: data.name,
      demographics: {
        age: data.age,
        gender: data.gender,
        income: data.income,
        education: data.education,
        location: data.location,
        occupation: data.occupation
      },
      psychographics: {
        values: data.values,
        interests: data.interests,
        lifestyle: data.lifestyle,
        personality: data.personality
      },
      behavior: {
        buyingHabits: data.buyingHabits,
        brandPreferences: data.brandPreferences,
        mediaConsumption: data.mediaConsumption,
        decisionFactors: data.decisionFactors
      },
      painPoints: data.painPoints,
      goals: data.goals,
      objections: data.objections
    };
  }

  // Survey analysis
  analyzeSurvey(responses, questions) {
    const analysis = {};

    for (const question of questions) {
      const answers = responses.map(r => r[question.id]);

      if (question.type === 'scale') {
        analysis[question.id] = {
          question: question.text,
          mean: answers.reduce((a, b) => a + b, 0) / answers.length,
          median: answers.sort((a, b) => a - b)[Math.floor(answers.length / 2)],
          distribution: this._distribution(answers)
        };
      } else if (question.type === 'choice') {
        analysis[question.id] = {
          question: question.text,
          distribution: this._distribution(answers)
        };
      }
    }

    return analysis;
  }

  _distribution(values) {
    const dist = {};
    values.forEach(v => dist[v] = (dist[v] || 0) + 1);
    return dist;
  }

  // Net Promoter Score
  calculateNPS(scores) {
    const promoters = scores.filter(s => s >= 9).length;
    const detractors = scores.filter(s => s <= 6).length;
    const total = scores.length;

    return {
      nps: Math.round((promoters - detractors) / total * 100),
      promoters: (promoters / total * 100).toFixed(1),
      passives: ((total - promoters - detractors) / total * 100).toFixed(1),
      detractors: (detractors / total * 100).toFixed(1)
    };
  }
}
```

## Trend Analysis

```javascript
class TrendAnalysis {
  // Identify trends from data
  identifyTrends(data, metric, periods = 12) {
    const values = data.slice(-periods).map(d => d[metric]);
    const trend = this._calculateTrend(values);

    return {
      direction: trend > 0 ? 'upward' : trend < 0 ? 'downward' : 'flat',
      strength: Math.abs(trend),
      values: values,
      movingAverage: this._movingAverage(values, 3)
    };
  }

  _calculateTrend(values) {
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  _movingAverage(values, window) {
    const result = [];
    for (let i = window - 1; i < values.length; i++) {
      const slice = values.slice(i - window + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / window);
    }
    return result;
  }

  // PESTEL Analysis
  pestelAnalysis(factors) {
    return {
      political: {
        factors: factors.political,
        impact: this._assessImpact(factors.political)
      },
      economic: {
        factors: factors.economic,
        impact: this._assessImpact(factors.economic)
      },
      social: {
        factors: factors.social,
        impact: this._assessImpact(factors.social)
      },
      technological: {
        factors: factors.technological,
        impact: this._assessImpact(factors.technological)
      },
      environmental: {
        factors: factors.environmental,
        impact: this._assessImpact(factors.environmental)
      },
      legal: {
        factors: factors.legal,
        impact: this._assessImpact(factors.legal)
      }
    };
  }

  _assessImpact(factors) {
    if (!factors || factors.length === 0) return 'low';
    const avgScore = factors.reduce((a, f) => a + (f.impact || 0), 0) / factors.length;
    return avgScore > 7 ? 'high' : avgScore > 4 ? 'medium' : 'low';
  }
}
```

## Data Sources Integration

```javascript
// Common market research data sources
const DATA_SOURCES = {
  financial: [
    { name: 'SEC EDGAR', url: 'https://www.sec.gov/edgar', type: 'filings' },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com', type: 'stocks' },
    { name: 'Crunchbase', url: 'https://crunchbase.com', type: 'startups' }
  ],
  industry: [
    { name: 'IBISWorld', url: 'https://ibisworld.com', type: 'reports' },
    { name: 'Statista', url: 'https://statista.com', type: 'statistics' },
    { name: 'Grand View Research', url: 'https://grandviewresearch.com', type: 'reports' }
  ],
  consumer: [
    { name: 'Google Trends', url: 'https://trends.google.com', type: 'trends' },
    { name: 'SimilarWeb', url: 'https://similarweb.com', type: 'traffic' },
    { name: 'App Annie', url: 'https://appannie.com', type: 'mobile' }
  ],
  government: [
    { name: 'Census Bureau', url: 'https://census.gov', type: 'demographics' },
    { name: 'BLS', url: 'https://bls.gov', type: 'labor' },
    { name: 'World Bank', url: 'https://data.worldbank.org', type: 'global' }
  ]
};
```

## Report Generation

```javascript
function generateMarketReport(research) {
  return {
    executiveSummary: {
      keyFindings: research.keyFindings,
      recommendations: research.recommendations,
      marketOpportunity: research.marketSize.som
    },
    marketOverview: {
      definition: research.marketDefinition,
      size: research.marketSize,
      growth: research.growth,
      trends: research.trends
    },
    competitiveLandscape: {
      majorPlayers: research.competitors,
      marketShares: research.marketShares,
      positioning: research.positioning
    },
    customerAnalysis: {
      segments: research.segments,
      personas: research.personas,
      needs: research.customerNeeds
    },
    opportunities: research.opportunities,
    risks: research.risks,
    methodology: research.methodology,
    appendix: research.appendix
  };
}
```

## Usage Examples

```javascript
// Market sizing
const market = new MarketResearch({ industry: 'SaaS' });
const size = market.calculateMarketSize({
  totalMarketValue: 200000000000,
  serviceablePercent: 0.15,
  obtainablePercent: 0.05,
  targetSegments: ['SMB', 'Mid-Market']
});

// Competitor analysis
const competitors = new CompetitorAnalysis();
competitors.addCompetitor({
  name: 'Competitor A',
  revenue: 50000000,
  marketShare: 15,
  strengths: ['Brand recognition', 'Large customer base'],
  weaknesses: ['Outdated technology', 'Poor support']
});

const fiveForces = competitors.portersFiveForces({
  rivalry: 8, supplierPower: 3, buyerPower: 6, substitutes: 4, newEntrants: 5
});

// Consumer research
const consumer = new ConsumerResearch();
const nps = consumer.calculateNPS([9, 10, 7, 8, 6, 10, 9, 5, 8, 9]);
console.log(`NPS Score: ${nps.nps}`);

// Trend analysis
const trends = new TrendAnalysis();
const analysis = trends.pestelAnalysis({
  political: [{ factor: 'Regulation changes', impact: 8 }],
  economic: [{ factor: 'Interest rates', impact: 6 }],
  technological: [{ factor: 'AI adoption', impact: 9 }]
});
```
