-- Storage bucket for superadmin-uploaded Prepare videos. Public so uploaded
-- videos can be played back via a plain public URL (no signed-URL refresh
-- needed for playback); only superadmin can ever write to it, enforced by
-- always uploading through the service-role client in a superadmin-gated
-- server action (see app/actions/prepare-content.ts), not via storage RLS.
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-videos', 'content-videos', true)
ON CONFLICT (id) DO NOTHING;
