import { extractLinkedInJob } from "./linkedinJobExtractor";
import { ExtensionMessage, Job } from "../types/job";

let lastJobId: string | null = null;
let lastExtractedJob: Job | null = null;

function updateJobExtraction(): Job | null {
  const job = extractLinkedInJob(document, window.location.href);
  if (job) {
    if (job.externalJobId !== lastJobId || !lastExtractedJob) {
      lastJobId = job.externalJobId;
      lastExtractedJob = job;
      // Notify extension runtime if connected
      try {
        if (chrome?.runtime?.sendMessage) {
          const msg: ExtensionMessage = {
            type: "JOB_UPDATED",
            job: lastExtractedJob,
          };
          chrome.runtime.sendMessage(msg).catch(() => {
            // Popup may not be open, safe to ignore
          });
        }
      } catch {
        // Runtime context unavailable
      }
    }
  }
  return job;
}

// 1. Listen for requests from extension popup
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "GET_CURRENT_JOB") {
      const currentJob = extractLinkedInJob(document, window.location.href);
      sendResponse({ type: "CURRENT_JOB_RESPONSE", job: currentJob });
    }
    return true; // Keep channel open for async response
  });
}

// 2. Observe SPA DOM changes (LinkedIn job detail pane dynamic render)
const observer = new MutationObserver(() => {
  updateJobExtraction();
});

function initObserver() {
  const targetNode = document.body;
  if (targetNode) {
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-job-id", "class", "href"],
    });
  }
}

// 3. Hook SPA URL navigation (pushState / popstate)
window.addEventListener("popstate", () => {
  setTimeout(updateJobExtraction, 300);
});

// Periodic fallback poll to catch subtle SPA navigation without URL popstate
setInterval(() => {
  updateJobExtraction();
}, 1000);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initObserver();
    updateJobExtraction();
  });
} else {
  initObserver();
  updateJobExtraction();
}
