"use client";

import { useState } from "react";
import { useBackbone, type Tab } from "@/lib/backbone-context";
import { signOut } from "@/lib/firebase";
import { useRouter } from "next/navigation";
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
  User,
  Trash2,
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

export function TabPanel() {
  const { state, setActiveTab, removeTab, setPanel } = useBackbone();
  const { tabs, activeTab } = state;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/auth/login");
  };

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    setPanel("view");
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

  return (
    <div className="h-full flex flex-col">
      {/* Profile section */}
      <div className="px-4 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center">
            <User className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-200 truncate">
              User
            </p>
            <p className="text-xs text-neutral-500">BACKBONE Pro</p>
          </div>
          <button
            onClick={handleSignOut}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-500 hover:text-red-500 hover:bg-neutral-800 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="px-4 py-3">
          <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-2">
            Views ({tabs.length})
          </h3>

          {tabs.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-neutral-600">
                No saved views yet
              </p>
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
                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 ${
                        isActive ? "text-orange-500" : "text-neutral-500"
                      }`}
                    >
                      {icon}
                    </div>

                    {/* Title */}
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

                    {/* Live indicator */}
                    {tab.isLive && (
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot flex-shrink-0" />
                    )}

                    {/* Delete */}
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
            { icon: TrendingUp, label: "Portfolio", query: "Show my portfolio" },
            { icon: Activity, label: "Health", query: "How did I sleep?" },
            { icon: Target, label: "Goals", query: "What are my goals?" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                // This would need sendMessage but we'd need it from context
                // For now it just sets the view panel
                setPanel("view");
              }}
              className="flex flex-col items-center gap-1 py-2 rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
            >
              <item.icon className="h-4 w-4" />
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
