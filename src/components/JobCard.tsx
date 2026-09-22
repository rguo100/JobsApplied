import React, { useState } from "react";
import { Job } from "../types/job";
import { Briefcase, Building2, MapPin, Hash, CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";

interface JobCardProps {
  job: Job | null;
  loading: boolean;
  isLinkedInPage: boolean;
  onRefresh: () => void;
}

export const JobCard: React.FC<JobCardProps> = ({ job, loading, isLinkedInPage, onRefresh }) => {
  const [markedFeedback, setMarkedFeedback] = useState(false);

  const handleMarkAsApplied = () => {
    // Day 1 MVP specification: The button should NOT persist anything yet.
    setMarkedFeedback(true);
    setTimeout(() => {
      setMarkedFeedback(false);
    }, 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium text-slate-600">Detecting LinkedIn job details...</p>
      </div>
    );
  }

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
          className="text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg shadow-2xs transition"
        >
          Check Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* Status Section */}
      <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase text-slate-400 tracking-wider">Status</div>
          <div className="text-sm font-semibold text-slate-700 mt-0.5">Not tracked</div>
        </div>
        <div className="px-2.5 py-1 bg-slate-200/80 text-slate-600 text-xs font-medium rounded-full">
          Day 1 MVP
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-1">
        <button
          onClick={handleMarkAsApplied}
          className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm ${
            markedFeedback
              ? "bg-emerald-600 text-white shadow-emerald-200"
              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 active:scale-[0.99]"
          }`}
        >
          {markedFeedback ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Marked (Not Saved Yet)</span>
            </>
          ) : (
            <>
              <Briefcase className="w-4 h-4" />
              <span>Mark as Applied</span>
            </>
          )}
        </button>
        {markedFeedback && (
          <p className="text-[11px] text-center text-slate-500 mt-1.5">
            Note: Persistence is scheduled for subsequent iterations.
          </p>
        )}
      </div>
    </div>
  );
};
