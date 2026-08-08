export type MyPlanAnswers = {
  name: string;
  designation: string;
  team: string;
  dailyWork: string;
  skillGoal: string;
  practiceOpportunities: string;
};

export const EMPTY_MY_PLAN_ANSWERS: MyPlanAnswers = {
  name: "",
  designation: "",
  team: "",
  dailyWork: "",
  skillGoal: "",
  practiceOpportunities: "",
};

const ANSWER_KEYS: (keyof MyPlanAnswers)[] = [
  "name",
  "designation",
  "team",
  "dailyWork",
  "skillGoal",
  "practiceOpportunities",
];

export function normaliseMyPlanAnswers(value: Partial<MyPlanAnswers> | null | undefined): MyPlanAnswers {
  const answers = { ...EMPTY_MY_PLAN_ANSWERS };
  for (const key of ANSWER_KEYS) {
    const answer = value?.[key];
    answers[key] = typeof answer === "string" ? answer : "";
  }
  return answers;
}

export function hasMyPlanAnswers(answers: MyPlanAnswers): boolean {
  return ANSWER_KEYS.some((key) => answers[key].trim().length > 0);
}

/**
 * USER_NOTES contains only participant-entered answers under neutral field
 * keys. UI questions, helper hints, placeholders, and instructional copy are
 * deliberately excluded.
 */
export function buildUserNotesPayload(answers: MyPlanAnswers): string {
  if (!hasMyPlanAnswers(answers)) return "";
  const trimmed = Object.fromEntries(
    ANSWER_KEYS.map((key) => [key, answers[key].trim()])
  ) as Record<keyof MyPlanAnswers, string>;
  return JSON.stringify(trimmed);
}

export function parseStoredMyPlanAnswers(
  body: string | null | undefined,
  structured?: Partial<MyPlanAnswers> | null,
): MyPlanAnswers {
  const fromColumns = normaliseMyPlanAnswers(structured);
  if (hasMyPlanAnswers(fromColumns)) return fromColumns;

  const stored = body?.trim();
  if (!stored) return fromColumns;
  try {
    const parsed = JSON.parse(stored) as Partial<MyPlanAnswers>;
    if (parsed && typeof parsed === "object") {
      const fromJson = normaliseMyPlanAnswers(parsed);
      if (hasMyPlanAnswers(fromJson)) return fromJson;
    }
  } catch {
    // Legacy free-form notes are preserved in the closest matching field.
  }
  return { ...fromColumns, skillGoal: body ?? "" };
}
