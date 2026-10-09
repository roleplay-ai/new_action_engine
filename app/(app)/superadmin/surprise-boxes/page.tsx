import { redirect } from "next/navigation";
import { FileText, Gift, PlayCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listSurpriseResources } from "@/app/actions/surprise-box-resources";
import { SURPRISE_LIBRARY_TARGET } from "@/lib/surprise-boxes";
import SurpriseLibrary from "./surprise-library";

export default async function SurpriseBoxesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "superadmin" && !isSuperadminEmail) redirect("/");

  const { resources = [], error } = await listSurpriseResources();
  const active = resources.filter((resource) => resource.isActive);
  const activeVideos = active.filter((resource) => resource.kind === "video").length;
  const missing = Math.max(0, SURPRISE_LIBRARY_TARGET - active.length);

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div>
          <h1>Surprise boxes</h1>
          <p>Videos and resources participants unlock when they complete an action. Each action in a plan gets one at random.</p>
        </div>
      </div>

      {error && (
        <div className="superadmin-alert warning">
          <strong>{error}</strong>
        </div>
      )}

      {!error && missing > 0 && (
        <div className="superadmin-alert warning">
          <strong>Add {missing} more active resource{missing === 1 ? "" : "s"} before the next cohort goes live.</strong>
          <span>Aim for at least {SURPRISE_LIBRARY_TARGET} so participants get variety across a 12-action plan. With fewer, resources repeat.</span>
        </div>
      )}

      <div className="superadmin-stat-grid">
        <div className="superadmin-stat">
          <span><Gift size={17} /></span>
          <div><small>Active resources</small><strong>{active.length}</strong><p>Target {SURPRISE_LIBRARY_TARGET}</p></div>
        </div>
        <div className="superadmin-stat">
          <span><PlayCircle size={17} /></span>
          <div><small>Videos</small><strong>{activeVideos}</strong><p>Active</p></div>
        </div>
        <div className="superadmin-stat">
          <span><FileText size={17} /></span>
          <div><small>Resources</small><strong>{active.length - activeVideos}</strong><p>Active PDFs and links</p></div>
        </div>
      </div>

      <SurpriseLibrary resources={resources} />
    </div>
  );
}
