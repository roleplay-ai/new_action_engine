import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const companyName = "Surge";
const batchName = "Batch 6";
const moduleName = "Module 1";
/** First day of the two-day module ("Module 1: 29-30 October 2026" per the
 * source roster), seeded as this cohort's first cohort_dates row if the
 * cohort doesn't exist yet. */
const trainingDate = "2026-10-29";

/** From "SURGE - Batch 4-5-6 Updated List_28 Spet 2026.xlsx" — Batch 6 sheet.
 * No team-assignment data exists for this batch in the source file (unlike
 * Batch 4), so no participant_tags/team is set here — assign teams later via
 * the admin UI. Simple unique 6-letter lowercase English passwords, one per
 * person, matching the existing seed-surge-batch4-module1.mjs convention. */
const people = [
  { fullName: "Abhishek Guha", email: "abhishek2.guha@ril.com", password: "meadow" },
  { fullName: "Girish Chitre", email: "girish.chitre@ril.com", password: "cookie" },
  { fullName: "Manish Sarda", email: "manish.sarda@ril.com", password: "basket" },
  { fullName: "Prashant Mathur", email: "prashant2.mathur@ril.com", password: "mirror" },
  { fullName: "Rajaputra HD Pratap Singh", email: "rajaputra.hd@ril.com", password: "rocket" },
  { fullName: "SUBRAMANYAN KRISHNA", email: "subramanyan.k@ril.com", password: "copper" },
  { fullName: "Shashank Shukla", email: "shashank.shukla@ril.com", password: "desert" },
  { fullName: "Srinivas Pasumarti", email: "srinivas.pasumarti@ril.com", password: "ribbon" },
  { fullName: "Stabak Das", email: "stabak.das@ril.com", password: "tunnel" },
  { fullName: "Srijeeb Guha roy", email: "srijeeb.guha@ril.com", password: "wizard" },
  { fullName: "Rinkesh Ramesh brahmbhatt", email: "rinkesh.ramesh@ril.com", password: "magnet" },
  { fullName: "Shuchi Gautam", email: "shuchi.gautam@ril.com", password: "beacon" },
  { fullName: "Amarjeet Kumar", email: "amarjeet19.kumar@ril.com", password: "anchor" },
  { fullName: "Rishi Bhattacharjee", email: "rishi1.b@ril.com", password: "saddle" },
  { fullName: "Shantanu Bhardwaj", email: "shantanu1.bhardwaj@ril.com", password: "turtle" },
  { fullName: "Sushant .", email: "sushant1.s@ril.com", password: "rabbit" },
  { fullName: "Alok kumar Mishra", email: "alok.k.mishra@ril.com", password: "monkey" },
  { fullName: "Avinash Mahanthi", email: "avinash.mahanthi@ril.com", password: "donkey" },
  { fullName: "Biswajit Nandi", email: "biswajit1.nandi@ril.com", password: "parrot" },
  { fullName: "Chandresh Rohilla", email: "chandresh.rohilla@ril.com", password: "walrus" },
  { fullName: "Harendra Chauhan", email: "harendra2.chauhan@ril.com", password: "salmon" },
  { fullName: "Kishore Gopalakrishnan", email: "kishore5.g@ril.com", password: "shrimp" },
  { fullName: "Rupana Akhil", email: "rupana.akhil@ril.com", password: "oyster" },
  { fullName: "Shubham Goyal", email: "shubham3.goyal@ril.com", password: "spider" },
  { fullName: "Amal Krishna Mondal", email: "amal1.mondal@ril.com", password: "beetle" },
  { fullName: "Anudeep Rastogi", email: "anudeep.rastogi@ril.com", password: "cicada" },
  { fullName: "Venkateswarlu Jaladanki", email: "venkateswarlu.j@ril.com", password: "locust" },
  { fullName: "Sagareeka Pradhan", email: "sagareeka.pradhan@ril.com", password: "mantis" },
];

/** Kept in sync with the legacy composite `cohorts.name` column the app
 * displays in the cohort switcher etc. (see composeCohortName in
 * app/actions/cohorts.ts). */
function composeCohortName(batch, module_) {
  return module_ ? `${batch} — ${module_}` : batch;
}

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
  .eq("batch_name", batchName)
  .eq("module_name", moduleName)
  .maybeSingle();
if (cohortError) throw cohortError;

if (!cohort) {
  const created = await admin
    .from("cohorts")
    .insert({
      company_id: company.id,
      batch_name: batchName,
      module_name: moduleName,
      name: composeCohortName(batchName, moduleName),
    })
    .select("id, name")
    .single();
  if (created.error) throw created.error;
  cohort = created.data;

  const dateInsert = await admin.from("cohort_dates").insert({ cohort_id: cohort.id, event_date: trainingDate });
  if (dateInsert.error) throw dateInsert.error;
}

const existingUsers = await listAuthUsers();
const authByEmail = new Map(existingUsers.map((user) => [user.email?.toLowerCase(), user]));

let createdCount = 0;
let updatedCount = 0;
const credentials = [];

for (const person of people) {
  const email = person.email.trim().toLowerCase();
  let user = authByEmail.get(email);

  // Existing users keep whatever password they already have — only brand-new
  // accounts get the generated password below.
  let displayPassword = person.password;
  const isNewUser = !user;

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email,
      password: person.password,
      email_confirm: true,
      user_metadata: {
        full_name: person.fullName,
        seeded_for: `${companyName} ${batchName} ${moduleName}`,
      },
    });
    if (created.error || !created.data.user) {
      throw created.error || new Error(`No user returned for ${email}`);
    }
    user = created.data.user;
    createdCount += 1;
  } else {
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: person.fullName,
        seeded_for: `${companyName} ${batchName} ${moduleName}`,
      },
    });
    if (metadataError) throw metadataError;
    updatedCount += 1;

    const { data: existingCredential } = await admin
      .from("user_credential_delivery")
      .select("plaintext_password")
      .eq("user_id", user.id)
      .maybeSingle();
    displayPassword = existingCredential?.plaintext_password ?? "(unchanged — not stored)";
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: person.fullName,
      company_id: company.id,
      role: "user",
      current_cohort_id: cohort.id,
      selected_cohort_id: cohort.id,
    },
    { onConflict: "id" }
  );
  if (profileError) throw profileError;

  const { error: membershipError } = await admin.from("cohort_members").upsert(
    {
      cohort_id: cohort.id,
      user_id: user.id,
    },
    { onConflict: "cohort_id,user_id" }
  );
  if (membershipError) throw membershipError;

  // Only write user_credential_delivery for brand-new accounts — an existing
  // user's row (their actual current password) is left untouched.
  if (isNewUser) {
    const { error: credentialError } = await admin.from("user_credential_delivery").upsert(
      {
        user_id: user.id,
        email,
        plaintext_password: person.password,
      },
      { onConflict: "user_id" }
    );
    if (credentialError) throw credentialError;
  }

  credentials.push({
    fullName: person.fullName,
    email,
    password: displayPassword,
  });
}

console.log(
  `Surge seed complete: ${createdCount} created, ${updatedCount} updated/reused, ${people.length} assigned to ${cohort.name} (${company.name}).`
);
console.log("");
console.log("Employee Name\tEmail\tPassword");
for (const row of credentials) {
  console.log(`${row.fullName}\t${row.email}\t${row.password}`);
}
