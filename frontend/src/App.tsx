import React, { useCallback, useEffect, useState } from "react";

type LinkTile = {
  name: string;
  description: string;
  url: string;
  tag?: string;
};

type DiskSnapshot = {
  percent: number | null;
  usedGb: number | null;
  totalGb: number | null;
  freeGb: number | null;
};

type HomelabStatus = {
  cpuUsage: number | null;
  memoryUsage: number | null;
  dockerContainersUp: number | null;
  dockerContainersTotal: number | null;
  diskRoot: DiskSnapshot;
  diskData: DiskSnapshot;
  diskBackup: DiskSnapshot;
  lastUpdated: string | null;
};

type PortMapping = {
  ip: string | null;
  private: number | null;
  public: number | null;
  type: string | null;
};

type ContainerInfo = {
  id: string;
  name: string;
  image: string;
  state: string | null;
  status: string | null;
  created: string | null;
  ports: PortMapping[];
};

type QuickAction = {
  title: string;
  desc: string;
  href: string;
};

type ServiceGroup = {
  label: string;
  items: LinkTile[];
};

type ContentConfig = {
  title: string;
  environment: string;
  metaBadges: string[];
  footerNote?: string;
  statusApi: string;
  containersApi: string;
  quickActions: QuickAction[];
  serviceGroups: ServiceGroup[];
  layoutSections?: string[];
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://192.168.2.174:3005";

const coreServices: LinkTile[] = [
  {
    name: "Home Assistant",
    description: "Styr lampor, sensorer och automationer.",
    url: "http://192.168.2.174:8123",
    tag: "Smarta hemmet",
  },
  {
    name: "Grafana",
    description: "Dashboards för servrar, containrar och loggar.",
    url: "http://192.168.2.174:3000",
    tag: "Monitoring",
  },
  {
    name: "Portainer",
    description: "Hantera Docker-containrar och stacks.",
    url: "https://192.168.2.174:9443",
    tag: "Docker",
  },
  {
    name: "Nextcloud",
    description: "Filer, kalendrar och delning.",
    url: "http://192.168.2.174:8080",
    tag: "Filer",
  },
];

const infraServices: LinkTile[] = [
  {
    name: "Pi-hole",
    description: "DNS-filter och nätverksöversikt.",
    url: "http://192.168.2.174/admin",
    tag: "Nätverk",
  },
  {
    name: "Joplin Server",
    description: "Anteckningar, dokumentation och to-do.",
    url: "http://192.168.2.174:22300",
    tag: "Notes",
  },
  {
    name: "Homarr",
    description: "Alternativ dashboard och länksamling.",
    url: "http://192.168.2.174:7575",
    tag: "Dashboard",
  },
];

const defaultContent: ContentConfig = {
  title: "Homelab Portal",
  environment: "PROD – knox",
  metaBadges: ["Ubuntu 24.04", "Docker + Portainer"],
  footerNote: "Byggd av Kingen",
  statusApi: `${API_BASE}/status`,
  containersApi: `${API_BASE}/containers`,
  layoutSections: ["status", "actions", "widgets", "apps", "events"],
  quickActions: [
    {
      title: "Portainer",
      desc: "Hantera containrar & stacks",
      href: "https://192.168.2.174:9443",
    },
    {
      title: "Loggar (Loki)",
      desc: "Utforska container-loggar",
      href: "http://192.168.2.174:3100",
    },
    {
      title: "Dashboards",
      desc: "Grafana övervakning",
      href: "http://192.168.2.174:3000",
    },
    {
      title: "Quiz stack",
      desc: "Restart via Portainer",
      href: "https://192.168.2.174:9443",
    },
  ],
  serviceGroups: [
    { label: "Kärntjänster", items: coreServices },
    { label: "Infrastruktur", items: infraServices },
  ],
};

function useContentConfig() {
  const [content, setContent] = useState<ContentConfig>(defaultContent);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/content`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Misslyckades att hämta innehåll");
      }
      const data = await res.json();
      setContent({ ...defaultContent, ...data });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Misslyckades att hämta innehåll";
      setError(message);
      setContent(defaultContent);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const save = useCallback(
    async (nextContent: ContentConfig, adminKey: string) => {
      if (!adminKey) {
        return { ok: false, error: "Ange admin-nyckel (x-admin-key)" };
      }

      try {
        const res = await fetch(`${API_BASE}/content`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify(nextContent),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            error: payload?.error || "Misslyckades att spara innehåll",
          };
        }

        setContent({ ...defaultContent, ...payload });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: "Nätverksfel vid sparning",
        };
      }
    },
    []
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { content, setContent, isLoading, error, reload, save };
}

function useHomelabStatus(apiUrl: string) {
  const buildDisk = (disk?: DiskSnapshot | null): DiskSnapshot => ({
    percent: disk?.percent ?? null,
    usedGb: disk?.usedGb ?? null,
    totalGb: disk?.totalGb ?? null,
    freeGb: disk?.freeGb ?? null,
  });

  const [status, setStatus] = useState<HomelabStatus>({
    cpuUsage: null,
    memoryUsage: null,
    dockerContainersUp: null,
    dockerContainersTotal: null,
    diskRoot: buildDisk(),
    diskData: buildDisk(),
    diskBackup: buildDisk(),
    lastUpdated: null,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;

    async function fetchStatus() {
      try {
        setIsLoading(true);
        setIsError(false);

        const res = await fetch(apiUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("API error");

        const data = await res.json();

        if (!alive) return;

        setStatus({
          cpuUsage: data.cpuUsage ?? null,
          memoryUsage: data.memoryUsage ?? null,
          dockerContainersUp: data.dockerContainersUp ?? null,
          dockerContainersTotal: data.dockerContainersTotal ?? null,
          diskRoot: buildDisk(
            data.diskRoot ?? {
              percent: data.diskUsageRoot ?? null,
            }
          ),
          diskData: buildDisk(
            data.diskData ?? {
              percent: data.diskUsageData ?? null,
            }
          ),
          diskBackup: buildDisk(
            data.diskBackup ?? {
              percent: data.diskUsageBackup ?? null,
            }
          ),
          lastUpdated: data.lastUpdated ?? new Date().toISOString(),
        });
      } catch (err) {
        if (!alive) return;
        setIsError(true);
      } finally {
        if (alive) setIsLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [apiUrl]);

  return { status, isLoading, isError };
}

function useContainers(apiUrl: string) {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;

    async function fetchContainers() {
      try {
        setIsLoading(true);
        setIsError(false);

        const res = await fetch(apiUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("API error");

        const data = await res.json();
        if (!alive) return;

        setContainers(Array.isArray(data.containers) ? data.containers : []);
        setLastUpdated(data.lastUpdated ?? new Date().toISOString());
      } catch (err) {
        if (!alive) return;
        setIsError(true);
      } finally {
        if (alive) setIsLoading(false);
      }
    }

    fetchContainers();
    const interval = setInterval(fetchContainers, 30000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [apiUrl]);

  return { containers, lastUpdated, isLoading, isError };
}

const App: React.FC = () => {
  const {
    content,
    setContent,
    isLoading: isContentLoading,
    error: contentError,
    reload,
    save,
  } = useContentConfig();

  const [adminKey, setAdminKey] = useState<string>(() => {
    return localStorage.getItem("portalAdminKey") || "";
  });
  const [savingContent, setSavingContent] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [dragItem, setDragItem] = useState<{
    type: "quickAction" | "service" | "section" | "serviceGroup";
    groupIndex?: number;
    fromIndex: number;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem("portalAdminKey", adminKey);
  }, [adminKey]);

  const statusApi = content.statusApi || `${API_BASE}/status`;
  const containersApi = content.containersApi || `${API_BASE}/containers`;

  const { status, isLoading, isError } = useHomelabStatus(statusApi);
  const {
    containers,
    lastUpdated: containersUpdated,
    isLoading: isContainersLoading,
    isError: isContainersError,
  } = useContainers(containersApi);

  const formatPercent = (v: number | null) =>
    typeof v === "number" ? `${v.toFixed(0)}%` : "–";

  const formatSize = (gb: number | null) => {
    if (gb == null) return null;
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(1)} TB`;
    }
    return `${gb.toFixed(1)} GB`;
  };

  const formatStorage = (disk: DiskSnapshot) => {
    const used = formatSize(disk.usedGb);
    const total = formatSize(disk.totalGb);
    const free = formatSize(disk.freeGb);
    if (!used || !total) return "–";
    if (!free) return `${used} / ${total}`;
    return `${used} / ${total} · Ledigt ${free}`;
  };

  const containerStateClass = (state: string | null) => {
    const normalized = (state || "").toLowerCase();
    if (normalized === "running") {
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    }
    if (normalized === "exited" || normalized === "dead") {
      return "border-red-500/40 bg-red-500/10 text-red-200";
    }
    if (normalized === "paused") {
      return "border-amber-400/40 bg-amber-400/10 text-amber-100";
    }
    return "border-slate-500/40 bg-slate-500/10 text-slate-200";
  };

  const containerStateLabel = (state: string | null) =>
    state ? state.toUpperCase() : "OKÄND";
  const containersUpdatedText = containersUpdated
    ? new Date(containersUpdated).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "ingen data";

  const renderDiskCard = (label: string, disk: DiskSnapshot) => {
    const percentValue =
      typeof disk.percent === "number" ? Math.min(Math.max(disk.percent, 0), 100) : 0;

    return (
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col gap-2">
        <div className="text-[11px] text-slate-400 uppercase">{label}</div>
        <div className="text-xl font-semibold">
          {formatPercent(disk.percent)}
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400"
            style={{ width: `${percentValue}%` }}
          />
        </div>
        <div className="text-[11px] text-slate-500">{formatStorage(disk)}</div>
      </div>
    );
  };

  const containersText =
    status.dockerContainersUp != null && status.dockerContainersTotal != null
      ? `${status.dockerContainersUp}/${status.dockerContainersTotal}`
      : "–";

  const lastUpdatedText = status.lastUpdated
    ? new Date(status.lastUpdated).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "ingen data";

  const LiveStatusCard = () => (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live-status</h2>
          <p className="text-xs text-slate-400">
            Data från knox (uppdateras var 30:e sekund)
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${
            isError
              ? "border-red-500/70 text-red-300"
              : isLoading
              ? "border-slate-500/70 text-slate-300"
              : "border-emerald-500/70 text-emerald-300"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {isError ? "Offline" : isLoading ? "Laddar..." : "Online"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col gap-2">
          <div className="text-[11px] text-slate-400 uppercase">CPU</div>
          <div className="text-xl font-semibold">{formatPercent(status.cpuUsage)}</div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${status.cpuUsage ?? 0}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col gap-2">
          <div className="text-[11px] text-slate-400 uppercase">MINNE</div>
          <div className="text-xl font-semibold">
            {formatPercent(status.memoryUsage)}
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${status.memoryUsage ?? 0}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col gap-2">
          <div className="text-[11px] text-slate-400 uppercase">CONTAINERS UP</div>
          <div className="text-xl font-semibold">{containersText}</div>
          <div className="text-[11px] text-slate-500">Via Docker / Portainer</div>
        </div>

        {renderDiskCard("DISK /", status.diskRoot)}
        {renderDiskCard("DISK /mnt/data", status.diskData)}
        {renderDiskCard("DISK /mnt/backupshare", status.diskBackup)}
      </div>

      <div className="text-[11px] text-slate-500 flex justify-between">
        <span>Server: knox</span>
        <span>Senast uppdaterad: {lastUpdatedText}</span>
      </div>
    </div>
  );

  const servicesFlattened = content.serviceGroups.flatMap((group) =>
    (group.items || []).map((item) => ({ ...item, group: group.label }))
  );
  const sectionOrder =
    (content.layoutSections && content.layoutSections.length > 0
      ? content.layoutSections
      : defaultContent.layoutSections) || [];

  const sectionLabels: Record<string, string> = {
    status: "Status",
    actions: "Quick actions",
    widgets: "Live widgets",
    apps: "Apps",
    events: "Recent events",
  };

  const handleQuickActionChange = (
    index: number,
    field: keyof QuickAction,
    value: string
  ) => {
    setContent((prev) => {
      const next = { ...prev };
      const quickActions = [...(next.quickActions || [])];
      if (!quickActions[index]) return prev;
      quickActions[index] = { ...quickActions[index], [field]: value };
      next.quickActions = quickActions;
      return next;
    });
  };

  const addQuickAction = () =>
    setContent((prev) => ({
      ...prev,
      quickActions: [
        ...(prev.quickActions || []),
        { title: "Ny åtgärd", desc: "", href: "" },
      ],
    }));

  const removeQuickAction = (index: number) =>
    setContent((prev) => ({
      ...prev,
      quickActions: (prev.quickActions || []).filter((_, i) => i !== index),
    }));

  const reorder = <T,>(list: T[], from: number, to: number) => {
    const copy = [...list];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  };

  const handleQuickActionDrop = (toIndex: number) => {
    setContent((prev) => {
      const items = prev.quickActions || [];
      if (!dragItem || dragItem.type !== "quickAction") return prev;
      if (dragItem.fromIndex === toIndex) return prev;
      const next = reorder(items, dragItem.fromIndex, toIndex);
      return { ...prev, quickActions: next };
    });
    setDragItem(null);
  };

  const handleServiceGroupLabel = (index: number, value: string) =>
    setContent((prev) => {
      const groups = [...(prev.serviceGroups || [])];
      if (!groups[index]) return prev;
      groups[index] = { ...groups[index], label: value };
      return { ...prev, serviceGroups: groups };
    });

  const addServiceGroup = () =>
    setContent((prev) => ({
      ...prev,
      serviceGroups: [...(prev.serviceGroups || []), { label: "Ny grupp", items: [] }],
    }));

  const removeServiceGroup = (index: number) =>
    setContent((prev) => ({
      ...prev,
      serviceGroups: (prev.serviceGroups || []).filter((_, i) => i !== index),
    }));

  const handleServiceChange = (
    groupIndex: number,
    itemIndex: number,
    field: keyof LinkTile,
    value: string
  ) =>
    setContent((prev) => {
      const groups = [...(prev.serviceGroups || [])];
      if (!groups[groupIndex]) return prev;
      const items = [...(groups[groupIndex].items || [])];
      if (!items[itemIndex]) return prev;
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      groups[groupIndex] = { ...groups[groupIndex], items };
      return { ...prev, serviceGroups: groups };
    });

  const addServiceItem = (groupIndex: number) =>
    setContent((prev) => {
      const groups = [...(prev.serviceGroups || [])];
      if (!groups[groupIndex]) return prev;
      const items = [...(groups[groupIndex].items || [])];
      items.push({
        name: "Ny tjänst",
        description: "Beskrivning",
        url: "http://",
        tag: "",
      });
      groups[groupIndex] = { ...groups[groupIndex], items };
      return { ...prev, serviceGroups: groups };
    });

  const removeServiceItem = (groupIndex: number, itemIndex: number) =>
    setContent((prev) => {
      const groups = [...(prev.serviceGroups || [])];
      if (!groups[groupIndex]) return prev;
      const items = (groups[groupIndex].items || []).filter(
        (_, i) => i !== itemIndex
      );
      groups[groupIndex] = { ...groups[groupIndex], items };
      return { ...prev, serviceGroups: groups };
    });

  const handleServiceDrop = (groupIndex: number, toIndex: number) => {
    setContent((prev) => {
      const groups = [...(prev.serviceGroups || [])];
      if (!dragItem || dragItem.type !== "service") return prev;
      if (dragItem.groupIndex !== groupIndex) return prev;
      const group = groups[groupIndex];
      if (!group) return prev;
      const items = group.items || [];
      if (dragItem.fromIndex === toIndex) return prev;
      const nextItems = reorder(items, dragItem.fromIndex, toIndex);
      groups[groupIndex] = { ...group, items: nextItems };
      return { ...prev, serviceGroups: groups };
    });
    setDragItem(null);
  };

  const handleServiceGroupDrop = (toIndex: number) => {
    setContent((prev) => {
      const groups = prev.serviceGroups || [];
      if (!dragItem || dragItem.type !== "serviceGroup") return prev;
      if (dragItem.fromIndex === toIndex) return prev;
      const nextGroups = reorder(groups, dragItem.fromIndex, toIndex);
      return { ...prev, serviceGroups: nextGroups };
    });
    setDragItem(null);
  };

  const handleSectionDrop = (toIndex: number) => {
    setContent((prev) => {
      const sections = prev.layoutSections && prev.layoutSections.length > 0
        ? prev.layoutSections
        : defaultContent.layoutSections || [];
      if (!dragItem || dragItem.type !== "section") return prev;
      if (dragItem.fromIndex === toIndex) return prev;
      const nextSections = reorder(sections, dragItem.fromIndex, toIndex);
      return { ...prev, layoutSections: nextSections };
    });
    setDragItem(null);
  };

  const handleSaveSettings = async () => {
    setSavingContent(true);
    setSaveError("");
    setSaveMessage("");
    const result = await save(content, adminKey);
    if (result.ok) {
      setSaveMessage("Sparat!");
    } else {
      setSaveError(result.error || "Misslyckades att spara");
    }
    setSavingContent(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Top-nav */}
      <header className="sticky top-0 z-20 bg-gradient-to-b from-slate-950 via-slate-950/90 to-transparent border-b border-slate-900/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-emerald-500 flex items-center justify-center text-xs font-bold shadow-lg shadow-emerald-500/40">
              H
            </div>

            <div>
              <div className="text-sm font-semibold tracking-tight">
                {content.title || "Homelab Portal"}
              </div>
              <div className="text-[11px] text-slate-400">
                Miljö: {content.environment || "okänd"}
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
            {(content.metaBadges || []).map((badge) => (
              <span
                key={badge}
                className="px-2 py-1 rounded-full border border-slate-700"
              >
                {badge}
              </span>
            ))}
            <button
              className="px-2 py-1 rounded-full border border-slate-700 hover:border-emerald-400 transition"
              onClick={() => setShowAdmin((v) => !v)}
            >
              {showAdmin ? "Dölj admin" : "Admin"}
            </button>
            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold">
              NK
            </div>
          </div>
        </div>
        {/* Menu bar */}
        <div className="max-w-6xl mx-auto px-4 pb-3 flex items-center gap-2 text-sm overflow-x-auto">
          {[
            { label: "Status", href: "#status" },
            { label: "Quick actions", href: "#actions" },
            { label: "Live widgets", href: "#widgets" },
            { label: "Apps", href: "#apps" },
            { label: "Recent events", href: "#events" },
            { label: "Admin", href: "#admin" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/50 text-slate-200 hover:border-emerald-400 transition whitespace-nowrap"
            >
              {item.label}
            </a>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-12 space-y-10">
        {contentError && (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 text-amber-100 px-4 py-3">
            {contentError}
          </div>
        )}

        {sectionOrder.map((sectionId) => {
          if (sectionId === "status") {
            return (
              <section id="status" key="status" className="mt-6">
                <LiveStatusCard />
              </section>
            );
          }

          if (sectionId === "actions") {
            return (
              <section id="actions" key="actions" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Quick actions</h2>
                    <p className="text-sm text-slate-400">
                      Genvägar för drift: restart, loggar, dashboards.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(content.quickActions || []).map((action) => (
                    <a
                      key={action.title + action.href}
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-emerald-400/60 hover:-translate-y-1 transition transform"
                    >
                      <div className="text-sm font-semibold">{action.title}</div>
                      <div className="text-sm text-slate-400 mt-1">{action.desc}</div>
                    </a>
                  ))}
                  {(content.quickActions || []).length === 0 && (
                    <div className="text-sm text-slate-400">
                      Inga åtgärder definierade ännu.
                    </div>
                  )}
                </div>
              </section>
            );
          }

          if (sectionId === "widgets") {
            return (
              <section id="widgets" key="widgets" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Live widgets</h2>
                    <p className="text-sm text-slate-400">Snabbstatus + HA / Pi-hole genvägar.</p>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Senast uppdaterad: {lastUpdatedText}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col gap-2">
                    <div className="text-[11px] text-slate-400 uppercase">CONTAINERS UP</div>
                    <div className="text-xl font-semibold">{containersText}</div>
                    <div className="text-[11px] text-slate-500">Via Docker / Portainer</div>
                  </div>

                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col gap-2">
                    <div className="text-[11px] text-slate-400 uppercase">DISK /</div>
                    <div className="text-xl font-semibold">
                      {formatPercent(status.diskRoot.percent)}
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400"
                        style={{ width: `${status.diskRoot.percent ?? 0}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">{formatStorage(status.diskRoot)}</div>
                  </div>

                  <a
                    href="http://192.168.2.174:8123"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex items-center justify-between hover:border-emerald-400/60 transition"
                  >
                    <div>
                      <div className="text-xs text-slate-400 uppercase">Home Assistant</div>
                      <div className="text-sm text-slate-100">Öppna UI</div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-200">
                      Öppna
                    </span>
                  </a>

                  <a
                    href="http://192.168.2.174/admin"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex items-center justify-between hover:border-emerald-400/60 transition"
                  >
                    <div>
                      <div className="text-xs text-slate-400 uppercase">Pi-hole</div>
                      <div className="text-sm text-slate-100">DNS-filter & statistik</div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/60 text-emerald-200">
                      Öppna
                    </span>
                  </a>
                </div>
              </section>
            );
          }

          if (sectionId === "apps") {
            return (
              <section id="apps" key="apps" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Apps</h2>
                    <p className="text-sm text-slate-400">Alla portaler och UI:er i labbet.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {servicesFlattened.map((svc) => (
                    <a
                      key={svc.name + svc.url}
                      href={svc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-1 hover:border-emerald-400/60 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{svc.name}</div>
                        <div className="flex items-center gap-1">
                          {svc.group && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                              {svc.group}
                            </span>
                          )}
                          {svc.tag && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                              {svc.tag}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-slate-400">{svc.description}</div>
                      <div className="text-[11px] text-emerald-300 opacity-80 pt-1">Öppna →</div>
                    </a>
                  ))}
                  {servicesFlattened.length === 0 && (
                    <div className="text-sm text-slate-400">Inga tjänster konfigurerade ännu.</div>
                  )}
                </div>
              </section>
            );
          }

          if (sectionId === "events") {
            return (
              <section id="events" key="events" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Recent events</h2>
                    <p className="text-sm text-slate-400">Senaste containerstatus och uppstarter.</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                        isContainersError
                          ? "border-red-500/70 text-red-300"
                          : isContainersLoading
                          ? "border-slate-500/70 text-slate-300"
                          : "border-emerald-500/70 text-emerald-300"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-current" />
                      {isContainersError
                        ? "API offline"
                        : isContainersLoading
                        ? "Laddar..."
                        : "Online"}
                    </span>
                    <span className="text-slate-500">Senast: {containersUpdatedText}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
                  {(containers || []).slice(0, 6).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-xs text-slate-400 truncate">{c.status || "Ingen status"}</div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${containerStateClass(
                          c.state
                        )}`}
                      >
                        {containerStateLabel(c.state)}
                      </span>
                    </div>
                  ))}
                  {(!containers || containers.length === 0) && (
                    <div className="text-sm text-slate-400">Inga events ännu.</div>
                  )}
                </div>
              </section>
            );
          }

          return null;
        })}

        {/* ADMIN SETTINGS */}
        <section id="admin" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Admin / Settings</h2>
              <p className="text-sm text-slate-400">
                Uppdatera länkar, API:er och kort. Sparning kräver admin-nyckel (x-admin-key).
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 rounded-full border border-slate-700 hover:border-emerald-400 transition text-sm"
                onClick={reload}
              >
                Ladda om
              </button>
              <button
                className="px-3 py-1.5 rounded-full border border-emerald-500 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400 transition text-sm disabled:opacity-50"
                disabled={savingContent}
                onClick={handleSaveSettings}
              >
                {savingContent ? "Sparar..." : "Spara innehåll"}
              </button>
            </div>
          </div>

          {saveError && (
            <div className="rounded-xl border border-red-500/50 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
              {saveError}
            </div>
          )}
          {saveMessage && (
            <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 text-emerald-200 px-4 py-3 text-sm">
              {saveMessage}
            </div>
          )}
          {isContentLoading && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              Laddar innehåll...
            </div>
          )}

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-100">Sidsektioner</h3>
                  <span className="text-xs text-slate-500">
                    Dra sektionerna nedan för att ändra ordning på startsidan.
                  </span>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                {sectionOrder.map((sec, idx) => (
                  <div
                    key={`${sec}-${idx}`}
                    className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 flex items-center justify-between text-sm text-slate-100"
                    draggable
                    onDragStart={() =>
                      setDragItem({ type: "section", fromIndex: idx })
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleSectionDrop(idx)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="cursor-grab text-slate-400">↕</span>
                      {sectionLabels[sec] || sec}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-sm text-slate-300 space-y-1">
                <span className="block text-xs uppercase text-slate-500">Admin-nyckel</span>
                <input
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="Ange x-admin-key"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm text-slate-300 space-y-1">
                  <span className="block text-xs uppercase text-slate-500">Titel</span>
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={content.title}
                    onChange={(e) =>
                      setContent((prev) => ({ ...prev, title: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-300 space-y-1">
                  <span className="block text-xs uppercase text-slate-500">Miljö</span>
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={content.environment}
                    onChange={(e) =>
                      setContent((prev) => ({ ...prev, environment: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-300 space-y-1">
                  <span className="block text-xs uppercase text-slate-500">Status API</span>
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={content.statusApi}
                    onChange={(e) =>
                      setContent((prev) => ({ ...prev, statusApi: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-300 space-y-1">
                  <span className="block text-xs uppercase text-slate-500">Containers API</span>
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={content.containersApi}
                    onChange={(e) =>
                      setContent((prev) => ({ ...prev, containersApi: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-300 space-y-1 col-span-2">
                  <span className="block text-xs uppercase text-slate-500">Badges (komma-separerat)</span>
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    value={(content.metaBadges || []).join(", ")}
                    onChange={(e) =>
                      setContent((prev) => ({
                        ...prev,
                        metaBadges: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-100">Quick actions</h3>
                  <span className="text-xs text-slate-500">Dra för att ändra ordning.</span>
                </div>
                <button
                  className="text-xs px-2 py-1 rounded-lg border border-slate-700 hover:border-emerald-400 transition"
                  onClick={addQuickAction}
                >
                  Lägg till
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(content.quickActions || []).map((action, idx) => (
                  <div
                      key={idx}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2"
                    draggable
                    onDragStart={() =>
                      setDragItem({ type: "quickAction", fromIndex: idx })
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleQuickActionDrop(idx)}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-2">
                        <span className="cursor-grab text-slate-400">↕</span>
                        Åtgärd {idx + 1}
                      </span>
                      <button
                        className="text-red-300 hover:text-red-200"
                        onClick={() => removeQuickAction(idx)}
                      >
                        Ta bort
                      </button>
                    </div>
                    <input
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                      value={action.title}
                      onChange={(e) => handleQuickActionChange(idx, "title", e.target.value)}
                      placeholder="Titel"
                    />
                    <input
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                      value={action.desc}
                      onChange={(e) => handleQuickActionChange(idx, "desc", e.target.value)}
                      placeholder="Beskrivning"
                    />
                    <input
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                      value={action.href}
                      onChange={(e) => handleQuickActionChange(idx, "href", e.target.value)}
                      placeholder="Länk"
                    />
                  </div>
                ))}
                {(content.quickActions || []).length === 0 && (
                  <div className="text-sm text-slate-400">Inga åtgärder än.</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-100">Servicegrupper</h3>
                  <span className="text-xs text-slate-500">
                    Dra grupper eller tjänster för att ändra ordning.
                  </span>
                </div>
                <button
                  className="text-xs px-2 py-1 rounded-lg border border-slate-700 hover:border-emerald-400 transition"
                  onClick={addServiceGroup}
                >
                  Lägg till grupp
                </button>
              </div>

              <div className="space-y-3">
                {(content.serviceGroups || []).map((group, gIdx) => (
                  <div
                    key={`${group.label}-${gIdx}`}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3"
                    draggable
                    onDragStart={() =>
                      setDragItem({
                        type: "serviceGroup",
                        fromIndex: gIdx,
                      })
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleServiceGroupDrop(gIdx)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="cursor-grab text-slate-400">↕</span>
                      <input
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                        value={group.label}
                        onChange={(e) => handleServiceGroupLabel(gIdx, e.target.value)}
                      />
                      <button
                        className="text-xs px-2 py-1 rounded-lg border border-red-500/60 text-red-200 hover:border-red-400 transition"
                        onClick={() => removeServiceGroup(gIdx)}
                      >
                        Ta bort
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {(group.items || []).map((item, iIdx) => (
                        <div
                          key={`${item.name}-${iIdx}`}
                          className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2"
                          draggable
                          onDragStart={() =>
                            setDragItem({
                              type: "service",
                              groupIndex: gIdx,
                              fromIndex: iIdx,
                            })
                          }
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleServiceDrop(gIdx, iIdx)}
                        >
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="flex items-center gap-2">
                              <span className="cursor-grab text-slate-400">↕</span>
                              Tjänst {iIdx + 1}
                            </span>
                            <button
                              className="text-red-300 hover:text-red-200"
                              onClick={() => removeServiceItem(gIdx, iIdx)}
                            >
                              Ta bort
                            </button>
                          </div>
                          <input
                            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                            value={item.name}
                            onChange={(e) =>
                              handleServiceChange(gIdx, iIdx, "name", e.target.value)
                            }
                            placeholder="Namn"
                          />
                          <input
                            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                            value={item.description}
                            onChange={(e) =>
                              handleServiceChange(gIdx, iIdx, "description", e.target.value)
                            }
                            placeholder="Beskrivning"
                          />
                          <input
                            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                            value={item.url}
                            onChange={(e) =>
                              handleServiceChange(gIdx, iIdx, "url", e.target.value)
                            }
                            placeholder="URL"
                          />
                          <input
                            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                            value={item.tag || ""}
                            onChange={(e) =>
                              handleServiceChange(gIdx, iIdx, "tag", e.target.value)
                            }
                            placeholder="Tagg (valfritt)"
                          />
                        </div>
                      ))}
                      {(group.items || []).length === 0 && (
                        <div className="text-sm text-slate-400">Inga tjänster i gruppen än.</div>
                      )}
                    </div>

                    <button
                      className="text-xs px-3 py-2 rounded-lg border border-slate-700 hover:border-emerald-400 transition"
                      onClick={() => addServiceItem(gIdx)}
                    >
                      Lägg till tjänst
                    </button>
                  </div>
                ))}
                {(content.serviceGroups || []).length === 0 && (
                  <div className="text-sm text-slate-400">Inga grupper konfigurerade.</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/95">
        <div className="max-w-6xl mx-auto px-4 py-3 text-[11px] text-slate-500 flex justify-between">
          <span>{content.title || "Homelab Portal"}</span>
          <span>
            {content.footerNote || "Byggd av Kingen"} · {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
