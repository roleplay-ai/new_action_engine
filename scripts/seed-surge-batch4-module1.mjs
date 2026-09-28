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
const batchName = "Batch 4";
const moduleName = "Module 1";
/** Training date from the source roster ("Training: 29-Sep 2026"), seeded as
 * this cohort's first cohort_dates row if the cohort doesn't exist yet. */
const trainingDate = "2026-09-29";

/** From "Surge Batch 4+ teams.xlsx" — PARTICIPANT LIST sheet merged with the
 * TEAMS sheet's team numbers (both sheets list the same 26 people). Teams map
 * to the pre-existing "Team 1".."Team 5" participant_tags rows already used
 * by Batch 1-3. Simple unique 6-letter lowercase English passwords, one per
 * person, matching the existing seed-surge-users.mjs convention. */
const people = [
  { team: 1, fullName: "Tushar Bandal", email: "tushar.bandal@ril.com", password: "planet" },
  { team: 1, fullName: "Pooja Tiwari", email: "pooja3.tiwari@ril.com", password: "forest" },
  { team: 1, fullName: "Shubhendu Shekhar Gupta", email: "shubhendu1.shekhar@ril.com", password: "garden" },
  { team: 1, fullName: "Sudeep Shekhar", email: "sudeep.shekhar@ril.com", password: "window" },
  { team: 1, fullName: "Aditi Kumari", email: "aditi.kumari@ril.com", password: "silver" },
  { team: 2, fullName: "Rakesh Moudgil", email: "rakesh.moudgil@ril.com", password: "bronze" },
  { team: 2, fullName: "Shubham Kumar", email: "shubham83.kumar@ril.com", password: "marble" },
  { team: 2, fullName: "Prateek Gaikwad", email: "prateek.gaikwad@ril.com", password: "cactus" },
  { team: 2, fullName: "Prashant Mathur", email: "prashant2.mathur@ril.com", password: "pepper" },
  { team: 2, fullName: "Sanjeev Sinha", email: "sanjeev3.sinha@ril.com", password: "button" },
  { team: 3, fullName: "P Rajeshkumar", email: "rajeshkumar1.p@ril.com", password: "candle" },
  { team: 3, fullName: "Mahendran p", email: "mahendran4.p@ril.com", password: "pocket" },
  { team: 3, fullName: "Mandar Gadkari", email: "mandar.gadkari@ril.com", password: "winter" },
  { team: 3, fullName: "Prakash Phavade", email: "prakash.phavade@ril.com", password: "summer" },
  { team: 3, fullName: "Pradeep Shukla", email: "pradeep8.shukla@ril.com", password: "spring" },
  { team: 4, fullName: "Baldeep Singh", email: "baldeep.singh@ril.com", password: "autumn" },
  { team: 4, fullName: "Kishan gopal Jhanwar", email: "kishan.jhanwar@ril.com", password: "yellow" },
  { team: 4, fullName: "M Devaraju", email: "devaraju.m@ril.com", password: "orange" },
  { team: 4, fullName: "Chanchal Kumar Rai", email: "chanchal.rai@ril.com", password: "jungle" },
  { team: 4, fullName: "Jayesh Desai", email: "jayesh.desai@ril.com", password: "bridge" },
  { team: 5, fullName: "Aravind Subramaniam", email: "aravind10.s@ril.com", password: "castle" },
  { team: 5, fullName: "Ankur Panwar", email: "ankur.panwar@ril.com", password: "dragon" },
  { team: 5, fullName: "Babu Bharadwaj", email: "babu.bharadwaj@ril.com", password: "falcon" },
  { team: 5, fullName: "Ashok Kumar Singh", email: "ashok2.singh@ril.com", password: "guitar" },
  { team: 5, fullName: "Abhinav Chourasia", email: "abhinav.chourasia@ril.com", password: "hammer" },
  { team: 5, fullName: "Amit Das", email: "amit4.das@ril.com", password: "island" },
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

// "Team 1".."Team 5" already exist as shared participant_tags (reused across
// Batch 1-3) — look them up, and only create a tag if one is genuinely
// missing rather than assuming it must be created.
const teamNumbers = [...new Set(people.map((p) => p.team))];
const tagByTeam = new Map();
for (const teamNumber of teamNumbers) {
  const tagName = `Team ${teamNumber}`;
  let { data: tag, error: tagError } = await admin
    .from("participant_tags")
    .select("id, name")
    .ilike("name", tagName)
    .maybeSingle();
  if (tagError) throw tagError;
  if (!tag) {
    const created = await admin.from("participant_tags").insert({ name: tagName }).select("id, name").single();
    if (created.error) throw created.error;
    tag = created.data;
  }
  tagByTeam.set(teamNumber, tag.id);
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
        team: `Team ${person.team}`,
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
        team: `Team ${person.team}`,
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
      tag_id: tagByTeam.get(person.team),
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
    team: `Team ${person.team}`,
    fullName: person.fullName,
    email,
    password: displayPassword,
  });
}

console.log(
  `Surge seed complete: ${createdCount} created, ${updatedCount} updated/reused, ${people.length} assigned to ${cohort.name} (${company.name}).`
);
console.log("");
console.log("Team\tEmployee Name\tEmail\tPassword");
for (const row of credentials) {
  console.log(`${row.team}\t${row.fullName}\t${row.email}\t${row.password}`);
}
