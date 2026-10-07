import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStoredCredentials } from "@/app/actions/superadmin-credentials";
import CredentialsClient from "./credentials-client";
import { ShieldAlert } from "lucide-react";

export default async function SuperadminCredentialsPage() {
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

  const { rows, error } = await getStoredCredentials();

  return (
    <div className="superadmin-page">
      <div className="superadmin-page-heading">
        <div>
          <h1>Credential store</h1>
          <p>Login emails and passwords stored for every user. Search, or filter by batch and module.</p>
        </div>
      </div>

      <div className="superadmin-alert warning">
        <strong>Sensitive data</strong>
        <span>Passwords are plaintext and hidden until revealed. Don&apos;t share this screen or paste credentials into chat.</span>
      </div>

      {error && (
        <div className="superadmin-alert warning">
          <strong>{error}</strong>
          <span>Ensure the service-role configuration is available to read stored credentials.</span>
        </div>
      )}

      <section className="superadmin-surface">
        <div className="superadmin-section-heading">
          <div><h2>Stored logins</h2><p>Email and password from the user credential table.</p></div>
          <span>{rows.length} records</span>
        </div>
        {error ? (
          <div className="superadmin-empty">
            <ShieldAlert size={26} /><strong>Could not load credentials</strong><p>Check the server configuration and refresh this page.</p>
          </div>
        ) : (
          <CredentialsClient rows={rows} />
        )}
      </section>
    </div>
  );
}
