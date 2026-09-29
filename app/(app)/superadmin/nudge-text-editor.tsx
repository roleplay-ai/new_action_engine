"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { tokenizeNudgeText } from "@/lib/nudge-email-content";

export type NudgeTextEditorHandle = {
  /** Inserts text at the caret (or replaces the selection) and refocuses. */
  insert: (text: string) => void;
};

// Shared by the textarea and the highlight layer behind it — they must
// wrap identically for the highlights to line up with the typed text.
const TEXT_CLASSES = "px-3 py-2 font-sans text-sm leading-6 tracking-normal whitespace-pre-wrap break-words";

/**
 * A textarea whose {{variables}} and [[links]] are highlighted in place: a
 * mirror layer renders the same text with coloured marks behind a
 * transparent-background textarea. The textarea auto-grows so the two never
 * scroll out of sync.
 */
export const NudgeTextEditor = forwardRef<
  NudgeTextEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    onFocus?: () => void;
    singleLine?: boolean;
    minRows?: number;
    maxLength?: number;
    ariaLabel: string;
  }
>(function NudgeTextEditor({ value, onChange, onFocus, singleLine = false, minRows = 1, maxLength, ariaLabel }, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, [value]);

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      const textarea = textareaRef.current;
      const start = textarea?.selectionStart ?? value.length;
      const end = textarea?.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + text + value.slice(end));
      requestAnimationFrame(() => {
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(start + text.length, start + text.length);
      });
    },
  }));

  return (
    <div className="relative rounded-lg border border-slate-300 bg-white focus-within:border-slate-500">
      <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${TEXT_CLASSES}`}>
        {tokenizeNudgeText(value).map((token, index) =>
          token.type === "text" ? (
            <span key={index}>{token.value}</span>
          ) : (
            <mark
              key={index}
              className={`rounded text-transparent ${
                token.type === "link"
                  ? "bg-amber-200 shadow-[0_0_0_2px_#fde68a]"
                  : token.known
                    ? "bg-indigo-100 shadow-[0_0_0_2px_#e0e7ff]"
                    : "bg-red-200 shadow-[0_0_0_2px_#fecaca]"
              }`}
            >
              {token.value}
            </mark>
          )
        )}
        {/* Keeps a trailing newline's empty last line the same height. */}
        {"​"}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        rows={minRows}
        maxLength={maxLength}
        aria-label={ariaLabel}
        spellCheck
        onFocus={onFocus}
        onChange={(event) => onChange(singleLine ? event.target.value.replace(/[\r\n]+/g, " ") : event.target.value)}
        onKeyDown={(event) => {
          if (singleLine && event.key === "Enter") event.preventDefault();
        }}
        className={`relative block w-full resize-none overflow-hidden rounded-lg bg-transparent text-slate-800 caret-slate-900 outline-none ${TEXT_CLASSES}`}
      />
    </div>
  );
});
