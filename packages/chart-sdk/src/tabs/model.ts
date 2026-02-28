export type TabKind = "chart" | "orderbook" | "alerts" | "custom";

export interface TabInstance {
  id: string;
  title: string;
  kind: TabKind;
  closable?: boolean;
}

export interface TabGroup {
  id: string;
  tabs: TabInstance[];
  activeTabId: string;
}

export function activateTab(group: TabGroup, tabId: string): TabGroup {
  if (!group.tabs.some((tab) => tab.id === tabId)) {
    return group;
  }
  return { ...group, activeTabId: tabId };
}
