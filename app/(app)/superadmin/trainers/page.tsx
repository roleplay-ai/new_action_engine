import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listTrainersWithLoginStatus } from "@/app/actions/trainers";
import CreateTrainerForm from "./create-trainer-form";
import TrainersList from "./trainers-list";
import { UserRound } from "lucide-react";

export default async function TrainersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "superadmin" && !isSuperadminEmail) redirect("/");

  const { trainers } = await listTrainersWithLoginStatus();
  const trainerList = trainers ?? [];

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div><h1>Trainers</h1><p>Build the trainer roster, assign one to each cohort from Cohort Management, then give them a login below.</p></div>
        <CreateTrainerForm />
      </div>

      <section className="superadmin-surface">
        <div className="superadmin-section-heading">
          <div><h2>Trainer roster</h2><p>Name, photo and login shown to participants and used to sign in at /login.</p></div>
          <span>{trainerList.length} trainers</span>
        </div>
        {trainerList.length > 0 ? (
          <TrainersList trainers={trainerList} />
        ) : (
          <div className="superadmin-empty">
            <UserRound size={26} /><strong>No trainers yet</strong><p>Add a trainer's name and photo to assign them to a cohort.</p>
          </div>
        )}
      </section>
    </div>
  );
}
