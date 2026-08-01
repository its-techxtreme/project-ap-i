# Project AP-I Design System — Broadcast Desk

## Brand
- Product: Project AP-I — short-form content intake & publishing for agencies
- Visual identity: **Broadcast Desk** — short-form publishing control room (not generic AI SaaS)
- Surfaces: Public submit (anonymous) + Admin ops dashboard

## Typography
- Display / brand: Syne
- Body / UI: Public Sans
- Tabular nums for job IDs and timestamps
- Never use Inter, Roboto, Arial, or system-ui as primary

## Theme defaults
- Public (`/`) → light by default
- Admin (`/login`, `/admin/*`) → dark by default
- Both surfaces expose a theme toggle; preferences stored separately:
  - `api-theme-public`
  - `api-theme-admin`

## Color tokens

### Light (public)
| Role | Hex |
|---|---|
| Background / paper | `#E8ECF1` |
| Surface | `#F4F6F9` |
| Ink | `#0A0F14` |
| Muted | `#5A6573` |
| Signal / CTA | `#1FA971` |
| Amber caution | `#C9851A` |
| Danger | `#C94A3A` |
| Border / hairline | `#C5CDD8` |

### Dark (admin)
| Role | Hex |
|---|---|
| Void | `#05070A` |
| Panel | `#0C1118` |
| Ink | `#E7EEF6` |
| Muted | `#8B97AB` |
| Signal | `#3DDC97` |
| Amber | `#E0A33A` |
| Danger | `#F07167` |
| Hairline | `#1C2530` |

## Atmosphere
- Subtle radial signal bloom + light scanline/grid (CSS only)
- Status chips as phosphor badges (signal / amber / danger)
- No purple/indigo gradients, cream+terracotta, or broadsheet layouts

## Layout rules
- Public: one composition — brand hero + single form card. No dashboard chrome.
- Admin: dense tables, clear status badges, env badge, sidebar nav. Full light + dark themes.
- Login: theme-aware glass panel on Broadcast Desk stage.
- Radius: 0.65rem (slightly sharper ops feel). Avoid pill clusters and multi-layer shadows.
- Icons: Lucide only. No emoji as UI icons.
- Motion: form enter, CTA pending, live status pulse; respect `prefers-reduced-motion`.

## Anti-patterns
- Purple/indigo gradients, gold luxury accents, cream+terracotta, broadsheet layouts
- Flat single-color backgrounds without atmosphere
- Cards in the hero that are not the interaction surface
