import React, { useState } from 'react';
import { useEngine } from '../lib/store';
import ActionCard from './ActionCard';
import Carousel from './Carousel';
import { Search, LayoutGrid, X, Lightbulb, ArrowRight } from 'lucide-react';

const Challenges: React.FC = () => {
  const { userActions, allActions, hasCompany, completeAction } = useEngine();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [completingActionId, setCompletingActionId] = useState<string | null>(null);
  const [reflection, setReflection] = useState('');

  const getStatus = (actionId: string) => {
    const ua = userActions.find((u) => u.actionId === actionId);
    if (!ua) return 'Available';
    if (ua.status === 'success') return 'Completed';
    if (ua.status === 'skipped') return 'Skipped';
    if (ua.status === 'failed') return "Didn't complete";
    if (ua.status === 'scheduled') return 'Active';
    return 'Available';
  };

  const filteredActions = allActions.filter((action) => {
    const status = getStatus(action.id);
    if (status !== 'Skipped' && status !== "Didn't complete") return false;
    const matchesSearch =
      action.title.toLowerCase().includes(search.toLowerCase()) ||
      action.theme.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'All' || status === filter;
    return matchesSearch && matchesFilter;
  });

  const completingAction = completingActionId
    ? allActions.find((a) => a.id === completingActionId)
    : undefined;

  const handleSubmit = async (success: boolean) => {
    if (!completingActionId) return;
    await completeAction(completingActionId, success, reflection);
    setCompletingActionId(null);
    setReflection('');
  };

  const filterOptions = ['All', 'Skipped', "Didn't complete"];

  return (
    <div className="space-y-10 pb-20">
      {completingActionId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(34,29,35,0.65)', backdropFilter: 'blur(12px)' }}>
          <div className="card card--wide animate-pop w-full" style={{ maxWidth: '520px' }}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Try again</span>
                <h3 className="card__title">Mark as complete</h3>
                <p className="card__subtitle mb-0">{completingAction?.title}</p>
              </div>
              <button onClick={() => setCompletingActionId(null)} className="btn btn--icon">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="card__inset mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={16} style={{ color: 'var(--bright-amber)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  What was the result?
                </span>
              </div>
              <textarea
                className="form-input"
                style={{ minHeight: '120px', resize: 'vertical' }}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => handleSubmit(true)} className="btn btn--accept flex-1">
                Verify <ArrowRight size={18} strokeWidth={2.5} />
              </button>
              <button onClick={() => handleSubmit(false)} className="btn btn--decline flex-1">
                Didn&apos;t Complete
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="detail-panel__title mb-2">Challenge library</h2>
          <p className="text-sm text-secondary">
            Revisit skipped or incomplete actions and mark them complete when ready.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterOptions.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn btn--sm ${filter === f ? 'btn--primary' : 'btn--decline'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      <div className="relative">
        <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="Search themes or titles..."
          className="form-input pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="w-full">
        {!hasCompany ? (
          <div className="card card--flat text-center">
            <p className="text-sm font-semibold text-secondary">
              Not assigned to a company
            </p>
            <p className="text-xs text-muted mt-2">
              Contact your admin to get access to the Action Library.
            </p>
          </div>
        ) : filteredActions.length > 0 ? (
          <Carousel narrowSlides>
            {filteredActions.map(action => {
              const status = getStatus(action.id);
              const statusBadge =
                status === 'Skipped'
                  ? { label: 'Skipped', className: 'bg-slate-500 text-white' }
                  : status === "Didn't complete"
                    ? { label: "Didn't complete", className: 'bg-amber-500 text-white' }
                    : undefined;
              return (
                <ActionCard
                  key={action.id}
                  action={action}
                  onMarkComplete={(id) => {
                    setCompletingActionId(id);
                    setReflection('');
                  }}
                  statusBadge={statusBadge}
                />
              );
            })}
          </Carousel>
        ) : (
          <div className="card card--flat text-center">
            <LayoutGrid size={48} className="mx-auto text-muted mb-4" />
            <p className="text-md font-semibold text-secondary">
              No actions match your filters
            </p>
            <button
              onClick={() => { setFilter('All'); setSearch(''); }}
              className="btn btn--decline btn--sm mt-4"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Challenges;
