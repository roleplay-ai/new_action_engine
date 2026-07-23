"use client";

import { useState } from "react";
import { archiveContentItem, deleteContentItem, updateContentItem } from "@/app/actions/prepare-content";
import { useRouter } from "next/navigation";
import { Archive, Trash2, PlayCircle, HelpCircle, FileText, Loader2 } from "lucide-react";
import type { PrepareContentItem } from "@/lib/types";

const TYPE_META: Record<PrepareContentItem["type"], { label: string; icon: typeof PlayCircle; color: string }> = {
  video: { label: "Video", icon: PlayCircle, color: "bg-blue-100 text-blue-700" },
  quiz: { label: "Quiz", icon: HelpCircle, color: "bg-purple-100 text-purple-700" },
  preread: { label: "Pre-read", icon: FileText, color: "bg-amber-100 text-amber-700" },
};

export default function ContentLibraryList({ items }: { items: PrepareContentItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleArchiveToggle(item: PrepareContentItem) {
    setError(null);
    setBusyId(item.id);
    try {
      const result = item.isActive
        ? await archiveContentItem(item.id)
        : await updateContentItem(item.id, { isActive: true });
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const result = await deleteContentItem(id);
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="superadmin-library-list">
      {error && <p className="p-3 text-xs font-bold text-red-600 border-b-2 border-black">{error}</p>}
      <ul>
        {items.map((item) => {
          const meta = TYPE_META[item.type];
          const Icon = meta.icon;
          return (
            <li key={item.id}>
              <div className="flex items-start gap-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${meta.color}`}>
                  <Icon size={13} /> {meta.label}
                </span>
                <div>
                  <p className="font-bold text-slate-900">{item.title}</p>
                  {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                  {!item.isActive && <p className="text-[10px] font-bold uppercase text-red-500 mt-1">Archived</p>}
                </div>
              </div>
              <div className="flex gap-2 self-start sm:self-center">
                <button
                  onClick={() => handleArchiveToggle(item)}
                  disabled={busyId === item.id}
                  className="p-2 border-2 border-black rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  aria-label={item.isActive ? "Archive" : "Unarchive"}
                  title={item.isActive ? "Archive" : "Unarchive"}
                >
                  {busyId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={busyId === item.id}
                  className="p-2 border-2 border-black rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50"
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
