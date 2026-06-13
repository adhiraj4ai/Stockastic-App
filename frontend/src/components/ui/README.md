# Stockastic UI consistency contract

One interactive accent, one hover, one selected state, one focus ring — everywhere.

## Color roles

| Role | Classes | Notes |
|---|---|---|
| Interactive accent | `bg-primary`, `text-primary`, `border-primary`, `ring-ring` | Emerald via theme tokens in `globals.css`. Never hardcode `blue-*`, `indigo-*`, `purple-*`, `sky-*`, `teal-*` on interactive elements. |
| Market up / down | `emerald-*` / `rose-*` | Data semantics only (prices, P&L, signals). |
| Warnings | `amber-*` | Data/status semantics only. |
| AI affordances | `violet-*` | Chat / "Ask AI" entry points only. |
| Destructive | `bg-destructive`, `text-destructive` | Deletes, sign-out. |

## Canonical states

- **Hover (rows, ghost surfaces, icon buttons):** `hover:bg-accent hover:text-accent-foreground` — never page-specific `hover:bg-slate-*` / `hover:bg-gray-*` / `hover:bg-white`.
- **Hover (primary buttons):** `hover:bg-primary/90` (built into the Button variant).
- **Selected / active (chips, rows, toggles):** `bg-primary/10 text-primary` (+ `border-primary/30` when bordered). Sidebar keeps `bg-sidebar-accent`.
- **Focus:** `focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring` (built into all primitives).

## Components

- **Buttons:** `<Button>` from `ui/button` (`default | outline | ghost | secondary | destructive | link`; sizes incl. `icon`). A raw `<button>` is acceptable only for non-button-shaped interactive areas (list rows, dropdown items) and must then use the canonical hover/focus classes above plus `rounded-md transition-colors`.
- **Tabs:** `Tabs/TabsList/TabsTrigger` from `ui/tabs`. Active styling comes from the primitive (`data-[state=active]` → `text-primary`); don't override active colors per page.
- **Checkboxes:** `<Checkbox>` from `ui/checkbox`. No raw `<input type="checkbox">`.
- **Inputs / selects:** `ui/input`, `ui/select`, `ui/textarea` — focus and border states come from tokens.

## Don't touch

Chart palettes, categorical badge colors, and status colors carry meaning — leave them. This contract governs *interactive* styling only.
