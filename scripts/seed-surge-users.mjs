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

/** Simple unique 6-letter lowercase English passwords (one per person). */
const people = [
  { team: "Team 1", fullName: "Anup Jaiswal", email: "ANUP1.JAISWAL@RIL.COM", password: "planet" },
  { team: "Team 1", fullName: "Manish Shukla", email: "MANISH6.SHUKLA@RIL.COM", password: "forest" },
  { team: "Team 1", fullName: "Mohit Mishra", email: "MOHIT6.MISHRA@RIL.COM", password: "garden" },
  { team: "Team 1", fullName: "Anup Mishra", email: "ANUP5.MISHRA@RIL.COM", password: "window" },
  { team: "Team 1", fullName: "Harish Saraf", email: "HARISH.SARAF@RIL.COM", password: "silver" },
  { team: "Team 2", fullName: "Chandrashekhar Mudila", email: "CHANDRASHEKHAR3.M@RIL.COM", password: "bronze" },
  { team: "Team 2", fullName: "Sreejit Ghosal", email: "SREEJIT.GHOSAL@RIL.COM", password: "marble" },
  { team: "Team 2", fullName: "Mukesh Tank", email: "MUKESH.TANK@RIL.COM", password: "cactus" },
  { team: "Team 2", fullName: "Atul Kesharwani", email: "ATUL.KESHARWANI@RIL.COM", password: "pepper" },
  { team: "Team 2", fullName: "Karan Anil Kedia", email: "KARAN.KEDIA@RIL.COM", password: "button" },
  { team: "Team 3", fullName: "Prathamesh Naik", email: "PRATHAMESH.NAIK@RIL.COM", password: "candle" },
  { team: "Team 3", fullName: "Sunil Sharma", email: "SUNIL.R.SHARMA@RIL.COM", password: "pocket" },
  { team: "Team 3", fullName: "Abhai Tiwari", email: "ABHAI.TIWARI@RIL.COM", password: "winter" },
  { team: "Team 3", fullName: "Alok Dwivedi", email: "ALOK1.DWIVEDI@RIL.COM", password: "summer" },
  { team: "Team 3", fullName: "Prabhu Ram Nagarajan", email: "PRABHU.NAGARAJAN@RIL.COM", password: "spring" },
  { team: "Team 4", fullName: "Priyangshu Saharia", email: "PRIYANGSHU.SAHARIA@RIL.COM", password: "autumn" },
  { team: "Team 4", fullName: "Vinoth Kuppusamy", email: "VINOTH.KUPPUSAMY@RIL.COM", password: "yellow" },
  { team: "Team 4", fullName: "Laxman Singh Negi", email: "LAXMAN.NEGI@RIL.COM", password: "orange" },
  { team: "Team 4", fullName: "Abdul Rahman", email: "ABDUL6.RAHMAN@RIL.COM", password: "jungle" },
  { team: "Team 4", fullName: "Saran Miriyala", email: "SARAN.MIRIYALA@RIL.COM", password: "bridge" },
  { team: "Team 4", fullName: "Asma Hanif", email: "ASMA.HANIF@RIL.COM", password: "castle" },
  { team: "Team 5", fullName: "Gunjan Sharma", email: "GUNJAN3.SHARMA@RIL.COM", password: "dragon" },
  { team: "Team 5", fullName: "Sonam Jhanji", email: "SONAM.JHANJI@RIL.COM", password: "falcon" },
  { team: "Team 5", fullName: "Suresh Ramasamy", email: "SURESH.RAMASAMY@RIL.COM", password: "guitar" },
  { team: "Team 5", fullName: "Vishesh Baheti", email: "VISHESH.BAHETI@RIL.COM", password: "hammer" },
  { team: "Team 5", fullName: "Paul Mark Dias", email: "PAUL.MARK@RIL.COM", password: "island" },
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
      name: "Surge Cohort",
      batch_name: "Surge Cohort",
      description: "Seeded learning cohort for the Surge workspace.",
    })
    .select("id, name")
    .single();
  if (created.error) throw created.error;
  cohort = created.data;

  const dateError = await admin
    .from("cohort_dates")
    .insert({ cohort_id: cohort.id, event_date: new Date().toISOString().slice(0, 10) });
  if (dateError.error) throw dateError.error;
}

const existingUsers = await listAuthUsers();
const authByEmail = new Map(existingUsers.map((user) => [user.email?.toLowerCase(), user]));

let createdCount = 0;
let updatedCount = 0;
const credentials = [];

for (const person of people) {
  const email = person.email.trim().toLowerCase();
  let user = authByEmail.get(email);

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email,
      password: person.password,
      email_confirm: true,
      user_metadata: {
        full_name: person.fullName,
        team: person.team,
        seeded_for: companyName,
      },
    });
    if (created.error || !created.data.user) {
      throw created.error || new Error(`No user returned for ${email}`);
    }
    user = created.data.user;
    createdCount += 1;
  } else {
    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
      password: person.password,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: person.fullName,
        team: person.team,
        seeded_for: companyName,
      },
    });
    if (passwordError) throw passwordError;
    updatedCount += 1;
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
    { onConflict: "cohort_id,user_id", ignoreDuplicates: true }
  );
  if (membershipError) throw membershipError;

  const { error: credentialError } = await admin.from("user_credential_delivery").upsert(
    {
      user_id: user.id,
      email,
      plaintext_password: person.password,
    },
    { onConflict: "user_id" }
  );
  if (credentialError) throw credentialError;

  credentials.push({
    team: person.team,
    fullName: person.fullName,
    email,
    password: person.password,
  });
}

console.log(
  `Surge seed complete: ${createdCount} created, ${updatedCount} updated/reused, ${people.length} assigned to ${company.name} / ${cohort.name}.`
);
console.log("");
console.log("Team\tEmployee Name\tEmail\tPassword");
for (const row of credentials) {
  console.log(`${row.team}\t${row.fullName}\t${row.email}\t${row.password}`);
}
