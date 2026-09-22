import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listParticipantTagsWithUsage } from "@/app/actions/participant-tags";
import TagManagementClient from "../tag-management-client";
import { Tag } from "lucide-react";

export default async function SuperadminTagsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && !isSuperadminEmail) redirect("/");

  const result = await listParticipantTagsWithUsage();
  const tags = result.tags ?? [];

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div>
          <h1>Participant tags</h1>
          <p>
            The shared team-tag roster used across every batch. A tag can be assigned to participants in more than
            one company&apos;s batch at once — rename or delete one and it changes everywhere it&apos;s in use.
          </p>
        </div>
      </div>

      {result.error && (
        <div className="superadmin-alert warning">
          <strong>{result.error}</strong>
        </div>
      )}

      <section className="superadmin-surface">
        <div className="superadmin-section-heading">
          <div>
            <h2>Tag roster</h2>
            <p>Company admins only see the tags already assigned within their own company.</p>
          </div>
          <span>{tags.length} total</span>
        </div>
        <TagManagementClient
          tags={tags}
          emptyState={
            <div className="superadmin-empty">
              <Tag size={26} />
              <strong>No tags yet</strong>
              <p>Create the first tag below.</p>
            </div>
          }
        />
      </section>
    </div>
  );
}
