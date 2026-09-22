import { Job } from "../types/job";

/**
 * Extracts LinkedIn Job ID from the current URL or DOM context.
 */
export function extractLinkedInJobId(currentUrl: string, doc: Document = document): string | null {
  try {
    const parsedUrl = new URL(currentUrl);

    // 1. Check query parameter: currentJobId=1234567890
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
      "[data-job-id], .jobs-search-results-list__list-item--active, .job-card-container--clickable[data-job-id]"
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
function extractTitle(doc: Document = document): string {
  const selectors = [
    "h1.job-details-jobs-unified-top-card__job-title",
    "h1.jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title",
    "h2.topcard__title",
    "h1.top-card-layout__title",
    ".jobs-details__main-content h1",
    ".job-view-layout h1",
    "h1[tabindex='-1']",
    "h1"
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text && text.length > 1 && !text.includes("LinkedIn") && !text.includes("Search")) {
      return text.replace(/\s+/g, " ");
    }
  }

  // Fallback to document title
  const pageTitle = doc.title;
  if (pageTitle && pageTitle.includes("| LinkedIn")) {
    const clean = pageTitle.split("|")[0].trim();
    if (clean.length > 0) return clean;
  }

  return "Unknown Title";
}

/**
 * Extracts Company Name from LinkedIn layouts.
 */
function extractCompany(doc: Document = document): string {
  const selectors = [
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",
    "a.topcard__org-name-link",
    ".top-card-layout__first-subline a",
    ".job-details-jobs-unified-top-card__primary-description a",
    ".jobs-unified-top-card__subtitle-primary-grouping a",
    ".jobs-unified-top-card__subtitle-primary-grouping span:first-child"
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text && text.length > 0) {
      return text.replace(/\s+/g, " ");
    }
  }

  return "Unknown Company";
}

/**
 * Extracts Job Location from LinkedIn layouts.
 */
function extractLocation(doc: Document = document): string {
  const selectors = [
    ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
    ".jobs-unified-top-card__bullet",
    ".job-details-jobs-unified-top-card__primary-description span:nth-child(2)",
    ".topcard__flavor--bullet",
    ".top-card-layout__first-subline .topcard__flavor:not(a)",
    ".jobs-unified-top-card__subtitle-secondary-grouping span",
    ".job-details-jobs-unified-top-card__tertiary-description"
  ];

  for (const selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text && text.length > 1 && !text.toLowerCase().includes("applicant") && !text.toLowerCase().includes("reposted")) {
        return text.replace(/\s+/g, " ");
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
export function extractLinkedInJob(doc: Document = document, currentUrl: string = window.location.href): Job | null {
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

  const title = extractTitle(doc);
  const company = extractCompany(doc);
  const location = extractLocation(doc);
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
