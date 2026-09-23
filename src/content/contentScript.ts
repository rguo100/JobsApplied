import { extractLinkedInJob } from "./linkedinJobExtractor";
import {
  ExtensionMessage,
  Job,
  hasBetterJobMetadata,
  mergeJobMetadata,
} from "../types/job";
import { WidgetManager } from "./widget/widgetManager";
import { createAnimationFrameCoalescer } from "./animationFrameCoalescer";

console.log("[AppliedYet] content script initialized");

let lastJobId: string | null = null;
let lastExtractedJob: Job | null = null;

function notifyJobUpdated(job: Job) {
  try {
    if (chrome?.runtime?.sendMessage) {
      const msg: ExtensionMessage = {
        type: "JOB_UPDATED",
        job,
      };
      chrome.runtime.sendMessage(msg).catch(() => {
        // Popup may not be open, safe to ignore
      });
    }
  } catch {
    // Runtime context unavailable
  }
}

// Initialize the Day 4 Inline Widget Manager
const widgetManager = new WidgetManager();

function updateJobExtraction(): Job | null {
  const job = extractLinkedInJob(document, window.location.href);

  // Notify the inline widget manager of current job detection
  widgetManager.onJobDetected(job);

  if (job) {
    const isNewJob = job.externalJobId !== lastJobId || !lastExtractedJob;
    if (isNewJob) {
      lastJobId = job.externalJobId;
      lastExtractedJob = job;
      notifyJobUpdated(lastExtractedJob);
    } else if (lastExtractedJob && hasBetterJobMetadata(lastExtractedJob, job)) {
      lastExtractedJob = mergeJobMetadata(lastExtractedJob, job);
      notifyJobUpdated(lastExtractedJob);
    }
  }
  return job;
}

// 1. Listen for requests from extension popup (Day 1 functionality preserved)
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
const extractionFrame = createAnimationFrameCoalescer(updateJobExtraction);
const observer = new MutationObserver(() => extractionFrame.schedule());
window.addEventListener("pagehide", () => extractionFrame.cancel());

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
