import { Application } from "./application";

export interface Job {
  source: "linkedin";
  externalJobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
}

export interface MutationIdentity {
  requestId: string;
  source: string;
  externalJobId: string;
}

export type ExtensionMessage =
  | { type: "GET_CURRENT_JOB" }
  | { type: "CURRENT_JOB_RESPONSE"; job: Job | null }
  | { type: "JOB_UPDATED"; job: Job | null }
  // Content ↔ Background Bridge messages for Day 4 Inline Widget
  | { type: "AUTH_STATE_REQUEST" }
  | { type: "AUTH_STATE_RESPONSE"; isAuthenticated: boolean; uid?: string }
  | { type: "APPLICATION_SUBSCRIBE"; source: string; externalJobId: string }
  | { type: "APPLICATION_UNSUBSCRIBE"; source: string; externalJobId: string }
  | { type: "APPLICATION_DATA"; source: string; externalJobId: string; application: Application | null }
  | { type: "APPLICATION_ERROR"; source: string; externalJobId: string; error: string }
  | ({ type: "MARK_JOB_APPLIED"; job: Job } & MutationIdentity)
  | ({ type: "MARK_JOB_APPLIED_RESPONSE"; success: boolean; error?: string } & MutationIdentity)
  | ({ type: "DELETE_APPLICATION" } & MutationIdentity)
  | ({ type: "DELETE_APPLICATION_RESPONSE"; success: boolean; error?: string } & MutationIdentity);

export function matchesMutationIdentity(
  message: MutationIdentity,
  expected: MutationIdentity
): boolean {
  return (
    message.requestId === expected.requestId &&
    message.source === expected.source &&
    message.externalJobId === expected.externalJobId
  );
}
