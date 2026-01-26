# Geopolitical Analysis Skill

Analyze geopolitical dynamics, international relations, and global policy.

## Geopolitical Framework

```javascript
class GeopoliticalAnalysis {
  constructor(options = {}) {
    this.region = options.region;
    this.timeframe = options.timeframe;
  }

  // Country risk assessment
  assessCountryRisk(country) {
    return {
      political: {
        governmentStability: country.govStability,
        policyConsistency: country.policyConsistency,
        institutionalStrength: country.institutions,
        corruptionIndex: country.corruption,
        civilLiberties: country.civilLiberties,
        score: this._calculateScore([
          country.govStability,
          country.policyConsistency,
          country.institutions,
          10 - country.corruption,
          country.civilLiberties
        ])
      },
      security: {
        internalConflict: country.internalConflict,
        externalThreat: country.externalThreat,
        terrorismRisk: country.terrorism,
        borderDisputes: country.borderDisputes,
        score: this._calculateScore([
          10 - country.internalConflict,
          10 - country.externalThreat,
          10 - country.terrorism,
          10 - country.borderDisputes
        ])
      },
      economic: {
        gdpGrowth: country.gdpGrowth,
        fiscalHealth: country.fiscalHealth,
        monetaryStability: country.monetaryStability,
        tradeBalance: country.tradeBalance,
        score: this._calculateScore([
          country.gdpGrowth > 3 ? 8 : country.gdpGrowth > 0 ? 5 : 2,
          country.fiscalHealth,
          country.monetaryStability,
          country.tradeBalance
        ])
      },
      social: {
        inequality: country.inequality,
        unemployment: country.unemployment,
        demographics: country.demographics,
        socialCohesion: country.socialCohesion,
        score: this._calculateScore([
          10 - country.inequality,
          10 - country.unemployment,
          country.demographics,
          country.socialCohesion
        ])
      },
      overall: null
    };
  }

  _calculateScore(values) {
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  }

  // Power analysis
  analyzePowerDynamics(region) {
    return {
      majorPowers: region.majorPowers.map(p => ({
        name: p.name,
        militaryCapability: p.military,
        economicWeight: p.economy,
        softPower: p.softPower,
        alliances: p.alliances,
        sphereOfInfluence: p.influence
      })),
      powerBalance: this._assessPowerBalance(region),
      conflictRisk: this._assessConflictRisk(region),
      cooperationPotential: this._assessCooperationPotential(region)
    };
  }

  _assessPowerBalance(region) {
    const powers = region.majorPowers;
    const totalPower = powers.reduce((sum, p) => sum + p.military + p.economy, 0);
    const distribution = powers.map(p => ({
      name: p.name,
      share: ((p.military + p.economy) / totalPower * 100).toFixed(1)
    }));

    const maxShare = Math.max(...distribution.map(d => parseFloat(d.share)));
    const type = maxShare > 50 ? 'Hegemonic' :
                 maxShare > 35 ? 'Bipolar' :
                 'Multipolar';

    return { type, distribution };
  }

  _assessConflictRisk(region) {
    const factors = {
      territorialDisputes: region.disputes?.length || 0,
      historicalAnimosity: region.historicalConflicts || 0,
      resourceCompetition: region.resourceCompetition || 0,
      ideologicalDivisions: region.ideologicalDivisions || 0,
      armamentTrends: region.armamentTrends || 0
    };

    const score = Object.values(factors).reduce((a, b) => a + b, 0) / 5;
    return {
      score: score.toFixed(1),
      level: score > 7 ? 'High' : score > 4 ? 'Medium' : 'Low',
      factors
    };
  }

  _assessCooperationPotential(region) {
    return {
      existingInstitutions: region.institutions,
      tradeIntegration: region.tradeIntegration,
      sharedChallenges: region.sharedChallenges,
      diplomaticChannels: region.diplomaticChannels
    };
  }
}
```

## International Relations Analysis

```javascript
class InternationalRelations {
  // Bilateral relationship analysis
  analyzeBilateralRelation(country1, country2) {
    return {
      diplomatic: {
        embassies: country1.embassies?.includes(country2.name),
        treatiesCount: this._countTreaties(country1, country2),
        recentInteractions: country1.interactions?.[country2.name],
        ambassadorLevel: country1.ambassadorLevel?.[country2.name]
      },
      economic: {
        tradeVolume: this._getTrade(country1, country2),
        tradeBalance: this._getTradeBalance(country1, country2),
        investmentFlows: this._getInvestment(country1, country2),
        economicAgreements: this._getEconomicAgreements(country1, country2)
      },
      security: {
        allianceStatus: this._getAllianceStatus(country1, country2),
        militaryCooperation: country1.militaryPartners?.includes(country2.name),
        intelligenceSharing: country1.intelPartners?.includes(country2.name),
        jointExercises: country1.jointExercises?.[country2.name]
      },
      cultural: {
        diaspora: this._getDiaspora(country1, country2),
        studentExchange: country1.studentExchange?.[country2.name],
        tourismFlows: country1.tourism?.[country2.name],
        mediaPortrayal: country1.mediaPortrayal?.[country2.name]
      },
      overallAssessment: null
    };
  }

  _countTreaties(c1, c2) {
    return c1.treaties?.filter(t => t.parties?.includes(c2.name))?.length || 0;
  }

  _getTrade(c1, c2) {
    return c1.exports?.[c2.name] + c1.imports?.[c2.name] || 0;
  }

  _getTradeBalance(c1, c2) {
    return (c1.exports?.[c2.name] || 0) - (c1.imports?.[c2.name] || 0);
  }

  _getInvestment(c1, c2) {
    return {
      outward: c1.fdiOutward?.[c2.name] || 0,
      inward: c1.fdiInward?.[c2.name] || 0
    };
  }

  _getEconomicAgreements(c1, c2) {
    return c1.economicAgreements?.filter(a => a.parties?.includes(c2.name)) || [];
  }

  _getAllianceStatus(c1, c2) {
    if (c1.allies?.includes(c2.name)) return 'Allied';
    if (c1.partners?.includes(c2.name)) return 'Strategic Partner';
    if (c1.rivals?.includes(c2.name)) return 'Rival';
    return 'Neutral';
  }

  _getDiaspora(c1, c2) {
    return {
      c1InC2: c2.diaspora?.[c1.name] || 0,
      c2InC1: c1.diaspora?.[c2.name] || 0
    };
  }

  // Alliance network analysis
  analyzeAllianceNetwork(countries) {
    const nodes = countries.map(c => ({
      id: c.name,
      power: c.military + c.economy
    }));

    const edges = [];
    for (let i = 0; i < countries.length; i++) {
      for (let j = i + 1; j < countries.length; j++) {
        const status = this._getAllianceStatus(countries[i], countries[j]);
        if (status !== 'Neutral') {
          edges.push({
            source: countries[i].name,
            target: countries[j].name,
            type: status,
            weight: status === 'Allied' ? 3 : status === 'Strategic Partner' ? 2 : -1
          });
        }
      }
    }

    return { nodes, edges };
  }
}
```

## Regional Analysis

```javascript
class RegionalAnalysis {
  // Define regional blocs
  static REGIONAL_BLOCS = {
    EU: { members: 27, type: 'supranational', integration: 'high' },
    NATO: { members: 31, type: 'military alliance', integration: 'medium' },
    ASEAN: { members: 10, type: 'regional cooperation', integration: 'medium' },
    AU: { members: 55, type: 'continental organization', integration: 'low' },
    BRICS: { members: 9, type: 'economic grouping', integration: 'low' },
    SCO: { members: 9, type: 'security cooperation', integration: 'medium' },
    GCC: { members: 6, type: 'regional cooperation', integration: 'medium' }
  };

  // Analyze regional dynamics
  analyzeRegion(region) {
    return {
      geography: {
        area: region.area,
        population: region.population,
        countries: region.countries,
        strategicLocations: region.strategicLocations
      },
      politics: {
        governanceTypes: this._categorizeGovernance(region.countries),
        regionalOrganizations: region.organizations,
        ongoingConflicts: region.conflicts,
        peaceProcesses: region.peaceProcesses
      },
      economy: {
        totalGDP: region.countries.reduce((sum, c) => sum + c.gdp, 0),
        majorEconomies: region.countries.filter(c => c.gdp > region.gdpThreshold),
        tradeBlocs: region.tradeBlocs,
        keyIndustries: region.keyIndustries,
        resourceEndowments: region.resources
      },
      security: {
        militaryPresence: region.foreignMilitaryBases,
        nuclearStatus: region.nuclearStates,
        conflictZones: region.conflictZones,
        transnationalThreats: region.transnationalThreats
      }
    };
  }

  _categorizeGovernance(countries) {
    const categories = {
      democracy: 0,
      hybridRegime: 0,
      authoritarian: 0
    };

    countries.forEach(c => {
      if (c.democracyIndex > 6) categories.democracy++;
      else if (c.democracyIndex > 4) categories.hybridRegime++;
      else categories.authoritarian++;
    });

    return categories;
  }

  // Hotspot analysis
  analyzeHotspot(hotspot) {
    return {
      location: hotspot.location,
      parties: hotspot.parties,
      rootCauses: hotspot.causes,
      currentStatus: hotspot.status,
      timeline: hotspot.timeline,
      casualties: hotspot.casualties,
      displacement: hotspot.displacement,
      internationalInvolvement: hotspot.internationalInvolvement,
      resolutionProspects: this._assessResolutionProspects(hotspot),
      escalationRisk: this._assessEscalationRisk(hotspot),
      humanitarianNeeds: hotspot.humanitarianNeeds
    };
  }

  _assessResolutionProspects(hotspot) {
    const factors = {
      negotiationsOngoing: hotspot.negotiations ? 1 : 0,
      mediatorInvolved: hotspot.mediator ? 1 : 0,
      ceasefireInPlace: hotspot.ceasefire ? 1 : 0,
      partiesWillingToTalk: hotspot.willingnessToTalk || 0,
      internationalPressure: hotspot.internationalPressure || 0
    };

    const score = Object.values(factors).reduce((a, b) => a + b, 0);
    return {
      score,
      assessment: score > 3 ? 'Favorable' : score > 1 ? 'Uncertain' : 'Poor'
    };
  }

  _assessEscalationRisk(hotspot) {
    const factors = {
      recentViolence: hotspot.recentViolence || 0,
      weaponsProliferation: hotspot.weaponsProliferation || 0,
      externalIntervention: hotspot.externalIntervention || 0,
      resourceCompetition: hotspot.resourceCompetition || 0,
      ethnicTensions: hotspot.ethnicTensions || 0
    };

    const score = Object.values(factors).reduce((a, b) => a + b, 0) / 5;
    return {
      score: score.toFixed(1),
      level: score > 7 ? 'High' : score > 4 ? 'Medium' : 'Low',
      factors
    };
  }
}
```

## Strategic Analysis Tools

```javascript
class StrategicAnalysis {
  // DIME analysis (Diplomatic, Information, Military, Economic)
  dimeAnalysis(actor, issue) {
    return {
      diplomatic: {
        tools: ['treaties', 'alliances', 'negotiations', 'sanctions'],
        currentApproach: actor.diplomaticApproach,
        leverage: actor.diplomaticLeverage,
        constraints: actor.diplomaticConstraints
      },
      information: {
        tools: ['media', 'propaganda', 'cyber', 'intelligence'],
        currentApproach: actor.infoApproach,
        capabilities: actor.infoCaps,
        vulnerabilities: actor.infoVulnerabilities
      },
      military: {
        tools: ['deterrence', 'coercion', 'force projection', 'defense'],
        currentPosture: actor.militaryPosture,
        capabilities: actor.militaryCaps,
        constraints: actor.militaryConstraints
      },
      economic: {
        tools: ['trade', 'investment', 'sanctions', 'aid'],
        currentApproach: actor.economicApproach,
        leverage: actor.economicLeverage,
        vulnerabilities: actor.economicVulnerabilities
      }
    };
  }

  // Scenario planning
  buildScenarios(situation) {
    return {
      baseline: {
        name: 'Status Quo',
        probability: situation.baselineProbability,
        description: 'Current trends continue',
        implications: situation.baselineImplications
      },
      optimistic: {
        name: 'Cooperation',
        probability: situation.optimisticProbability,
        description: 'Parties find common ground',
        triggers: situation.optimisticTriggers,
        implications: situation.optimisticImplications
      },
      pessimistic: {
        name: 'Escalation',
        probability: situation.pessimisticProbability,
        description: 'Tensions increase significantly',
        triggers: situation.pessimisticTriggers,
        implications: situation.pessimisticImplications
      },
      wildcard: {
        name: 'Black Swan',
        probability: situation.wildcardProbability,
        description: 'Unexpected major event',
        examples: situation.wildcardExamples
      }
    };
  }

  // Red team analysis
  redTeamAnalysis(adversary, ownPosition) {
    return {
      adversaryObjectives: adversary.objectives,
      adversaryCapabilities: adversary.capabilities,
      adversaryConstraints: adversary.constraints,
      likelyActions: this._predictActions(adversary),
      vulnerabilitiesExploited: this._identifyVulnerabilities(ownPosition),
      counterStrategies: this._developCounterStrategies(adversary, ownPosition)
    };
  }

  _predictActions(adversary) {
    return adversary.objectives.map(obj => ({
      objective: obj,
      likelyApproach: adversary.preferredMethods?.[obj] || 'unknown',
      probability: adversary.actionProbability?.[obj] || 'medium'
    }));
  }

  _identifyVulnerabilities(position) {
    return position.weaknesses?.map(w => ({
      vulnerability: w,
      exploitability: position.exploitability?.[w] || 'medium',
      mitigationStatus: position.mitigations?.[w] || 'none'
    })) || [];
  }

  _developCounterStrategies(adversary, position) {
    return adversary.objectives.map(obj => ({
      adversaryObjective: obj,
      counterStrategy: position.counters?.[obj] || 'develop strategy',
      resourcesRequired: position.counterResources?.[obj] || 'TBD'
    }));
  }
}
```

## Usage Examples

```javascript
// Country risk assessment
const geo = new GeopoliticalAnalysis({ region: 'Middle East' });
const risk = geo.assessCountryRisk({
  govStability: 6,
  policyConsistency: 5,
  institutions: 4,
  corruption: 6,
  civilLiberties: 3,
  internalConflict: 4,
  externalThreat: 5,
  terrorism: 6,
  borderDisputes: 3,
  gdpGrowth: 2.5,
  fiscalHealth: 5,
  monetaryStability: 6,
  tradeBalance: 4,
  inequality: 7,
  unemployment: 15,
  demographics: 6,
  socialCohesion: 4
});

// Alliance network
const ir = new InternationalRelations();
const network = ir.analyzeAllianceNetwork([
  { name: 'Country A', military: 10, economy: 15, allies: ['Country B'] },
  { name: 'Country B', military: 8, economy: 12, allies: ['Country A'] },
  { name: 'Country C', military: 12, economy: 20, rivals: ['Country A'] }
]);

// Regional analysis
const regional = new RegionalAnalysis();
const hotspot = regional.analyzeHotspot({
  location: 'Region X',
  parties: ['Party A', 'Party B'],
  causes: ['territorial', 'ethnic', 'resources'],
  status: 'active conflict',
  negotiations: true,
  mediator: 'UN',
  recentViolence: 8,
  externalIntervention: 6
});

// Strategic analysis
const strategic = new StrategicAnalysis();
const scenarios = strategic.buildScenarios({
  baselineProbability: 0.5,
  optimisticProbability: 0.2,
  pessimisticProbability: 0.25,
  wildcardProbability: 0.05
});
```
