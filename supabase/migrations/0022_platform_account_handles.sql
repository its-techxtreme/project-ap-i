-- Seed public profile handles for Sea lanes live profile cards.
-- Handles match niche brand c-text (YouTube overlay labels).

update public.platform_accounts pa
set
  username_hint = v.handle,
  updated_at = now()
from public.niches n
join (
  values
    ('anime', 'youtube', 'ShonenSnaps'),
    ('anime', 'instagram', 'ShonenSnaps'),
    ('memes', 'youtube', 'CrackleCrumb'),
    ('memes', 'instagram', 'thecracklecrumb'),
    ('sports', 'youtube', 'ScoreMorsel'),
    ('sports', 'instagram', 'ScoreMorsel')
) as v(slug, platform, handle)
  on n.slug = v.slug
where pa.niche_id = n.id
  and pa.platform = v.platform
  and (
    pa.username_hint is null
    or btrim(pa.username_hint) = ''
    or (n.slug = 'memes' and pa.platform = 'instagram' and pa.username_hint = 'CrackleCrumb')
  );
