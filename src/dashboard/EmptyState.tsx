import React from "react";
import { Inbox, AlertCircle, RefreshCw, SearchX, FilterX } from "lucide-react";

interface EmptyStateProps {
  type?: "error" | "empty_database" | "empty_filter";
  error?: string | null;
  onRetry?: () => void;
  onClearFilters?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = "empty_database",
  error,
  onRetry,
  onClearFilters,
}) => {
  // Error state
  if (type === "error" || error) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">
          Unable to load applications
        </h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
          {error || "An unexpected error occurred while synchronizing your applications. Please try again."}
        </p>
        {onRetry && (
          <div className="mt-6">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg shadow-xs transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Case B: Applications exist but the current search/filter returns zero results
  if (type === "empty_filter") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <SearchX className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">
          No applications match your filters.
        </h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
          Try adjusting your search terms, changing the status filter, or clearing all filters to see your jobs.
        </p>
        {onClearFilters && (
          <div className="mt-6">
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg shadow-xs transition cursor-pointer"
            >
              <FilterX className="w-4 h-4" />
              <span>Clear filters</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Case A: User has zero applications in their account
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
      <div className="w-12 h-12 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-4">
        <Inbox className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">
        No applications yet.
      </h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
        Use the AppliedYet Chrome extension while browsing LinkedIn to start tracking jobs.
      </p>
    </div>
  );
};
