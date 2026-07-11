# Project AP-I Design System

## Brand
- Product: Project AP-I — short-form content intake & publishing for agencies
- Surfaces: Public submit (anonymous) + Admin ops dashboard

## Typography
- Display / brand: Syne
- Body / UI: Public Sans
- Never use Inter, Roboto, Arial, or system-ui as primary

## Theme defaults
- Public (`/`) → light by default
- Admin (`/login`, `/admin/*`) → dark by default
- Both surfaces expose a theme toggle; preferences stored separately:
  - `api-theme-public`
  - `api-theme-admin`

## Color tokens

### Light
| Role | Hex |
|---|---|
| Background | `#F4F6F8` |
| Surface | `#FFFFFF` |
| Ink | `#0B1220` |
| Muted | `#5B6577` |
| Accent / CTA | `#0F766E` |
| Accent soft | `#CCFBF1` |
| Border | `#D8DEE8` |

### Dark
| Role | Hex |
|---|---|
| Background | `#030508` |
| Surface | `#0A0E14` |
| Ink | `#E8EEF7` |
| Muted | `#8B97AB` |
| Accent / CTA | `#2DD4BF` |
| Accent soft | `#134E4A` |
| Border | `#1A222E` |

Admin Jobs filters omit date range (no Created from / Created to). Compact toolbar + status chips only.

Light and dark are full dual themes (not inverted text on dark chrome). Chrome, panels, row hover, notices, glass login, and status badges all use theme tokens / `dark:` pairs.

## Layout rules
- Public: one composition — brand hero + single form card. No dashboard chrome.
- Admin: dense tables, clear status badges, env badge, sidebar nav. Full light + dark themes.
- Login: theme-aware glass panel (frosted light card / dark glass).
- Radius: 0.75rem. Avoid pill clusters and multi-layer shadows.
- Icons: Lucide only. No emoji as UI icons.
- Motion: form enter, CTA pending, success swap; respect `prefers-reduced-motion`.

## Anti-patterns
- Purple/indigo gradients, gold luxury accents, cream+terracotta, broadsheet layouts
- Flat single-color backgrounds without atmosphere
- Cards in the hero that are not the interaction surface
