import React from "react";
import { Briefcase, Send, Users, XCircle, Award } from "lucide-react";
import { SummaryCounts } from "./utils/dashboardFilter";

interface SummaryCardsProps {
  counts: SummaryCounts;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ counts }) => {
  const cards = [
    {
      label: "Total",
      count: counts.total,
      icon: Briefcase,
      colorBg: "bg-violet-50",
      colorText: "text-violet-600",
      borderColor: "border-gray-200",
    },
    {
      label: "Applied",
      count: counts.applied,
      icon: Send,
      colorBg: "bg-blue-50",
      colorText: "text-blue-600",
      borderColor: "border-gray-200",
    },
    {
      label: "Interview",
      count: counts.interview,
      icon: Users,
      colorBg: "bg-amber-50",
      colorText: "text-amber-600",
      borderColor: "border-gray-200",
    },
    {
      label: "Rejected",
      count: counts.rejected,
      icon: XCircle,
      colorBg: "bg-rose-50",
      colorText: "text-rose-600",
      borderColor: "border-gray-200",
    },
    {
      label: "Offer",
      count: counts.offer,
      icon: Award,
      colorBg: "bg-emerald-50",
      colorText: "text-emerald-600",
      borderColor: "border-gray-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((card) => {
        const IconComponent = card.icon;
        return (
          <div
            key={card.label}
            className={`bg-white rounded-xl border ${card.borderColor} p-4 shadow-xs flex items-center justify-between transition hover:shadow-sm`}
          >
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {card.label}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {card.count}
              </p>
            </div>
            <div
              className={`w-10 h-10 rounded-xl ${card.colorBg} ${card.colorText} flex items-center justify-center shrink-0`}
            >
              <IconComponent className="w-5 h-5" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
