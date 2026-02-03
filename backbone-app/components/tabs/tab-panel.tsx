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

  return (
    <div className="h-full relative overflow-hidden">
      {/* ── Main Sidebar ──────────────────────────────────────── */}
      <div
        className={`h-full flex flex-col absolute inset-0 transition-transform duration-300 ${
          showProfile ? "-translate-x-full" : "translate-x-0"
        }`}
        style={{ transitionTimingFunction: "var(--ease-spring)" }}
      >
        {/* Profile button */}
        <div className="px-4 py-4 border-b border-[#1a1a1a]">
          <button
            onClick={() => setShowProfile(true)}
            className="w-full flex items-center gap-3 group active:scale-[0.98] transition-transform"
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-10 w-10 rounded-full flex-shrink-0 ring-1 ring-[#222]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-[#111] border border-[#1f1f1f] flex items-center justify-center flex-shrink-0">
                <span className="text-[14px] text-neutral-400 font-medium">
                  {(user.displayName || "U")[0]}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-semibold text-neutral-200 truncate">
                {user.displayName || "User"}
              </p>
              <p className="text-[11px] text-neutral-600">BACKBONE Pro</p>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-600 group-hover:text-neutral-400 transition-colors flex-shrink-0" />
          </button>
        </div>

        {/* Tabs list */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium">
                Views
              </h3>
              <span className="text-[11px] text-neutral-600 tabular-nums">
                {tabs.length}
              </span>
            </div>

            {tabs.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[11px] text-neutral-700">
                  No saved views yet
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {tabs.map((tab) => {
                  const isActive = activeTab?.id === tab.id;
                  const icon = viewIcons[tab.viewType || tab.type] || (
                    <MessageSquare className="h-3.5 w-3.5" />
                  );

                  return (
                    <div
                      key={tab.id}
                      className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                        isActive
                          ? "bg-[#1a1a1a] text-white"
                          : "text-neutral-400 hover:bg-[#111] hover:text-neutral-200"
                      }`}
                      onClick={() => handleTabClick(tab)}
                    >
                      <div
                        className={`flex-shrink-0 ${
                          isActive ? "text-orange-500" : "text-neutral-600"
                        }`}
                      >
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">
                          {tab.title}
                        </p>
                        <p className="text-[10px] text-neutral-700 tabular-nums">
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
                        className={`flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-lg transition-all ${
                          confirmDelete === tab.id
                            ? "bg-red-500/10 text-red-400"
                            : "opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-neutral-400 hover:bg-[#1a1a1a]"
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
        <div className="px-4 py-3 border-t border-[#1a1a1a]">
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
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl text-neutral-600 hover:bg-[#111] hover:text-neutral-400 transition-all active:scale-95"
              >
                <item.icon className="h-4 w-4" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Profile Detail Panel ──────────────────────────────── */}
      <div
        className={`h-full flex flex-col absolute inset-0 bg-black transition-transform duration-300 ${
          showProfile ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-spring)" }}
      >
        {/* Back header */}
        <div className="px-4 py-4 border-b border-[#1a1a1a] flex items-center gap-3">
          <button
            onClick={() => setShowProfile(false)}
            className="h-8 w-8 flex items-center justify-center rounded-xl text-neutral-500 hover:bg-[#111] hover:text-neutral-300 transition-all active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-[13px] font-semibold text-neutral-200 tracking-wide">
            Profile
          </h2>
        </div>

        {/* User info hero */}
        <div className="px-6 py-8 flex flex-col items-center border-b border-[#1a1a1a] gradient-hero">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="h-20 w-20 rounded-full mb-4 ring-2 ring-[#222]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-[#111] border border-[#1f1f1f] mb-4 flex items-center justify-center">
              <span className="text-[28px] text-neutral-500 font-medium">
                {(user.displayName || "U")[0]}
              </span>
            </div>
          )}
          <p className="text-[18px] font-semibold text-white tracking-tight">
            {user.displayName || "User"}
          </p>
          <p className="text-[12px] text-neutral-500 mt-1">{user.email}</p>
        </div>

        {/* Info items */}
        <div className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
          {[
            {
              icon: Mail,
              label: "Email",
              value: user.email || "N/A",
              color: "text-blue-400",
              bg: "bg-blue-500/10",
            },
            {
              icon: Shield,
              label: "Account",
              value: "BACKBONE Pro",
              color: "text-orange-400",
              bg: "bg-orange-500/10",
            },
            {
              icon: Settings,
              label: "User ID",
              value: `${user.uid.slice(0, 16)}...`,
              color: "text-neutral-400",
              bg: "bg-[#1a1a1a]",
              mono: true,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-[#111] transition-colors"
            >
              <div
                className={`h-9 w-9 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}
              >
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-neutral-600 uppercase tracking-wider">
                  {item.label}
                </p>
                <p
                  className={`text-[13px] text-neutral-200 truncate ${
                    item.mono ? "font-mono" : ""
                  }`}
                >
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Sign out */}
        <div className="px-4 py-4 border-t border-[#1a1a1a]">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-[#111] border border-[#1f1f1f] text-red-400 hover:bg-red-950/20 hover:border-red-900/30 transition-all active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-[13px] font-semibold">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
