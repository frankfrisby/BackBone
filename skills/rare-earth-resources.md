# Rare Earth Materials & Resources Skill

Analyze rare earth elements, critical minerals, and strategic resources.

## Rare Earth Elements Overview

```javascript
const RARE_EARTH_ELEMENTS = {
  lightREE: {
    lanthanum: { symbol: 'La', atomicNumber: 57, uses: ['catalysts', 'batteries', 'glass'] },
    cerium: { symbol: 'Ce', atomicNumber: 58, uses: ['catalysts', 'polishing', 'glass'] },
    praseodymium: { symbol: 'Pr', atomicNumber: 59, uses: ['magnets', 'lasers', 'alloys'] },
    neodymium: { symbol: 'Nd', atomicNumber: 60, uses: ['magnets', 'lasers', 'glass'] },
    promethium: { symbol: 'Pm', atomicNumber: 61, uses: ['nuclear batteries', 'research'] },
    samarium: { symbol: 'Sm', atomicNumber: 62, uses: ['magnets', 'nuclear', 'medicine'] },
    europium: { symbol: 'Eu', atomicNumber: 63, uses: ['phosphors', 'lasers', 'nuclear'] }
  },
  heavyREE: {
    gadolinium: { symbol: 'Gd', atomicNumber: 64, uses: ['MRI', 'nuclear', 'electronics'] },
    terbium: { symbol: 'Tb', atomicNumber: 65, uses: ['phosphors', 'magnets', 'fuel cells'] },
    dysprosium: { symbol: 'Dy', atomicNumber: 66, uses: ['magnets', 'lasers', 'nuclear'] },
    holmium: { symbol: 'Ho', atomicNumber: 67, uses: ['magnets', 'nuclear', 'lasers'] },
    erbium: { symbol: 'Er', atomicNumber: 68, uses: ['fiber optics', 'lasers', 'nuclear'] },
    thulium: { symbol: 'Tm', atomicNumber: 69, uses: ['X-ray', 'lasers', 'superconductors'] },
    ytterbium: { symbol: 'Yb', atomicNumber: 70, uses: ['lasers', 'metallurgy', 'medicine'] },
    lutetium: { symbol: 'Lu', atomicNumber: 71, uses: ['PET scans', 'catalysts', 'LEDs'] }
  },
  relatedElements: {
    yttrium: { symbol: 'Y', atomicNumber: 39, uses: ['LEDs', 'superconductors', 'lasers'] },
    scandium: { symbol: 'Sc', atomicNumber: 21, uses: ['aerospace alloys', 'fuel cells', 'lighting'] }
  }
};

const CRITICAL_MINERALS = {
  batteryMaterials: ['lithium', 'cobalt', 'nickel', 'manganese', 'graphite'],
  semiconductorMaterials: ['gallium', 'germanium', 'silicon', 'indium'],
  magnetMaterials: ['neodymium', 'dysprosium', 'terbium', 'samarium'],
  catalystMaterials: ['platinum', 'palladium', 'rhodium', 'ruthenium'],
  superalloyMaterials: ['tungsten', 'molybdenum', 'rhenium', 'niobium']
};
```

## Resource Analysis

```javascript
class ResourceAnalysis {
  constructor() {
    this.reserves = new Map();
    this.production = new Map();
    this.prices = new Map();
  }

  // Analyze global reserves
  analyzeReserves(mineral) {
    return {
      globalReserves: mineral.totalReserves,
      unit: mineral.unit,
      distribution: mineral.countryReserves.map(c => ({
        country: c.country,
        reserves: c.reserves,
        percentGlobal: (c.reserves / mineral.totalReserves * 100).toFixed(1),
        yearsAtCurrentProduction: c.reserves / (c.production || 1)
      })).sort((a, b) => b.reserves - a.reserves),
      concentration: this._calculateConcentration(mineral.countryReserves),
      resourceLife: mineral.totalReserves / mineral.globalProduction
    };
  }

  _calculateConcentration(countryData) {
    const total = countryData.reduce((sum, c) => sum + c.reserves, 0);
    const sorted = countryData.sort((a, b) => b.reserves - a.reserves);

    const top1 = sorted[0]?.reserves / total * 100;
    const top3 = sorted.slice(0, 3).reduce((sum, c) => sum + c.reserves, 0) / total * 100;
    const top5 = sorted.slice(0, 5).reduce((sum, c) => sum + c.reserves, 0) / total * 100;

    // Herfindahl-Hirschman Index
    const hhi = countryData.reduce((sum, c) => {
      const share = c.reserves / total;
      return sum + share * share;
    }, 0) * 10000;

    return {
      top1Share: top1.toFixed(1),
      top3Share: top3.toFixed(1),
      top5Share: top5.toFixed(1),
      hhi: Math.round(hhi),
      concentration: hhi > 2500 ? 'High' : hhi > 1500 ? 'Moderate' : 'Low'
    };
  }

  // Production analysis
  analyzeProduction(mineral) {
    return {
      globalProduction: mineral.totalProduction,
      unit: mineral.unit,
      topProducers: mineral.countryProduction.map(c => ({
        country: c.country,
        production: c.production,
        percentGlobal: (c.production / mineral.totalProduction * 100).toFixed(1),
        growthRate: c.growthRate,
        capacityUtilization: c.capacity ? (c.production / c.capacity * 100).toFixed(1) : null
      })).sort((a, b) => b.production - a.production),
      productionTrend: this._analyzeTrend(mineral.historicalProduction),
      supplyRisk: this._assessSupplyRisk(mineral)
    };
  }

  _analyzeTrend(historical) {
    if (!historical || historical.length < 2) return 'insufficient data';

    const recent = historical.slice(-5);
    const growth = recent.map((v, i) => i > 0 ? (v - recent[i-1]) / recent[i-1] : 0);
    const avgGrowth = growth.slice(1).reduce((a, b) => a + b, 0) / (growth.length - 1);

    return {
      averageGrowth: (avgGrowth * 100).toFixed(1),
      direction: avgGrowth > 0.02 ? 'increasing' : avgGrowth < -0.02 ? 'decreasing' : 'stable',
      volatility: this._calculateVolatility(historical)
    };
  }

  _calculateVolatility(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;

    return {
      standardDeviation: stdDev.toFixed(2),
      coefficientOfVariation: (cv * 100).toFixed(1),
      level: cv > 0.3 ? 'High' : cv > 0.15 ? 'Moderate' : 'Low'
    };
  }

  _assessSupplyRisk(mineral) {
    const concentration = this._calculateConcentration(mineral.countryProduction);
    const factors = {
      geographicConcentration: concentration.hhi > 2500 ? 3 : concentration.hhi > 1500 ? 2 : 1,
      politicalStability: mineral.avgPoliticalRisk || 2,
      substituteAvailability: mineral.substitutes?.length > 2 ? 1 : mineral.substitutes?.length > 0 ? 2 : 3,
      recyclingRate: mineral.recyclingRate > 50 ? 1 : mineral.recyclingRate > 20 ? 2 : 3,
      demandGrowth: mineral.demandGrowth > 5 ? 3 : mineral.demandGrowth > 2 ? 2 : 1
    };

    const score = Object.values(factors).reduce((a, b) => a + b, 0);
    return {
      score,
      level: score > 12 ? 'High' : score > 8 ? 'Medium' : 'Low',
      factors
    };
  }
}
```

## Supply Chain Analysis

```javascript
class SupplyChainAnalysis {
  // Map supply chain
  mapSupplyChain(mineral) {
    return {
      extraction: {
        majorMines: mineral.majorMines,
        miningCompanies: mineral.miningCompanies,
        extractionMethods: mineral.extractionMethods,
        environmentalImpact: mineral.envImpact
      },
      processing: {
        processingLocations: mineral.processingLocations,
        processingConcentration: this._analyzeProcessingConcentration(mineral),
        refiningCapacity: mineral.refiningCapacity,
        bottlenecks: mineral.processingBottlenecks
      },
      manufacturing: {
        componentManufacturers: mineral.componentMfgs,
        endProductManufacturers: mineral.endProductMfgs,
        majorApplications: mineral.applications
      },
      consumption: {
        majorConsumers: mineral.majorConsumers,
        demandByApplication: mineral.demandByApp,
        demandBySector: mineral.demandBySector
      }
    };
  }

  _analyzeProcessingConcentration(mineral) {
    if (!mineral.processingByCountry) return null;

    const total = mineral.processingByCountry.reduce((sum, c) => sum + c.capacity, 0);
    return mineral.processingByCountry.map(c => ({
      country: c.country,
      capacity: c.capacity,
      share: (c.capacity / total * 100).toFixed(1)
    })).sort((a, b) => b.capacity - a.capacity);
  }

  // Vulnerability assessment
  assessVulnerability(supplyChain, country) {
    return {
      importDependence: {
        netImportReliance: country.imports / country.consumption * 100,
        importSources: country.importSources,
        diversification: this._assessDiversification(country.importSources)
      },
      domesticCapacity: {
        miningCapacity: country.domesticMining,
        processingCapacity: country.domesticProcessing,
        recyclingCapacity: country.recyclingCapacity,
        stockpiles: country.strategicStockpile
      },
      substitution: {
        availableSubstitutes: supplyChain.substitutes,
        substitutionCost: supplyChain.substitutionCost,
        technicalReadiness: supplyChain.substituteTRL
      },
      resilience: {
        inventoryDays: country.commercialInventory / (country.consumption / 365),
        alternativeSuppliers: country.alternativeSuppliers,
        recyclingContribution: country.recycledSupply / country.consumption * 100
      }
    };
  }

  _assessDiversification(sources) {
    if (!sources || sources.length === 0) return 'None';
    const total = sources.reduce((sum, s) => sum + s.share, 0);
    const hhi = sources.reduce((sum, s) => {
      const share = s.share / total;
      return sum + share * share;
    }, 0) * 10000;

    return {
      numberOfSources: sources.length,
      hhi: Math.round(hhi),
      level: hhi > 2500 ? 'Low' : hhi > 1500 ? 'Moderate' : 'High'
    };
  }

  // Disruption impact
  modelDisruption(scenario) {
    return {
      scenario: scenario.description,
      affectedSupply: scenario.supplyReduction,
      priceImpact: this._estimatePriceImpact(scenario),
      durationEstimate: scenario.estimatedDuration,
      industriesAffected: scenario.downstreamIndustries,
      economicImpact: this._estimateEconomicImpact(scenario),
      mitigationOptions: this._identifyMitigations(scenario)
    };
  }

  _estimatePriceImpact(scenario) {
    // Simple supply shock model
    const elasticity = scenario.demandElasticity || -0.5;
    const supplyShock = scenario.supplyReduction / 100;
    const priceChange = -supplyShock / elasticity;

    return {
      estimatedPriceChange: (priceChange * 100).toFixed(1) + '%',
      confidence: 'Low-Medium',
      assumptions: ['constant demand elasticity', 'no immediate substitution']
    };
  }

  _estimateEconomicImpact(scenario) {
    const directImpact = scenario.affectedValue || 0;
    const multiplier = 2.5; // Economic multiplier
    return {
      directImpact,
      indirectImpact: directImpact * (multiplier - 1),
      totalImpact: directImpact * multiplier
    };
  }

  _identifyMitigations(scenario) {
    return [
      { action: 'Draw from strategic reserves', effectiveness: 'High', timeframe: 'Immediate' },
      { action: 'Increase recycling', effectiveness: 'Medium', timeframe: 'Months' },
      { action: 'Diversify suppliers', effectiveness: 'High', timeframe: 'Years' },
      { action: 'Develop substitutes', effectiveness: 'Medium', timeframe: 'Years' },
      { action: 'Increase domestic production', effectiveness: 'High', timeframe: 'Years' }
    ].filter(m => scenario.applicableMitigations?.includes(m.action) || true);
  }
}
```

## Market Analysis

```javascript
class ResourceMarketAnalysis {
  // Price analysis
  analyzePrice(mineral) {
    const prices = mineral.priceHistory;
    return {
      currentPrice: prices[prices.length - 1],
      unit: mineral.priceUnit,
      yearChange: ((prices[prices.length - 1] - prices[prices.length - 13]) / prices[prices.length - 13] * 100).toFixed(1),
      fiveYearCAGR: this._calculateCAGR(prices.slice(-61)[0], prices[prices.length - 1], 5),
      volatility: this._calculatePriceVolatility(prices),
      support: this._identifySupport(prices),
      resistance: this._identifyResistance(prices),
      trend: this._identifyPriceTrend(prices)
    };
  }

  _calculateCAGR(startValue, endValue, years) {
    return ((Math.pow(endValue / startValue, 1 / years) - 1) * 100).toFixed(1);
  }

  _calculatePriceVolatility(prices) {
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const annualizedVol = Math.sqrt(variance * 252) * 100;

    return {
      daily: (Math.sqrt(variance) * 100).toFixed(2),
      annualized: annualizedVol.toFixed(1),
      level: annualizedVol > 50 ? 'High' : annualizedVol > 25 ? 'Moderate' : 'Low'
    };
  }

  _identifySupport(prices) {
    const recentLow = Math.min(...prices.slice(-60));
    return recentLow;
  }

  _identifyResistance(prices) {
    const recentHigh = Math.max(...prices.slice(-60));
    return recentHigh;
  }

  _identifyPriceTrend(prices) {
    const ma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ma50 = prices.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const current = prices[prices.length - 1];

    return {
      shortTermTrend: current > ma20 ? 'bullish' : 'bearish',
      mediumTermTrend: ma20 > ma50 ? 'bullish' : 'bearish',
      ma20,
      ma50
    };
  }

  // Demand forecast
  forecastDemand(mineral, years = 10) {
    const drivers = mineral.demandDrivers;
    const forecasts = [];

    for (let i = 1; i <= years; i++) {
      const yearDemand = mineral.currentDemand * Math.pow(1 + mineral.baseGrowthRate, i);
      const adjustedDemand = yearDemand * (1 + this._calculateDriverImpact(drivers, i));

      forecasts.push({
        year: new Date().getFullYear() + i,
        demand: Math.round(adjustedDemand),
        growthRate: ((adjustedDemand / mineral.currentDemand - 1) / i * 100).toFixed(1)
      });
    }

    return {
      baseCase: forecasts,
      drivers: drivers.map(d => ({
        driver: d.name,
        impact: d.impact,
        confidence: d.confidence
      })),
      supplyGap: this._projectSupplyGap(mineral, forecasts)
    };
  }

  _calculateDriverImpact(drivers, year) {
    return drivers.reduce((sum, d) => {
      const yearlyImpact = d.impact * Math.min(year / d.rampUpYears, 1);
      return sum + yearlyImpact;
    }, 0);
  }

  _projectSupplyGap(mineral, demandForecast) {
    const projectedSupply = mineral.currentSupply * Math.pow(1 + mineral.supplyGrowthRate, 10);
    const projectedDemand = demandForecast[demandForecast.length - 1].demand;

    return {
      gap: projectedDemand - projectedSupply,
      gapPercent: ((projectedDemand - projectedSupply) / projectedDemand * 100).toFixed(1),
      status: projectedSupply >= projectedDemand ? 'Adequate' : 'Deficit'
    };
  }
}
```

## Strategic Assessment

```javascript
class StrategicResourceAssessment {
  // Criticality assessment
  assessCriticality(mineral) {
    const supplyRisk = this._calculateSupplyRisk(mineral);
    const economicImportance = this._calculateEconomicImportance(mineral);

    return {
      supplyRisk: {
        score: supplyRisk,
        factors: {
          concentration: mineral.productionConcentration,
          politicalRisk: mineral.avgProducerRisk,
          substituteAvailability: mineral.substituteScore,
          recyclability: mineral.recyclingScore,
          importDependence: mineral.importDependence
        }
      },
      economicImportance: {
        score: economicImportance,
        factors: {
          gdpContribution: mineral.gdpContribution,
          employmentImpact: mineral.employmentImpact,
          strategicApplications: mineral.strategicApps,
          growthSectors: mineral.growthSectorUse
        }
      },
      criticalityMatrix: {
        supplyRisk,
        economicImportance,
        classification: this._classifyCriticality(supplyRisk, economicImportance)
      }
    };
  }

  _calculateSupplyRisk(mineral) {
    const weights = { concentration: 0.3, politicalRisk: 0.25, substitutes: 0.2, recycling: 0.15, imports: 0.1 };
    return (
      mineral.productionConcentration * weights.concentration +
      mineral.avgProducerRisk * weights.politicalRisk +
      (10 - mineral.substituteScore) * weights.substitutes +
      (10 - mineral.recyclingScore) * weights.recycling +
      mineral.importDependence / 10 * weights.imports
    ).toFixed(1);
  }

  _calculateEconomicImportance(mineral) {
    const weights = { gdp: 0.3, employment: 0.2, strategic: 0.3, growth: 0.2 };
    return (
      mineral.gdpContribution * weights.gdp +
      mineral.employmentImpact * weights.employment +
      mineral.strategicApps * weights.strategic +
      mineral.growthSectorUse * weights.growth
    ).toFixed(1);
  }

  _classifyCriticality(supplyRisk, economicImportance) {
    if (supplyRisk > 6 && economicImportance > 6) return 'Critical';
    if (supplyRisk > 6 || economicImportance > 6) return 'Strategic';
    if (supplyRisk > 4 || economicImportance > 4) return 'Important';
    return 'Non-critical';
  }

  // Policy recommendations
  generateRecommendations(assessment) {
    const recommendations = [];

    if (assessment.criticalityMatrix.supplyRisk > 6) {
      recommendations.push({
        priority: 'High',
        area: 'Supply Security',
        actions: [
          'Establish strategic stockpile',
          'Diversify import sources',
          'Develop domestic resources',
          'Increase recycling capacity'
        ]
      });
    }

    if (assessment.supplyRisk.factors.concentration > 7) {
      recommendations.push({
        priority: 'High',
        area: 'Geographic Diversification',
        actions: [
          'Support exploration in allied countries',
          'Establish long-term supply agreements',
          'Invest in alternative processing locations'
        ]
      });
    }

    if (assessment.supplyRisk.factors.substituteAvailability < 4) {
      recommendations.push({
        priority: 'Medium',
        area: 'Technology Development',
        actions: [
          'Fund R&D for substitutes',
          'Support material efficiency improvements',
          'Develop circular economy approaches'
        ]
      });
    }

    return recommendations;
  }
}
```

## Usage Examples

```javascript
// Resource analysis
const analysis = new ResourceAnalysis();
const lithiumReserves = analysis.analyzeReserves({
  totalReserves: 22000000,
  unit: 'tonnes',
  globalProduction: 100000,
  countryReserves: [
    { country: 'Chile', reserves: 9200000, production: 26000 },
    { country: 'Australia', reserves: 5700000, production: 55000 },
    { country: 'Argentina', reserves: 2200000, production: 6200 }
  ]
});

// Supply chain analysis
const supplyChain = new SupplyChainAnalysis();
const vulnerability = supplyChain.assessVulnerability(
  { substitutes: ['sodium-ion'], substitutionCost: 'high' },
  { imports: 50000, consumption: 60000, importSources: [{ country: 'Chile', share: 40 }, { country: 'Australia', share: 35 }] }
);

// Market analysis
const market = new ResourceMarketAnalysis();
const forecast = market.forecastDemand({
  currentDemand: 100000,
  baseGrowthRate: 0.08,
  currentSupply: 105000,
  supplyGrowthRate: 0.05,
  demandDrivers: [
    { name: 'EV adoption', impact: 0.15, confidence: 'high', rampUpYears: 5 },
    { name: 'Grid storage', impact: 0.08, confidence: 'medium', rampUpYears: 7 }
  ]
}, 10);

// Strategic assessment
const strategic = new StrategicResourceAssessment();
const criticality = strategic.assessCriticality({
  productionConcentration: 8,
  avgProducerRisk: 4,
  substituteScore: 3,
  recyclingScore: 2,
  importDependence: 80,
  gdpContribution: 5,
  employmentImpact: 3,
  strategicApps: 9,
  growthSectorUse: 9
});

console.log('Classification:', criticality.criticalityMatrix.classification);
console.log('Recommendations:', strategic.generateRecommendations(criticality));
```
