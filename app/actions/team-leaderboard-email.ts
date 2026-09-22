"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured } from "@/lib/resend";
import { renderEmailTemplate } from "@/lib/email-templates";
import { sendTemplateToUsers } from "@/lib/email-send";
import { getCohortTeamCommitmentScores } from "@/app/actions/commitment-wallet";

async function requireSuperadmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "admin@actionengine").toLowerCase();
  const isSuperadminEmail = user.email?.toLowerCase() === superadminEmail;
  if (profile?.role !== "superadmin" && !isSuperadminEmail) {
    throw new Error("Forbidden: superadmin only");
  }

  return { userId: user.id };
}

export type LeaderboardTeamRow = {
  rank: number;
  teamName: string;
  averageScore: number | null;
};

/** Same "highest average first, no-plan-yet teams last" ordering the RCPL
 * workspace's own Team avg commitment score card uses, plus a 1-based rank
 * for the email's standings table. */
function rankTeams(teams: { teamName: string; averageScore: number | null }[]): LeaderboardTeamRow[] {
  return [...teams]
    .sort((a, b) => {
      if (a.averageScore === null) return b.averageScore === null ? 0 : 1;
      if (b.averageScore === null) return -1;
      return b.averageScore - a.averageScore;
    })
    .map((team, index) => ({ rank: index + 1, teamName: team.teamName, averageScore: team.averageScore }));
}

async function loadCohortContext(cohortId: string) {
  const admin = createAdminClient();
  const { data: cohort, error: cohortError } = await admin
    .from("cohorts")
    .select("id, batch_name, module_name, company_id")
    .eq("id", cohortId)
    .maybeSingle();
  if (cohortError) throw new Error(cohortError.message);
  if (!cohort) throw new Error("Batch not found");

  let companyName: string | undefined;
  let companyLogo: string | undefined;
  if (cohort.company_id) {
    const { data: company } = await admin
      .from("companies")
      .select("name, logo_url")
      .eq("id", cohort.company_id)
      .maybeSingle();
    companyName = company?.name ?? undefined;
    companyLogo = company?.logo_url ?? undefined;
  }

  const batchName = [cohort.batch_name, cohort.module_name].filter(Boolean).join(" — ") || undefined;

  const { data: members, error: membersError } = await admin
    .from("cohort_members")
    .select("user_id")
    .eq("cohort_id", cohortId);
  if (membersError) throw new Error(membersError.message);
  const userIds = [...new Set((members ?? []).map((member) => member.user_id as string))];

  return { batchName, companyName, companyLogo, userIds };
}

export type TeamLeaderboardPreview = {
  batchName?: string;
  companyName?: string;
  teams: LeaderboardTeamRow[];
  recipientCount: number;
  subject: string;
  html: string;
};

/** Builds the same email a Send would fire, without sending it — lets the
 * superadmin see exactly who it's going to and what it looks like first. */
export async function getTeamLeaderboardPreview(cohortId: string): Promise<{ preview?: TeamLeaderboardPreview; error?: string }> {
  try {
    await requireSuperadmin();
    if (!cohortId) return { error: "Select a batch first" };

    const { batchName, companyName, companyLogo, userIds } = await loadCohortContext(cohortId);
    const { teams, error: teamsError } = await getCohortTeamCommitmentScores(cohortId);
    if (teamsError) return { error: teamsError };

    const rankedTeams = rankTeams(teams);
    const templateData = {
      first_name: "there",
      batch_name: batchName,
      company_name: companyName,
      company_logo: companyLogo,
      teams: rankedTeams,
      login_url: "#",
    };
    const { subject, html } = renderEmailTemplate("team_leaderboard", templateData);

    return {
      preview: {
        batchName,
        companyName,
        teams: rankedTeams,
        recipientCount: userIds.length,
        subject,
        html,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not build the preview" };
  }
}

/** Sends the team commitment leaderboard to every member of the chosen
 * batch, right now — manual only, never on a schedule. */
export async function sendTeamLeaderboardEmail(cohortId: string): Promise<{ sent?: number; failed?: number; error?: string }> {
  try {
    const { userId } = await requireSuperadmin();
    if (!isResendConfigured()) {
      return { error: "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL." };
    }
    if (!cohortId) return { error: "Select a batch first" };

    const { batchName, companyName, companyLogo, userIds } = await loadCohortContext(cohortId);
    if (userIds.length === 0) return { error: "This batch has no members to email" };

    const { teams, error: teamsError } = await getCohortTeamCommitmentScores(cohortId);
    if (teamsError) return { error: teamsError };
    const rankedTeams = rankTeams(teams);

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) return { error: "RESEND_FROM_EMAIL is not set" };
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const results = await sendTemplateToUsers({
      userIds,
      templateId: "team_leaderboard",
      fromEmail,
      baseUrl,
      sentBy: userId,
      cohortIdForUser: () => cohortId,
      loginPath: "/journey",
      extraTemplateData: {
        batch_name: batchName,
        company_name: companyName,
        company_logo: companyLogo,
        teams: rankedTeams,
      },
    });

    const sent = results.filter((result) => result.success).length;
    const failed = results.length - sent;
    return { sent, failed, error: sent === 0 ? results[0]?.error ?? "Could not send the email" : undefined };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send the team leaderboard email" };
  }
}
