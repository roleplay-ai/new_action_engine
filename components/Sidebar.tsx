
"use client";

import React, { useMemo } from 'react';
import { useEngine } from '@/lib/store';
import { getLeague } from '@/lib/constants';
import { BookOpen, CheckCircle2, RefreshCw, Award, Trophy, TrendingUp, TrendingDown, MousePointer2, ChevronRight } from 'lucide-react';

interface SidebarProps {
  onViewMore: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onViewMore }) => {
  const { profile, userActions, actionIdsInAssignedPackages } = useEngine();
  
  const stats = useMemo(() => {
    const received = actionIdsInAssignedPackages.size;
    const read = userActions.filter((ua) => actionIdsInAssignedPackages.has(ua.actionId)).length;
    const accepted = userActions.filter((ua) =>
      ua.status === "success" || ua.status === "habit_started" || ua.status === "scheduled" || ua.status === "cemented"
    ).length;
    const validatedSuccess = userActions.reduce((sum, ua) => sum + (ua.completedReps ?? 0), 0);

    return {
      received,
      read,
      accepted,
      validated: validatedSuccess,
      habitsStarted: userActions.filter(a => a.status === 'habit_started').length,
      habitsCompleted: userActions.filter(a => a.status === 'cemented').length
    };
  }, [userActions, actionIdsInAssignedPackages]);

  const competitors = [
    { name: 'Sarah Jenkins', points: 342 },
    { name: 'Marcus Chen', points: 156 },
    { name: 'Elena Rodriguez', points: 89 },
    { name: profile.name, points: profile.totalPoints },
    { name: 'David Okoro', points: 12 },
  ].sort((a, b) => b.points - a.points);

  const rank = competitors.findIndex(c => c.name === profile.name) + 1;
  const avgPoints = competitors.reduce((acc, curr) => acc + curr.points, 0) / competitors.length;
  const vsAverage = profile.totalPoints - avgPoints;

  return (
    <aside className="space-y-8 sticky top-24">
      <div className="p-8 bg-white border-2 border-black rounded-[32px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="text-xs font-bold mb-6 uppercase tracking-wider text-slate-400">Personal Insights</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-50">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Global Rank</span>
            <span className="font-black text-sm text-slate-900">#{rank} <span className="text-slate-300 font-bold">/ {competitors.length}</span></span>
          </div>

          <div className="flex justify-between items-center pb-3 border-b border-slate-50">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Standing</span>
            <div className="flex items-center gap-1.5">
              {vsAverage >= 0 ? (
                <>
                  <TrendingUp size={14} className="text-emerald-500" />
                  <span className="font-black text-[10px] text-emerald-500 uppercase tracking-tighter">Above Group Avg</span>
                </>
              ) : (
                <>
                  <TrendingDown size={14} className="text-amber-500" />
                  <span className="font-black text-[10px] text-amber-500 uppercase tracking-tighter">Below Group Avg</span>
                </>
              )}
            </div>
          </div>

          <div className="py-2 space-y-3">
            {[
              { icon: BookOpen, label: "Received", val: stats.received, color: "text-slate-400" },
              { icon: MousePointer2, label: "Read", val: stats.read, color: "text-blue-500" },
              { icon: CheckCircle2, label: "Accepted", val: stats.accepted, color: "text-emerald-500" },
              { icon: RefreshCw, label: "Success reps", val: stats.validated, color: "text-amber-500" },
              { icon: RefreshCw, label: "Habits", val: stats.habitsStarted, color: "text-purple-500" },
              { icon: Award, label: "Mastery", val: stats.habitsCompleted, color: "text-amber-500" }
            ].map((s, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <s.icon size={14} className={s.color} />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</span>
                </div>
                <span className="font-black text-sm">{s.val}</span>
              </div>
            ))}
          </div>

          {/* XP disabled for now */}
          {/* <div className="pt-4 border-t-2 border-slate-100 flex justify-between items-center">
            <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Effort Score</span>
            <span className="font-black text-4xl text-slate-900 leading-none">{profile.totalPoints}</span>
          </div> */}
        </div>
        
        <button 
          onClick={onViewMore}
          className="w-full mt-8 bg-slate-50 border-2 border-black text-slate-900 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-2"
        >
          Analytics <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
