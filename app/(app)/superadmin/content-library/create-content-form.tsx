"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2 } from "lucide-react";
import {
  createVideoContentItem,
  createPrereadContentItem,
  createQuizContentItem,
} from "@/app/actions/prepare-content";
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
  const [videoUrl, setVideoUrl] = useState("");
  const [prereadUrl, setPrereadUrl] = useState("");
  const [prereadBody, setPrereadBody] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setVideoUrl("");
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
    setLoading(true);

    let result: { error?: string };
    if (type === "video") {
      result = await createVideoContentItem({ title, description: description || undefined, videoUrl });
    } else if (type === "preread") {
      result = await createPrereadContentItem({
        title,
        description: description || undefined,
        prereadUrl: prereadUrl || undefined,
        prereadBody: prereadBody || undefined,
      });
    } else {
      result = await createQuizContentItem({
        title,
        description: description || undefined,
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
    reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-[#FFCE00] border-2 border-black px-5 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
      >
        <Plus size={16} /> New Content
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4"
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

      {type === "video" && (
        <input
          type="url"
          placeholder="Video URL (e.g. YouTube/Vimeo embed link)"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          required
          className="w-full px-4 py-2 border-2 border-black rounded-lg text-sm outline-none focus:border-[#3699FC]"
        />
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
