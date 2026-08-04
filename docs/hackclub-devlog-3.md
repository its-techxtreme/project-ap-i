# Devlog #3 - Captain's Deck, Shorts that look like Shorts, and a queue i babysit less

devlog 1 and 2 were the "why is everything on fire" posts. this one is what i built after the pipeline stopped dying every hour: UI, demo voyage, edit preset, Drive auth, and ops controls that matter when the factory is still my laptop.

### the dashboard stopped looking like a spreadsheet

i tore out the generic admin chrome and rebuilt it as **Captain's Deck** - One Piece-inspired voyage language without ripping logos or characters. Crow's nest, Ship's log, Lost cargo, Crew, Sea lanes. day watch = turquoise sea + parchment; night watch = deep navy + lantern gold. Pirata One for display. sky washes, wave shimmer, ship-sail motion when something lands. still dense ops tables underneath, but it finally feels like a product.

### demo mode + the crew briefing

public submit was already open. missing piece: a safe admin poke. **read-only demo watch** - demo login boards you with write actions locked. Stretch, Navi, Cookie and the doodle crew run an interactive voyage tutorial (spotlight + mascots) when you land. replay tour is one click. filter Ship's log, open Cargo bay - you just can't smash retry/delete on live jobs. public demo without yeeting production. :)

### shorts were uploading as normal youtube videos

caught live in studio: short clip, landscape preview, regular upload not a Short. ffmpeg did speed + bgm but never forced 9:16. source stayed landscape, so youtube stayed "normal video." shared edit now always outputs **1080x1920**, asserts dimensions after encode, fails loud if not. IG gets the clean export. YT can still get niche brand c-text (ShonenSnaps / CrackleCrumb / ScoreMorsel) when there's no burned-in hard captions. preset: 1.2x speed, stronger filter, original audio, quiet bgm (~5%), no logo watermark on IG. :D

### drive auth + knowing if the laptop is awake

`invalid_grant` wiped jobs because the oauth refresh token was minted while the google app was still in Testing. publishing consent to Production does not resurrect old tokens - mint a new one after. worker health probes Drive; claim skips when Drive is dead. vercel can't ping my private worker, so the topbar has a **remote laptop signal** (supabase heartbeat): offline vs connected and ready. if that light is dead, the queue is sleeping.

### ops controls when soft limits park everything

rolling 24h soft daily upload cap still parks niches at the limit. sometimes i need one job through. Ship's log swaps Retries for a **Force** button on those rows: one-shot soft-limit bypass for that job only (platform hard caps still apply). also pause / unpause / abort so one hung Playwright session doesn't hold the door. deferred jobs recheck sooner so the queue doesn't look cursed when a slot frees early. =_+

### where it stands

submit public. demo voyage read-only. real uploads still need my pc awake with chrome profiles + docker n8n. last stretch wasn't another playwright ghost story - shape, Drive health, Captain's Deck polish, and operator controls so the queue cooks without me hovering. still local. still weird. closer to "drop the link and walk away" than where #2 left me. ;)

live: https://ap-i.techxtreme.me 
github: https://github.com/its-techxtreme/project-ap-i
