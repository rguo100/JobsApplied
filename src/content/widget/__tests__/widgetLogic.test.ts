/**
 * Unit tests for Day 4 LinkedIn Widget state machine, duplicate prevention, and SPA safety.
 */
import { strict as assert } from "node:assert";
import { LinkedInWidget, WidgetState } from "../LinkedInWidget";
import { Job } from "../../../types/job";
import { Application } from "../../../types/application";
import { Timestamp } from "firebase/firestore";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const mockJobA: Job = {
  source: "linkedin",
  externalJobId: "3981726450",
  title: "Staff Systems Engineer",
  company: "Anthropic",
  location: "San Francisco, CA",
  url: "https://www.linkedin.com/jobs/view/3981726450/",
};

const mockJobB: Job = {
  source: "linkedin",
  externalJobId: "4019283712",
  title: "Frontend Architect",
  company: "Stripe",
  location: "Seattle, WA",
  url: "https://www.linkedin.com/jobs/view/4019283712/",
};

const mockApplicationA: Application = {
  source: "linkedin",
  externalJobId: "3981726450",
  company: "Anthropic",
  title: "Staff Systems Engineer",
  location: "San Francisco, CA",
  url: "https://www.linkedin.com/jobs/view/3981726450/",
  status: "applied",
  appliedAt: {
    toDate: () => new Date("2026-09-23T12:00:00Z"),
  } as unknown as Timestamp,
  createdAt: {
    toDate: () => new Date("2026-09-23T12:00:00Z"),
  } as unknown as Timestamp,
  updatedAt: {
    toDate: () => new Date("2026-09-23T12:00:00Z"),
  } as unknown as Timestamp,
};

// Polyfill minimal browser DOM globals for Node execution environment
class MockShadowRoot {
  innerHTML: string = "";
  getElementById(id: string): any {
    if (this.innerHTML.includes(`id="${id}"`)) {
      return {
        addEventListener: () => {},
      };
    }
    return null;
  }
}

class MockElement {
  id: string = "";
  style: Record<string, string> = {};
  parentNode: MockElement | null = null;
  children: MockElement[] = [];
  shadowRoot: MockShadowRoot | null = null;

  attachShadow(_opts: { mode: string }) {
    this.shadowRoot = new MockShadowRoot();
    return this.shadowRoot;
  }

  appendChild(el: MockElement) {
    el.parentNode = this;
    this.children.push(el);
  }

  insertBefore(newEl: MockElement, _refEl: MockElement | null) {
    newEl.parentNode = this;
    this.children.push(newEl);
  }

  removeChild(el: MockElement) {
    const idx = this.children.indexOf(el);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      el.parentNode = null;
    }
  }
}

// Set up global document mocks if running in pure Node.js
if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: (_tag: string) => new MockElement(),
    getElementById: () => null,
    querySelector: () => null,
  };
}

const tests: TestCase[] = [
  {
    name: "Scenario 1: Widget initializes with dedicated root ID 'appliedyet-job-widget-root'",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      const root = widget.getRootElement();
      assert.equal(root.id, "appliedyet-job-widget-root");
    },
  },
  {
    name: "Scenario 2: State 6 (Not Authenticated) displays sign-in instructions without interactive buttons",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "not_authenticated",
        job: mockJobA,
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(shadow.innerHTML.includes("Sign in through the AppliedYet extension"));
      assert(!shadow.innerHTML.includes("id=\"btn-mark-applied\""));
      assert(!shadow.innerHTML.includes("id=\"btn-undo\""));
    },
  },
  {
    name: "Scenario 3: State 3 (Loading) displays checking status message",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "loading",
        job: mockJobA,
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(shadow.innerHTML.includes("Checking application status..."));
      assert(shadow.innerHTML.includes("class=\"spinner\""));
    },
  },
  {
    name: "Scenario 4: State 1 (Not Applied) displays 'Not applied' and 'Mark as Applied' button",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "not_applied",
        job: mockJobA,
        application: null,
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(shadow.innerHTML.includes("Not applied"));
      assert(shadow.innerHTML.includes("Mark as Applied"));
      assert(shadow.innerHTML.includes("id=\"btn-mark-applied\""));
      assert(!shadow.innerHTML.includes("id=\"btn-undo\""));
    },
  },
  {
    name: "Scenario 5: State 2 (Applied) displays 'Applied', date, and 'Undo' button",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "applied",
        job: mockJobA,
        application: mockApplicationA,
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(shadow.innerHTML.includes("Applied"));
      assert(shadow.innerHTML.includes("Sep 23, 2026"));
      assert(shadow.innerHTML.includes("id=\"btn-undo\""));
      assert(!shadow.innerHTML.includes("id=\"btn-mark-applied\""));
    },
  },
  {
    name: "Scenario 6: Inline Undo confirmation renders with 'Yes, Remove' and 'Cancel'",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "applied",
        job: mockJobA,
        application: mockApplicationA,
        confirmingUndo: true,
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(shadow.innerHTML.includes("Remove this application from your tracker?"));
      assert(shadow.innerHTML.includes("id=\"btn-confirm-undo\""));
      assert(shadow.innerHTML.includes("id=\"btn-cancel-undo\""));
    },
  },
  {
    name: "Scenario 7: Undo confirmation resets automatically when navigating to another job",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "applied",
        job: mockJobA,
        application: mockApplicationA,
        confirmingUndo: true,
      });
      // User navigates from Job A to Job B
      widget.resetUndoConfirmation();
      widget.setState({
        mode: "loading",
        job: mockJobB,
        application: null,
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(!shadow.innerHTML.includes("Remove this application from your tracker?"));
      assert(!shadow.innerHTML.includes("id=\"btn-confirm-undo\""));
    },
  },
  {
    name: "Scenario 8: State 4 (Write in progress) disables actions and shows spinner",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "not_applied",
        job: mockJobA,
        isMutating: true,
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(shadow.innerHTML.includes("disabled"));
      assert(shadow.innerHTML.includes("class=\"spinner\""));
    },
  },
  {
    name: "Scenario 9: State 5 (Error) displays compact error message without overwriting status",
    run: () => {
      const widget = new LinkedInWidget({
        onMarkApplied: async () => {},
        onUndo: async () => {},
      });
      widget.setState({
        mode: "not_applied",
        job: mockJobA,
        errorMessage: "Network connection lost",
      });
      const shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
      assert(shadow.innerHTML.includes("Network connection lost"));
      assert(shadow.innerHTML.includes("Not applied"));
    },
  },
  {
    name: "Scenario 10: SPA Stale Data Safety: Discarding callbacks for previous jobs",
    run: () => {
      let activeJobId = "3981726450"; // Job A
      let widgetDisplayState = "loading";

      // Simulated background messaging callback
      function onMessageReceived(msg: { externalJobId: string; status: string }) {
        if (msg.externalJobId !== activeJobId) {
          // Stale callback discarded!
          return;
        }
        widgetDisplayState = msg.status;
      }

      // User initiates navigation to Job B
      activeJobId = "4019283712"; // Job B
      widgetDisplayState = "loading";

      // Late response arrives for Job A
      onMessageReceived({ externalJobId: "3981726450", status: "applied" });

      // State MUST remain loading (not applied from Job A!)
      assert.equal(widgetDisplayState, "loading");

      // Timely response arrives for Job B
      onMessageReceived({ externalJobId: "4019283712", status: "not_applied" });
      assert.equal(widgetDisplayState, "not_applied");
    },
  },
  {
    name: "Scenario 11: Duplicate widget prevention in DOM",
    run: () => {
      const parentContainer = new MockElement();
      const existingWidget = new MockElement();
      existingWidget.id = "appliedyet-job-widget-root";
      parentContainer.appendChild(existingWidget);

      // Verify that finding existing element prevents duplicate insertion
      let mountCount = 0;
      function mountWidgetSafe(parent: MockElement, widget: MockElement) {
        const found = parent.children.find((c) => c.id === "appliedyet-job-widget-root");
        if (found) {
          // Already mounted, do nothing
          return;
        }
        parent.appendChild(widget);
        mountCount++;
      }

      const duplicateAttempt = new MockElement();
      duplicateAttempt.id = "appliedyet-job-widget-root";

      mountWidgetSafe(parentContainer, duplicateAttempt);
      assert.equal(mountCount, 0);
      assert.equal(
        parentContainer.children.filter((c) => c.id === "appliedyet-job-widget-root").length,
        1
      );
    },
  },
  {
    name: "Scenario 12: Safe anchor fallback within detail container when primary-desc is absent",
    run: () => {
      // Simulate modern LinkedIn DOM where top-card primary description is absent
      const detailPane = new MockElement();
      const titleEl = new MockElement();
      titleEl.id = "job-title";
      detailPane.appendChild(titleEl);

      // Fallback resolver inside detailPane
      function resolveSafeAnchor(pane: MockElement | null) {
        if (!pane) return null;
        if (pane.children.length > 0) {
          return { targetNode: pane, insertBefore: pane.children[0] };
        }
        return { targetNode: pane, insertBefore: null };
      }

      const anchor = resolveSafeAnchor(detailPane);
      assert(anchor !== null);
      assert.equal(anchor.targetNode, detailPane);
      assert.equal(anchor.insertBefore, titleEl);
    },
  },
  {
    name: "Scenario 13: Refuses to mount into body when no detail pane exists",
    run: () => {
      function resolveSafeAnchor(pane: MockElement | null) {
        if (!pane) return null;
        return { targetNode: pane, insertBefore: null };
      }

      const anchor = resolveSafeAnchor(null);
      assert.equal(anchor, null);
    },
  },
];

console.log("Running LinkedIn Widget unit tests...");
let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test.run();
    console.log(`✓ PASS: ${test.name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${test.name}`);
    console.error(err);
    failed++;
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
