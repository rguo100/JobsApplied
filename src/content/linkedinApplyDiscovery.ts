import type { Job } from "../types/job";

export interface LinkedInApplyStartedMessage {
  type: "LINKEDIN_APPLY_STARTED";
  job: Job;
}

export function isExternalApplyAction(element: Element): boolean {
  const action = element.closest("a, button");
  if (!action) return false;
  const label = [
    action.textContent || "",
    action.getAttribute("aria-label") || "",
  ].join(" ").replace(/\s+/g, " ").trim();
  if (!/\bapply\b/i.test(label) || /\beasy\s+apply\b/i.test(label)) {
    return false;
  }
  return (
    action.matches(".jobs-apply-button, .jobs-apply-button--top-card") ||
    action.className.toString().toLowerCase().includes("apply") ||
    action.getAttribute("data-control-name")?.toLowerCase().includes("apply") === true
  );
}
