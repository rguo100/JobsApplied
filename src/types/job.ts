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
  | { type: "JOB_UPDATED"; job: Job | null };
