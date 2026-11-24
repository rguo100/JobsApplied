import {
  AtsJobIdentity,
  createGreenhouseAtsIdentity,
} from "../../types/ats";

export interface GreenhouseDetection {
  identity: AtsJobIdentity;
  canonicalUrl: string;
}

const SUPPORTED_HOST = "job-boards.greenhouse.io";

/** Detects only the verified hosted Greenhouse job URL shape used by the MVP. */
export function detectGreenhouseJob(url: string): GreenhouseDetection | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== SUPPORTED_HOST) {
      return null;
    }
    const match = parsed.pathname.match(/^\/([^/]+)\/jobs\/(\d+)\/?$/);
    if (!match) return null;

    const identity = createGreenhouseAtsIdentity(
      decodeURIComponent(match[1]),
      match[2]
    );
    return {
      identity,
      canonicalUrl: `https://${SUPPORTED_HOST}/${identity.boardToken}/jobs/${identity.jobId}`,
    };
  } catch {
    return null;
  }
}
