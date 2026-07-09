# Nudgeable.ai — CSS Design Rulebook
**Version 1.0** · For developers and AI platforms building on the Nudgeable brand

> This document is the single source of truth for all UI decisions across Nudgeable products. Every component, color, spacing value, and animation should be derived from the tokens defined here. **Never hard-code values that exist as CSS variables.**

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Brand Color Palette](#2-brand-color-palette)
3. [Design Tokens](#3-design-tokens)
4. [Typography](#4-typography)
5. [Spacing Scale](#5-spacing-scale)
6. [Border Radius](#6-border-radius)
7. [Shadows](#7-shadows)
8. [Transitions & Animations](#8-transitions--animations)
9. [Page Background System](#9-page-background-system)
10. [Card Component](#10-card-component)
11. [Buttons](#11-buttons)
12. [Tags & Chips](#12-tags--chips)
13. [Form Elements](#13-form-elements)
14. [Navbar](#14-navbar)
15. [Challenge Card](#15-challenge-card)
16. [Detail Panel](#16-detail-panel)
17. [Icon Badge](#17-icon-badge)
18. [Feature List](#18-feature-list)
19. [Decorative Accents](#19-decorative-accents)
20. [Layout Utilities](#20-layout-utilities)
21. [Typography Utilities](#21-typography-utilities)
22. [Spacing Utilities](#22-spacing-utilities)
23. [Responsive Breakpoints](#23-responsive-breakpoints)
24. [Dark Mode](#24-dark-mode)
25. [Do's and Don'ts](#25-dos-and-donts)

---

## 1. Getting Started

### Installation

Add the rulebook CSS as a global import at the root of your application — **before any component styles**.

```html
<!-- In your HTML <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="nudgeable-design-rulebook.css"/>
```

```css
/* Or in your root CSS/JS */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import './nudgeable-design-rulebook.css';
```

### Core Principles

| Principle | Rule |
|---|---|
| **Tokens first** | Always use `var(--token-name)`. Never write raw hex values or pixel values in component code. |
| **Single font** | Inter is used for all text — display, body, labels, mono code. |
| **Yellow dominates** | `#FFCE00` (Bright Amber) is the primary action color. Use it for CTAs, progress, highlights. |
| **Frosted surfaces** | Cards use `backdrop-filter: blur(16px)` on a translucent white background against the warm page bg. |
| **Pill buttons** | All buttons use `border-radius: 9999px`. Never use square or slightly-rounded buttons. |
| **Semantic status colors** | Use Emerald for success/accept, Hot Fuchsia for danger/decline, Dodger Blue for info. |

---

## 2. Brand Color Palette

The official Nudgeable palette consists of 9 colors. Each has a designated role and a corresponding CSS variable.

| Swatch | Name | Hex | Variable | Role |
|---|---|---|---|---|
| 🟡 | **Bright Amber** ★ | `#FFCE00` | `--bright-amber` | Primary CTA, brand yellow, highlights |
| 🟨 | **Lemon Chiffon** | `#FFFDF5` | `--lemon-chiffon` | Page background |
| ⬜ | **White** | `#FFFFFF` | `--white` | Card surfaces, inverse text |
| 🟣 | **Majorelle Blue** | `#623CEA` | `--majorelle-blue` | Secondary accent, premium, drag items |
| 🟠 | **Princeton Orange** | `#F68A29` | `--princeton-orange` | Warm accent, category tags |
| 🔴 | **Hot Fuchsia** | `#ED4551` | `--hot-fuchsia` | Danger, decline, alerts, errors |
| 🔵 | **Dodger Blue** | `#3699FC` | `--dodger-blue` | Info, links, informational tags |
| 🟢 | **Emerald** | `#23CE6B` | `--emerald` | Success, accept, positive states |
| ⬛ | **Shadow Grey** | `#221D23` | `--shadow-grey` | Primary text, dark backgrounds |

> ★ **Bright Amber** is the brand's dominant color. When in doubt, accent with yellow.

### Usage Rules

- **Page background** → always `#FFFDF5` (Lemon Chiffon) — do not use any other color as the base page background
- **Primary action buttons** → `#FFCE00` with `#221D23` text
- **Accept / confirm** → `#23CE6B` (Emerald) with white text
- **Decline / destructive** → transparent outline, hover state uses `#ED4551`
- **Never use palette colors as large background blocks** except Shadow Grey for dark sections

---

## 3. Design Tokens

All tokens live in `:root`. Import the CSS file and reference them anywhere via `var(--token-name)`.

### Color Tokens

```css
:root {
  /* ── OFFICIAL BRAND PALETTE ── */
  --white:            #FFFFFF;
  --lemon-chiffon:    #FFFDF5;     /* page background */
  --bright-amber:     #FFCE00;     /* primary CTA — brand yellow */
  --princeton-orange: #F68A29;     /* warm accent */
  --hot-fuchsia:      #ED4551;     /* danger / decline / alert */
  --dodger-blue:      #3699FC;     /* info / links */
  --emerald:          #23CE6B;     /* success / accept */
  --majorelle-blue:   #623CEA;     /* secondary / premium */
  --shadow-grey:      #221D23;     /* dark text / backgrounds */

  /* ── SEMANTIC ALIASES ── */
  --color-primary:        #FFCE00;
  --color-primary-dark:   #C9A000;
  --color-primary-light:  rgba(255, 206, 0, 0.15);

  /* ── BACKGROUNDS ── */
  --color-bg-base:        #FFFDF5;
  --color-bg-surface:     rgba(255, 255, 255, 0.90);
  --color-bg-overlay:     rgba(255, 253, 245, 0.78);
  --color-bg-muted:       rgba(255, 206, 0, 0.12);
  --color-bg-dark:        #221D23;

  /* ── TEXT ── */
  --color-text-primary:   #221D23;
  --color-text-secondary: #4A4047;
  --color-text-muted:     #8A8090;
  --color-text-inverse:   #FFFFFF;
  --color-text-accent:    #C9A000;

  /* ── BORDERS ── */
  --color-border:         rgba(34, 29, 35, 0.10);
  --color-border-strong:  rgba(34, 29, 35, 0.20);
  --color-border-yellow:  rgba(255, 206, 0, 0.45);

  /* ── SEMANTIC STATUS ── */
  --color-success: #23CE6B;
  --color-warning: #FFCE00;
  --color-danger:  #ED4551;
  --color-info:    #3699FC;
}
```

### Tag Color Tokens

Each palette color has a corresponding tag variant with a tinted background and dark text for readability:

```css
:root {
  --color-tag-yellow-bg:   rgba(255, 206,  0, 0.16);
  --color-tag-yellow-text: #7A5F00;

  --color-tag-orange-bg:   rgba(246, 138, 41, 0.14);
  --color-tag-orange-text: #7A3A00;

  --color-tag-red-bg:      rgba(237,  69, 81, 0.12);
  --color-tag-red-text:    #8C1C24;

  --color-tag-blue-bg:     rgba( 54, 153, 252, 0.13);
  --color-tag-blue-text:   #0A3D8C;

  --color-tag-green-bg:    rgba( 35, 206, 107, 0.13);
  --color-tag-green-text:  #0A6632;

  --color-tag-purple-bg:   rgba( 98,  60, 234, 0.12);
  --color-tag-purple-text: #2D1580;
}
```

---

## 4. Typography

**One font. Inter. Always.**

```css
--font-display: 'Inter', sans-serif;   /* headings, titles, brand text */
--font-body:    'Inter', sans-serif;   /* all body copy, labels, UI text */
--font-mono:    'JetBrains Mono', monospace;  /* code only */
```

### Type Scale

| Token | rem | px | Usage |
|---|---|---|---|
| `--text-xs` | 0.70rem | ~11px | Captions, timestamps, micro-labels |
| `--text-sm` | 0.813rem | ~13px | Tag labels, secondary metadata |
| `--text-base` | 0.938rem | ~15px | Body text, descriptions, form labels |
| `--text-md` | 1.063rem | ~17px | Section titles, card subtitles |
| `--text-lg` | 1.25rem | ~20px | Card titles, nav brand |
| `--text-xl` | 1.5rem | ~24px | Page section headers |
| `--text-2xl` | 1.875rem | ~30px | Detail panel titles |
| `--text-3xl` | 2.25rem | ~36px | Hero headings |
| `--text-4xl` | 3rem | ~48px | Display / landing page hero |

### Font Weights

| Token | Value | Usage |
|---|---|---|
| `--weight-regular` | 400 | Body copy |
| `--weight-medium` | 500 | Labels, nav items |
| `--weight-semibold` | 600 | Subheadings, emphasis |
| `--weight-bold` | 700 | Headings, card titles, buttons |

### Line Heights

| Token | Value | Usage |
|---|---|---|
| `--leading-tight` | 1.2 | Headings, display text |
| `--leading-snug` | 1.4 | Card titles, short text blocks |
| `--leading-normal` | 1.6 | Body text default |
| `--leading-relaxed` | 1.75 | Long-form content, detail panels |

### Example Usage

```css
.page-title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  color: var(--color-text-primary);
}

.body-copy {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--weight-regular);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
```

---

## 5. Spacing Scale

All spacing uses a 4px base unit. Never write arbitrary pixel values — always use a token.

| Token | Value | Common Use |
|---|---|---|
| `--space-1` | 4px | Icon gaps, micro padding |
| `--space-2` | 8px | Tag internal padding, tight gaps |
| `--space-3` | 12px | List item gaps, label-to-input gap |
| `--space-4` | 16px | Standard padding, card inner gap |
| `--space-5` | 20px | Section padding, form group gap |
| `--space-6` | 24px | Card inset padding |
| `--space-8` | 32px | Card outer padding |
| `--space-10` | 40px | Large button padding |
| `--space-12` | 48px | Page section gaps |
| `--space-16` | 64px | Layout section separation |
| `--space-20` | 80px | Hero-level vertical rhythm |

---

## 6. Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 6px | Input fields, small elements |
| `--radius-md` | 12px | Select dropdowns, small cards |
| `--radius-lg` | 20px | Card insets, inner panels |
| `--radius-xl` | 28px | Main cards, modal panels |
| `--radius-pill` | 9999px | **All buttons**, tags, chips, badges |

> **Rule:** Buttons are always pill-shaped (`border-radius: var(--radius-pill)`). This is non-negotiable and core to the brand's friendly, action-oriented feel.

---

## 7. Shadows

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | Subtle lift on cards at rest |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` | Cards on hover, dropdowns |
| `--shadow-lg` | `0 10px 32px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.05)` | Main cards, modals |
| `--shadow-xl` | `0 20px 48px rgba(0,0,0,0.12)` | Popovers, overlays |
| `--shadow-yellow` | `0 4px 20px rgba(245, 197, 24, 0.35)` | Primary CTA buttons |

---

## 8. Transitions & Animations

### Timing Tokens

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* most UI interactions */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);    /* page-level transitions */

--duration-fast:   150ms;   /* hover states, color changes */
--duration-base:   220ms;   /* button interactions, card hover */
--duration-slow:   350ms;   /* entry animations, page loads */
```

### Animation Classes

```css
/* Fade up from below — use for cards and content entering the page */
.animate-fade-up {
  animation: fadeSlideUp var(--duration-slow) var(--ease-out) both;
}

/* Scale pop — use for modals and important UI appearing */
.animate-pop {
  animation: scalePop var(--duration-slow) var(--ease-out) both;
}

/* Stagger delays — chain with animate-fade-up for sequential reveals */
.delay-1 { animation-delay: 60ms; }
.delay-2 { animation-delay: 120ms; }
.delay-3 { animation-delay: 180ms; }
.delay-4 { animation-delay: 240ms; }
```

### Example — Staggered card entry

```html
<div class="card animate-fade-up delay-1">First card</div>
<div class="card animate-fade-up delay-2">Second card</div>
<div class="card animate-fade-up delay-3">Third card</div>
```

---

## 9. Page Background System

Every full-page view uses `.page-bg` as its outermost wrapper. This creates the signature warm, illustrated background feel.

### HTML Structure

```html
<div class="page-bg">
  <!-- Decorative light blobs -->
  <div class="page-bg__blob page-bg__blob--1"></div>
  <div class="page-bg__blob page-bg__blob--2"></div>
  <div class="page-bg__blob page-bg__blob--3"></div>

  <!-- Optional: illustrated landscape SVG at bottom -->
  <svg class="page-bg__scene" viewBox="0 0 1440 300" ...>
    <!-- landscape silhouettes -->
  </svg>

  <!-- All page content goes here — sits above the background -->
  <nav class="navbar">...</nav>
  <main class="page-content">...</main>
</div>
```

### CSS

```css
.page-bg {
  position: relative;
  min-height: 100vh;
  background: #FFFDF5;
  overflow: hidden;
}

/* Soft yellow radial blob — positions defined per variant */
.page-bg__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  opacity: 0.4;
}
.page-bg__blob--1 { /* top-right */
  width: 500px; height: 500px;
  background: radial-gradient(circle, #FFE566 0%, transparent 70%);
  top: -100px; right: -100px;
}
.page-bg__blob--2 { /* bottom-left */
  width: 400px; height: 400px;
  background: radial-gradient(circle, #FFD700 0%, transparent 70%);
  bottom: -80px; left: -80px;
}
.page-bg__blob--3 { /* center float */
  width: 300px; height: 300px;
  background: radial-gradient(circle, #FFF3C2 0%, transparent 70%);
  top: 40%; left: 40%;
}

/* Scenic silhouette layer at the bottom — optional illustration */
.page-bg__scene {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  pointer-events: none;
  opacity: 0.18;   /* range: 0.12–0.25 depending on content density */
  z-index: 0;
}
```

> **Note:** Content inside `.page-bg` is automatically layered above the blobs via `z-index: 1`. You don't need to set `position: relative` on direct children.

---

## 10. Card Component

The card is the primary content container. It uses frosted glass backed by the warm page background.

### Variants

| Class | Description |
|---|---|
| `.card` | Default — frosted glass, large radius, full shadow |
| `.card--wide` | Wider max-width (`760px`) for multi-column content |
| `.card--flat` | Solid white, no blur — for nested/inner surfaces |
| `.card__inset` | Inner panel inside a card (e.g., course details box) |
| `.card__accent-corner` | Decorative yellow triangle in top-right corner |
| `.card__title` | Card heading — `text-xl`, bold |
| `.card__subtitle` | Card description — `text-base`, secondary color |

### HTML Example

```html
<div class="card">
  <!-- Optional decorative corner -->
  <div class="card__accent-corner"></div>

  <h2 class="card__title">Your first course</h2>
  <p class="card__subtitle">
    Your company offers Nudgeable to help you take action on
    <a href="#">Leadership</a>.
  </p>

  <!-- Inner inset panel -->
  <div class="card__inset">
    <p><strong>Duration:</strong> 45 days</p>
    <p><strong>Goal:</strong> Complete 1–2 challenges per week</p>
  </div>

  <button class="btn btn--primary btn--full">Continue</button>
</div>
```

### CSS

```css
.card {
  background: var(--color-bg-surface);     /* rgba(255,255,255,0.90) */
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: var(--radius-xl);         /* 28px */
  padding: var(--space-8);                 /* 32px */
  box-shadow: var(--shadow-lg);
  max-width: var(--max-width-card);        /* 520px */
  width: 100%;
  margin: 0 auto;
}

.card__inset {
  background: var(--color-bg-overlay);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);         /* 20px */
  padding: var(--space-5) var(--space-6);  /* 20px 24px */
}

.card__accent-corner {
  position: absolute;
  top: 0; right: 0;
  width: 56px; height: 56px;
  background: var(--bright-amber);
  border-radius: 0 var(--radius-xl) 0 var(--radius-xl);
  opacity: 0.85;
}
```

---

## 11. Buttons

All buttons share a pill shape (`border-radius: var(--radius-pill)`). Sizes and color intents vary by class.

### Variants

| Class | Color | Text | Use for |
|---|---|---|---|
| `.btn--primary` | `#FFCE00` | `#221D23` | Main page CTA (one per screen) |
| `.btn--dark` | `#221D23` | `#FFCE00` | Alternative primary on light surfaces |
| `.btn--accept` | `#23CE6B` | `#FFFFFF` | Positive confirm action |
| `.btn--decline` | Transparent | `#4A4047` | Neutral / secondary action |
| `.btn--full` | — | — | Full-width modifier, stacks with any variant |

### Size Modifiers

| Class | Padding | Font size | Use for |
|---|---|---|---|
| `.btn--sm` | `4px 16px` | 13px | Compact contexts, inside cards |
| *(default)* | `13px 32px` | 15px | Standard usage |
| `.btn--lg` | `16px 40px` | 17px | Hero CTAs |

### HTML Example

```html
<!-- Primary CTA -->
<button class="btn btn--primary btn--full">Discover my course</button>

<!-- Accept / Decline pair -->
<div style="display: flex; gap: 12px;">
  <button class="btn btn--decline">Decline</button>
  <button class="btn btn--accept">Accept</button>
</div>
```

### CSS

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body);
  font-weight: var(--weight-semibold);
  font-size: var(--text-base);
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  padding: 13px var(--space-8);
  transition:
    background var(--duration-base) var(--ease-out),
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}
.btn:active { transform: scale(0.97); }

.btn--primary {
  background: var(--bright-amber);
  color: var(--shadow-grey);
  box-shadow: var(--shadow-yellow);
}
.btn--primary:hover { background: var(--color-primary-dark); }

.btn--accept {
  background: var(--emerald);
  color: var(--white);
}
.btn--accept:hover { background: #1aaf5a; }

.btn--decline {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1.5px solid var(--color-border-strong);
}
.btn--decline:hover {
  border-color: var(--hot-fuchsia);
  color: var(--hot-fuchsia);
}

.btn--full { width: 100%; }
```

---

## 12. Tags & Chips

Tags are small pill-shaped labels used to categorize content, display time, or highlight featured items. Each tag variant maps to one brand color.

### Variants

| Class | Background | Text | Brand Color |
|---|---|---|---|
| `.tag--yellow` | Amber 16% | `#7A5F00` | Bright Amber |
| `.tag--orange` | Orange 14% | `#7A3A00` | Princeton Orange |
| `.tag--red` | Fuchsia 12% | `#8C1C24` | Hot Fuchsia |
| `.tag--blue` | Blue 13% | `#0A3D8C` | Dodger Blue |
| `.tag--green` | Emerald 13% | `#0A6632` | Emerald |
| `.tag--purple` | Purple 12% | `#2D1580` | Majorelle Blue |
| `.tag--featured` | `#FFCE00` solid | `#221D23` | Brand yellow (solid) |
| `.tag--time` | Transparent | Muted | Clock/duration display |

### HTML Example

```html
<span class="tag tag--featured">Top action</span>
<span class="tag tag--orange">Support change</span>
<span class="tag tag--purple">Foster Innovation</span>
<span class="tag tag--blue">Develop independence</span>
<span class="tag tag--time">⏱ 5 min</span>
```

### CSS

```css
.tag {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-xs);       /* 11px */
  font-weight: var(--weight-bold);
  padding: 3px var(--space-3);     /* 3px 12px */
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.tag--yellow  { background: var(--color-tag-yellow-bg);  color: var(--color-tag-yellow-text); }
.tag--orange  { background: var(--color-tag-orange-bg);  color: var(--color-tag-orange-text); }
.tag--red     { background: var(--color-tag-red-bg);     color: var(--color-tag-red-text); }
.tag--blue    { background: var(--color-tag-blue-bg);    color: var(--color-tag-blue-text); }
.tag--green   { background: var(--color-tag-green-bg);   color: var(--color-tag-green-text); }
.tag--purple  { background: var(--color-tag-purple-bg);  color: var(--color-tag-purple-text); }
.tag--featured { background: var(--bright-amber); color: var(--shadow-grey); }
.tag--time    { background: transparent; color: var(--color-text-muted); padding: 0; }
```

> **Tip:** Assign tag colors semantically — use the same color consistently for the same category across the app. For example, always use `.tag--purple` for "Foster Innovation" challenges.

---

## 13. Form Elements

### Elements

- `.form-group` — wraps label + input together
- `.form-label` — field label; add `.form-label--required` for required asterisk
- `.form-input` — text input
- `.form-select` + `.form-select-wrapper` — dropdown with custom arrow
- `.form-checkbox` — checkbox with label
- `.drag-item` — draggable priority chip (uses Majorelle Blue tint)

### HTML Example

```html
<!-- Text input -->
<div class="form-group">
  <label class="form-label form-label--required">Your name</label>
  <input type="text" class="form-input" placeholder="Enter your name…"/>
</div>

<!-- Select dropdown -->
<div class="form-group">
  <label class="form-label">Department</label>
  <div class="form-select-wrapper">
    <select class="form-select">
      <option>Finance</option>
      <option>HR</option>
      <option>Communication</option>
    </select>
  </div>
</div>

<!-- Checkbox -->
<label class="form-checkbox">
  <input type="checkbox"/> I don't have a preference.
</label>

<!-- Draggable priority item -->
<div class="drag-item">
  <span class="drag-item__handle">⠿</span> Foster Innovation
</div>
```

### CSS

```css
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.form-label {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-secondary);
}
.form-label--required::after { content: ' *'; color: var(--color-danger); }

.form-input,
.form-select {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--color-text-primary);
  background: var(--color-bg-overlay);
  border: 1.5px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  outline: none;
  appearance: none;
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}

.form-input:focus,
.form-select:focus {
  border-color: var(--bright-amber);
  box-shadow: 0 0 0 3px rgba(255, 206, 0, 0.20);
}

.drag-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-tag-purple-bg);
  color: var(--color-tag-purple-text);
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  cursor: grab;
  user-select: none;
}
```

---

## 14. Navbar

The top navigation bar is sticky and uses frosted glass, matching the card system.

### Elements

- `.navbar` — the fixed bar itself
- `.navbar__brand` — logo / app name
- `.navbar__right` — right-side slot (progress, avatar)
- `.navbar__step-label` — step name (e.g., "Your first challenge")
- `.navbar__step-bar` + `.navbar__step-bar-fill` — animated progress bar
- `.navbar__step-count` — "2/3" fraction
- `.navbar__avatar` — user avatar circle (yellow bg)
- `.back-btn` — circular back-navigation button

### HTML Example

```html
<nav class="navbar">
  <span class="navbar__brand">nudge<span style="color: var(--bright-amber)">able</span></span>
  <div class="navbar__right">
    <span class="navbar__step-label">Your first challenge</span>
    <div class="navbar__step-bar">
      <div class="navbar__step-bar-fill" style="width: 66%"></div>
    </div>
    <span class="navbar__step-count">2/3</span>
    <div class="navbar__avatar">AK</div>
  </div>
</nav>

<!-- Back button (separate, positioned in page content) -->
<button class="back-btn">←</button>
```

### CSS

```css
.navbar {
  position: sticky;
  top: 0;
  height: var(--navbar-height);   /* 60px */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-8);
  background: rgba(255, 255, 255, 0.80);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border);
  z-index: 100;
}

.navbar__brand {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-lg);
}

.navbar__step-bar {
  width: 80px; height: 4px;
  background: var(--color-bg-muted);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.navbar__step-bar-fill {
  height: 100%;
  background: var(--bright-amber);
  border-radius: var(--radius-pill);
  transition: width var(--duration-slow) var(--ease-out);
}

.navbar__avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--bright-amber);
  color: var(--shadow-grey);
  font-size: 0.75rem;
  font-weight: var(--weight-bold);
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-btn {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border-strong);
  background: var(--color-bg-surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-secondary);
  backdrop-filter: blur(8px);
  transition: background var(--duration-fast);
}
.back-btn:hover { background: var(--color-bg-muted); }
```

---

## 15. Challenge Card

The core content unit used in grids and list views. Each card represents one actionable challenge.

### Elements

- `.challenge-card` — base card
- `.challenge-card--featured` — highlighted with yellow left border
- `.challenge-card__meta` — top row: tag + time
- `.challenge-card__title` — challenge description text
- `.challenge-card__read-more` — "👁 Read more" link
- `.challenge-card__actions` — Decline + Accept button row

### HTML Example

```html
<div class="challenge-card challenge-card--featured">
  <div class="challenge-card__meta">
    <span class="tag tag--featured">Top action</span>
    <span class="tag tag--time">⏱ 1 min</span>
  </div>

  <span class="tag tag--orange" style="align-self: flex-start">Support change</span>

  <p class="challenge-card__title">
    In a meeting's agenda, differentiate between items "for information"
    and those "for discussion or decision"
  </p>

  <a class="challenge-card__read-more" href="#">👁 Read more</a>

  <div class="challenge-card__actions">
    <button class="btn btn--decline">Decline</button>
    <button class="btn btn--accept">Accept</button>
  </div>
</div>
```

### CSS

```css
.challenge-card {
  position: relative;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(10px);
  overflow: hidden;
  transition:
    box-shadow var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}
.challenge-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.challenge-card--featured {
  border-left: 4px solid var(--bright-amber);
}
.challenge-card__title {
  font-size: var(--text-md);
  font-weight: var(--weight-bold);
  line-height: var(--leading-snug);
}
.challenge-card__read-more {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.challenge-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
```

---

## 16. Detail Panel

Expanded view for challenge content. Used as a modal or page panel.

### Elements

- `.detail-panel` — white container
- `.detail-panel__title` — large challenge title
- `.detail-panel__meta` — tags + close button row
- `.detail-panel__section-title` — section header with yellow left bar
- `.detail-panel__body` — body text, lists

### HTML Example

```html
<div class="detail-panel">
  <div class="detail-panel__meta">
    <span class="tag tag--blue">Develop independence</span>
    <span class="tag tag--time">⏱ 5 min</span>
  </div>

  <h2 class="detail-panel__title">
    Ask each member of your team to send 3 successes and 1 failure of the month
  </h2>

  <div style="display: flex; gap: 12px; margin-bottom: 20px;">
    <button class="btn btn--decline">Decline</button>
    <button class="btn btn--accept">Accept</button>
  </div>

  <h3 class="detail-panel__section-title">How to do it</h3>
  <div class="detail-panel__body">
    <ul>
      <li>Initiate the request by email or a team meeting.</li>
      <li>Compile results into a slide for the next team meeting.</li>
    </ul>
  </div>

  <h3 class="detail-panel__section-title">Why is it important?</h3>
  <div class="detail-panel__body">
    <p>Celebrating milestones builds psychological safety and trust.</p>
  </div>
</div>
```

### CSS

```css
.detail-panel {
  background: var(--white);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  box-shadow: var(--shadow-lg);
  max-width: var(--max-width-content);   /* 760px */
}

.detail-panel__title {
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-snug);
  margin-bottom: var(--space-4);
}

/* Yellow left-bar section headers */
.detail-panel__section-title {
  font-size: var(--text-md);
  font-weight: var(--weight-bold);
  padding-left: var(--space-3);
  border-left: 3px solid var(--bright-amber);
  margin-top: var(--space-8);
  margin-bottom: var(--space-3);
}

.detail-panel__body {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--leading-relaxed);
}
```

---

## 17. Icon Badge

Circular icon used at the top of welcome and intro cards.

```html
<div class="icon-badge">📣</div>
```

```css
.icon-badge {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 206, 0, 0.15);
  border: 2px solid rgba(255, 206, 0, 0.30);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-5);
  font-size: 30px;
}

.icon-badge--sm {
  width: 48px;
  height: 48px;
  font-size: 22px;
  margin-bottom: var(--space-3);
}
```

---

## 18. Feature List

Used on welcome screens to highlight value propositions. Shows bullet points with the brand yellow square dot.

```html
<ul class="feature-list">
  <li class="feature-list__item">
    <span class="feature-list__bullet"></span>
    <span>Develop your skills <strong>through action</strong>, concretely.</span>
  </li>
  <li class="feature-list__item">
    <span class="feature-list__bullet"></span>
    <span>Accept <strong>challenges</strong> and achieve them with proven methods.</span>
  </li>
</ul>
```

```css
.feature-list {
  background: var(--color-bg-overlay);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.feature-list__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  line-height: var(--leading-snug);
}

.feature-list__bullet {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--bright-amber);
  margin-top: 5px;
  flex-shrink: 0;
}
```

---

## 19. Decorative Accents

Repeatable geometric shapes used as visual decoration inside or behind cards. Always `position: absolute` inside a `position: relative` parent.

### Circle

```html
<!-- Large golden circle — top-right of a card -->
<div class="deco-circle deco-circle--lg"></div>
```

```css
.deco-circle {
  position: absolute;
  border-radius: 50%;
  background: var(--bright-amber);
  opacity: 0.75;
  pointer-events: none;
}
.deco-circle--lg { width: 120px; height: 120px; top: -20px; right: -20px; }
.deco-circle--md { width: 60px; height: 60px; }
```

### Diamond

```html
<div class="deco-diamond" style="bottom: 40px; right: 30px;"></div>
```

```css
.deco-diamond {
  position: absolute;
  width: 18px; height: 18px;
  border: 2px solid var(--bright-amber);
  transform: rotate(45deg);
  pointer-events: none;
  opacity: 0.6;
}
```

---

## 20. Layout Utilities

### Page Content Wrappers

```css
/* Standard page content area — accounts for sticky navbar */
.page-content {
  padding: calc(var(--navbar-height) + var(--space-8)) var(--space-6) var(--space-12);
  max-width: var(--max-width-wide);   /* 1140px */
  margin: 0 auto;
}

/* Vertically and horizontally centered — for single-card pages */
.page-content--centered {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding-top: var(--navbar-height);
}

/* Responsive card grid */
.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}
```

### Max Width Tokens

| Token | Value | Usage |
|---|---|---|
| `--max-width-card` | 520px | Single focused card (onboarding, forms) |
| `--max-width-content` | 760px | Detail panels, readable content |
| `--max-width-wide` | 1140px | Full page layouts, grids |
| `--navbar-height` | 60px | Navbar clearance in padding/offset calculations |

---

## 21. Typography Utilities

Quick utility classes for one-off text styling without writing custom CSS.

```html
<p class="text-sm text-muted">Metadata text</p>
<h3 class="text-xl font-bold text-primary">Section title</h3>
<span class="text-accent font-semibold">Highlighted label</span>
```

| Class | Property |
|---|---|
| `.text-xs` `.text-sm` `.text-base` `.text-md` `.text-lg` `.text-xl` `.text-2xl` | `font-size` |
| `.text-primary` | `color: var(--color-text-primary)` |
| `.text-secondary` | `color: var(--color-text-secondary)` |
| `.text-muted` | `color: var(--color-text-muted)` |
| `.text-accent` | `color: var(--color-text-accent)` |
| `.font-medium` `.font-semibold` `.font-bold` | `font-weight` |
| `.text-center` `.text-left` | `text-align` |

---

## 22. Spacing Utilities

Quick layout and spacing utilities.

| Class | Property |
|---|---|
| `.mt-2` `.mt-4` `.mt-6` `.mt-8` | `margin-top` |
| `.mb-2` `.mb-4` `.mb-6` `.mb-8` | `margin-bottom` |
| `.gap-2` `.gap-3` `.gap-4` | `gap` |
| `.flex` | `display: flex` |
| `.flex-col` | `flex-direction: column` |
| `.items-center` | `align-items: center` |
| `.items-start` | `align-items: flex-start` |
| `.justify-between` | `justify-content: space-between` |
| `.justify-center` | `justify-content: center` |
| `.flex-wrap` | `flex-wrap: wrap` |
| `.flex-1` | `flex: 1` |

---

## 23. Responsive Breakpoints

| Breakpoint | Width | Changes |
|---|---|---|
| Tablet | `≤ 768px` | Cards reduce padding, single-column grid, narrow navbar padding |
| Mobile | `≤ 480px` | `.btn--full-mobile` adds full-width buttons, card radius reduces |

```css
@media (max-width: 768px) {
  .card { padding: var(--space-6) var(--space-5); border-radius: var(--radius-lg); }
  .navbar { padding: 0 var(--space-5); }
  .grid-cards { grid-template-columns: 1fr; }
  .page-content { padding-left: var(--space-4); padding-right: var(--space-4); }
  .detail-panel { padding: var(--space-6) var(--space-5); }
}

@media (max-width: 480px) {
  .btn--full-mobile { width: 100%; }
  .card { border-radius: var(--radius-md); }
}
```

---

## 24. Dark Mode

Dark mode is opt-in via `prefers-color-scheme`. Only background and text tokens change — brand colors remain the same.

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-base:        #1A1906;
    --color-bg-surface:     rgba(35, 33, 10, 0.85);
    --color-bg-overlay:     rgba(50, 47, 15, 0.70);
    --color-bg-muted:       #2A2710;
    --color-text-primary:   #F5F0D8;
    --color-text-secondary: #C5BFA0;
    --color-text-muted:     #857F60;
    --color-border:         rgba(245, 197, 24, 0.12);
    --color-border-strong:  rgba(245, 197, 24, 0.22);
  }
}
```

> Brand colors (`--bright-amber`, `--emerald`, etc.) do not change in dark mode — they stay vibrant against the dark background.

---

## 25. Do's and Don'ts

### ✅ Do

- Use `var(--token-name)` for every color, spacing, radius, and shadow value
- Use `--bright-amber` (`#FFCE00`) as the primary action color for CTAs
- Use `--emerald` for accept/success and `--hot-fuchsia` for danger/decline
- Give every button `border-radius: var(--radius-pill)` — always pill-shaped
- Use `backdrop-filter: blur(16px)` on cards over the page background
- Animate page entry with `.animate-fade-up` + stagger delays
- Use the page background system (`.page-bg` with blobs) on all full-page views
- Keep the page background color `#FFFDF5` — do not substitute another neutral

### ❌ Don't

- Hard-code hex values (`#FFCE00`) in component code — use the token
- Use square or slightly-rounded buttons — always use `--radius-pill`
- Use more than one primary yellow CTA per screen
- Place yellow text on a white background (low contrast)
- Use palette colors as large background fills (except `--shadow-grey` for dark sections)
- Add borders or shadows to elements that should appear to float — trust the frosted glass system
- Mix spacing values that don't correspond to a `--space-*` token
- Use any font other than Inter

---

*Nudgeable Design System — maintained by the Nudgeable product team.*
*For questions or contributions, open a PR or contact design@nudgeable.ai*
