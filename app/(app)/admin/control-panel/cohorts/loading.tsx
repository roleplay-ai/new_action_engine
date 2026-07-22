export default function CohortManagementLoading() {
  return (
    <div className="max-w-7xl mx-auto w-full space-y-5" aria-label="Loading cohort management" aria-busy="true">
      <div className="flex items-start justify-between gap-4 py-2">
        <div className="space-y-3">
          <div className="h-3 w-36 rounded bg-zinc-200 animate-pulse" />
          <div className="h-8 w-64 rounded bg-zinc-200 animate-pulse" />
          <div className="h-4 w-96 max-w-full rounded bg-zinc-100 animate-pulse" />
        </div>
        <div className="h-10 w-28 rounded-lg bg-zinc-200 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-zinc-200 bg-white sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex h-24 items-center gap-3 border-b border-zinc-200 px-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <div className="h-10 w-10 rounded-lg bg-zinc-100 animate-pulse" />
            <div className="space-y-2"><div className="h-5 w-12 rounded bg-zinc-200 animate-pulse" /><div className="h-3 w-24 rounded bg-zinc-100 animate-pulse" /></div>
          </div>
        ))}
      </div>
      <div className="grid min-h-[540px] overflow-hidden rounded-xl border border-zinc-200 bg-white md:grid-cols-[300px_1fr]">
        <div className="border-b border-zinc-200 bg-zinc-50 p-4 md:border-b-0 md:border-r">
          <div className="mb-4 h-10 rounded-lg bg-zinc-200 animate-pulse" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 rounded-lg bg-zinc-100 animate-pulse" />)}
          </div>
        </div>
        <div className="p-6"><div className="h-20 rounded-lg bg-zinc-100 animate-pulse" /><div className="mt-5 h-10 w-64 rounded bg-zinc-100 animate-pulse" /><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="h-72 rounded-xl bg-zinc-100 animate-pulse" /><div className="h-72 rounded-xl bg-zinc-100 animate-pulse" /></div></div>
      </div>
    </div>
  );
}
