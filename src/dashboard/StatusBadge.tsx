import React, { useState } from "react";
import { ApplicationStatus } from "../types/application";

interface StatusBadgeProps {
  status: ApplicationStatus;
  onStatusChange?: (newStatus: ApplicationStatus) => Promise<void>;
  disabled?: boolean;
}

const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  applied: {
    label: "Applied",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  saved: {
    label: "Saved",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
  },
  interview: {
    label: "Interview",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  offer: {
    label: "Offer",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  rejected: {
    label: "Rejected",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
};

const ALL_STATUSES: ApplicationStatus[] = [
  "applied",
  "saved",
  "interview",
  "offer",
  "rejected",
];

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  onStatusChange,
  disabled = false,
}) => {
  const [updating, setUpdating] = useState(false);
  const config = STATUS_CONFIG[status] || {
    label: status,
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
  };

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as ApplicationStatus;
    if (nextStatus === status || !onStatusChange) return;

    try {
      setUpdating(true);
      await onStatusChange(nextStatus);
    } finally {
      setUpdating(false);
    }
  };

  if (!onStatusChange) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
      >
        {config.label}
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      <select
        value={status}
        disabled={disabled || updating}
        onChange={handleChange}
        className={`appearance-none text-xs font-medium px-2.5 py-1 pr-6 rounded-full border cursor-pointer transition focus:outline-hidden focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed ${config.bg} ${config.text} ${config.border}`}
        title="Click to change application status"
      >
        {ALL_STATUSES.map((st) => (
          <option key={st} value={st} className="bg-white text-gray-800">
            {STATUS_CONFIG[st].label}
          </option>
        ))}
      </select>
      {/* Down arrow icon */}
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
        <svg
          className={`w-3 h-3 ${config.text}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </div>
  );
};
