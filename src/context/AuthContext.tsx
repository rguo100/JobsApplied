import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import {
  User,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../firebase/config";

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
    if (!auth) return;
    if (isAuthenticatingRef.current) {
      return;
    }

    try {
      isAuthenticatingRef.current = true;
      console.log(`[AppliedYet Auth] Completing Firebase sign-in (via ${source})`);

      const credential = GoogleAuthProvider.credential(null, accessToken);
      await signInWithCredential(auth, credential);

      console.log("[AppliedYet Auth] Firebase sign-in completed");
    } catch (err: unknown) {
      const fbError = err as Error;
      console.error("[AppliedYet Auth] Firebase signInWithCredential failed:", fbError.message);
      if (source === "interactive") {
        setError(fbError.message || "Failed to sign in with Google credential.");
      }
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

      console.log("[AppliedYet Auth] Checking Chrome cached token");

      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        // Handle runtime errors gracefully (e.g. no cached token available)
        if (chrome.runtime?.lastError || !token) {
          console.log("[AppliedYet Auth] No cached Google token");
          return resolve(null);
        }

        console.log("[AppliedYet Auth] Cached Google token found");
        resolve(token);
      });
    });
  };

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (currentUser) {
          console.log("[AppliedYet Auth] Firebase initial state: signed-in");
          setUser(currentUser);
          setLoading(false);
          setError(null);
        } else {
          console.log("[AppliedYet Auth] Firebase initial state: signed-out");
          setUser(null);

          // If this is the initial mount and Firebase is not signed in,
          // perform silent synchronization check against Chrome's token cache
          if (!initialSyncAttemptedRef.current && !isAuthenticatingRef.current) {
            initialSyncAttemptedRef.current = true;
            const cachedToken = await checkChromeCachedToken();

            if (cachedToken) {
              await authenticateWithToken(cachedToken, "silent_sync");
            }
          }

          setLoading(false);
        }
      },
      (err) => {
        console.error("AppliedYet: Auth state error:", err);
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
      const accessToken = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime?.lastError) {
            const lastMsg = chrome.runtime.lastError.message || "OAuth error";
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
            return reject(new Error("No access token returned from Chrome Identity."));
          }

          resolve(token);
        });
      });

      // If the popup survived the interactive prompt, complete sign-in immediately
      await authenticateWithToken(accessToken, "interactive");
    } catch (err: unknown) {
      const authError = err as { code?: string; message?: string };
      console.warn("AppliedYet: Google sign-in error:", authError);

      if (authError.message?.includes("cancelled") || authError.message?.includes("closed")) {
        setError("Sign-in was cancelled.");
      } else {
        setError(authError.message || "Failed to sign in with Google.");
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
      if (typeof chrome !== "undefined" && chrome.identity && chrome.identity.getAuthToken) {
        await new Promise<void>((resolve) => {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (!chrome.runtime?.lastError && token) {
              chrome.identity.removeCachedAuthToken({ token }, () => {
                resolve();
              });
            } else {
              resolve();
            }
          });
        });
      }

      await signOut(auth);
      setUser(null);
    } catch (err: unknown) {
      const authError = err as { message?: string };
      setError(authError.message || "Failed to sign out.");
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
