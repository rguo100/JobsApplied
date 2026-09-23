import { Application } from "./application";

export interface Job {
  source: "linkedin";
  externalJobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
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
  | { type: "MARK_JOB_APPLIED"; job: Job }
  | { type: "MARK_JOB_APPLIED_RESPONSE"; success: boolean; error?: string }
  | { type: "DELETE_APPLICATION"; source: string; externalJobId: string }
  | { type: "DELETE_APPLICATION_RESPONSE"; success: boolean; error?: string };
