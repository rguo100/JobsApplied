export type AtsProvider = "greenhouse";

export interface AtsJobIdentity {
  provider: AtsProvider;
  boardToken: string;
  jobId: string;
  canonicalId: string;
  documentId: string;
}

export interface AtsJob {
  atsJobId: string;
  provider: AtsProvider;
  boardToken: string;
  jobId: string;
  canonicalUrl: string;
  company: string;
  title: string;
  linkedInPostingIds: string[];
  createdAt: import("firebase/firestore").Timestamp;
  updatedAt: import("firebase/firestore").Timestamp;
}

const GREENHOUSE_BOARD_TOKEN_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const GREENHOUSE_JOB_ID_PATTERN = /^\d+$/;

function assertGreenhouseBoardToken(boardToken: string): string {
  const normalized = boardToken.trim().toLowerCase();
  if (!GREENHOUSE_BOARD_TOKEN_PATTERN.test(normalized)) {
    throw new Error("Invalid Greenhouse board token.");
  }
  return normalized;
}

function assertGreenhouseJobId(jobId: string): string {
  const normalized = jobId.trim();
  if (!GREENHOUSE_JOB_ID_PATTERN.test(normalized)) {
    throw new Error("Invalid Greenhouse job ID.");
  }
  return normalized;
}

/** Creates a canonical identity from Greenhouse's board token and numeric job ID. */
export function createGreenhouseAtsIdentity(
  boardToken: string,
  jobId: string
): AtsJobIdentity {
  const normalizedBoardToken = assertGreenhouseBoardToken(boardToken);
  const normalizedJobId = assertGreenhouseJobId(jobId);
  const canonicalId = `greenhouse:${normalizedBoardToken}:${normalizedJobId}`;

  return {
    provider: "greenhouse",
    boardToken: normalizedBoardToken,
    jobId: normalizedJobId,
    canonicalId,
    documentId: getAtsJobDocumentId(canonicalId),
  };
}

/** Parses and validates a canonical ATS job ID. Full URLs are not accepted. */
export function parseAtsJobId(value: string): AtsJobIdentity {
  const normalized = value.trim();
  const parts = normalized.split(":");
  if (parts.length !== 3 || parts[0] !== "greenhouse") {
    throw new Error("Invalid or unsupported ATS job ID.");
  }

  return createGreenhouseAtsIdentity(parts[1], parts[2]);
}

/** Encodes a validated canonical ATS ID as one deterministic Firestore document ID. */
export function getAtsJobDocumentId(atsJobId: string): string {
  const identity = atsJobId.startsWith("greenhouse:")
    ? parseCanonicalPartsWithoutDocumentId(atsJobId)
    : (() => {
        throw new Error("Invalid or unsupported ATS job ID.");
      })();
  return encodeURIComponent(identity);
}

/** Reverses a Firestore ATS document ID and validates the recovered canonical ID. */
export function getAtsJobIdFromDocumentId(documentId: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(documentId);
  } catch {
    throw new Error("Invalid ATS job document ID.");
  }
  return parseAtsJobId(decoded).canonicalId;
}

function parseCanonicalPartsWithoutDocumentId(value: string): string {
  const parts = value.trim().split(":");
  if (parts.length !== 3 || parts[0] !== "greenhouse") {
    throw new Error("Invalid or unsupported ATS job ID.");
  }
  const boardToken = assertGreenhouseBoardToken(parts[1]);
  const jobId = assertGreenhouseJobId(parts[2]);
  return `greenhouse:${boardToken}:${jobId}`;
}
