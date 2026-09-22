import { Job } from "../types/job";

/**
 * Normalizes text by removing redundant whitespace and trimming.
 */
function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[·•\-\s]+|[·•\-\s]+$/g, "")
    .trim();
}

/**
 * Finds the active job detail pane on LinkedIn SPA to scope selectors
 * and prevent picking elements from other job cards in the search-results list.
 */
function getActiveDetailPane(doc: Document = document): Element | null {
  const containerSelectors = [
    ".jobs-details__main-content",
    ".job-view-layout",
    ".scaffold-layout__detail",
    ".jobs-search__job-details--container",
    ".jobs-search__job-details",
    ".job-details-jobs-unified-top-card",
    "[data-view-name='job-details']",
    "#job-details",
    "main",
  ];

  for (const selector of containerSelectors) {
    const el = doc.querySelector(selector);
    if (el) return el;
  }

  return null;
}

/**
 * Extracts LinkedIn Job ID from the current URL or DOM context.
 */
export function extractLinkedInJobId(currentUrl: string, doc: Document = document): string | null {
  try {
    const parsedUrl = new URL(currentUrl);

    // 1. Check query parameter: currentJobId=1234567890 (common on /jobs/search-results/ and collections)
    const queryJobId = parsedUrl.searchParams.get("currentJobId");
    if (queryJobId && /^\d+$/.test(queryJobId.trim())) {
      return queryJobId.trim();
    }

    // 2. Check path pattern: /jobs/view/1234567890/
    const pathMatch = parsedUrl.pathname.match(/\/jobs\/view\/(\d+)/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    // 3. Fallback: Search in DOM active card or selected element
    const activeItem = doc.querySelector(
      ".jobs-search-results-list__list-item--active [data-job-id], [data-job-id].jobs-search-results-list__list-item--active, .job-card-container--clickable[data-job-id]"
    );
    if (activeItem) {
      const dataJobId = activeItem.getAttribute("data-job-id") || activeItem.getAttribute("data-entity-urn");
      if (dataJobId) {
        const idMatch = dataJobId.match(/(\d{6,})/);
        if (idMatch && idMatch[1]) {
          return idMatch[1];
        }
      }
    }
  } catch {
    // URL parsing failed
  }
  return null;
}

/**
 * Extracts Job Title from standard LinkedIn layouts.
 */
function extractTitle(doc: Document = document, detailPane: Element | null = null): string {
  const scope = detailPane || doc;

  const selectors = [
    "h1.job-details-jobs-unified-top-card__job-title",
    "h1.jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-details__main-content h1",
    ".job-view-layout h1",
    "h2.topcard__title",
    "h1.top-card-layout__title",
    "h1[tabindex='-1']",
    "h1",
  ];

  for (const selector of selectors) {
    const el = scope.querySelector(selector);
    const text = normalizeText(el?.textContent);
    if (
      text &&
      text.length > 1 &&
      !text.toLowerCase().includes("linkedin") &&
      !text.toLowerCase().includes("search results")
    ) {
      return text;
    }
  }

  // Fallback to document title
  const pageTitle = doc.title;
  if (pageTitle && pageTitle.includes("| LinkedIn")) {
    const clean = normalizeText(pageTitle.split("|")[0]);
    if (clean.length > 0) return clean;
  }

  return "Unknown Title";
}

/**
 * Extracts Company Name scoped to the active job detail pane.
 */
function extractCompany(doc: Document = document, detailPane: Element | null = null): string {
  const scope = detailPane || doc;

  const selectors = [
    // 1. Data attributes and specific tracking anchors in detail pane
    "[data-anonymize='company-name']",
    "a[data-tracking-control-name*='company']",
    "a[data-tracking-control-name*='org-name']",

    // 2. Modern LinkedIn Unified Top Card company name classes
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",

    // 3. Primary description anchors (first link is usually the company link)
    ".job-details-jobs-unified-top-card__primary-description a.app-aware-link",
    ".job-details-jobs-unified-top-card__primary-description a",
    ".jobs-unified-top-card__subtitle-primary-grouping a",
    ".jobs-unified-top-card__primary-description a",

    // 4. Any company URL link inside detail pane top area
    ".job-details-jobs-unified-top-card a[href*='/company/']",
    ".jobs-details__main-content a[href*='/company/']",
    "a[href*='/company/']",

    // 5. Classic top-card selectors
    "a.topcard__org-name-link",
    ".top-card-layout__first-subline a",
    ".topcard__flavor--black-link",
  ];

  for (const selector of selectors) {
    const elements = scope.querySelectorAll(selector);
    for (const el of elements) {
      const text = normalizeText(el.textContent);
      if (
        text &&
        text.length > 0 &&
        !text.toLowerCase().includes("see all") &&
        !text.toLowerCase().includes("linkedin")
      ) {
        return text;
      }
    }
  }

  // Fallback: Parse company from the primary description line if present
  const primaryDesc = scope.querySelector(
    ".job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description"
  );
  if (primaryDesc) {
    const rawText = primaryDesc.textContent || "";
    const parts = rawText.split(/[·•]/).map(normalizeText).filter(Boolean);
    if (parts.length > 0 && parts[0].length > 0) {
      return parts[0];
    }
  }

  return "Unknown Company";
}

/**
 * Filter to verify if a text fragment represents location rather than metadata.
 */
function isValidLocationText(text: string): boolean {
  if (!text || text.length < 2) return false;
  const lower = text.toLowerCase();

  // Exclude common LinkedIn metadata tokens
  const forbidden = [
    "applicant",
    "reposted",
    "ago",
    "viewed",
    "promoted",
    "actively recruiting",
    "easy apply",
    "connections work here",
    "alumni",
    "school",
    "matches your preferences",
    "skills",
    "full-time",
    "part-time",
    "contract",
  ];

  for (const bad of forbidden) {
    if (lower.includes(bad)) return false;
  }

  return true;
}

/**
 * Extracts Job Location scoped to the active job detail pane.
 */
function extractLocation(
  doc: Document = document,
  detailPane: Element | null = null,
  companyName: string = ""
): string {
  const scope = detailPane || doc;

  const selectors = [
    // 1. Specific LinkedIn location data containers & tvm text
    "[data-anonymize='job-location']",
    ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
    ".job-details-jobs-unified-top-card__primary-description span.tvm__text",
    ".job-details-jobs-unified-top-card__primary-description-container span",
    
    // 2. Bullets and secondary groupings
    ".jobs-unified-top-card__bullet",
    ".jobs-unified-top-card__bullet + span",
    ".jobs-unified-top-card__subtitle-secondary-grouping span",
    ".jobs-unified-top-card__workplace-type",

    // 3. Classic top-card selectors
    ".topcard__flavor--bullet",
    ".top-card-layout__first-subline .topcard__flavor:not(a)",
    ".job-details-jobs-unified-top-card__tertiary-description",
  ];

  for (const selector of selectors) {
    const elements = scope.querySelectorAll(selector);
    for (const el of elements) {
      const text = normalizeText(el.textContent);
      if (text && isValidLocationText(text)) {
        // Ensure it is not identical to the company name
        if (!companyName || text.toLowerCase() !== companyName.toLowerCase()) {
          return text;
        }
      }
    }
  }

  // Fallback: Parse location from primary description container tokens
  // LinkedIn often structures: Company · Location (Workplace Type) · Time Ago · Applicants
  const primaryDesc = scope.querySelector(
    ".job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description, .job-details-jobs-unified-top-card__primary-description-container"
  );
  if (primaryDesc) {
    // Check individual span children first
    const spans = primaryDesc.querySelectorAll("span");
    for (const span of spans) {
      const spanText = normalizeText(span.textContent);
      if (
        spanText &&
        isValidLocationText(spanText) &&
        (!companyName || spanText.toLowerCase() !== companyName.toLowerCase())
      ) {
        return spanText;
      }
    }

    // Split raw text by bullet / dot separators
    const rawText = primaryDesc.textContent || "";
    const parts = rawText
      .split(/[·•]/)
      .map(normalizeText)
      .filter((p) => p.length > 0);

    for (const part of parts) {
      if (
        isValidLocationText(part) &&
        (!companyName || part.toLowerCase() !== companyName.toLowerCase())
      ) {
        return part;
      }
    }
  }

  return "Location not specified";
}

/**
 * Calculates Canonical or clean URL for the LinkedIn job.
 */
function buildCanonicalUrl(jobId: string | null, currentUrl: string): string {
  if (jobId) {
    return `https://www.linkedin.com/jobs/view/${jobId}/`;
  }
  return currentUrl.split("?")[0];
}

/**
 * Main extractor function that checks if page is a LinkedIn Job page and extracts details.
 */
export function extractLinkedInJob(
  doc: Document = document,
  currentUrl: string = window.location.href
): Job | null {
  const isLinkedInHost = currentUrl.includes("linkedin.com");
  const isJobPath = currentUrl.includes("/jobs/");

  if (!isLinkedInHost || !isJobPath) {
    return null;
  }

  const jobId = extractLinkedInJobId(currentUrl, doc);

  // If no job ID can be resolved, it is likely not an active job view
  if (!jobId) {
    return null;
  }

  // Scope DOM parsing to the active right-hand detail pane
  const detailPane = getActiveDetailPane(doc);

  const title = extractTitle(doc, detailPane);
  const company = extractCompany(doc, detailPane);
  const location = extractLocation(doc, detailPane, company);
  const canonicalUrl = buildCanonicalUrl(jobId, currentUrl);

  return {
    source: "linkedin",
    externalJobId: jobId,
    title,
    company,
    location,
    url: canonicalUrl,
  };
}
