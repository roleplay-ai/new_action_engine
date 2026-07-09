import React, { useState } from 'react';
import { useEngine } from '../lib/store';
import ActionCard from './ActionCard';
import Carousel from './Carousel';
import { Search, LayoutGrid } from 'lucide-react';

const Challenges: React.FC = () => {
  const { userActions, allActions, hasCompany } = useEngine();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const getStatus = (actionId: string) => {
    const ua = userActions.find((u) => u.actionId === actionId);
    if (!ua) return 'Available';
    if (ua.status === 'success' || ua.status === 'habit_started' || ua.status === 'cemented') return 'Completed';
    if (ua.status === 'skipped') return 'Skipped';
    if (ua.status === 'failed') return "Didn't complete";
    if (ua.status === 'scheduled') return 'Active';
    return 'Available';
  };

  // Library should only surface actions the user has skipped or explicitly marked as "Didn't complete".
  const filteredActions = allActions.filter((action) => {
    const status = getStatus(action.id);
    if (status !== 'Skipped' && status !== "Didn't complete") return false;
    const matchesSearch =
      action.title.toLowerCase().includes(search.toLowerCase()) ||
      action.theme.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'All' || status === filter;
    return matchesSearch && matchesFilter;
  });

  const filterOptions = ['All', 'Skipped', "Didn't complete"];

  return (
    <div className="space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="detail-panel__title mb-2">Challenge library</h2>
          <p className="text-sm text-secondary">
            Explore behavioral shifts designed for high‑performance teams.
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
                status === 'Completed'
                  ? { label: 'Completed', className: 'bg-[#2ecc71] text-white' }
                  : status === 'Active'
                    ? { label: 'Active Mission', className: 'bg-[#3699FC] text-white' }
                    : status === 'Skipped'
                      ? { label: 'Skipped', className: 'bg-slate-500 text-white' }
                      : status === "Didn't complete"
                        ? { label: "Didn't complete", className: 'bg-amber-500 text-white' }
                        : undefined;
              return (
                <ActionCard
                  key={action.id}
                  action={action}
                  planButtonLabel={status === 'Skipped' || status === "Didn't complete" ? 'Plan again' : undefined}
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
