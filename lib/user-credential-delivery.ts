import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Persists login email + plaintext password for the credential email template.
 * Supabase Auth cannot expose the password after create; this row is the only copy in your DB.
 * Rows are not removed when emails are sent — admins resend from Email Management when needed.
 */
export async function upsertUserCredentialDelivery(
  admin: SupabaseClient,
  params: { userId: string; email: string; plaintextPassword: string }
): Promise<{ error?: string }> {
  const { error } = await admin.from("user_credential_delivery").upsert(
    {
      user_id: params.userId,
      email: params.email,
      plaintext_password: params.plaintextPassword,
    },
    { onConflict: "user_id" }
  );
  return error ? { error: error.message } : {};
}
