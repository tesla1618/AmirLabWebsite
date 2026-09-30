# Flexible site design system template

A brand-neutral visual and component reference for research organizations, product websites, studios, and personal portfolios. The paired [HTML template](design-system-template.html) demonstrates the tokens, page grid, component anatomy, and states described here.

The HTML template starts in an explicit light theme, independent of the visitor's operating-system preference. Its muted green accent is a replaceable starter value, not a fixed identity. The values below do not prescribe a logo, product vocabulary, content model, or permanent brand palette.

## Design principles

- **Structure with lines.** Use thin rules to align content, clarify hierarchy, and make page regions legible. Keep the line contrast low until a boundary matters.
- **Mark real intersections.** Small outlined square nodes identify meaningful crossings between the outer frame, section rules, and columns. Use them as a structural signature, not as a repeating texture.
- **Let content set the expression.** Pair a restrained display face with a readable interface face. Give research findings, product decisions, and selected work different content patterns within the same layout grammar.
- **Use color with intent.** Accent indicates a primary action, current selection, or link requiring emphasis. Semantic tones communicate status and always appear with text or an icon.
- **Specify every state.** Components have explicit rest, hover, focus, selected, invalid, disabled, and busy styles where those states apply. No component should depend on a browser's default presentation.

## Foundations

### Color tokens

These values are a light-theme starter palette. The template selects this theme directly rather than inferring it from the device. Adapt the accent and semantic colors to the project's identity, then verify contrast for the actual text sizes and surfaces.

| Token | Starter value | Purpose |
| --- | --- | --- |
| `--page` | `#F7F8F6` | Main page canvas |
| `--surface` | `#FFFFFF` | Default cards and grouped content |
| `--raised` | `#F1F3F1` | Menus, nested panels, and raised controls |
| `--high` | `#E8ECE9` | Hover and stronger neutral surface |
| `--selected` | `#E9EFEB` | Quiet selected surface |
| `--ink` | `#1F2421` | Primary text |
| `--soft` | `#3F4743` | Secondary text |
| `--muted` | `#66716B` | Helper text and descriptions |
| `--faint` | `#727A75` | Metadata and disabled hints |
| `--line` | `#DDE2DE` | Low-emphasis dividers |
| `--line-strong` | `#B7C0BA` | Input boundaries and raised outlines |
| `--accent` | `#395B4B` | Replaceable starter accent for actions and active selection |
| `--accent-hover` | `#2C493B` | Accent hover |
| `--accent-soft` | `#496B5A` | Focus, selected text, and accent details |
| `--success` | `#26734B` | Successful completion |
| `--warning` | `#865800` | Caution or attention |
| `--danger` | `#B63845` | Validation and destructive action |

**Application rules**

- Use the page token for the canvas and surface tokens for groups. Keep neighboring light surfaces close in value; use lines and spacing to clarify structure.
- Reserve accent for actions, current selection, and important links; do not use it as a large background by default.
- Use a stronger line or focus ring when a boundary needs to be found. Do not make every border equally prominent.
- Pair semantic color with a word, icon, or both. Color alone does not communicate a state.
- If a project adds a dark theme, define a complete parallel token set and test the same component states. Do not infer a theme from the user's device unless that behavior is an explicit product choice.

### Typography

| Role | Suggested stack | Use |
| --- | --- | --- |
| Display | `system-ui, sans-serif` | Hero statements and section headings; replace with a project-appropriate display face when desired |
| Interface | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Navigation, body copy, labels, controls, and descriptions |
| Utility | `ui-monospace, SFMono-Regular, Consolas, monospace` | Shortcuts, counts, dates, metadata, and compact uppercase annotations |

No specific typeface is required. The template uses a system sans stack as a neutral baseline. Use licensed or bundled fonts only when the project is prepared to distribute them.

| Text role | Starting size / line height |
| --- | --- |
| Hero | `clamp(40px, 5.2vw, 66px)` / `0.99–1.08` |
| Section heading | `34–48px` / `1.05–1.2` |
| Card heading | `14–23px` / `1.2–1.35` |
| Body | `14–16px` / `1.55–1.7` |
| Control label | `11–13px` / `1.4` |
| Helper and metadata | `10–12px` / `1.4–1.55` |

### Grid, spacing, and shape

The page frame uses thin horizontal rules and inset vertical rails. The template’s hero frame, content columns, and three-part feature row share aligned edges. At major rule intersections, a small square outline makes the join intentional and visible. Keep the navbar-edge nodes attached to the sticky header so they remain fixed while the page scrolls; let the guide rails continue beneath the header layer. Give each shared edge one rule owner; do not stack a section border over its grid-guide line, and keep intersection nodes outside clipped containers.

| Token | Value |
| --- | ---: |
| `space-1` | `4px` |
| `space-2` | `8px` |
| `space-3` | `12px` |
| `space-4` | `16px` |
| `space-5` | `24px` |
| `space-6` | `32px` |
| `space-7` | `48px` |
| `space-8` | `64px` |
| `space-9` | `96px` |

- Content max width: `1240px`.
- Page gutters: `16px` small screens and `32px` wide screens.
- Control radius: `4px`; field and compact panel radius: `5px`; large grouping radius: `9px`.
- Use pill radii for compact tags only.
- Prefer one-pixel rules and flat surfaces. Add a restrained shadow only when a menu or popover must read as elevated.
- Keep square nodes small (`5–7px`), outlined, and aligned exactly to the rule crossing.
- Use solid strokes for primary structural rails, dashed strokes for long continuations or outer guides, and dotted strokes for secondary subdivisions. Apply each treatment deliberately; do not turn the grid into a texture.

## Components

Every component in the HTML template uses explicit utility classes and a defined visual state. Keep labels outside controls where possible; placeholder text is supplementary and never replaces a label.

### Buttons

| Variant | Visual contract | Use |
| --- | --- | --- |
| Primary | Filled accent, high-contrast text, `40px` minimum height | Main action in a decision group |
| Secondary | Raised or transparent neutral fill with a strong neutral outline | Supporting action |
| Quiet | No strong boundary; hover fill and full hit target | Cancel, navigation, or lower-priority action |
| Destructive | Danger text with a restrained danger border/fill | Irreversible action |
| Icon-only | Square hit target with an accessible name | Compact utility action |

Also define small/large sizes, hover, `:focus-visible`, disabled, and busy/loading. A busy action keeps its label and exposes `aria-busy`; a disabled action has no hover affordance and remains readable. Use direct verbs.

### Icons

Use Lucide icons for interface symbols. The standalone HTML uses Lucide's vanilla JavaScript package; a Next.js implementation can use `lucide-react` and import only the icons it needs.

```tsx
import { CircleCheck, TriangleAlert, CircleX } from "lucide-react";

<CircleCheck aria-hidden="true" size={28} strokeWidth={1.75} />
```

- Keep a consistent stroke, size, and alignment within each control family.
- Pair icons with text labels unless the action is universally recognizable; give icon-only controls an accessible name.
- Mark decorative icons `aria-hidden="true"`. Do not substitute Unicode characters for interface icons.
- Keep literal keyboard symbols in `<kbd>` elements; they describe keys rather than stand in for icons.

### Text inputs and textareas

**Anatomy:** persistent label, control, optional value or placeholder, then helper or validation copy. Required status is visible in the label and programmatic name.

- Default: `40px` high, white or raised neutral field, one-pixel neutral outline, `5px` radius, `12–13px` text.
- Hover: slightly stronger outline.
- Focus: accent outline and visible outer ring; never remove keyboard focus without replacing it.
- Invalid: danger outline and a specific corrective message associated with the field.
- Disabled: subdued surface and text, no pointer affordance, and a clear reason when the disabled state is not self-evident.
- Textarea: same field tokens, top-aligned content, comfortable inner padding, and vertical resize only when resizing is useful.

The template includes text, email, password, number, and multi-line fields. Set suitable input types, constraints, and autocomplete values for each real form.

### Search field

Use the input anatomy with a search icon, `type="search"`, a concise hint, and an optional visible shortcut key. Remove native search decoration where it conflicts with the component; provide a separately styled clear button when clearing is supported. The label remains available to assistive technology.

### Radio buttons

Use radio buttons for one choice from a small mutually exclusive group. Keep a shared `name`, a custom circular mark, an associated label, and optional one-line explanation. Specify unchecked, checked, hover, focus-visible, and disabled states. Do not use radios for independent on/off preferences.

### Checkboxes

Use checkboxes for independent choices. Draw a custom square mark and check icon from the chosen icon library; expose unchecked, checked, focus-visible, and disabled states. Support an indeterminate mark only when a parent-child selection model needs it. The complete label remains clickable.

### Switches

Use a switch for a setting that takes effect immediately. Provide a visible label and concise description, a track and movable thumb, checked and unchecked appearances, and keyboard focus. A switch should not replace a submit-time checkbox. Expose the appropriate checked state to assistive technology.

### Searchable list

**Anatomy:** labeled search field, result count or status, selectable rows, and an empty state. Each result row aligns an optional mark/icon, title, description, and category or trailing status.

- Filter against the relevant searchable fields, not just visible text.
- Preserve the query when the result set changes.
- Give the selected row a quiet accent surface and a non-color state such as `aria-selected`.
- Announce the result count and provide a useful empty-state prompt.
- Keyboard contract: focus the input, move through results with arrow keys, activate with Enter, and expose selection state.

The template’s sample list filters its four generic page entries as you type.

### Dropdown and custom select

A custom select is a labeled trigger button plus a separately styled option surface; it avoids exposing an operating-system-specific native menu when exact appearance is required. Define:

- Trigger at `40px` high with current value, chevron, hover, focus, and expanded states.
- Option rows at `36px` minimum height with selected, hover, and disabled states.
- A clear layering boundary and popover width aligned with the trigger unless the option labels need more room.
- Keyboard behavior for opening, moving through options, selecting, and dismissing.

For native `<select>`, use it only when platform-native presentation is acceptable. Do not mix native menu appearance into a custom menu design.

### Menus

Menus contain actions; dropdown selects contain values. Use an anchored trigger, compact elevated surface, consistent row height, optional icons and shortcut hints, separators between groups, and a distinct destructive row where needed. Define active, hover, focus, and disabled rows. The interaction contract includes arrow-key movement, Enter/Space activation, Escape dismissal, and focus returning to the trigger.

### Single-date picker

**Field anatomy:** persistent label, date value, calendar affordance, and optional date-format/helper text. The open popover contains:

1. Month/year heading with previous and next navigation controls.
2. Seven weekday labels aligned to the first day of the displayed week.
3. A stable seven-column day grid with blank leading/trailing cells.
4. Day cells for default, hover, keyboard focus, today, selected, event-marked, and unavailable states.
5. A clear or cancel action only when it has a useful role in the flow.

Use the accent fill for the selected day, a visible outline for today, a small non-color marker for dates with events, and subdued but legible text for unavailable days. Give each day a full accessible name including its date and state. Calendar navigation must update the displayed month. The specimen supports day movement with arrow keys and month movement with Page Up/Page Down.

### Date-range picker

**Field anatomy:** start and end values, a range affordance, optional preset ranges, two adjacent month panels, and a clear apply/cancel action when the flow requires confirmation.

- Align both month panels to the same seven-column weekday grid.
- Render included dates as one continuous, low-contrast band across rows and across the month boundary.
- Give the start and end dates stronger accent endpoints, distinct from included dates.
- Keep today, event-marked, unavailable, hover, and keyboard-focus states visible without obscuring the range.
- State the chosen start and end dates in text, not only through the colored band.
- Provide shortcuts such as “Past 7 days” only when those ranges have clear meaning for the task.

The HTML specimen uses October and November 2026 with a range that crosses the month boundary. Edit either endpoint, choose calendar days, move by day/week/month with the keyboard, use a preset, then Apply or Cancel to see the layout and state update together. This is sample content, not a required date treatment; choose cell shape, density, and palette to fit the product.

When starting a new selection, the first click fixes the start anchor. Moving across either month previews a continuous range from that anchor; the preview endpoint and included-day fill stay visually steady under the pointer. Leaving the date-range component clears the temporary preview but keeps the anchor. Hovering a date resumes the preview, and the second click commits its end date. Apply stays disabled until both dates are committed.

## Content patterns

Use the shared frame to support several kinds of information without forcing them into one template:

- **Research:** question or finding, evidence, method, source notes, and next step.
- **Product:** audience and value, feature explanation, proof, and a clear action.
- **Portfolio:** selected work, role and contribution, process, and outcome.

A hero, feature row, resource list, chart, project card, or editorial story is optional. Order modules by the visitor’s task and the information’s importance.

## Feedback states

- **Success:** concise confirmation and the result that changed.
- **Warning:** explain the condition and the next safe action.
- **Error:** identify what failed and how to recover.
- **Empty:** explain why there is no content and how to create or find it.

Pair the status tone with text or an icon. Preserve surrounding context when transient feedback appears.

## Accessibility and responsive behavior

- Use semantic controls, programmatic labels, and accessible names for icon-only actions.
- Keep a clearly visible `:focus-visible` ring with sufficient contrast on every surface.
- Associate helper/error text with its field and expose invalid state programmatically.
- Meet WCAG contrast requirements for the actual text size and component state; muted text still needs to be readable.
- Do not communicate selected, error, or availability states through color alone.
- Respect `prefers-reduced-motion`; animation is supplementary and should not carry meaning.
- Make targets comfortable for pointer and touch; preserve keyboard access at all breakpoints.
- At narrow widths, stack columns, let section navigation scroll horizontally, and let two-month calendars stack or scroll inside the popover without causing page-wide overflow.

## Implementation notes

The template is a static HTML document styled with Tailwind CSS through its CDN script and Lucide 1.48.0's vanilla JavaScript package through a version-pinned CDN URL. Both require a network connection. Component appearances are written with Tailwind utilities; the small raw CSS block is limited to page-level behavior and browser-specific search-input treatment. For Next.js, use `lucide-react` and import only the icons used by the page. Native form controls that cannot be styled consistently are replaced by custom-styled semantic controls where the specimen needs exact presentation.

The HTML specimens are interactive: search filters and supports keyboard selection; radio and checkbox states change; the dropdown and menu open, close, select, and respond to keyboard input; single-date and date-range calendars navigate and update their fields. The range calendar previews from a fixed first-click anchor on hover or keyboard movement, clears the hover preview when the pointer leaves the component, commits the endpoint on the next click, and keeps Apply and Cancel as separate actions. Reconnect those state transitions to the host application’s data and validation when adopting the patterns.

## Files

- [HTML template](design-system-template.html): responsive, brand-neutral page with foundations, line-and-node grid, and detailed component specimens.
- This Markdown file: token definitions, component contracts, accessibility guidance, and adaptation rules.
