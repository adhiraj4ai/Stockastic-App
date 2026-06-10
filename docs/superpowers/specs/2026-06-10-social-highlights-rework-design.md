# Social Highlights Rework — Design

**Date:** 2026-06-10
**Status:** Approved
**Scope:** `/social` page and its card components. Frontend only — all data comes from existing endpoints.

## Problem

The current Social Highlights page generates shareable market-snapshot images, but: only 5 templates all fed by one endpoint; a single 4:5 dark card; export is save-to-file only; the card carries a fake `Math.random()` "SNAPSHOT ID" and decorative non-functional Twitter/Share icons; the 290-line `SocialPostCard` mixes frame, five template bodies, text formatting, and export logic in one component.

## Decision

Template-registry architecture. A reusable card frame + one small content component per template + a registry driving the page. Nine templates, three aspect ratios, dark/light themes, and a four-action export toolbar.

## Architecture

```
frontend/src/lib/socialCardText.ts          — pure per-template text formatters (unit-tested)
frontend/src/components/social/
    SocialCardFrame.tsx                     — branding header/footer, theme + ratio aware, holds the capture ref
    templates/                              — one content component per template (DailyWrap.tsx, Gainers.tsx, …)
    registry.ts                             — TEMPLATES: [{id, name, icon, desc, dataKeys, Component, formatText}]
    ExportToolbar.tsx                       — Save image · Copy image · Copy text · Post on X · LinkedIn
    useSocialCardData.ts                    — summary on mount; signals/accumulation lazily per template
frontend/src/app/(authenticated)/social/page.tsx — registry-driven template list + preview pane
```

`SocialPostCard.tsx` is deleted once the new structure replaces it.

## Templates (9)

Existing, redesigned: **Daily Wrap**, **Top Gainers**, **Top Losers**, **Turnover Magnets**, **Sector Heatmap** — data from `/api/stocks/summary/`.

New:
- **Today's Signals** — top 5 conviction-sorted BUY/SELL items via `buildActionItems` from `@/lib/homeDigest`, fed by `/api/stocks/generated-signals/latest/` + the three recommendation endpoints (same fetch pattern as the homepage `TodaysSignals` zone).
- **Smart Money** — top 5 net accumulation (`/api/stocks/companies/accumulation/?range=1W`, filtered to `net_qty > 0`) + top 3 aggressive accumulators (`/api/stocks/companies/aggressive/?range=1W` → `accumulators`).
- **52-Week Watch** — `near_52_high` / `near_52_low` arrays already returned by `/api/stocks/summary/` (top 4 each).
- **Weekly Recap** — `/api/stocks/summary/?range=weekly`: index change, top 5 weekly gainers, top 3 sector winners.

## Card visual refresh

- Keep the dark glass aesthetic; cleaner execution: orange brand accent (app accent color), larger hero numbers, consistent row grid, tighter spacing.
- **Light theme variant**: white card, slate text, same layout — selected via theme toggle.
- Header: Stockastic logo (theme-appropriate asset) + real date. **Remove** the fake SNAPSHOT ID.
- Footer: `stockastic.market` brand line. **Remove** the decorative Twitter/Share icons.
- Empty/error state rendered inside the frame when a template's data is unavailable ("Data unavailable — try again later"), so exports never show broken layouts.

## Preview & export

- **Ratio toggle:** 4:5 (1080×1350), 1:1 (1080×1080), 9:16 (1080×1920). Implemented as aspect classes on the frame; templates use flexible layouts that fill all three. html2canvas exports at 1080px-width scale.
- **Theme toggle:** dark / light.
- **Actions:**
  - *Save image* — current html2canvas download, background color follows theme.
  - *Copy image* — `canvas.toBlob` → `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`; toast "not supported in this browser" fallback (Safari/Firefox caveats).
  - *Copy text* — formatter output from `socialCardText.ts`.
  - *Post on X* — `https://twitter.com/intent/tweet?text=<encoded formatted text>` in a new tab.
  - *LinkedIn* — `https://www.linkedin.com/feed/?shareActive=true&text=<encoded>` in a new tab.
  - One-line hint under the toolbar: platforms don't accept pre-attached images via web intents — use Copy image and paste in the composer.

## Page layout

Two-pane, conforming to app conventions (standard `rounded-2xl` cards, orange actives, full content width — the page's `max-w-6xl` cap is removed):
- Left: template list (registry-driven, current orange-active card buttons). The "Strategic Insight" alert and "Pro Tip" box are dropped — replaced by the single intent hint under the toolbar.
- Right: control bar (ratio + theme toggles), live preview, `ExportToolbar`.

## Data strategy

`useSocialCardData` hook: fetches `/api/stocks/summary/` on mount (six templates depend on it); fetches signals digest, accumulation, and weekly summary lazily the first time a template needing them is selected; caches results in state for the session. `Promise.allSettled` for multi-endpoint templates; per-template empty state on failure.

## Text formatters

`socialCardText.ts` exports `formatCardText(templateId, data): string` producing the emoji/hashtag post text per template (existing five preserved in spirit, four new ones added). Pure function, vitest-covered.

## Testing & verification

- Vitest: `socialCardText` formatters (one test per template, plus missing-data fallback).
- `npx tsc --noEmit` + `npm run build`.
- Manual: select each of the 9 templates, toggle ratios/themes, save + copy image, fire both share intents.

## Out of scope

- Server-side/edge image generation.
- Scheduled/automated posting.
- Backend changes.
