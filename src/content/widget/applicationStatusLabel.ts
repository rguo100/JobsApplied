import type { ApplicationStatus } from "../../types/application";

export function getApplicationStatusLabel(
  status: ApplicationStatus | string | null | undefined,
): string {
  switch (status) {
    case "applied":
      return "Applied";
    case "saved":
      return "Saved";
    case "interview":
      return "Interview";
    case "rejected":
      return "Rejected";
    case "offer":
      return "Offer";
    default:
      return "Applied";
  }
}
