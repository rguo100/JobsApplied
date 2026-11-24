export interface GreenhouseLinkCandidate {
  sessionId: string;
  linkedInPostingId: string;
  title: string;
  company: string;
}

export type GreenhouseAssociationStatus =
  | "linked"
  | "needs_confirmation"
  | "unlinked"
  | "error";

export interface GreenhouseAssociationResponse {
  status: GreenhouseAssociationStatus;
  atsJobId: string;
  linkedInPostingId?: string;
  candidates?: GreenhouseLinkCandidate[];
  error?: string;
}

export interface GreenhouseDetectedMessage {
  type: "GREENHOUSE_JOB_DETECTED";
  atsJobId: string;
  canonicalUrl: string;
  title?: string;
}

export interface GreenhouseConfirmLinkMessage {
  type: "GREENHOUSE_CONFIRM_LINK";
  sessionId: string;
  atsJobId: string;
  canonicalUrl: string;
  title?: string;
}

export interface GreenhouseProfileGetMessage {
  type: "GREENHOUSE_PROFILE_GET";
}

export interface GreenhouseProfileSaveMessage {
  type: "GREENHOUSE_PROFILE_SAVE";
  profile: import("./applicantProfile").ApplicantProfileInput;
}

export type GreenhouseProfileResponse =
  | {
      status: "ok";
      profile: import("./applicantProfile").ApplicantProfileInput | null;
    }
  | { status: "signed_out"; error: string }
  | { status: "error"; error: string };
