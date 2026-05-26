"use client";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  DoorOpen,
  FileText,
  Hammer,
  Home,
  ImagePlus,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DependencyList, FormEvent, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { db, isFirebaseConfigured, storage } from "@/lib/firebase";
import {
  categories,
  seedProperties,
  type AppUser,
  type ApprovalStatus,
  type OutOfOrderIssue,
  type Property,
  type RepairLog,
  type ScheduledMaintenance,
  type UserRole,
} from "@/lib/models";
import { formatDateOnly, formatShortDate, minutesBetween, todayInputValue } from "@/lib/format";

type TabKey =
  | "dashboard"
  | "new-log"
  | "my-logs"
  | "maintenance"
  | "out-of-order"
  | "approvals"
  | "daily-log"
  | "calendar"
  | "properties"
  | "users";

const roleLabels: Record<UserRole, string> = {
  technician: "Technician",
  property_admin: "Property Admin/GM",
  property_manager: "Property Manager",
};

const approvalLabels: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  needs_info: "Needs info",
};

function statusClass(status: string) {
  if (["rejected", "out_of_order", "overdue", "open"].includes(status)) return "status-red";
  if (["pending", "needs_info", "monitoring", "in_progress"].includes(status)) return "status-yellow";
  if (["approved", "completed", "fixed"].includes(status)) return "status-green";
  if (["scheduled", "needs_vendor"].includes(status)) return "status-blue";
  return "status-gray";
}

function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(tone)}`}>
      {children}
    </span>
  );
}

function PrimaryButton({
  children,
  type = "button",
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#146b5d] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#0f4f46] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {icon}
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  type = "button",
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe5dc] bg-white px-4 py-2.5 text-sm font-extrabold text-[#17201b] transition hover:bg-[#eef3ef] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {icon}
      {children}
    </button>
  );
}

function DangerButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-extrabold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {children}
    </button>
  );
}

function useLiveCollection<T>(
  buildQuery: () => Query<DocumentData> | null,
  deps: DependencyList,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const liveQuery = buildQuery();
    if (!liveQuery) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    return onSnapshot(
      liveQuery,
      (snapshot) => {
        setItems(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as T));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { items, loading, error };
}

function propertyScopedQuery(collectionName: string, profile: AppUser, orderField = "createdAt") {
  if (!db) return null;
  const base = collection(db, collectionName);
  if (profile.role === "property_manager") return query(base, orderBy(orderField, "desc"));
  if (!profile.assignedProperties.length) return null;
  return query(base, where("propertyId", "in", profile.assignedProperties), orderBy(orderField, "desc"));
}

function propertyName(properties: Property[], propertyId: string) {
  return properties.find((property) => property.id === propertyId)?.name ?? propertyId;
}

function matchesProperty(selectedProperty: string, propertyId: string) {
  return selectedProperty === "all" || selectedProperty === propertyId;
}

export function MaintenanceCommandCenter() {
  const { authUser, profile, loading, error, login, resetPassword, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const propertyQuery = useMemo(() => {
    if (!db || !profile) return null;
    const base = collection(db, "properties");
    if (profile.role === "property_manager") return query(base, orderBy("name"));
    if (!profile.assignedProperties.length) return null;
    return query(base, where("id", "in", profile.assignedProperties), orderBy("name"));
  }, [profile]);

  const { items: properties, error: propertyError } = useLiveCollection<Property>(() => propertyQuery, [propertyQuery]);

  const repairQuery = useMemo(() => {
    if (!db || !profile) return null;
    const base = collection(db, "repairLogs");
    if (profile.role === "technician") {
      return query(base, where("technicianId", "==", profile.id), orderBy("createdAt", "desc"));
    }
    return propertyScopedQuery("repairLogs", profile);
  }, [profile]);
  const { items: repairLogs, error: repairError } = useLiveCollection<RepairLog>(() => repairQuery, [repairQuery]);

  const issueQuery = useMemo(() => (profile ? propertyScopedQuery("outOfOrderIssues", profile) : null), [profile]);
  const { items: issues, error: issueError } = useLiveCollection<OutOfOrderIssue>(() => issueQuery, [issueQuery]);

  const scheduleQuery = useMemo(
    () => (profile ? propertyScopedQuery("scheduledMaintenance", profile, "dueDate") : null),
    [profile],
  );
  const { items: scheduledMaintenance, error: scheduleError } = useLiveCollection<ScheduledMaintenance>(
    () => scheduleQuery,
    [scheduleQuery],
  );

  const usersQuery = useMemo(() => {
    if (!db || !profile || profile.role !== "property_manager") return null;
    return query(collection(db, "users"), orderBy("name"));
  }, [profile]);
  const { items: users } = useLiveCollection<AppUser>(() => usersQuery, [usersQuery]);

  useEffect(() => {
    if (!profile) return;
    if (profile.role === "property_manager") {
      setSelectedProperty((current) => current || "all");
      return;
    }
    setSelectedProperty((current) =>
      current !== "all" && profile.assignedProperties.includes(current)
        ? current
        : profile.assignedProperties[0] ?? "all",
    );
  }, [profile]);

  const activeProperties = useMemo(() => properties.filter((property) => property.active !== false), [properties]);

  const visibleRepairLogs = useMemo(
    () => repairLogs.filter((log) => matchesProperty(selectedProperty, log.propertyId)),
    [repairLogs, selectedProperty],
  );
  const visibleIssues = useMemo(
    () => issues.filter((issue) => matchesProperty(selectedProperty, issue.propertyId)),
    [issues, selectedProperty],
  );
  const visibleMaintenance = useMemo(
    () =>
      scheduledMaintenance.filter((task) => {
        const propertyMatch = matchesProperty(selectedProperty, task.propertyId);
        if (profile?.role !== "technician") return propertyMatch;
        return propertyMatch && (!task.assignedTo || task.assignedTo === profile.id);
      }),
    [scheduledMaintenance, selectedProperty, profile],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#146b5d] text-white">
            <Wrench size={28} />
          </div>
          <p className="text-sm font-bold text-[#66736b]">Loading Maintenance Command Center</p>
        </div>
      </main>
    );
  }

  if (!authUser || !profile) {
    return <LoginScreen login={login} resetPassword={resetPassword} authError={error} />;
  }

  const navItems = getNavItems(profile.role);

  return (
    <main className="min-h-screen pb-24 lg:pb-0">
      <div className="lg:flex">
        <aside className="sticky top-0 hidden h-screen w-72 border-r border-[#dfe5dc] bg-white px-4 py-5 lg:block">
          <BrandBlock profile={profile} />
          <nav className="mt-6 space-y-1">
            {navItems.map((item) => (
              <NavButton key={item.key} item={item} active={activeTab === item.key} onClick={() => setActiveTab(item.key)} />
            ))}
          </nav>
          <button
            type="button"
            onClick={logout}
            className="absolute bottom-5 left-4 right-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#dfe5dc] bg-white px-4 py-2 text-sm font-extrabold text-[#17201b]"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-[#dfe5dc] bg-[#f7f8f5]/95 px-4 py-3 backdrop-blur lg:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#146b5d]">Maintenance Command Center</p>
                <h1 className="truncate text-xl font-black text-[#17201b] sm:text-2xl">
                  {navItems.find((item) => item.key === activeTab)?.label ?? "Dashboard"}
                </h1>
              </div>
              <div className="hidden items-center gap-3 md:flex">
                <PropertySelector
                  profile={profile}
                  properties={activeProperties}
                  selectedProperty={selectedProperty}
                  setSelectedProperty={setSelectedProperty}
                />
                <span className="rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#33443b] ring-1 ring-[#dfe5dc]">
                  {roleLabels[profile.role]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#dfe5dc] bg-white lg:hidden"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </div>
            <div className="mx-auto mt-3 max-w-7xl md:hidden">
              <PropertySelector
                profile={profile}
                properties={activeProperties}
                selectedProperty={selectedProperty}
                setSelectedProperty={setSelectedProperty}
              />
            </div>
            {mobileMenuOpen ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-[#dfe5dc] bg-white p-2 lg:hidden">
                {navItems.map((item) => (
                  <NavButton
                    key={item.key}
                    item={item}
                    active={activeTab === item.key}
                    onClick={() => {
                      setActiveTab(item.key);
                      setMobileMenuOpen(false);
                    }}
                  />
                ))}
                <SecondaryButton icon={<LogOut size={18} />} onClick={logout}>
                  Sign out
                </SecondaryButton>
              </div>
            ) : null}
          </header>

          <div className="mx-auto max-w-7xl px-4 py-5 lg:px-8">
            <ErrorStrip errors={[propertyError, repairError, issueError, scheduleError]} />
            {activeTab === "dashboard" ? (
              <Dashboard
                profile={profile}
                properties={activeProperties}
                repairLogs={visibleRepairLogs}
                issues={visibleIssues}
                maintenance={visibleMaintenance}
                setActiveTab={setActiveTab}
              />
            ) : null}
            {activeTab === "new-log" ? <RepairForm profile={profile} properties={activeProperties} /> : null}
            {activeTab === "my-logs" ? <MyLogs logs={visibleRepairLogs} properties={activeProperties} /> : null}
            {activeTab === "maintenance" ? (
              <TechnicianMaintenance profile={profile} tasks={visibleMaintenance} properties={activeProperties} />
            ) : null}
            {activeTab === "out-of-order" ? (
              <OutOfOrderPanel profile={profile} properties={activeProperties} issues={visibleIssues} />
            ) : null}
            {activeTab === "approvals" ? (
              <ApprovalQueue profile={profile} properties={activeProperties} logs={visibleRepairLogs} />
            ) : null}
            {activeTab === "daily-log" ? <DailyLog properties={activeProperties} logs={visibleRepairLogs} /> : null}
            {activeTab === "calendar" ? (
              <CalendarPanel profile={profile} properties={activeProperties} tasks={visibleMaintenance} users={users} />
            ) : null}
            {activeTab === "properties" ? <PropertiesPanel properties={properties} /> : null}
            {activeTab === "users" ? <UsersPanel users={users} properties={activeProperties} /> : null}
          </div>
        </section>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#dfe5dc] bg-white safe-bottom lg:hidden">
        <div className="flex overflow-x-auto px-2 pt-2">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`flex min-w-20 flex-1 flex-col items-center gap-1 rounded-lg px-3 py-2 text-[0.7rem] font-black ${
                activeTab === item.key ? "bg-[#e1f0ec] text-[#146b5d]" : "text-[#66736b]"
              }`}
            >
              {item.icon}
              <span className="whitespace-nowrap">{item.shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

function LoginScreen({
  login,
  resetPassword,
  authError,
}: {
  login: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  authError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    if (!email.trim()) {
      setError("Enter your email first, then request a password reset.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await resetPassword(email);
      setMessage("Password reset email sent. Check your inbox, then sign in with the new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send password reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-6">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#146b5d] text-white">
            <Wrench size={30} />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#146b5d]">Hotel maintenance</p>
          <h1 className="mt-2 text-3xl font-black text-[#17201b]">Maintenance Command Center</h1>
          <p className="mt-3 text-base font-medium leading-7 text-[#66736b]">
            Take pictures, explain repair, track room, get approved, keep everyone informed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-4 shadow-sm">
          {!isFirebaseConfigured ? (
            <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm font-bold text-yellow-900">
              Firebase is not configured. Add `.env.local` from `.env.example`.
            </div>
          ) : null}
          {error || authError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
              {error || authError}
            </div>
          ) : null}
          {message ? (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">
              {message}
            </div>
          ) : null}
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="field mb-4"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field mb-5"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <PrimaryButton type="submit" disabled={busy} icon={<ShieldCheck size={18} />}>
            {busy ? "Signing in..." : "Sign in"}
          </PrimaryButton>
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={busy}
            className="mt-3 min-h-11 w-full rounded-lg text-sm font-extrabold text-[#146b5d] hover:bg-[#e1f0ec] disabled:opacity-60"
          >
            Reset password
          </button>
        </form>
      </section>
    </main>
  );
}

function BrandBlock({ profile }: { profile: AppUser }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#146b5d] text-white">
          <Wrench size={26} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[#17201b]">{profile.name}</p>
          <p className="truncate text-xs font-bold text-[#66736b]">{profile.email}</p>
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-[#eef3ef] p-3 text-xs font-extrabold text-[#33443b]">
        {roleLabels[profile.role]}
      </div>
    </div>
  );
}

function getNavItems(role: UserRole) {
  const base = [{ key: "dashboard" as TabKey, label: "Dashboard", shortLabel: "Home", icon: <Home size={19} /> }];
  if (role === "technician") {
    return [
      ...base,
      { key: "new-log" as TabKey, label: "New Repair Log", shortLabel: "New", icon: <Plus size={19} /> },
      { key: "my-logs" as TabKey, label: "My Logs", shortLabel: "Logs", icon: <FileText size={19} /> },
      { key: "maintenance" as TabKey, label: "Assigned Maintenance", shortLabel: "Tasks", icon: <CalendarDays size={19} /> },
    ];
  }
  const admin = [
    ...base,
    { key: "out-of-order" as TabKey, label: "Out-of-Order", shortLabel: "OOO", icon: <DoorOpen size={19} /> },
    { key: "approvals" as TabKey, label: "Approval Queue", shortLabel: "Approve", icon: <ClipboardCheck size={19} /> },
    { key: "daily-log" as TabKey, label: "Daily Log", shortLabel: "Daily", icon: <FileText size={19} /> },
    { key: "calendar" as TabKey, label: "Calendar", shortLabel: "Cal", icon: <CalendarDays size={19} /> },
  ];
  if (role === "property_manager") {
    return [
      ...admin,
      { key: "properties" as TabKey, label: "Properties", shortLabel: "Hotels", icon: <Settings size={19} /> },
      { key: "users" as TabKey, label: "Users", shortLabel: "Users", icon: <UserCog size={19} /> },
    ];
  }
  return admin;
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: ReturnType<typeof getNavItems>[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-extrabold ${
        active ? "bg-[#e1f0ec] text-[#146b5d]" : "text-[#33443b] hover:bg-[#f3f6f3]"
      }`}
    >
      {item.icon}
      {item.label}
    </button>
  );
}

function PropertySelector({
  profile,
  properties,
  selectedProperty,
  setSelectedProperty,
}: {
  profile: AppUser;
  properties: Property[];
  selectedProperty: string;
  setSelectedProperty: (property: string) => void;
}) {
  return (
    <select className="field h-11 max-w-full md:w-64" value={selectedProperty} onChange={(event) => setSelectedProperty(event.target.value)}>
      {profile.role === "property_manager" ? <option value="all">All hotels</option> : null}
      {properties.map((property) => (
        <option key={property.id} value={property.id}>
          {property.name}
        </option>
      ))}
    </select>
  );
}

function ErrorStrip({ errors }: { errors: Array<string | null> }) {
  const visibleErrors = errors.filter(Boolean);
  if (!visibleErrors.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
      {visibleErrors[0]}
    </div>
  );
}

function Dashboard({
  profile,
  properties,
  repairLogs,
  issues,
  maintenance,
  setActiveTab,
}: {
  profile: AppUser;
  properties: Property[];
  repairLogs: RepairLog[];
  issues: OutOfOrderIssue[];
  maintenance: ScheduledMaintenance[];
  setActiveTab: (tab: TabKey) => void;
}) {
  const pending = repairLogs.filter((log) => log.approvalStatus === "pending").length;
  const approvedToday = repairLogs.filter(
    (log) => log.approvalStatus === "approved" && log.endTime.slice(0, 10) === todayInputValue(),
  ).length;
  const rejected = repairLogs.filter((log) => ["rejected", "needs_info"].includes(log.approvalStatus)).length;
  const outOfOrder = issues.filter((issue) => issue.status !== "closed").length;
  const due = maintenance.filter((task) => task.status !== "completed").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Pending approval" value={pending} tone="pending" icon={<Clock size={20} />} />
        <StatCard label="Approved today" value={approvedToday} tone="approved" icon={<Check size={20} />} />
        <StatCard label="Needs follow-up" value={rejected} tone="rejected" icon={<AlertTriangle size={20} />} />
        <StatCard label="Out-of-order" value={outOfOrder} tone="open" icon={<DoorOpen size={20} />} />
        <StatCard label="Scheduled work" value={due} tone="scheduled" icon={<CalendarDays size={20} />} />
      </div>

      {profile.role === "technician" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <QuickAction
            title="New repair log"
            text="Capture before photos, repair notes, parts, time, and outcome."
            icon={<Plus size={22} />}
            onClick={() => setActiveTab("new-log")}
          />
          <QuickAction
            title="Assigned maintenance"
            text="See scheduled work for your assigned hotels."
            icon={<CalendarDays size={22} />}
            onClick={() => setActiveTab("maintenance")}
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <QuickAction
            title="Review pending logs"
            text="Approve, reject, or request more info from technicians."
            icon={<ClipboardCheck size={22} />}
            onClick={() => setActiveTab("approvals")}
          />
          <QuickAction
            title="Out-of-order rooms"
            text="Open, monitor, and close room or location issues."
            icon={<DoorOpen size={22} />}
            onClick={() => setActiveTab("out-of-order")}
          />
          <QuickAction
            title="Official daily log"
            text="Approved repair logs by property and date."
            icon={<FileText size={22} />}
            onClick={() => setActiveTab("daily-log")}
          />
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-[#17201b]">Hotel Snapshot</h2>
          <span className="text-xs font-bold text-[#66736b]">{properties.length} visible properties</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {properties.map((property) => {
            const propertyLogs = repairLogs.filter((log) => log.propertyId === property.id);
            const propertyIssues = issues.filter((issue) => issue.propertyId === property.id && issue.status !== "closed");
            return (
              <article key={property.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-[#17201b]">{property.name}</h3>
                    <p className="text-sm font-medium text-[#66736b]">{property.address}</p>
                  </div>
                  <Badge tone={property.active ? "approved" : "closed"}>{property.active ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <MiniMetric label="Rooms" value={property.totalRooms || "-"} />
                  <MiniMetric label="Pending" value={propertyLogs.filter((log) => log.approvalStatus === "pending").length} />
                  <MiniMetric label="OOO" value={propertyIssues.length} />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: ReactNode }) {
  return (
    <article className="card p-4">
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${statusClass(tone)}`}>{icon}</span>
        <p className="text-3xl font-black text-[#17201b]">{value}</p>
      </div>
      <p className="mt-3 text-sm font-extrabold text-[#66736b]">{label}</p>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[#f3f6f3] px-2 py-3">
      <p className="text-lg font-black text-[#17201b]">{value}</p>
      <p className="text-[0.7rem] font-black uppercase tracking-wide text-[#66736b]">{label}</p>
    </div>
  );
}

function QuickAction({
  title,
  text,
  icon,
  onClick,
}: {
  title: string;
  text: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="card p-4 text-left transition hover:border-[#146b5d] hover:bg-[#fbfdfb]">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#e1f0ec] text-[#146b5d]">{icon}</div>
      <h3 className="font-black text-[#17201b]">{title}</h3>
      <p className="mt-1 text-sm font-medium leading-6 text-[#66736b]">{text}</p>
    </button>
  );
}

function RepairForm({ profile, properties }: { profile: AppUser; properties: Property[] }) {
  const [propertyId, setPropertyId] = useState(profile.assignedProperties[0] ?? properties[0]?.id ?? "");
  const [roomOrLocation, setRoomOrLocation] = useState("");
  const [locationType, setLocationType] = useState<RepairLog["locationType"]>("room");
  const [category, setCategory] = useState(categories[0]);
  const [issueDescription, setIssueDescription] = useState("");
  const [repairExplanation, setRepairExplanation] = useState("");
  const [partsUsed, setPartsUsed] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [statusAfterRepair, setStatusAfterRepair] = useState<RepairLog["statusAfterRepair"]>("fixed");
  const [beforePhotos, setBeforePhotos] = useState<FileList | null>(null);
  const [afterPhotos, setAfterPhotos] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const totalMinutes = minutesBetween(startTime, endTime);

  useEffect(() => {
    if (!propertyId && properties[0]?.id) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  async function uploadImages(files: FileList | null, logId: string, phase: "before" | "after") {
    const activeStorage = storage;
    if (!activeStorage || !files) return [];
    const uploads = Array.from(files).map(async (file) => {
      const cleanName = file.name.replace(/[^\w.-]+/g, "_");
      const imageRef = ref(activeStorage, `repairLogs/${propertyId}/${profile.id}/${logId}/${phase}/${Date.now()}-${cleanName}`);
      await uploadBytes(imageRef, file, { contentType: file.type });
      return getDownloadURL(imageRef);
    });
    return Promise.all(uploads);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!db || !propertyId) return;
    const activeDb = db;
    setBusy(true);
    setMessage(null);
    try {
      const logRef = doc(collection(activeDb, "repairLogs"));
      const [beforePhotoUrls, afterPhotoUrls] = await Promise.all([
        uploadImages(beforePhotos, logRef.id, "before"),
        uploadImages(afterPhotos, logRef.id, "after"),
      ]);

      await setDoc(logRef, {
        propertyId,
        roomOrLocation,
        locationType,
        category,
        issueDescription,
        repairExplanation,
        partsUsed,
        technicianId: profile.id,
        technicianName: profile.name,
        technicianEmail: profile.email,
        startTime,
        endTime,
        totalMinutes,
        beforePhotoUrls,
        afterPhotoUrls,
        statusAfterRepair,
        approvalStatus: "pending",
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setRoomOrLocation("");
      setIssueDescription("");
      setRepairExplanation("");
      setPartsUsed("");
      setStartTime("");
      setEndTime("");
      setBeforePhotos(null);
      setAfterPhotos(null);
      setMessage("Repair log submitted for approval.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to submit repair log.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {message ? <div className="rounded-lg border border-[#dfe5dc] bg-white p-3 text-sm font-bold text-[#33443b]">{message}</div> : null}
      <section className="card p-4">
        <SectionTitle title="Repair Location" icon={<Hammer size={20} />} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Property">
            <select className="field" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Room or location">
            <input
              className="field"
              placeholder="Room 214, lobby restroom, roof access"
              value={roomOrLocation}
              onChange={(event) => setRoomOrLocation(event.target.value)}
              required
            />
          </Field>
          <Field label="Location type">
            <select className="field" value={locationType} onChange={(event) => setLocationType(event.target.value as RepairLog["locationType"])}>
              <option value="room">Room</option>
              <option value="common_area">Common area</option>
              <option value="back_of_house">Back of house</option>
              <option value="exterior">Exterior</option>
            </select>
          </Field>
          <Field label="Category">
            <select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card p-4">
        <SectionTitle title="Before Work" icon={<ImagePlus size={20} />} />
        <div className="grid gap-4">
          <Field label="Issue description">
            <textarea
              className="field min-h-28"
              value={issueDescription}
              onChange={(event) => setIssueDescription(event.target.value)}
              required
            />
          </Field>
          <Field label="Before photos">
            <input className="field" type="file" accept="image/*" multiple onChange={(event) => setBeforePhotos(event.target.files)} />
          </Field>
        </div>
      </section>

      <section className="card p-4">
        <SectionTitle title="Repair Details" icon={<Clock size={20} />} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Start time">
            <input className="field" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
          </Field>
          <Field label="End time">
            <input className="field" type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
          </Field>
          <Field label="Total minutes">
            <input className="field bg-[#f3f6f3] font-black" readOnly value={totalMinutes} />
          </Field>
          <Field label="Status after repair">
            <select
              className="field"
              value={statusAfterRepair}
              onChange={(event) => setStatusAfterRepair(event.target.value as RepairLog["statusAfterRepair"])}
            >
              <option value="fixed">Fixed</option>
              <option value="monitoring">Monitoring</option>
              <option value="out_of_order">Still out of order</option>
              <option value="needs_vendor">Needs vendor</option>
            </select>
          </Field>
          <Field label="Repair explanation">
            <textarea
              className="field min-h-28"
              value={repairExplanation}
              onChange={(event) => setRepairExplanation(event.target.value)}
              required
            />
          </Field>
          <Field label="Parts used">
            <textarea className="field min-h-28" value={partsUsed} onChange={(event) => setPartsUsed(event.target.value)} placeholder="None, if no parts used" />
          </Field>
          <div className="md:col-span-2">
            <Field label="After photos">
              <input className="field" type="file" accept="image/*" multiple onChange={(event) => setAfterPhotos(event.target.files)} />
            </Field>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <PrimaryButton type="submit" disabled={busy || !db} icon={<ClipboardCheck size={18} />}>
          {busy ? "Submitting..." : "Submit for approval"}
        </PrimaryButton>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[#17201b]">
      <span className="text-[#146b5d]">{icon}</span>
      <h2 className="text-lg font-black">{title}</h2>
    </div>
  );
}

function MyLogs({ logs, properties }: { logs: RepairLog[]; properties: Property[] }) {
  const [status, setStatus] = useState<ApprovalStatus | "all">("all");
  const filtered = logs.filter((log) => status === "all" || log.approvalStatus === status);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-black text-[#17201b]">My Repair Logs</h2>
        <select className="field sm:w-56" value={status} onChange={(event) => setStatus(event.target.value as ApprovalStatus | "all")}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="needs_info">Needs info</option>
        </select>
      </div>
      <LogList logs={filtered} properties={properties} showReview />
    </section>
  );
}

function LogList({
  logs,
  properties,
  showReview,
}: {
  logs: RepairLog[];
  properties: Property[];
  showReview?: boolean;
}) {
  if (!logs.length) return <EmptyState title="No repair logs found" text="Logs will show up here as soon as work is submitted." />;

  return (
    <div className="grid gap-3">
      {logs.map((log) => (
        <article key={log.id} className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-[#17201b]">{log.roomOrLocation}</h3>
                <Badge tone={log.approvalStatus}>{approvalLabels[log.approvalStatus]}</Badge>
                <Badge tone={log.statusAfterRepair}>{log.statusAfterRepair.replaceAll("_", " ")}</Badge>
              </div>
              <p className="mt-1 text-sm font-bold text-[#66736b]">
                {propertyName(properties, log.propertyId)} - {log.category} - {log.totalMinutes} min
              </p>
            </div>
            <p className="text-xs font-bold text-[#66736b]">{formatShortDate(log.createdAt)}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TextBlock label="Issue" text={log.issueDescription} />
            <TextBlock label="Repair" text={log.repairExplanation} />
          </div>
          {log.partsUsed ? <TextBlock label="Parts used" text={log.partsUsed} /> : null}
          {showReview && (log.adminNotes || log.rejectionReason) ? (
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm font-bold text-yellow-900">
              {log.adminNotes || log.rejectionReason}
            </div>
          ) : null}
          <PhotoStrip before={log.beforePhotoUrls} after={log.afterPhotoUrls} />
        </article>
      ))}
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-black uppercase tracking-wide text-[#66736b]">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-6 text-[#33443b]">{text || "None"}</p>
    </div>
  );
}

function PhotoStrip({ before, after }: { before: string[]; after: string[] }) {
  const photos = [
    ...before.map((url) => ({ url, label: "Before" })),
    ...after.map((url) => ({ url, label: "After" })),
  ];
  if (!photos.length) return null;
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto">
      {photos.map((photo) => (
        <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[#dfe5dc] bg-[#f3f6f3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`${photo.label} repair photo`} className="h-full w-full object-cover" />
          <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[0.65rem] font-black text-white">
            {photo.label}
          </span>
        </a>
      ))}
    </div>
  );
}

function ApprovalQueue({ profile, logs, properties }: { profile: AppUser; logs: RepairLog[]; properties: Property[] }) {
  const pendingLogs = logs.filter((log) => ["pending", "needs_info"].includes(log.approvalStatus));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function review(log: RepairLog, status: ApprovalStatus) {
    if (!db) return;
    const activeDb = db;
    setBusyId(log.id);
    try {
      const note = notes[log.id] ?? "";
      await updateDoc(doc(activeDb, "repairLogs", log.id), {
        approvalStatus: status,
        reviewedBy: profile.id,
        reviewedByName: profile.name,
        reviewedAt: serverTimestamp(),
        adminNotes: note,
        rejectionReason: status === "rejected" ? note : "",
        updatedAt: serverTimestamp(),
      });
      setNotes((current) => ({ ...current, [log.id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  if (!pendingLogs.length) return <EmptyState title="No pending approvals" text="Submitted repair logs will land here for review." />;

  return (
    <div className="grid gap-4">
      {pendingLogs.map((log) => (
        <article key={log.id} className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-[#17201b]">{log.roomOrLocation}</h3>
                <Badge tone={log.approvalStatus}>{approvalLabels[log.approvalStatus]}</Badge>
                <Badge tone={log.statusAfterRepair}>{log.statusAfterRepair.replaceAll("_", " ")}</Badge>
              </div>
              <p className="mt-1 text-sm font-bold text-[#66736b]">
                {propertyName(properties, log.propertyId)} - {log.technicianName} - {log.totalMinutes} min
              </p>
            </div>
            <p className="text-xs font-bold text-[#66736b]">{formatShortDate(log.createdAt)}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TextBlock label="Issue" text={log.issueDescription} />
            <TextBlock label="Repair" text={log.repairExplanation} />
          </div>
          <TextBlock label="Parts used" text={log.partsUsed || "None"} />
          <PhotoStrip before={log.beforePhotoUrls} after={log.afterPhotoUrls} />
          <label className="mt-4 block">
            <span className="label">Admin notes</span>
            <textarea
              className="field min-h-24"
              value={notes[log.id] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [log.id]: event.target.value }))}
              placeholder="Required for reject or needs more info"
            />
          </label>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <SecondaryButton disabled={busyId === log.id} onClick={() => review(log, "needs_info")} icon={<Search size={17} />}>
              Request more info
            </SecondaryButton>
            <DangerButton disabled={busyId === log.id} onClick={() => review(log, "rejected")}>
              Reject
            </DangerButton>
            <PrimaryButton disabled={busyId === log.id} onClick={() => review(log, "approved")} icon={<Check size={17} />}>
              Approve
            </PrimaryButton>
          </div>
        </article>
      ))}
    </div>
  );
}

function DailyLog({ logs, properties }: { logs: RepairLog[]; properties: Property[] }) {
  const [day, setDay] = useState(todayInputValue());
  const approved = logs.filter((log) => log.approvalStatus === "approved" && log.endTime.slice(0, 10) === day);

  return (
    <section className="space-y-4">
      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px] md:items-end">
          <div>
            <h2 className="text-lg font-black text-[#17201b]">Official Daily Maintenance Log</h2>
            <p className="mt-1 text-sm font-medium text-[#66736b]">Only approved repair logs appear here.</p>
          </div>
          <Field label="Log date">
            <input className="field" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </Field>
        </div>
      </div>
      <LogList logs={approved} properties={properties} />
    </section>
  );
}

function OutOfOrderPanel({
  profile,
  properties,
  issues,
}: {
  profile: AppUser;
  properties: Property[];
  issues: OutOfOrderIssue[];
}) {
  const [propertyId, setPropertyId] = useState(profile.assignedProperties[0] ?? properties[0]?.id ?? "");
  const [roomOrLocation, setRoomOrLocation] = useState("");
  const [locationType, setLocationType] = useState<OutOfOrderIssue["locationType"]>("room");
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function createIssue(event: FormEvent) {
    event.preventDefault();
    if (!db) return;
    const activeDb = db;
    setBusy(true);
    try {
      await addDoc(collection(activeDb, "outOfOrderIssues"), {
        propertyId,
        roomOrLocation,
        locationType,
        category,
        description,
        notes,
        status: "open",
        openedBy: profile.id,
        openedByName: profile.name,
        openedAt: serverTimestamp(),
        linkedRepairLogIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRoomOrLocation("");
      setDescription("");
      setNotes("");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(issue: OutOfOrderIssue, status: OutOfOrderIssue["status"]) {
    if (!db) return;
    const activeDb = db;
    await updateDoc(doc(activeDb, "outOfOrderIssues", issue.id), {
      status,
      closedBy: status === "closed" ? profile.id : "",
      closedByName: status === "closed" ? profile.name : "",
      closedAt: status === "closed" ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form onSubmit={createIssue} className="card h-fit p-4">
        <SectionTitle title="Open Out-of-Order Issue" icon={<DoorOpen size={20} />} />
        <div className="grid gap-4">
          <Field label="Property">
            <select className="field" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Room or location">
            <input className="field" value={roomOrLocation} onChange={(event) => setRoomOrLocation(event.target.value)} required />
          </Field>
          <Field label="Location type">
            <select className="field" value={locationType} onChange={(event) => setLocationType(event.target.value as OutOfOrderIssue["locationType"])}>
              <option value="room">Room</option>
              <option value="common_area">Common area</option>
              <option value="back_of_house">Back of house</option>
              <option value="exterior">Exterior</option>
            </select>
          </Field>
          <Field label="Category">
            <select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea className="field min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} required />
          </Field>
          <Field label="Notes">
            <textarea className="field min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <PrimaryButton type="submit" disabled={busy} icon={<Plus size={17} />}>
            Open issue
          </PrimaryButton>
        </div>
      </form>

      <section className="space-y-3">
        {issues.length ? (
          issues.map((issue) => (
            <article key={issue.id} className="card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-[#17201b]">{issue.roomOrLocation}</h3>
                    <Badge tone={issue.status}>{issue.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[#66736b]">
                    {propertyName(properties, issue.propertyId)} - {issue.category} - opened by {issue.openedByName}
                  </p>
                </div>
                <p className="text-xs font-bold text-[#66736b]">{formatShortDate(issue.createdAt)}</p>
              </div>
              <TextBlock label="Description" text={issue.description} />
              {issue.notes ? <TextBlock label="Notes" text={issue.notes} /> : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <SecondaryButton onClick={() => updateStatus(issue, "monitoring")}>Mark monitoring</SecondaryButton>
                <PrimaryButton onClick={() => updateStatus(issue, "closed")} icon={<Check size={17} />}>
                  Close issue
                </PrimaryButton>
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="No out-of-order issues" text="Open room and location issues here so everyone sees the same status." />
        )}
      </section>
    </div>
  );
}

function CalendarPanel({
  profile,
  properties,
  tasks,
  users,
}: {
  profile: AppUser;
  properties: Property[];
  tasks: ScheduledMaintenance[];
  users: AppUser[];
}) {
  const [propertyId, setPropertyId] = useState(profile.assignedProperties[0] ?? properties[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedToName, setAssignedToName] = useState("");
  const [recurrence, setRecurrence] = useState<ScheduledMaintenance["recurrence"]>("none");
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [requiresPhotos, setRequiresPhotos] = useState(false);
  const [busy, setBusy] = useState(false);

  const technicians = users.filter((user) => user.role === "technician" && (propertyId ? user.assignedProperties.includes(propertyId) : true));

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!db) return;
    const activeDb = db;
    const assignedUser = users.find((user) => user.id === assignedTo);
    const finalAssignedName = assignedUser?.name || assignedToName.trim() || (assignedTo ? "Assigned technician" : "Unassigned");
    setBusy(true);
    try {
      await addDoc(collection(activeDb, "scheduledMaintenance"), {
        propertyId,
        title,
        description,
        category,
        assignedTo,
        assignedToName: finalAssignedName,
        recurrence,
        dueDate,
        status: "scheduled",
        requiresPhotos,
        photoUrls: [],
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setAssignedToName("");
      setRequiresPhotos(false);
    } finally {
      setBusy(false);
    }
  }

  const grouped = tasks.reduce<Record<string, ScheduledMaintenance[]>>((acc, task) => {
    acc[task.dueDate] = acc[task.dueDate] ?? [];
    acc[task.dueDate].push(task);
    return acc;
  }, {});

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      {profile.role !== "technician" ? (
        <form onSubmit={createTask} className="card h-fit p-4">
          <SectionTitle title="Create Scheduled Maintenance" icon={<CalendarDays size={20} />} />
          <div className="grid gap-4">
            <Field label="Property">
              <select className="field" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </Field>
            <Field label="Description">
              <textarea className="field min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} required />
            </Field>
            <Field label="Category">
              <select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            {technicians.length ? (
              <Field label="Assign to">
                <select className="field" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
                  <option value="">Unassigned</option>
                  {technicians.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Assigned technician UID">
                  <input className="field" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Firebase Auth UID" />
                </Field>
                <Field label="Assigned technician name">
                  <input className="field" value={assignedToName} onChange={(event) => setAssignedToName(event.target.value)} placeholder="Optional" />
                </Field>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Due date">
                <input className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
              </Field>
              <Field label="Recurrence">
                <select className="field" value={recurrence} onChange={(event) => setRecurrence(event.target.value as ScheduledMaintenance["recurrence"])}>
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-3 rounded-lg border border-[#dfe5dc] bg-white p-3 text-sm font-extrabold text-[#33443b]">
              <input type="checkbox" checked={requiresPhotos} onChange={(event) => setRequiresPhotos(event.target.checked)} />
              Requires completion photos
            </label>
            <PrimaryButton type="submit" disabled={busy} icon={<Plus size={17} />}>
              Create task
            </PrimaryButton>
          </div>
        </form>
      ) : null}

      <section className="space-y-4">
        {Object.keys(grouped).length ? (
          Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dateTasks]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-[#66736b]">{formatDateOnly(date)}</h3>
                <div className="grid gap-3">
                  {dateTasks.map((task) => (
                    <MaintenanceCard key={task.id} profile={profile} task={task} properties={properties} />
                  ))}
                </div>
              </div>
            ))
        ) : (
          <EmptyState title="No scheduled maintenance" text="Scheduled work will appear here by due date." />
        )}
      </section>
    </div>
  );
}

function TechnicianMaintenance({
  profile,
  tasks,
  properties,
}: {
  profile: AppUser;
  tasks: ScheduledMaintenance[];
  properties: Property[];
}) {
  return (
    <section className="space-y-3">
      {tasks.length ? (
        tasks.map((task) => <MaintenanceCard key={task.id} profile={profile} task={task} properties={properties} />)
      ) : (
        <EmptyState title="No assigned maintenance" text="Scheduled maintenance assigned to you will show here." />
      )}
    </section>
  );
}

function MaintenanceCard({
  profile,
  task,
  properties,
}: {
  profile: AppUser;
  task: ScheduledMaintenance;
  properties: Property[];
}) {
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);

  async function completeTask() {
    if (!db) return;
    const activeDb = db;
    setBusy(true);
    try {
      let photoUrls: string[] = task.photoUrls ?? [];
      const activeStorage = storage;
      if (activeStorage && files) {
        const uploads = Array.from(files).map(async (file) => {
          const cleanName = file.name.replace(/[^\w.-]+/g, "_");
          const imageRef = ref(activeStorage, `scheduledMaintenance/${task.propertyId}/${task.id}/${Date.now()}-${cleanName}`);
          await uploadBytes(imageRef, file, { contentType: file.type });
          return getDownloadURL(imageRef);
        });
        photoUrls = [...photoUrls, ...(await Promise.all(uploads))];
      }
      await updateDoc(doc(activeDb, "scheduledMaintenance", task.id), {
        status: "completed",
        completedBy: profile.id,
        completedByName: profile.name,
        completedAt: serverTimestamp(),
        photoUrls,
        notes,
        updatedAt: serverTimestamp(),
      });
      setNotes("");
      setFiles(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black text-[#17201b]">{task.title}</h3>
            <Badge tone={task.status}>{task.status.replaceAll("_", " ")}</Badge>
          </div>
          <p className="mt-1 text-sm font-bold text-[#66736b]">
            {propertyName(properties, task.propertyId)} - {task.category} - {task.assignedToName || "Unassigned"}
          </p>
        </div>
        <p className="text-xs font-bold text-[#66736b]">Due {formatDateOnly(task.dueDate)}</p>
      </div>
      <TextBlock label="Description" text={task.description} />
      {task.status !== "completed" && (profile.role === "technician" || profile.role === "property_manager") ? (
        <div className="mt-4 grid gap-3">
          <Field label="Completion notes">
            <textarea className="field min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          {task.requiresPhotos ? (
            <Field label="Completion photos">
              <input className="field" type="file" accept="image/*" multiple onChange={(event) => setFiles(event.target.files)} />
            </Field>
          ) : null}
          <PrimaryButton onClick={completeTask} disabled={busy} icon={<Check size={17} />}>
            Mark complete
          </PrimaryButton>
        </div>
      ) : null}
      <PhotoStrip before={[]} after={task.photoUrls ?? []} />
    </article>
  );
}

function PropertiesPanel({ properties }: { properties: Property[] }) {
  const visibleProperties = properties.filter((property) => property.active !== false);
  const [editing, setEditing] = useState<Record<string, Partial<Property>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newProperty, setNewProperty] = useState({
    name: "",
    address: "",
    totalRooms: 0,
  });

  function propertyIdFromName(name: string) {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return slug || `property_${Date.now()}`;
  }

  async function seedDefaults() {
    if (!db) return;
    const activeDb = db;
    const legacyPropertyIds = ["holiday_inn", "comfort_suites", "property_3", "prop-1775338218767"];
    setBusyId("seed");
    try {
      await Promise.all(
        [
          ...seedProperties.map((property) =>
            setDoc(
              doc(activeDb, "properties", property.id),
              {
                ...property,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          ),
          ...legacyPropertyIds.map((propertyId) =>
            setDoc(
              doc(activeDb, "properties", propertyId),
              {
                active: false,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          ),
        ],
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveProperty(property: Property) {
    if (!db) return;
    const activeDb = db;
    setBusyId(property.id);
    try {
      await setDoc(
        doc(activeDb, "properties", property.id),
        {
          ...property,
          ...editing[property.id],
          totalRooms: Number(editing[property.id]?.totalRooms ?? property.totalRooms ?? 0),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } finally {
      setBusyId(null);
    }
  }

  async function addProperty(event: FormEvent) {
    event.preventDefault();
    if (!db) return;
    const activeDb = db;
    const propertyId = propertyIdFromName(newProperty.name);
    setBusyId("add");
    try {
      await setDoc(
        doc(activeDb, "properties", propertyId),
        {
          id: propertyId,
          name: newProperty.name.trim(),
          address: newProperty.address.trim(),
          totalRooms: Number(newProperty.totalRooms || 0),
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setNewProperty({ name: "", address: "", totalRooms: 0 });
      setIsAdding(false);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-[#17201b]">Properties</h2>
          <p className="text-sm font-medium text-[#66736b]">Manage hotel records and room counts.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SecondaryButton onClick={seedDefaults} disabled={busyId === "seed"} icon={<Check size={17} />}>
            Restore starter hotels
          </SecondaryButton>
          <PrimaryButton onClick={() => setIsAdding((open) => !open)} icon={isAdding ? <X size={17} /> : <Plus size={17} />}>
            {isAdding ? "Cancel" : "Add property"}
          </PrimaryButton>
        </div>
      </div>

      {isAdding ? (
        <form onSubmit={addProperty} className="card p-4">
          <SectionTitle title="Add Property" icon={<Plus size={20} />} />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Name">
              <input
                className="field"
                value={newProperty.name}
                onChange={(event) => setNewProperty((current) => ({ ...current, name: event.target.value }))}
                placeholder="Hotel name"
                required
              />
            </Field>
            <Field label="Address">
              <input
                className="field"
                value={newProperty.address}
                onChange={(event) => setNewProperty((current) => ({ ...current, address: event.target.value }))}
                placeholder="City, state"
                required
              />
            </Field>
            <Field label="Total rooms">
              <input
                className="field"
                type="number"
                min="0"
                value={newProperty.totalRooms}
                onChange={(event) => setNewProperty((current) => ({ ...current, totalRooms: Number(event.target.value) }))}
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <PrimaryButton type="submit" disabled={busyId === "add"} icon={<Check size={17} />}>
              Save new property
            </PrimaryButton>
          </div>
        </form>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {visibleProperties.map((property) => (
          <article key={property.id} className="card p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-[#66736b]">{property.id}</p>
            <Field label="Name">
              <input
                className="field"
                value={editing[property.id]?.name ?? property.name}
                onChange={(event) => setEditing((current) => ({ ...current, [property.id]: { ...current[property.id], name: event.target.value } }))}
              />
            </Field>
            <div className="mt-3">
              <Field label="Address">
                <input
                  className="field"
                  value={editing[property.id]?.address ?? property.address}
                  onChange={(event) => setEditing((current) => ({ ...current, [property.id]: { ...current[property.id], address: event.target.value } }))}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Total rooms">
                <input
                  className="field"
                  type="number"
                  value={editing[property.id]?.totalRooms ?? property.totalRooms}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      [property.id]: { ...current[property.id], totalRooms: Number(event.target.value) },
                    }))
                  }
                />
              </Field>
            </div>
            <div className="mt-4">
              <PrimaryButton onClick={() => saveProperty(property)} disabled={busyId === property.id} icon={<Check size={17} />}>
                Save property
              </PrimaryButton>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UsersPanel({ users, properties }: { users: AppUser[]; properties: Property[] }) {
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("technician");
  const [assignedProperties, setAssignedProperties] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleProperty(propertyId: string) {
    setAssignedProperties((current) =>
      current.includes(propertyId) ? current.filter((item) => item !== propertyId) : [...current, propertyId],
    );
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!db) return;
    const activeDb = db;
    setBusy(true);
    try {
      await setDoc(
        doc(activeDb, "users", uid),
        {
          name,
          email,
          role,
          assignedProperties: role === "property_manager" ? properties.map((property) => property.id) : assignedProperties,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setUid("");
      setName("");
      setEmail("");
      setAssignedProperties([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form onSubmit={saveUser} className="card h-fit p-4">
        <SectionTitle title="User Profile" icon={<UserCog size={20} />} />
        <div className="grid gap-4">
          <Field label="Firebase Auth UID">
            <input className="field" value={uid} onChange={(event) => setUid(event.target.value)} required />
          </Field>
          <Field label="Name">
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Email">
            <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Field label="Role">
            <select className="field" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="technician">Technician</option>
              <option value="property_admin">Property Admin/GM</option>
              <option value="property_manager">Property Manager</option>
            </select>
          </Field>
          <div>
            <span className="label">Assigned properties</span>
            <div className="grid gap-2">
              {properties.map((property) => (
                <label key={property.id} className="flex items-center gap-3 rounded-lg border border-[#dfe5dc] bg-white p-3 text-sm font-extrabold">
                  <input
                    type="checkbox"
                    checked={role === "property_manager" || assignedProperties.includes(property.id)}
                    disabled={role === "property_manager"}
                    onChange={() => toggleProperty(property.id)}
                  />
                  {property.name}
                </label>
              ))}
            </div>
          </div>
          <PrimaryButton type="submit" disabled={busy} icon={<Check size={17} />}>
            Save user profile
          </PrimaryButton>
        </div>
      </form>

      <section className="grid gap-3">
        {users.map((user) => (
          <article key={user.id} className="card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-black text-[#17201b]">{user.name}</h3>
                <p className="text-sm font-bold text-[#66736b]">{user.email}</p>
              </div>
              <Badge tone={user.active ? "approved" : "closed"}>{roleLabels[user.role]}</Badge>
            </div>
            <p className="mt-3 text-sm font-medium text-[#33443b]">
              {user.assignedProperties.map((id) => propertyName(properties, id)).join(", ") || "No assigned properties"}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="card flex min-h-48 flex-col items-center justify-center p-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#eef3ef] text-[#146b5d]">
        <Wrench size={24} />
      </div>
      <h3 className="font-black text-[#17201b]">{title}</h3>
      <p className="mt-1 max-w-md text-sm font-medium leading-6 text-[#66736b]">{text}</p>
    </div>
  );
}
