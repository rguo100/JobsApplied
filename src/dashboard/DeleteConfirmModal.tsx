import React, { useState } from "react";
import { Application } from "../types/application";
import { AlertTriangle, Trash2 } from "lucide-react";

interface DeleteConfirmModalProps {
  application: Application | null;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: (app: Application) => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  application,
  isOpen,
  onCancel,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !application) return null;

  const handleRemove = async () => {
    try {
      setIsDeleting(true);
      await onConfirm(application);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100 transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-headline"
      >
        <div className="flex items-start space-x-4">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="modal-headline"
              className="text-base font-semibold text-gray-900"
            >
              Remove this application from AppliedYet?
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              This will remove{" "}
              <span className="font-medium text-gray-700">
                {application.company || "Unknown Company"}
              </span>{" "}
              —{" "}
              <span className="font-medium text-gray-700">
                {application.title || "Job Title"}
              </span>{" "}
              from your tracked applications.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-xs transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleRemove}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition disabled:opacity-50"
          >
            {isDeleting ? (
              <span>Removing...</span>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Remove</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
