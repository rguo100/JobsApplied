/**
 * Unit & fixture-based tests for LinkedIn job and location extraction.
 */
import {
  extractLocationFromMetadataLine,
  extractLocation,
  extractLinkedInJob,
  normalizeText,
} from "../linkedinJobExtractor";

interface TestCase {
  name: string;
  run: () => void;
}

const tests: TestCase[] = [
  {
    name: "Scenario A: Affirm - Software Engineer II - Victoria, BC (Remote)",
    run: () => {
      const metadata = "Affirm · Victoria, BC (Remote) · Reposted 3 days ago · 41 applicants";
      const location = extractLocationFromMetadataLine(metadata, "Affirm");
      if (location !== "Victoria, BC (Remote)") {
        throw new Error(`Expected 'Victoria, BC (Remote)', got '${location}'`);
      }
    },
  },
  {
    name: "Scenario B: Cisco - Software Developer - Montreal, QC",
    run: () => {
      const metadata = "Cisco · Montreal, QC · 1 week ago · 23 applicants";
      const location = extractLocationFromMetadataLine(metadata, "Cisco");
      if (location !== "Montreal, QC") {
        throw new Error(`Expected 'Montreal, QC', got '${location}'`);
      }
    },
  },
  {
    name: "Scenario C: Affirm - Software Engineer II - Ottawa, ON (Remote)",
    run: () => {
      const metadata = "Ottawa, ON (Remote)";
      const location = extractLocationFromMetadataLine(metadata, "Affirm");
      if (location !== "Ottawa, ON (Remote)") {
        throw new Error(`Expected 'Ottawa, ON (Remote)', got '${location}'`);
      }
    },
  },
  {
    name: "Scenario D: Combined metadata with bullets - 'Montreal, QC · 1 week ago · 23 applicants'",
    run: () => {
      const metadata = "Montreal, QC · 1 week ago · 23 applicants";
      const location = extractLocationFromMetadataLine(metadata, "Cisco");
      if (location !== "Montreal, QC") {
        throw new Error(`Expected 'Montreal, QC', got '${location}'`);
      }
    },
  },
  {
    name: "Scenario E: Delimited Workplace Type - 'Toronto, ON · Remote'",
    run: () => {
      const metadata = "Toronto, ON · Remote";
      const location = extractLocationFromMetadataLine(metadata, "Shopify");
      if (location !== "Toronto, ON (Remote)") {
        throw new Error(`Expected 'Toronto, ON (Remote)', got '${location}'`);
      }
    },
  },
  {
    name: "Scenario F: Fallback for missing location returns null from metadata line",
    run: () => {
      const metadata = "1 week ago · 23 applicants · Reposted";
      const location = extractLocationFromMetadataLine(metadata, "Acme");
      if (location !== null) {
        throw new Error(`Expected null for pure noise metadata, got '${location}'`);
      }
    },
  },
];

export function runTests() {
  console.log("Running LinkedIn Job Extractor unit tests...\n");
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      t.run();
      console.log(`✓ PASS: ${t.name}`);
      passed++;
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`✗ FAIL: ${t.name}`);
      console.error(`  Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Execute tests if running directly
runTests();
