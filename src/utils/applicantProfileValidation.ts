import type {
  ApplicantProfileInput,
  ApplicantProfileValidation,
} from "../types/applicantProfile";

export function validateApplicantProfile(
  input: ApplicantProfileInput
): ApplicantProfileValidation {
  const errors: ApplicantProfileValidation["errors"] = {};
  if (!input.firstName.trim()) errors.firstName = "First name is required.";
  if (!input.lastName.trim()) errors.lastName = "Last name is required.";
  const email = input.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  for (const field of ["linkedinUrl", "githubUrl", "portfolioUrl"] as const) {
    const value = input[field]?.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      errors[field] = "Enter a complete http(s) URL.";
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
