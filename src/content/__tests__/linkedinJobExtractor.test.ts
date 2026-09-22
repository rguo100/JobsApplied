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

class FixtureElement {
  textContent: string;
  parentElement: FixtureElement | null = null;
  private queryOne = new Map<string, FixtureElement>();
  private queryMany = new Map<string, FixtureElement[]>();

  constructor(textContent = "") {
    this.textContent = textContent;
  }

  setQuery(selector: string, element: FixtureElement): this {
    this.queryOne.set(selector, element);
    return this;
  }

  setQueryAll(selector: string, elements: FixtureElement[]): this {
    this.queryMany.set(selector, elements);
    return this;
  }

  querySelector(selector: string): FixtureElement | null {
    return this.queryOne.get(selector) || this.queryMany.get(selector)?.[0] || null;
  }

  querySelectorAll(selector: string): FixtureElement[] {
    return this.queryMany.get(selector) || [];
  }

  contains(element: FixtureElement): boolean {
    let current: FixtureElement | null = element;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }
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
  {
    name: "Montreal DOM variant: known top-card location selector remains supported",
    run: () => {
      const root = new FixtureElement();
      const locationLine = new FixtureElement("Montreal, QC · 1 week ago · 23 applicants");
      root.setQueryAll(".job-details-jobs-unified-top-card__primary-description-container .tvm__text", [
        locationLine,
      ]);

      const location = extractLocation({} as Document, root as unknown as Element, "Cisco");
      if (location !== "Montreal, QC") {
        throw new Error(`Expected Montreal DOM fixture to yield 'Montreal, QC', got '${location}'`);
      }
    },
  },
  {
    name: "Active-job link fixture: Greater St. John's metadata is found without selecting decoy cards",
    run: () => {
      const activeRoot = new FixtureElement();
      const header = new FixtureElement();
      const titleParagraph = new FixtureElement("Software Engineer II");
      const activeJobLink = new FixtureElement("Software Engineer II");
      const metadata = new FixtureElement(
        "Greater St. John's Metropolitan Area · 2 weeks ago · 27 people clicked apply"
      );
      const leftToronto = new FixtureElement("Toronto, ON · 3 days ago · 20 people clicked apply");
      const leftCalgary = new FixtureElement("Calgary, AB · 4 days ago · 10 people clicked apply");

      activeJobLink.parentElement = titleParagraph;
      titleParagraph.parentElement = header;
      metadata.parentElement = header;
      header.parentElement = activeRoot;
      activeRoot.setQuery('a[href*="/jobs/view/4462333845/"]', activeJobLink);
      header.setQueryAll("p", [titleParagraph, metadata]);

      // Decoys exist in the broader page/detail workspace, but not in the
      // active link's nearest header container.
      activeRoot.setQueryAll("p", [titleParagraph, metadata, leftToronto, leftCalgary]);

      const location = extractLocation(
        {} as Document,
        activeRoot as unknown as Element,
        "Affirm",
        "4462333845"
      );
      if (location !== "Greater St. John's Metropolitan Area") {
        throw new Error(
          `Expected active-job fixture to yield Greater St. John's Metropolitan Area, got '${location}'`
        );
      }
    },
  },
  {
    name: "Active-job link fixture: Ottawa reposted metadata is parsed from the same header",
    run: () => {
      const activeRoot = new FixtureElement();
      const header = new FixtureElement();
      const titleParagraph = new FixtureElement("Software Developer");
      const activeJobLink = new FixtureElement("Software Developer");
      const metadata = new FixtureElement("Ottawa, ON · Reposted 4 days ago · 78 people clicked apply");
      const leftToronto = new FixtureElement("Toronto, ON · 3 days ago · 20 people clicked apply");
      const leftCalgary = new FixtureElement("Calgary, AB · 4 days ago · 10 applicants");

      activeJobLink.parentElement = titleParagraph;
      titleParagraph.parentElement = header;
      metadata.parentElement = header;
      header.parentElement = activeRoot;
      activeRoot.setQuery('a[href*="/jobs/view/4460177757/"]', activeJobLink);
      header.setQueryAll("p", [titleParagraph, metadata]);
      activeRoot.setQueryAll("p", [titleParagraph, metadata, leftToronto, leftCalgary]);

      const location = extractLocation(
        {} as Document,
        activeRoot as unknown as Element,
        "Cisco",
        "4460177757"
      );
      if (location !== "Ottawa, ON") {
        throw new Error(`Expected active-job fixture to yield 'Ottawa, ON', got '${location}'`);
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
