import { Job, ExtensionMessage } from "../../types/job";
import { Application } from "../../types/application";
import { LinkedInWidget } from "./LinkedInWidget";

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
    } catch {
      this.isConnected = false;
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
    const job = this.currentJob;
    if (!job) throw new Error("No active job detected.");

    if (!this.isAuthenticated) {
      throw new Error("Sign in through the AppliedYet extension to track this job.");
    }

    if (!this.port || !this.isConnected) {
      throw new Error("Extension background service is reconnecting. Please retry.");
    }

    const activePort = this.port;

    return new Promise<void>((resolve, reject) => {
      const listener = (msg: ExtensionMessage) => {
        if (msg && msg.type === "MARK_JOB_APPLIED_RESPONSE") {
          activePort.onMessage.removeListener(listener);
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
      } as ExtensionMessage);

      // Safety timeout
      setTimeout(() => {
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

    return new Promise<void>((resolve, reject) => {
      const listener = (msg: ExtensionMessage) => {
        if (msg && msg.type === "DELETE_APPLICATION_RESPONSE") {
          activePort.onMessage.removeListener(listener);
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
        source: job.source,
        externalJobId: job.externalJobId,
      } as ExtensionMessage);

      // Safety timeout
      setTimeout(() => {
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
    } else {
      // Same job detected again (e.g. minor DOM update): ensure widget root is still properly attached
      this.scheduleMountCheck();
    }
  }

  /**
   * Schedules a debounced mount verification using requestAnimationFrame
   */
  public scheduleMountCheck() {
    if (this.mountCheckScheduled) return;
    this.mountCheckScheduled = true;
    requestAnimationFrame(() => {
      this.mountCheckScheduled = false;
      if (this.currentJob) {
        this.ensureWidgetMounted();
      }
    });
  }

  /**
   * Finds the optimal LinkedIn mount anchor inside the job detail pane
   */
  private findMountAnchor(): { targetNode: Node; insertBefore: Node | null } | null {
    // Priority 1: Top-card primary description block (contains company, location, posted date)
    const primaryDesc = document.querySelector(
      ".job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description"
    );
    if (primaryDesc && primaryDesc.parentNode) {
      // Place right after the primary description
      return {
        targetNode: primaryDesc.parentNode,
        insertBefore: primaryDesc.nextSibling,
      };
    }

    // Priority 2: Direct top-card container
    const topCard = document.querySelector(
      ".jobs-unified-top-card__content--two-pane, .job-details-jobs-unified-top-card, .jobs-unified-top-card, .top-card-layout"
    );
    if (topCard) {
      // Check for action bar (Apply button container) to place directly before it
      const actionsBar = topCard.querySelector(".jobs-unified-top-card__content--two-pane .mt5, .jobs-apply-button--top-card, .jobs-s-apply");
      if (actionsBar && actionsBar.parentNode === topCard) {
        return {
          targetNode: topCard,
          insertBefore: actionsBar,
        };
      }
      return {
        targetNode: topCard,
        insertBefore: topCard.firstChild,
      };
    }

    // Priority 3: Main job detail layout container
    const detailMain = document.querySelector(
      ".jobs-details__main-content, .job-view-layout, .jobs-search__job-details"
    );
    if (detailMain) {
      return {
        targetNode: detailMain,
        insertBefore: detailMain.firstChild,
      };
    }

    return null;
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
    const anchor = this.findMountAnchor();

    if (!anchor) {
      // Detail pane not yet in DOM, will retry via observer
      return;
    }

    // Duplicate Prevention Check:
    // If an element with this ID already exists in DOM
    if (existingElement) {
      // If it's our widget and it is already in the right anchor position, nothing to do
      if (
        existingElement === widgetRoot &&
        existingElement.parentNode === anchor.targetNode
      ) {
        widgetRoot.style.display = "block";
        return;
      }
      // If it is in an outdated location, remove the stale element
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
    } catch (err) {
      console.warn("[AppliedYet Widget] Failed to mount widget:", err);
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
