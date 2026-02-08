#!/usr/bin/env node
/**
 * LinkedIn Profile Scraper CLI
 * Usage: node scripts/scrape-linkedin.js
 */

import "dotenv/config";
import {
  extractLinkedInProfile,
  saveLinkedInProfile,
  loadLinkedInProfile
} from "../src/services/integrations/linkedin-scraper.js";

const main = async () => {
  console.log("===========================================");
  console.log("  BACKBONE LinkedIn Profile Extractor");
  console.log("===========================================\n");

  // Check for existing profile
  const existingProfile = loadLinkedInProfile();
  if (existingProfile) {
    console.log("Found existing profile:");
    console.log(`  Name: ${existingProfile.profile?.name || "Unknown"}`);
    console.log(`  URL: ${existingProfile.profileUrl}`);
    console.log(`  Extracted: ${existingProfile.extractedAt}\n`);
  }

  console.log("Starting LinkedIn profile extraction...\n");
  console.log("Note: This will open a browser window.");
  console.log("If not logged in, you'll need to log in manually.\n");

  try {
    const result = await extractLinkedInProfile();

    if (!result.success) {
      console.error(`\nExtraction failed: ${result.error}`);
      process.exit(1);
    }

    console.log("\n===========================================");
    console.log("  Extraction Complete!");
    console.log("===========================================\n");

    console.log(`Profile URL: ${result.profileUrl}`);
    console.log(`Screenshot: ${result.screenshotPath}`);

    if (result.profile) {
      console.log("\nExtracted Profile Data:");
      console.log("------------------------");
      console.log(`Name: ${result.profile.name}`);
      console.log(`Headline: ${result.profile.headline}`);
      console.log(`Location: ${result.profile.location}`);
      console.log(`Current Role: ${result.profile.currentRole}`);
      console.log(`Current Company: ${result.profile.currentCompany}`);
      console.log(`Is Student: ${result.profile.isStudent}`);

      if (result.profile.education) {
        console.log("\nEducation:");
        console.log(`  School: ${result.profile.education.school}`);
        console.log(`  Degree: ${result.profile.education.degree}`);
        console.log(`  Field: ${result.profile.education.field}`);
        console.log(`  Graduation: ${result.profile.education.graduationYear}`);
      }

      if (result.profile.skills?.length > 0) {
        console.log(`\nSkills: ${result.profile.skills.join(", ")}`);
      }

      console.log(`\nSummary: ${result.profile.summary}`);
    }

    if (result.partial) {
      console.log(`\nNote: GPT-4o analysis failed: ${result.analysisError}`);
      console.log("Raw data extracted from page:");
      console.log(JSON.stringify(result.rawData, null, 2));
    }

    // Save the profile
    const saveResult = await saveLinkedInProfile(result);
    if (saveResult.success) {
      console.log(`\nProfile saved to: ${saveResult.path}`);
    } else {
      console.error(`\nFailed to save profile: ${saveResult.error}`);
    }

    console.log("\nDone!");

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
};

main();
