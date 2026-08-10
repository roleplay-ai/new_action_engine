"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TrainerExpectation, TrainerExpectationMessage } from "@/lib/types";

/** The current user's one-time message to their trainer for this cohort. */
export async function getMyTrainerMessages(cohortId: string): Promise<{
  error?: string;
  messages?: TrainerExpectationMessage[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: membership } = await supabase
      .from("cohort_members")
      .select("id")
      .eq("cohort_id", cohortId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return { error: "You do not have access to this batch" };

    const { data: rows, error } = await supabase
      .from("trainer_expectations")
      .select("id, message, created_at")
      .eq("cohort_id", cohortId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return { error: error.message };

    return {
      messages: (rows ?? []).map((row) => ({ id: row.id, message: row.message, createdAt: row.created_at })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load your messages" };
  }
}

/** Send the participant's one-time message to the trainer for this cohort. */
export async function saveTrainerExpectation(cohortId: string, message: string): Promise<{
  error?: string;
  message?: TrainerExpectationMessage;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: membership } = await supabase
      .from("cohort_members")
      .select("id")
      .eq("cohort_id", cohortId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return { error: "You do not have access to this batch" };

    const cleanMessage = message.trim();
    if (!cleanMessage) return { error: "Write something before sending" };
    if (cleanMessage.length > 2000) return { error: "Messages can be up to 2,000 characters" };

    const { count } = await supabase
      .from("trainer_expectations")
      .select("id", { count: "exact", head: true })
      .eq("cohort_id", cohortId)
      .eq("user_id", user.id);
    if ((count ?? 0) > 0) {
      return { error: "You have already sent your message to the trainer" };
    }

    const { data: row, error } = await supabase
      .from("trainer_expectations")
      .insert({ cohort_id: cohortId, user_id: user.id, message: cleanMessage })
      .select("id, message, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { error: "You have already sent your message to the trainer" };
      }
      return { error: error.message };
    }
    if (!row) return { error: "The message was sent but could not be displayed" };

    revalidatePath("/journey");
    return { message: { id: row.id, message: row.message, createdAt: row.created_at } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send your message" };
  }
}

/** Admin/superadmin inbox: every message every participant has sent this
 * cohort's trainer, standing in for the trainer (who has no login of their
 * own), newest first. */
export async function getTrainerExpectationsForCohort(cohortId: string): Promise<{
  error?: string;
  expectations?: TrainerExpectation[];
  answeredMembers?: number;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
    if (!profile) return { error: "Profile not found" };
    if (profile.role !== "admin" && profile.role !== "superadmin") return { error: "Forbidden: admin or superadmin only" };

    const admin = createAdminClient();
    const { data: cohort } = await admin.from("cohorts").select("company_id").eq("id", cohortId).maybeSingle();
    if (!cohort) return { error: "Cohort not found" };
    if (profile.role === "admin" && cohort.company_id !== profile.company_id) return { error: "Access denied" };

    const { data: rows, error } = await admin
      .from("trainer_expectations")
      .select("id, cohort_id, user_id, message, created_at")
      .eq("cohort_id", cohortId)
      .order("created_at", { ascending: false });
    if (error) return { error: error.message };

    const userIds = [...new Set((rows ?? []).map((row) => row.user_id))];
    const { data: senders } = userIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };
    const senderMap = new Map((senders ?? []).map((sender) => [sender.id, sender.full_name]));

    return {
      expectations: (rows ?? []).map((row) => ({
        id: row.id,
        cohortId: row.cohort_id,
        userId: row.user_id,
        userName: senderMap.get(row.user_id)?.trim() || "Cohort member",
        message: row.message,
        createdAt: row.created_at,
      })),
      answeredMembers: userIds.length,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load messages" };
  }
}
