import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { webAuth, signInWithGoogleWeb, signOutWeb } from "../firebase/webAuth";
import { isFirebaseConfigured } from "../firebase/config";

interface WebAuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
}

const WebAuthContext = createContext<WebAuthContextType | undefined>(undefined);

export const WebAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isFirebaseConfigured();

  useEffect(() => {
    if (!webAuth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      webAuth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      },
      (err) => {
        console.error("[AppliedYet Web Auth] State change error:", err);
        setError(err.message || "Failed to listen to auth state changes.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const signedInUser = await signInWithGoogleWeb();
      setUser(signedInUser);
    } catch (err: any) {
      console.error("[AppliedYet Web Auth] Sign-in failed:", err);
      setError(err instanceof Error ? err.message : "Failed to sign in with Google.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOutUser = async () => {
    setError(null);
    try {
      await signOutWeb();
      setUser(null);
    } catch (err: any) {
      console.error("[AppliedYet Web Auth] Sign-out failed:", err);
      setError(err instanceof Error ? err.message : "Failed to sign out.");
      throw err;
    }
  };

  const clearError = () => setError(null);

  return (
    <WebAuthContext.Provider
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
    </WebAuthContext.Provider>
  );
};

export const useWebAuth = (): WebAuthContextType => {
  const context = useContext(WebAuthContext);
  if (!context) {
    throw new Error("useWebAuth must be used within a WebAuthProvider");
  }
  return context;
};
