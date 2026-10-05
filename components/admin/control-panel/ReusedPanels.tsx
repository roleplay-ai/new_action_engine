"use client";

import CohortChat from "@/components/journey/CohortChat";
import { NoticesWorkspace } from "@/components/admin/views/NoticesView";
import { ContentManagementView } from "@/components/admin/views/ContentManagementView";
import { batchLabel, CpNeedBatch, CpPageHeader, useControlPanelBatch, useReportViewReady } from "./shared";

/** The batch's group chat — the same conversation participants see. */
export function ConversationsPanel() {
  const { cohortId, option, loading } = useControlPanelBatch();
  useReportViewReady(!loading);
  return (
    <section className="cp-page">
      <CpPageHeader
        title="Conversations"
        description={option ? <>The group conversation for <strong>{batchLabel(option)}</strong>. Everyone in the batch can see it.</> : "The group conversation of a batch."}
      />
      {cohortId ? (
        <div className="cp-panel cp-panel--flush">
          <CohortChat key={cohortId} cohortId={cohortId} />
        </div>
      ) : (
        <CpNeedBatch loading={loading} />
      )}
    </section>
  );
}

/** The batch notice board: post and remove announcements. */
export function AnnouncementsPanel() {
  const { cohortId, option, loading } = useControlPanelBatch();
  useReportViewReady(!loading);
  return (
    <section className="cp-page">
      <CpPageHeader
        title="Announcements"
        description={option ? <>Post a notice for <strong>{batchLabel(option)}</strong>. It appears on the batch notice board.</> : "Post a notice on a batch notice board."}
      />
      {cohortId ? (
        <div className="cp-panel">
          <NoticesWorkspace key={cohortId} cohortId={cohortId} />
        </div>
      ) : (
        <CpNeedBatch loading={loading} />
      )}
    </section>
  );
}

/** The company content library, unchanged from the old Content Management page. */
export function ContentPanel() {
  const { companyId, role } = useControlPanelBatch();
  useReportViewReady(true);
  return (
    <section className="cp-page">
      <CpPageHeader title="Content management" description="Videos, quizzes and pre-reads in your content library." />
      <div className="cp-panel">
        <ContentManagementView companyId={companyId} role={role} />
      </div>
    </section>
  );
}
