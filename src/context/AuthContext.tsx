import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  User,
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
    if (!isConfigured || !auth || !googleProvider) {
      setError("Firebase credentials not configured. Please supply your Firebase Web configuration.");
      return;
    }

    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const authError = err as { code?: string; message?: string };
      console.warn("AppliedYet: Google sign-in failed:", authError);

      if (authError.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completing.");
      } else if (authError.code === "auth/unauthorized-domain") {
        setError(
          "This extension domain is not authorized in Firebase Console. Add your extension ID to Authorized Domains."
        );
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
