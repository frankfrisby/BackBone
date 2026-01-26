# Economic Policy Research Skill

Analyze economic policies, indicators, and their impacts.

## Economic Indicators Analysis

```javascript
class EconomicIndicators {
  constructor() {
    this.data = {};
  }

  // GDP Analysis
  analyzeGDP(data) {
    const growth = this._calculateGrowth(data.values);

    return {
      current: data.values[data.values.length - 1],
      previousPeriod: data.values[data.values.length - 2],
      growth: growth.latest,
      averageGrowth: growth.average,
      trend: this._identifyTrend(data.values),
      components: {
        consumption: data.consumption,
        investment: data.investment,
        government: data.government,
        netExports: data.exports - data.imports
      },
      perCapita: data.gdp / data.population
    };
  }

  // Inflation Analysis
  analyzeInflation(data) {
    return {
      currentRate: data.cpi[data.cpi.length - 1],
      coreInflation: data.coreCPI,
      trend: this._identifyTrend(data.cpi),
      drivers: {
        food: data.foodInflation,
        energy: data.energyInflation,
        housing: data.housingInflation,
        services: data.servicesInflation
      },
      realInterestRate: data.nominalRate - data.expectedInflation,
      purchasingPower: this._calculatePurchasingPower(data.cpi)
    };
  }

  // Employment Analysis
  analyzeEmployment(data) {
    return {
      unemploymentRate: data.unemployed / data.laborForce * 100,
      participationRate: data.laborForce / data.workingAgePop * 100,
      employmentRatio: data.employed / data.workingAgePop * 100,
      breakdown: {
        u1: data.longTermUnemployed / data.laborForce * 100,
        u3: data.unemployed / data.laborForce * 100,
        u6: (data.unemployed + data.marginally + data.partTimeEconomic) / (data.laborForce + data.marginally) * 100
      },
      sectors: data.sectorEmployment,
      jobCreation: data.payrollChange,
      wageGrowth: this._calculateGrowth(data.wages)
    };
  }

  // Trade Balance Analysis
  analyzeTradeBalance(data) {
    return {
      balance: data.exports - data.imports,
      asPercentGDP: (data.exports - data.imports) / data.gdp * 100,
      exportGrowth: this._calculateGrowth(data.exportHistory),
      importGrowth: this._calculateGrowth(data.importHistory),
      topExports: data.topExportProducts,
      topImports: data.topImportProducts,
      tradingPartners: data.tradingPartners,
      termsOfTrade: data.exportPriceIndex / data.importPriceIndex * 100
    };
  }

  _calculateGrowth(values) {
    if (values.length < 2) return { latest: 0, average: 0 };

    const latest = (values[values.length - 1] - values[values.length - 2]) / values[values.length - 2] * 100;
    const growthRates = [];

    for (let i = 1; i < values.length; i++) {
      growthRates.push((values[i] - values[i-1]) / values[i-1] * 100);
    }

    return {
      latest: latest.toFixed(2),
      average: (growthRates.reduce((a, b) => a + b, 0) / growthRates.length).toFixed(2)
    };
  }

  _identifyTrend(values) {
    const n = values.length;
    if (n < 3) return 'insufficient data';

    let up = 0, down = 0;
    for (let i = 1; i < n; i++) {
      if (values[i] > values[i-1]) up++;
      else if (values[i] < values[i-1]) down++;
    }

    if (up > down * 1.5) return 'strong upward';
    if (up > down) return 'moderate upward';
    if (down > up * 1.5) return 'strong downward';
    if (down > up) return 'moderate downward';
    return 'sideways';
  }

  _calculatePurchasingPower(cpiHistory) {
    const baseYear = cpiHistory[0];
    const current = cpiHistory[cpiHistory.length - 1];
    return (baseYear / current * 100).toFixed(2);
  }
}
```

## Monetary Policy Analysis

```javascript
class MonetaryPolicyAnalysis {
  // Central bank policy analysis
  analyzePolicyStance(data) {
    return {
      currentRate: data.policyRate,
      rateChange: data.lastChange,
      direction: data.direction, // hawkish, dovish, neutral
      realRate: data.policyRate - data.inflation,
      taylorRule: this._calculateTaylorRule(data),
      forwardGuidance: data.guidance,
      inflationTarget: data.target,
      deviationFromTarget: data.inflation - data.target
    };
  }

  // Taylor Rule calculation
  _calculateTaylorRule(data) {
    const neutralRate = 2.5;
    const inflationWeight = 0.5;
    const outputWeight = 0.5;

    const suggestedRate = neutralRate +
      data.inflation +
      inflationWeight * (data.inflation - data.target) +
      outputWeight * data.outputGap;

    return {
      suggestedRate: suggestedRate.toFixed(2),
      actualRate: data.policyRate,
      gap: (data.policyRate - suggestedRate).toFixed(2)
    };
  }

  // Money supply analysis
  analyzeMoneySupply(data) {
    return {
      m0: data.m0, // Currency in circulation
      m1: data.m1, // M0 + demand deposits
      m2: data.m2, // M1 + savings, small time deposits
      m3: data.m3, // M2 + large time deposits
      growth: {
        m1Growth: this._calcGrowth(data.m1History),
        m2Growth: this._calcGrowth(data.m2History)
      },
      velocity: data.gdp / data.m2,
      quantityTheory: {
        mv: data.m2 * (data.gdp / data.m2),
        pq: data.priceLevel * data.realGdp
      }
    };
  }

  // Yield curve analysis
  analyzeYieldCurve(data) {
    const spread = data.tenYear - data.twoYear;
    const shape = spread > 0.5 ? 'normal' :
                  spread > 0 ? 'flat' :
                  'inverted';

    return {
      shortTerm: {
        threeMonth: data.threeMonth,
        oneYear: data.oneYear,
        twoYear: data.twoYear
      },
      longTerm: {
        fiveYear: data.fiveYear,
        tenYear: data.tenYear,
        thirtyYear: data.thirtyYear
      },
      spread210: spread,
      spread103: data.tenYear - data.threeMonth,
      shape: shape,
      recessionSignal: spread < 0,
      termPremium: data.termPremium
    };
  }

  _calcGrowth(values) {
    if (values.length < 2) return 0;
    return ((values[values.length - 1] - values[values.length - 2]) / values[values.length - 2] * 100).toFixed(2);
  }
}
```

## Fiscal Policy Analysis

```javascript
class FiscalPolicyAnalysis {
  // Budget analysis
  analyzeBudget(data) {
    const balance = data.revenue - data.spending;
    const balancePercent = balance / data.gdp * 100;

    return {
      revenue: {
        total: data.revenue,
        asPercentGDP: (data.revenue / data.gdp * 100).toFixed(1),
        sources: data.revenueSources,
        taxRevenue: data.taxRevenue,
        nonTaxRevenue: data.nonTaxRevenue
      },
      spending: {
        total: data.spending,
        asPercentGDP: (data.spending / data.gdp * 100).toFixed(1),
        mandatory: data.mandatorySpending,
        discretionary: data.discretionarySpending,
        interestPayments: data.interestPayments
      },
      balance: balance,
      balanceAsPercentGDP: balancePercent.toFixed(1),
      primaryBalance: balance + data.interestPayments,
      cyclicallyAdjusted: data.structuralBalance
    };
  }

  // Debt sustainability analysis
  analyzeDebtSustainability(data) {
    const debtToGDP = data.debt / data.gdp * 100;
    const primaryBalance = data.primaryBalance / data.gdp * 100;
    const interestRate = data.averageInterestRate;
    const growthRate = data.nominalGrowthRate;

    // Debt dynamics equation
    const debtDynamic = (interestRate - growthRate) * debtToGDP / 100;
    const stabilizingPrimaryBalance = debtDynamic;

    return {
      currentDebt: data.debt,
      debtToGDP: debtToGDP.toFixed(1),
      trajectory: primaryBalance > stabilizingPrimaryBalance ? 'declining' : 'increasing',
      stabilizingPrimaryBalance: stabilizingPrimaryBalance.toFixed(1),
      actualPrimaryBalance: primaryBalance.toFixed(1),
      gap: (primaryBalance - stabilizingPrimaryBalance).toFixed(1),
      interestGrowthDifferential: (interestRate - growthRate).toFixed(1),
      debtServiceRatio: data.interestPayments / data.revenue * 100
    };
  }

  // Fiscal multiplier estimation
  estimateFiscalMultiplier(conditions) {
    let multiplier = 1.0;

    // Adjust based on economic conditions
    if (conditions.outputGap < -2) multiplier += 0.5; // Recession
    if (conditions.monetaryAccommodation) multiplier += 0.3;
    if (conditions.openEconomy) multiplier -= 0.2;
    if (conditions.highDebt) multiplier -= 0.2;
    if (conditions.zeroBound) multiplier += 0.4;

    return {
      estimated: multiplier.toFixed(2),
      factors: {
        baseMultiplier: 1.0,
        outputGapAdjustment: conditions.outputGap < -2 ? 0.5 : 0,
        monetaryAdjustment: conditions.monetaryAccommodation ? 0.3 : 0,
        openEconomyAdjustment: conditions.openEconomy ? -0.2 : 0,
        debtAdjustment: conditions.highDebt ? -0.2 : 0,
        zeroBoundAdjustment: conditions.zeroBound ? 0.4 : 0
      },
      interpretation: multiplier > 1.5 ? 'High effectiveness' :
                     multiplier > 1 ? 'Moderate effectiveness' :
                     'Limited effectiveness'
    };
  }
}
```

## Policy Impact Assessment

```javascript
class PolicyImpactAssessment {
  // Cost-benefit analysis
  costBenefitAnalysis(policy) {
    const pvBenefits = this._presentValue(policy.benefits, policy.discountRate, policy.years);
    const pvCosts = this._presentValue(policy.costs, policy.discountRate, policy.years);
    const npv = pvBenefits - pvCosts;
    const bcr = pvBenefits / pvCosts;

    return {
      presentValueBenefits: pvBenefits.toFixed(0),
      presentValueCosts: pvCosts.toFixed(0),
      netPresentValue: npv.toFixed(0),
      benefitCostRatio: bcr.toFixed(2),
      recommendation: npv > 0 && bcr > 1 ? 'Proceed' : 'Reconsider',
      sensitivity: this._sensitivityAnalysis(policy)
    };
  }

  _presentValue(cashflows, rate, years) {
    return cashflows.reduce((pv, cf, i) => {
      return pv + cf / Math.pow(1 + rate, i + 1);
    }, 0);
  }

  _sensitivityAnalysis(policy) {
    const scenarios = ['pessimistic', 'base', 'optimistic'];
    return scenarios.map(scenario => {
      const adjustment = scenario === 'pessimistic' ? 0.8 :
                        scenario === 'optimistic' ? 1.2 : 1;
      const adjustedBenefits = policy.benefits.map(b => b * adjustment);
      const pv = this._presentValue(adjustedBenefits, policy.discountRate, policy.years);
      return { scenario, npv: pv - this._presentValue(policy.costs, policy.discountRate, policy.years) };
    });
  }

  // Distributional analysis
  distributionalImpact(policy) {
    return {
      incomeQuintiles: policy.quintileImpacts.map((impact, i) => ({
        quintile: i + 1,
        percentChange: impact,
        absoluteChange: policy.baseIncome[i] * impact / 100
      })),
      giniChange: policy.giniAfter - policy.giniBefore,
      progressivity: this._assessProgressivity(policy.quintileImpacts),
      winners: policy.winners,
      losers: policy.losers
    };
  }

  _assessProgressivity(impacts) {
    // Check if lower quintiles benefit more
    const bottomHalf = (impacts[0] + impacts[1]) / 2;
    const topHalf = (impacts[3] + impacts[4]) / 2;

    if (bottomHalf > topHalf + 1) return 'Progressive';
    if (topHalf > bottomHalf + 1) return 'Regressive';
    return 'Neutral';
  }
}
```

## Data Sources

```javascript
const ECONOMIC_DATA_SOURCES = {
  us: {
    fed: 'https://fred.stlouisfed.org',
    bea: 'https://www.bea.gov/data',
    bls: 'https://www.bls.gov/data',
    treasury: 'https://fiscaldata.treasury.gov',
    census: 'https://data.census.gov'
  },
  international: {
    imf: 'https://data.imf.org',
    worldBank: 'https://data.worldbank.org',
    oecd: 'https://data.oecd.org',
    bis: 'https://www.bis.org/statistics'
  },
  centralBanks: {
    fed: 'https://federalreserve.gov/data',
    ecb: 'https://sdw.ecb.europa.eu',
    boj: 'https://www.stat-search.boj.or.jp',
    boe: 'https://www.bankofengland.co.uk/statistics'
  }
};
```

## Usage Examples

```javascript
// Economic indicators
const indicators = new EconomicIndicators();
const gdpAnalysis = indicators.analyzeGDP({
  values: [21000, 21500, 22100, 22800, 23400],
  consumption: 16000,
  investment: 4000,
  government: 4500,
  exports: 2500,
  imports: 3600,
  population: 330000000
});

// Monetary policy
const monetary = new MonetaryPolicyAnalysis();
const policyStance = monetary.analyzePolicyStance({
  policyRate: 5.25,
  lastChange: 0.25,
  direction: 'hawkish',
  inflation: 3.2,
  target: 2.0,
  outputGap: -0.5
});

// Fiscal policy
const fiscal = new FiscalPolicyAnalysis();
const debtAnalysis = fiscal.analyzeDebtSustainability({
  debt: 33000000000000,
  gdp: 27000000000000,
  primaryBalance: -500000000000,
  averageInterestRate: 3.5,
  nominalGrowthRate: 4.5,
  interestPayments: 700000000000,
  revenue: 4500000000000
});

// Policy impact
const impact = new PolicyImpactAssessment();
const cba = impact.costBenefitAnalysis({
  benefits: [100, 150, 200, 250, 300],
  costs: [500, 50, 50, 50, 50],
  discountRate: 0.03,
  years: 5
});
```
