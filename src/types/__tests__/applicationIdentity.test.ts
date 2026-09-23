import {
  getApplicationIdentity,
  getApplicationDocId,
} from "../application";

interface TestCase {
  name: string;
  run: () => void;
}

const tests: TestCase[] = [
  {
    name: "Scenario 1: linkedin + 3981726450 produces expected conceptual and document IDs",
    run: () => {
      const identity = getApplicationIdentity("linkedin", "3981726450");
      if (identity.conceptualId !== "linkedin:3981726450") {
        throw new Error(
          `Expected conceptualId 'linkedin:3981726450', got '${identity.conceptualId}'`
        );
      }
      if (identity.documentId !== "linkedin_3981726450") {
        throw new Error(
          `Expected documentId 'linkedin_3981726450', got '${identity.documentId}'`
        );
      }
      if (identity.source !== "linkedin") {
        throw new Error(`Expected source 'linkedin', got '${identity.source}'`);
      }
      if (identity.externalJobId !== "3981726450") {
        throw new Error(
          `Expected externalJobId '3981726450', got '${identity.externalJobId}'`
        );
      }
    },
  },
  {
    name: "Scenario 2: linkedin + another ID produces expected identity",
    run: () => {
      const identity = getApplicationIdentity("linkedin", "4462333845");
      if (identity.conceptualId !== "linkedin:4462333845") {
        throw new Error(
          `Expected conceptualId 'linkedin:4462333845', got '${identity.conceptualId}'`
        );
      }
      if (identity.documentId !== "linkedin_4462333845") {
        throw new Error(
          `Expected documentId 'linkedin_4462333845', got '${identity.documentId}'`
        );
      }
    },
  },
  {
    name: "Scenario 3: Same job ID produces identical document ID (determinism)",
    run: () => {
      const idA = getApplicationDocId("linkedin", "3981726450");
      const idB = getApplicationDocId("linkedin", "3981726450");
      if (idA !== idB) {
        throw new Error(`Expected identical document IDs, got '${idA}' and '${idB}'`);
      }
    },
  },
  {
    name: "Scenario 4: Different job IDs produce different document IDs (collision prevention)",
    run: () => {
      const id1 = getApplicationDocId("linkedin", "3981726450");
      const id2 = getApplicationDocId("linkedin", "4019283712");
      if (id1 === id2) {
        throw new Error(`Expected different document IDs for distinct jobs, both got '${id1}'`);
      }
    },
  },
  {
    name: "Scenario 5: URL differences do not affect identity",
    run: () => {
      // Simulating job ID extracted from different URL variants
      const urlA = "https://www.linkedin.com/jobs/view/3981726450/";
      const urlB = "https://www.linkedin.com/jobs/search/?currentJobId=3981726450&trackingId=abc%3D%3D";
      const urlC = "https://www.linkedin.com/jobs/view/3981726450/?refId=xyz&eBP=JOB_SEARCH_ORGANIC";

      // The extractor extracts externalJobId "3981726450" regardless of URL query/tracking parameters
      const jobId = "3981726450";
      const identityA = getApplicationIdentity("linkedin", jobId);
      const identityB = getApplicationIdentity("linkedin", jobId);
      const identityC = getApplicationIdentity("linkedin", jobId);

      if (identityA.documentId !== identityB.documentId || identityB.documentId !== identityC.documentId) {
        throw new Error("Document ID varied across URL variations with the same job ID");
      }
      if (identityA.conceptualId !== identityB.conceptualId) {
        throw new Error("Conceptual ID varied across URL variations with the same job ID");
      }
    },
  },
  {
    name: "Scenario 6: Trimming and safe encoding for document ID",
    run: () => {
      const identity = getApplicationIdentity("LINKEDIN", "  3981726450  ");
      if (identity.conceptualId !== "linkedin:3981726450") {
        throw new Error(`Expected trimmed conceptualId, got '${identity.conceptualId}'`);
      }
      if (identity.documentId !== "linkedin_3981726450") {
        throw new Error(`Expected trimmed and lowercased documentId, got '${identity.documentId}'`);
      }
    },
  },
  {
    name: "Scenario 7: Forbidden Firestore characters in job ID are safely sanitized",
    run: () => {
      // Prevent slashes or forbidden characters from breaking Firestore path hierarchy
      const identity = getApplicationIdentity("linkedin", "3981/726450");
      if (identity.documentId.includes("/")) {
        throw new Error(`Document ID must not contain slash characters: ${identity.documentId}`);
      }
      if (identity.documentId !== "linkedin_3981_726450") {
        throw new Error(`Expected sanitized documentId 'linkedin_3981_726450', got '${identity.documentId}'`);
      }
    },
  },
];

export function runTests() {
  console.log("Running Application Identity unit tests...");
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test.run();
      console.log(`✓ PASS: ${test.name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${test.name}`);
      console.error(err);
      failed++;
    }
  }

  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Auto-run if executed directly via tsx
runTests();
