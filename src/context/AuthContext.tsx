import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import {
  User,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
} from "firebase/auth/web-extension";
import { auth, isFirebaseConfigured } from "../firebase/config";
import {
  isInvalidCredentialError,
  evictCachedAuthToken,
  performSilentSyncWithRecovery,
  performInteractiveAuthWithRecovery,
} from "../utils/authRecovery";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_DIAGNOSTIC_KEY = "appliedyet.auth.lastDiagnostic";

type AuthDiagnosticDetails = Record<string, string | number | boolean | null | undefined>;

function describeError(err: unknown): AuthDiagnosticDetails {
  if (!(err instanceof Error) && (typeof err !== "object" || err === null)) {
    return { message: String(err) };
  }

  const candidate = err as Error & { code?: string; customData?: { email?: string } };
  return {
    name: candidate.name,
    code: candidate.code,
    message: candidate.message,
    email: candidate.customData?.email,
  };
}

/** Persist only stage metadata so a popup teardown cannot erase the evidence. */
function recordAuthDiagnostic(stage: string, details: AuthDiagnosticDetails = {}): void {
  const diagnostic = { stage, at: new Date().toISOString(), ...details };
  console.info(`[AppliedYet Auth] ${stage}`, details);
  try {
    localStorage.setItem(AUTH_DIAGNOSTIC_KEY, JSON.stringify(diagnostic));
  } catch {
    // Console output remains available if extension storage is unavailable.
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isFirebaseConfigured();

  // Guard ref to prevent race conditions and duplicate concurrent sign-ins
  const isAuthenticatingRef = useRef<boolean>(false);
  const initialSyncAttemptedRef = useRef<boolean>(false);

  /**
   * Helper to silently exchange a Google access token with Firebase
   */
  const authenticateWithToken = async (accessToken: string, source: "silent_sync" | "interactive") => {
    if (!auth) {
      recordAuthDiagnostic("firebase_auth_unavailable", { source });
      throw new Error("Firebase Auth was not initialized. Check the earlier initialization error.");
    }
    if (isAuthenticatingRef.current) {
      recordAuthDiagnostic("firebase_exchange_skipped_already_running", { source });
      return;
    }

    try {
      isAuthenticatingRef.current = true;
      recordAuthDiagnostic("firebase_credential_creating", { source });
      const credential = GoogleAuthProvider.credential(null, accessToken);
      recordAuthDiagnostic("firebase_credential_created", {
        source,
        providerId: credential.providerId,
        signInMethod: credential.signInMethod,
      });

      recordAuthDiagnostic("firebase_sign_in_started", { source });
      const result = await signInWithCredential(auth, credential);
      recordAuthDiagnostic("firebase_sign_in_succeeded", {
        source,
        uid: result.user.uid,
        providerId: result.providerId,
      });
    } catch (err: unknown) {
      const details = describeError(err);
      recordAuthDiagnostic("firebase_sign_in_failed", { source, ...details });
      console.error("[AppliedYet Auth] Firebase signInWithCredential failed", details, err);

      if (isInvalidCredentialError(err)) {
        recordAuthDiagnostic("evicting_invalid_cached_token", { source, errorCode: details.code });
        await evictCachedAuthToken(accessToken);
      }

      setError(
        `${details.code ? `${details.code}: ` : ""}${details.message || "Failed to sign in with Google credential."}`
      );
      throw err;
    } finally {
      isAuthenticatingRef.current = false;
    }
  };

  /**
   * Helper to check Chrome's native identity cache non-interactively
   */
  const checkChromeCachedToken = (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (
        typeof chrome === "undefined" ||
        !chrome.identity ||
        typeof chrome.identity.getAuthToken !== "function"
      ) {
        return resolve(null);
      }

      recordAuthDiagnostic("chrome_silent_token_requested", {
        extensionId: chrome.runtime?.id,
      });

      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        // Handle runtime errors gracefully (e.g. no cached token available)
        if (chrome.runtime?.lastError || !token) {
          recordAuthDiagnostic("chrome_silent_token_unavailable", {
            message: chrome.runtime?.lastError?.message || "No cached token returned",
          });
          return resolve(null);
        }

        recordAuthDiagnostic("chrome_silent_token_received");
        resolve(token);
      });
    });
  };

  useEffect(() => {
    try {
      const previousDiagnostic = localStorage.getItem(AUTH_DIAGNOSTIC_KEY);
      if (previousDiagnostic) {
        console.info("[AppliedYet Auth] Previous popup diagnostic", JSON.parse(previousDiagnostic));
      }
    } catch {
      // Diagnostic recovery must never block Auth startup.
    }

    if (!isConfigured || !auth) {
      recordAuthDiagnostic("firebase_startup_unavailable", {
        isConfigured,
        authInitialized: Boolean(auth),
      });
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (currentUser) {
          recordAuthDiagnostic("firebase_auth_state_signed_in", { uid: currentUser.uid });
          setUser(currentUser);
          setLoading(false);
          setError(null);
        } else {
          recordAuthDiagnostic("firebase_auth_state_signed_out");
          setUser(null);

          // If this is the initial mount and Firebase is not signed in,
          // perform silent synchronization check against Chrome's token cache
          if (!initialSyncAttemptedRef.current && !isAuthenticatingRef.current) {
            initialSyncAttemptedRef.current = true;
            const syncResult = await performSilentSyncWithRecovery({
              getCachedToken: checkChromeCachedToken,
              authenticateWithToken: (token) => authenticateWithToken(token, "silent_sync"),
              evictToken: evictCachedAuthToken,
              recordDiagnostic: (stage, details) => recordAuthDiagnostic(stage, details),
            });

            if (syncResult.recoveredFromInvalidToken) {
              setError(null);
            }
          }

          setLoading(false);
        }
      },
      (err) => {
        recordAuthDiagnostic("firebase_auth_state_failed", describeError(err));
        console.error("[AppliedYet Auth] Auth state observer failed", err);
        setError(err.message || "Failed to determine authentication state.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isConfigured]);

  const signInWithGoogle = async () => {
    setError(null);
    if (!isConfigured || !auth) {
      setError("Firebase credentials not configured. Please supply your Firebase Web configuration.");
      return;
    }

    if (isAuthenticatingRef.current) {
      return;
    }

    setLoading(true);

    try {
      const hasChromeIdentity =
        typeof chrome !== "undefined" &&
        chrome.identity &&
        typeof chrome.identity.getAuthToken === "function";

      if (!hasChromeIdentity) {
        throw new Error(
          "Chrome Identity API is unavailable. Please run AppliedYet inside Google Chrome as an installed extension."
        );
      }

      // Launch interactive Chrome Account Picker
      const requestInteractiveToken = (): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
          recordAuthDiagnostic("chrome_interactive_token_requested", {
            extensionId: chrome.runtime?.id,
          });

          chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime?.lastError) {
              const lastMsg = chrome.runtime.lastError.message || "OAuth error";
              recordAuthDiagnostic("chrome_interactive_token_failed", { message: lastMsg });
              if (
                lastMsg.toLowerCase().includes("canceled") ||
                lastMsg.toLowerCase().includes("cancelled") ||
                lastMsg.toLowerCase().includes("did not approve")
              ) {
                return reject(new Error("Sign-in was cancelled by user."));
              }
              return reject(new Error(lastMsg));
            }

            if (!token) {
              recordAuthDiagnostic("chrome_interactive_token_failed", {
                message: "No access token returned from Chrome Identity",
              });
              return reject(new Error("No access token returned from Chrome Identity."));
            }

            recordAuthDiagnostic("chrome_interactive_token_received");
            resolve(token);
          });
        });
      };

      // Perform interactive sign-in with recovery (retrying once with a fresh token if invalid-credential)
      await performInteractiveAuthWithRecovery({
        requestInteractiveToken,
        authenticateWithToken: (token) => authenticateWithToken(token, "interactive"),
        evictToken: evictCachedAuthToken,
        recordDiagnostic: (stage, details) => recordAuthDiagnostic(stage, details),
      });
    } catch (err: unknown) {
      const authError = err as { code?: string; message?: string };
      console.error("[AppliedYet Auth] Google sign-in failed", describeError(err), err);

      if (authError.message?.includes("cancelled") || authError.message?.includes("closed")) {
        setError("Sign-in was cancelled.");
      } else {
        setError(
          `${authError.code ? `${authError.code}: ` : ""}${authError.message || "Failed to sign in with Google."}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const signOutUser = async () => {
    setError(null);
    if (!auth) return;

    try {
      setLoading(true);

      // Invalidate the token in Chrome's identity cache before signing out of Firebase
      if (typeof chrome !== "undefined" && chrome.identity?.getAuthToken) {
        await new Promise<void>((resolve) => {
          chrome.identity.getAuthToken({ interactive: false }, async (token) => {
            if (!chrome.runtime?.lastError && token) {
              await evictCachedAuthToken(token);
            }
            resolve();
          });
        });
      } else {
        recordAuthDiagnostic("chrome_identity_unavailable_during_sign_out");
      }

      await signOut(auth);
      setUser(null);
    } catch (err: unknown) {
      const authError = err as { message?: string };
      setError(authError.message || "Failed to sign out.");
      recordAuthDiagnostic("firebase_sign_out_failed", describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isConfigured,
        signInWithGoogle,
        signOutUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
