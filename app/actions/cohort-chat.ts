"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CohortMessage } from "@/lib/types";

type ChatAccess = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  userName: string;
  role: string;
};

async function getChatAccess(cohortId: string): Promise<ChatAccess | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Profile not found" };

  const { data: membership } = await supabase
    .from("cohort_members")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) return { supabase, userId: user.id, userName: profile.full_name?.trim() || "Cohort member", role: profile.role };

  if (profile.role === "admin" || profile.role === "superadmin") {
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("company_id")
      .eq("id", cohortId)
      .maybeSingle();
    const canTrain = profile.role === "superadmin" || (!!cohort && cohort.company_id === profile.company_id);
    if (canTrain) return { supabase, userId: user.id, userName: profile.full_name?.trim() || "Trainer", role: profile.role };
  }

  return { error: "You do not have access to this cohort conversation" };
}

export async function getCohortMessages(cohortId: string): Promise<{
  error?: string;
  messages?: CohortMessage[];
  currentUserId?: string;
  currentUserName?: string;
  currentUserRole?: CohortMessage["senderRole"];
}> {
  try {
    const access = await getChatAccess(cohortId);
    if ("error" in access) return { error: access.error };

    // Profile SELECT policies intentionally hide peer profiles from regular
    // participants. Access is checked above before the service client resolves
    // display names for the already-authorized conversation.
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("cohort_messages")
      .select("id, cohort_id, sender_id, message, created_at")
      .eq("cohort_id", cohortId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return { error: error.message };

    const senderIds = [...new Set((rows ?? []).map((row) => row.sender_id))];
    const { data: senders } = senderIds.length
      ? await admin.from("profiles").select("id, full_name, role").in("id", senderIds)
      : { data: [] };
    const senderMap = new Map((senders ?? []).map((sender) => [sender.id, sender]));

    const messages: CohortMessage[] = (rows ?? []).map((row) => {
      const sender = senderMap.get(row.sender_id);
      return {
        id: row.id,
        cohortId: row.cohort_id,
        senderId: row.sender_id,
        senderName: sender?.full_name?.trim() || "Cohort member",
        senderRole: sender?.role === "admin" || sender?.role === "superadmin" ? "trainer" : "participant",
        message: row.message,
        createdAt: row.created_at,
      };
    });

    return {
      messages,
      currentUserId: access.userId,
      currentUserName: access.userName,
      currentUserRole: access.role === "admin" || access.role === "superadmin" ? "trainer" : "participant",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load messages" };
  }
}

export async function sendCohortMessage(cohortId: string, message: string): Promise<{ error?: string }> {
  try {
    const access = await getChatAccess(cohortId);
    if ("error" in access) return { error: access.error };

    const cleanMessage = message.trim();
    if (!cleanMessage) return { error: "Write a message before sending" };
    if (cleanMessage.length > 2000) return { error: "Messages can be up to 2,000 characters" };

    const { error } = await access.supabase.from("cohort_messages").insert({
      cohort_id: cohortId,
      sender_id: access.userId,
      message: cleanMessage,
    });
    if (error) return { error: error.message };

    revalidatePath("/journey");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send message" };
  }
}
