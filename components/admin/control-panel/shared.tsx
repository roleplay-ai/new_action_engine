"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Layers, Loader2, X } from "lucide-react";
import { setUnsavedChanges, UNSAVED_CHANGES_MESSAGE } from "@/lib/unsaved-changes";
import { useAdminContext } from "@/components/admin/AdminContext";
import { useBatchOptions, type BatchOption } from "@/components/admin/BatchSelector";

/** The batch (batch + module) chosen in the top-right selector, with its
 * names resolved for headings. `option` is null while "All batches" is
 * selected or the options are still loading. */
export function useControlPanelBatch() {
  const { effectiveCompanyId, selectedCohortId, role } = useAdminContext();
  const { options, loading } = useBatchOptions(effectiveCompanyId);
  const option: BatchOption | null = options.find((item) => item.cohortId === selectedCohortId) ?? null;
  return { companyId: effectiveCompanyId, cohortId: option ? selectedCohortId : null, option, options, loading, role };
}

/** Tells BatchPickerGate this page has finished loading, so its loading
 * screen comes down (see viewReady in AdminContext). */
export function useReportViewReady(ready: boolean) {
  const { setViewReady } = useAdminContext();
  useEffect(() => {
    setViewReady(ready);
  }, [ready, setViewReady]);
  useEffect(() => () => setViewReady(true), [setViewReady]);
}

export function batchLabel(option: BatchOption) {
  return option.moduleName ? `${option.batchName} — ${option.moduleName}` : option.batchName;
}

export function initials(value: string | null | undefined) {
  const words = (value || "Unnamed user").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "U";
}

export function CpPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="cp-head">
      <Link href="/admin/control-panel" className="cp-back">
        <ArrowLeft size={15} /> Control panel
      </Link>
      <div className="cp-head-row">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className="cp-head-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** Shown on a batch page while no single batch + module is selected. */
export function CpNeedBatch({ loading }: { loading: boolean }) {
  if (loading) return <div className="cp-loading">Loading…</div>;
  return (
    <div className="cp-empty">
      <Layers size={22} />
      <strong>Choose a batch</strong>
      <span>Pick a batch and module from the lists at the top right of the page.</span>
    </div>
  );
}

export function CpError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="cp-error" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" className="cp-btn cp-btn--secondary cp-btn--small" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export type ConfirmRequest = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** In-page confirmation (the app avoids window.confirm). */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const dialog = request ? (
    <div className="cp-modal-backdrop" role="presentation" onMouseDown={() => setRequest(null)}>
      <div className="cp-modal" role="dialog" aria-modal="true" aria-labelledby="cp-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="cp-confirm-title">{request.title}</h2>
        <div className="cp-modal-body">{request.body}</div>
        <div className="cp-modal-actions">
          <button type="button" className="cp-btn cp-btn--secondary" onClick={() => setRequest(null)} autoFocus>Cancel</button>
          <button
            type="button"
            className={`cp-btn${request.danger ? " cp-btn--danger" : ""}`}
            onClick={() => {
              const action = request.onConfirm;
              setRequest(null);
              void action();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  return { confirm: setRequest, dialog };
}

/** While `dirty`, warns before the admin closes the tab, follows a link, or
 * switches batch (see confirmDiscardUnsaved in BatchSelector). */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    setUnsavedChanges(dirty);
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Capture phase, so it runs before Next's <Link> handles the click.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        setUnsavedChanges(false);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
  useEffect(() => () => setUnsavedChanges(false), []);
}

/** Sticky bar at the bottom of an editing card: nothing is saved until "Save changes". */
export function CpSaveBar({
  changes,
  saving,
  onSave,
  onDiscard,
}: {
  changes: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className={`cp-savebar${changes ? " cp-savebar--dirty" : ""}`} role="region" aria-label="Save changes">
      <span>
        {saving
          ? "Saving your changes…"
          : changes
            ? <><strong>{changes}</strong> {changes === 1 ? "change is" : "changes are"} not saved yet.</>
            : "All changes are saved."}
      </span>
      <span className="cp-savebar-actions">
        <button type="button" className="cp-btn cp-btn--secondary" disabled={!changes || saving} onClick={onDiscard}>
          Discard changes
        </button>
        <button type="button" className="cp-btn" disabled={!changes || saving} onClick={onSave}>
          {saving ? <Loader2 size={15} className="cp-spin" /> : <Check size={15} />} Save changes
        </button>
      </span>
    </div>
  );
}

/** A short message at the bottom of the screen after each change. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 5000);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const toast = message ? (
    <div className="cp-toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={() => setMessage(null)} aria-label="Close message"><X size={15} /></button>
    </div>
  ) : null;
  return { show, toast };
}
