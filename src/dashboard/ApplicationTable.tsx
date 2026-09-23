import React from "react";
import { Application, ApplicationStatus } from "../types/application";
import { StatusBadge } from "./StatusBadge";
import { formatApplicationDate } from "./utils/formatApplicationDate";
import { ExternalLink, Trash2 } from "lucide-react";

interface ApplicationTableProps {
  applications: Application[];
  onStatusChange: (app: Application, newStatus: ApplicationStatus) => Promise<void>;
  onRequestDelete: (app: Application) => void;
}

function formatSource(source?: string): string {
  if (!source) return "—";
  if (source.toLowerCase() === "linkedin") return "LinkedIn";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export const ApplicationTable: React.FC<ApplicationTableProps> = ({
  applications,
  onStatusChange,
  onRequestDelete,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-medium text-xs uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-6 py-3.5">
                Company
              </th>
              <th scope="col" className="px-6 py-3.5">
                Job Title
              </th>
              <th scope="col" className="px-6 py-3.5">
                Location
              </th>
              <th scope="col" className="px-6 py-3.5">
                Status
              </th>
              <th scope="col" className="px-6 py-3.5">
                Applied Date
              </th>
              <th scope="col" className="px-6 py-3.5">
                Source
              </th>
              <th scope="col" className="px-6 py-3.5 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {applications.map((app) => {
              const rowKey = `${app.source}_${app.externalJobId}`;
              const formattedDate = formatApplicationDate(app.appliedAt);

              return (
                <tr
                  key={rowKey}
                  className="hover:bg-gray-50/80 transition-colors"
                >
                  {/* Company */}
                  <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                    {app.company || "—"}
                  </td>

                  {/* Job Title */}
                  <td className="px-6 py-4 text-gray-800 font-medium">
                    {app.title || "—"}
                  </td>

                  {/* Location */}
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {app.location || "—"}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge
                      status={app.status}
                      onStatusChange={(newStatus) => onStatusChange(app, newStatus)}
                    />
                  </td>

                  {/* Applied Date */}
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {formattedDate}
                  </td>

                  {/* Source */}
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {formatSource(app.source)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    {app.url ? (
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition"
                        title="Open original job posting in a new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Job</span>
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}

                    <button
                      type="button"
                      onClick={() => onRequestDelete(app)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-gray-200 hover:border-rose-200 transition"
                      title="Remove application"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
