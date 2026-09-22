import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  User,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "../firebase/config";

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

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
        setError(null);
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

    const authInstance = auth;
    setLoading(true);

    try {
      // Check if running inside Chrome Extension environment with Chrome Identity API
      const hasChromeIdentity =
        typeof chrome !== "undefined" &&
        chrome.identity &&
        typeof chrome.identity.getAuthToken === "function";

      if (hasChromeIdentity) {
        // --- Native Chrome Extension Google OAuth using chrome.identity.getAuthToken ---
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

        // Convert the returned Google OAuth2 access token to a Firebase Auth Credential
        const credential = GoogleAuthProvider.credential(null, accessToken);
        await signInWithCredential(authInstance, credential);
      } else {
        // --- Web Preview Fallback (only used when developing outside Chrome Extension) ---
        if (!googleProvider) {
          throw new Error("Google Auth Provider unavailable.");
        }
        await signInWithPopup(authInstance, googleProvider);
      }
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
      // Optionally remove cached Chrome auth token if running in extension
      if (typeof chrome !== "undefined" && chrome.identity && chrome.identity.getAuthToken) {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (!chrome.runtime?.lastError && token) {
            chrome.identity.removeCachedAuthToken({ token }, () => {
              // Cache cleared
            });
          }
        });
      }

      await signOut(auth);
      setUser(null);
    } catch (err: unknown) {
      const authError = err as { message?: string };
      setError(authError.message || "Failed to sign out.");
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
