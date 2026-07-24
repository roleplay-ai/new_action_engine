# Email Feature Guide

This guide explains how Nudgeable emails work for participants, company admins, and superadmins. It also explains the “magic link” behind the **Open Nudgeable** button in plain language.

## 1. The short version

Nudgeable uses:

- **Resend** to deliver email.
- **Code-defined templates** to build the subject and email body.
- **Supabase Auth** to create the signed-in session.
- **Database records** to hold schedules, preferences, delivery history, and secure login keys.
- **A daily Vercel cron job** to process scheduled campaigns and participant reminders.

There are three main kinds of email:

| Email | Who controls it? | Purpose |
|---|---|---|
| Login credentials / welcome email | Admin or superadmin | Gives a participant their email, temporary password, normal login link, and one-click access link |
| Participant action reminder | Participant chooses whether to receive it; superadmin can monitor or send it | Reminds the participant about the actions in their plan |
| Scheduled campaign | Superadmin | Sends a selected template to selected users on a configured schedule |

## 2. What the participant experiences

### Welcome and access email

When an admin or superadmin creates an account, they enter:

- The participant’s email address
- A temporary password
- The participant’s name
- The company and role

Creating the account does **not automatically send an email**. The admin or superadmin later selects the participant and sends the login-credentials email.

That email can contain:

- The participant’s login email
- Their temporary password
- A standard link to the login page
- An **Open Nudgeable** button for one-click sign-in

The normal login option remains available at `/login`, where the participant signs in with email and password.

### Action reminder emails

When a participant sets up a personal action plan, they choose:

- A daily or weekly plan
- The number of actions
- The relevant day for a weekly plan
- Whether email reminders are enabled

The current production schedule processes reminders at **11:30 AM India time (06:00 UTC)**. Daily plans are checked every day. Weekly plans are checked on the participant’s selected day.

Turning email reminders off only stops the email. It does not stop actions from being delivered inside Nudgeable.

The reminder contains the participant’s scheduled actions and a button that signs them in and takes them to `/actions`.

## 3. What a company admin can do

A company admin works only with users in their own company.

### Create participants

An admin can create a participant account with an email, password, name, and company assignment. The account is created in Supabase Auth with its email already confirmed.

Nudgeable also prepares two items for later email delivery:

1. A persistent login key for one-click access.
2. A service-role-only credential record containing the email and plaintext temporary password.

### Send login credentials

From **Admin → Control Panel → Email Management**, an admin can:

- See users in their company
- See which users have stored credentials
- Select one or more eligible users
- Send or resend the login-credentials email
- See the result of the latest send

An admin cannot send credentials to a user outside their own company.

The send is blocked when:

- No users are selected
- Resend is not configured
- A selected user is outside the admin’s company
- The user has no stored credentials
- The user has no persistent login key
- The user’s auth email cannot be found

## 4. What a superadmin can do

The superadmin email area is divided into four sections.

### Reminders

The superadmin can:

- Review upcoming participant action reminders
- See the recipient, cohort, schedule, and included actions
- See why a reminder cannot currently be sent
- Manually send selected reminders

A manual reminder send is logged, but it does not consume the participant’s next automatic reminder occurrence.

### Welcome emails

The superadmin can:

- Send or resend welcome/login-credentials emails
- See whether each user has a login key
- See whether stored credentials are available
- See when a welcome email was last sent

Superadmins are not eligible recipients of the welcome-email operation.

### Campaigns

The superadmin can create reusable schedules for selected users. Supported schedule types are:

- Daily
- Weekly
- Every N days
- A specific date and time

The campaign scheduler currently offers the **Weekly Challenges** template. Other
code-defined templates are deliberately handled by their own flows:

- **Login Credentials** is sent from the admin or superadmin welcome-email tools.
- **Calendar Invite** is triggered by individual action scheduling.
- **Action Reminder** is sent from the participant-reminder system.

Recurring schedules are processed by the daily cron. A one-time schedule is deactivated after it runs. Each run records how many emails succeeded or failed and calculates the next run time.

### Delivery history

The superadmin can review participant reminder history, including:

- Recipient
- Cohort
- Included actions
- Scheduled time
- Sent or failed status
- Error message, when present

General email sends are also written to `email_campaign_logs`.

## 5. How sending works behind the scenes

For each recipient, the shared email sender:

1. Checks that the requested template exists.
2. Loads the participant’s profile and persistent login key.
3. Finds the participant’s email in Supabase Auth.
4. Loads stored credentials when the template requires them.
5. Builds recipient-specific template data.
6. Creates the one-click login URL.
7. Renders the HTML subject and body.
8. Sends the email through Resend.
9. Writes a success or failure row to the database.

A problem with one recipient does not stop the complete batch. Each recipient gets an individual result.

## 6. How the magic link works

The link in the email looks conceptually like this:

```text
https://new-action-engine.vercel.app/api/auto-login
  ?key=<persistent-user-key>
  &next=/actions
```

It is important to understand that the value in the email is a **persistent Nudgeable login key**, not the final one-time Supabase token.

### Step-by-step flow

1. The participant clicks **Open Nudgeable**.
2. The request reaches `/api/auto-login`.
3. The server validates the persistent key against the participant’s profile.
4. The server loads the matching Supabase Auth user and email address.
5. The server asks Supabase to generate a fresh one-time magic-link token.
6. The server immediately verifies that token itself.
7. Supabase returns an authenticated session.
8. The server redirects the browser to `/auth/callback`.
9. The access and refresh tokens are placed in the URL fragment (`#...`), which is not sent in normal HTTP requests or server logs.
10. The callback stores the session in the participant’s browser.
11. The participant is redirected to the safe destination, normally `/actions`.

If any step fails, the participant is sent to the normal login page.

### Why the `next` destination is checked

The app accepts only destinations beginning with a single `/`. Values beginning with `//` are rejected. This prevents the login link from redirecting a participant to an outside website.

### Audit trail

Every auto-login attempt records:

- The matched user, when available
- IP address
- Browser/user-agent information
- Success or failure
- Time of the attempt

These records are service-role-only and are not directly readable by normal signed-in users.

### Rotating a link

The superadmin can rotate a participant’s persistent login key. After rotation, links containing the old key stop working. A newly sent email uses the new key.

## 7. Automatic scheduling and duplicate protection

Vercel calls `/api/cron/email-scheduler` every day at **06:00 UTC / 11:30 AM IST**.

The endpoint should be protected with `CRON_SECRET`. It performs three related jobs:

1. Delivers due personal actions inside the app.
2. Sends due participant reminder emails.
3. Runs due superadmin-created email campaigns.

Before a scheduled email is sent, the system tries to claim that occurrence in the database. This prevents two overlapping cron calls from sending the same email twice.

Participant reminder failures may be retried after 15 minutes, with a maximum of three attempts. Already-sent occurrences cannot be claimed again.

## 8. Data and security notes

### Sensitive temporary passwords

The system stores the participant’s temporary password in plaintext in `user_credential_delivery`. This is necessary in the current design because Supabase stores only a password hash and cannot return the original password later.

The table has Row Level Security enabled with no normal user policies, so it is intended to be accessible only through trusted server code using the service role. Rows are retained after sending so admins can resend credentials.

This is highly sensitive data. Access to the database and Supabase service-role key must be tightly controlled. A safer future design would avoid retaining plaintext passwords and use password setup/reset links instead.

### Persistent one-click links

The Supabase token created during a click is one-time, but the key embedded in the email is persistent until a superadmin rotates it. Anyone who obtains the email link may be able to create a new session as that participant.

Treat welcome and reminder emails like login credentials. Rotate the participant’s key if a link may have been exposed.

### Required environment settings

Email delivery requires:

```text
RESEND_API_KEY
RESEND_FROM_EMAIL
```

The cron should also have:

```text
CRON_SECRET
```

The Supabase URL, anonymous key, and server-side service-role configuration must also be present for authentication, recipient lookup, logging, and scheduled processing.

## 9. Main implementation map

| Area | Main implementation |
|---|---|
| Shared send and logging | `lib/email-send.ts` |
| Email HTML templates | `lib/email-templates.ts` |
| Resend client | `lib/resend.ts` |
| One-click login endpoint | `app/api/auto-login/route.ts` |
| Browser auth callback | `app/auth/callback/page.tsx` |
| Admin credential emails | `app/actions/admin-credential-email.ts` |
| Superadmin welcome sends | `app/actions/email-campaign.ts` |
| Superadmin campaign schedules | `app/actions/email-schedule.ts` |
| Daily cron | `app/api/cron/email-scheduler/route.ts` |
| Participant reminder processing | `lib/action-reminders.ts` |
| Reminder monitoring and manual sends | `app/actions/action-reminders.ts` |
| Persistent login infrastructure | migrations `013` and `014` |
| Stored credential delivery | migration `020` |
| Reminder preferences and send claims | migration `038` |

## 10. Operational checklist

Before relying on the feature in production, confirm:

- The required Supabase migrations are applied.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured.
- The Resend sender/domain is verified.
- `CRON_SECRET` is configured.
- The Vercel cron is active.
- `https://new-action-engine.vercel.app` is the intended production URL.
- A test participant can receive a welcome email.
- Both password login and one-click login work in a fresh browser.
- The one-click button reaches `/actions`.
- An old link stops working after its key is rotated.
- Reminder and campaign success/failure rows appear in the relevant logs.
