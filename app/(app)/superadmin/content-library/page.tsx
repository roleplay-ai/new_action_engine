import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listContentItems } from "@/app/actions/prepare-content";
import ContentLibraryList from "./content-library-list";
import CreateContentForm from "./create-content-form";
import AssignContentPanel from "./assign-content-panel";

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

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-black uppercase italic tracking-tight">Content Library</h1>
        <CreateContentForm />
      </div>

      <div className="bg-white border-4 border-black rounded-[24px] overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {items && items.length > 0 ? (
          <ContentLibraryList items={items} />
        ) : (
          <div className="p-12 text-center text-slate-500">
            <p className="font-bold uppercase tracking-wider">No content yet</p>
            <p className="text-sm mt-2">Create a video, quiz, or pre-read above</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-black uppercase italic tracking-tight mb-3">Assign to a cohort</h2>
        <AssignContentPanel companies={companies ?? []} items={items ?? []} />
      </div>
    </div>
  );
}
