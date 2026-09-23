import React from "react";
import { Inbox, AlertCircle, RefreshCw } from "lucide-react";

interface EmptyStateProps {
  onRetry?: () => void;
  error?: string | null;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onRetry, error }) => {
  if (error) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">
          Unable to load applications.
        </h3>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
          {error}
        </p>
        {onRetry && (
          <div className="mt-5">
            <button
              onClick={onRetry}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg shadow-xs transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
      <div className="w-12 h-12 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-4">
        <Inbox className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">
        No applications yet.
      </h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
        Jobs you mark as applied with the AppliedYet Chrome Extension will appear
        here automatically.
      </p>
    </div>
  );
};
