"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2 } from "lucide-react";
import {
  createVideoContentItem,
  createPrereadContentItem,
  createQuizContentItem,
} from "@/app/actions/prepare-content";
import { VideoUploadField } from "@/components/admin/content/VideoUploadField";
import type { PrepareContentType } from "@/lib/types";

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

export default function CreateContentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  function reset() {
    setTitle("");
    setDescription("");
    setBadgeLabel("");
    setVideoUrl("");
    setVideoDurationSeconds(undefined);
    setPrereadUrl("");
    setPrereadBody("");
    setQuestions([emptyQuestion()]);
    setError(null);
  }

  function updateQuestionText(qi: number, text: string) {
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, questionText: text } : q)));
  }

  function updateOptionText(qi: number, oi: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, optionText: text } : o)) } : q
      )
    );
  }

  function setCorrectOption(qi: number, oi: number) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi ? { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oi })) } : q
      )
    );
  }

  function addOption(qi: number) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qi ? { ...q, options: [...q.options, { optionText: "", isCorrect: false }] } : q))
    );
  }

  function removeOption(qi: number, oi: number) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qi ? { ...q, options: q.options.filter((_, j) => j !== oi) } : q))
    );
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

    try {
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
          badgeLabel: badgeLabel || undefined,
          description: description || undefined,
          questions: questions.map((q) => ({
            questionText: q.questionText,
            options: q.options.map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })),
          })),
        });
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="superadmin-primary-action"
      >
        <Plus size={16} /> New Content
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="superadmin-creation-form superadmin-content-form"
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["video", "quiz", "preread"] as PrepareContentType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border-2 border-black ${
                type === t ? "bg-[#3699FC] text-white" : "bg-white hover:bg-slate-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="p-1.5 border-2 border-black rounded-lg hover:bg-slate-50"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm font-semibold outline-none focus:border-[#3699FC]"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm outline-none focus:border-[#3699FC]"
        rows={2}
      />
      <input
        type="text"
        placeholder="Badge label (optional, e.g. CEO WELCOME)"
        value={badgeLabel}
        onChange={(e) => setBadgeLabel(e.target.value)}
        className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm outline-none focus:border-[#3699FC]"
      />

      {type === "video" && (
        <div className="space-y-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setVideoInputMode("upload")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border-2 border-black ${
                videoInputMode === "upload" ? "bg-[#3699FC] text-white" : "bg-white hover:bg-slate-50"
              }`}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setVideoInputMode("url")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border-2 border-black ${
                videoInputMode === "url" ? "bg-[#3699FC] text-white" : "bg-white hover:bg-slate-50"
              }`}
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
              {videoUrl && (
                <p className="text-xs font-bold text-emerald-600">
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
              className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm outline-none focus:border-[#3699FC]"
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
            className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm outline-none focus:border-[#3699FC]"
          />
          <textarea
            placeholder="Or paste the resource body directly (optional)"
            value={prereadBody}
            onChange={(e) => setPrereadBody(e.target.value)}
            className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm outline-none focus:border-[#3699FC]"
            rows={4}
          />
        </>
      )}

      {type === "quiz" && (
        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div key={qi} className="border-2 border-black rounded-lg p-3 space-y-2 bg-slate-50">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Question ${qi + 1}`}
                  value={q.questionText}
                  onChange={(e) => updateQuestionText(qi, e.target.value)}
                  required
                  className="flex-1 px-3 py-1.5 border-2 border-black rounded-lg text-sm font-semibold outline-none"
                />
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(qi)}
                    className="p-1.5 border-2 border-black rounded-lg hover:bg-red-50 text-red-600"
                    aria-label="Remove question"
                  >
                    <Trash2 size={14} />
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
                      className="flex-1 px-3 py-1.5 border-2 border-black rounded-lg text-sm outline-none"
                    />
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(qi, oi)}
                        className="p-1 text-slate-400 hover:text-red-600"
                        aria-label="Remove option"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(qi)}
                  className="text-xs font-bold text-[#3699FC] hover:underline"
                >
                  + Add option
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addQuestion}
            className="px-3 py-1.5 border-2 border-black rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-50"
          >
            + Add question
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-[#3699FC] border-2 border-black text-white rounded-lg font-bold text-xs uppercase tracking-wider disabled:opacity-50"
        >
          {loading ? "…" : "Create"}
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </form>
  );
}
