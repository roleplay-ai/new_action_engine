function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsUtcDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Build an email-friendly calendar invite (METHOD:REQUEST) for Google Calendar / Outlook.
 * Uses UTC (Z) for maximum compatibility.
 */
export function buildMeetingInviteIcs(params: {
  uid: string;
  organizerEmail: string;
  attendeeEmail: string;
  summary: string;
  description: string;
  startUtcIso: string;
  endUtcIso: string;
}): string {
  const start = new Date(params.startUtcIso);
  const end = new Date(params.endUtcIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid start/end for ICS invite");
  }

  const dtstamp = toIcsUtcDateTime(new Date());
  const dtstart = toIcsUtcDateTime(start);
  const dtend = toIcsUtcDateTime(end);

  const summary = escapeIcsText(params.summary);
  const description = escapeIcsText(params.description);
  const organizer = params.organizerEmail.trim().toLowerCase();
  const attendee = params.attendeeEmail.trim().toLowerCase();

  // NOTE: Keep it minimal; most clients accept unfolded lines in practice.
  // If you hit edge cases, we can add proper RFC 5545 line folding.
  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Nudgeable//Action Invite//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `ORGANIZER:mailto:${organizer}`,
    `ATTENDEE;RSVP=TRUE:mailto:${attendee}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

