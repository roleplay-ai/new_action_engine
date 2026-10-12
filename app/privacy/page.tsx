import type { Metadata } from "next";

/**
 * Public privacy policy — linked from the Meta app (App settings → Basic →
 * Privacy policy URL / Data deletion instructions URL, the latter pointing at
 * #data-deletion). Whitelisted in lib/supabase/middleware.ts so it renders
 * without a login. Keep the processor list in sync when adding integrations.
 */

export const metadata: Metadata = {
  title: "Privacy Policy · Nudgeable",
  description: "How Nudgeable collects, uses and protects your information.",
};

const LAST_UPDATED = "12 October 2026";
const CONTACT_EMAIL = "team@nudgeable.ai";

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  const mail = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-gray-900 underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <article className="space-y-8 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-sm sm:p-10">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Nudgeable</p>
          <h1 className="text-3xl font-extrabold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
        </header>

        <p className="text-[15px] leading-relaxed text-gray-700">
          Nudgeable (&ldquo;we&rdquo;, &ldquo;us&rdquo;) runs the Nudgeable Action Engine, a platform that helps
          participants in workplace learning programmes turn what they learn into small, regular actions. This policy
          explains what information we collect, how we use it, who we share it with, and the choices you have. It
          applies to the Nudgeable web app, our emails, and our WhatsApp messages.
        </p>

        <Section title="Information we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Account details</strong> – your name, work email address, the organisation and programme
              (cohort) you belong to, and your role. These are usually provided by your organisation or programme
              administrator when you are invited.
            </li>
            <li>
              <strong>Programme activity</strong> – your answers to training and preparation questions, the actions
              in your plan, the actions you complete or skip, notes, points, commitment scores, team and buddy
              information, and messages you post in cohort chat.
            </li>
            <li>
              <strong>WhatsApp information</strong> – if you choose to receive reminders on WhatsApp: your WhatsApp
              phone number, your WhatsApp profile name, the messages you send to our business number, and delivery
              status for messages we send you (sent, delivered, read or failed).
            </li>
            <li>
              <strong>Email engagement</strong> – whether our emails were opened and which links were clicked.
            </li>
            <li>
              <strong>Technical information</strong> – login and session data, and basic device and log information
              needed to run and secure the service.
            </li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc space-y-2 pl-5">
            <li>To provide the platform: create your account, build your personalised action plan, and track your progress.</li>
            <li>
              To send reminders and programme updates by email and, if you have opted in, by WhatsApp – for example a
              reminder on your chosen day listing the actions you have planned.
            </li>
            <li>To respond to messages you send us, including support requests and replies on WhatsApp.</li>
            <li>To show you and your programme administrators progress and engagement reports for your programme.</li>
            <li>To keep the service secure, fix problems, and improve how it works.</li>
          </ul>
          <p>We do not sell your personal information and we do not use it for advertising.</p>
        </Section>

        <Section title="WhatsApp messages">
          <p>
            We only send you WhatsApp messages if you have given us your WhatsApp number and agreed to receive
            them. Messages are about your programme – such as action reminders – and are sent through the WhatsApp
            Business Platform provided by Meta. You can stop them at any time by replying <strong>STOP</strong>,
            turning WhatsApp reminders off in the app, or emailing {mail}.
          </p>
          <p>
            Meta processes WhatsApp messages under its own terms and privacy policy. Messages between you and our
            business number are handled by Meta&apos;s WhatsApp Cloud API on our behalf.
          </p>
        </Section>

        <Section title="Who we share information with">
          <p>We share information only as needed to run the service:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Your organisation and programme team</strong> – administrators, trainers and facilitators of
              your programme can see your progress and activity in that programme.
            </li>
            <li>
              <strong>Service providers</strong> that process data for us: Supabase (database and authentication),
              Vercel (hosting), Resend (email delivery), Google (Gemini AI, used to generate personalised actions
              from your answers), and Meta (WhatsApp messaging).
            </li>
            <li>
              <strong>Legal reasons</strong> – where required by law, or to protect the rights, safety and security
              of our users and the service.
            </li>
          </ul>
        </Section>

        <Section title="How long we keep information">
          <p>
            We keep your information for as long as your account is active or as needed to run your programme and
            provide reporting to your organisation. When it is no longer needed, or when you ask us to delete it, we
            delete it or make it anonymous, unless we have to keep it to meet a legal obligation.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Data is sent over encrypted connections (HTTPS) and stored with access controls so that only authorised
            people and systems can reach it. No system is perfectly secure, but we work to protect your information
            and will act promptly if something goes wrong.
          </p>
        </Section>

        <Section title="Your choices and rights">
          <ul className="list-disc space-y-2 pl-5">
            <li>See, correct or download the personal information we hold about you.</li>
            <li>Ask us to delete your information (see below).</li>
            <li>Turn email or WhatsApp reminders off in the app, or reply STOP on WhatsApp.</li>
            <li>Withdraw consent you have given us at any time.</li>
          </ul>
          <p>To make any of these requests, email {mail}.</p>
        </Section>

        <Section id="data-deletion" title="How to delete your data">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Email {mail} from the email address linked to your Nudgeable account, with the subject
              &ldquo;Delete my data&rdquo;. If you only use WhatsApp with us, include your WhatsApp number.
            </li>
            <li>We will confirm your identity, then delete your account and the personal information linked to it, including WhatsApp numbers and message history.</li>
            <li>We will email you to confirm once the deletion is done.</li>
          </ol>
          <p>
            To stop WhatsApp messages without deleting your account, reply <strong>STOP</strong> to our WhatsApp
            number.
          </p>
        </Section>

        <Section title="Children">
          <p>The service is meant for working professionals and is not directed at children.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. We will change the &ldquo;Last updated&rdquo; date above and,
            for significant changes, let you know through the app or by email.
          </p>
        </Section>

        <Section title="Contact us">
          <p>Questions about this policy or your information? Email {mail}.</p>
        </Section>
      </article>
    </main>
  );
}
