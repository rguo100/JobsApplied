import { Job } from "../../types/job";
import { Application } from "../../types/application";
import { Timestamp } from "firebase/firestore";
import { getApplicationStatusLabel } from "./applicationStatusLabel";

export interface WidgetCallbacks {
  onMarkApplied: () => Promise<void>;
  onUndo: () => Promise<void>;
}

export type WidgetStateMode =
  | "loading"
  | "not_authenticated"
  | "not_applied"
  | "applied"
  | "error";

export interface WidgetState {
  mode: WidgetStateMode;
  job: Job | null;
  application: Application | null;
  isMutating: boolean;
  errorMessage: string | null;
  confirmingUndo: boolean;
}

/**
 * Formats a Firestore Timestamp or date into "Mon DD, YYYY" (e.g., "Sep 23, 2026")
 */
function formatDisplayDate(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return "Today";
  try {
    let date: Date;
    if (typeof (timestamp as { toDate?: () => Date }).toDate === "function") {
      date = (timestamp as { toDate: () => Date }).toDate();
    } else if ((timestamp as { seconds?: number }).seconds) {
      date = new Date((timestamp as { seconds: number }).seconds * 1000);
    } else {
      date = new Date(timestamp as unknown as string);
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Recently";
  }
}

/**
 * Pure DOM / Shadow DOM Component for the inline LinkedIn widget.
 * Self-contained styles prevent LinkedIn CSS conflicts.
 */
export class LinkedInWidget {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private state: WidgetState;
  private callbacks: WidgetCallbacks;
  private lastRenderedMode: string | null = null;

  constructor(callbacks: WidgetCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement("div");
    this.container.id = "appliedyet-job-widget-root";
    this.container.style.display = "block";
    this.container.style.width = "100%";
    this.container.style.maxWidth = "100%";
    this.container.style.boxSizing = "border-box";
    this.container.style.margin = "10px 0";
    this.shadow = this.container.attachShadow({ mode: "open" });

    this.state = {
      mode: "loading",
      job: null,
      application: null,
      isMutating: false,
      errorMessage: null,
      confirmingUndo: false,
    };

    this.render();
  }

  public getRootElement(): HTMLElement {
    return this.container;
  }

  public setState(partial: Partial<WidgetState>) {
    this.state = { ...this.state, ...partial };
    this.render();
  }

  public resetUndoConfirmation() {
    if (this.state.confirmingUndo) {
      this.state.confirmingUndo = false;
      this.render();
    }
  }

  private isCurrentJob(source: string, externalJobId: string): boolean {
    return (
      this.state.job?.source === source &&
      this.state.job.externalJobId === externalJobId
    );
  }

  private render() {
    const { mode, job, application, isMutating, errorMessage, confirmingUndo } = this.state;

    if (mode !== this.lastRenderedMode) {
      this.lastRenderedMode = mode;
      console.log(`[AppliedYet] widget render state: ${mode}`);
    }

    const styles = `
      :host {
        display: block;
        margin: 12px 0 16px 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        color: #1e293b;
        box-sizing: border-box;
      }
      *, *::before, *::after {
        box-sizing: inherit;
      }
      .card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 10px 14px;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
        transition: all 0.15s ease-in-out;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        font-size: 12px;
        color: #4f46e5;
        letter-spacing: -0.01em;
      }
      .brand svg {
        width: 15px;
        height: 15px;
        stroke: #4f46e5;
      }
      .pill {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 9999px;
      }
      .pill-applied {
        background: #dcfce7;
        color: #15803d;
        border: 1px solid #bbf7d0;
      }
      .pill-interview {
        background: #fef3c7;
        color: #b45309;
        border: 1px solid #fde68a;
      }
      .pill-rejected {
        background: #ffe4e6;
        color: #be123c;
        border: 1px solid #fecdd3;
      }
      .pill-offer {
        background: #ecfdf5;
        color: #047857;
        border: 1px solid #a7f3d0;
      }
      .pill-not-applied {
        background: #f1f5f9;
        color: #64748b;
        border: 1px solid #e2e8f0;
      }
      .status-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 4px;
      }
      .status-info {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .status-text {
        font-weight: 600;
      }
      .text-applied {
        color: #166534;
      }
      .text-interview {
        color: #b45309;
      }
      .text-rejected {
        color: #b91c1c;
      }
      .text-offer {
        color: #047857;
      }
      .text-not-applied {
        color: #475569;
      }
      .text-date {
        color: #64748b;
        font-size: 12px;
        font-weight: 500;
        margin-left: 4px;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.12s ease-in-out;
        user-select: none;
      }
      .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .btn-primary {
        background: #4f46e5;
        color: #ffffff;
      }
      .btn-primary:hover:not(:disabled) {
        background: #4338ca;
      }
      .btn-outline {
        background: #ffffff;
        border-color: #cbd5e1;
        color: #334155;
      }
      .btn-outline:hover:not(:disabled) {
        background: #f1f5f9;
        border-color: #94a3b8;
      }
      .btn-danger {
        background: #dc2626;
        color: #ffffff;
      }
      .btn-danger:hover:not(:disabled) {
        background: #b91c1c;
      }
      .btn-sm {
        padding: 3px 8px;
        font-size: 11px;
      }
      .confirm-box {
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 6px;
        padding: 6px 10px;
        margin-top: 6px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .confirm-text {
        font-size: 11px;
        color: #991b1b;
        font-weight: 500;
      }
      .confirm-actions {
        display: flex;
        gap: 4px;
      }
      .error-alert {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 5px;
        margin-top: 5px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .loading-line {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #64748b;
        font-size: 12px;
      }
      .spinner {
        width: 13px;
        height: 13px;
        border: 2px solid #cbd5e1;
        border-top-color: #4f46e5;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        display: inline-block;
      }
      .not-auth-box {
        color: #64748b;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;

    let contentHtml = "";

    // STATE 6 — NOT AUTHENTICATED
    if (mode === "not_authenticated") {
      contentHtml = `
        <div class="header">
          <div class="brand">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
            </svg>
            <span>AppliedYet</span>
          </div>
        </div>
        <div class="not-auth-box">
          <span>Sign in through the AppliedYet extension to track this job.</span>
        </div>
      `;
    }
    // STATE 3 — LOADING
    else if (mode === "loading") {
      contentHtml = `
        <div class="header">
          <div class="brand">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
            </svg>
            <span>AppliedYet</span>
          </div>
        </div>
        <div class="loading-line">
          <div class="spinner"></div>
          <span>Checking application status...</span>
        </div>
      `;
    }
    // STATE 2 — TRACKED APPLICATION
    else if (mode === "applied") {
      const dateStr = formatDisplayDate(application?.appliedAt);
      const currentStatus = application?.status || "applied";
      const statusLabel = getApplicationStatusLabel(currentStatus);

      let statusInfoHtml = "";
      if (currentStatus === "applied") {
        statusInfoHtml = `
          <div class="status-info text-applied">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span class="status-text">${statusLabel}</span>
            <span class="text-date">${dateStr}</span>
          </div>
        `;
      } else if (currentStatus === "interview") {
        statusInfoHtml = `
          <div class="status-info text-interview">
            <span class="status-bullet" style="color: #d97706; font-size: 11px; line-height: 1; margin-right: 2px;">●</span>
            <span class="status-text">${statusLabel}</span>
            <span class="text-date">${dateStr}</span>
          </div>
        `;
      } else if (currentStatus === "rejected") {
        statusInfoHtml = `
          <div class="status-info text-rejected">
            <span class="status-text">${statusLabel}</span>
            <span class="text-date">${dateStr}</span>
          </div>
        `;
      } else if (currentStatus === "offer") {
        statusInfoHtml = `
          <div class="status-info text-offer">
            <span class="status-text">${statusLabel}</span>
            <span class="text-date">${dateStr}</span>
          </div>
        `;
      } else {
        statusInfoHtml = `
          <div class="status-info text-applied">
            <span class="status-text">${statusLabel}</span>
            <span class="text-date">${dateStr}</span>
          </div>
        `;
      }

      contentHtml = `
        <div class="header">
          <div class="brand">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
            </svg>
            <span>AppliedYet</span>
          </div>
          <span class="pill pill-${currentStatus}">Tracked</span>
        </div>
        <div class="status-line">
          ${statusInfoHtml}
          ${
            !confirmingUndo
              ? `<button id="btn-undo" class="btn btn-outline" ${isMutating ? "disabled" : ""}>
                   ${isMutating ? '<div class="spinner"></div>' : ""}
                   <span>Undo</span>
                 </button>`
              : ""
          }
        </div>
        ${
          confirmingUndo
            ? `
            <div class="confirm-box">
              <span class="confirm-text">Remove this application from your tracker?</span>
              <div class="confirm-actions">
                <button id="btn-confirm-undo" class="btn btn-danger btn-sm" ${isMutating ? "disabled" : ""}>
                  ${isMutating ? '<div class="spinner"></div>' : ""}
                  <span>Yes, Remove</span>
                </button>
                <button id="btn-cancel-undo" class="btn btn-outline btn-sm" ${isMutating ? "disabled" : ""}>
                  Cancel
                </button>
              </div>
            </div>
            `
            : ""
        }
      `;
    }
    // STATE 1 — NOT APPLIED
    else {
      contentHtml = `
        <div class="header">
          <div class="brand">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
            </svg>
            <span>AppliedYet</span>
          </div>
          <span class="pill pill-not-applied">Not tracked</span>
        </div>
        <div class="status-line">
          <div class="status-info text-not-applied">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
            </svg>
            <span class="status-text">Not applied</span>
          </div>
          <button id="btn-mark-applied" class="btn btn-primary" ${isMutating ? "disabled" : ""}>
            ${isMutating ? '<div class="spinner"></div>' : ""}
            <span>Mark as Applied</span>
          </button>
        </div>
      `;
    }

    // STATE 5 — COMPACT ERROR
    const errorHtml = errorMessage
      ? `
      <div class="error-alert">
        <span>${errorMessage}</span>
        <button id="btn-dismiss-err" style="background:none;border:none;color:#991b1b;cursor:pointer;font-weight:bold;font-size:12px;">&times;</button>
      </div>`
      : "";

    this.shadow.innerHTML = `
      <style>${styles}</style>
      <div class="card">
        ${contentHtml}
        ${errorHtml}
      </div>
    `;

    // Attach event listeners safely inside Shadow DOM
    this.attachEventListeners();
  }

  private attachEventListeners() {
    const markBtn = this.shadow.getElementById("btn-mark-applied");
    if (markBtn) {
      markBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.state.isMutating) return;
        const mutationJob = this.state.job;
        if (!mutationJob) return;
        this.setState({ isMutating: true, errorMessage: null });
        try {
          await this.callbacks.onMarkApplied();
        } catch (err) {
          if (this.isCurrentJob(mutationJob.source, mutationJob.externalJobId)) {
            this.setState({
              errorMessage: err instanceof Error ? err.message : "Failed to mark as applied.",
            });
          }
        } finally {
          if (this.isCurrentJob(mutationJob.source, mutationJob.externalJobId)) {
            this.setState({ isMutating: false });
          }
        }
      });
    }

    const undoBtn = this.shadow.getElementById("btn-undo");
    if (undoBtn) {
      undoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setState({ confirmingUndo: true });
      });
    }

    const confirmUndoBtn = this.shadow.getElementById("btn-confirm-undo");
    if (confirmUndoBtn) {
      confirmUndoBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.state.isMutating) return;
        const mutationJob = this.state.job;
        if (!mutationJob) return;
        this.setState({ isMutating: true, errorMessage: null });
        try {
          await this.callbacks.onUndo();
          if (this.isCurrentJob(mutationJob.source, mutationJob.externalJobId)) {
            this.setState({ confirmingUndo: false });
          }
        } catch (err) {
          if (this.isCurrentJob(mutationJob.source, mutationJob.externalJobId)) {
            this.setState({
              errorMessage: err instanceof Error ? err.message : "Failed to remove application.",
            });
          }
        } finally {
          if (this.isCurrentJob(mutationJob.source, mutationJob.externalJobId)) {
            this.setState({ isMutating: false });
          }
        }
      });
    }

    const cancelUndoBtn = this.shadow.getElementById("btn-cancel-undo");
    if (cancelUndoBtn) {
      cancelUndoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setState({ confirmingUndo: false });
      });
    }

    const dismissErrBtn = this.shadow.getElementById("btn-dismiss-err");
    if (dismissErrBtn) {
      dismissErrBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setState({ errorMessage: null });
      });
    }
  }
}
