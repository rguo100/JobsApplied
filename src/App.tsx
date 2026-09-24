import { useState, useEffect, useCallback, useRef } from "react";
import { Job, ExtensionMessage } from "./types/job";
import { Application } from "./types/application";
import { JobCard } from "./components/JobCard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import {
  subscribeToApplication,
  markJobAsApplied,
  deleteApplication,
} from "./services/applicationService";
import {
  BookmarkCheck,
  RefreshCw,
  Layers,
  LogOut,
  AlertCircle,
  X,
  User as UserIcon,
} from "lucide-react";

// Sample mock data for interactive web preview / testing
const SAMPLE_MOCK_JOBS: Job[] = [
  {
    source: "linkedin",
    externalJobId: "3981726450",
    title: "Senior Full Stack Engineer",
    company: "Anthropic",
    location: "San Francisco, CA (Hybrid)",
    url: "https://www.linkedin.com/jobs/view/3981726450/",
  },
  {
    source: "linkedin",
    externalJobId: "4019283712",
    title: "Staff Frontend Architect",
    company: "Stripe",
    location: "Seattle, WA (Remote)",
    url: "https://www.linkedin.com/jobs/view/4019283712/",
  },
  {
    source: "linkedin",
    externalJobId: "3892716254",
    title: "Product Engineer - AI Tools",
    company: "Linear",
    location: "New York, NY (On-site)",
    url: "https://www.linkedin.com/jobs/view/3892716254/",
  },
];

function PopupContent() {
  const { user, loading: authLoading, error: authError, isConfigured, signInWithGoogle, signOutUser, clearError } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [jobLoading, setJobLoading] = useState<boolean>(true);
  const [isLinkedInPage, setIsLinkedInPage] = useState<boolean>(false);
  const [isExtensionEnv, setIsExtensionEnv] = useState<boolean>(false);

  // Day 3 Application tracking state
  const [application, setApplication] = useState<Application | null>(null);
  const [applicationLoading, setApplicationLoading] = useState<boolean>(false);
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState<boolean>(false);

  // Tracks the active job ID for SPA safety and stale-response rejection
  const currentActiveJobIdRef = useRef<string | null>(null);

  // Function to fetch active job from active tab
  const fetchActiveTabJob = useCallback(() => {
    setJobLoading(true);

    try {
      if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
        setIsExtensionEnv(true);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime?.lastError || !tabs || tabs.length === 0) {
            setJobLoading(false);
            setIsLinkedInPage(false);
            setJob(null);
            return;
          }

          const activeTab = tabs[0];
          if (!activeTab || !activeTab.id || !activeTab.url) {
            setJobLoading(false);
            setIsLinkedInPage(false);
            setJob(null);
            return;
          }

          const onLinkedIn = activeTab.url.includes("linkedin.com/jobs");
          setIsLinkedInPage(onLinkedIn);

          if (!onLinkedIn) {
            setJobLoading(false);
            setJob(null);
            return;
          }

          try {
            chrome.tabs.sendMessage(
              activeTab.id,
              { type: "GET_CURRENT_JOB" } as ExtensionMessage,
              (response) => {
                setJobLoading(false);
                if (chrome.runtime?.lastError) {
                  setJob(null);
                  return;
                }
                if (response && response.type === "CURRENT_JOB_RESPONSE") {
                  setJob(response.job || null);
                } else {
                  setJob(null);
                }
              }
            );
          } catch {
            setJobLoading(false);
            setJob(null);
          }
        });
      } else {
        // Running in web dev preview mode
        setIsExtensionEnv(false);
        setIsLinkedInPage(true);
        setTimeout(() => {
          setJob((prev) => prev || SAMPLE_MOCK_JOBS[0]);
          setJobLoading(false);
        }, 300);
      }
    } catch {
      setJobLoading(false);
      setJob(null);
    }
  }, []);

  // Listen for active tab changes and message events from LinkedIn content script (Day 1 SPA handling)
  useEffect(() => {
    fetchActiveTabJob();

    try {
      if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
        const listener = (message: ExtensionMessage) => {
          if (message && message.type === "JOB_UPDATED") {
            setJob(message.job);
            setJobLoading(false);
          }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => {
          try {
            chrome.runtime.onMessage.removeListener(listener);
          } catch {
            // Safe cleanup
          }
        };
      }
    } catch {
      // Ignore if outside extension runtime
    }
  }, [fetchActiveTabJob]);

  // SPA Stale-Data Safety: Subscribe to active job's Firestore application record
  useEffect(() => {
    const currentJob = job;
    const activeJobId = currentJob?.externalJobId || null;
    currentActiveJobIdRef.current = activeJobId;
    setApplicationError(null);

    // If unauthenticated or no job detected, clear application state immediately
    if (!user || !currentJob || !activeJobId) {
      setApplication(null);
      setApplicationLoading(false);
      return;
    }

    // Immediately show loading for new job and clear previous job's state to prevent leaks
    setApplication(null);
    setApplicationLoading(true);

    let isDisposed = false;

    const unsubscribe = subscribeToApplication(
      user.uid,
      currentJob.source,
      activeJobId,
      (updatedApp) => {
        // Guard against stale asynchronous callbacks if the user rapidly navigated away
        if (isDisposed || currentActiveJobIdRef.current !== activeJobId) {
          return;
        }
        setApplication(updatedApp);
        setApplicationLoading(false);
        setApplicationError(null);
      },
      (err) => {
        if (isDisposed || currentActiveJobIdRef.current !== activeJobId) {
          return;
        }
        console.error("AppliedYet: Application read error:", err);
        setApplicationError(err.message || "Failed to load application status.");
        setApplicationLoading(false);
      }
    );

    return () => {
      isDisposed = true;
      try {
        unsubscribe();
      } catch {
        // Safe cleanup
      }
    };
  }, [user, job?.externalJobId, job?.source]);

  // Core Action: Mark as Applied
  const handleMarkAsApplied = async () => {
    if (!user) {
      setApplicationError("Please sign in with Google to track applications.");
      return;
    }
    if (!job || !job.externalJobId) {
      setApplicationError("No active LinkedIn job detected.");
      return;
    }
    if (isMutating) {
      return;
    }

    const targetJob = job;
    const targetJobId = job.externalJobId;
    setIsMutating(true);
    setApplicationError(null);

    try {
      await markJobAsApplied(user.uid, targetJob);
      // Real-time onSnapshot will update `application` automatically
    } catch (err: unknown) {
      console.error("AppliedYet: Failed to mark job as applied:", err);
      // Only set error if still on the same job
      if (currentActiveJobIdRef.current === targetJobId) {
        const errorMsg = err instanceof Error ? err.message : "Failed to save application to Firestore.";
        setApplicationError(errorMsg);
      }
    } finally {
      setIsMutating(false);
    }
  };

  // Core Action: Undo (Delete application record)
  const handleUndo = async () => {
    if (!user) {
      setApplicationError("Please sign in with Google.");
      return;
    }
    if (!job || !job.externalJobId) {
      return;
    }
    if (isMutating) {
      return;
    }

    const targetJobId = job.externalJobId;
    const targetSource = job.source;
    setIsMutating(true);
    setApplicationError(null);

    try {
      await deleteApplication(user.uid, targetSource, targetJobId);
      // Real-time onSnapshot will set `application` to null automatically
    } catch (err: unknown) {
      console.error("AppliedYet: Failed to undo application:", err);
      if (currentActiveJobIdRef.current === targetJobId) {
        const errorMsg = err instanceof Error ? err.message : "Failed to remove application from Firestore.";
        setApplicationError(errorMsg);
      }
    } finally {
      setIsMutating(false);
    }
  };

  // If authentication state is checking
  if (authLoading) {
    return (
      <div className="w-[360px] min-h-[420px] bg-slate-100/80 text-slate-900 font-sans p-6 flex flex-col items-center justify-center text-center">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-medium text-slate-600">Loading AppliedYet...</p>
      </div>
    );
  }

  return (
    <div className="w-[360px] min-h-[440px] bg-slate-100/70 text-slate-900 font-sans p-4 flex flex-col justify-between select-none">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 leading-none">
                AppliedYet
              </h1>
              <span className="text-[10px] text-slate-500 font-medium tracking-wide">
                LinkedIn Application Tracker
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {user && (
              <button
                onClick={fetchActiveTabJob}
                title="Refresh job details"
                className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-700 transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${jobLoading ? "animate-spin" : ""}`} />
              </button>
            )}

            {user && (
              <button
                onClick={signOutUser}
                title="Sign out"
                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Global Error Banner */}
        {authError && (
          <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-tight">{authError}</span>
            </div>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Unauthenticated View */}
        {!user ? (
          <div className="py-8 px-4 flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <UserIcon className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Sign in to track applications
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
                Sign in with your Google account to sync and remember your applied jobs.
              </p>
            </div>

            {!isConfigured && (
              <div className="w-full text-left p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                <span className="font-semibold block mb-0.5">Firebase Configuration:</span>
                Supply your Firebase Web credentials in environment variables to enable live Google auth.
              </div>
            )}

            <button
              onClick={signInWithGoogle}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2.5 shadow-2xs transition active:scale-[0.99] cursor-pointer"
            >
              {/* Google SVG Icon */}
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        ) : (
          /* Authenticated View */
          <div>
            {/* User Identity pill */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {(user.displayName || user.email || "U")[0].toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-700 truncate">
                  {user.displayName || user.email}
                </span>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                Signed in
              </span>
            </div>

            {/* Job Details & Application Tracker Card */}
            <JobCard
              job={job}
              loading={jobLoading}
              isLinkedInPage={isLinkedInPage}
              onRefresh={fetchActiveTabJob}
              application={application}
              applicationLoading={applicationLoading}
              applicationError={applicationError}
              isMutating={isMutating}
              onMarkApplied={handleMarkAsApplied}
              onUndo={handleUndo}
              onClearError={() => setApplicationError(null)}
            />
          </div>
        )}
      </div>

      {/* Dev preview simulator switch (only shown when not in extension runtime) */}
      {!isExtensionEnv && (
        <div className="mt-4 pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mb-1.5">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" /> Web Preview Test harness
            </span>
            <span className="text-indigo-600 font-semibold">Simulated SPA</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {SAMPLE_MOCK_JOBS.map((mockJob, idx) => (
              <button
                key={mockJob.externalJobId}
                onClick={() => {
                  setJobLoading(true);
                  setTimeout(() => {
                    setJob(mockJob);
                    setJobLoading(false);
                  }, 150);
                }}
                className={`text-[10px] truncate p-1.5 rounded-md border font-medium transition text-left cursor-pointer ${
                  job?.externalJobId === mockJob.externalJobId
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                #{idx + 1} {mockJob.company}
              </button>
            ))}
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Web Dashboard:</span>
            <a
              href="/web.html"
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1"
            >
              Open Web Dashboard &rarr;
            </a>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-4 text-center">
        <p className="text-[10px] text-slate-400">
          AppliedYet &bull; Manifest V3
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PopupContent />
    </AuthProvider>
  );
}
