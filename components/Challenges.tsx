import React, { useMemo, useState } from 'react';
import { useEngine } from '../lib/store';
import ActionCard from './ActionCard';
import ConfettiCelebration from './ConfettiCelebration';
import { Search, LayoutGrid, X, Lightbulb, ArrowRight } from 'lucide-react';

type LibraryStatus = 'Generated' | 'Completed' | "Didn't complete";
type ValidationStep = 'success_prompt' | 'celebration';

interface Props {
  onEdit?: (actionId: string) => void;
  onDelete?: (actionId: string) => void;
}

const LIBRARY_STATUSES: LibraryStatus[] = ['Generated', 'Completed', "Didn't complete"];

const Challenges: React.FC<Props> = ({ onEdit, onDelete }) => {
  const { userActions, allActions, hasCompany, completeAction, generationJob } = useEngine();
  const [filter, setFilter] = useState<'All' | LibraryStatus>('All');
  const [search, setSearch] = useState('');
  const [completingActionId, setCompletingActionId] = useState<string | null>(null);
  const [reflection, setReflection] = useState('');
  const [validationStep, setValidationStep] = useState<ValidationStep>('success_prompt');

  const touchedIds = useMemo(
    () => new Set(userActions.map((ua) => ua.actionId)),
    [userActions],
  );

  const getStatus = (actionId: string, isPersonal: boolean): LibraryStatus | 'Active' | 'Available' | 'Skipped' => {
    if (isPersonal && !touchedIds.has(actionId)) return 'Generated';
    const ua = userActions.find((u) => u.actionId === actionId);
    if (!ua) return 'Available';
    if (ua.status === 'success') return 'Completed';
    if (ua.status === 'skipped') return 'Skipped';
    if (ua.status === 'failed') return "Didn't complete";
    if (ua.status === 'scheduled') return 'Active';
    return 'Available';
  };

  const libraryActions = useMemo(
    () =>
      allActions.filter((action) => {
        const status = getStatus(action.id, action.isPersonal ?? false);
        return LIBRARY_STATUSES.includes(status as LibraryStatus);
      }),
    [allActions, userActions, touchedIds],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<LibraryStatus, number> = {
      Generated: 0,
      Completed: 0,
      "Didn't complete": 0,
    };
    for (const action of libraryActions) {
      const status = getStatus(action.id, action.isPersonal ?? false) as LibraryStatus;
      counts[status] += 1;
    }
    return counts;
  }, [libraryActions, userActions, touchedIds]);

  const filteredActions = libraryActions.filter((action) => {
    const status = getStatus(action.id, action.isPersonal ?? false) as LibraryStatus;
    const matchesSearch =
      action.title.toLowerCase().includes(search.toLowerCase()) ||
      action.theme.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'All' || status === filter;
    return matchesSearch && matchesFilter;
  });

  const completingAction = completingActionId
    ? allActions.find((a) => a.id === completingActionId)
    : undefined;

  const openCompleteModal = (actionId: string) => {
    setCompletingActionId(actionId);
    setValidationStep('success_prompt');
    setReflection('');
  };

  const closeCompleteModal = () => {
    setCompletingActionId(null);
    setValidationStep('success_prompt');
    setReflection('');
  };

  const submitValidation = async () => {
    if (!completingActionId) return;
    setValidationStep('celebration');
    await completeAction(completingActionId, true, reflection);
  };

  const handleDidNotComplete = async () => {
    if (!completingActionId) return;
    await completeAction(completingActionId, false, reflection);
    closeCompleteModal();
  };

  const filterOptions: Array<{ key: 'All' | LibraryStatus; label: string }> = [
    { key: 'All', label: 'All' },
    { key: 'Generated', label: `Generated (${statusCounts.Generated}${generationJob ? ` of ${generationJob.totalNeeded}` : ''})` },
    { key: 'Completed', label: `Completed (${statusCounts.Completed})` },
    { key: "Didn't complete", label: `Didn't complete (${statusCounts["Didn't complete"]})` },
  ];

  const statusBadgeFor = (status: LibraryStatus) => {
    switch (status) {
      case 'Generated':
        return { label: 'Generated', className: 'bg-violet-500 text-white' };
      case 'Completed':
        return { label: 'Completed', className: 'bg-emerald-500 text-white' };
      default:
        return { label: "Didn't complete", className: 'bg-amber-500 text-white' };
    }
  };

  return (
    <div className="space-y-10 pb-20 w-full min-w-0">
      {completingActionId && validationStep === 'success_prompt' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ background: 'rgba(34,29,35,0.65)', backdropFilter: 'blur(12px)' }}
        >
          <div className="card card--wide animate-pop w-full overflow-y-auto no-scrollbar" style={{ maxHeight: '90vh', maxWidth: '520px' }}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="tag tag--yellow mb-3 inline-block">Try again</span>
                <h3 className="card__title">Mark as complete</h3>
                <p className="card__subtitle mb-0">{completingAction?.title}</p>
              </div>
              <button onClick={closeCompleteModal} className="btn btn--icon">
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
              <button onClick={submitValidation} className="btn btn--accept flex-1">
                Verify <ArrowRight size={18} strokeWidth={2.5} />
              </button>
              <button onClick={handleDidNotComplete} className="btn btn--decline flex-1">
                Didn&apos;t Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {completingActionId && validationStep === 'celebration' && (
        <ConfettiCelebration
          actionTitle={completingAction?.title}
          onContinue={closeCompleteModal}
          onClose={closeCompleteModal}
        />
      )}

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 min-w-0 w-full">
        <div className="min-w-0">
          <h2 className="detail-panel__title mb-2">Challenge library</h2>
          <p className="text-sm text-secondary">
            Browse generated, completed, and incomplete actions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 min-w-0 max-w-full">
          {filterOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`btn btn--sm ${filter === key ? 'btn--primary' : 'btn--decline'}`}
            >
              {label}
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
          <div className="action-grid">
            {filteredActions.map((action) => {
              const status = getStatus(action.id, action.isPersonal ?? false) as LibraryStatus;
              return (
                <ActionCard
                  key={action.id}
                  action={action}
                  onMarkComplete={
                    status === "Didn't complete"
                      ? openCompleteModal
                      : undefined
                  }
                  onEdit={status === 'Generated' ? onEdit : undefined}
                  onDelete={status === 'Generated' ? onDelete : undefined}
                  statusBadge={statusBadgeFor(status)}
                />
              );
            })}
          </div>
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
