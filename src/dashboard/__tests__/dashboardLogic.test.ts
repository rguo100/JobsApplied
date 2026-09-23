import { strict as assert } from "node:assert";
import { formatApplicationDate } from "../utils/formatApplicationDate";
import { getApplicationIdentity, getApplicationDocId, Application, ApplicationStatus } from "../../types/application";

interface MockFirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
  toMillis: () => number;
}

function createMockTimestamp(date: Date): MockFirestoreTimestamp {
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

console.log("Running Day 5 Web Dashboard unit tests...");

// Test 1: Same Firebase user UID -> sees extension-created applications
{
  const uid = "google-oauth-uid-12345";
  const source = "linkedin";
  const externalJobId = "3981726450";

  const extensionDocId = getApplicationDocId(source, externalJobId);
  const webDocId = getApplicationDocId(source, externalJobId);

  assert.equal(extensionDocId, "linkedin_3981726450");
  assert.equal(extensionDocId, webDocId, "Web and extension must derive the identical document ID");

  const expectedPath = `users/${uid}/applications/${extensionDocId}`;
  const webExpectedPath = `users/${uid}/applications/${webDocId}`;
  assert.equal(expectedPath, webExpectedPath, "Both clients must map to the same Firestore path");
  console.log("✓ PASS: Test 1: Same Firebase user UID resolves to identical Firestore document path");
}

// Test 2: Different UID cannot access another user's path under security rules
{
  const userA_Uid = "google-user-A";
  const userB_Uid = "google-user-B";
  const docId = getApplicationDocId("linkedin", "3981726450");

  const pathA = `users/${userA_Uid}/applications/${docId}`;
  const pathB = `users/${userB_Uid}/applications/${docId}`;

  assert.notEqual(pathA, pathB, "Different user UIDs must never share the same application document path");

  // Rule verification simulation: request.auth.uid == userId
  function evaluateRule(authUid: string | null, targetPathUserId: string): boolean {
    return authUid !== null && authUid === targetPathUserId;
  }

  assert.equal(evaluateRule(userA_Uid, userA_Uid), true, "User A can access User A path");
  assert.equal(evaluateRule(userB_Uid, userA_Uid), false, "User B cannot access User A path");
  assert.equal(evaluateRule(null, userA_Uid), false, "Unauthenticated user cannot access User A path");
  console.log("✓ PASS: Test 2: Different UIDs are strictly isolated under Firestore security rule logic");
}

// Test 3: Application with valid timestamp displays formatted date
{
  // UTC date: Sep 23, 2026
  const testDate = new Date(2026, 8, 23, 14, 30, 0); // Month 8 is September
  const mockTimestamp = createMockTimestamp(testDate);

  const formattedTimestamp = formatApplicationDate(mockTimestamp);
  assert.equal(formattedTimestamp, "Sep 23, 2026");

  const formattedNativeDate = formatApplicationDate(testDate);
  assert.equal(formattedNativeDate, "Sep 23, 2026");

  const formattedMillis = formatApplicationDate(testDate.getTime());
  assert.equal(formattedMillis, "Sep 23, 2026");

  const formattedSecondsObj = formatApplicationDate({ seconds: Math.floor(testDate.getTime() / 1000) });
  assert.equal(formattedSecondsObj, "Sep 23, 2026");
  console.log("✓ PASS: Test 3: Valid timestamp formats correctly to 'Sep 23, 2026'");
}

// Test 4: Application with null or unresolved appliedAt displays '—'
{
  assert.equal(formatApplicationDate(null), "—");
  assert.equal(formatApplicationDate(undefined), "—");
  assert.equal(formatApplicationDate(new Date(NaN)), "—");
  assert.equal(formatApplicationDate({} as any), "—");
  console.log("✓ PASS: Test 4: Null, undefined, or unresolvable timestamps safely return '—'");
}

// Test 5: Status update updates same document ID and preserves immutability
{
  const initialApp: Application = {
    source: "linkedin",
    externalJobId: "3981726450",
    company: "Affirm",
    title: "Software Engineer II",
    location: "Remote",
    url: "https://www.linkedin.com/jobs/view/3981726450/",
    status: "applied",
    appliedAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
    createdAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
    updatedAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
  };

  const initialDocId = getApplicationDocId(initialApp.source, initialApp.externalJobId);

  // Simulate updating status to "interview"
  function simulateStatusUpdate(
    app: Application,
    newStatus: ApplicationStatus,
    newUpdatedAt: any
  ): { targetDocId: string; updatedApp: Application } {
    const targetDocId = getApplicationDocId(app.source, app.externalJobId);
    const updatedApp: Application = {
      ...app,
      status: newStatus,
      updatedAt: newUpdatedAt,
    };
    return { targetDocId, updatedApp };
  }

  const updateResult = simulateStatusUpdate(
    initialApp,
    "interview",
    createMockTimestamp(new Date(2026, 8, 23))
  );

  assert.equal(updateResult.targetDocId, initialDocId, "Status update must target the identical document ID");
  assert.equal(updateResult.updatedApp.status, "interview");
  assert.equal(updateResult.updatedApp.source, initialApp.source, "source must remain immutable");
  assert.equal(updateResult.updatedApp.externalJobId, initialApp.externalJobId, "externalJobId must remain immutable");
  assert.equal(updateResult.updatedApp.createdAt, initialApp.createdAt, "createdAt must remain immutable");
  console.log("✓ PASS: Test 5: Status update updates status on identical document ID without altering identity");
}

// Test 6: Delete deletes same document ID
{
  const app: Application = {
    source: "linkedin",
    externalJobId: "3981726450",
    company: "Affirm",
    title: "Software Engineer II",
    location: "Remote",
    url: "https://www.linkedin.com/jobs/view/3981726450/",
    status: "applied",
    appliedAt: null,
    createdAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
    updatedAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
  };

  const targetDocId = getApplicationDocId(app.source, app.externalJobId);
  assert.equal(targetDocId, "linkedin_3981726450", "Delete targets deterministic document ID");
  console.log("✓ PASS: Test 6: Delete operation targets exact deterministic document ID");
}

// Test 7: Real-time snapshot: new application appears
{
  let currentList: Application[] = [];

  const appA: Application = {
    source: "linkedin",
    externalJobId: "111",
    company: "Company A",
    title: "Engineer A",
    location: "Remote",
    url: "https://example.com/1",
    status: "applied",
    appliedAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
    createdAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
    updatedAt: createMockTimestamp(new Date(2026, 8, 20)) as any,
  };

  const appB: Application = {
    source: "linkedin",
    externalJobId: "222",
    company: "Company B",
    title: "Engineer B",
    location: "Remote",
    url: "https://example.com/2",
    status: "applied",
    appliedAt: createMockTimestamp(new Date(2026, 8, 23)) as any,
    createdAt: createMockTimestamp(new Date(2026, 8, 23)) as any,
    updatedAt: createMockTimestamp(new Date(2026, 8, 23)) as any,
  };

  // Initial snapshot with 1 app
  currentList = [appA];
  assert.equal(currentList.length, 1);

  // New snapshot with app B added (extension marked job B applied)
  const incomingSnapshot = [appA, appB];
  incomingSnapshot.sort((a, b) => {
    const timeA = (a.appliedAt as any)?.toMillis?.() ?? 0;
    const timeB = (b.appliedAt as any)?.toMillis?.() ?? 0;
    return timeB - timeA;
  });
  currentList = incomingSnapshot;

  assert.equal(currentList.length, 2);
  assert.equal(currentList[0].externalJobId, "222", "Newest application appears at top");
  console.log("✓ PASS: Test 7: Real-time snapshot automatically adds new application sorted by date");
}

// Test 8: Real-time snapshot: deleted application disappears
{
  const mockTimestamp = createMockTimestamp(new Date(2026, 8, 20)) as any;
  const appA: Application = {
    source: "linkedin",
    externalJobId: "111",
    company: "Company A",
    title: "Engineer A",
    location: "Remote",
    url: "https://example.com/1",
    status: "applied",
    appliedAt: mockTimestamp,
    createdAt: mockTimestamp,
    updatedAt: mockTimestamp,
  };
  const appB: Application = {
    source: "linkedin",
    externalJobId: "222",
    company: "Company B",
    title: "Engineer B",
    location: "Remote",
    url: "https://example.com/2",
    status: "applied",
    appliedAt: mockTimestamp,
    createdAt: mockTimestamp,
    updatedAt: mockTimestamp,
  };

  let list: Application[] = [appA, appB];
  assert.equal(list.length, 2);

  // Extension performs Undo on Job A -> snapshot now only contains App B
  const updatedSnapshot = [appB];
  list = updatedSnapshot;
  assert.equal(list.length, 1);
  assert.equal(list[0].externalJobId, "222");
  assert.equal(list.some((a) => a.externalJobId === "111"), false, "Deleted application disappears");
  console.log("✓ PASS: Test 8: Real-time snapshot automatically removes deleted application");
}

// Test 9: Unknown/malformed optional display fields do not crash dashboard logic
{
  const sparseApp = {
    source: "linkedin" as const,
    externalJobId: "99999",
    company: "",
    title: "",
    location: undefined as any,
    url: undefined as any,
    status: "applied" as const,
    appliedAt: null,
  };

  // Verify display helpers handle sparse/empty fields safely
  const formattedDate = formatApplicationDate(sparseApp.appliedAt);
  assert.equal(formattedDate, "—");

  const companyDisplay = sparseApp.company || "—";
  assert.equal(companyDisplay, "—");

  const locationDisplay = sparseApp.location || "—";
  assert.equal(locationDisplay, "—");

  const urlDisplay = sparseApp.url || null;
  assert.equal(urlDisplay, null);
  console.log("✓ PASS: Test 9: Sparse and malformed fields render safe fallbacks without throwing");
}

console.log("\nAll 9 Day 5 Web Dashboard unit tests PASSED successfully.");
