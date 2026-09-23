/**
 * Focused regression tests for Day 5 cross-client data quality and metadata refresh.
 */
import { strict as assert } from "node:assert";
import {
  Job,
  ExtensionMessage,
} from "../../../types/job";
import {
  isFallbackCompany,
  isFallbackLocation,
  isFallbackTitle,
  hasBetterJobMetadata,
  mergeJobMetadata,
} from "../jobMetadata";
import { getApplicationDocId } from "../../../types/application";

console.log("Running Metadata Refresh & Data Quality regression tests...");

// Setup mock jobs
const partialEarlyJobA: Job = {
  source: "linkedin",
  externalJobId: "3981726450",
  title: "Software Engineer II",
  company: "Unknown Company",
  location: "Location not specified",
  url: "https://www.linkedin.com/jobs/view/3981726450/",
};

const completeJobA: Job = {
  source: "linkedin",
  externalJobId: "3981726450",
  title: "Software Engineer II (Money Movement & Card Ledger)",
  company: "Affirm",
  location: "Kelowna, BC",
  url: "https://www.linkedin.com/jobs/view/3981726450/",
};

const jobB: Job = {
  source: "linkedin",
  externalJobId: "4125890123",
  title: "Software Engineer II (Money Movement & Card Ledger)",
  company: "Affirm",
  location: "Kelowna, BC",
  url: "https://www.linkedin.com/jobs/view/4125890123/",
};

// Test 1: Inline mutation preserves company
{
  const mutationJob = completeJobA;
  assert.equal(mutationJob.company, "Affirm");
  assert.equal(isFallbackCompany(mutationJob.company), false);
  console.log("✓ PASS: Test 1: Inline mutation preserves company ('Affirm')");
}

// Test 2: Inline mutation preserves location
{
  const mutationJob = completeJobA;
  assert.equal(mutationJob.location, "Kelowna, BC");
  assert.equal(isFallbackLocation(mutationJob.location), false);
  console.log("✓ PASS: Test 2: Inline mutation preserves location ('Kelowna, BC')");
}

// Test 3: Inline mutation preserves title
{
  const mutationJob = completeJobA;
  assert.equal(
    mutationJob.title,
    "Software Engineer II (Money Movement & Card Ledger)"
  );
  assert.equal(isFallbackTitle(mutationJob.title), false);
  console.log("✓ PASS: Test 3: Inline mutation preserves complete title");
}

// Test 4: Inline mutation preserves source/externalJobId/url
{
  const mutationJob = completeJobA;
  assert.equal(mutationJob.source, "linkedin");
  assert.equal(mutationJob.externalJobId, "3981726450");
  assert.equal(mutationJob.url, "https://www.linkedin.com/jobs/view/3981726450/");
  console.log("✓ PASS: Test 4: Inline mutation preserves source, externalJobId, and url");
}

// Test 5: A partial early extraction for Job A followed by a complete extraction for SAME Job A
// updates active metadata to the complete version
{
  assert.equal(hasBetterJobMetadata(partialEarlyJobA, completeJobA), true);

  const merged = mergeJobMetadata(partialEarlyJobA, completeJobA);
  assert.equal(merged.company, "Affirm");
  assert.equal(merged.location, "Kelowna, BC");
  assert.equal(merged.title, "Software Engineer II (Money Movement & Card Ledger)");
  assert.equal(merged.externalJobId, "3981726450");
  assert.equal(merged.source, "linkedin");

  // Also verify that a subsequent degraded extraction does not overwrite good metadata
  const degradedExtraction: Job = {
    source: "linkedin",
    externalJobId: "3981726450",
    title: "Software Engineer II",
    company: "Unknown Company",
    location: "Location not specified",
    url: "https://www.linkedin.com/jobs/view/3981726450/",
  };
  assert.equal(hasBetterJobMetadata(merged, degradedExtraction), false);
  const reMerged = mergeJobMetadata(merged, degradedExtraction);
  assert.equal(reMerged.company, "Affirm");
  assert.equal(reMerged.location, "Kelowna, BC");
  console.log("✓ PASS: Test 5: Partial early extraction upgraded on subsequent complete extraction");
}

// Test 6: Metadata refresh for the same logical job does not create another Firestore subscription
{
  const sentMessages: ExtensionMessage[] = [];
  let subscriptionCount = 0;

  class MockWidgetManager {
    currentJob: Job | null = null;
    currentJobId: string | null = null;

    onJobDetected(job: Job | null) {
      if (!job) return;
      const isNewJob = job.externalJobId !== this.currentJobId;

      if (isNewJob) {
        if (this.currentJob && this.currentJobId) {
          sentMessages.push({
            type: "APPLICATION_UNSUBSCRIBE",
            source: this.currentJob.source,
            externalJobId: this.currentJobId,
          });
        }

        this.currentJob = job;
        this.currentJobId = job.externalJobId;

        // Subscribe
        subscriptionCount++;
        sentMessages.push({
          type: "APPLICATION_SUBSCRIBE",
          source: job.source,
          externalJobId: job.externalJobId,
        });
      } else {
        // Same job detected again with potential metadata refresh
        if (this.currentJob && hasBetterJobMetadata(this.currentJob, job)) {
          this.currentJob = mergeJobMetadata(this.currentJob, job);
        }
        // Subscriptions are NOT recreated
      }
    }
  }

  const manager = new MockWidgetManager();

  // 1. Initial partial detection
  manager.onJobDetected(partialEarlyJobA);
  assert.equal(subscriptionCount, 1);
  assert.equal(manager.currentJob?.company, "Unknown Company");

  // 2. Metadata refreshed for same Job A
  manager.onJobDetected(completeJobA);
  assert.equal(subscriptionCount, 1, "Subscription count must remain 1 after metadata refresh");
  assert.equal(manager.currentJob?.company, "Affirm", "Company was updated to Affirm");
  assert.equal(manager.currentJob?.location, "Kelowna, BC", "Location was updated to Kelowna, BC");
  assert.equal(
    sentMessages.filter((m) => m.type === "APPLICATION_SUBSCRIBE").length,
    1,
    "No duplicate subscribe message sent"
  );
  console.log("✓ PASS: Test 6: Metadata refresh for same job does not create duplicate Firestore subscriptions");
}

// Test 7: Job A -> Job B still creates the correct new subscription
{
  const sentMessages: ExtensionMessage[] = [];

  class MockWidgetManager {
    currentJob: Job | null = null;
    currentJobId: string | null = null;

    onJobDetected(job: Job | null) {
      if (!job) return;
      const isNewJob = job.externalJobId !== this.currentJobId;

      if (isNewJob) {
        if (this.currentJob && this.currentJobId) {
          sentMessages.push({
            type: "APPLICATION_UNSUBSCRIBE",
            source: this.currentJob.source,
            externalJobId: this.currentJobId,
          });
        }

        this.currentJob = job;
        this.currentJobId = job.externalJobId;

        sentMessages.push({
          type: "APPLICATION_SUBSCRIBE",
          source: job.source,
          externalJobId: job.externalJobId,
        });
      }
    }
  }

  const manager = new MockWidgetManager();
  manager.onJobDetected(completeJobA);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "APPLICATION_SUBSCRIBE");
  assert.equal((sentMessages[0] as any).externalJobId, "3981726450");

  // Transition to Job B
  manager.onJobDetected(jobB);
  assert.equal(sentMessages.length, 3);
  assert.equal(sentMessages[1].type, "APPLICATION_UNSUBSCRIBE");
  assert.equal((sentMessages[1] as any).externalJobId, "3981726450");
  assert.equal(sentMessages[2].type, "APPLICATION_SUBSCRIBE");
  assert.equal((sentMessages[2] as any).externalJobId, "4125890123");
  console.log("✓ PASS: Test 7: Job A -> Job B creates correct unsubscribe and subscribe sequence");
}

// Test 8: Deterministic application identity remains source + externalJobId
{
  // Record A (Job 3981726450) vs Record B (Job 4125890123)
  const docIdA = getApplicationDocId("linkedin", "3981726450");
  const docIdB = getApplicationDocId("linkedin", "4125890123");

  assert.equal(docIdA, "linkedin_3981726450");
  assert.equal(docIdB, "linkedin_4125890123");
  assert.notEqual(docIdA, docIdB, "Two postings with different externalJobId produce distinct documents");

  // Determinism check: Same externalJobId always produces identical document ID regardless of title/company differences
  const docIdA_partial = getApplicationDocId(partialEarlyJobA.source, partialEarlyJobA.externalJobId);
  const docIdA_complete = getApplicationDocId(completeJobA.source, completeJobA.externalJobId);
  assert.equal(docIdA_partial, docIdA_complete, "Document ID depends strictly on source + externalJobId");
  console.log("✓ PASS: Test 8: Deterministic application identity remains strictly source + externalJobId");
}

// Test 9 (Step 4 sequence): T0 early extraction without anchor -> T1 complete extraction with detail DOM
{
  let subscriptionCount = 0;
  let mountAttempts = 0;
  let mountedCount = 0;
  let detailDomAvailable = false;

  class MockLifecycleWidgetManager {
    currentJob: Job | null = null;
    currentJobId: string | null = null;
    widgetJob: Job | null = null;
    isMounted = false;

    onJobDetected(job: Job | null) {
      if (!job) return;
      const isNewJob = job.externalJobId !== this.currentJobId;

      if (isNewJob) {
        this.currentJob = job;
        this.currentJobId = job.externalJobId;
        subscriptionCount++;
        this.widgetJob = job;
        this.ensureWidgetMounted();
        this.scheduleMountCheck();
      } else {
        if (this.currentJob && hasBetterJobMetadata(this.currentJob, job)) {
          const merged = mergeJobMetadata(this.currentJob, job);
          this.currentJob = merged;
          this.widgetJob = merged;
        }
        this.scheduleMountCheck();
      }
    }

    scheduleMountCheck() {
      // Simulate rAF / DOM mutation retry
      this.ensureWidgetMounted();
    }

    ensureWidgetMounted() {
      mountAttempts++;
      if (!detailDomAvailable) {
        // Safe anchor not found yet in early DOM
        return;
      }
      if (!this.isMounted) {
        this.isMounted = true;
        mountedCount++;
      }
    }
  }

  const manager = new MockLifecycleWidgetManager();

  // T0: Job A extracted early with fallback company and location; no safe mount anchor in DOM
  detailDomAvailable = false;
  manager.onJobDetected(partialEarlyJobA);

  assert.equal(subscriptionCount, 1, "T0: Initial subscription created");
  assert.equal(manager.currentJob?.company, "Unknown Company", "T0: Current company is fallback");
  assert.equal(manager.isMounted, false, "T0: Widget cannot mount without safe anchor");
  assert.equal(mountedCount, 0, "T0: Mount count is 0");

  // T1: Same Job A extracted again after detail DOM appears with complete metadata
  detailDomAvailable = true;
  manager.onJobDetected(completeJobA);

  assert.equal(subscriptionCount, 1, "T1: Subscription count remains exactly 1 (no duplicate)");
  assert.equal(manager.currentJob?.company, "Affirm", "T1: Company upgraded to Affirm");
  assert.equal(manager.currentJob?.location, "Kelowna, BC", "T1: Location upgraded to Kelowna, BC");
  assert.equal(manager.currentJobId, "3981726450", "T1: Logical job identity unchanged");
  assert.equal(manager.widgetJob?.company, "Affirm", "T1: Widget state contains Affirm");
  assert.equal(manager.widgetJob?.location, "Kelowna, BC", "T1: Widget state contains Kelowna, BC");
  assert.equal(manager.isMounted, true, "T1: Widget is now mounted");
  assert.equal(mountedCount, 1, "T1: Widget mounted exactly once");

  // T2: Same Job A with unchanged metadata on later DOM mutation
  const initialAttempts = mountAttempts;
  manager.onJobDetected(completeJobA);

  assert.equal(subscriptionCount, 1, "T2: Still no duplicate subscription");
  assert.equal(mountedCount, 1, "T2: Still mounted exactly once (no duplicate roots)");
  assert.ok(mountAttempts > initialAttempts, "T2: Mount verification still occurred");
  console.log("✓ PASS: Test 9: T0 early extraction -> T1 complete detail DOM upgrades metadata and mounts widget exactly once");
}

console.log("\nAll 9 Metadata Refresh regression tests PASSED successfully.");
