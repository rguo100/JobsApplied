import { detectGreenhouseJob } from "./greenhouse/greenhouseDetection";
import { fillGreenhouseApplication, previewGreenhouseAutofill } from "./greenhouse/greenhouseAutofill";
import { validateApplicantProfile } from "../utils/applicantProfileValidation";
import type { ApplicantProfileInput } from "../types/applicantProfile";
import type {
  GreenhouseAssociationResponse,
  GreenhouseConfirmLinkMessage,
  GreenhouseDetectedMessage,
  GreenhouseLinkCandidate,
  GreenhouseProfileGetMessage,
  GreenhouseProfileResponse,
  GreenhouseProfileSaveMessage,
} from "../types/greenhouse";

export const GREENHOUSE_AUTOFILL_ROOT_ID = "appliedyet-greenhouse-autofill";
const MESSAGE_TIMEOUT_MS = 7000;
const HOST_REMOUNT_LIMIT = 3;
const HOST_MONITOR_LIFETIME_MS = 30_000;
const EMPTY_PROFILE: ApplicantProfileInput = { firstName: "", lastName: "", email: "" };
const PROFILE_FIELDS: Array<{ key: keyof ApplicantProfileInput; label: string; type?: string }> = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "city", label: "City / location" },
  { key: "linkedinUrl", label: "LinkedIn URL", type: "url" },
  { key: "githubUrl", label: "GitHub URL", type: "url" },
  { key: "portfolioUrl", label: "Portfolio URL", type: "url" },
];

const hostsByDocument = new WeakMap<Document, HTMLElement>();
const monitorsByDocument = new WeakMap<Document, { host: HTMLElement; disconnect: () => void }>();

interface HostRemountOptions {
  maxRemounts?: number;
  lifetimeMs?: number;
}

interface HostRemountController {
  disconnect: () => void;
  getRemountCount: () => number;
}

function hostDiagnostics(doc: Document, host: HTMLElement): Record<string, string | boolean> {
  const computed = doc.defaultView?.getComputedStyle?.(host);
  return {
    hostId: host.id,
    isConnected: host.isConnected,
    display: computed?.display || host.style.display || "unknown",
    visibility: computed?.visibility || host.style.visibility || "unknown",
    opacity: computed?.opacity || host.style.opacity || "unknown",
  };
}

export function monitorGreenhouseAutofillHost(
  doc: Document,
  host: HTMLElement,
  options: HostRemountOptions = {},
): HostRemountController {
  const maxRemounts = options.maxRemounts ?? HOST_REMOUNT_LIMIT;
  const lifetimeMs = options.lifetimeMs ?? HOST_MONITOR_LIFETIME_MS;
  const MutationObserverConstructor = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  let remountCount = 0;
  let queued = false;
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const disconnect = (): void => {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    if (timeout) clearTimeout(timeout);
  };

  const observer = MutationObserverConstructor
    ? new MutationObserverConstructor(() => {
        if (stopped || host.isConnected || queued) return;
        if (remountCount >= maxRemounts) return disconnect();
        queued = true;
        queueMicrotask(() => {
          queued = false;
          if (stopped || host.isConnected) return;
          const parent = doc.documentElement;
          if (!parent) return;
          parent.appendChild(host);
          remountCount += 1;
          const diagnostics = hostDiagnostics(doc, host);
          if (host.isConnected) console.info("[AppliedYet Greenhouse] AutoFill remounted.", diagnostics);
          else console.warn("[AppliedYet Greenhouse] AutoFill remount failed.", diagnostics);
          if (!host.isConnected && remountCount >= maxRemounts) disconnect();
        });
      })
    : undefined;

  observer?.observe(doc, { childList: true, subtree: true });
  if (observer && lifetimeMs > 0) {
    timeout = setTimeout(disconnect, lifetimeMs);
    (timeout as unknown as { unref?: () => void }).unref?.();
  }
  return { disconnect, getRemountCount: () => remountCount };
}

export function mountGreenhouseAutofillShell(doc: Document = document): ShadowRoot {
  const cached = hostsByDocument.get(doc);
  if (cached?.shadowRoot) {
    if (!cached.isConnected) doc.documentElement?.appendChild(cached);
    return cached.shadowRoot;
  }
  const existing = doc.getElementById(GREENHOUSE_AUTOFILL_ROOT_ID) as HTMLElement | null;
  if (existing?.shadowRoot) {
    hostsByDocument.set(doc, existing);
    return existing.shadowRoot;
  }
  const host = doc.createElement("div");
  host.id = GREENHOUSE_AUTOFILL_ROOT_ID;
  host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial}*{box-sizing:border-box}button,input{font:inherit}
      #ay-launcher{border:0;border-radius:999px;padding:11px 16px;cursor:pointer;background:#4f46e5;color:#fff;font:700 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.25)}
      #ay-panel{display:none;position:absolute;right:0;bottom:48px;width:340px;max-height:min(620px,calc(100vh - 90px));overflow:auto;padding:14px;border:1px solid #dbe1ea;border-radius:14px;background:#fff;color:#0f172a;box-shadow:0 18px 46px rgba(15,23,42,.24);font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #ay-panel.open{display:block}.ay-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.ay-title{font-size:14px;font-weight:800}#ay-close{border:0;background:transparent;cursor:pointer;color:#64748b;font-size:18px}
      .ay-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ay-field{display:flex;flex-direction:column;gap:3px}.ay-field.wide{grid-column:1/-1}.ay-field label{color:#475569;font-weight:650}.ay-field input{width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px;color:#0f172a;background:#fff}
      .ay-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.ay-btn{border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;background:#f8fafc;color:#1e293b;cursor:pointer;font-weight:650}.ay-btn.primary{border-color:#4f46e5;background:#4f46e5;color:#fff}
      .ay-note{margin-top:9px;padding:8px;border-radius:7px;background:#f8fafc;color:#475569;white-space:pre-line}.ay-note.error{background:#fef2f2;color:#b91c1c}.ay-note.success{background:#ecfdf5;color:#047857}.ay-small{margin-top:8px;color:#64748b}#ay-association:empty{display:none}.ay-candidate{display:block;width:100%;margin-top:5px;text-align:left}
    </style>
    <button id="ay-launcher" type="button">AppliedYet AutoFill</button>
    <section id="ay-panel" aria-label="AppliedYet AutoFill panel">
      <div class="ay-head"><span class="ay-title">AppliedYet AutoFill</span><button id="ay-close" type="button" aria-label="Close">×</button></div>
      <div id="ay-association" class="ay-note"></div>
      <div class="ay-grid">${PROFILE_FIELDS.map(({ key, label, type = "text" }, index) => `<div class="ay-field ${index >= 4 ? "wide" : ""}"><label for="ay-${key}">${label}</label><input id="ay-${key}" type="${type}" autocomplete="off" /></div>`).join("")}</div>
      <div class="ay-actions"><button id="ay-save" class="ay-btn" type="button">Save profile</button><button id="ay-preview" class="ay-btn" type="button">Preview autofill</button><button id="ay-fill" class="ay-btn primary" type="button">Fill application</button></div>
      <div id="ay-result" class="ay-note">Profile is loading…</div>
      <div class="ay-small">Resume: choose the file manually in Greenhouse. AppliedYet never uploads or stores resume files.</div>
      <div class="ay-small">Sensitive/custom questions are never autofilled. AppliedYet never clicks Submit.</div>
    </section>`;
  doc.documentElement.appendChild(host);
  hostsByDocument.set(doc, host);
  return shadow;
}

function sendMessage<T>(message: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const type = "type" in message ? String(message.type) : "unknown";
    const startedAt = Date.now();
    console.info("[AppliedYet Greenhouse] Background message sent.", { requestId, type });
    const timeout = setTimeout(() => {
      console.warn("[AppliedYet Greenhouse] Background message timed out.", { requestId, type, durationMs: Date.now() - startedAt });
      reject(new Error("Extension background did not respond."));
    }, MESSAGE_TIMEOUT_MS);
    chrome.runtime.sendMessage({ ...message, requestId }, (response: T) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        console.warn("[AppliedYet Greenhouse] Background message delivery failed.", { requestId, type, durationMs: Date.now() - startedAt });
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        console.info("[AppliedYet Greenhouse] Background response received.", { requestId, type, durationMs: Date.now() - startedAt });
        resolve(response);
      }
    });
  });
}

function inputFor(shadow: ShadowRoot, key: keyof ApplicantProfileInput): HTMLInputElement {
  return shadow.getElementById(`ay-${key}`) as HTMLInputElement;
}

function readProfile(shadow: ShadowRoot): ApplicantProfileInput {
  const profile: ApplicantProfileInput = { ...EMPTY_PROFILE };
  for (const { key } of PROFILE_FIELDS) {
    const value = inputFor(shadow, key).value.trim();
    if (["firstName", "lastName", "email"].includes(key) || value) profile[key] = value;
  }
  return profile;
}

function writeProfile(shadow: ShadowRoot, profile: ApplicantProfileInput | null): void {
  const safe = profile || EMPTY_PROFILE;
  for (const { key } of PROFILE_FIELDS) inputFor(shadow, key).value = safe[key] || "";
}

function setResult(shadow: ShadowRoot, text: string, kind: "normal" | "error" | "success" = "normal"): void {
  const result = shadow.getElementById("ay-result") as HTMLElement;
  result.textContent = text;
  result.className = `ay-note${kind === "normal" ? "" : ` ${kind}`}`;
}

function formatPreview(preview: ReturnType<typeof previewGreenhouseAutofill>): string {
  if (!preview.root) return "Application form not found. Click the employer’s Apply button, then preview again.";
  return `Detected: ${preview.detected} · Ready to fill: ${preview.fillable} · Already completed: ${preview.existing} · Manual action: ${preview.manual + preview.sensitive}`;
}

function renderAssociation(shadow: ShadowRoot, response: GreenhouseAssociationResponse, confirm: (candidate: GreenhouseLinkCandidate) => void): void {
  const container = shadow.getElementById("ay-association") as HTMLElement;
  container.replaceChildren();
  if (response.status === "linked") container.textContent = `LinkedIn posting ${response.linkedInPostingId || "linked"}.`;
  else if (response.status === "needs_confirmation") {
    container.append("Choose the LinkedIn posting to link:");
    for (const candidate of response.candidates || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ay-btn ay-candidate";
      button.textContent = `${candidate.company || "LinkedIn"} · ${candidate.title || candidate.linkedInPostingId}`;
      button.addEventListener("click", () => confirm(candidate));
      container.appendChild(button);
    }
  } else container.textContent = response.status === "error" ? `LinkedIn linking unavailable: ${response.error || "unknown error"}` : "No verified LinkedIn source. AutoFill is still available.";
}

async function initializeAsyncFeatures(shadow: ShadowRoot, detection: NonNullable<ReturnType<typeof detectGreenhouseJob>>): Promise<void> {
  const title = (document.querySelector("h1")?.textContent || "").trim();
  const showAssociation = (response: GreenhouseAssociationResponse) => renderAssociation(shadow, response, async (candidate) => {
    const message: GreenhouseConfirmLinkMessage = { type: "GREENHOUSE_CONFIRM_LINK", sessionId: candidate.sessionId, atsJobId: detection.identity.canonicalId, canonicalUrl: detection.canonicalUrl, title };
    try { showAssociation(await sendMessage<GreenhouseAssociationResponse>(message)); }
    catch (error) { showAssociation({ status: "error", atsJobId: detection.identity.canonicalId, error: error instanceof Error ? error.message : "Linking failed." }); }
  });
  const detected: GreenhouseDetectedMessage = { type: "GREENHOUSE_JOB_DETECTED", atsJobId: detection.identity.canonicalId, canonicalUrl: detection.canonicalUrl, title };
  sendMessage<GreenhouseAssociationResponse>(detected).then(showAssociation).catch((error) => {
    console.warn("[AppliedYet Greenhouse] LinkedIn association unavailable", error);
    showAssociation({ status: "error", atsJobId: detection.identity.canonicalId, error: error instanceof Error ? error.message : "Association failed." });
  });

  const request: GreenhouseProfileGetMessage = { type: "GREENHOUSE_PROFILE_GET" };
  try {
    const response = await sendMessage<GreenhouseProfileResponse>(request);
    if (response.status === "ok") {
      writeProfile(shadow, response.profile);
      setResult(shadow, response.profile ? "Saved profile loaded." : "Enter your profile, then save or preview.");
    } else {
      writeProfile(shadow, null);
      setResult(shadow, response.error, response.status === "signed_out" ? "normal" : "error");
    }
  } catch (error) {
    console.warn("[AppliedYet Greenhouse] Profile loading unavailable", error);
    writeProfile(shadow, null);
    setResult(shadow, error instanceof Error ? error.message : "Could not load profile.", "error");
  }
}

export function initializeGreenhouseAutofill(doc: Document = document): ShadowRoot | null {
  const detection = detectGreenhouseJob(doc.defaultView?.location?.href || window.location.href);
  if (!detection) {
    console.info("[AppliedYet Greenhouse] Unsupported page; AutoFill not mounted.");
    return null;
  }
  const shadow = mountGreenhouseAutofillShell(doc);
  const host = shadow.host as HTMLElement;
  const existingMonitor = monitorsByDocument.get(doc);
  if (!existingMonitor || existingMonitor.host !== host) {
    existingMonitor?.disconnect();
    const monitor = monitorGreenhouseAutofillHost(doc, host);
    monitorsByDocument.set(doc, { host, disconnect: monitor.disconnect });
  }
  const diagnostics = hostDiagnostics(doc, host);
  if (host.isConnected) console.info("[AppliedYet Greenhouse] AutoFill mounted.", diagnostics);
  else console.warn("[AppliedYet Greenhouse] AutoFill host is disconnected after mounting.", diagnostics);
  const panel = shadow.getElementById("ay-panel") as HTMLElement;
  (shadow.getElementById("ay-launcher") as HTMLButtonElement).onclick = () => panel.classList.toggle("open");
  (shadow.getElementById("ay-close") as HTMLButtonElement).onclick = () => panel.classList.remove("open");

  (shadow.getElementById("ay-save") as HTMLButtonElement).onclick = async () => {
    const profile = readProfile(shadow);
    const validation = validateApplicantProfile(profile);
    if (!validation.valid) return setResult(shadow, Object.values(validation.errors).join("\n"), "error");
    setResult(shadow, "Saving profile…");
    const message: GreenhouseProfileSaveMessage = { type: "GREENHOUSE_PROFILE_SAVE", profile };
    try {
      const response = await sendMessage<GreenhouseProfileResponse>(message);
      setResult(shadow, response.status === "ok" ? "Profile saved." : response.error, response.status === "ok" ? "success" : "error");
    } catch (error) { setResult(shadow, error instanceof Error ? error.message : "Could not save profile.", "error"); }
  };
  (shadow.getElementById("ay-preview") as HTMLButtonElement).onclick = () => {
    const profile = readProfile(shadow);
    const validation = validateApplicantProfile(profile);
    if (!validation.valid) return setResult(shadow, Object.values(validation.errors).join("\n"), "error");
    setResult(shadow, formatPreview(previewGreenhouseAutofill(doc, profile)));
  };
  (shadow.getElementById("ay-fill") as HTMLButtonElement).onclick = () => {
    const profile = readProfile(shadow);
    const validation = validateApplicantProfile(profile);
    if (!validation.valid) return setResult(shadow, Object.values(validation.errors).join("\n"), "error");
    const preview = previewGreenhouseAutofill(doc, profile);
    if (!preview.root) return setResult(shadow, formatPreview(preview), "error");
    const overwrite = preview.existing > 0 ? window.confirm(`AppliedYet found ${preview.existing} non-empty field(s). Replace those values with your profile?`) : false;
    const result = fillGreenhouseApplication(doc, profile, overwrite);
    setResult(shadow, `Filled: ${result.filled} · Skipped: ${result.skipped} · Manual action: ${result.manual + result.sensitive}. Review every answer and upload your resume manually. Submit remains under your control.`, "success");
  };
  void initializeAsyncFeatures(shadow, detection);
  return shadow;
}

try { initializeGreenhouseAutofill(); }
catch (error) { console.error("[AppliedYet Greenhouse] Startup failed", error); }
