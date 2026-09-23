import { app, isFirebaseConfigured } from "./config";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
  browserPopupRedirectResolver,
  Auth,
} from "firebase/auth";

export const webAuth: Auth | null = app ? getAuth(app) : null;

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope("profile");
googleAuthProvider.addScope("email");

/**
 * Signs in a user using Firebase Web Google Auth Popup.
 * Resolves to the authenticated Firebase User.
 */
export async function signInWithGoogleWeb(): Promise<User> {
  if (!isFirebaseConfigured() || !webAuth) {
    throw new Error(
      "Firebase is not configured. Please check your environment variables."
    );
  }

  try {
    const result = await signInWithPopup(
      webAuth,
      googleAuthProvider,
      browserPopupRedirectResolver
    );
    return result.user;
  } catch (err: any) {
    if (err?.code === "auth/popup-closed-by-user") {
      throw new Error("Sign-in popup was closed before completing.");
    }
    if (err?.code === "auth/popup-blocked") {
      throw new Error(
        "Sign-in popup was blocked by your browser. Please allow popups for this site."
      );
    }
    if (err?.code === "auth/cancelled-popup-request") {
      throw new Error("Only one popup request is allowed at a time.");
    }
    throw err;
  }
}

/**
 * Signs out the current user from Firebase Web Auth.
 */
export async function signOutWeb(): Promise<void> {
  if (!webAuth) return;
  await signOut(webAuth);
}
