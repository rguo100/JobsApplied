import React from "react";
import { Briefcase } from "lucide-react";

interface SummaryCardsProps {
  totalCount: number;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ totalCount }) => {
  return (
    <div className="mb-6">
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-xs max-w-xs">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Applications
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {totalCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
};
