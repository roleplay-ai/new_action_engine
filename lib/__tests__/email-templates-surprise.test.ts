import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../email-templates";

const actions = [
  { id: "a1", title: "Ask one open question in your stand-up", complete_url: "https://example.com/done/a1" },
  { id: "a2", title: "Share specific praise with a teammate", complete_url: "https://example.com/done/a2" },
];

const teaser = "Mark done to open a <strong>Surprise Box</strong>";

describe("reminder emails: Surprise Box teaser", () => {
  it.each(["daily_reminder", "weekly_recap"] as const)("%s shows it once, above the cards, when the plan has boxes", (template) => {
    const { html } = renderEmailTemplate(template, { first_name: "Priya", actions, surprise_boxes_enabled: true });
    expect(html.split(teaser)).toHaveLength(2);
    expect(html.indexOf(teaser)).toBeLessThan(html.indexOf(actions[0].title));
  });

  it.each(["daily_reminder", "weekly_recap"] as const)("%s leaves it out for plans without boxes", (template) => {
    expect(renderEmailTemplate(template, { first_name: "Priya", actions, surprise_boxes_enabled: false }).html).not.toContain(teaser);
    expect(renderEmailTemplate(template, { first_name: "Priya", actions }).html).not.toContain(teaser);
  });
});

describe("reminder emails: pending validation banner", () => {
  it.each(["daily_reminder", "weekly_recap"] as const)("%s counts Pending validation actions, not the listed ones", (template) => {
    const { html } = renderEmailTemplate(template, { first_name: "Priya", actions, pending_validation_count: 1 });
    expect(html).toContain("1 action is waiting for your update.");
    expect(html).not.toContain(`${actions.length} actions are waiting`);
    expect(renderEmailTemplate(template, { first_name: "Priya", actions, pending_validation_count: 3 }).html).toContain(
      "3 actions are waiting for your update."
    );
  });

  it.each(["daily_reminder", "weekly_recap"] as const)("%s leaves the banner out when nothing is pending", (template) => {
    expect(renderEmailTemplate(template, { first_name: "Priya", actions, pending_validation_count: 0 }).html).not.toContain("waiting for your update");
    expect(renderEmailTemplate(template, { first_name: "Priya", actions }).html).not.toContain("waiting for your update");
  });
});
