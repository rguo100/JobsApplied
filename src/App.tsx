import { useState, useEffect, useCallback } from "react";
import { Job, ExtensionMessage } from "./types/job";
import { JobCard } from "./components/JobCard";
import { BookmarkCheck, RefreshCw, Layers } from "lucide-react";

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

export default function App() {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLinkedInPage, setIsLinkedInPage] = useState<boolean>(false);
  const [isExtensionEnv, setIsExtensionEnv] = useState<boolean>(false);

  // Function to fetch active job from active tab
  const fetchActiveTabJob = useCallback(() => {
    setLoading(true);

    try {
      // Detect if running inside Chrome Extension environment with active tab access
      if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
        setIsExtensionEnv(true);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime?.lastError || !tabs || tabs.length === 0) {
            setLoading(false);
            setIsLinkedInPage(false);
            setJob(null);
            return;
          }

          const activeTab = tabs[0];
          if (!activeTab || !activeTab.id || !activeTab.url) {
            setLoading(false);
            setIsLinkedInPage(false);
            setJob(null);
            return;
          }

          const onLinkedIn = activeTab.url.includes("linkedin.com/jobs");
          setIsLinkedInPage(onLinkedIn);

          if (!onLinkedIn) {
            setLoading(false);
            setJob(null);
            return;
          }

          // Request job from the content script safely
          try {
            chrome.tabs.sendMessage(
              activeTab.id,
              { type: "GET_CURRENT_JOB" } as ExtensionMessage,
              (response) => {
                setLoading(false);
                // Check if lastError exists (e.g. content script not ready or page refreshed)
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
            setLoading(false);
            setJob(null);
          }
        });
      } else {
        // Running in web dev preview mode
        setIsExtensionEnv(false);
        setIsLinkedInPage(true);
        setTimeout(() => {
          setJob((prev) => prev || SAMPLE_MOCK_JOBS[0]);
          setLoading(false);
        }, 300);
      }
    } catch {
      setLoading(false);
      setJob(null);
    }
  }, []);

  useEffect(() => {
    fetchActiveTabJob();

    // Listen for real-time SPA job updates from content script
    try {
      if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
        const listener = (message: ExtensionMessage) => {
          if (message && message.type === "JOB_UPDATED") {
            setJob(message.job);
            setLoading(false);
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

  return (
    <div className="w-[360px] min-h-[420px] bg-slate-100/70 text-slate-900 font-sans p-4 flex flex-col justify-between select-none">
      {/* Header */}
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
          <button
            onClick={fetchActiveTabJob}
            title="Refresh job details"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Main Job Card */}
        <JobCard
          job={job}
          loading={loading}
          isLinkedInPage={isLinkedInPage}
          onRefresh={fetchActiveTabJob}
        />
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
                  setLoading(true);
                  setTimeout(() => {
                    setJob(mockJob);
                    setLoading(false);
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
        </div>
      )}

      {/* Footer */}
      <footer className="mt-4 text-center">
        <p className="text-[10px] text-slate-400">
          AppliedYet MVP &bull; Manifest V3
        </p>
      </footer>
    </div>
  );
}
