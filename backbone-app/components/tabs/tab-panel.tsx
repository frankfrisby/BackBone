"use client";

import { useState } from "react";
import { useBackbone, type Tab } from "@/lib/backbone-context";
import { signOut } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { User } from "firebase/auth";
import {
  TrendingUp,
  Activity,
  Target,
  BarChart3,
  Calendar,
  DollarSign,
  Phone,
  MessageSquare,
  Ticket,
  X,
  LogOut,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Mail,
  Shield,
  Settings,
} from "lucide-react";

const viewIcons: Record<string, React.ReactNode> = {
  portfolio: <TrendingUp className="h-3.5 w-3.5" />,
  trading: <BarChart3 className="h-3.5 w-3.5" />,
  health: <Activity className="h-3.5 w-3.5" />,
  goals: <Target className="h-3.5 w-3.5" />,
  calendar: <Calendar className="h-3.5 w-3.5" />,
  financial: <DollarSign className="h-3.5 w-3.5" />,
  call: <Phone className="h-3.5 w-3.5" />,
  chat: <MessageSquare className="h-3.5 w-3.5" />,
  ticket: <Ticket className="h-3.5 w-3.5" />,
};

interface TabPanelProps {
  user: User;
  onClose?: () => void;
}

export function TabPanel({ user, onClose }: TabPanelProps) {
  const { state, setActiveTab, removeTab, setPanel, sendMessage } =
    useBackbone();
  const { tabs, activeTab } = state;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/auth/login");
  };

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    setPanel("view");
    onClose?.();
  };

  const handleDelete = (tabId: string) => {
    if (confirmDelete === tabId) {
      removeTab(tabId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(tabId);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const handleQuickAction = (query: string) => {
    sendMessage(query);
    onClose?.();
  };

  // ── Profile Detail View ─────────────────────────────────────

  return (
    <div className="h-full relative overflow-hidden">
      {/* Main sidebar content */}
      <div
        className={`h-full flex flex-col absolute inset-0 transition-transform duration-300 ease-out ${
          showProfile ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        {/* Profile button */}
        <div className="px-4 py-4 border-b border-neutral-800">
          <button
            onClick={() => setShowProfile(true)}
            className="w-full flex items-center gap-3 group"
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-10 w-10 rounded-full flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-neutral-800 border border-neutral-700 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-neutral-200 truncate">
                {user.displayName || "User"}
              </p>
              <p className="text-xs text-neutral-500">BACKBONE Pro</p>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-500 group-hover:text-neutral-300 transition-colors flex-shrink-0" />
          </button>
        </div>

        {/* Tabs list */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="px-4 py-3">
            <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-2">
              Views ({tabs.length})
            </h3>

            {tabs.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-neutral-600">No saved views yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {tabs.map((tab) => {
                  const isActive = activeTab?.id === tab.id;
                  const icon = viewIcons[tab.viewType || tab.type] || (
                    <MessageSquare className="h-3.5 w-3.5" />
                  );

                  return (
                    <div
                      key={tab.id}
                      className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isActive
                          ? "bg-neutral-800 text-neutral-100"
                          : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                      }`}
                      onClick={() => handleTabClick(tab)}
                    >
                      <div
                        className={`flex-shrink-0 ${
                          isActive ? "text-orange-500" : "text-neutral-500"
                        }`}
                      >
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {tab.title}
                        </p>
                        <p className="text-[10px] text-neutral-600">
                          {new Date(tab.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {tab.isLive && (
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot flex-shrink-0" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(tab.id);
                        }}
                        className={`flex-shrink-0 h-5 w-5 flex items-center justify-center rounded transition-colors ${
                          confirmDelete === tab.id
                            ? "bg-red-500/20 text-red-500"
                            : "opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-neutral-400"
                        }`}
                      >
                        {confirmDelete === tab.id ? (
                          <Trash2 className="h-3 w-3" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-4 py-3 border-t border-neutral-800">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              {
                icon: TrendingUp,
                label: "Portfolio",
                query: "Show my portfolio",
              },
              { icon: Activity, label: "Health", query: "How did I sleep?" },
              { icon: Target, label: "Goals", query: "What are my goals?" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => handleQuickAction(item.query)}
                className="flex flex-col items-center gap-1 py-2 rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
              >
                <item.icon className="h-4 w-4" />
                <span className="text-[10px]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Profile detail panel (slides in from right) */}
      <div
        className={`h-full flex flex-col absolute inset-0 bg-neutral-950 transition-transform duration-300 ease-out ${
          showProfile ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Back header */}
        <div className="px-4 py-4 border-b border-neutral-800 flex items-center gap-3">
          <button
            onClick={() => setShowProfile(false)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-sm font-semibold text-neutral-200">Profile</h2>
        </div>

        {/* User info */}
        <div className="px-6 py-6 flex flex-col items-center border-b border-neutral-800">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="h-20 w-20 rounded-full mb-3"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-neutral-800 border border-neutral-700 mb-3 flex items-center justify-center">
              <span className="text-2xl text-neutral-500">
                {(user.displayName || "U")[0]}
              </span>
            </div>
          )}
          <p className="text-lg font-semibold text-neutral-100">
            {user.displayName || "User"}
          </p>
          <p className="text-xs text-neutral-500 mt-1">{user.email}</p>
        </div>

        {/* Info items */}
        <div className="flex-1 px-4 py-4 space-y-1 overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-neutral-900 transition-colors">
            <Mail className="h-4 w-4 text-neutral-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-neutral-500 uppercase">Email</p>
              <p className="text-sm text-neutral-200 truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-neutral-900 transition-colors">
            <Shield className="h-4 w-4 text-neutral-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-neutral-500 uppercase">Account</p>
              <p className="text-sm text-neutral-200">BACKBONE Pro</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-neutral-900 transition-colors">
            <Settings className="h-4 w-4 text-neutral-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-neutral-500 uppercase">
                User ID
              </p>
              <p className="text-sm text-neutral-200 font-mono truncate">
                {user.uid.slice(0, 16)}...
              </p>
            </div>
          </div>
        </div>

        {/* Sign out */}
        <div className="px-4 py-4 border-t border-neutral-800">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-red-400 hover:bg-red-950/30 hover:border-red-900/50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
