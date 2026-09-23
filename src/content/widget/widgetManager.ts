import {
  Job,
  ExtensionMessage,
  MutationIdentity,
  matchesMutationIdentity,
} from "../../types/job";
import {
  hasBetterJobMetadata,
  mergeJobMetadata,
} from "./jobMetadata";
import { Application } from "../../types/application";
import { LinkedInWidget } from "./LinkedInWidget";
import {
  getActiveDetailPane,
  isBroadMainDetailPane,
  extractLinkedInJob,
} from "../linkedinJobExtractor";

interface MountAnchor {
  targetNode: Node;
  insertBefore: Node | null;
  selectorMatched: string;
}

const RESULT_CARD_SELECTOR = [
  "li",
  "[role='listitem']",
  ".job-card-container",
  ".jobs-search-results__list-item",
  ".jobs-search-results-list__list-item",
].join(",");

const JOB_METADATA_MARKER =
  /(?:\breposted\b|\b\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\b|\bapplicants?\b|\bpeople\s+clicked\s+apply\b)/i;

function createMutationRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class WidgetManager {
  private widget: LinkedInWidget | null = null;
  private currentJob: Job | null = null;
  private currentJobId: string | null = null;
  private isAuthenticated: boolean = false;
  private port: chrome.runtime.Port | null = null;
  private isConnected: boolean = false;
  private mountCheckScheduled: boolean = false;

  constructor() {
    this.initPort();
  }

  /**
   * Initializes long-lived communication port with the extension background worker
   */
  private initPort() {
    if (typeof chrome === "undefined" || !chrome.runtime?.connect) {
      // In non-extension or dev preview environment
      this.isAuthenticated = true;
      return;
    }

    try {
      this.port = chrome.runtime.connect({ name: "appliedyet-widget" });
      this.isConnected = true;
      console.log("[AppliedYet] background port connected");

      this.port.onMessage.addListener((msg: ExtensionMessage) => {
        this.handlePortMessage(msg);
      });

      this.port.onDisconnect.addListener(() => {
        this.isConnected = false;
        this.port = null;
        // Attempt reconnect after a short delay if runtime is still available
        setTimeout(() => {
          if (typeof chrome !== "undefined" && chrome.runtime?.id) {
            this.initPort();
            if (this.currentJob) {
              this.subscribeToCurrentJob();
            }
          }
        }, 1500);
      });
    } catch (err) {
      this.isConnected = false;
      console.warn("[AppliedYet] widget error: Failed to connect port:", err);
    }
  }

  /**
   * Handles incoming streaming messages from the background service worker
   */
  private handlePortMessage(msg: ExtensionMessage) {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "AUTH_STATE_RESPONSE") {
      this.isAuthenticated = msg.isAuthenticated;
      if (!this.isAuthenticated) {
        this.widget?.setState({
          mode: "not_authenticated",
          errorMessage: null,
        });
      } else if (this.currentJob && this.widget) {
        // If authenticated and we have an active job, ensure we are subscribed
        this.subscribeToCurrentJob();
      }
      return;
    }

    // Stale-data safety: discard messages for outdated jobs
    if ("externalJobId" in msg && msg.externalJobId !== this.currentJobId) {
      return;
    }

    if (msg.type === "APPLICATION_DATA") {
      const app = msg.application;
      if (app && app.status === "applied") {
        this.widget?.setState({
          mode: "applied",
          application: app,
          errorMessage: null,
          isMutating: false,
        });
      } else {
        this.widget?.setState({
          mode: "not_applied",
          application: null,
          errorMessage: null,
          isMutating: false,
        });
      }
      return;
    }

    if (msg.type === "APPLICATION_ERROR") {
      this.widget?.setState({
        errorMessage: msg.error,
        isMutating: false,
      });
      return;
    }
  }

  /**
   * Subscribes background worker to Firestore updates for the active job
   */
  private subscribeToCurrentJob() {
    if (!this.currentJob || !this.port || !this.isConnected) return;

    try {
      this.port.postMessage({
        type: "APPLICATION_SUBSCRIBE",
        source: this.currentJob.source,
        externalJobId: this.currentJob.externalJobId,
      } as ExtensionMessage);
    } catch {
      // Port disconnected
    }
  }

  /**
   * Unsubscribes active background listener
   */
  private unsubscribeFromJob(source: string, externalJobId: string) {
    if (!this.port || !this.isConnected) return;
    try {
      this.port.postMessage({
        type: "APPLICATION_UNSUBSCRIBE",
        source,
        externalJobId,
      } as ExtensionMessage);
    } catch {
      // Safe ignore
    }
  }

  /**
   * Handles user clicking "Mark as Applied" in the inline widget
   */
  private async handleMarkApplied(): Promise<void> {
    // Before dispatching mutation, perform a fresh live DOM check to guarantee
    // the richest extracted metadata if LinkedIn finished rendering detail pane
    if (typeof document !== "undefined" && typeof window !== "undefined") {
      try {
        const liveJob = extractLinkedInJob(document, window.location.href);
        if (
          liveJob &&
          liveJob.externalJobId === this.currentJobId &&
          this.currentJob &&
          hasBetterJobMetadata(this.currentJob, liveJob)
        ) {
          this.currentJob = mergeJobMetadata(this.currentJob, liveJob);
          this.widget?.setState({ job: this.currentJob });
        }
      } catch {
        // Safe fallback to current this.currentJob
      }
    }

    const job = this.currentJob;
    if (!job) throw new Error("No active job detected.");

    if (!this.isAuthenticated) {
      throw new Error("Sign in through the AppliedYet extension to track this job.");
    }

    if (!this.port || !this.isConnected) {
      throw new Error("Extension background service is reconnecting. Please retry.");
    }

    const activePort = this.port;
    const identity: MutationIdentity = {
      requestId: createMutationRequestId(),
      source: job.source,
      externalJobId: job.externalJobId,
    };

    return new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      const listener = (msg: ExtensionMessage) => {
        if (
          msg &&
          msg.type === "MARK_JOB_APPLIED_RESPONSE" &&
          matchesMutationIdentity(msg, identity)
        ) {
          activePort.onMessage.removeListener(listener);
          clearTimeout(timeoutId);
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(msg.error || "Failed to mark as applied."));
          }
        }
      };

      activePort.onMessage.addListener(listener);
      activePort.postMessage({
        type: "MARK_JOB_APPLIED",
        job,
        ...identity,
      } as ExtensionMessage);

      // Safety timeout
      timeoutId = setTimeout(() => {
        activePort.onMessage.removeListener(listener);
        reject(new Error("Request timed out. Please check your network connection."));
      }, 10000);
    });
  }

  /**
   * Handles user clicking "Undo" in the inline widget
   */
  private async handleUndo(): Promise<void> {
    const job = this.currentJob;
    if (!job) throw new Error("No active job detected.");

    if (!this.isAuthenticated) {
      throw new Error("Sign in through the AppliedYet extension.");
    }

    if (!this.port || !this.isConnected) {
      throw new Error("Extension background service is reconnecting. Please retry.");
    }

    const activePort = this.port;
    const identity: MutationIdentity = {
      requestId: createMutationRequestId(),
      source: job.source,
      externalJobId: job.externalJobId,
    };

    return new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      const listener = (msg: ExtensionMessage) => {
        if (
          msg &&
          msg.type === "DELETE_APPLICATION_RESPONSE" &&
          matchesMutationIdentity(msg, identity)
        ) {
          activePort.onMessage.removeListener(listener);
          clearTimeout(timeoutId);
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(msg.error || "Failed to remove application."));
          }
        }
      };

      activePort.onMessage.addListener(listener);
      activePort.postMessage({
        type: "DELETE_APPLICATION",
        ...identity,
      } as ExtensionMessage);

      // Safety timeout
      timeoutId = setTimeout(() => {
        activePort.onMessage.removeListener(listener);
        reject(new Error("Request timed out. Please check your network connection."));
      }, 10000);
    });
  }

  /**
   * Called whenever the content script extracts a job from the LinkedIn DOM
   */
  public onJobDetected(job: Job | null) {
    if (!job) {
      if (this.currentJobId) {
        this.unsubscribeFromJob(this.currentJob?.source || "linkedin", this.currentJobId);
      }
      this.currentJob = null;
      this.currentJobId = null;
      this.hideWidget();
      return;
    }

    const isNewJob = job.externalJobId !== this.currentJobId;

    if (isNewJob) {
      console.log(`[AppliedYet] job detected: ${job.externalJobId}`);
      console.log("[AppliedYet] widget manager update");

      // 1. Unsubscribe previous job
      if (this.currentJob && this.currentJobId) {
        this.unsubscribeFromJob(this.currentJob.source, this.currentJobId);
      }

      this.currentJob = job;
      this.currentJobId = job.externalJobId;

      // 2. Initialize or reset widget
      this.ensureWidgetMounted();

      // 3. Reset job-specific state (including Undo confirmation!)
      this.widget?.resetUndoConfirmation();
      this.widget?.setState({
        mode: this.isAuthenticated ? "loading" : "not_authenticated",
        job,
        application: null,
        isMutating: false,
        errorMessage: null,
      });

      // 4. Request subscription if authenticated
      if (this.isAuthenticated) {
        this.subscribeToCurrentJob();
      }

      // 5. Schedule mount verification in case DOM anchor is still rendering
      this.scheduleMountCheck();
    } else {
      // Same job detected again (e.g. DOM update or detail pane finished rendering):
      // Refresh active metadata if the new extraction has non-fallback values
      if (this.currentJob) {
        if (hasBetterJobMetadata(this.currentJob, job)) {
          const merged = mergeJobMetadata(this.currentJob, job);
          console.log(
            `[AppliedYet] metadata refresh: ${merged.company} - ${merged.location}`
          );
          this.currentJob = merged;
          // Refresh widget internal job reference without altering subscription or mode
          this.widget?.setState({
            job: merged,
          });
        }
      } else {
        this.currentJob = job;
      }
      this.scheduleMountCheck();
    }
  }

  /**
   * Schedules a debounced mount verification using requestAnimationFrame
   */
  public scheduleMountCheck() {
    if (this.mountCheckScheduled) return;
    this.mountCheckScheduled = true;
    console.log("[AppliedYet] mount scheduled");
    requestAnimationFrame(() => {
      this.mountCheckScheduled = false;
      if (this.currentJob) {
        this.ensureWidgetMounted();
      }
    });
  }

  /**
   * Finds the optimal LinkedIn mount anchor inside the active job detail pane.
   * Scoped strictly inside getActiveDetailPane to never touch search results or body.
   */
  private findMountAnchor(jobId?: string | null): MountAnchor | null {
    const detailPane = getActiveDetailPane(document);
    if (!detailPane) {
      return null;
    }
    const isBroadMain = isBroadMainDetailPane(detailPane);

    // Priority 1: Top-card primary description / subtitle groupings inside the active detail pane
    const PRIMARY_DESC_SELECTORS = [
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".job-details-jobs-unified-top-card__primary-description",
      ".jobs-unified-top-card__primary-description-container",
      ".jobs-unified-top-card__primary-description",
      ".jobs-unified-top-card__subtitle-secondary-grouping",
      ".top-card-layout__first-subline",
      ".jobs-unified-top-card__subtitle-primary-grouping",
    ];

    for (const selector of PRIMARY_DESC_SELECTORS) {
      const el = detailPane.querySelector(selector);
      if (el && el.parentNode) {
        return {
          targetNode: el.parentNode,
          insertBefore: el.nextSibling,
          selectorMatched: selector,
        };
      }
    }

    // Priority 2: Direct top-card container or action buttons bar (Apply buttons)
    const ACTIONS_BAR_SELECTORS = [
      ".jobs-apply-button--top-card",
      ".jobs-s-apply",
      ".jobs-unified-top-card__content--two-pane .mt5",
      ".jobs-details__main-content .jobs-apply-button",
      "[data-job-id] .jobs-apply-button",
      ".jobs-apply-button",
    ];

    for (const selector of isBroadMain ? [] : ACTIONS_BAR_SELECTORS) {
      const el = detailPane.querySelector(selector);
      if (el && el.parentNode) {
        return {
          targetNode: el.parentNode,
          insertBefore: el,
          selectorMatched: selector,
        };
      }
    }

    // Priority 3: Active Job link header or title element
    if (jobId) {
      const matchingLinks = Array.from(
        detailPane.querySelectorAll(`a[href*="/jobs/view/${jobId}/"]`)
      );
      const activeLink = isBroadMain
        ? matchingLinks.find((link) => this.isVerifiedDetailHeaderLink(link, detailPane))
        : matchingLinks[0];
      if (activeLink) {
        const headerContainer = activeLink.closest("p, div, header, section") || activeLink;
        if (headerContainer && headerContainer.parentNode && headerContainer.parentNode !== document.body) {
          return {
            targetNode: headerContainer.parentNode,
            insertBefore: headerContainer.nextSibling,
            selectorMatched: "active-job-link-header",
          };
        }
      }
    }

    const TITLE_SELECTORS = [
      "h1.job-details-jobs-unified-top-card__job-title",
      "h1.jobs-unified-top-card__job-title",
      ".job-details-jobs-unified-top-card__job-title",
      "h2.topcard__title",
      "h1.top-card-layout__title",
      ".jobs-details__main-content h1",
      ".job-view-layout h1",
      "h1",
    ];

    for (const selector of isBroadMain ? [] : TITLE_SELECTORS) {
      const el = detailPane.querySelector(selector);
      if (el && el.parentNode && el.parentNode !== document.body) {
        return {
          targetNode: el.parentNode,
          insertBefore: el.nextSibling,
          selectorMatched: selector,
        };
      }
    }

    // Priority 4: Before Job Description Content Body
    const BODY_SELECTORS = [
      "#job-details",
      ".jobs-description",
      ".jobs-box__html-content",
      ".jobs-description__content",
      ".jobs-description-content",
      "article.jobs-description__container",
    ];

    for (const selector of BODY_SELECTORS) {
      const el = detailPane.querySelector(selector);
      if (el && el.parentNode && el.parentNode !== document.body) {
        return {
          targetNode: el.parentNode,
          insertBefore: el,
          selectorMatched: `before-${selector}`,
        };
      }
    }

    // Priority 5: Safe Detail Pane Top Fallback (strictly inside detailPane, NEVER document.body)
    if (!isBroadMain && detailPane.firstElementChild) {
      return {
        targetNode: detailPane,
        insertBefore: detailPane.firstElementChild,
        selectorMatched: "detail-pane-top",
      };
    }

    if (isBroadMain) {
      return null;
    }

    return {
      targetNode: detailPane,
      insertBefore: null,
      selectorMatched: "detail-pane-append",
    };
  }

  private isVerifiedDetailHeaderLink(link: Element, broadMain: Element): boolean {
    if (link.closest(RESULT_CARD_SELECTOR)) return false;

    let candidate: Element | null = link.parentElement;
    while (candidate && candidate !== broadMain) {
      const hasMetadataLine = Array.from(candidate.querySelectorAll("p")).some((paragraph) =>
        JOB_METADATA_MARKER.test(paragraph.textContent || "")
      );
      if (hasMetadataLine) return true;
      candidate = candidate.parentElement;
    }
    return false;
  }

  /**
   * Ensures exactly one widget root exists in the correct LinkedIn DOM location
   */
  private ensureWidgetMounted() {
    if (!this.widget) {
      this.widget = new LinkedInWidget({
        onMarkApplied: () => this.handleMarkApplied(),
        onUndo: () => this.handleUndo(),
      });
    }

    const widgetRoot = this.widget.getRootElement();
    const existingElement = document.getElementById("appliedyet-job-widget-root");
    const anchor = this.findMountAnchor(this.currentJobId);

    if (!anchor) {
      console.warn("[AppliedYet] Job detected but no safe widget anchor found");
      return;
    }

    // Duplicate Prevention Check:
    if (existingElement) {
      // If it's our widget and it is already attached to the live DOM in the right parent
      if (
        existingElement === widgetRoot &&
        existingElement.parentNode === anchor.targetNode &&
        document.body.contains(existingElement)
      ) {
        widgetRoot.style.display = "block";
        return;
      }
      // If it is stale or in an outdated location, remove the stale element
      if (existingElement.parentNode) {
        existingElement.parentNode.removeChild(existingElement);
      }
    }

    // Cleanly insert the widget root
    try {
      if (anchor.insertBefore) {
        anchor.targetNode.insertBefore(widgetRoot, anchor.insertBefore);
      } else {
        anchor.targetNode.appendChild(widgetRoot);
      }
      widgetRoot.style.display = "block";
      widgetRoot.style.width = "100%";
      widgetRoot.style.boxSizing = "border-box";
      console.log(`[AppliedYet] mount anchor found: ${anchor.selectorMatched}`);
      console.log("[AppliedYet] widget mounted");
    } catch (err) {
      console.warn("[AppliedYet] widget error: Failed to mount widget root:", err);
    }
  }

  /**
   * Hides the widget when no active job is displayed
   */
  private hideWidget() {
    if (this.widget) {
      const root = this.widget.getRootElement();
      root.style.display = "none";
    }
  }
}
