-- Point anime crew handles at the real public accounts (overlay brand stays ShonenSnaps).
update public.platform_accounts pa
set
  username_hint = 'theshonensnaps',
  updated_at = now()
from public.niches n
where pa.niche_id = n.id
  and n.slug = 'anime'
  and pa.platform in ('youtube', 'instagram');
