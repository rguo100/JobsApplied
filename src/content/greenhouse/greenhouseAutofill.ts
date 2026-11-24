import type {
  ApplicantProfileField,
  ApplicantProfileInput,
} from "../../types/applicantProfile";

export type AutofillFieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface AutofillFieldAnalysis {
  element: AutofillFieldElement;
  label: string;
  profileField: ApplicantProfileField | null;
  state: "fillable" | "existing" | "missing_profile" | "manual" | "sensitive";
}

export interface AutofillPreview {
  root: ParentNode | null;
  fields: AutofillFieldAnalysis[];
  detected: number;
  fillable: number;
  existing: number;
  manual: number;
  sensitive: number;
}

export interface AutofillResult extends AutofillPreview {
  filled: number;
  skipped: number;
}

const SENSITIVE_PATTERN = /\b(?:gender|race|ethnic|demographic|veteran|disabilit|eeo|equal employment|work authori[sz]ation|sponsor(?:ship)?|visa|salary|compensation|legal|criminal|conviction|pronoun|captcha|human verification)\b/i;

const FIELD_PATTERNS: Array<[ApplicantProfileField, RegExp]> = [
  ["firstName", /\bfirst[\s_-]*name\b|\bgiven[\s_-]*name\b/i],
  ["lastName", /\blast[\s_-]*name\b|\bfamily[\s_-]*name\b|\bsurname\b/i],
  ["email", /\be-?mail(?: address)?\b/i],
  ["phone", /\b(?:phone|telephone|mobile)(?: number)?\b/i],
  ["linkedinUrl", /\blinked[\s_-]*in(?: profile| url)?\b/i],
  ["githubUrl", /\bgithub(?: profile| url)?\b/i],
  ["portfolioUrl", /\b(?:portfolio|personal website|website url|personal site)(?: url)?\b/i],
  ["city", /\b(?:current )?(?:city|location)\b/i],
];

function cleanText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function getLabelText(element: AutofillFieldElement, doc: Document): string {
  const labels: string[] = [];
  const nativeLabels = "labels" in element ? element.labels : null;
  nativeLabels?.forEach((label) => labels.push(cleanText(label.textContent)));
  if (element.id) {
    const explicit = Array.from(doc.querySelectorAll("label[for]")).find(
      (label) => label.getAttribute("for") === element.id
    );
    if (explicit) labels.push(cleanText(explicit.textContent));
  }
  const wrapping = element.closest("label");
  if (wrapping) labels.push(cleanText(wrapping.textContent));
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      labels.push(cleanText(doc.getElementById(id)?.textContent));
    }
  }
  labels.push(
    cleanText(element.getAttribute("aria-label")),
    cleanText(element.getAttribute("placeholder")),
    cleanText(element.getAttribute("name")),
    cleanText(element.id)
  );
  return labels.filter(Boolean).join(" · ");
}

function matchProfileField(context: string): ApplicantProfileField | null {
  for (const [field, pattern] of FIELD_PATTERNS) {
    if (pattern.test(context)) return field;
  }
  return null;
}

function scoreApplicationRoot(root: ParentNode): number {
  const fields = Array.from(root.querySelectorAll("input, textarea, select"));
  let score = 0;
  for (const field of fields) {
    const element = field as AutofillFieldElement;
    const context = [element.id, element.getAttribute("name"), element.getAttribute("autocomplete")]
      .filter(Boolean)
      .join(" ");
    if (/first|last|email|phone|resume|location/i.test(context)) score += 1;
  }
  return score;
}

/** Rescans every time so forms revealed after the employer's Apply click are found. */
export function findGreenhouseApplicationRoot(doc: Document): ParentNode | null {
  const candidates: ParentNode[] = [
    ...Array.from(doc.querySelectorAll("form")),
    ...Array.from(doc.querySelectorAll("[data-testid*='application'], #application-form, .application-form")),
  ];
  let best: ParentNode | null = null;
  let bestScore = 1;
  for (const candidate of candidates) {
    const score = scoreApplicationRoot(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function previewGreenhouseAutofill(
  doc: Document,
  profile: ApplicantProfileInput
): AutofillPreview {
  const root = findGreenhouseApplicationRoot(doc);
  if (!root) {
    return { root: null, fields: [], detected: 0, fillable: 0, existing: 0, manual: 0, sensitive: 0 };
  }
  const fields: AutofillFieldAnalysis[] = [];
  for (const node of Array.from(root.querySelectorAll("input, textarea, select"))) {
    const element = node as AutofillFieldElement;
    const type = (element.getAttribute("type") || "text").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
    const label = getLabelText(element, doc) || element.tagName.toLowerCase();
    const context = `${label} ${element.getAttribute("autocomplete") || ""}`;
    if (type === "file") {
      fields.push({ element, label, profileField: null, state: "manual" });
      continue;
    }
    if (SENSITIVE_PATTERN.test(context)) {
      fields.push({ element, label, profileField: null, state: "sensitive" });
      continue;
    }
    const profileField = matchProfileField(context);
    if (!profileField || ["checkbox", "radio"].includes(type) || element.tagName === "SELECT" || element.tagName === "TEXTAREA") {
      fields.push({ element, label, profileField, state: "manual" });
      continue;
    }
    const currentValue = cleanText((element as HTMLInputElement).value);
    const profileValue = cleanText(profile[profileField]);
    fields.push({
      element,
      label,
      profileField,
      state: currentValue ? "existing" : profileValue ? "fillable" : "missing_profile",
    });
  }
  return {
    root,
    fields,
    detected: fields.length,
    fillable: fields.filter((field) => field.state === "fillable").length,
    existing: fields.filter((field) => field.state === "existing").length,
    manual: fields.filter((field) => ["manual", "missing_profile"].includes(field.state)).length,
    sensitive: fields.filter((field) => field.state === "sensitive").length,
  };
}

/** Uses the native value setter so React-controlled inputs receive real events. */
export function setNativeInputValue(element: AutofillFieldElement, value: string): void {
  let prototype: object | null = Object.getPrototypeOf(element);
  let setter: ((this: AutofillFieldElement, value: string) => void) | undefined;
  while (prototype && !setter) {
    setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set as typeof setter;
    prototype = Object.getPrototypeOf(prototype);
  }
  if (setter) setter.call(element, value);
  else (element as HTMLInputElement).value = value;
  const EventConstructor = element.ownerDocument?.defaultView?.Event || Event;
  element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  element.dispatchEvent(new EventConstructor("change", { bubbles: true }));
}

export function fillGreenhouseApplication(
  doc: Document,
  profile: ApplicantProfileInput,
  overwriteExisting: boolean
): AutofillResult {
  const preview = previewGreenhouseAutofill(doc, profile);
  let filled = 0;
  for (const field of preview.fields) {
    if (!field.profileField) continue;
    if (field.state !== "fillable" && !(overwriteExisting && field.state === "existing")) continue;
    const value = cleanText(profile[field.profileField]);
    if (!value) continue;
    setNativeInputValue(field.element, value);
    filled += 1;
  }
  return {
    ...preview,
    filled,
    skipped: preview.detected - filled,
  };
}
