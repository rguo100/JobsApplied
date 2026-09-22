import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
// MV3 extension pages must use Firebase's extension-specific Auth entry point.
// It initializes Auth with IndexedDB persistence and excludes browser popup/
// redirect dependencies that are incompatible with extension CSP.
import { getAuth, Auth } from "firebase/auth/web-extension";
import { getFirestore, Firestore } from "firebase/firestore";

// Read Firebase Web configuration from Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
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

try {
  if (isFirebaseConfigured()) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.info("[AppliedYet Auth] Firebase initialized", {
      projectId: app.options.projectId,
      authDomain: app.options.authDomain,
      authPersistence: "indexedDBLocalPersistence (web-extension default)",
    });
  }
} catch (err) {
  console.error("[AppliedYet Auth] Firebase initialization failed", err);
}

export { app, auth, db };
