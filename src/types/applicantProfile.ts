import type { Timestamp } from "firebase/firestore";

export interface ApplicantProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  region?: string;
  country?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ApplicantProfileInput = Omit<ApplicantProfile, "createdAt" | "updatedAt">;

export type ApplicantProfileField = keyof ApplicantProfileInput;

export interface ApplicantProfileValidation {
  valid: boolean;
  errors: Partial<Record<ApplicantProfileField, string>>;
}
