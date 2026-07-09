"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Eye,
  MousePointer2,
  CheckCircle2,
  RefreshCw,
  Download,
  Filter,
  ChevronDown,
  LayoutDashboard,
  BarChart3,
  Users2,
  Settings,
  Target,
  AlertCircle,
  TrendingUp,
  Zap,
  MoreHorizontal,
  Circle,
  Trophy,
  Calendar,
  XCircle,
  Info,
  ChevronRight,
  Search,
  ChevronUp,
  Flame,
  Mail,
  Check,
  UserCheck,
  ArrowUpDown,
  History,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Plus,
  Trash2,
  Upload,
  Clock,
  Layers,
  Sparkles,
  Edit3,
  Monitor,
  PlusCircle,
  Activity,
  BarChart,
  Terminal,
  ArrowUp,
  ArrowDown,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { League, ActionTheme } from '../lib/types';
import { useEngine } from '../lib/store';
import { createAction, updateAction, deleteAction } from '@/app/actions/actions';
import { createPackage, configurePackageDeliveries, assignPackageToUsers, getCompanyUsers } from '@/app/actions/packages';
import { getBehaviouralJourneyFunnel, getEngagementLeaderboard, getDriversEffectiveness, getActionMetrics, getWeeklyActionChartData, type EngagementLeaderboardEntry, type DriversEffectivenessEntry, type ActionMetricEntry } from '@/app/actions/admin-analytics';
import { getCurrentISTDate, getCurrentISTTime, utcToISTDate, utcToISTTime, formatISTDate, formatISTTime } from '@/lib/timezone-utils';


/** Chart colors for action themes (Drivers Effectiveness). */
const THEME_CHART_COLORS: Record<string, string> = {
  Collaboration: '#60a5fa',
  Accountability: '#f87171',
  Feedback: '#4ade80',
  Connection: '#fbbf24',
  Coaching: '#a78bfa',
};


interface UserEngagementRow {
  id: string;
  name: string;
  totalPoints: number;
  streak: number;
  acceptedCount: number;
  validatedCount: number;
  habitStartedCount: number;
  league: League;
}

// --- SUB-VIEW: ACTION PERFORMANCE ---

const ActionPerformanceView: React.FC<{ companyId: string | null }> = ({ companyId }) => {
  const [driversData, setDriversData] = useState<DriversEffectivenessEntry[]>([]);
  const [actionMetrics, setActionMetrics] = useState<ActionMetricEntry[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setDriversData([]);
      setActionMetrics([]);
      setDriversError(null);
      setMetricsError(null);
      return;
    }
    setDriversLoading(true);
    setDriversError(null);
    getDriversEffectiveness(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setDriversError(error);
          setDriversData([]);
        } else {
          setDriversData(entries ?? []);
        }
      })
      .finally(() => setDriversLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setMetricsLoading(true);
    setMetricsError(null);
    getActionMetrics(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setMetricsError(error);
          setActionMetrics([]);
        } else {
          setActionMetrics(entries ?? []);
        }
      })
      .finally(() => setMetricsLoading(false));
  }, [companyId]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      <div className="bg-white border-4 border-black rounded-2xl p-4 sm:p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="text-base font-black heading-font uppercase italic mb-4 flex items-center gap-2">
          <Target size={18} className="text-red-500" /> Organizational Skill Drivers
        </h3>
        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">% of actions accepted by theme (all users)</p>
        {driversLoading ? (
          <div className="py-6 text-center text-slate-500 font-bold uppercase text-sm">Loading…</div>
        ) : driversError ? (
          <div className="py-6 text-center text-red-600 text-sm font-bold">{driversError}</div>
        ) : driversData.length === 0 ? (
          <div className="py-6 text-center text-slate-500 font-bold uppercase text-sm">No theme data yet</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {driversData.map((driver) => (
              <div key={driver.theme} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">{driver.theme}</span>
                  <span className="text-sm font-black italic">{driver.acceptancePct}%</span>
                </div>
                <div className="h-4 w-full bg-gray-100 border-2 border-black rounded-full overflow-hidden">
                  <div
                    className="h-full border-r-2 border-black transition-all duration-1000"
                    style={{ width: `${driver.acceptancePct}%`, backgroundColor: THEME_CHART_COLORS[driver.theme] ?? '#94a3b8' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="p-4 sm:p-5 border-b-4 border-black bg-gray-50">
          <h3 className="text-base sm:text-lg font-black heading-font uppercase italic">Micro-Action Performance Bank</h3>
          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">Ranked by conversion % (validated ÷ accepted)</p>
        </div>
        <div className="overflow-x-auto">
          {metricsLoading ? (
            <div className="p-8 text-center text-slate-500 font-bold uppercase text-sm">Loading…</div>
          ) : metricsError ? (
            <div className="p-8 text-center text-red-600 text-sm font-bold">{metricsError}</div>
          ) : actionMetrics.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-bold uppercase text-sm">No actions yet</div>
          ) : (
            <table className="w-full text-left table-fixed min-w-[720px] text-sm">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 w-12 text-center">Rank</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400">Action Identification</th>
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 text-center">Accepted</th>
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 text-center">Validated</th>
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 text-center">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actionMetrics.map((row, index) => (
                  <tr key={row.actionId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-black text-gray-400">#{index + 1}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-black italic break-words whitespace-normal line-clamp-2 max-w-[520px]">&quot;{row.title}&quot;</p>
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{row.theme}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-black text-blue-600">{row.acceptedCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-black text-emerald-600">{row.validatedCount}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full border border-black overflow-hidden">
                          <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, row.conversionPct)}%` }} />
                        </div>
                        <span className="text-[9px] font-black">{row.acceptedCount > 0 ? `${row.conversionPct}%` : '—'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// --- SUB-VIEW: USER ENGAGEMENT ---

const UserEngagementView: React.FC<{ companyId: string | null }> = ({ companyId }) => {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<UserEngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!companyId) {
      setRows([]);
      setError('Select a company');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getEngagementLeaderboard(companyId)
      .then(({ entries, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error);
          setRows([]);
          return;
        }
        const mapped: UserEngagementRow[] = (entries ?? []).map(
          (e: EngagementLeaderboardEntry) => ({
            id: e.id,
            name: e.name,
            totalPoints: e.totalPoints,
            streak: e.streak,
            acceptedCount: e.acceptedCount,
            validatedCount: e.validatedCount,
            habitStartedCount: e.habitStartedCount,
            league: e.league,
          })
        );
        setRows(mapped);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const filteredUsers = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.totalPoints - a.totalPoints);
    return sorted.filter((u) =>
      u.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [rows, search]);

  const getLevelBadgeColor = (level: League) => {
    switch (level) {
      case League.Diamond: return 'bg-purple-600 text-white';
      case League.Gold: return 'bg-[#FFCE00] text-black';
      case League.Silver: return 'bg-gray-300 text-black';
      case League.Bronze: return 'bg-orange-600 text-white';
      default: return 'bg-gray-100 text-gray-400';
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search team members..."
            className="w-full bg-white border-2 border-black rounded-xl py-2 pl-10 pr-4 text-[11px] font-black uppercase outline-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:shadow-none transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
            Loading engagement leaderboard…
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs font-bold text-red-600">
            {error}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-6 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
            No users found for this company.
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse table-fixed min-w-[760px] text-xs">
              <thead>
                <tr className="bg-black text-white border-b-2 border-black">
                  <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest border-r-2 border-white/10">
                    Rank / Name
                  </th>
                  <th className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-center">
                    Accepted
                  </th>
                  <th className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-center">
                    Validated
                  </th>
                  <th className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-center">
                    Habits Started
                  </th>
                  <th className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-center">
                    Streak
                  </th>
                  <th className="px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-center">
                    League / Pts
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user, index) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 transition-colors group"
                  >
                    <td className="px-3 py-2.5 border-r-2 border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-gray-300 italic">
                          #{index + 1}
                        </span>
                        <div className="w-8 h-8 bg-[#FFCE00] border-2 border-black rounded-full flex items-center justify-center font-black text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          {user.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] font-black truncate">
                            {user.name}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="text-xs font-black text-blue-600">
                        {user.acceptedCount}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="text-xs font-black text-green-600">
                        {user.validatedCount}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="text-[11px] font-black text-purple-600">
                        {user.habitStartedCount}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex items-center gap-0.5 justify-center">
                        <Flame
                          size={12}
                          className={
                            user.streak > 0
                              ? "text-orange-500 fill-current"
                              : "text-gray-200"
                          }
                        />
                        <span className="text-[11px] font-black">
                          {user.streak}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <div
                          className={`px-1.5 py-0.5 rounded-full border border-black text-[7px] font-black uppercase tracking-tighter ${getLevelBadgeColor(
                            user.league
                          )}`}
                        >
                          {user.league}
                        </div>
                        <span className="text-[11px] font-black tracking-tight">
                          {user.totalPoints}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// --- CONTROL PANEL (FULL ARCHITECT WIZARD) ---

const ControlPanelView: React.FC<{ companyId: string | null; role: string }> = ({ companyId, role }) => {
  const { allActions, refetch } = useEngine();
  const [step, setStep] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<ActionTheme | 'All'>('All');

  const [packageConfig, setPackageConfig] = useState({
    packageName: 'Q1 Manager Excellence',
    selectedActions: [] as any[],
    startDate: getCurrentISTDate(),
    durationWeeks: 8,
    activationTime: '09:00',
    segment: 'Global Management'
  });

  type DeliveryConfig = {
    weekNumber: number;
    deliveryDate: string;
    deliveryTime: string;
    actionIds: string[];
  };

  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig[]>([]);
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<number>>(new Set());

  // Sync deliveryConfig when durationWeeks changes
  const ensureWeekConfigs = React.useCallback((weeks: number) => {
    setDeliveryConfig((prev) => {
      const byWeek = new Map(prev.map((d) => [d.weekNumber, d]));
      const next: DeliveryConfig[] = [];
      for (let w = 1; w <= weeks; w++) {
        const existing = byWeek.get(w);
        if (existing) {
          next.push(existing);
        } else {
          // Calculate default delivery date for this week in IST (start date + (w-1)*7 days)
          const startDate = new Date(packageConfig.startDate);
          const weekOffset = (w - 1) * 7;
          const deliveryDate = new Date(startDate);
          deliveryDate.setDate(deliveryDate.getDate() + weekOffset);
          const defaultDate = deliveryDate.toISOString().split('T')[0];

          next.push({
            weekNumber: w,
            deliveryDate: defaultDate, // IST date
            deliveryTime: packageConfig.activationTime, // IST time
            actionIds: [],
          });
        }
      }
      return next;
    });
  }, [packageConfig.startDate, packageConfig.activationTime]);

  // Initialize deliveryConfig on mount
  React.useEffect(() => {
    if (deliveryConfig.length === 0) {
      ensureWeekConfigs(packageConfig.durationWeeks);
    }
  }, [packageConfig.durationWeeks, deliveryConfig.length, ensureWeekConfigs]);

  const filteredActionBank = useMemo(() => {
    return allActions.filter(a => categoryFilter === 'All' || a.theme === categoryFilter);
  }, [allActions, categoryFilter]);

  const [form, setForm] = useState({
    theme: 'Collaboration' as ActionTheme,
    title: '',
    how: '',
    why: '',
    timeEstimate: '5 mins',
  });
  const [successMsg, setSuccessMsg] = useState('');
  const [editingAction, setEditingAction] = useState<{ id: string; theme: ActionTheme; title: string; how: string; why: string; timeEstimate: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);

  const handleUpdateAction = async () => {
    if (!editingAction) return;
    const { error } = await updateAction(editingAction.id, {
      theme: editingAction.theme,
      title: editingAction.title,
      how: editingAction.how,
      why: editingAction.why,
      timeEstimate: editingAction.timeEstimate,
    });
    if (error) {
      setSuccessMsg(error);
      setTimeout(() => setSuccessMsg(''), 4000);
      return;
    }
    setEditingAction(null);
    await refetch();
    setSuccessMsg('Action updated');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleDeleteAction = async (id: string) => {
    setDeletingId(id);
    const { error } = await deleteAction(id);
    setDeletingId(null);
    if (error) {
      setSuccessMsg(error);
      setTimeout(() => setSuccessMsg(''), 4000);
      return;
    }
    await refetch();
    setSuccessMsg('Action deleted');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleQuickAdd = async () => {
    if (!form.title || !form.how || !form.why) return;
    if (!companyId) {
      setSuccessMsg('Select a company first');
      setTimeout(() => setSuccessMsg(''), 3000);
      return;
    }
    const { error } = await createAction({
      theme: form.theme,
      title: form.title,
      how: form.how,
      why: form.why,
      timeEstimate: form.timeEstimate,
      companyId: role === 'superadmin' ? companyId : undefined,
    });
    if (error) {
      setSuccessMsg(error);
      setTimeout(() => setSuccessMsg(''), 4000);
      return;
    }
    setSuccessMsg('Action added to bank!');
    setForm({ ...form, title: '', how: '', why: '' });
    await refetch();
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  React.useEffect(() => {
    if (companyId && step === 3) {
      getCompanyUsers(companyId).then(({ users }) => setCompanyUsers(users ?? []));
    }
  }, [companyId, step]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleDeploy = async () => {
    if (!companyId) return;
    if (packageConfig.selectedActions.length === 0) {
      setSuccessMsg('Select at least one action');
      setTimeout(() => setSuccessMsg(''), 3000);
      return;
    }

    // Check that at least one delivery has actions assigned
    const hasAssignedActions = deliveryConfig.some(d => d.actionIds.length > 0);
    if (!hasAssignedActions) {
      setSuccessMsg('Assign actions to at least one delivery week');
      setTimeout(() => setSuccessMsg(''), 3000);
      return;
    }

    setDeploying(true);
    const { id: pkgId, error: createErr } = await createPackage({
      name: packageConfig.packageName,
      startDate: packageConfig.startDate,
      durationWeeks: packageConfig.durationWeeks,
      activationTime: packageConfig.activationTime,
      companyId: role === 'superadmin' ? companyId : undefined,
    });
    if (createErr || !pkgId) {
      setSuccessMsg(createErr ?? 'Failed to create package');
      setDeploying(false);
      setTimeout(() => setSuccessMsg(''), 4000);
      return;
    }

    // Configure per-delivery schedules and actions
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
      setTimeout(() => setSuccessMsg(''), 4000);
      return;
    }

    if (selectedUserIds.length > 0) {
      const { error: assignErr } = await assignPackageToUsers(pkgId, selectedUserIds, packageConfig.startDate);
      if (assignErr) {
        setSuccessMsg(assignErr);
        setDeploying(false);
        setTimeout(() => setSuccessMsg(''), 4000);
        return;
      }
    }

    setDeploying(false);
    setSuccessMsg('Package deployed!');
    setPackageConfig({ ...packageConfig, selectedActions: [], packageName: '' });
    setDeliveryConfig([]);
    setSelectedUserIds([]);
    setStep(1);
    await refetch();
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const toggleAction = (action: any) => {
    const isSelected = packageConfig.selectedActions.some(a => a.id === action.id);
    if (isSelected) {
      setPackageConfig({
        ...packageConfig,
        selectedActions: packageConfig.selectedActions.filter(a => a.id !== action.id)
      });
    } else {
      setPackageConfig({
        ...packageConfig,
        selectedActions: [...packageConfig.selectedActions, action]
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {/* Top: Stepper Header */}
      <div className="flex items-center gap-3 bg-white border-4 border-black p-3 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full border-2 border-black flex items-center justify-center font-black text-sm transition-all ${step === s ? 'bg-[#FFCE00] scale-110' : step > s ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {step > s ? <Check size={16} strokeWidth={4} /> : s}
              </div>
              <div className="hidden md:block">
                <p className={`text-[9px] font-black uppercase tracking-widest leading-none ${step >= s ? 'text-black' : 'text-gray-300'}`}>
                  {s === 1 ? 'Architect Content' : s === 2 ? 'Schedule' : 'Enroll & Deploy'}
                </p>
              </div>
            </div>
            {s < 3 && <div className="flex-1 h-0.5 bg-gray-100 mx-2 rounded-full" />}
          </React.Fragment>
        ))}
      </div>

      {/* Main Layout: 1/3 Action Creator + 2/3 Wizard Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1/3: Architect New Action */}
        <div className="lg:col-span-1">
          <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(54,153,252,1)] flex flex-col sticky top-24">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-black heading-font uppercase italic flex items-center gap-2">
                <PlusCircle size={18} className="text-blue-500" /> Architect New Action
              </h3>
              {successMsg && <span className="text-[9px] font-black uppercase text-emerald-500 animate-pulse">{successMsg}</span>}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Theme</label>
                  <select
                    className="w-full bg-gray-50 border-2 border-black rounded-xl p-2.5 text-[9px] font-black uppercase"
                    value={form.theme}
                    onChange={e => setForm({ ...form, theme: e.target.value as ActionTheme })}
                  >
                    <option value="Collaboration">Collaboration</option>
                    <option value="Accountability">Accountability</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Connection">Connection</option>
                    <option value="Coaching">Coaching</option>
                  </select>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Est. Time</label>
                  <select
                    className="w-full bg-gray-50 border-2 border-black rounded-xl p-2.5 text-[9px] font-black uppercase"
                    value={form.timeEstimate}
                    onChange={e => setForm({ ...form, timeEstimate: e.target.value })}
                  >
                    <option>2 mins</option><option>5 mins</option><option>15 mins</option>
                  </select>
                </div>
              </div>

              <div className="space-y-0.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">What (Objective Headline)</label>
                <input
                  type="text"
                  placeholder="e.g. End meetings with summary..."
                  className="w-full bg-gray-50 border-2 border-black rounded-xl p-2.5 text-[11px] font-bold italic"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="space-y-0.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">How (Tactical Step)</label>
                <textarea
                  placeholder="Specify the exact verbal or digital cue..."
                  className="w-full bg-gray-50 border-2 border-black rounded-xl p-2.5 text-[11px] font-medium min-h-[56px]"
                  value={form.how}
                  onChange={e => setForm({ ...form, how: e.target.value })}
                />
              </div>

              <div className="space-y-0.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Why (Behavioral Logic)</label>
                <textarea
                  placeholder="Explain the cognitive impact..."
                  className="w-full bg-gray-50 border-2 border-black rounded-xl p-2.5 text-[11px] font-medium min-h-[56px]"
                  value={form.why}
                  onChange={e => setForm({ ...form, why: e.target.value })}
                />
              </div>

            </div>

            <button
              onClick={handleQuickAdd}
              className="w-full mt-5 py-3 bg-[#FFCE00] border-2 border-black rounded-xl font-black uppercase text-[10px] tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-0.5 transition-all"
            >
              Register to Bank
            </button>
          </div>
        </div>

        {/* Right 2/3: Wizard Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* STEP 1: ARCHITECT CONTENT */}
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              {/* Action Library (CRUD) */}
              <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-base font-black heading-font uppercase italic mb-4 flex items-center gap-2">
                  <Edit3 size={18} className="text-blue-500" /> Action Library
                </h3>
                <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b-2 border-black">
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">Action</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">Theme</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allActions.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <p className="text-xs font-bold truncate max-w-[200px]">{a.title}</p>
                          </td>
                          <td className="px-3 py-2 text-[9px] font-bold text-gray-500">{a.theme}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => setEditingAction({ id: a.id, theme: a.theme, title: a.title, how: a.how, why: a.why, timeEstimate: a.timeEstimate })}
                              className="px-2 py-1 mr-1 bg-slate-100 border-2 border-black rounded-lg text-[9px] font-black uppercase hover:bg-blue-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteAction(a.id)}
                              disabled={deletingId === a.id}
                              className="px-2 py-1 bg-red-50 border-2 border-red-200 rounded-lg text-[9px] font-black uppercase text-red-600 hover:bg-red-100 disabled:opacity-50"
                            >
                              {deletingId === a.id ? '…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {allActions.length === 0 && (
                  <p className="text-xs text-gray-400 py-4 text-center">No actions yet. Create one in the panel to the right.</p>
                )}
              </div>

              {/* Edit modal */}
              {editingAction && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingAction(null)}>
                  <div className="bg-white border-4 border-black rounded-2xl p-6 max-w-lg w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" onClick={e => e.stopPropagation()}>
                    <h4 className="text-base font-black uppercase mb-4">Edit Action</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400">Theme</label>
                        <select value={editingAction.theme} onChange={e => setEditingAction({ ...editingAction, theme: e.target.value as ActionTheme })} className="w-full border-2 border-black rounded-lg p-2 text-xs font-bold">
                          {['Collaboration', 'Accountability', 'Feedback', 'Connection', 'Coaching'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400">Title</label>
                        <input value={editingAction.title} onChange={e => setEditingAction({ ...editingAction, title: e.target.value })} className="w-full border-2 border-black rounded-lg p-2 text-xs" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400">How</label>
                        <textarea value={editingAction.how} onChange={e => setEditingAction({ ...editingAction, how: e.target.value })} className="w-full border-2 border-black rounded-lg p-2 text-xs min-h-[50px]" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-gray-400">Why</label>
                        <textarea value={editingAction.why} onChange={e => setEditingAction({ ...editingAction, why: e.target.value })} className="w-full border-2 border-black rounded-lg p-2 text-xs min-h-[50px]" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingAction(null)} className="flex-1 py-2 border-2 border-black rounded-lg font-black uppercase text-xs">Cancel</button>
                        <button onClick={handleUpdateAction} className="flex-1 py-2 bg-[#FFCE00] border-2 border-black rounded-lg font-black uppercase text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">Save</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Identity Card */}
              <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-base font-black heading-font uppercase italic mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-blue-500" /> Package Definition
                </h3>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-gray-400 tracking-widest px-0.5">Package Name</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border-2 border-black rounded-xl p-3 text-xs font-black outline-none focus:border-blue-500 transition-all"
                    value={packageConfig.packageName}
                    onChange={e => setPackageConfig({ ...packageConfig, packageName: e.target.value })}
                  />
                </div>
              </div>

              {/* Action Bank Selection */}
              <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <h3 className="text-base font-black heading-font uppercase italic">Strategic Action Bank</h3>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border-2 border-black">
                    {['All', 'Collaboration', 'Feedback', 'Accountability', 'Connection', 'Coaching'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat as any)}
                        className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${categoryFilter === cat ? 'bg-black text-white' : 'text-gray-400 hover:text-black'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                  {filteredActionBank.map((action) => {
                    const isSelected = packageConfig.selectedActions.some(a => a.id === action.id);
                    return (
                      <div
                        key={action.id}
                        className={`p-4 border-2 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-4 ${isSelected ? 'bg-emerald-50 border-emerald-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-white border-black hover:bg-slate-50'}`}
                        onClick={() => toggleAction(action)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 text-white' : 'bg-white text-gray-200'}`}>
                            {isSelected ? <Check size={20} strokeWidth={4} /> : <Plus size={20} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black italic leading-tight truncate max-w-[320px]">"{action.title}"</p>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{action.theme}</span>
                          </div>
                        </div>
                        <span className="text-[9px] font-black text-gray-300 uppercase shrink-0">{action.timeEstimate}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PULSE LOGIC (SCHEDULING) */}
          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-base font-black heading-font uppercase italic mb-4">Campaign Pulse Logic</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-widest px-0.5">Campaign Start Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input type="date" className="w-full bg-gray-50 border-2 border-black rounded-xl p-3 pl-10 text-xs font-black" value={packageConfig.startDate} onChange={e => setPackageConfig({ ...packageConfig, startDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-widest px-0.5">Package Activation Time IST (Fallback)</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input type="time" className="w-full bg-gray-50 border-2 border-black rounded-xl p-3 pl-10 text-xs font-black" value={packageConfig.activationTime} onChange={e => setPackageConfig({ ...packageConfig, activationTime: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-widest px-0.5">Duration (Number of Weeks)</label>
                      <div className="flex items-center bg-gray-50 border-2 border-black rounded-xl overflow-hidden h-[48px]">
                        <button onClick={() => {
                          const nextWeeks = Math.max(1, packageConfig.durationWeeks - 1);
                          setPackageConfig({ ...packageConfig, durationWeeks: nextWeeks });
                          ensureWeekConfigs(nextWeeks);
                        }} className="px-4 h-full hover:bg-black hover:text-white transition-colors"><Minus size={16} strokeWidth={4} /></button>
                        <span className="flex-1 text-center font-black text-sm">{packageConfig.durationWeeks} Weeks</span>
                        <button onClick={() => {
                          const nextWeeks = packageConfig.durationWeeks + 1;
                          setPackageConfig({ ...packageConfig, durationWeeks: nextWeeks });
                          ensureWeekConfigs(nextWeeks);
                        }} className="px-4 h-full hover:bg-black hover:text-white transition-colors"><Plus size={16} strokeWidth={4} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Per-Delivery Configuration */}
              <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-base font-black heading-font uppercase italic mb-2">Delivery Schedule & Actions</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Configure date, time, and actions for each weekly delivery</p>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                  {deliveryConfig.map((d, idx) => {
                    const weekActions = d.actionIds
                      .map((id) => packageConfig.selectedActions.find((a) => a.id === id))
                      .filter(Boolean);

                    const showActionSelect = expandedDeliveries.has(d.weekNumber);
                    const toggleActionSelect = () => {
                      setExpandedDeliveries(prev => {
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
                        className="bg-slate-50 border-2 border-black rounded-xl p-3 hover:border-blue-500 transition-all"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                          {/* Week Label */}
                          <div className="flex items-center gap-2 lg:w-20 shrink-0">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                              W{d.weekNumber}
                            </span>
                          </div>

                          {/* Date Input */}
                          <div className="lg:w-[160px] shrink-0">
                            <label className="text-[8px] font-black uppercase text-gray-400 tracking-widest block mb-1">Date (IST)</label>
                            <input
                              type="date"
                              className="w-full bg-white border-2 border-black rounded-lg p-2 text-[10px] font-black"
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

                          {/* Time Input */}
                          <div className="lg:w-[110px] shrink-0">
                            <label className="text-[8px] font-black uppercase text-gray-400 tracking-widest block mb-1">Time (IST)</label>
                            <input
                              type="time"
                              className="w-full bg-white border-2 border-black rounded-lg p-2 text-[10px] font-black"
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

                          {/* Assigned Actions Display */}
                          <div className="flex-1 min-w-0">
                            <label className="text-[8px] font-black uppercase text-gray-400 tracking-widest block mb-1">
                              Assigned Actions ({weekActions.length})
                            </label>
                            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-2.5 min-h-[42px]">
                              {weekActions.length === 0 ? (
                                <p className="text-[9px] text-gray-400 font-bold uppercase">
                                  No actions assigned
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {weekActions.map((a) => (
                                    <div
                                      key={a!.id}
                                      className="text-[10px] font-black text-slate-800 leading-tight"
                                      title={a!.title}
                                    >
                                      • "{a!.title}"
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Select Actions Button */}
                          <div className="lg:w-[90px] shrink-0">
                            <label className="text-[8px] font-black uppercase text-gray-400 tracking-widest block mb-1 opacity-0">Action</label>
                            <button
                              onClick={toggleActionSelect}
                              className={`w-full px-3 py-2 rounded-lg border-2 border-black font-black text-[9px] uppercase tracking-widest transition-all ${showActionSelect
                                ? 'bg-blue-500 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                                : 'bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                              {showActionSelect ? 'Close' : 'Select'}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Action Selection */}
                        {showActionSelect && (
                          <div className="mt-3 pt-3 border-t-2 border-dashed border-gray-300">
                            <div className="max-h-56 overflow-y-auto border-2 border-gray-200 rounded-lg bg-white">
                              {packageConfig.selectedActions.length === 0 ? (
                                <p className="text-[9px] text-gray-400 font-bold uppercase text-center py-3">
                                  Add actions in Step 1 first
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0">
                                  {packageConfig.selectedActions.map((a) => {
                                    const checked = d.actionIds.includes(a.id);
                                    // Check if this action is assigned to another delivery
                                    const assignedToOther = deliveryConfig.some(
                                      (delivery) =>
                                        delivery.weekNumber !== d.weekNumber &&
                                        delivery.actionIds.includes(a.id)
                                    );
                                    const isDisabled = assignedToOther && !checked;

                                    return (
                                      <label
                                        key={a.id}
                                        className={`flex items-start gap-2.5 px-3 py-2.5 text-[10px] border-b border-r border-gray-100 transition-colors ${isDisabled
                                          ? 'opacity-40 cursor-not-allowed bg-gray-50'
                                          : 'cursor-pointer hover:bg-blue-50'
                                          }`}
                                        title={isDisabled ? 'Already assigned to another delivery' : a.title}
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
                                                      ? w.actionIds.filter((id) => id !== a.id)
                                                      : [...w.actionIds, a.id],
                                                  }
                                                  : w
                                              )
                                            )
                                          }
                                        />
                                        <span className={`font-bold leading-snug ${isDisabled ? 'line-through' : ''}`}>
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
              <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-base font-black heading-font uppercase italic mb-2 flex items-center gap-2">
                  <Users2 size={18} className="text-blue-500" /> User Enrollment
                </h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Select users to enroll in this package (optional)
                </p>
                <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                  {companyUsers.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => toggleUser(u.id)}
                      className={`p-3 border-2 rounded-xl cursor-pointer transition-all flex items-center gap-3 ${
                        selectedUserIds.includes(u.id)
                          ? 'bg-emerald-50 border-emerald-500'
                          : 'bg-slate-50 border-black hover:bg-slate-100'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center font-black text-sm ${
                          selectedUserIds.includes(u.id) ? 'bg-emerald-500 text-white' : 'bg-white'
                        }`}
                      >
                        {(u.full_name ?? '?').substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-bold truncate flex-1">{u.full_name ?? 'Unknown'}</span>
                      {selectedUserIds.includes(u.id) && (
                        <Check size={20} className="text-emerald-600 shrink-0" strokeWidth={3} />
                      )}
                    </div>
                  ))}
                </div>
                {companyUsers.length === 0 && (
                  <p className="text-xs text-gray-400 py-6 text-center">No users in this company yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Wizard Navigation */}
          <div className="flex justify-between items-center px-1">
            <button
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
              className={`px-6 py-3 rounded-xl border-2 border-black font-black uppercase text-[10px] tracking-widest transition-all ${step === 1 ? 'opacity-20 cursor-not-allowed' : 'bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none'}`}
            >
              Previous Stage
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(s => Math.min(3, s + 1))}
                className="px-6 py-3 bg-[#FFCE00] rounded-xl border-2 border-black font-black uppercase text-[10px] tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none flex items-center gap-2"
              >
                Next Stage <ChevronRight size={16} strokeWidth={4} />
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                disabled={deploying || packageConfig.selectedActions.length === 0}
                className="px-8 py-3 bg-emerald-500 text-white rounded-xl border-2 border-black font-black uppercase text-xs tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deploying ? 'Deploying…' : 'Deploy Package'} <Sparkles size={16} fill="white" />
              </button>
            )}
          </div>

          {/* Package Management (Step 2+) */}
          {step >= 2 && (
            <div className="space-y-4">
              {/* Package Overview */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-4 border-black rounded-2xl p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-sm font-black heading-font uppercase italic mb-3 flex items-center gap-2">
                  <Layers size={16} className="text-purple-600" /> Package Overview
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="flex flex-col justify-between p-3 bg-white/60 rounded-lg border border-black/10">
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest mb-1">Total Actions</span>
                    <span className="text-2xl font-black text-purple-600">{packageConfig.selectedActions.length}</span>
                  </div>
                  <div className="flex flex-col justify-between p-3 bg-white/60 rounded-lg border border-black/10">
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest mb-1">Deliveries</span>
                    <span className="text-2xl font-black text-blue-600">{packageConfig.durationWeeks}</span>
                  </div>
                  <div className="flex flex-col justify-between p-3 bg-white/60 rounded-lg border border-black/10">
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest mb-1">Assigned</span>
                    <span className="text-2xl font-black text-emerald-600">
                      {deliveryConfig.reduce((sum, d) => sum + d.actionIds.length, 0)}
                    </span>
                  </div>
                  <div className="flex flex-col justify-between p-3 bg-white/60 rounded-lg border border-black/10">
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest mb-1">Unassigned</span>
                    <span className="text-2xl font-black text-orange-600">
                      {packageConfig.selectedActions.length - deliveryConfig.reduce((sum, d) => sum + d.actionIds.length, 0)}
                    </span>
                  </div>
                  {step === 3 && (
                    <div className="flex flex-col justify-between p-3 bg-white/60 rounded-lg border border-black/10">
                      <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest mb-1">Users Selected</span>
                      <span className="text-2xl font-black text-blue-600">{selectedUserIds.length}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Status (Step 2) */}
              {step === 2 && deliveryConfig.length > 0 && (
                <div className="bg-white border-4 border-black rounded-2xl p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black heading-font uppercase italic flex items-center gap-2">
                      <Calendar size={16} className="text-emerald-600" /> Delivery Status
                    </h3>
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1 bg-blue-50 rounded border border-blue-200">
                      All times in IST
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {deliveryConfig.map((d) => {
                      const hasActions = d.actionIds.length > 0;
                      return (
                        <div
                          key={d.weekNumber}
                          className={`p-2 rounded-lg border-2 transition-all ${hasActions
                            ? 'bg-emerald-50 border-emerald-500'
                            : 'bg-gray-50 border-gray-200'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                              W{d.weekNumber}
                            </span>
                            <div className={`px-1.5 py-0.5 rounded-full border-2 border-black text-[8px] font-black ${hasActions
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white text-gray-300'
                              }`}>
                              {d.actionIds.length}
                            </div>
                          </div>
                          <div className="text-[8px] font-bold text-gray-500">
                            {d.deliveryDate.split('-').slice(1).join('/')}
                          </div>
                          <div className="text-[8px] font-bold text-gray-500">
                            {d.deliveryTime}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {deliveryConfig.some(d => d.actionIds.length === 0) && (
                    <div className="mt-3 p-2 bg-amber-50 border-2 border-amber-200 rounded-lg">
                      <p className="text-[8px] font-bold text-amber-700 uppercase tracking-wide">
                        ⚠️ Some deliveries have no actions assigned
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- ANALYZE CHANGE (BEHAVIOURAL JOURNEY FUNNEL) ---

interface FunnelData {
  usersCount: number;
  totalActionsDelivered: number;
  averageActionsPerUser: number;
  intentionTotal: number;
  intentionIncludingHabits: number;
  actionsValidated: number;
  actionsValidatedIncludingHabits: number;
  habitsTotal: number;
  habitsOngoing: number;
  habitsCemented: number;
  consistentlyActivePct: number;
  consistentlyActiveUsersCount: number;
  actionReadersCount: number;
  actionReadersPct: number;
  habitStartersCount: number;
  habitStartersPct: number;
  actionTakersCount: number;
  actionTakersPct: number;
  inactiveUsersCount: number;
  inactiveUsersPct: number;
}

const AnalyzeChangeView: React.FC<{ companyId: string | null }> = ({ companyId }) => {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [driversChartData, setDriversChartData] = useState<{ name: string; score: number; color: string }[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [adoptionIndexMetrics, setAdoptionIndexMetrics] = useState<ActionMetricEntry[]>([]);
  const [adoptionIndexLoading, setAdoptionIndexLoading] = useState(false);
  const [weeklyChartData, setWeeklyChartData] = useState<{ name: string; Accepted: number; Skipped: number; Successful: number }[]>([]);
  const [weeklyChartLoading, setWeeklyChartLoading] = useState(false);

  const engagementSegments = funnel
    ? [
      {
        label: 'ACTION READERS',
        sub: '(≥1 USER ACTION)',
        value: `${funnel.actionReadersPct}%`,
        color: '#2ecc71',
      },
      {
        label: 'HABIT STARTERS',
        sub: '(HABIT STARTED)',
        value: `${funnel.habitStartersPct}%`,
        color: '#FFCE00',
      },
      {
        label: 'ACTION TAKERS',
        sub: '(VALIDATED)',
        value: `${funnel.actionTakersPct}%`,
        color: '#3699FC',
      },
      {
        label: 'INACTIVE USERS',
        sub: '(0 USER ACTIONS)',
        value: `${funnel.inactiveUsersPct}%`,
        color: '#f87171',
      },
    ]
    : [];

  useEffect(() => {
    if (!companyId) {
      setFunnel(null);
      setFunnelError("Select a company");
      setFunnelLoading(false);
      return;
    }
    setFunnelLoading(true);
    setFunnelError(null);
    getBehaviouralJourneyFunnel(companyId)
      .then((res) => {
        if (res.error) {
          setFunnelError(res.error);
          setFunnel(null);
        } else {
          setFunnel({
            usersCount: res.usersCount ?? 0,
            totalActionsDelivered: res.totalActionsDelivered ?? 0,
            averageActionsPerUser: res.averageActionsPerUser ?? 0,
            intentionTotal: res.intentionTotal ?? 0,
            intentionIncludingHabits: res.intentionIncludingHabits ?? 0,
            actionsValidated: res.actionsValidated ?? 0,
            actionsValidatedIncludingHabits: res.actionsValidatedIncludingHabits ?? 0,
            habitsTotal: res.habitsTotal ?? 0,
            habitsOngoing: res.habitsOngoing ?? 0,
            habitsCemented: res.habitsCemented ?? 0,
            consistentlyActivePct: res.consistentlyActivePct ?? 0,
            consistentlyActiveUsersCount: res.consistentlyActiveUsersCount ?? 0,
            actionReadersCount: res.actionReadersCount ?? 0,
            actionReadersPct: res.actionReadersPct ?? 0,
            habitStartersCount: res.habitStartersCount ?? 0,
            habitStartersPct: res.habitStartersPct ?? 0,
            actionTakersCount: res.actionTakersCount ?? 0,
            actionTakersPct: res.actionTakersPct ?? 0,
            inactiveUsersCount: res.inactiveUsersCount ?? 0,
            inactiveUsersPct: res.inactiveUsersPct ?? 0,
          });
        }
      })
      .finally(() => setFunnelLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setDriversChartData([]);
      setDriversError(null);
      return;
    }
    setDriversLoading(true);
    setDriversError(null);
    getDriversEffectiveness(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setDriversError(error);
          setDriversChartData([]);
          return;
        }
        const chart = (entries ?? []).map((e: DriversEffectivenessEntry) => ({
          name: e.theme,
          score: e.acceptancePct,
          color: THEME_CHART_COLORS[e.theme] ?? '#94a3b8',
        }));
        setDriversChartData(chart);
      })
      .finally(() => setDriversLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setAdoptionIndexMetrics([]);
      return;
    }
    setAdoptionIndexLoading(true);
    getActionMetrics(companyId)
      .then(({ entries, error }) => {
        if (!error && entries?.length) setAdoptionIndexMetrics(entries);
        else setAdoptionIndexMetrics([]);
      })
      .finally(() => setAdoptionIndexLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setWeeklyChartData([]);
      return;
    }
    setWeeklyChartLoading(true);
    getWeeklyActionChartData(companyId)
      .then(({ entries, error }) => {
        if (error) {
          setWeeklyChartData([]);
          return;
        }
        const chart = (entries ?? []).map((e) => ({
          name: e.name,
          Accepted: e.accepted,
          Skipped: e.skipped,
          Successful: e.successful,
        }));
        setWeeklyChartData(chart);
      })
      .finally(() => setWeeklyChartLoading(false));
  }, [companyId]);

  const top3Adoption = adoptionIndexMetrics.slice(0, 3);
  const bottom3Resistance = adoptionIndexMetrics.slice(-3).reverse();
  const habitPieData = funnel
    ? [
      { name: 'Ongoing', value: funnel.habitsOngoing, color: '#FFCE00' },
      { name: 'Cemented', value: funnel.habitsCemented, color: '#22C55E' },
    ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">

      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-black pb-4">
        <div className="space-y-0.5">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black uppercase italic heading-font leading-none">GLOBAL ADMIN PORTAL</h2>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">REAL-TIME ORGANIZATIONAL BEHAVIOR INSIGHTS</p>
        </div>
        <button className="bg-white border-2 border-black px-4 py-2 rounded-xl font-black uppercase text-[9px] tracking-widest shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5">
          <Download size={14} strokeWidth={3} /> Download Report
        </button>
      </div>

      {/* TOP SUMMARY CARDS */}
      <div className="grid grid-cols-12 gap-4">
        {/* Consistently Active Card */}
        <div className="col-span-12 lg:col-span-8 bg-[#2ecc71] border-4 border-black rounded-2xl p-4 sm:p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex items-center gap-4 sm:gap-6 relative overflow-hidden group">
          <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white border-2 border-black rounded-full flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
            <Trophy size={36} className="text-[#2ecc71] sm:hidden" strokeWidth={2.5} />
            <Trophy size={44} className="text-[#2ecc71] hidden sm:block" strokeWidth={2.5} />
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            <h3 className="text-base sm:text-xl md:text-2xl font-black leading-tight heading-font uppercase italic">CONSISTENTLY ACTIVE USERS</h3>
            <p className="text-[10px] sm:text-xs font-bold text-black/60 uppercase tracking-widest">YOUR BEHAVIORAL CHAMPIONS BUILDING CORE HABITS</p>
            <div className="flex items-center gap-4 flex-wrap">
              {funnel && funnel.usersCount > 0 ? (
                <span className="text-2xl sm:text-4xl font-black">
                  {Math.round((funnel.consistentlyActiveUsersCount / funnel.usersCount) * 100)}%
                </span>
              ) : (
                <span className="text-2xl sm:text-4xl font-black">—</span>
              )}
              <span className="text-sm sm:text-base font-bold text-black/80">
                {funnel ? funnel.consistentlyActiveUsersCount.toLocaleString() : '—'} of {funnel?.usersCount ?? '—'} users
              </span>
              <div className="ml-auto opacity-20"><TrendingUp size={32} strokeWidth={4} /></div>
            </div>
          </div>
        </div>

        {/* Inactive Users Card */}
        <div className="col-span-12 lg:col-span-4 bg-[#FFCE00] border-4 border-black rounded-2xl p-4 sm:p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} strokeWidth={3} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">ATTENTION REQUIRED</span>
            </div>
            <div>
              <h4 className="text-base sm:text-xl font-black heading-font italic uppercase leading-none mb-1">INACTIVE USERS</h4>
              <p className="text-2xl sm:text-4xl lg:text-5xl font-black text-red-600 leading-none">
                {funnel ? funnel.inactiveUsersCount.toLocaleString() : '—'}
              </p>
            </div>
          </div>
          <button className="w-full bg-black text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] active:translate-y-0.5 active:shadow-none transition-all mt-4">
            NUDGE STRATEGY
          </button>
        </div>
      </div>

      {/* BEHAVIORAL JOURNEY FUNNEL */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">BEHAVIORAL JOURNEY FUNNEL</h3>
          <span className="bg-slate-50 text-slate-400 px-2 py-0.5 rounded text-[8px] font-black uppercase border border-slate-100">COMPANY DATA</span>
        </div>
        {funnelLoading && (
          <div className="bg-white border-2 border-black rounded-xl p-8 text-center text-slate-500 font-bold uppercase text-sm">Loading funnel…</div>
        )}
        {funnelError && !funnelLoading && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-red-700 text-sm font-bold">{funnelError}</div>
        )}
        {funnel && !funnelLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Knowledge: total actions delivered; show average per user in card */}
            <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex justify-between items-center mb-4">
                <div className="w-10 h-10 border-2 border-black rounded-xl flex items-center justify-center text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" style={{ backgroundColor: '#A855F7' }}>
                  <Eye size={20} strokeWidth={3} />
                </div>
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest">KNOWLEDGE</span>
              </div>
              <span className="text-2xl sm:text-3xl font-black block leading-none mb-0.5">{funnel.totalActionsDelivered.toLocaleString()}</span>
              <span className="text-[9px] font-black uppercase text-slate-400 mb-1 block tracking-widest">VIEW RATE</span>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Average {funnel.averageActionsPerUser} actions per user</p>
            </div>
            {/* 2. Intention: actions accepted; bottom = including habits */}
            <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex justify-between items-center mb-4">
                <div className="w-10 h-10 border-2 border-black rounded-xl flex items-center justify-center text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" style={{ backgroundColor: '#F97316' }}>
                  <MousePointer2 size={20} strokeWidth={3} />
                </div>
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest">INTENTION</span>
              </div>
              <span className="text-2xl sm:text-3xl font-black block leading-none mb-0.5">{funnel.intentionTotal.toLocaleString()}</span>
              <span className="text-[9px] font-black uppercase text-slate-400 mb-1 block tracking-widest">ACCEPTED</span>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{funnel.intentionIncludingHabits.toLocaleString()} including habits</p>
            </div>
            {/* 3. Actions: validated/completed; bottom = including habits */}
            <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex justify-between items-center mb-4">
                <div className="w-10 h-10 border-2 border-black rounded-xl flex items-center justify-center text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" style={{ backgroundColor: '#3B82F6' }}>
                  <CheckCircle2 size={20} strokeWidth={3} />
                </div>
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest">ACTIONS</span>
              </div>
              <span className="text-2xl sm:text-3xl font-black block leading-none mb-0.5">{funnel.actionsValidated.toLocaleString()}</span>
              <span className="text-[9px] font-black uppercase text-slate-400 mb-1 block tracking-widest">VALIDATED</span>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{funnel.actionsValidatedIncludingHabits.toLocaleString()} including habits</p>
            </div>
            {/* 4. Habits: converted to habits; bottom = ongoing + cemented */}
            <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex justify-between items-center mb-4">
                <div className="w-10 h-10 border-2 border-black rounded-xl flex items-center justify-center text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" style={{ backgroundColor: '#22C55E' }}>
                  <RefreshCw size={20} strokeWidth={3} />
                </div>
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest">HABITS</span>
              </div>
              <span className="text-2xl sm:text-3xl font-black block leading-none mb-0.5">{funnel.habitsTotal.toLocaleString()}</span>
              <span className="text-[9px] font-black uppercase text-slate-400 mb-1 block tracking-widest">REPETITIONS</span>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ongoing: {funnel.habitsOngoing} · Cemented: {funnel.habitsCemented}</p>
            </div>
          </div>
        )}
      </div>

      {/* DRIVERS EFFECTIVENESS & ENGAGEMENT BREAKDOWN */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-base font-black heading-font uppercase italic">DRIVERS EFFECTIVENESS</h3>
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">% of actions accepted by theme</span>
            <Download size={16} className="text-slate-300" strokeWidth={3} />
          </div>
          <div className="h-[260px] w-full">
            {driversLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold uppercase text-sm">Loading…</div>
            ) : driversError ? (
              <div className="h-full flex items-center justify-center text-red-600 text-sm font-bold">{driversError}</div>
            ) : driversChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold uppercase text-sm">No theme data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={driversChartData} layout="vertical" margin={{ left: 80, right: 40 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fontWeight: 900 }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '16px', border: '3px solid black', fontWeight: 900 }}
                    formatter={(value: number | undefined) => [
                      value == null ? '—' : `${value}%`,
                      'Accepted',
                    ]}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={24} name="Accepted %">
                    {driversChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="black" strokeWidth={3} />)}
                  </Bar>
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <h3 className="text-base font-black heading-font uppercase italic mb-4">USER ENGAGEMENT</h3>
          <div className="space-y-3">
            {engagementSegments.map((e) => (
              <div key={e.label} className="flex items-center justify-between p-3 border-2 border-black rounded-xl group hover:translate-x-0.5 transition-transform">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center" style={{ backgroundColor: e.color }}>
                    <Circle size={8} fill="black" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase leading-none">{e.label}</p>
                    <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{e.sub}</p>
                  </div>
                </div>
                <span className="text-xl font-black">{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <h3 className="text-base font-black heading-font uppercase italic mb-4">WEEKLY ACTIONS</h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Per delivery (actions × users)</p>
          <div className="h-[280px] w-full">
            {weeklyChartLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold uppercase text-sm">Loading…</div>
            ) : weeklyChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold uppercase text-sm">No delivery data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={weeklyChartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 900 }} axisLine={{ stroke: '#000', strokeWidth: 3 }} />
                  <YAxis axisLine={{ stroke: '#000', strokeWidth: 3 }} tick={{ fontSize: 9, fontWeight: 900 }} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: '3px solid black', fontWeight: 900 }} />
                  <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '30px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }} />
                  <Bar dataKey="Accepted" fill="#2ecc71" barSize={8} radius={[2, 2, 0, 0]} stroke="black" strokeWidth={1} />
                  <Bar dataKey="Skipped" fill="#FFCE00" barSize={8} radius={[2, 2, 0, 0]} stroke="black" strokeWidth={1} />
                  <Bar dataKey="Successful" fill="#3699FC" barSize={8} radius={[2, 2, 0, 0]} stroke="black" strokeWidth={1} />
                </ReBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
        <section className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <h3 className="text-base font-black heading-font uppercase italic mb-4">HABITS BY PHASE</h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Ongoing vs cemented</p>
          <div className="h-[280px] w-full">
            {funnelLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold uppercase text-sm">Loading…</div>
            ) : habitPieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold uppercase text-sm">No habit data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={habitPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    stroke="black"
                    strokeWidth={2}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {habitPieData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '16px', border: '3px solid black', fontWeight: 900 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ACTION ADOPTION INDEX */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">ACTION ADOPTION INDEX</h3>
          <span className="bg-slate-50 text-slate-300 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-slate-100">GLOBAL BENCHMARKING</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Highest Adoption Card – top 3 by conversion (Micro-Action Performance Bank) */}
          <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(34,197,94,1)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 border-2 border-black rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <ThumbsUp size={20} strokeWidth={3} />
              </div>
              <h4 className="text-base font-black uppercase italic tracking-tight heading-font">HIGHEST ADOPTION</h4>
            </div>
            {adoptionIndexLoading ? (
              <div className="py-6 text-center text-slate-500 font-bold uppercase text-sm">Loading…</div>
            ) : top3Adoption.length === 0 ? (
              <div className="py-6 text-center text-slate-500 font-bold uppercase text-sm">No action data yet</div>
            ) : (
              <div className="space-y-3">
                {top3Adoption.map((a, i) => (
                  <div key={a.actionId} className="flex items-center justify-between p-3 border-2 border-black rounded-xl bg-white hover:bg-emerald-50 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base font-black italic text-emerald-600/40 shrink-0">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-black leading-tight uppercase truncate">&quot;{a.title}&quot;</p>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{a.theme}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-black leading-none">{a.acceptedCount > 0 ? `${a.conversionPct}%` : '—'}</p>
                      <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Conversion</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Highest Resistance Card – bottom 3 by conversion (Micro-Action Performance Bank) */}
          <div className="bg-white border-4 border-black rounded-2xl p-5 shadow-[6px_6px_0px_0px_rgba(248,113,113,1)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 border-2 border-black rounded-xl flex items-center justify-center bg-red-50 text-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <ThumbsDown size={20} strokeWidth={3} />
              </div>
              <h4 className="text-base font-black uppercase italic tracking-tight heading-font">HIGHEST RESISTANCE</h4>
            </div>
            {adoptionIndexLoading ? (
              <div className="py-6 text-center text-slate-500 font-bold uppercase text-sm">Loading…</div>
            ) : bottom3Resistance.length === 0 ? (
              <div className="py-6 text-center text-slate-500 font-bold uppercase text-sm">No action data yet</div>
            ) : (
              <div className="space-y-3">
                {bottom3Resistance.map((a, i) => (
                  <div key={a.actionId} className="flex items-center justify-between p-3 border-2 border-black rounded-xl bg-white hover:bg-red-50 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base font-black italic text-red-500/40 shrink-0">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-black leading-tight uppercase truncate">&quot;{a.title}&quot;</p>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{a.theme}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-black leading-none">{a.acceptedCount > 0 ? `${a.conversionPct}%` : '—'}</p>
                      <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Conversion</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- CORE ADMIN DASHBOARD COMPONENT ---

const AdminDashboard: React.FC<{ companyId: string | null; role: string }> = ({ companyId, role }) => {
  const [activeSubTab, setActiveSubTab] = useState('Analyze Change');

  const navItems = [
    { id: 'Analyze Change', icon: BarChart3, label: 'Analytics' },
    { id: 'User Engagement', icon: Users2, label: 'Engagement' },
    { id: 'Action Performance', icon: TrendingUp, label: 'Action Metrics' },
    { id: 'Control Panel', icon: Terminal, label: 'Control Panel' },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-700 min-w-0">
      {/* Top Row: Architect Suite Navigation */}
      <div className="bg-white border-4 border-black rounded-2xl p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3 px-1 italic">ARCHITECT SUITE</h3>
        <nav className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSubTab(item.id)}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border-2 ${activeSubTab === item.id
                ? 'bg-black text-white border-black shadow-[4px_4px_0px_0px_rgba(54,153,252,1)]'
                : 'bg-white text-gray-400 border-transparent hover:border-black/5 hover:text-black'
                }`}
            >
              <item.icon size={18} />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-6 min-w-0">
        {/* TAB TITLE (Hidden on Analytics as it has its own banner) */}
        {activeSubTab !== 'Analyze Change' && (
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black pb-4">
              <div className="space-y-0.5">
                <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight italic heading-font">
                  {activeSubTab === 'Action Performance' ? 'ACTION METRICS' : activeSubTab === 'Control Panel' ? 'CONTROL PANEL' : 'USER ENGAGEMENT'}
                </h2>
              </div>
            </div>
          </section>
        )}

        {activeSubTab === 'Control Panel' ? <ControlPanelView companyId={companyId} role={role} /> :
          activeSubTab === 'Action Performance' ? <ActionPerformanceView companyId={companyId} /> :
            activeSubTab === 'User Engagement' ? <UserEngagementView companyId={companyId} /> :
              <AnalyzeChangeView companyId={companyId} />
        }
      </div>
    </div>
  );
};

export default AdminDashboard;
