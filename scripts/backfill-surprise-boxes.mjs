// Turns Surprise Boxes on for a company's existing plans (finalised before
// boxes launched, so surprise_boxes_enabled = false):
//   1. gives every plan action without one a random resource, each resource
//      once per plan before any repeats (same rule as assignRandomResources in
//      lib/surprise-boxes.ts);
//   2. unlocks a box, unopened ("Ready to open"), for every action already
//      completed (user_actions.status = 'success') that has no box yet;
//   3. sets surprise_boxes_enabled = true.
// Idempotent: re-run after deploying to pick up actions completed meanwhile.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-surprise-boxes.mjs --company Surge --dry-run
//   node --env-file=.env.local scripts/backfill-surprise-boxes.mjs --company Surge

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const companyName = args[args.indexOf("--company") + 1];
const dryRun = args.includes("--dry-run");
if (!args.includes("--company") || !companyName) throw new Error("Pass --company <name>.");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

function assignRandomResources(actionIds, resourceIds, usage) {
  const assignments = new Map();
  for (const actionId of actionIds) {
    const fewest = Math.min(...resourceIds.map((id) => usage.get(id) ?? 0));
    const candidates = resourceIds.filter((id) => (usage.get(id) ?? 0) === fewest);
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    assignments.set(actionId, picked);
    usage.set(picked, fewest + 1);
  }
  return assignments;
}

const companies = must(await admin.from("companies").select("id, name").eq("name", companyName));
if (companies.length !== 1) throw new Error(`Expected one company named "${companyName}", found ${companies.length}.`);
const resourceIds = must(await admin.from("surprise_box_resources").select("id").eq("is_active", true)).map((r) => r.id);
if (!resourceIds.length) throw new Error("No active Surprise Box resources.");

const cohorts = must(await admin.from("cohorts").select("id, name").eq("company_id", companies[0].id).order("name"));
const totals = { plans: 0, enabled: 0, assigned: 0, unlocked: 0 };
console.log(`${dryRun ? "[dry run] " : ""}${companyName}: ${cohorts.length} cohorts, ${resourceIds.length} active resources`);

for (const cohort of cohorts) {
  const plans = must(await admin.from("commitment_wallet_plans").select("id, user_id, cohort_id, surprise_boxes_enabled").eq("cohort_id", cohort.id));
  const counts = { plans: plans.length, enabled: 0, assigned: 0, unlocked: 0 };

  for (const plan of plans) {
    const rows = must(await admin.from("commitment_wallet_actions").select("action_id, actions(surprise_resource_id)").eq("plan_id", plan.id));
    const resourceByAction = new Map(rows.map((row) => [row.action_id, row.actions?.surprise_resource_id ?? null]));
    const actionIds = [...resourceByAction.keys()];
    if (!actionIds.length) continue;

    // 1. Random resources for unassigned actions.
    const usage = new Map();
    for (const id of resourceByAction.values()) if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    const unassigned = actionIds.filter((id) => !resourceByAction.get(id));
    const assignments = assignRandomResources(unassigned, resourceIds, usage);
    for (const [actionId, resourceId] of assignments) resourceByAction.set(actionId, resourceId);
    counts.assigned += assignments.size;
    if (!dryRun) {
      const byResource = new Map();
      for (const [actionId, resourceId] of assignments) byResource.set(resourceId, [...(byResource.get(resourceId) ?? []), actionId]);
      for (const [resourceId, ids] of byResource) {
        must(await admin.from("actions").update({ surprise_resource_id: resourceId }).in("id", ids).select("id"));
      }
    }

    // 2. Unopened boxes for actions already completed.
    const completed = must(
      await admin.from("user_actions").select("action_id").eq("user_id", plan.user_id).eq("status", "success").in("action_id", actionIds)
    ).map((row) => row.action_id);
    const existing = new Set(must(await admin.from("surprise_box_unlocks").select("action_id").eq("plan_id", plan.id)).map((row) => row.action_id));
    const toUnlock = [...new Set(completed)].filter((id) => !existing.has(id));
    counts.unlocked += toUnlock.length;
    if (!dryRun && toUnlock.length) {
      must(
        await admin.from("surprise_box_unlocks").insert(
          toUnlock.map((actionId) => ({
            user_id: plan.user_id,
            cohort_id: plan.cohort_id,
            plan_id: plan.id,
            action_id: actionId,
            resource_id: resourceByAction.get(actionId),
          }))
        ).select("id")
      );
    }

    // 3. Switch boxes on last, once the plan has content.
    if (!plan.surprise_boxes_enabled) {
      counts.enabled += 1;
      if (!dryRun) must(await admin.from("commitment_wallet_plans").update({ surprise_boxes_enabled: true }).eq("id", plan.id).select("id"));
    }
  }

  for (const key of Object.keys(totals)) totals[key] += counts[key];
  if (counts.plans) {
    console.log(`  ${cohort.name}: ${counts.plans} plans, ${counts.enabled} switched on, ${counts.assigned} actions assigned, ${counts.unlocked} completed boxes unlocked`);
  }
}

console.log(`${dryRun ? "[dry run] would change" : "Changed"}: ${totals.enabled}/${totals.plans} plans switched on, ${totals.assigned} actions assigned, ${totals.unlocked} boxes unlocked.`);
