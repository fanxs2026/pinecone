'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface EntityTabsProps {
  tabs: Tab[];
  defaultTab?: string;
  children?: React.ReactNode;
  tabContents: Record<string, React.ReactNode>;
}

export default function EntityTabs({ tabs, defaultTab, children, tabContents }: EntityTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = searchParams.get('tab') || defaultTab || tabs[0]?.id;

  const setTab = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tabId === defaultTab || tabId === tabs[0]?.id) {
      params.delete('tab');
    } else {
      params.set('tab', tabId);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div>
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-6" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: '#2f7d3a' }}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      <div className="py-4">
        {tabs.map((tab) => (
          <div key={tab.id} role="tabpanel" hidden={activeTab !== tab.id}>
            {activeTab === tab.id ? (tabContents[tab.id] ?? children) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
