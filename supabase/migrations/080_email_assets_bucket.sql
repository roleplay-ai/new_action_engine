-- Email assets: static images referenced by outgoing email templates
-- (lib/email-templates.ts), e.g. the waving Nudgie GIF in the welcome email.
-- Public bucket for durable display URLs; writes only via the service role,
-- same convention as action-images/trainer-images/cohort-logos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
