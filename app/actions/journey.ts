"use server";

import { getMyCohort } from "@/app/actions/cohorts";
import { listCohortContent } from "@/app/actions/prepare-content";
import { getMyPrepareProgress } from "@/app/actions/prepare-progress";
import { getMyTrainerMessages } from "@/app/actions/trainer-expectations";
import type { JourneyData } from "@/lib/types";

/** One request boundary for everything the Journey screen needs initially. */
export async function getJourneyData(): Promise<JourneyData> {
  const cohortResult = await getMyCohort();
  if (cohortResult.error) {
    return { error: cohortResult.error, cohort: null, roster: [], items: [], progress: [], trainerMessages: [] };
  }
  if (!cohortResult.cohort) {
    return { cohort: null, roster: [], items: [], progress: [], trainerMessages: [] };
  }

  const [contentResult, progressResult, trainerMessagesResult] = await Promise.all([
    listCohortContent(cohortResult.cohort.id),
    getMyPrepareProgress(cohortResult.cohort.id),
    getMyTrainerMessages(cohortResult.cohort.id),
  ]);

  if (contentResult.error) {
    return {
      error: contentResult.error,
      cohort: cohortResult.cohort,
      roster: cohortResult.roster ?? [],
      items: [],
      progress: [],
      trainerMessages: [],
    };
  }

  return {
    cohort: cohortResult.cohort,
    roster: cohortResult.roster ?? [],
    items: contentResult.items ?? [],
    // Trainers are not participant rows and therefore have no personal prep
    // progress; the Journey still loads normally with an empty progress list.
    progress: progressResult.progress ?? [],
    trainerMessages: trainerMessagesResult.messages ?? [],
  };
}
