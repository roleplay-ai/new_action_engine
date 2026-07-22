import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listContentItems } from "@/app/actions/prepare-content";
import ContentLibraryList from "./content-library-list";
import CreateContentForm from "./create-content-form";
import AssignContentPanel from "./assign-content-panel";
import { Archive, FileStack, PlayCircle } from "lucide-react";

export default async function ContentLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "superadmin" && !isSuperadminEmail) redirect("/");

  const { items } = await listContentItems();
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const contentItems = items ?? [];

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div><span>Learning operations</span><h1>Content library</h1><p>Build reusable preparation content and distribute it to cohorts.</p></div>
        <CreateContentForm />
      </div>

      <div className="superadmin-stat-grid">
        <div className="superadmin-stat"><span><FileStack size={17} /></span><div><small>Total content</small><strong>{contentItems.length}</strong><p>Reusable learning items</p></div></div>
        <div className="superadmin-stat"><span><PlayCircle size={17} /></span><div><small>Active content</small><strong>{contentItems.filter((item) => item.isActive).length}</strong><p>Available for assignment</p></div></div>
        <div className="superadmin-stat"><span><Archive size={17} /></span><div><small>Archived</small><strong>{contentItems.filter((item) => !item.isActive).length}</strong><p>Retained outside circulation</p></div></div>
      </div>

      <section className="superadmin-surface">
        <div className="superadmin-section-heading"><div><h2>Library items</h2><p>Videos, quizzes, and pre-reading available across organisations.</p></div><span>{contentItems.length} items</span></div>
        {contentItems.length > 0 ? (
          <ContentLibraryList items={contentItems} />
        ) : (
          <div className="superadmin-empty">
            <FileStack size={26} /><strong>No content yet</strong><p>Create a video, quiz, or pre-read to build the shared library.</p>
          </div>
        )}
      </section>

      <section><div className="superadmin-section-heading standalone"><div><h2>Assign to a cohort</h2><p>Choose an organisation, cohort, and active learning items.</p></div></div><AssignContentPanel companies={companies ?? []} items={contentItems} /></section>
    </div>
  );
}
