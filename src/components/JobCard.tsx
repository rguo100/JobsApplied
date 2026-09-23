import React, { useEffect, useState } from "react";
import { Job } from "../types/job";
import { Application } from "../types/application";
import {
  Briefcase,
  Building2,
  MapPin,
  Hash,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { Timestamp } from "firebase/firestore";

interface JobCardProps {
  job: Job | null;
  loading: boolean;
  isLinkedInPage: boolean;
  onRefresh: () => void;
  // Day 3 Application tracking state
  application: Application | null;
  applicationLoading: boolean;
  applicationError: string | null;
  isMutating: boolean;
  onMarkApplied: () => Promise<void>;
  onUndo: () => Promise<void>;
  onClearError?: () => void;
}

/**
 * Formats a Firestore Timestamp into a human-readable date (e.g., "Sep 23, 2026").
 */
function formatApplicationDate(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return "Today";
  try {
    const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date();
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Today";
  }
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  loading,
  isLinkedInPage,
  onRefresh,
  application,
  applicationLoading,
  applicationError,
  isMutating,
  onMarkApplied,
  onUndo,
  onClearError,
}) => {
  const [confirmingUndo, setConfirmingUndo] = useState<boolean>(false);

  useEffect(() => {
    setConfirmingUndo(false);
  }, [job?.source, job?.externalJobId]);

  // If job is loading from tab
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium text-slate-600">Detecting LinkedIn job details...</p>
      </div>
    );
  }

  // If no job is detected
  if (!job) {
    return (
      <div className="p-4 text-center bg-slate-50 border border-slate-200 rounded-xl my-2">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-slate-800 mb-1">
          Open a LinkedIn job to get started
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          {isLinkedInPage
            ? "Select or navigate to a specific job posting on LinkedIn to inspect."
            : "Navigate to linkedin.com/jobs to view and track your applications."}
        </p>
        <button
          onClick={onRefresh}
          className="text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg shadow-2xs transition cursor-pointer"
        >
          Check Again
        </button>
      </div>
    );
  }

  const isApplied = application?.status === "applied";

  return (
    <div className="space-y-3.5">
      {/* Job Details Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3.5">
        {/* Company & Title */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
            <Building2 className="w-3.5 h-3.5" />
            <span className="truncate">{job.company}</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 leading-snug break-words">
            {job.title}
          </h2>
        </div>

        {/* Location & Job ID */}
        <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{job.location}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-mono text-slate-500">ID: {job.externalJobId}</span>
            </div>
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 text-[11px] font-medium"
              >
                <span>View</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Firestore Error Alert */}
      {applicationError && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-tight">
              <span className="font-semibold block">Firestore Error:</span>
              <span>{applicationError}</span>
            </div>
          </div>
          {onClearError && (
            <button
              onClick={onClearError}
              className="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer"
              title="Dismiss"
            >
              &times;
            </button>
          )}
        </div>
      )}

      {/* Status Section */}
      <div
        className={`rounded-xl p-3.5 border transition-all ${
          applicationLoading
            ? "bg-slate-50 border-slate-200"
            : isApplied
            ? "bg-emerald-50/90 border-emerald-200"
            : "bg-slate-50 border-slate-200/80"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Status
            </div>
            {applicationLoading ? (
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 mt-0.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                <span>Checking status...</span>
              </div>
            ) : isApplied ? (
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-800 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Applied</span>
                </div>
                <div className="text-xs text-emerald-700 font-medium mt-0.5">
                  {formatApplicationDate(application.appliedAt)}
                </div>
              </div>
            ) : (
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                Not applied
              </div>
            )}
          </div>

          <div>
            {isApplied ? (
              <span className="px-2 py-0.5 bg-emerald-100/80 text-emerald-800 text-[11px] font-semibold rounded-full border border-emerald-200">
                Tracked
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-200/80 text-slate-600 text-[11px] font-medium rounded-full">
                Not tracked
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions Section */}
      <div className="pt-1">
        {isApplied ? (
          /* Applied State: Shows Undo Button with inline confirmation */
          confirmingUndo ? (
            <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3 space-y-2.5">
              <p className="text-xs text-rose-800 font-medium text-center">
                Remove this application from your tracker?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={async () => {
                    await onUndo();
                    setConfirmingUndo(false);
                  }}
                  className="py-2 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isMutating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Removing...</span>
                    </>
                  ) : (
                    <span>Yes, Remove</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => setConfirmingUndo(false)}
                  className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={isMutating || applicationLoading}
              onClick={() => setConfirmingUndo(true)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 transition-all shadow-2xs active:scale-[0.99] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Undo</span>
            </button>
          )
        ) : (
          /* Not Applied State: Shows Mark as Applied */
          <button
            type="button"
            disabled={isMutating || applicationLoading}
            onClick={onMarkApplied}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-sm shadow-indigo-200 transition-all active:scale-[0.99] cursor-pointer"
          >
            {isMutating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving application...</span>
              </>
            ) : (
              <>
                <Briefcase className="w-4 h-4" />
                <span>Mark as Applied</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
