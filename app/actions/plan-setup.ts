"use server";

import { createClient } from "@/lib/supabase/server";
import { getMySessionNotes } from "@/app/actions/session-notes";
import { getMyWhatsAppSettings } from "@/app/actions/whatsapp";
import { EMPTY_MY_PLAN_ANSWERS, type MyPlanAnswers } from "@/lib/my-plan-notes";
import { indianMobileDigits } from "@/lib/whatsapp-contacts";

export type MyPlanSetupContext = {
  answers: MyPlanAnswers;
  /** Login email, shown on the setup card as where reminders go. */
  email: string | null;
  whatsapp: {
    /** False until WhatsApp is configured on the server; the form then hides the number. */
    available: boolean;
    /** 10 digits after +91, or "" when no Indian number is saved. */
    phoneDigits: string;
    /** The participant replied STOP earlier. */
    optedOut: boolean;
  };
};

/** Everything the plan popup and setup cards on My Actions need, in one call. */
export async function getMyPlanSetupContext(cohortId: string): Promise<{ context?: MyPlanSetupContext; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [notes, whatsapp] = await Promise.all([getMySessionNotes(cohortId), getMyWhatsAppSettings(cohortId)]);
  if (notes.error) return { error: notes.error };

  return {
    context: {
      answers: notes.answers ?? { ...EMPTY_MY_PLAN_ANSWERS },
      email: user.email ?? null,
      whatsapp: {
        available: whatsapp.settings?.available ?? false,
        phoneDigits: indianMobileDigits(whatsapp.settings?.phone),
        optedOut: whatsapp.settings?.optedOut ?? false,
      },
    },
  };
}
