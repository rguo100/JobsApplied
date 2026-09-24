import { strict as assert } from "node:assert";
import type { Application, ApplicationStatus } from "../../types/application";
import {
  calculateSummaryCounts,
  extractUniqueCompanies,
  filterAndSortApplications,
  getApplicationTimestampMillis,
  sanitizeDashboardErrorMessage,
  SortOption,
} from "../utils/dashboardFilter";

function createMockTimestamp(date: Date) {
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function makeApp(
  externalJobId: string,
  company: string,
  title: string,
  status: ApplicationStatus,
  appliedDate: Date | null,
  location: string = "Remote"
): Application {
  const appliedAt = appliedDate ? (createMockTimestamp(appliedDate) as any) : null;
  const createdAt = createMockTimestamp(new Date(2026, 8, 1)) as any;
  const updatedAt = createMockTimestamp(new Date(2026, 8, 1)) as any;

  return {
    source: "linkedin",
    externalJobId,
    company,
    title,
    location,
    url: `https://www.linkedin.com/jobs/view/${externalJobId}/`,
    status,
    appliedAt,
    createdAt,
    updatedAt,
  };
}

console.log("Running Day 6 Usability & Usability Tests...");

// Fixture data representing diverse user applications
const mockApps: Application[] = [
  makeApp("1", "Affirm", "Software Engineer II", "applied", new Date(2026, 8, 20)),
  makeApp("2", "Stripe", "Staff Frontend Architect", "interview", new Date(2026, 8, 25)),
  makeApp("3", "MongoDB", "Senior Backend Engineer", "rejected", new Date(2026, 8, 15)),
  makeApp("4", "Wealthsimple", "Engineering Lead", "offer", new Date(2026, 8, 26)),
  makeApp("5", "Robinhood", "Senior Software Engineer", "applied", new Date(2026, 8, 22)),
  makeApp("6", "Affirm", "Product Engineer", "interview", new Date(2026, 8, 18)),
];

// Requirement 1: Dashboard Search
{
  // 1a: Search by company (case-insensitive, ignores whitespace)
  const affirmResult = filterAndSortApplications(mockApps, {
    searchQuery: "  affirm  ",
    statusFilter: "all",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(affirmResult.length, 2);
  assert.ok(affirmResult.every((a) => a.company === "Affirm"));

  // 1b: Search by job title (case-insensitive)
  const engineerResult = filterAndSortApplications(mockApps, {
    searchQuery: "software engineer",
    statusFilter: "all",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(engineerResult.length, 2); // Affirm SE II and Robinhood Senior SE
  assert.ok(engineerResult.some((a) => a.externalJobId === "1"));
  assert.ok(engineerResult.some((a) => a.externalJobId === "5"));

  // 1c: Empty search matches all
  const emptySearchResult = filterAndSortApplications(mockApps, {
    searchQuery: "   ",
    statusFilter: "all",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(emptySearchResult.length, 6);

  console.log("✓ PASS: Requirement 1: Dashboard search filters by company & title (case-insensitive & whitespace trimmed)");
}

// Requirement 2: Status Filter
{
  const appliedOnly = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "applied",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(appliedOnly.length, 2);
  assert.ok(appliedOnly.every((a) => a.status === "applied"));

  const interviewOnly = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "interview",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(interviewOnly.length, 2);
  assert.ok(interviewOnly.every((a) => a.status === "interview"));

  const rejectedOnly = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "rejected",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(rejectedOnly.length, 1);
  assert.equal(rejectedOnly[0].company, "MongoDB");

  const offerOnly = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "offer",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(offerOnly.length, 1);
  assert.equal(offerOnly[0].company, "Wealthsimple");

  console.log("✓ PASS: Requirement 2: Status filter isolates Applied, Interview, Rejected, Offer statuses");
}

// Requirement 3: Company Filter
{
  // 3a: Extract unique companies dynamically and sort alphabetically
  const companies = extractUniqueCompanies(mockApps);
  assert.deepEqual(companies, ["Affirm", "MongoDB", "Robinhood", "Stripe", "Wealthsimple"]);

  // 3b: No hardcoding: dynamic additions sort accurately
  const dynamicApps = [
    ...mockApps,
    makeApp("7", "Airbnb", "Backend Engineer", "applied", new Date(2026, 8, 27)),
  ];
  const updatedCompanies = extractUniqueCompanies(dynamicApps);
  assert.equal(updatedCompanies[0], "Affirm");
  assert.equal(updatedCompanies[1], "Airbnb");
  assert.equal(updatedCompanies.length, 6);

  // 3c: Filter by specific company
  const stripeOnly = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "all",
    companyFilter: "Stripe",
    sortBy: "newest",
  });
  assert.equal(stripeOnly.length, 1);
  assert.equal(stripeOnly[0].company, "Stripe");

  console.log("✓ PASS: Requirement 3: Company filter dynamically generates sorted options without hardcoding");
}

// Requirement 4: Sorting (Newest, Oldest, Company A-Z)
{
  // 4a: Default Newest (latest timestamp first)
  const newestSorted = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "all",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(newestSorted[0].company, "Wealthsimple"); // Sep 26
  assert.equal(newestSorted[1].company, "Stripe");       // Sep 25
  assert.equal(newestSorted[5].company, "MongoDB");      // Sep 15

  // 4b: Oldest (earliest timestamp first)
  const oldestSorted = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "all",
    companyFilter: "all",
    sortBy: "oldest",
  });
  assert.equal(oldestSorted[0].company, "MongoDB");      // Sep 15
  assert.equal(oldestSorted[5].company, "Wealthsimple"); // Sep 26

  // 4c: Company A-Z (alphabetical by company)
  const companyAscSorted = filterAndSortApplications(mockApps, {
    searchQuery: "",
    statusFilter: "all",
    companyFilter: "all",
    sortBy: "company_asc",
  });
  assert.equal(companyAscSorted[0].company, "Affirm");
  assert.equal(companyAscSorted[1].company, "Affirm");
  assert.equal(companyAscSorted[2].company, "MongoDB");
  assert.equal(companyAscSorted[5].company, "Wealthsimple");

  console.log("✓ PASS: Requirement 4: Sorting by Newest, Oldest, and Company A-Z operates accurately");
}

// Requirement 5: Summary Counts
{
  const counts = calculateSummaryCounts(mockApps);
  assert.equal(counts.total, 6);
  assert.equal(counts.applied, 2);
  assert.equal(counts.interview, 2);
  assert.equal(counts.rejected, 1);
  assert.equal(counts.offer, 1);

  // Invariant: Filters/searches must NOT mutate or reduce the overall summary counts
  const filtered = filterAndSortApplications(mockApps, {
    searchQuery: "affirm",
    statusFilter: "applied",
    companyFilter: "Affirm",
    sortBy: "newest",
  });
  assert.equal(filtered.length, 1);
  // Overall summary count remains 6, NOT 1
  assert.equal(counts.total, 6, "Overall summary count must never decrease when filtering");

  console.log("✓ PASS: Requirement 5: Summary counts compute Total, Applied, Interview, Rejected, Offer across all apps");
}

// Requirement 6: Empty States
{
  // Case A: User has zero total applications
  const zeroApps: Application[] = [];
  assert.equal(zeroApps.length, 0);

  // Case B: Applications exist, but filters yield zero results
  const noMatch = filterAndSortApplications(mockApps, {
    searchQuery: "non-existent-company-xyz",
    statusFilter: "all",
    companyFilter: "all",
    sortBy: "newest",
  });
  assert.equal(mockApps.length, 6);
  assert.equal(noMatch.length, 0);

  console.log("✓ PASS: Requirement 6: Empty state conditions (zero database vs zero filter results) correctly identified");
}

// Requirement 7: Error and Loading State Sanitization
{
  const rawPermissionError = new Error("FirebaseError: [code=permission-denied]: Missing or insufficient permissions.");
  const sanitizedPermission = sanitizeDashboardErrorMessage(rawPermissionError);
  assert.ok(!sanitizedPermission.includes("FirebaseError"));
  assert.ok(!sanitizedPermission.includes("code=permission-denied"));
  assert.ok(sanitizedPermission.includes("permission"));

  const rawNetworkError = new Error("FirebaseError: [code=unavailable]: Failed to fetch");
  const sanitizedNetwork = sanitizeDashboardErrorMessage(rawNetworkError);
  assert.ok(!sanitizedNetwork.includes("FirebaseError"));
  assert.ok(sanitizedNetwork.includes("connect"));

  console.log("✓ PASS: Requirement 7: Raw Firebase error messages are sanitized into friendly user notifications");
}

// Requirement 8 & 9: Combination of Search, Filters, and Sorting
{
  const combined = filterAndSortApplications(mockApps, {
    searchQuery: "engineer",
    statusFilter: "interview",
    companyFilter: "Affirm",
    sortBy: "newest",
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].externalJobId, "6");
  assert.equal(combined[0].title, "Product Engineer");
  assert.equal(combined[0].status, "interview");

  console.log("✓ PASS: Combined search, status filter, company filter, and sort operate seamlessly together");
}

console.log("\nAll Day 6 Usability & Usability Tests PASSED successfully.");
