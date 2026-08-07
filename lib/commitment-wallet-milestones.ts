/**
 * Shared team-reward milestone ladder for the Commitment Wallet. Used by the
 * wallet page and the weekly/daily action-reminder email so both surfaces
 * agree on the same thresholds and copy.
 */
export const MILESTONES = [
  { percent: 5, headline: "A tree gets planted", feeling: "Your team helped nature grow.", icon: "🌱" },
  { percent: 10, headline: "A child gets a meal", feeling: "Your team helped feed a hungry child.", icon: "🍲" },
  { percent: 25, headline: "An elder gets a meal", feeling: "Your team helped care for an elder.", icon: "🍱" },
  { percent: 50, headline: "Someone gets crutches", feeling: "Your team helped a person walk again.", icon: "🩼" },
  { percent: 75, headline: "A child goes to school", feeling: "Your team is helping a child study for 6 months.", icon: "🏫" },
] as const;

export function milestonePoints(maximum: number, percent: number): number {
  if (maximum <= 0) return 0;
  return Math.min(maximum, Math.ceil((maximum * percent) / 100 / 50) * 50);
}

/** The next unreached milestone for a given team point total, or undefined once every milestone is unlocked. */
export function nextMilestoneFor(teamPoints: number, teamMaximumPoints: number) {
  return MILESTONES.find((milestone) => teamPoints < milestonePoints(teamMaximumPoints, milestone.percent));
}
