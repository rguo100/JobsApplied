import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import {
  AtsJob,
  getAtsJobDocumentId,
  parseAtsJobId,
} from "../types/ats";
import { getApplicationDocId } from "../types/application";

export interface AtsJobUpsertInput {
  atsJobId: string;
  canonicalUrl?: string;
  company?: string;
  title?: string;
  linkedInPostingIds?: string[];
}

function requireDb(uid: string) {
  if (!isFirebaseConfigured() || !db || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }
  return db;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function uniquePostingIds(ids: string[] = []): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function createAtsJobUpsertPayload(
  input: AtsJobUpsertInput,
  existing: AtsJob | null,
  timestamp: unknown
): Record<string, unknown> {
  const identity = parseAtsJobId(input.atsJobId);
  const incomingIds = uniquePostingIds(input.linkedInPostingIds);
  const existingIds = existing?.linkedInPostingIds || [];

  return {
    atsJobId: identity.canonicalId,
    provider: identity.provider,
    boardToken: identity.boardToken,
    jobId: identity.jobId,
    canonicalUrl: nonEmpty(input.canonicalUrl) ?? existing?.canonicalUrl ?? "",
    company: nonEmpty(input.company) ?? existing?.company ?? "",
    title: nonEmpty(input.title) ?? existing?.title ?? "",
    linkedInPostingIds: [...new Set([...existingIds, ...incomingIds])],
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export async function getAtsJob(uid: string, atsJobId: string): Promise<AtsJob | null> {
  const firestore = requireDb(uid);
  const identity = parseAtsJobId(atsJobId);
  const snapshot = await getDoc(
    doc(firestore, "users", uid, "atsJobs", identity.documentId)
  );
  return snapshot.exists() ? (snapshot.data() as AtsJob) : null;
}

export async function upsertAtsJob(uid: string, input: AtsJobUpsertInput): Promise<void> {
  const firestore = requireDb(uid);
  const identity = parseAtsJobId(input.atsJobId);
  const ref = doc(firestore, "users", uid, "atsJobs", identity.documentId);

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists() ? (snapshot.data() as AtsJob) : null;
    transaction.set(
      ref,
      createAtsJobUpsertPayload(input, existing, serverTimestamp())
    );
  });
}

export async function linkLinkedInPostingToAtsJob(
  uid: string,
  linkedInPostingId: string,
  input: AtsJobUpsertInput
): Promise<void> {
  const firestore = requireDb(uid);
  const postingId = linkedInPostingId.trim();
  if (!postingId) throw new Error("LinkedIn posting ID is required.");

  const identity = parseAtsJobId(input.atsJobId);
  const atsRef = doc(firestore, "users", uid, "atsJobs", identity.documentId);
  const postingRef = doc(
    firestore,
    "users",
    uid,
    "applications",
    getApplicationDocId("linkedin", postingId)
  );

  await runTransaction(firestore, async (transaction) => {
    const [atsSnapshot, postingSnapshot] = await Promise.all([
      transaction.get(atsRef),
      transaction.get(postingRef),
    ]);
    if (!postingSnapshot.exists()) {
      throw new Error("LinkedIn posting record does not exist.");
    }

    const currentAtsJobId = postingSnapshot.get("atsJobId");
    if (currentAtsJobId && currentAtsJobId !== identity.canonicalId) {
      throw new Error("LinkedIn posting is already linked to another ATS job.");
    }

    const existing = atsSnapshot.exists() ? (atsSnapshot.data() as AtsJob) : null;
    transaction.set(
      atsRef,
      createAtsJobUpsertPayload(
        { ...input, linkedInPostingIds: [postingId] },
        existing,
        serverTimestamp()
      )
    );

    const postingUpdate: Record<string, unknown> = {
      trackingVersion: 2,
      atsJobId: identity.canonicalId,
      atsProvider: identity.provider,
      atsDiscoveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const atsUrl = nonEmpty(input.canonicalUrl);
    if (atsUrl) postingUpdate.atsUrl = atsUrl;
    transaction.update(postingRef, postingUpdate);
  });
}
