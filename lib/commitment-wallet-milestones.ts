/**
 * Shared team-reward milestone ladder for the Commitment Wallet. Used by the
 * wallet page and the weekly/daily action-reminder email so both surfaces
 * agree on the same thresholds and copy.
 */
export const MILESTONES = [
  { percent: 25, headline: "A tree gets planted", feeling: "A small start, and nature already feels it.", icon: "🌱" },
  { percent: 50, headline: "5 trees get planted", feeling: "Your team's care is taking root.", icon: "🌱" },
  { percent: 75, headline: "10 trees get planted", feeling: "Together, you're helping a forest begin.", icon: "🌱" },
  { percent: 100, headline: "20 trees get planted", feeling: "Your team's impact will last for years.", icon: "🌱" }
] as const;

export function milestonePoints(maximum: number, percent: number): number {
  if (maximum <= 0) return 0;
  return Math.min(maximum, Math.ceil((maximum * percent) / 100 / 50) * 50);
}

/** The next unreached milestone for a given team point total, or undefined once every milestone is unlocked. */
export function nextMilestoneFor(teamPoints: number, teamMaximumPoints: number) {
  return MILESTONES.find((milestone) => teamPoints < milestonePoints(teamMaximumPoints, milestone.percent));
}
