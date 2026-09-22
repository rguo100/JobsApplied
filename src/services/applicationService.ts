import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  WithFieldValue,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { Application, ApplicationStatus, getApplicationDocId } from "../types/application";

/**
 * Returns a document reference for an application under users/{uid}/applications/{applicationId}
 */
function getApplicationDocRef(uid: string, source: string, externalJobId: string) {
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
