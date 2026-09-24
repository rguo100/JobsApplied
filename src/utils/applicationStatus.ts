import { ApplicationStatus } from "../types/application";

/**
 * Maps an ApplicationStatus enum value to its canonical user-facing label.
 * Preserves strict cross-surface consistency across Dashboard,
 * Chrome Extension Popup, and LinkedIn Inline Widget.
 *
 * Persisted enum values:
 * - "applied"   -> "Applied"
 * - "interview" -> "Interview"
 * - "rejected"  -> "Rejected"
 * - "offer"     -> "Offer"
 * - "saved"     -> "Saved"
 */
export function getApplicationStatusLabel(
  status: ApplicationStatus | string | null | undefined
): string {
  switch (status) {
    case "applied":
      return "Applied";
    case "interview":
      return "Interview";
    case "rejected":
      return "Rejected";
    case "offer":
      return "Offer";
    case "saved":
      return "Saved";
    default:
      return "Applied";
  }
}
