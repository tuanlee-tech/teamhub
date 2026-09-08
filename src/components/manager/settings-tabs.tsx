"use client";

import { useState, type ReactNode } from "react";

type SettingsTab = {
  id: string;
  label: string;
  description: string;
  content: ReactNode;
};

export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  return (
    <div className="space-y-5">
      <div aria-label="Nhóm cấu hình" className="grid gap-2 rounded-2xl border border-[var(--line)] bg-[rgba(255,253,247,0.7)] p-2 sm:grid-cols-3" data-tour="settings-tabs" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              aria-controls={`settings-panel-${tab.id}`}
              aria-selected={isActive}
              className={`rounded-xl px-4 py-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)] ${
                isActive
                  ? "bg-[var(--ink)] text-white shadow-[0_4px_0_rgba(16,42,44,0.28)]"
                  : "text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]"
              }`}
              id={`settings-tab-${tab.id}`}
              data-tour={`settings-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              tabIndex={0}
              type="button"
            >
              <span className="block text-sm font-black">{tab.label}</span>
              <span className={`mt-1 block text-xs ${isActive ? "text-white/75" : "text-[var(--ink-soft)]"}`}>{tab.description}</span>
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          aria-labelledby={`settings-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          id={`settings-panel-${tab.id}`}
          key={tab.id}
          role="tabpanel"
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
