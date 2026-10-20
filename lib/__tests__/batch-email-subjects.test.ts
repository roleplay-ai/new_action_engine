import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../email-templates";
import { commitmentScoreDrop, parseBatchEmailSubjects, sanitizeBatchEmailSubjects } from "../batch-email-subjects";

const actions = [{ id: "a1", title: "One" }, { id: "a2", title: "Two" }];

describe("batch email subjects", () => {
  it("keeps the default subjects when no batch subject is set", () => {
    expect(renderEmailTemplate("daily_reminder", { first_name: "Priya", company_name: "Acme", actions }).subject).toBe(
      "Hi Priya 👋, Your actions are ready — Acme"
    );
    expect(renderEmailTemplate("weekly_recap", { first_name: "Priya", actions }).subject).toBe(
      "Hi Priya 👋 — 2 actions are still waiting for your confirmation"
    );
  });

  it("uses the batch subject with placeholders filled", () => {
    const subject = renderEmailTemplate("daily_reminder", {
      first_name: "Priya",
      company_name: "Acme",
      batch_name: "Leaders 1",
      actions,
      batch_subject: "{{first_name}}, {{action_count}} actions for {{batch_name}} at {{company_name}}",
    }).subject;
    expect(subject).toBe("Priya, 2 actions for Leaders 1 at Acme");
  });

  it("applies the recap override only when actions are pending", () => {
    const data = { first_name: "Priya", batch_subject: "Custom recap for {{first_name}}" };
    expect(renderEmailTemplate("weekly_recap", { ...data, actions }).subject).toBe("Custom recap for Priya");
    expect(renderEmailTemplate("weekly_recap", { ...data, actions: [] }).subject).toBe(
      "Hi Priya 👋 — You're all caught up this week"
    );
  });

  it("tidies missing placeholder values", () => {
    expect(
      renderEmailTemplate("daily_reminder", { first_name: "Priya", actions, batch_subject: "Your actions are ready — {{company_name}}" }).subject
    ).toBe("Your actions are ready");
  });

  it("sanitizes input: drops blanks, rejects unknown keys and placeholders", () => {
    expect(sanitizeBatchEmailSubjects({ daily_reminder: "  Hi   {{first_name}} ", weekly_recap: "  " })).toEqual({
      subjects: { daily_reminder: "Hi {{first_name}}" },
    });
    expect(sanitizeBatchEmailSubjects({ credentials: "Hi" }).error).toMatch(/Unknown email/);
    expect(sanitizeBatchEmailSubjects({ daily_reminder: "Hi {{nickname}}" }).error).toMatch(/\{\{nickname\}\}/);
    expect(sanitizeBatchEmailSubjects({ daily_reminder: "x".repeat(201) }).error).toMatch(/200 characters/);
  });

  it("parses stored JSON defensively", () => {
    expect(parseBatchEmailSubjects(null)).toEqual({});
    expect(parseBatchEmailSubjects({ daily_reminder: "Hi", weekly_recap: "", other: "x" })).toEqual({ daily_reminder: "Hi" });
  });

  it("computes whole-point commitment drops only when the score fell", () => {
    expect(commitmentScoreDrop(80, 68)).toBe(12);
    expect(commitmentScoreDrop(80, 80)).toBeNull();
    expect(commitmentScoreDrop(60, 75)).toBeNull();
    expect(commitmentScoreDrop(null, 68)).toBeNull();
    expect(commitmentScoreDrop(80, undefined)).toBeNull();
  });

  it("fills commitment drop placeholders", () => {
    const subject = renderEmailTemplate("daily_reminder", {
      first_name: "Priya",
      actions,
      commitment_drop: 12,
      buddy_commitment_drop: 5,
      batch_subject: "{{first_name}}, your score dropped by {{commitment_drop}} and your buddy's by {{buddy_commitment_drop}}",
    }).subject;
    expect(subject).toBe("Priya, your score dropped by 12 and your buddy's by 5");
  });

  it("falls back to the default subject when a used drop is missing", () => {
    const base = { first_name: "Priya", company_name: "Acme", actions };
    const fallback = "Hi Priya 👋, Your actions are ready — Acme";
    expect(renderEmailTemplate("daily_reminder", { ...base, commitment_drop: null, batch_subject: "Dropped by {{commitment_drop}}" }).subject).toBe(fallback);
    expect(
      renderEmailTemplate("daily_reminder", { ...base, commitment_drop: 12, buddy_commitment_drop: null, batch_subject: "{{commitment_drop}} / {{buddy_commitment_drop}}" }).subject
    ).toBe(fallback);
    expect(renderEmailTemplate("weekly_recap", { ...base, batch_subject: "Buddy dropped {{buddy_commitment_drop}}" }).subject).toBe(
      "Hi Priya 👋 — 2 actions are still waiting for your confirmation"
    );
  });
});
