"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Check,
  Plus,
  Minus,
  Calendar,
  Clock,
  Layers,
  Sparkles,
  ChevronRight,
  Activity,
  History,
  Package,
  Users,
} from "lucide-react";
import { ActionTheme } from "@/lib/types";
import { useEngine } from "@/lib/store";
import {
  createPackage,
  configurePackageDeliveries,
  assignPackageToUsers,
  getCompanyUsers,
} from "@/app/actions/packages";
import { getPackageHistory } from "@/app/actions/admin-analytics";
import { getCurrentISTDate } from "@/lib/timezone-utils";

interface PackageManagementViewProps {
  companyId: string | null;
  role: string;
}

type DeliveryConfig = {
  weekNumber: number;
  deliveryDate: string;
  deliveryTime: string;
  actionIds: string[];
};

interface PackageHistoryEntry {
  id: string;
  name: string;
  startDate: string | null;
  durationWeeks: number;
  actionsCount: number;
  usersAssigned: number;
  createdAt: string;
}

export function PackageManagementView({
  companyId,
  role,
}: PackageManagementViewProps) {
  const { allActions, refetch } = useEngine();
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");
  const [step, setStep] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<ActionTheme | "All">("All");

  const [packageConfig, setPackageConfig] = useState({
    packageName: "Q1 Manager Excellence",
    selectedActions: [] as any[],
    startDate: getCurrentISTDate(),
    durationWeeks: 8,
    activationTime: "09:00",
  });

  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig[]>([]);
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<number>>(
    new Set()
  );
  const [successMsg, setSuccessMsg] = useState("");
  const [companyUsers, setCompanyUsers] = useState<
    { id: string; full_name: string | null }[]
  >([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);

  const [packageHistory, setPackageHistory] = useState<PackageHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const filteredActionBank = useMemo(() => {
    return allActions.filter(
      (a) => categoryFilter === "All" || a.theme === categoryFilter
    );
  }, [allActions, categoryFilter]);

  const ensureWeekConfigs = React.useCallback(
    (weeks: number) => {
      setDeliveryConfig((prev) => {
        const byWeek = new Map(prev.map((d) => [d.weekNumber, d]));
        const next: DeliveryConfig[] = [];
        for (let w = 1; w <= weeks; w++) {
          const existing = byWeek.get(w);
          if (existing) {
            next.push(existing);
          } else {
            const startDate = new Date(packageConfig.startDate);
            const weekOffset = (w - 1) * 7;
            const deliveryDate = new Date(startDate);
            deliveryDate.setDate(deliveryDate.getDate() + weekOffset);
            const defaultDate = deliveryDate.toISOString().split("T")[0];

            next.push({
              weekNumber: w,
              deliveryDate: defaultDate,
              deliveryTime: packageConfig.activationTime,
              actionIds: [],
            });
          }
        }
        return next;
      });
    },
    [packageConfig.startDate, packageConfig.activationTime]
  );

  useEffect(() => {
    if (deliveryConfig.length === 0) {
      ensureWeekConfigs(packageConfig.durationWeeks);
    }
  }, [packageConfig.durationWeeks, deliveryConfig.length, ensureWeekConfigs]);

  useEffect(() => {
    if (companyId && step === 3) {
      getCompanyUsers(companyId).then(({ users }) =>
        setCompanyUsers(users ?? [])
      );
    }
  }, [companyId, step]);

  useEffect(() => {
    if (companyId && activeTab === "history") {
      setHistoryLoading(true);
      getPackageHistory(companyId)
        .then(({ packages, error }) => {
          if (!error && packages) {
            setPackageHistory(packages);
          } else {
            setPackageHistory([]);
          }
        })
        .finally(() => setHistoryLoading(false));
    }
  }, [companyId, activeTab]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAction = (action: any) => {
    const isSelected = packageConfig.selectedActions.some(
      (a) => a.id === action.id
    );
    if (isSelected) {
      setPackageConfig({
        ...packageConfig,
        selectedActions: packageConfig.selectedActions.filter(
          (a) => a.id !== action.id
        ),
      });
    } else {
      setPackageConfig({
        ...packageConfig,
        selectedActions: [...packageConfig.selectedActions, action],
      });
    }
  };

  const handleDeploy = async () => {
    if (!companyId) return;
    if (packageConfig.selectedActions.length === 0) {
      setSuccessMsg("Select at least one action");
      setTimeout(() => setSuccessMsg(""), 3000);
      return;
    }

    const hasAssignedActions = deliveryConfig.some(
      (d) => d.actionIds.length > 0
    );
    if (!hasAssignedActions) {
      setSuccessMsg("Assign actions to at least one delivery week");
      setTimeout(() => setSuccessMsg(""), 3000);
      return;
    }

    setDeploying(true);
    const { id: pkgId, error: createErr } = await createPackage({
      name: packageConfig.packageName,
      startDate: packageConfig.startDate,
      durationWeeks: packageConfig.durationWeeks,
      activationTime: packageConfig.activationTime,
      companyId: role === "superadmin" ? companyId : undefined,
    });
    if (createErr || !pkgId) {
      setSuccessMsg(createErr ?? "Failed to create package");
      setDeploying(false);
      setTimeout(() => setSuccessMsg(""), 4000);
      return;
    }

    const deliveriesPayload = deliveryConfig
      .filter((d) => d.actionIds.length > 0)
      .map((d) => ({
        weekNumber: d.weekNumber,
        deliveryDate: d.deliveryDate || null,
        deliveryTime: d.deliveryTime || null,
        actionIds: d.actionIds,
      }));

    const { error: configErr } = await configurePackageDeliveries(
      pkgId,
      deliveriesPayload
    );
    if (configErr) {
      setSuccessMsg(configErr);
      setDeploying(false);
      setTimeout(() => setSuccessMsg(""), 4000);
      return;
    }

    if (selectedUserIds.length > 0) {
      const { error: assignErr } = await assignPackageToUsers(
        pkgId,
        selectedUserIds,
        packageConfig.startDate
      );
      if (assignErr) {
        setSuccessMsg(assignErr);
        setDeploying(false);
        setTimeout(() => setSuccessMsg(""), 4000);
        return;
      }
    }

    setDeploying(false);
    setSuccessMsg("Package deployed!");
    setPackageConfig({
      ...packageConfig,
      selectedActions: [],
      packageName: "",
    });
    setDeliveryConfig([]);
    setSelectedUserIds([]);
    setStep(1);
    await refetch();
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Package Management
          </h2>
          <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Create, deploy &amp; track action packages
          </p>
        </div>
        {successMsg && (
          <span className="tag tag--teal animate-pulse">{successMsg}</span>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("create")}
          className={`btn btn--sm flex items-center gap-2 ${activeTab === "create" ? "btn--primary" : "btn--decline"}`}
        >
          <Package size={14} /> Create Package
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`btn btn--sm flex items-center gap-2 ${activeTab === "history" ? "btn--primary" : "btn--decline"}`}
        >
          <History size={14} /> Package History
        </button>
      </div>

      {activeTab === "history" ? (
        <PackageHistorySection
          packages={packageHistory}
          loading={historyLoading}
        />
      ) : (
        <>
          {/* Stepper Header */}
          <div className="flex items-center gap-3 bg-white p-4 rounded-2xl" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all"
                    style={
                      step === s
                        ? { background: "var(--bright-amber)", color: "var(--shadow-grey)", transform: "scale(1.1)" }
                        : step > s
                        ? { background: "var(--emerald)", color: "white" }
                        : { background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }
                    }
                  >
                    {step > s ? <Check size={16} strokeWidth={3} /> : s}
                  </div>
                  <div className="hidden md:block">
                    <p className="text-xs font-semibold" style={{ color: step >= s ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                      {s === 1 ? "Architect Content" : s === 2 ? "Schedule" : "Enroll & Deploy"}
                    </p>
                  </div>
                </div>
                {s < 3 && (
                  <div className="flex-1 h-px mx-2 rounded-full" style={{ background: "var(--color-border)" }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* STEP 1: ARCHITECT CONTENT */}
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              {/* Package Definition */}
              <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
                <h3 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                  <Activity size={16} style={{ color: "var(--dodger-blue)" }} /> Package Definition
                </h3>
                <div className="form-group mb-0">
                  <label className="form-label">Package Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={packageConfig.packageName}
                    onChange={(e) => setPackageConfig({ ...packageConfig, packageName: e.target.value })}
                  />
                </div>
              </div>

              {/* Action Bank Selection */}
              <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <h3 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
                    Strategic Action Bank
                  </h3>
                  <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--color-bg-muted)" }}>
                    {["All", "Collaboration", "Feedback", "Accountability", "Connection", "Coaching"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat as any)}
                        className="px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                        style={
                          categoryFilter === cat
                            ? { background: "var(--bright-amber)", color: "var(--shadow-grey)" }
                            : { color: "var(--color-text-muted)" }
                        }
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                  {filteredActionBank.map((action) => {
                    const isSelected = packageConfig.selectedActions.some((a) => a.id === action.id);
                    return (
                      <div
                        key={action.id}
                        className="p-4 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-4"
                        style={
                          isSelected
                            ? { background: "rgba(35,206,107,0.08)", border: "1px solid rgba(35,206,107,0.35)" }
                            : { background: "white", border: "1px solid var(--color-border)" }
                        }
                        onClick={() => toggleAction(action)}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                            style={
                              isSelected
                                ? { background: "var(--emerald)", color: "white" }
                                : { background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }
                            }
                          >
                            {isSelected ? <Check size={18} strokeWidth={3} /> : <Plus size={18} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight truncate max-w-[320px]" style={{ color: "var(--color-text-primary)" }}>
                              &quot;{action.title}&quot;
                            </p>
                            <span className="tag tag--blue mt-1">{action.theme}</span>
                          </div>
                        </div>
                        <span className="text-xs font-medium shrink-0" style={{ color: "var(--color-text-muted)" }}>
                          {action.timeEstimate}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: SCHEDULE */}
          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
                <h3 className="text-base font-bold mb-4" style={{ color: "var(--color-text-primary)" }}>
                  Campaign Pulse Logic
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="form-group mb-0">
                    <label className="form-label">Campaign Start Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--color-text-muted)" }} />
                      <input
                        type="date"
                        className="form-input pl-10"
                        value={packageConfig.startDate}
                        onChange={(e) => setPackageConfig({ ...packageConfig, startDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label">Activation Time IST (Fallback)</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--color-text-muted)" }} />
                      <input
                        type="time"
                        className="form-input pl-10"
                        value={packageConfig.activationTime}
                        onChange={(e) => setPackageConfig({ ...packageConfig, activationTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label">Duration (Weeks)</label>
                    <div className="flex items-center rounded-xl overflow-hidden h-11" style={{ border: "1.5px solid var(--color-border-strong)" }}>
                      <button
                        onClick={() => {
                          const nextWeeks = Math.max(1, packageConfig.durationWeeks - 1);
                          setPackageConfig({ ...packageConfig, durationWeeks: nextWeeks });
                          ensureWeekConfigs(nextWeeks);
                        }}
                        className="px-4 h-full transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <span className="flex-1 text-center font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                        {packageConfig.durationWeeks} Weeks
                      </span>
                      <button
                        onClick={() => {
                          const nextWeeks = packageConfig.durationWeeks + 1;
                          setPackageConfig({ ...packageConfig, durationWeeks: nextWeeks });
                          ensureWeekConfigs(nextWeeks);
                        }}
                        className="px-4 h-full transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Per-Delivery Configuration */}
              <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
                <h3 className="text-base font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>
                  Delivery Schedule &amp; Actions
                </h3>
                <p className="text-xs font-medium mb-4" style={{ color: "var(--color-text-muted)" }}>
                  Configure date, time, and actions for each weekly delivery
                </p>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {deliveryConfig.map((d) => {
                    const weekActions = d.actionIds
                      .map((id) =>
                        packageConfig.selectedActions.find((a) => a.id === id)
                      )
                      .filter(Boolean);

                    const showActionSelect = expandedDeliveries.has(
                      d.weekNumber
                    );
                    const toggleActionSelect = () => {
                      setExpandedDeliveries((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.weekNumber)) {
                          next.delete(d.weekNumber);
                        } else {
                          next.add(d.weekNumber);
                        }
                        return next;
                      });
                    };

                    return (
                      <div
                        key={d.weekNumber}
                        className="rounded-xl p-3 transition-all"
                        style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border)" }}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                          <div className="flex items-center gap-2 lg:w-20 shrink-0">
                            <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                              W{d.weekNumber}
                            </span>
                          </div>

                          <div className="lg:w-[160px] shrink-0">
                            <label className="form-label">Date (IST)</label>
                            <input
                              type="date"
                              className="form-input"
                              style={{ fontSize: "var(--text-xs)" }}
                              value={d.deliveryDate}
                              onChange={(e) =>
                                setDeliveryConfig((prev) =>
                                  prev.map((w) =>
                                    w.weekNumber === d.weekNumber
                                      ? { ...w, deliveryDate: e.target.value }
                                      : w
                                  )
                                )
                              }
                            />
                          </div>

                          <div className="lg:w-[110px] shrink-0">
                            <label className="form-label">Time (IST)</label>
                            <input
                              type="time"
                              className="form-input"
                              style={{ fontSize: "var(--text-xs)" }}
                              value={d.deliveryTime}
                              onChange={(e) =>
                                setDeliveryConfig((prev) =>
                                  prev.map((w) =>
                                    w.weekNumber === d.weekNumber
                                      ? { ...w, deliveryTime: e.target.value }
                                      : w
                                  )
                                )
                              }
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <label className="form-label">Assigned Actions ({weekActions.length})</label>
                            <div className="rounded-lg p-2.5 min-h-[42px]" style={{ border: "1.5px dashed var(--color-border-strong)", background: "white" }}>
                              {weekActions.length === 0 ? (
                                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No actions assigned</p>
                              ) : (
                                <div className="space-y-1">
                                  {weekActions.map((a) => (
                                    <div key={a!.id} className="text-xs font-medium leading-tight" style={{ color: "var(--color-text-primary)" }} title={a!.title}>
                                      · &quot;{a!.title}&quot;
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="lg:w-[90px] shrink-0">
                            <label className="form-label opacity-0">·</label>
                            <button
                              onClick={toggleActionSelect}
                              className={`btn btn--sm w-full ${showActionSelect ? "btn--primary-dark" : "btn--decline"}`}
                            >
                              {showActionSelect ? "Close" : "Select"}
                            </button>
                          </div>
                        </div>

                        {showActionSelect && (
                          <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--color-border-strong)" }}>
                            <div className="max-h-56 overflow-y-auto rounded-lg bg-white" style={{ border: "1px solid var(--color-border)" }}>
                              {packageConfig.selectedActions.length === 0 ? (
                                <p className="text-[9px] text-gray-400 font-bold uppercase text-center py-3">
                                  Add actions in Step 1 first
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0">
                                  {packageConfig.selectedActions.map((a) => {
                                    const checked = d.actionIds.includes(a.id);
                                    const assignedToOther = deliveryConfig.some(
                                      (delivery) =>
                                        delivery.weekNumber !== d.weekNumber &&
                                        delivery.actionIds.includes(a.id)
                                    );
                                    const isDisabled =
                                      assignedToOther && !checked;

                                    return (
                                      <label
                                        key={a.id}
                                        className={`flex items-start gap-2.5 px-3 py-2.5 text-[10px] border-b border-r border-gray-100 transition-colors ${
                                          isDisabled
                                            ? "opacity-40 cursor-not-allowed bg-gray-50"
                                            : "cursor-pointer hover:bg-blue-50"
                                        }`}
                                        title={
                                          isDisabled
                                            ? "Already assigned to another delivery"
                                            : a.title
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          className="w-4 h-4 mt-0.5 shrink-0 accent-blue-500"
                                          checked={checked}
                                          disabled={isDisabled}
                                          onChange={() =>
                                            setDeliveryConfig((prev) =>
                                              prev.map((w) =>
                                                w.weekNumber === d.weekNumber
                                                  ? {
                                                      ...w,
                                                      actionIds: checked
                                                        ? w.actionIds.filter(
                                                            (id) => id !== a.id
                                                          )
                                                        : [...w.actionIds, a.id],
                                                    }
                                                  : w
                                              )
                                            )
                                          }
                                        />
                                        <span
                                          className={`font-bold leading-snug ${
                                            isDisabled ? "line-through" : ""
                                          }`}
                                        >
                                          "{a.title}"
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: ENROLL & DEPLOY */}
          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              {/* User Selection */}
              <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
                <h3 className="text-base font-bold mb-1 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                  <Users size={16} style={{ color: "var(--dodger-blue)" }} /> User Enrollment
                </h3>
                <p className="text-xs font-medium mb-4" style={{ color: "var(--color-text-muted)" }}>
                  Select users to enroll in this package (optional)
                </p>
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {companyUsers.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => toggleUser(u.id)}
                      className="p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3"
                      style={
                        selectedUserIds.includes(u.id)
                          ? { background: "rgba(35,206,107,0.08)", border: "1px solid rgba(35,206,107,0.35)" }
                          : { background: "var(--color-bg-base)", border: "1px solid var(--color-border)" }
                      }
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={
                          selectedUserIds.includes(u.id)
                            ? { background: "var(--emerald)", color: "white" }
                            : { background: "var(--bright-amber)", color: "var(--shadow-grey)" }
                        }
                      >
                        {(u.full_name ?? "?").substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold truncate flex-1" style={{ color: "var(--color-text-primary)" }}>
                        {u.full_name ?? "Unknown"}
                      </span>
                      {selectedUserIds.includes(u.id) && (
                        <Check size={18} strokeWidth={2.5} style={{ color: "var(--emerald)", flexShrink: 0 }} />
                      )}
                    </div>
                  ))}
                </div>
                {companyUsers.length === 0 && (
                  <p className="text-sm py-6 text-center" style={{ color: "var(--color-text-muted)" }}>
                    No users in this company yet.
                  </p>
                )}
              </div>

              {/* Package Overview */}
              <div className="rounded-2xl p-5" style={{ background: "var(--color-bg-muted)", border: "1px solid var(--color-border-yellow)", boxShadow: "var(--shadow-md)" }}>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
                  <Layers size={16} style={{ color: "var(--majorelle-blue)" }} /> Package Overview
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "Total Actions", value: packageConfig.selectedActions.length, color: "#8B5CF6" },
                    { label: "Deliveries", value: packageConfig.durationWeeks, color: "var(--dodger-blue)" },
                    { label: "Assigned", value: deliveryConfig.reduce((sum, d) => sum + d.actionIds.length, 0), color: "var(--emerald)" },
                    { label: "Unassigned", value: packageConfig.selectedActions.length - deliveryConfig.reduce((sum, d) => sum + d.actionIds.length, 0), color: "var(--princeton-orange)" },
                    { label: "Users Selected", value: selectedUserIds.length, color: "var(--dodger-blue)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex flex-col justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid var(--color-border)" }}>
                      <span className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Wizard Navigation */}
          <div className="flex justify-between items-center px-1">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="btn btn--decline disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous Stage
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => Math.min(3, s + 1))}
                className="btn btn--primary flex items-center gap-2"
              >
                Next Stage <ChevronRight size={16} strokeWidth={2.5} />
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                disabled={deploying || packageConfig.selectedActions.length === 0}
                className="btn btn--lg flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "var(--emerald)", color: "white", boxShadow: "0 4px 16px rgba(35,206,107,0.35)" }}
              >
                {deploying ? "Deploying…" : "Deploy Package"}{" "}
                <Sparkles size={16} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PackageHistorySection({
  packages,
  loading,
}: {
  packages: PackageHistoryEntry[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center text-sm font-medium" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)", color: "var(--color-text-muted)" }}>
        Loading package history…
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
        <div className="text-center">
          <Package size={48} className="mx-auto mb-4" style={{ color: "var(--color-border-strong)" }} />
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>No packages deployed yet</p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Create your first package using the form above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)", boxShadow: "var(--shadow-lg)" }}>
      <div className="p-4" style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-base)" }}>
        <h3 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
          Deployed Packages
        </h3>
        <p className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {packages.length} package{packages.length !== 1 ? "s" : ""} total
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left table-fixed min-w-[580px] text-sm">
          <thead>
            <tr style={{ background: "var(--color-bg-dark)", color: "var(--white)" }}>
              <th className="px-4 py-3 text-xs font-semibold">Package Name</th>
              <th className="px-3 py-3 text-xs font-semibold text-center">Start Date</th>
              <th className="px-3 py-3 text-xs font-semibold text-center">Duration</th>
              <th className="px-3 py-3 text-xs font-semibold text-center">Actions</th>
              <th className="px-3 py-3 text-xs font-semibold text-center">Created</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <tr key={pkg.id} className="transition-colors" style={{ borderBottom: "1px solid var(--color-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td className="px-4 py-3">
                  <p className="text-xs font-semibold truncate max-w-[200px]" style={{ color: "var(--color-text-primary)" }}>{pkg.name}</p>
                </td>
                <td className="px-3 py-3 text-center text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  {pkg.startDate ? new Date(pkg.startDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="text-xs font-semibold text-blue-600">{pkg.durationWeeks}w</span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="text-xs font-semibold text-purple-600">{pkg.actionsCount}</span>
                </td>
                <td className="px-3 py-3 text-center text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  {new Date(pkg.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
