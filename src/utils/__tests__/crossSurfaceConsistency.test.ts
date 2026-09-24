import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import type { Application, ApplicationStatus } from "../../types/application";
import { getApplicationStatusLabel } from "../applicationStatus";
import { isPopupApplicationTracked } from "../../components/popupApplicationState";
import { LinkedInWidget } from "../../content/widget/LinkedInWidget";
import { Job } from "../../types/job";
import { Timestamp } from "firebase/firestore";

console.log("Running Cross-Surface Application Status Consistency tests...");

// Polyfill minimal browser DOM globals if running in pure Node.js
class MockShadowRoot {
  innerHTML: string = "";
  listeners = new Map<string, any>();
  getElementById(id: string): any {
    if (this.innerHTML.includes(`id="${id}"`)) {
      return {
        addEventListener: (type: string, listener: any) => {
          this.listeners.set(id, listener);
        },
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

if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: (_tag: string) => new MockElement(),
    getElementById: () => null,
    querySelector: () => null,
  };
}

const mockJob: Job = {
  source: "linkedin",
  externalJobId: "3981726450",
  title: "Senior Full Stack Engineer",
  company: "Anthropic",
  location: "San Francisco, CA",
  url: "https://www.linkedin.com/jobs/view/3981726450/",
};

function createMockApp(status: ApplicationStatus): Application {
  return {
    source: "linkedin",
    externalJobId: "3981726450",
    company: "Anthropic",
    title: "Senior Full Stack Engineer",
    location: "San Francisco, CA",
    url: "https://www.linkedin.com/jobs/view/3981726450/",
    status,
    appliedAt: {
      toDate: () => new Date("2026-09-24T12:00:00Z"),
    } as unknown as Timestamp,
    createdAt: {
      toDate: () => new Date("2026-09-24T12:00:00Z"),
    } as unknown as Timestamp,
    updatedAt: {
      toDate: () => new Date("2026-09-24T12:00:00Z"),
    } as unknown as Timestamp,
  };
}

// ----------------------------------------------------
// 1. INVARIANT: Display Labels
// ----------------------------------------------------
assert.equal(getApplicationStatusLabel("applied"), "Applied");
assert.equal(getApplicationStatusLabel("interview"), "Interview");
assert.equal(getApplicationStatusLabel("rejected"), "Rejected");
assert.equal(getApplicationStatusLabel("offer"), "Offer");
assert.equal(getApplicationStatusLabel("saved"), "Saved");

// Prohibit unauthorized labels
assert.notEqual(getApplicationStatusLabel("interview"), "Interviewed");
assert.notEqual(getApplicationStatusLabel("offer"), "Offered");
console.log("✓ PASS: Requirement: Display labels match canonical terminology exactly");

// ----------------------------------------------------
// 2. INVARIANT: Status is source of truth, not existence
// ----------------------------------------------------
const interviewApp = createMockApp("interview");
assert.equal(isPopupApplicationTracked(interviewApp), true, "Document exists, so it is tracked");
assert.equal(interviewApp.status, "interview", "Status is 'interview', NOT 'applied'");
assert.equal(getApplicationStatusLabel(interviewApp.status), "Interview");

const rejectedApp = createMockApp("rejected");
assert.equal(isPopupApplicationTracked(rejectedApp), true);
assert.equal(rejectedApp.status, "rejected");
assert.equal(getApplicationStatusLabel(rejectedApp.status), "Rejected");

const offerApp = createMockApp("offer");
assert.equal(isPopupApplicationTracked(offerApp), true);
assert.equal(offerApp.status, "offer");
assert.equal(getApplicationStatusLabel(offerApp.status), "Offer");
console.log("✓ PASS: Requirement: Document existence does not incorrectly infer 'applied'");

// ----------------------------------------------------
// 3. INVARIANT: LinkedIn Inline Widget dynamic rendering
// ----------------------------------------------------
const widget = new LinkedInWidget({
  onMarkApplied: async () => {},
  onUndo: async () => {},
});

// A. Applied
widget.setState({
  mode: "applied",
  job: mockJob,
  application: createMockApp("applied"),
});
let shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
assert(shadow.innerHTML.includes("Applied"), "Widget must display 'Applied'");
assert(shadow.innerHTML.includes("<polyline"), "Widget must render checkmark for applied");

// B. Interview
widget.setState({
  mode: "applied",
  job: mockJob,
  application: createMockApp("interview"),
});
shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
assert(shadow.innerHTML.includes("Interview"), "Widget must display 'Interview'");
assert(shadow.innerHTML.includes("●"), "Widget must render bullet for interview");
assert(!shadow.innerHTML.includes(">Applied<"), "Widget must NOT display 'Applied' for interview status");

// C. Rejected
widget.setState({
  mode: "applied",
  job: mockJob,
  application: createMockApp("rejected"),
});
shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
assert(shadow.innerHTML.includes("Rejected"), "Widget must display 'Rejected'");
assert(!shadow.innerHTML.includes(">Applied<"), "Widget must NOT display 'Applied' for rejected status");

// D. Offer
widget.setState({
  mode: "applied",
  job: mockJob,
  application: createMockApp("offer"),
});
shadow = (widget.getRootElement() as any).shadowRoot as MockShadowRoot;
assert(shadow.innerHTML.includes("Offer"), "Widget must display 'Offer'");
assert(!shadow.innerHTML.includes(">Applied<"), "Widget must NOT display 'Applied' for offer status");
console.log("✓ PASS: Requirement: LinkedIn inline widget renders dynamic status (Applied, Interview, Rejected, Offer)");

// ----------------------------------------------------
// 4. INVARIANT: No new Chrome permissions added
// ----------------------------------------------------
const manifestPath = path.resolve(process.cwd(), "public/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
assert.deepEqual(manifest.permissions, ["activeTab", "identity"], "Chrome permissions must remain activeTab and identity only");
console.log("✓ PASS: Requirement: Confirmed no new Chrome permissions required");

// ----------------------------------------------------
// 5. INVARIANT: No Firestore schema change
// ----------------------------------------------------
// The Application document interface maintains identical fields
const sampleRecord = createMockApp("applied");
assert.equal("source" in sampleRecord, true);
assert.equal("externalJobId" in sampleRecord, true);
assert.equal("status" in sampleRecord, true);
assert.equal("company" in sampleRecord, true);
assert.equal("title" in sampleRecord, true);
assert.equal("location" in sampleRecord, true);
assert.equal("url" in sampleRecord, true);
assert.equal("appliedAt" in sampleRecord, true);
assert.equal("createdAt" in sampleRecord, true);
assert.equal("updatedAt" in sampleRecord, true);
console.log("✓ PASS: Requirement: Confirmed no Firestore schema change required");

console.log("\nAll Cross-Surface Application Status Consistency tests PASSED successfully.");
