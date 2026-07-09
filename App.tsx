
import React, { useState, useMemo } from 'react';
import { EngineProvider, useEngine } from './store.tsx';
import Layout from './components/Layout.tsx';
import ActionCard from './components/ActionCard.tsx';
import Analytics from './components/Analytics.tsx';
import Challenges from './components/Challenges.tsx';
import Nudgeboard from './components/Nudgeboard.tsx';
import Carousel from './components/Carousel.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import { getLeague } from './constants.tsx';
import { CheckCircle2, Flame, Activity, Trophy, Zap, TrendingUp, TrendingDown, Target, ChevronRight, BarChart2, Check, BookOpen, MousePointer2, RefreshCw, Award, ListTodo, Calendar, Clock, ChevronDown, ChevronLeft } from 'lucide-react';
import { League } from './types.ts';

interface SidebarProps {
  onViewMore: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onViewMore }) => {
  const { profile, userActions, allActions } = useEngine();
  const league = getLeague(profile.totalPoints);
  
  const stats = useMemo(() => {
    return {
      read: allActions.length,
      accepted: userActions.filter(a => a.status !== 'skipped' && a.status !== 'pending').length,
      validated: userActions.filter(a => a.status === 'success' || a.status === 'habit_started' || a.status === 'cemented').length,
      habitsStarted: userActions.filter(a => a.status === 'habit_started').length,
      habitsCompleted: userActions.filter(a => a.status === 'cemented').length
    };
  }, [userActions, allActions]);

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
      {/* Your Stats Card */}
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
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Actions Read</span>
              </div>
              <span className="font-black text-sm">{stats.read}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MousePointer2 size={14} className="text-blue-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Actions Accepted</span>
              </div>
              <span className="font-black text-sm text-blue-600">{stats.accepted}</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Actions Validated</span>
              </div>
              <span className="font-black text-sm text-emerald-600">{stats.validated}</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-purple-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Habits Started</span>
              </div>
              <span className="font-black text-sm text-purple-600">{stats.habitsStarted}</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Award size={14} className="text-amber-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Habits Completed</span>
              </div>
              <span className="font-black text-sm text-amber-600">{stats.habitsCompleted}</span>
            </div>
          </div>

          <div className="pt-4 border-t-2 border-slate-100 flex justify-between items-center">
            <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Effort Score</span>
            <span className="font-black text-4xl text-slate-900 leading-none">{profile.totalPoints}</span>
          </div>
        </div>
        
        <button 
          onClick={onViewMore}
          className="w-full mt-8 bg-slate-50 border-2 border-black text-slate-900 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-2"
        >
          View Full Analytics <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Hall of Fame */}
      {stats.habitsCompleted > 0 && (
        <div className="p-8 bg-slate-50 border-2 border-black rounded-[32px] flex flex-col max-h-[400px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-3 mb-6 shrink-0">
             <Trophy size={16} className="text-amber-500" />
             <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Hall of Fame</h3>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-4 no-scrollbar">
            {userActions.filter(ua => ua.status === 'cemented').map(ua => {
              const action = allActions.find(a => a.id === ua.actionId);
              return (
                <div key={ua.id} className="bg-white p-6 rounded-2xl border-2 border-black shadow-sm">
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-2">{action?.theme}</span>
                  <h4 className="text-[13px] font-semibold leading-tight text-slate-900 line-clamp-2 italic">"{action?.title}"</h4>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
};

const Main: React.FC = () => {
  const { profile, userActions, allActions, validateAction } = useEngine();
  const [activeTab, setActiveTab] = useState<'home' | 'challenges' | 'progress' | 'admin'>('home');
  const [validatingAction, setValidatingAction] = useState<string | null>(null);
  const [reflection, setReflection] = useState('');

  const scheduledActions = userActions.filter(ua => ua.status === 'scheduled');
  const habitsInProgress = userActions.filter(ua => ua.status === 'habit_started');
  const availableActions = allActions.filter(ad => !userActions.some(ua => ua.actionId === ad.id));

  const handleValidation = (success: boolean) => {
    if (validatingAction) {
      validateAction(validatingAction, success, reflection);
      setValidatingAction(null);
      setReflection('');
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'home' && (
        <div className="grid grid-cols-12 gap-8 lg:gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          <div className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-16">
            
            {/* Header Area */}
            <div className="space-y-2">
              <h1 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Strategic Mastery Engine</h1>
              <div className="flex items-center gap-4">
                 <span className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">Hi {profile.name}</span>
                 <div className="w-10 h-10 rounded-xl bg-emerald-50 border-2 border-black flex items-center justify-center">
                   <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                 </div>
              </div>
            </div>

            {/* Carousel Section (Top) */}
            <section>
              <Carousel title="Strategic Growth">
                {availableActions.map(action => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </Carousel>
            </section>

            {/* VALIDATION QUEUE */}
            {(scheduledActions.length > 0 || habitsInProgress.length > 0) && (
              <section className="space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-10 h-10 bg-[#FFCE00] border-2 border-black rounded-xl flex items-center justify-center shadow-sm">
                    <Zap size={20} fill="black" strokeWidth={3} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Validation Queue</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verify your impact to bridge the gap</p>
                  </div>
                </div>

                <div className="bg-white border-[5px] border-black rounded-[48px] p-8 md:p-10 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
                  <div className="space-y-4">
                    {[...scheduledActions, ...habitsInProgress].map(ua => {
                      const action = allActions.find(a => a.id === ua.actionId);
                      const isBeingValidated = validatingAction === ua.id;
                      const isHabit = ua.status === 'habit_started';

                      return (
                        <div key={ua.id} className="group relative">
                          {!isBeingValidated ? (
                            <div className="bg-white border-[3px] border-black rounded-[32px] p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
                              <div className="flex-1 min-w-0 space-y-3">
                                <div className="flex items-center gap-3">
                                  <span className={`px-3 py-1 border-[2px] border-black rounded-lg text-[9px] font-black uppercase tracking-widest ${isHabit ? 'bg-white text-purple-600' : 'bg-white text-blue-600'}`}>
                                    {isHabit ? 'Habit Loop' : 'Commitment'}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.1em]">{action?.theme}</span>
                                </div>
                                <h4 className="text-lg font-black leading-snug text-slate-900 truncate pr-4">
                                  {action?.title}
                                </h4>
                              </div>
                              <button 
                                onClick={() => setValidatingAction(ua.id)}
                                className="bg-[#3699FC] border-[3px] border-black text-white px-10 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all whitespace-nowrap"
                              >
                                Verify
                              </button>
                            </div>
                          ) : (
                            <div className="bg-[#1a1a1a] border-[4px] border-black rounded-[32px] p-8 text-white animate-in zoom-in-95 duration-300">
                               <div className="flex justify-between items-start mb-6">
                                 <h4 className="text-2xl font-black italic">Action Verified?</h4>
                                 <button onClick={() => setValidatingAction(null)} className="text-white/20 hover:text-white"><ChevronDown size={24}/></button>
                               </div>
                               <textarea 
                                placeholder="Impact notes (optional)..."
                                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-4 text-sm font-bold outline-none focus:border-[#FFCE00] transition-all text-white min-h-[80px] mb-4"
                                value={reflection}
                                onChange={e => setReflection(e.target.value)}
                               />
                               <div className="flex gap-3">
                                 <button onClick={() => handleValidation(true)} className="flex-1 bg-emerald-500 border-2 border-black text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest">Confirm Success</button>
                                 <button onClick={() => setValidatingAction(null)} className="flex-1 bg-white/5 border-2 border-white/10 text-white/40 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                               </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* CEMENTING HABITS SECTION */}
            {habitsInProgress.length > 0 && (
              <section className="space-y-8">
                <div className="flex items-center justify-between px-2">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Cementing Habits <span className="text-[#FFCE00]">!</span></h2>
                    <div className="h-1.5 w-24 bg-blue-500 rounded-full border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {habitsInProgress.map(ua => {
                    const action = allActions.find(a => a.id === ua.actionId);
                    const totalReps = 5;
                    const completed = ua.completedReps;
                    
                    return (
                      <div key={ua.id} className="bg-[#141414] p-10 rounded-[48px] border-[4px] border-black shadow-[10px_10px_0px_0px_rgba(0,0,0,0.1)] text-white group flex flex-col justify-between h-full">
                        <div>
                          <div className="flex items-center gap-3 mb-8">
                            <div className="w-9 h-9 bg-[#2ecc71] rounded-xl flex items-center justify-center border border-black/20">
                              <Check size={20} strokeWidth={4} className="text-black" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">{action?.theme}</span>
                          </div>
                          
                          <h4 className="text-xl font-black leading-snug mb-10 italic">
                            {action?.title}
                          </h4>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex gap-2.5 h-1.5">
                            {[...Array(totalReps)].map((_, i) => (
                              <div 
                                key={i} 
                                className={`flex-1 rounded-full border border-black/50 ${i < completed ? 'bg-[#2ecc71]' : 'bg-[#2a2a2a]'}`} 
                              />
                            ))}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#FFCE00]">Rep Loop</span>
                            <span className="text-[12px] font-black uppercase text-white/60">{completed} / {totalReps}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Team Pulse implementation - commented out
            <section className="bg-white p-8 md:p-12 rounded-[56px] border-2 border-black shadow-[8px_8px_0px_0px_rgba(54,153,252,1)]">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-black rounded-2xl border-2 border-white flex items-center justify-center text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                      <BarChart2 size={28} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">Team Pulse</h2>
                      <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-1">Real-time collective momentum.</p>
                    </div>
                  </div>
                </div>
                <Nudgeboard />
            </section>
            */}
          </div>

          <div className="hidden lg:block lg:col-span-4 xl:col-span-3">
             <Sidebar onViewMore={() => setActiveTab('progress')} />
          </div>
        </div>
      )}

      {activeTab === 'challenges' && <Challenges />}
      {activeTab === 'progress' && <Analytics />}
      {activeTab === 'admin' && <AdminDashboard />}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <EngineProvider>
      <Main />
    </EngineProvider>
  );
};

export default App;
