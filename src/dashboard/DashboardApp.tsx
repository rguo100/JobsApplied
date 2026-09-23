import React, { useState, useEffect, useCallback } from "react";
import { useWebAuth } from "../context/WebAuthContext";
import { Header } from "./Header";
import { SummaryCards } from "./SummaryCards";
import { ApplicationTable } from "./ApplicationTable";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { EmptyState } from "./EmptyState";
import { Application, ApplicationStatus } from "../types/application";
import {
  subscribeToUserApplications,
  updateApplicationStatus,
  deleteApplication,
} from "../services/applicationService";
import { Briefcase, Loader2, AlertCircle } from "lucide-react";

export const DashboardApp: React.FC = () => {
  const {
    user,
    loading: authLoading,
    error: authError,
    signInWithGoogle,
    signOutUser,
    isConfigured,
  } = useWebAuth();

  const [applications, setApplications] = useState<Application[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [appPendingDelete, setAppPendingDelete] = useState<Application | null>(null);
  const [retryCounter, setRetryCounter] = useState<number>(0);

  const handleRetry = useCallback(() => {
    setSyncError(null);
    setDataLoading(true);
    setRetryCounter((c) => c + 1);
  }, []);

  // Real-time Firestore subscription to users/{uid}/applications
  useEffect(() => {
    if (!user) {
      setApplications([]);
      setDataLoading(false);
      setSyncError(null);
      return;
    }

    setDataLoading(true);
    setSyncError(null);

    const unsubscribe = subscribeToUserApplications(
      user.uid,
      (fetchedApps) => {
        setApplications(fetchedApps);
        setDataLoading(false);
        setSyncError(null);
      },
      (err) => {
        // As required: "Do not display stale data as current after a subscription error."
        setApplications([]);
        setSyncError(err.message || "Failed to synchronize applications.");
        setDataLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, retryCounter]);

  const handleStatusChange = async (app: Application, newStatus: ApplicationStatus) => {
    if (!user) return;
    try {
      await updateApplicationStatus(user.uid, app.source, app.externalJobId, newStatus);
    } catch (err: any) {
      console.error("[AppliedYet Dashboard] Status update error:", err);
      alert(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const handleDeleteConfirm = async (app: Application) => {
    if (!user) return;
    try {
      await deleteApplication(user.uid, app.source, app.externalJobId);
      setAppPendingDelete(null);
    } catch (err: any) {
      console.error("[AppliedYet Dashboard] Delete error:", err);
      alert(err instanceof Error ? err.message : "Failed to remove application.");
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (err) {
      // Handled in context error state
    } finally {
      setIsSigningIn(false);
    }
  };

  // 1. Initial Auth Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
          <p className="text-sm font-medium text-gray-500">
            Loading AppliedYet...
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo */}
          <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center text-white mx-auto shadow-md">
            <Briefcase className="w-6 h-6" />
          </div>
          <h2 className="mt-4 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
            AppliedYet
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 max-w">
            Track every job application in one place.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-2xl sm:px-10">
            {!isConfigured && (
              <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <span className="font-semibold">Firebase environment variables required:</span>
                    <p className="mt-1">
                      Configure <code className="bg-amber-100 px-1 py-0.5 rounded">VITE_FIREBASE_API_KEY</code> and <code className="bg-amber-100 px-1 py-0.5 rounded">VITE_FIREBASE_PROJECT_ID</code> in your environment.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {authError && (
              <div className="mb-6 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isSigningIn}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center space-x-3 py-3 px-4 border border-gray-300 rounded-xl shadow-xs bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 transition disabled:opacity-50"
            >
              {/* Google G Logo SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isSigningIn ? "Connecting..." : "Continue with Google"}</span>
            </button>

            <p className="mt-6 text-center text-xs text-gray-400">
              Sign in with the same Google account used in the Chrome Extension.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated State
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header user={user} onSignOut={signOutUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Summary */}
        <SummaryCards totalCount={applications.length} />

        {/* Content Area */}
        {dataLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center shadow-xs">
            <Loader2 className="w-6 h-6 text-violet-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">
              Loading applications...
            </p>
          </div>
        ) : syncError ? (
          <EmptyState error={syncError} onRetry={handleRetry} />
        ) : applications.length === 0 ? (
          <EmptyState />
        ) : (
          <ApplicationTable
            applications={applications}
            onStatusChange={handleStatusChange}
            onRequestDelete={(app) => setAppPendingDelete(app)}
          />
        )}
      </main>

      {/* Confirmation Modal */}
      <DeleteConfirmModal
        application={appPendingDelete}
        isOpen={Boolean(appPendingDelete)}
        onCancel={() => setAppPendingDelete(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
