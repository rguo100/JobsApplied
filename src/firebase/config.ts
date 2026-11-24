import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
// MV3 extension pages must use Firebase's extension-specific Auth entry point.
// It initializes Auth with IndexedDB persistence and excludes browser popup/
// redirect dependencies that are incompatible with extension CSP.
import { getAuth, Auth } from "firebase/auth/web-extension";
import { initializeFirestore, Firestore } from "firebase/firestore";
import {
  getFirestore as getLiteFirestore,
  Firestore as LiteFirestore,
} from "firebase/firestore/lite";

const metaEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : ({} as Record<string, string | undefined>);

// Read Firebase Web configuration from Vite environment variables
const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || "",
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: metaEnv.VITE_FIREBASE_APP_ID || "",
};

/**
 * Checks if the required Firebase configuration keys are provided.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey !== "your_api_key_here" &&
    firebaseConfig.projectId !== "your_project_id"
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let profileDb: LiteFirestore | null = null;

try {
  if (isFirebaseConfigured()) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    // MV3 service workers can be suspended between requests and do not provide
    // the same streaming environment as a normal page.
    db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    // Applicant profile operations are one-shot reads/writes. Firestore Lite's
    // browser transport uses fetch and does not depend on XMLHttpRequest,
    // which is absent in Manifest V3 service workers.
    profileDb = getLiteFirestore(app);
    console.info("[AppliedYet Auth] Firebase initialized", {
      projectId: app.options.projectId,
      authDomain: app.options.authDomain,
      authPersistence: "indexedDBLocalPersistence (web-extension default)",
      firestoreTransport: "auto-detect-long-polling",
      profileFirestoreTransport: "firestore-lite-fetch",
    });
  }
} catch (err) {
  console.error("[AppliedYet Auth] Firebase initialization failed", err);
}

export { app, auth, db, profileDb };
