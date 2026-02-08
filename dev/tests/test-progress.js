/**
 * Test script to calculate user's actual progress and find best matching person
 */

import { getProgressResearch } from "./src/services/progress-research.js";
import { findBestMatch, getTargetPerson, buildUserProfile, PEOPLE_DATABASE } from "./src/services/person-matcher.js";
import { getGoalTracker } from "./src/services/goal-tracker.js";
import { getLifeScores } from "./src/services/life-scores.js";
import { isOuraConfigured } from "./src/services/oura-service.js";
import { loadAlpacaConfig } from "./src/services/alpaca-setup.js";
import { isSignedIn } from "./src/services/firebase-auth.js";

console.log("=".repeat(70));
console.log("PERSON MATCHING ALGORITHM TEST");
console.log(`Analyzing ${PEOPLE_DATABASE.length} successful people to find your best match`);
console.log("=".repeat(70));

// Gather connected data
const connectedData = {
  firebase: { connected: isSignedIn() },
  ouraHealth: { connected: isOuraConfigured() },
  portfolio: { connected: false },
  linkedIn: { connected: false }
};

// Check Alpaca
try {
  const alpacaConfig = loadAlpacaConfig();
  if (alpacaConfig?.apiKey && !alpacaConfig.apiKey.includes("PASTE")) {
    connectedData.portfolio = { connected: true };
  }
} catch (e) {}

console.log("\n--- CONNECTED SERVICES ---");
console.log(`Firebase: ${connectedData.firebase.connected ? "✓" : "✗"}`);
console.log(`Oura Health: ${connectedData.ouraHealth.connected ? "✓" : "✗"}`);
console.log(`Portfolio: ${connectedData.portfolio.connected ? "✓" : "✗"}`);
console.log(`LinkedIn: ${connectedData.linkedIn.connected ? "✓" : "✗"}`);

// Build user profile
const userProfile = buildUserProfile(connectedData);

console.log("\n--- USER PROFILE ---");
console.log(`Category: ${userProfile.category}`);
console.log(`Traits: ${userProfile.traits.join(", ") || "none identified"}`);
console.log(`Interests: ${userProfile.interests.join(", ") || "none identified"}`);
console.log(`Goals: ${userProfile.goals.length}`);

// Find best match
const result = findBestMatch(connectedData);

console.log("\n--- MATCHING ALGORITHM ---");
console.log(`Total people analyzed: ${result.totalPeopleAnalyzed}`);

console.log("\n--- TOP 5 MATCHES ---");
result.topMatches.forEach((match, i) => {
  const p = match.person;
  console.log(`\n${i + 1}. ${p.name} (${match.similarity.score}% match)`);
  console.log(`   Category: ${p.category}`);
  console.log(`   Score: ${p.score}%`);
  console.log(`   Traits: ${p.traits.slice(0, 3).join(", ")}`);
  console.log(`   Top achievement: ${p.achievements[0]}`);
});

// Best match details
const best = result.bestMatch;
console.log("\n--- BEST MATCH (YOUR TARGET PERSON) ---");
console.log(`Name: ${best.person.name}`);
console.log(`Match Score: ${best.similarity.score}%`);
console.log(`Category: ${best.person.category}`);
console.log(`Their Score: ${best.person.score}%`);
console.log(`Net Worth: $${(best.person.netWorth / 1000000000).toFixed(1)}B`);
console.log(`Background: ${best.person.background}`);
console.log("\nAchievements:");
best.person.achievements.forEach(a => console.log(`  - ${a}`));
console.log(`\nTraits: ${best.person.traits.join(", ")}`);

// Get target person for display
const targetPerson = getTargetPerson(connectedData);
console.log("\n--- FOR DISPLAY ---");
console.log(`${targetPerson.name} ${targetPerson.score}%`);
console.log(`Reason: ${targetPerson.matchReason}`);

// Compare with average
const progressResearch = getProgressResearch();
const comparison = progressResearch.getProgressComparison();

console.log("\n--- FINAL COMPARISON ---");
console.log(`You: ${comparison.user.score}%`);
console.log(`${targetPerson.name}: ${targetPerson.score}%`);
console.log(`Avg Person: ${comparison.avgPerson.score}%`);

// Life scores
const lifeScores = getLifeScores();
const displayData = lifeScores.getDisplayData();

console.log("\n--- LIFE SCORES ---");
console.log(`Overall: ${displayData.overall}%`);
if (displayData.categories.length > 0) {
  displayData.categories.forEach(c => {
    console.log(`  ${c.name}: ${c.score}%`);
  });
}

console.log("\n" + "=".repeat(70));
console.log("TEST COMPLETE");
console.log("=".repeat(70));
