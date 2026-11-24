import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  fillGreenhouseApplication,
  previewGreenhouseAutofill,
} from "../greenhouse/greenhouseAutofill";
import { validateApplicantProfile } from "../../utils/applicantProfileValidation";
import { createApplicantProfilePayload } from "../../services/applicantProfileService";
import type { ApplicantProfileInput } from "../../types/applicantProfile";

console.log("Running Greenhouse AutoFill tests...");

const profile: ApplicantProfileInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+1 416 555 0100",
  city: "Toronto, ON",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  githubUrl: "https://github.com/ada",
  portfolioUrl: "https://ada.example.com",
};
assert.equal(validateApplicantProfile(profile).valid, true);
assert.equal(validateApplicantProfile({ ...profile, email: "invalid" }).valid, false);
assert.equal(validateApplicantProfile({ ...profile, linkedinUrl: "javascript:alert(1)" }).valid, false);

// Existing profile documents remain compatible when optional fields are absent.
const legacyProfile: ApplicantProfileInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
};
assert.equal(validateApplicantProfile(legacyProfile).valid, true);
const existingPayload = createApplicantProfilePayload(legacyProfile, true, { marker: "now" });
assert.equal("createdAt" in existingPayload, false);
assert.equal("phone" in existingPayload, false);

const { document, window } = parseHTML(`<!doctype html><html><body>
  <main><button id="employer-apply" type="button">Apply</button><div id="form-slot"></div></main>
</body></html>`);
const doc = document as unknown as Document;

// Before the employer reveals its application form, the rescan is safely empty.
assert.equal(previewGreenhouseAutofill(doc, profile).root, null);

const slot = document.getElementById("form-slot")!;
slot.innerHTML = `
  <form id="application-form">
    <label for="first_name">First Name</label><input id="first_name" name="first_name" />
    <label for="last_name">Last Name</label><input id="last_name" name="last_name" value="Existing Last" />
    <label for="email">Email Address</label><input id="email" name="email" type="email" />
    <label for="phone">Phone</label><input id="phone" name="phone" />
    <label for="location">Current Location</label><input id="location" name="location" />
    <label for="linkedin">LinkedIn Profile</label><input id="linkedin" name="linkedin" />
    <label for="github">GitHub URL</label><input id="github" name="github" />
    <label for="portfolio">Portfolio URL</label><input id="portfolio" name="portfolio" />
    <label for="salary">Salary expectations</label><input id="salary" name="salary" />
    <label for="sponsorship">Will you require sponsorship?</label><input id="sponsorship" name="sponsorship" />
    <label for="essay">Why do you want this job?</label><textarea id="essay" name="essay"></textarea>
    <label for="resume">Resume</label><input id="resume" name="resume" type="file" />
    <button id="submit" type="submit">Submit application</button>
  </form>`;

const preview = previewGreenhouseAutofill(doc, profile);
assert.ok(preview.root, "form revealed after Apply must be detected on the next scan");
assert.equal(preview.existing, 1);
assert.ok(preview.sensitive >= 2, "salary and sponsorship must be sensitive");
assert.ok(preview.manual >= 2, "resume and free-text question require manual action");

let inputEvents = 0;
let changeEvents = 0;
const firstName = document.getElementById("first_name") as unknown as HTMLInputElement;
firstName.addEventListener("input", () => inputEvents++);
firstName.addEventListener("change", () => changeEvents++);
let submitClicks = 0;
document.getElementById("submit")!.addEventListener("click", () => submitClicks++);

const result = fillGreenhouseApplication(doc, profile, false);
assert.equal(firstName.value, "Ada");
assert.ok(inputEvents > 0 && changeEvents > 0, "controlled inputs must receive input/change events");
assert.equal((document.getElementById("last_name") as unknown as HTMLInputElement).value, "Existing Last");
assert.equal((document.getElementById("salary") as unknown as HTMLInputElement).value, "");
assert.equal((document.getElementById("sponsorship") as unknown as HTMLInputElement).value, "");
assert.equal((document.getElementById("resume") as unknown as HTMLInputElement).value, "");
assert.equal(submitClicks, 0, "AutoFill must never click Submit");
assert.ok(result.filled >= 7);

fillGreenhouseApplication(doc, profile, true);
assert.equal((document.getElementById("last_name") as unknown as HTMLInputElement).value, "Lovelace");

// Direct visit mounts synchronously before failing background/auth work.
(globalThis as any).document = document;
(globalThis as any).window = {
  location: { href: "https://job-boards.greenhouse.io/affirm/jobs/7819447003?gh_src=test" },
  confirm: () => false,
};
(globalThis as any).chrome = {
  runtime: {
    lastError: { message: "Background unavailable" },
    sendMessage: (_message: unknown, callback: (response?: unknown) => void) => callback(undefined),
  },
};
const contentModule = await import("../greenhouseContentScript");
const firstShadow = contentModule.initializeGreenhouseAutofill(doc);
assert.ok(firstShadow);
assert.ok(document.getElementById(contentModule.GREENHOUSE_AUTOFILL_ROOT_ID));
assert.equal(firstShadow!.getElementById("ay-launcher")?.textContent, "AppliedYet AutoFill");
const secondShadow = contentModule.initializeGreenhouseAutofill(doc);
assert.equal(secondShadow, firstShadow, "repeated initialization must reuse one Shadow DOM root");
assert.equal(document.querySelectorAll(`#${contentModule.GREENHOUSE_AUTOFILL_ROOT_ID}`).length, 1);

await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(document.getElementById(contentModule.GREENHOUSE_AUTOFILL_ROOT_ID), "background errors must not remove the button");

// Greenhouse hydration may replace DOM nodes after the initial synchronous mount.
const mountedHost = firstShadow!.host as HTMLElement;
mountedHost.remove();
assert.equal(mountedHost.isConnected, false);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(mountedHost.isConnected, true, "a removed host must be restored under documentElement");
assert.equal(mountedHost.parentElement, document.documentElement);
assert.equal(firstShadow!.getElementById("ay-launcher")?.textContent, "AppliedYet AutoFill");

// The recovery mechanism is bounded and cannot remount forever.
const isolated = parseHTML("<!doctype html><html><body></body></html>").document as unknown as Document;
const isolatedShadow = contentModule.mountGreenhouseAutofillShell(isolated);
const isolatedHost = isolatedShadow.host as HTMLElement;
const monitor = contentModule.monitorGreenhouseAutofillHost(isolated, isolatedHost, { maxRemounts: 1, lifetimeMs: 5_000 });
isolatedHost.remove();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(isolatedHost.isConnected, true);
assert.equal(monitor.getRemountCount(), 1);
isolatedHost.remove();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(isolatedHost.isConnected, false, "host must stay removed after the remount limit");
assert.equal(monitor.getRemountCount(), 1);
monitor.disconnect();

console.log("Greenhouse AutoFill tests passed.");
