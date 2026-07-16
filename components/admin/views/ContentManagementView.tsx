"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, X, Trash2, Archive, PlayCircle, HelpCircle, FileText } from "lucide-react";
import {
  listContentItems,
  listActiveLibraryItems,
  createVideoContentItem,
  createPrereadContentItem,
  createQuizContentItem,
  updateContentItem,
  archiveContentItem,
  deleteContentItem,
} from "@/app/actions/prepare-content";
import type { PrepareContentItem, PrepareContentType } from "@/lib/types";
import { VideoUploadField } from "@/components/admin/content/VideoUploadField";

interface ContentManagementViewProps {
  companyId: string | null;
  role: string;
}

const TYPE_META: Record<PrepareContentType, { label: string; icon: typeof PlayCircle }> = {
  video: { label: "Video", icon: PlayCircle },
  quiz: { label: "Quiz", icon: HelpCircle },
  preread: { label: "Pre-read", icon: FileText },
};

export function ContentManagementView({ role }: ContentManagementViewProps) {
  const isSuperadmin = role === "superadmin";
  const [items, setItems] = useState<PrepareContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = isSuperadmin ? await listContentItems() : await listActiveLibraryItems();
      if (res.error) setError(res.error);
      else setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load content library");
    } finally {
      setLoading(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleArchiveToggle(item: PrepareContentItem) {
    setBusyId(item.id);
    setError(null);
    const { error } = item.isActive
      ? await archiveContentItem(item.id)
      : await updateContentItem(item.id, { isActive: true });
    setBusyId(null);
    if (error) {
      setError(error);
      return;
    }
    await refresh();
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    const { error } = await deleteContentItem(id);
    setBusyId(null);
    if (error) {
      setError(error);
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Content Management
        </h2>
        {isSuperadmin && (
          <button onClick={() => setCreating((v) => !v)} className="btn btn--sm btn--primary">
            <Plus size={14} strokeWidth={2.5} /> New Content
          </button>
        )}
      </div>

      {!isSuperadmin && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Only superadmin can add or edit content items. You can view the library here and attach items to your
          cohorts from Cohort Management.
        </p>
      )}

      {creating && isSuperadmin && (
        <CreateContentForm
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {error && (
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold" style={{ color: "#ED4551" }}>{error}</p>
          <button onClick={() => refresh()} className="btn btn--sm btn--decline">Retry</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="card card--flat text-center">
          <p className="card__subtitle mb-0">
            {isSuperadmin ? "No content yet. Create a video, quiz, or pre-read above." : "No content available yet."}
          </p>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {items.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-start gap-3">
                  <span className="tag tag--blue flex items-center gap-1.5">
                    <Icon size={13} strokeWidth={2.5} /> {meta.label}
                  </span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{item.title}</p>
                    {item.description && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{item.description}</p>
                    )}
                    {!item.isActive && (
                      <p className="text-[10px] font-bold uppercase mt-1" style={{ color: "#ED4551" }}>Archived</p>
                    )}
                  </div>
                </div>
                {isSuperadmin && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleArchiveToggle(item)}
                      disabled={busyId === item.id}
                      className="btn btn--icon"
                      aria-label={item.isActive ? "Archive" : "Unarchive"}
                      title={item.isActive ? "Archive" : "Unarchive"}
                    >
                      <Archive size={14} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={busyId === item.id}
                      className="btn btn--icon"
                      aria-label="Delete"
                      title="Delete"
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type DraftOption = { optionText: string; isCorrect: boolean };
type DraftQuestion = { questionText: string; options: DraftOption[] };

function emptyQuestion(): DraftQuestion {
  return {
    questionText: "",
    options: [
      { optionText: "", isCorrect: true },
      { optionText: "", isCorrect: false },
    ],
  };
}

function CreateContentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [type, setType] = useState<PrepareContentType>("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | undefined>(undefined);
  const [videoInputMode, setVideoInputMode] = useState<"upload" | "url">("upload");
  const [prereadUrl, setPrereadUrl] = useState("");
  const [prereadBody, setPrereadBody] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQuestionText(qi: number, text: string) {
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, questionText: text } : q)));
  }
  function updateOptionText(qi: number, oi: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, optionText: text } : o)) } : q))
    );
  }
  function setCorrectOption(qi: number, oi: number) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oi })) } : q))
    );
  }
  function addOption(qi: number) {
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, options: [...q.options, { optionText: "", isCorrect: false }] } : q)));
  }
  function removeOption(qi: number, oi: number) {
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, options: q.options.filter((_, j) => j !== oi) } : q)));
  }
  function addQuestion() {
    setQuestions((qs) => [...qs, emptyQuestion()]);
  }
  function removeQuestion(qi: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== qi));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (type === "video" && !videoUrl) {
      setError(videoInputMode === "upload" ? "Upload a video file first" : "Enter a video URL");
      return;
    }

    setLoading(true);

    let result: { error?: string };
    if (type === "video") {
      result = await createVideoContentItem({
        title,
        description: description || undefined,
        badgeLabel: badgeLabel || undefined,
        videoUrl,
        videoDurationSeconds,
      });
    } else if (type === "preread") {
      result = await createPrereadContentItem({
        title,
        description: description || undefined,
        badgeLabel: badgeLabel || undefined,
        prereadUrl: prereadUrl || undefined,
        prereadBody: prereadBody || undefined,
      });
    } else {
      result = await createQuizContentItem({
        title,
        description: description || undefined,
        badgeLabel: badgeLabel || undefined,
        questions: questions.map((q) => ({
          questionText: q.questionText,
          options: q.options.map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })),
        })),
      });
    }

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="card card--flat space-y-3">
      <div className="flex gap-2">
        {(["video", "quiz", "preread"] as PrepareContentType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`btn btn--sm ${type === t ? "btn--primary" : "btn--decline"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        className="form-input"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="form-input"
        rows={2}
      />
      <input
        type="text"
        placeholder="Badge label (optional, e.g. CEO WELCOME)"
        value={badgeLabel}
        onChange={(e) => setBadgeLabel(e.target.value)}
        className="form-input"
      />

      {type === "video" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVideoInputMode("upload")}
              className={`btn btn--sm ${videoInputMode === "upload" ? "btn--primary" : "btn--decline"}`}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setVideoInputMode("url")}
              className={`btn btn--sm ${videoInputMode === "url" ? "btn--primary" : "btn--decline"}`}
            >
              Paste URL
            </button>
          </div>

          {videoInputMode === "upload" ? (
            <>
              <VideoUploadField
                onUploaded={({ videoUrl: uploadedUrl, videoDurationSeconds: duration }) => {
                  setVideoUrl(uploadedUrl);
                  setVideoDurationSeconds(duration);
                }}
              />
              {videoUrl && videoInputMode === "upload" && (
                <p className="text-xs font-semibold" style={{ color: "var(--emerald, #059669)" }}>
                  Uploaded ✓ {videoDurationSeconds ? `(${Math.round(videoDurationSeconds / 60)} min)` : ""}
                </p>
              )}
            </>
          ) : (
            <input
              type="url"
              placeholder="Video URL (e.g. YouTube/Vimeo embed link)"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="form-input"
            />
          )}
        </div>
      )}

      {type === "preread" && (
        <>
          <input
            type="url"
            placeholder="Resource URL (optional)"
            value={prereadUrl}
            onChange={(e) => setPrereadUrl(e.target.value)}
            className="form-input"
          />
          <textarea
            placeholder="Or paste the resource body directly (optional)"
            value={prereadBody}
            onChange={(e) => setPrereadBody(e.target.value)}
            className="form-input"
            rows={4}
          />
        </>
      )}

      {type === "quiz" && (
        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div key={qi} className="card__inset space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Question ${qi + 1}`}
                  value={q.questionText}
                  onChange={(e) => updateQuestionText(qi, e.target.value)}
                  required
                  className="form-input flex-1"
                />
                {questions.length > 1 && (
                  <button type="button" onClick={() => removeQuestion(qi)} className="btn btn--icon" aria-label="Remove question">
                    <Trash2 size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              <div className="space-y-1.5 pl-2">
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={o.isCorrect}
                      onChange={() => setCorrectOption(qi, oi)}
                      aria-label="Correct answer"
                    />
                    <input
                      type="text"
                      placeholder={`Option ${oi + 1}`}
                      value={o.optionText}
                      onChange={(e) => updateOptionText(qi, oi, e.target.value)}
                      required
                      className="form-input flex-1"
                    />
                    {q.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(qi, oi)} className="btn btn--icon" aria-label="Remove option">
                        <X size={14} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => addOption(qi)} className="text-xs font-bold" style={{ color: "var(--dodger-blue)" }}>
                  + Add option
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addQuestion} className="btn btn--sm btn--decline">
            + Add question
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn btn--sm btn--accept">
          {loading ? "…" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn--sm btn--decline">Cancel</button>
      </div>
      {error && <p className="text-xs font-bold" style={{ color: "#ED4551" }}>{error}</p>}
    </form>
  );
}
