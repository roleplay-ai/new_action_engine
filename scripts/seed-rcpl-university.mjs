import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const companyName = "RCPL University";
const cohortName = "RCPL University Cohort";
const provisionCredentials = process.argv.includes("--provision-credentials");
const people = [
  "Aarav Sharma", "Aditi Verma", "Ananya Iyer", "Arjun Mehta", "Diya Nair",
  "Ishaan Gupta", "Kavya Rao", "Krish Malhotra", "Meera Joshi", "Neha Kapoor",
  "Nikhil Singh", "Priya Desai", "Rahul Menon", "Riya Patel", "Rohan Kulkarni",
  "Saanvi Bose", "Siddharth Jain", "Tanvi Reddy", "Vihaan Shah", "Zoya Khan",
];

async function listAuthUsers() {
  const users = [];
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return users;
}

const { data: company, error: companyError } = await admin
  .from("companies")
  .select("id, name")
  .ilike("name", companyName)
  .limit(1)
  .maybeSingle();

if (companyError) throw companyError;
if (!company) throw new Error(`Company "${companyName}" was not found. Create it first, then run this seed again.`);

let { data: cohort, error: cohortError } = await admin
  .from("cohorts")
  .select("id, name")
  .eq("company_id", company.id)
  .is("archived_at", null)
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();

if (cohortError) throw cohortError;
if (!cohort) {
  const created = await admin
    .from("cohorts")
    .insert({
      company_id: company.id,
      name: cohortName,
      description: "Seeded learning cohort for the RCPL University workspace.",
      start_date: new Date().toISOString().slice(0, 10),
    })
    .select("id, name")
    .single();
  if (created.error) throw created.error;
  cohort = created.data;
}

const existingUsers = await listAuthUsers();
const authByEmail = new Map(existingUsers.map((user) => [user.email?.toLowerCase(), user]));
let createdCount = 0;
let reusedCount = 0;
let credentialCount = 0;

function createPassword() {
  return `Rcpl!${randomUUID().replaceAll("-", "").slice(0, 18)}Aa1`;
}

for (const [index, fullName] of people.entries()) {
  const number = String(index + 1).padStart(2, "0");
  const email = `rcpl.student${number}@example.com`;
  let user = authByEmail.get(email);
  let credentialPassword = null;

  if (!user) {
    const password = createPassword();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, seeded_for: companyName },
    });
    if (created.error || !created.data.user) throw created.error || new Error(`No user returned for ${email}`);
    user = created.data.user;
    if (provisionCredentials) credentialPassword = password;
    createdCount += 1;
  } else {
    reusedCount += 1;
    if (provisionCredentials) {
      credentialPassword = createPassword();
      const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
        password: credentialPassword,
      });
      if (passwordError) throw passwordError;
    }
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    company_id: company.id,
    role: "user",
  }, { onConflict: "id" });
  if (profileError) throw profileError;

  const { error: membershipError } = await admin.from("cohort_members").upsert({
    cohort_id: cohort.id,
    user_id: user.id,
  }, { onConflict: "cohort_id,user_id", ignoreDuplicates: true });
  if (membershipError) throw membershipError;

  const { error: contextError } = await admin
    .from("profiles")
    .update({ current_cohort_id: cohort.id, selected_cohort_id: cohort.id })
    .eq("id", user.id);
  if (contextError) throw contextError;

  if (credentialPassword) {
    const { error: credentialError } = await admin.from("user_credential_delivery").upsert({
      user_id: user.id,
      email,
      plaintext_password: credentialPassword,
    }, { onConflict: "user_id" });
    if (credentialError) throw credentialError;
    credentialCount += 1;
  }
}

console.log(`RCPL University seed complete: ${createdCount} created, ${reusedCount} reused, ${people.length} assigned to ${cohort.name}, ${credentialCount} credentials provisioned.`);
