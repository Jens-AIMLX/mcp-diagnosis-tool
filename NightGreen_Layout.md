# NightGreen Layout — Principles and Style Guide

## 1) Purpose and Top‑Line Concept
NightGreen is a pragmatic, low‑noise, high‑signal layout language for operational UIs. It favors a calm dark canvas with a green accent for action and status. Content stays primary; utilities fold away. Interactions are predictable, accessible, and efficient.

Applies to: diagnostics tools, control surfaces, developer utilities, and dashboards where signal density is high and interruptions must be minimal.


## 2) Assessment of the current layout

- Simplicity
  - Server and log utilities are moved into foldouts, removing persistent clutter from the primary frame.
  - Minimal icon toggles (▾ and ≡) keep the canvas clean while still discoverable.
  - Good: avoids competing panels; users summon utilities only when needed.

- Focus
  - Primary task (config, server interactions) remains in the upper frame; foldouts dock under it to feel local and contextual.
  - The log viewer uses a monospace, scrollable block that reads well and does not steal focus until opened.

- Alignment
  - Foldouts span the parent frame width and inherit the same card/border/radius, yielding visual unity.
  - Spacing and padding are consistent with the surrounding frame.

- Expandability
  - Independent foldouts (Server Controls, Log Viewer) allow stacking more tools without bloating the default view.
  - Mechanism generalizes to additional docked panels (e.g., Metrics, Traces) with the same toggle paradigm.

- Color concept & contrast
  - Dark neutrals (#0f1319 canvas, #1a202c cards, #2d3748 borders) with high‑legibility text (#e2e8f0).
  - Danger actions styled consistently; space for a green accent for primary/positive actions.
  - Contrast appears ≥ 4.5:1 in most text contexts — good baseline for WCAG AA.

- Usability & efficiency
  - One‑click toggles open utility panels near their context; frequent operations are close at hand (few pointer miles).
  - ARIA attributes (aria‑expanded, role=region) are present — good for AT.
  - Copy and Refresh affordances in the log viewer support common workflows.

Overall: The layout cleanly balances power and calm. The foldout pattern is an excellent mechanism to preserve simplicity while keeping depth one click away.

### Placement critique & correction (derived from incident)
- The current position of the Log Viewer toggle (≡) in the upper configuration frame violates proximity and visual harmony:
  1) It clutters a clear, focused header with a dissimilar glyph.
  2) It is far from the elements it manages (server/log context).
  3) When the server area is folded, its effects are not directly usable.
- Correction (principled): Place the Log Viewer control inside the Server card itself — top‑right of the Server foldout header toolbar — or inline beside “Download log”. It should be visible only when the Server panel is visible. If exposed elsewhere, it must first open the Server panel before revealing its own content.
- Rationale: controls live with their content; visibility and affordance move together so users never actuate a control whose effects are hidden.



## 3) Suggested improvements (to further strengthen principles)

- Discoverability
  - Add `aria-label` and tooltip titles (“Server Controls”, “Logfile Viewer”).
  - Consider optional tiny text labels on wider screens (e.g., “Logs”, “Server”).

- Target size & input
  - Increase toggle hit area to 32–36 px; add 8–12 px touch padding. Ensure visible hover and focus styles.
  - Keyboard: Space/Enter to toggle; Tab order before the foldout region; Esc closes if focus is inside.

- Visual status
  - Add a subtle status dot to the Server toggle (green when running, gray when unknown, red on error).
  - Chevron rotation should animate (150–200 ms) and reflect open/closed state.

- Color & contrast
  - Introduce a NightGreen accent (e.g., #22c55e primary, #16a34a hover) for positive actions and focus rings.
  - Ensure all text/background pairs meet WCAG AA (4.5:1 normal text, 3:1 for UI glyphs/icons).

- Spacing and rhythm
  - Adopt an 8px base grid (4/8/12/16/24/32). Normalize card padding (e.g., 16 px) and gap tokens.
  - Keep a consistent 8 px vertical rhythm inside foldouts.

- Log viewer ergonomics
  - Add “Follow tail” (auto‑scroll on new content), “Wrap lines” toggle, and inline search (Ctrl/Cmd+F handoff or custom find).
  - Consider lazy streaming (server tail endpoint) to avoid loading huge logs.
  - Show file meta (name, size, last updated); add dropdown for rotated logs.

- Responsiveness
  - On narrow viewports, convert the two toggles into an inline toolbar with labels beneath icons or a single “Utilities ▾” menu.

- Feedback & errors
  - Use non‑blocking toasts for transient events (“Copied”, “Rotation complete”), and inline errors within foldouts.

- Accessibility
  - Ensure focus outlines have 3:1 contrast on dark backgrounds.
  - Provide discernible names for toggles and regions; keep landmarks navigable.


## 4) Core principles as a style guide

### 4.1 Simplicity
- Keep the primary task area topmost; utilities live in foldouts attached to their context.
- Prefer progressive disclosure (foldouts, accordions) over extra pages.
- Minimize default visible controls; surface only those required for the immediate task.

### 4.2 Focus
- Preserve a single, stable focal area; place detail panes directly adjacent (docked) rather than floating.
- Use subtle motion (≤ 200 ms) to indicate state change without distraction.
- Avoid noisy borders and complex shadows; rely on tone, space, and alignment.

### 4.3 Alignment
- Use a consistent grid (8 px base). Align edges; let panels span their parent width unless a narrower column improves readability.
- Standardize card padding (e.g., 16 px), gap sizes, and control heights.

### 4.4 Expandability
- Each foldout is a reusable component: toggle + docked region + content.
- Panels stack vertically; each panel is self‑contained and can be reordered without breaking rhythm.

### 4.5 Color & contrast
- Dark neutrals for surfaces; green accent for action and confirmation; red for danger.

### 4.7 Placement & proximity (control-to-content)
- Put controls inside the card that owns their effects. If a control acts on a folded region, it must first open that region or remain hidden/disabled until visible.
- Proximity heuristics:
  - Same card or within 24 px of the element it governs.
  - If cross-card control is unavoidable, use an anchored affordance (caret or connector) pointing to its target.
- Visibility coupling:
  - A control must never produce effects the user cannot immediately see.
  - When the target region is hidden, either reveal it automatically or disable the control.

### 4.8 Visual consistency of symbols
- Do not clutter dense headers with extra glyphs; cap icon-only controls at two per card.
- Do not mix visually dissimilar icon styles (stroke vs solid, irregular sizes). Use one icon set and consistent 16–20 px glyph size.
- Prefer text+icon for uncommon actions; reserve icon-only for universally recognized actions.

- Ensure contrast: text ≥ 4.5:1, large text ≥ 3:1, interactive outlines ≥ 3:1.
- Use color tokens; never hardcode colors in components.

### 4.6 Usability & efficiency
- Hit target ≥ 32 px square; keyboard parity for every control.
- Keep high‑frequency actions within one click of the focal area.
- Provide explicit states: loading, success, error, disabled.


## 5) Design tokens (foundational)

```css
:root {
  /* Surfaces */
  --ng-bg-0: #0f1319;  /* canvas */
  --ng-bg-1: #1a202c;  /* card */
  --ng-border: #2d3748;/* separators */
  --ng-text: #e2e8f0;  /* primary text */
  --ng-text-dim: #cbd5e1; /* secondary */
}
```

```css
:root {
  /* Accents & states */
  --ng-accent: #22c55e;       /* primary */
  --ng-accent-strong: #16a34a;/* hover */
  --ng-danger: #ef4444;       /* danger */
  --ng-focus: #34d399;        /* focus ring */
}
```

```css
:root {
  /* Shape, spacing, motion */
  --ng-radius: 6px;
  --ng-space-1: 4px; --ng-space-2: 8px; --ng-space-3: 12px;
  --ng-space-4: 16px; --ng-space-5: 24px; --ng-space-6: 32px;
  --ng-trans-fast: 150ms cubic-bezier(0.2, 0, 0.2, 1);
}
```


## 6) Components — anatomy and behavior

### 6.1 DockToggle
- Anatomy: icon (chevron or glyph), optional label, status dot (optional), focus ring.
- States: default, hover, focus, active, disabled, open.
- Behavior: toggles `aria-expanded`; controls the associated region by ID.

```html
<button class="dock-toggle" aria-expanded="false" aria-controls="server-foldout" aria-label="Server Controls">▾</button>
```

```css
.dock-toggle { width: 36px; height: 36px; border-radius: var(--ng-radius);
  border: 1px solid var(--ng-border); background: #1f2733; color: var(--ng-text);
  transition: transform var(--ng-trans-fast), background var(--ng-trans-fast); }
.dock-toggle.open { transform: rotate(180deg); }
```

### 6.2 DockPanel
- Anatomy: container, header (optional), content area, actions row.
- States: hidden/visible; animates height/opacity or instant show/hide (pref. height auto, opacity 0→1).
- Accessibility: `role="region"`, labelled by/label.

```html
<div id="server-foldout" class="dock-panel" role="region" aria-label="Server and logs"></div>
```

```css
.dock-panel { background: var(--ng-bg-1); border: 1px solid var(--ng-border);
  border-radius: var(--ng-radius); padding: var(--ng-space-4); }
```

### 6.3 LogViewer
- Anatomy: toolbar (Refresh, Copy, options), content area (`<pre>`), status/meta line.
- Options: Follow tail, Wrap lines, Search.
- Performance: fetch tail by bytes; avoid rendering megabytes at once.

```html
<div class="log-toolbar">
  <button class="secondary">Refresh</button>
  <button class="secondary">Copy</button>
</div>
<pre class="log-viewer" aria-live="polite"></pre>
```


## 7) Responsiveness
- ≥ 1024 px: toggles can show labels; multi‑column utilities possible.
- 600–1024 px: two icon toggles aligned to the parent’s bottom‑right.
- < 600 px: consolidate into a single “Utilities ▾” that reveals stacked accordions.


## 12) Rules distilled (from the placement incident)
- Do not clutter places with symbols. Minimize icon-only controls in clean headers.
- Do not mix visually very different symbols. Use one cohesive icon set and size rhythm.
- Put controls close to what they manage. Controls live in the same card as their effects.
- Never put a control where its effects cannot be used. If its target is hidden, either reveal it automatically or disable/relocate the control.



## 8) Accessibility
- Keyboard: Tab to toggles; Space/Enter to open/close; Esc closes when focus is inside the panel.
- Focus style: 2 px outline using `--ng-focus` with inner/outer contrast.
- Regions: Use `aria-controls`, `aria-expanded`, and `role=region` with labels; keep DOM order logical.


## 9) Motion
- Use 150–200 ms for chevron rotation and panel fade/height transitions.
- Respect `prefers-reduced-motion: reduce` — disable animations for those users.


## 10) Verification & QA (user‑perspective)
- Visual tests open/close foldouts, verify alignment, spacing, contrast, and states.
- Log viewer: test Refresh, Copy, long log tailing and wrap toggle.
- Accessibility checks: keyboard journeys, screen reader labels, contrast.


## 11) Governance
- Treat tokens as a contract; changes require a quick design review.
- New utilities must use DockToggle + DockPanel pattern or justify a deviation.
- Add a changelog entry when tokens or component anatomy change.

