import React, { useState } from "react";
import { User } from "firebase/auth";
import { LogOut, Briefcase, Check, Copy } from "lucide-react";

interface HeaderProps {
  user: User;
  onSignOut: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({ user, onSignOut }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyUid = () => {
    if (user.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center text-white shadow-sm">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">
                AppliedYet
              </h1>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Job Application Tracker
              </p>
            </div>
          </div>

          {/* User profile & Sign Out */}
          <div className="flex items-center space-x-4">
            {/* UID verification badge for Day 5 acceptance test */}
            <div
              onClick={handleCopyUid}
              title="Click to copy Firebase UID for manual verification"
              className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs font-mono cursor-pointer transition"
            >
              <span>UID: {user.uid.slice(0, 8)}...</span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-400" />
              )}
            </div>

            <div className="flex items-center space-x-2.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayName}
                  className="w-8 h-8 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 border border-violet-200 flex items-center justify-center font-semibold text-xs">
                  {userInitial}
                </div>
              )}
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-gray-800 leading-tight">
                  {displayName}
                </p>
                <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[150px]">
                  {user.email}
                </p>
              </div>
            </div>

            <button
              onClick={onSignOut}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 shadow-xs transition"
            >
              <LogOut className="w-3.5 h-3.5 text-gray-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
