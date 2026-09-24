import type { ApplicationStatus } from "../types/application";

export interface ApplicationStatusUpdate<TUpdatedAt> {
  status: ApplicationStatus;
  updatedAt: TUpdatedAt;
}

/** Ordinary workflow transitions preserve appliedAt, createdAt, and job identity fields. */
export function createApplicationStatusUpdate<TUpdatedAt>(
  status: ApplicationStatus,
  updatedAt: TUpdatedAt
): ApplicationStatusUpdate<TUpdatedAt> {
  return { status, updatedAt };
}
