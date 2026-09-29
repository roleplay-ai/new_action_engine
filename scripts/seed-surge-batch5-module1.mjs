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
const batchName = "Batch 5";
const moduleName = "Module 1";
/** First day of the two-day module ("Module 1: 27-28 October 2026" per the
 * source roster), seeded as this cohort's first cohort_dates row if the
 * cohort doesn't exist yet. */
const trainingDate = "2026-10-27";

/** From "SURGE - Batch 4-5-6 Updated List_28 Spet 2026.xlsx" — Batch 5 sheet.
 * No team-assignment data exists for this batch in the source file (unlike
 * Batch 4), so no participant_tags/team is set here — assign teams later via
 * the admin UI. Simple unique 6-letter lowercase English passwords, one per
 * person, matching the existing seed-surge-batch4-module1.mjs convention. */
const people = [
  { fullName: "Aditya Singh", email: "aditya44.singh@ril.com", password: "planet" },
  { fullName: "Chandan Mathur", email: "chandan.mathur@ril.com", password: "forest" },
  { fullName: "Kuldip Shukla", email: "kuldip.shukla@ril.com", password: "garden" },
  { fullName: "Manish Agarwal", email: "manish4.agarwal@ril.com", password: "window" },
  { fullName: "Pradeep Shukla", email: "pradeep8.shukla@ril.com", password: "silver" },
  { fullName: "Simpreet Arora", email: "simpreet.arora@ril.com", password: "bronze" },
  { fullName: "Srigopal Taparia", email: "srigopal.taparia@ril.com", password: "marble" },
  { fullName: "Gunjan Sharma", email: "gunjan3.sharma@ril.com", password: "cactus" },
  { fullName: "Manali Srivastava", email: "manali1.srivastava@ril.com", password: "pepper" },
  { fullName: "Niharika Bist", email: "niharika.bist@ril.com", password: "button" },
  { fullName: "Pradeep Jadhav", email: "pradeep2.jadhav@ril.com", password: "candle" },
  { fullName: "Utsav DASGUPTA", email: "utsav.dasgupta@ril.com", password: "pocket" },
  { fullName: "Vishant Bhosale", email: "vishant.bhosale@ril.com", password: "winter" },
  { fullName: "Rahul Bhuyan", email: "rahul.bhuyan@ril.com", password: "summer" },
  { fullName: "Divisha Raj", email: "divisha.raj@ril.com", password: "spring" },
  { fullName: "Abhishek Yadav", email: "abhishek45.yadav@ril.com", password: "autumn" },
  { fullName: "Kavita Gulati", email: "kavita.gulati@ril.com", password: "yellow" },
  { fullName: "Rajesh Kumar Boopalan", email: "rajesh1.boopalan@ril.com", password: "orange" },
  { fullName: "Simmy Roy", email: "simmy.roy@ril.com", password: "jungle" },
  { fullName: "Loganathan R G", email: "loganathan2.r@ril.com", password: "bridge" },
  { fullName: "Naveen Kumar", email: "naveen96.kumar@ril.com", password: "castle" },
  { fullName: "Ashutosh kumar Tripathi", email: "ashutosh.s.tripathi@ril.com", password: "dragon" },
  { fullName: "Rajeev Kumar Mandal", email: "rajeev107.kumar@ril.com", password: "falcon" },
  { fullName: "Vijaykumar M B", email: "vijaykumar.mb@ril.com", password: "guitar" },
  { fullName: "Neelam Gopalchandr", email: "neelam.dani@ril.com", password: "hammer" },
  { fullName: "Pravin vasant Gadkari", email: "pravin.gadkari@ril.com", password: "island" },
  { fullName: "sreenivasa KT", email: "sreenivasa.kt@ril.com", password: "temple" },
  { fullName: "Amalin Kavitha Amalaraj", email: "amalin.kavitha@ril.com", password: "velvet" },
  { fullName: "Sachin Risbud", email: "sachin.risbud@ril.com", password: "canyon" },
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
