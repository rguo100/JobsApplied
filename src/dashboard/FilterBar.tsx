import React from "react";
import { Search, X, Filter, ArrowUpDown } from "lucide-react";
import { ApplicationStatus } from "../types/application";
import { SortOption } from "./utils/dashboardFilter";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: ApplicationStatus | "all";
  onStatusChange: (status: ApplicationStatus | "all") => void;
  companyFilter: string;
  onCompanyChange: (company: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  companies: string[];
  totalCount: number;
  filteredCount: number;
  onClearFilters: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  companyFilter,
  onCompanyChange,
  sortBy,
  onSortChange,
  companies,
  totalCount,
  filteredCount,
  onClearFilters,
}) => {
  const isFiltered =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    companyFilter !== "all" ||
    sortBy !== "newest";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs mb-6 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Search Box */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by company or job title..."
            className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdowns Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="relative min-w-[130px]">
            <select
              value={statusFilter}
              onChange={(e) => onStatusChange(e.target.value as ApplicationStatus | "all")}
              className="w-full appearance-none pl-3 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-violet-500 transition cursor-pointer"
              title="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="applied">Applied</option>
              <option value="interview">Interview</option>
              <option value="rejected">Rejected</option>
              <option value="offer">Offer</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400">
              <Filter className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Company Filter */}
          <div className="relative min-w-[150px]">
            <select
              value={companyFilter}
              onChange={(e) => onCompanyChange(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-violet-500 transition cursor-pointer"
              title="Filter by company"
            >
              <option value="all">All Companies</option>
              {companies.map((comp) => (
                <option key={comp} value={comp}>
                  {comp}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>

          {/* Sort Option */}
          <div className="relative min-w-[130px]">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="w-full appearance-none pl-3 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-violet-500 transition cursor-pointer"
              title="Sort applications"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="company_asc">Company A–Z</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400">
              <ArrowUpDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Clear Filters Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center space-x-1 px-3 py-2 text-sm font-medium text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-200 transition"
              title="Reset all filters and search"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Showing count indicator when filters are active */}
      {isFiltered && (
        <div className="text-xs text-gray-500 pt-1 flex items-center justify-between border-t border-gray-100">
          <span>
            Showing <strong className="text-gray-800 font-semibold">{filteredCount}</strong> of{" "}
            <strong className="text-gray-800 font-semibold">{totalCount}</strong> applications
          </span>
          <span className="text-[11px] text-gray-400">
            {searchQuery ? `Search: "${searchQuery}" • ` : ""}
            {statusFilter !== "all" ? `Status: ${statusFilter} • ` : ""}
            {companyFilter !== "all" ? `Company: ${companyFilter} • ` : ""}
            Sort: {sortBy === "newest" ? "Newest" : sortBy === "oldest" ? "Oldest" : "Company A-Z"}
          </span>
        </div>
      )}
    </div>
  );
};
