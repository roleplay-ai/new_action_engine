"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyCohorts } from "@/app/actions/cohorts";

export type CommitmentWalletSummary = {
  hasFinalisedPlan: boolean;
  plannedActions: number;
  missedActions: number;
  completedOnTimeActions: number;
  personalPlanPoints: number;
  personalActionPoints: number;
  personalPoints: number;
  personalMaximumPoints: number;
  commitmentScore: number;
  teamPlanPoints: number;
  teamActionPoints: number;
  teamPoints: number;
  teamMaximumPoints: number;
  teamMemberCount: number;
  contributionRank: number;
};

const EMPTY_SUMMARY: CommitmentWalletSummary = {
  hasFinalisedPlan: false,
  plannedActions: 0,
  missedActions: 0,
  completedOnTimeActions: 0,
  personalPlanPoints: 0,
  personalActionPoints: 0,
  personalPoints: 0,
  personalMaximumPoints: 0,
  commitmentScore: 0,
  teamPlanPoints: 0,
  teamActionPoints: 0,
  teamPoints: 0,
  teamMaximumPoints: 0,
  teamMemberCount: 0,
  contributionRank: 0,
};

function numberFrom(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapSummary(value: unknown): CommitmentWalletSummary {
  if (!value || typeof value !== "object") return EMPTY_SUMMARY;
  const row = value as Record<string, unknown>;
  return {
    hasFinalisedPlan: row.hasFinalisedPlan === true,
    plannedActions: numberFrom(row.plannedActions),
    missedActions: numberFrom(row.missedActions),
    completedOnTimeActions: numberFrom(row.completedOnTimeActions),
    personalPlanPoints: numberFrom(row.personalPlanPoints),
    personalActionPoints: numberFrom(row.personalActionPoints),
    personalPoints: numberFrom(row.personalPoints),
    personalMaximumPoints: numberFrom(row.personalMaximumPoints),
    commitmentScore: numberFrom(row.commitmentScore),
    teamPlanPoints: numberFrom(row.teamPlanPoints),
    teamActionPoints: numberFrom(row.teamActionPoints),
    teamPoints: numberFrom(row.teamPoints),
    teamMaximumPoints: numberFrom(row.teamMaximumPoints),
    teamMemberCount: numberFrom(row.teamMemberCount),
    contributionRank: numberFrom(row.contributionRank),
  };
}

export async function getMyCommitmentWallet(knownCohortId?: string): Promise<{
  summary: CommitmentWalletSummary;
  cohortName: string | null;
  error?: string;
}> {
  try {
    // A caller that already resolved its own selected cohort this render (e.g. from
    // useEngine()) can pass it straight through, skipping the ~6-7 query
    // getMyCohorts() resolution. The RPC below still runs under the user's own
    // session, so Postgres continues to enforce real access to p_cohort_id.
    let selectedId = knownCohortId;
    let cohortName: string | null = null;
    if (!selectedId) {
      const context = await getMyCohorts();
      if (context.error) {
        return { summary: EMPTY_SUMMARY, cohortName: null, error: context.error };
      }
      const selected = context.cohorts.find((cohort) => cohort.isSelected);
      if (!selected) {
        return { summary: EMPTY_SUMMARY, cohortName: null };
      }
      selectedId = selected.id;
      cohortName = selected.name;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_my_commitment_wallet", {
      p_cohort_id: selectedId,
    });
    if (error) {
      return {
        summary: EMPTY_SUMMARY,
        cohortName,
        error: error.message,
      };
    }

    return {
      summary: mapSummary(data),
      cohortName,
    };
  } catch (error) {
    return {
      summary: EMPTY_SUMMARY,
      cohortName: null,
      error: error instanceof Error ? error.message : "Failed to load the Commitment Wallet",
    };
  }
}
