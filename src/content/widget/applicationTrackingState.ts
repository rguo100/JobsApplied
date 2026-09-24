import type { Application } from "../../types/application";

export interface ApplicationTrackingState {
  mode: "applied" | "not_applied";
  application: Application | null;
}

/** A Firestore application document represents a tracked job, regardless of workflow status. */
export function deriveApplicationTrackingState(
  application: Application | null
): ApplicationTrackingState {
  return application
    ? { mode: "applied", application }
    : { mode: "not_applied", application: null };
}
