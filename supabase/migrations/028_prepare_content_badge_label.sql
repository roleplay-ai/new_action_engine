-- Short optional eyebrow label for a Prepare content card (e.g. "CEO WELCOME",
-- "YOUR FACILITATOR") shown as a small pill distinct from the card's title —
-- lets superadmin author more editorial-looking cards without overloading title.
ALTER TABLE public.prepare_content_items
  ADD COLUMN IF NOT EXISTS badge_label TEXT;
