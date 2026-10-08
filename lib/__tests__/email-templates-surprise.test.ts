import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../email-templates";

const actions = [
  { id: "a1", title: "Ask one open question in your stand-up", complete_url: "https://example.com/done/a1" },
  { id: "a2", title: "Share specific praise with a teammate", complete_url: "https://example.com/done/a2" },
];

const teaser = "Surprise Box</strong> in your Commitment Wallet";

describe("reminder emails: Surprise Box teaser", () => {
  it.each(["daily_reminder", "weekly_recap"] as const)("%s shows it on every card when the plan has boxes", (template) => {
    const { html } = renderEmailTemplate(template, { first_name: "Priya", actions, surprise_boxes_enabled: true });
    expect(html.split(teaser)).toHaveLength(actions.length + 1);
  });

  it.each(["daily_reminder", "weekly_recap"] as const)("%s leaves it out for plans without boxes", (template) => {
    expect(renderEmailTemplate(template, { first_name: "Priya", actions, surprise_boxes_enabled: false }).html).not.toContain(teaser);
    expect(renderEmailTemplate(template, { first_name: "Priya", actions }).html).not.toContain(teaser);
  });
});
