---
name: "WhatToDo"
description: "A compact local-first command center for deadline tasks, projects, reminders, and working folders."
colors:
  background: "oklch(0.976 0.008 228)"
  foreground: "oklch(0.19 0.022 235)"
  card: "oklch(0.954 0.01 228)"
  primary: "oklch(0.61 0.125 210)"
  primary-foreground: "oklch(0.975 0.008 220)"
  secondary: "oklch(0.91 0.018 236)"
  secondary-foreground: "oklch(0.25 0.025 235)"
  muted: "oklch(0.9 0.014 232)"
  muted-foreground: "oklch(0.47 0.025 236)"
  accent: "oklch(0.89 0.046 205)"
  accent-foreground: "oklch(0.21 0.03 232)"
  destructive: "oklch(0.59 0.18 25)"
  border: "oklch(0.84 0.018 232)"
  ring: "oklch(0.64 0.13 210)"
  sidebar: "oklch(0.94 0.012 232)"
  sidebar-accent: "oklch(0.89 0.018 232)"
typography:
  headline:
    fontFamily: "Geist Variable, Noto Sans SC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Geist Variable, Noto Sans SC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily: "Geist Variable, Noto Sans SC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "Geist Variable, Noto Sans SC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.12em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  task-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
---

# Design System: WhatToDo

## 1. Overview

**Creative North Star: "The Deadline Ledger"**

WhatToDo should feel like a compact local command center for deadline work. The surface is quiet, lightly tinted, and precise: users should see dates, task status, project context, reminder state, and folder affordances before they notice the styling.

The design system is a product UI system, not a brand campaign. It rejects marketing-first hero layouts, decorative gradient text, glassmorphism, neon dashboards, and heavy purple-blue AI-tool styling. Familiar controls are a feature: side navigation, segmented controls, form fields, task rows, dialogs, and detail panes should look standard enough to be trusted immediately.

**Key Characteristics:**
- Dense but readable task and project surfaces.
- Restrained blue-cyan accent used for selection, focus, and primary actions.
- Tinted cool neutrals for background, sidebar, card, border, and muted text.
- Stable 8px-or-less corner vocabulary across panels, buttons, cards, and controls.
- Motion only for state changes, such as panel width, hover, focus, and active press.

## 2. Colors

The palette is a restrained cool-neutral system with one functional blue-cyan accent.

### Primary
- **Deadline Blue** (`primary`): Used for primary buttons, selected calendar days, active segmented controls, checked completion buttons, and focused navigational emphasis.
- **Primary Ink** (`primary-foreground`): Used only on primary surfaces where contrast must stay crisp.

### Secondary
- **Control Mist** (`secondary`): Used for secondary buttons, icon wells, count pills, and low-emphasis controls.
- **Control Ink** (`secondary-foreground`): Used for readable text on secondary surfaces.

### Tertiary
- **State Colors**: Priority and deadline status use semantic Tailwind utilities already present in the UI: red for high or overdue, amber for medium or reminder, emerald for low. These colors should remain small, attached to status dots or chips, and never become the page palette.

### Neutral
- **Paper Blue** (`background`): Main application canvas.
- **Panel Blue** (`card`): Task rows, settings sections, side panels, and low raised containers.
- **Sidebar Wash** (`sidebar`): Dedicated navigation rail surface.
- **Quiet Line** (`border`): Borders, dividers, field strokes, and card boundaries.
- **Muted Text** (`muted-foreground`): Labels, helper text, metadata, and secondary timestamps.

### Named Rules

**The One Accent Rule.** Deadline Blue is for action, selection, focus, and completion state. Do not use it as decorative fill.

**The Small Semantic Rule.** Red, amber, and emerald should appear as status markers, badges, or small text, never as section backgrounds.

## 3. Typography

**Display Font:** Geist Variable with Noto Sans SC and system sans fallbacks.  
**Body Font:** Geist Variable with Noto Sans SC and system sans fallbacks.  
**Label/Mono Font:** No separate mono family is used.

**Character:** The type system is product-native: compact, neutral, and legible across English and Chinese labels. Hierarchy comes from weight, size, and uppercase labels, not expressive font pairing.

### Hierarchy
- **Headline** (600, 1.5rem, 1.2): Screen-level task headings such as selected dates and overview titles.
- **Title** (600, 1.125rem, 1.3): Settings section titles, project names, and prominent panel headings.
- **Body** (400, 0.875rem, 1.45): Task names, form values, descriptions, and general UI copy.
- **Label** (500, 0.75rem, 0.12em uppercase where used): View labels, metadata labels, compact form labels, and sidebar stats.

### Named Rules

**The Product Type Rule.** Do not introduce display fonts, fluid type, or decorative letter spacing. Product surfaces use fixed sizes and a single sans stack.

## 4. Elevation

WhatToDo uses tonal layering first and shadows second. Depth primarily comes from borders, tinted panels, and alpha-layered card backgrounds. Shadows are light and utilitarian: task rows and settings panels can use `shadow-sm`; dialogs can use `shadow-xl`; primary action buttons can carry a subtle colored `shadow-primary/20` or `shadow-primary/25`.

### Shadow Vocabulary
- **Low Row Lift** (`shadow-sm`): Task rows, inline composer, and settings cards. It separates repeated items without creating a floating card wall.
- **Action Glow** (`shadow-sm shadow-primary/20` or `shadow-primary/25`): Primary add buttons only.
- **Dialog Lift** (`shadow-xl`): Modal task creation surface.

### Named Rules

**The Border First Rule.** Use borders and tonal surfaces before shadows. If a surface is static, shadow should be subtle or absent.

## 5. Components

### Buttons
- **Shape:** Gently rounded controls (8px default, 6px for compact sizes).
- **Primary:** Deadline Blue background with Primary Ink text, medium weight text, icon support, and 32px default height.
- **Hover / Focus:** Hover darkens or tints the existing surface. Focus uses a ring derived from `ring`, with visible border treatment.
- **Secondary / Ghost / Destructive:** Secondary uses Control Mist. Ghost appears only on hover. Destructive uses red tint and red text, not full red fill.

### Chips
- **Style:** Rounded pills with compact 0.5rem horizontal padding, border or subtle tinted background.
- **State:** Selected filters use accent background and ring border. Reminder chips use amber tint. Count chips use secondary background.

### Cards / Containers
- **Corner Style:** 8px radius.
- **Background:** `card` with opacity variations such as `bg-card/60`, `bg-card/70`, or `bg-card/80`.
- **Shadow Strategy:** Low Row Lift only where separation is needed.
- **Border:** Always use `border-border` for task rows, settings sections, project panels, and empty states.
- **Internal Padding:** Dense surfaces use 8px to 12px; headers and settings sections use 16px.

### Inputs / Fields
- **Style:** 36px height, 6px radius, background canvas fill, input border, 12px horizontal padding, 0.875rem type.
- **Focus:** Border shifts to `ring`; outer focus outline remains visible via global focus-visible rules.
- **Error / Disabled:** Error uses destructive border and ring. Disabled controls reduce opacity and block pointer events.

### Navigation
- **Style:** Collapsible left rail with 56px collapsed width and 224px expanded width. Navigation buttons are 40px tall, icon-led, and use sidebar accent fill when active.
- **Active State:** `sidebar-accent` background with `sidebar-accent-foreground` text.
- **Mobile Treatment:** Existing app shell is desktop-first; preserve fixed panel widths until a dedicated responsive mode is designed.

### Task Rows
- **Structure:** Three-column row: completion control, task content, row action.
- **Metadata:** Due date, time, project chip, reminder chip, and loose-task state live below the title in muted text.
- **Priority:** A 2px-like small dot uses red, amber, or emerald. The dot is an accent, not the only source of meaning.
- **Interaction:** Hover strengthens the border toward the ring color. Selection uses accent fill and ring border.

### Dialogs
- **Style:** Centered Radix dialog with 560px max width, 8px radius, popover background, border, and shadow-xl.
- **Overlay:** Background tint with a 2px blur. This blur is functional focus isolation, not glassmorphism decoration.

## 6. Do's and Don'ts

### Do:
- **Do** keep the app task-first. Calendar, overview, projects, settings, and detail panes should expose actions immediately.
- **Do** use Deadline Blue only for primary actions, selected states, focus, and completion affordances.
- **Do** keep cards and controls at 8px radius or less.
- **Do** preserve dense metadata in task rows when it supports scanning.
- **Do** use borders and tinted panels before adding shadow.
- **Do** keep bilingual labels short and stable, especially in buttons and narrow rails.

### Don't:
- **Don't** use marketing-first hero layouts that explain the app instead of letting the user work.
- **Don't** use decorative gradient text, glassmorphism, neon dashboards, or heavy purple-blue AI-tool styling.
- **Don't** make the productivity UI overly cute with playful mascots, oversized empty states, or motivational copy.
- **Don't** create spreadsheet-like density without hierarchy.
- **Don't** use non-standard controls that make common task operations feel invented or unfamiliar.
- **Don't** use colored side-stripe borders on cards or task rows. Use full borders, status dots, or chips.
