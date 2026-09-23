import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  WithFieldValue,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { Application, ApplicationStatus, getApplicationDocId } from "../types/application";
import {
  Job,
  isFallbackCompany,
  isFallbackLocation,
  isFallbackTitle,
} from "../types/job";

/**
 * Returns a document reference for an application under users/{uid}/applications/{applicationId}
 */
export function getApplicationDocRef(uid: string, source: string, externalJobId: string) {
  if (!db) {
    throw new Error("Firestore is not initialized. Please verify your Firebase configuration.");
  }
  if (!uid) {
    throw new Error("User ID is required to access applications.");
  }
  const applicationId = getApplicationDocId(source, externalJobId);
  return doc(db, "users", uid, "applications", applicationId);
}

/**
 * Subscribes to real-time updates for an application document.
 * Returns an unsubscribe function.
 */
export function subscribeToApplication(
  uid: string,
  source: string,
  externalJobId: string,
  onUpdate: (application: Application | null) => void,
  onError?: (error: Error) => void
): () => void {
  if (!isFirebaseConfigured() || !db || !uid || !externalJobId) {
    onUpdate(null);
    return () => {};
  }

  try {
    const docRef = getApplicationDocRef(uid, source, externalJobId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onUpdate(null);
        } else {
          onUpdate(snapshot.data() as Application);
        }
      },
      (err) => {
        console.error("AppliedYet: Real-time application sync error:", err);
        if (onError) {
          onError(err);
        }
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error("AppliedYet: Failed to establish application listener:", err);
    if (onError && err instanceof Error) {
      onError(err);
    }
    return () => {};
  }
}

/**
 * Retrieves an application record for a given user and external job ID.
 */
export async function getApplication(
  uid: string,
  source: string,
  externalJobId: string
): Promise<Application | null> {
  if (!isFirebaseConfigured() || !db || !uid || !externalJobId) {
    return null;
  }

  try {
    const docRef = getApplicationDocRef(uid, source, externalJobId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data() as Application;
  } catch (error) {
    console.error("AppliedYet: Failed to get application:", error);
    throw error;
  }
}

/**
 * Saves or creates an application record under users/{uid}/applications/{applicationId}.
 * Idempotent: multiple calls for the same job will update/merge the existing document.
 */
export async function saveApplication(
  uid: string,
  application: Omit<Application, "createdAt" | "updatedAt"> & {
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
  }
): Promise<void> {
  if (!isFirebaseConfigured() || !db || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }

  try {
    const docRef = getApplicationDocRef(uid, application.source, application.externalJobId);
    const existingSnap = await getDoc(docRef);
    const existingApplication = existingSnap.exists()
      ? (existingSnap.data() as Application)
      : null;

    const payload: WithFieldValue<Application> = {
      source: application.source,
      externalJobId: application.externalJobId,
      company: application.company,
      title: application.title,
      location: application.location,
      url: application.url,
      status: application.status,
      appliedAt:
        application.status === "applied"
          ? application.appliedAt || existingApplication?.appliedAt || serverTimestamp()
          : null,
      createdAt: existingApplication?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    console.error("AppliedYet: Failed to save application:", error);
    throw error;
  }
}

/**
 * High-level helper to mark a job as applied in Firestore.
 * Conforms to Day 3 core workflow requirements.
 */
export async function markJobAsApplied(uid: string, job: Job): Promise<void> {
  if (!isFirebaseConfigured() || !db || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }
  if (!job.externalJobId) {
    throw new Error("Cannot track job without valid externalJobId.");
  }

  const docRef = getApplicationDocRef(uid, job.source, job.externalJobId);
  const existingSnap = await getDoc(docRef);
  const existingApplication = existingSnap.exists()
    ? (existingSnap.data() as Application)
    : null;

  const existingCompany = existingApplication?.company;
  const existingLocation = existingApplication?.location;
  const existingTitle = existingApplication?.title;

  const company = !isFallbackCompany(job.company)
    ? job.company
    : (!isFallbackCompany(existingCompany) ? existingCompany! : (job.company || "Unknown Company"));

  const location = !isFallbackLocation(job.location)
    ? job.location
    : (!isFallbackLocation(existingLocation) ? existingLocation! : (job.location || "Location not specified"));

  const title = !isFallbackTitle(job.title)
    ? job.title
    : (!isFallbackTitle(existingTitle) ? existingTitle! : (job.title || "Job Title"));

  const payload: WithFieldValue<Application> = {
    source: "linkedin",
    externalJobId: job.externalJobId,
    company,
    title,
    location,
    url: job.url || existingApplication?.url || "",
    status: "applied",
    appliedAt: existingApplication?.appliedAt || serverTimestamp(),
    createdAt: existingApplication?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, payload, { merge: true });
}

/**
 * Updates the status of an existing application.
 */
export async function updateApplicationStatus(
  uid: string,
  source: string,
  externalJobId: string,
  status: ApplicationStatus
): Promise<void> {
  if (!isFirebaseConfigured() || !db || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }

  try {
    const docRef = getApplicationDocRef(uid, source, externalJobId);
    const updates: WithFieldValue<Partial<Application>> = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (status === "applied") {
      updates.appliedAt = serverTimestamp();
    }

    await updateDoc(docRef, updates as Record<string, unknown>);
  } catch (error) {
    console.error("AppliedYet: Failed to update application status:", error);
    throw error;
  }
}

/**
 * Deletes an application record from users/{uid}/applications/{applicationId}.
 * Used for the Undo workflow.
 */
export async function deleteApplication(
  uid: string,
  source: string,
  externalJobId: string
): Promise<void> {
  if (!isFirebaseConfigured() || !db || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }

  try {
    const docRef = getApplicationDocRef(uid, source, externalJobId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("AppliedYet: Failed to delete application:", error);
    throw error;
  }
}

/**
 * Subscribes to real-time updates for all applications of a given user.
 * Returns an unsubscribe function.
 */
export function subscribeToUserApplications(
  uid: string,
  onUpdate: (applications: Application[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!isFirebaseConfigured() || !db || !uid) {
    onUpdate([]);
    return () => {};
  }

  try {
    const colRef = collection(db, "users", uid, "applications");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const applications: Application[] = [];
        snapshot.forEach((docSnap) => {
          applications.push(docSnap.data() as Application);
        });

        // Deterministic sort: latest appliedAt or createdAt first
        applications.sort((a, b) => {
          const timeA = a.appliedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
          const timeB = b.appliedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
          return timeB - timeA;
        });

        onUpdate(applications);
      },
      (err) => {
        console.error("AppliedYet: Real-time user applications sync error:", err);
        if (onError) {
          onError(err);
        }
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error("AppliedYet: Failed to establish user applications listener:", err);
    if (onError && err instanceof Error) {
      onError(err);
    }
    return () => {};
  }
}
