"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Gift, Loader2, Pencil, PlayCircle, Plus, Power, Trash2 } from "lucide-react";
import { deleteSurpriseResource, setSurpriseResourceActive } from "@/app/actions/surprise-box-resources";
import type { SurpriseResource } from "@/lib/surprise-boxes";
import SurpriseResourceForm from "./surprise-resource-form";

type Filter = "active" | "inactive" | "all";

export default function SurpriseLibrary({ resources }: { resources: SurpriseResource[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [error, setError] = useState<string | null>(null);

  const visible = resources.filter((resource) =>
    filter === "all" ? true : filter === "active" ? resource.isActive : !resource.isActive
  );

  async function run(id: string, action: () => Promise<{ error?: string }>) {
    setError(null);
    setBusyId(id);
    try {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <section className="superadmin-surface">
      <div className="superadmin-section-heading">
        <div>
          <h2>Library</h2>
          <p>Each resource can appear in many participants&apos; boxes. Inactive resources are never given to new actions.</p>
        </div>
        {!creating && (
          <button type="button" className="superadmin-primary-action" onClick={() => { setCreating(true); setEditingId(null); }}>
            <Plus size={16} /> New resource
          </button>
        )}
      </div>

      {creating && (
        <div className="surprise-library-form-slot">
          <SurpriseResourceForm onClose={() => setCreating(false)} />
        </div>
      )}

      <div className="surprise-resource-segment surprise-library-filter" role="group" aria-label="Show">
        {(["active", "inactive", "all"] as Filter[]).map((option) => (
          <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>
            {option === "active" ? "Active" : option === "inactive" ? "Inactive" : "All"}
          </button>
        ))}
      </div>

      {error && <p className="surprise-resource-error surprise-library-error" role="alert">{error}</p>}

      {visible.length === 0 ? (
        <div className="superadmin-empty">
          <Gift size={26} />
          <strong>{resources.length === 0 ? "No resources yet" : "Nothing here"}</strong>
          <p>
            {resources.length === 0
              ? "Add videos and resources with a clear description. They're given out at random to participants' actions when a plan is finalised."
              : "No resources match this filter."}
          </p>
        </div>
      ) : (
        <ul className="surprise-library-list">
          {visible.map((resource) =>
            editingId === resource.id ? (
              <li key={resource.id} className="is-editing">
                <SurpriseResourceForm resource={resource} onClose={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={resource.id} className={resource.isActive ? "" : "is-inactive"}>
                <div className={`surprise-library-thumb ${resource.kind}`}>
                  {resource.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resource.thumbnailUrl} alt="" />
                  ) : resource.kind === "video" ? (
                    <PlayCircle size={20} />
                  ) : (
                    <FileText size={20} />
                  )}
                </div>

                <div className="surprise-library-body">
                  <div className="surprise-library-meta">
                    <span className={`surprise-library-kind ${resource.kind}`}>{resource.kind === "video" ? "Video" : "Resource"}</span>
                    <span>{resource.source === "upload" ? "Uploaded file" : "Link"}</span>
                    {resource.durationLabel && <span>{resource.durationLabel}</span>}
                    {!resource.isActive && <span className="surprise-library-inactive">Inactive</span>}
                  </div>
                  <strong>{resource.title}</strong>
                  <p>{resource.description}</p>
                  <small>
                    Assigned to {resource.mappedActionCount} action{resource.mappedActionCount === 1 ? "" : "s"} · opened in{" "}
                    {resource.unlockCount} box{resource.unlockCount === 1 ? "" : "es"}
                  </small>
                </div>

                <div className="surprise-library-actions">
                  {confirmDeleteId === resource.id ? (
                    <div className="surprise-library-confirm" role="group" aria-label={`Delete ${resource.title}?`}>
                      <span>Delete permanently?</span>
                      <button type="button" className="is-danger" disabled={busyId === resource.id} onClick={() => run(resource.id, () => deleteSurpriseResource(resource.id))}>
                        {busyId === resource.id ? <Loader2 size={14} className="spin" /> : "Delete"}
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={busyId === resource.id}>Keep</button>
                    </div>
                  ) : (
                    <>
                      {resource.url && (
                        <a href={resource.url} target="_blank" rel="noreferrer" title="Open" aria-label={`Open ${resource.title}`}>
                          <ExternalLink size={15} />
                        </a>
                      )}
                      <button type="button" title="Edit" aria-label={`Edit ${resource.title}`} onClick={() => { setEditingId(resource.id); setCreating(false); }}>
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title={resource.isActive ? "Deactivate" : "Activate"}
                        aria-label={`${resource.isActive ? "Deactivate" : "Activate"} ${resource.title}`}
                        disabled={busyId === resource.id}
                        onClick={() => run(resource.id, () => setSurpriseResourceActive(resource.id, !resource.isActive))}
                      >
                        {busyId === resource.id ? <Loader2 size={15} className="spin" /> : <Power size={15} />}
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        title="Delete"
                        aria-label={`Delete ${resource.title}`}
                        disabled={busyId === resource.id}
                        onClick={() => setConfirmDeleteId(resource.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}
