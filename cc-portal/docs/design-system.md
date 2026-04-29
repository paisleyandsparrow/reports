# CC Portal — Design System

Editorial, premium aesthetic. Feels like a high-end magazine crossed with a creator dashboard. Cream base, Georgia serif headlines, warm espresso blacks, and pink accents. Every influencer — fashion, fitness, home, beauty — should want to open it.

---

## Color Palette

| Name | Hex | Usage |
|---|---|---|
| Cream (page bg) | `#fbf7f3` | Page background |
| White (card bg) | `#ffffff` | Cards, modals, popovers |
| Cream card | `#faf5ef` | Secondary cards, image placeholders |
| Espresso / warm black | `#1a1410` | Primary text, headlines, primary buttons |
| Espresso hover | `#2a1f18` | Button hover state |
| Warm muted | `#7a6b5d` | Body copy, subtitles |
| Muted light | `#a89485` | Captions, metadata, placeholder text |
| Brand pink | `#ec4899` | Eyebrow labels, accents, italic emphasis, progress bars |
| Pink blush bg | `#fdf2f8` | Pink chip backgrounds, selected states |
| Pink blush border | `#fbcfe8` | Hover borders, focus rings |
| Deep pink (text) | `#9d174d` | Pink badge text, earnings figures |
| Cream line light | `#f1ebe5` | Card borders, dividers |
| Cream line mid | `#f5ede5` | Skeleton loaders |
| Cream line dark | `#faf5ef` | Skeleton shimmer, image placeholders |

---

## Typography

### Fonts
- **Headlines & numbers:** `Georgia, serif` — weight 400–600
- **Body & UI:** `Inter, -apple-system, BlinkMacSystemFont, sans-serif`
- **Mono (IDs, ASINs):** `ui-monospace, SFMono-Regular, Menlo, monospace`

### Scale

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Page hero | Georgia | `2.8–3.2rem` | 400 | Letter-spacing `-0.03em` |
| Section headline | Georgia | `1.5–1.85rem` | 400 | Letter-spacing `-0.02em` |
| Card headline | Georgia | `1.05–1.15rem` | 400–500 | |
| Stat number | Georgia | `1.6–2.2rem` | 400–500 | Letter-spacing `-0.02em` |
| Eyebrow label | Inter | `0.66–0.72rem` | 600–700 | Uppercase, `letter-spacing: 0.18–0.2em` |
| Body | Inter | `0.88–0.95rem` | 400–500 | Line-height `1.55–1.6` |
| Caption / meta | Inter | `0.72–0.78rem` | 400 | Color `#a89485` |
| Button | Inter | `0.78–0.88rem` | 600 | Letter-spacing `0.02em` |

### Pink italic emphasis
Used in hero headlines to add personality — wrap one or two key words in `<em>` with pink color:

```jsx
<h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, color: '#1a1410' }}>
  Where your work{' '}
  <em style={{ color: '#ec4899', fontStyle: 'italic' }}>is paying off.</em>
</h1>
```

---

## Eyebrow Labels

Small all-caps labels above headlines. Always pink.

```js
{
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#ec4899',
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  marginBottom: 10,
}
```

Examples: `STEP 2 OF 5` · `YOUR CAMPAIGNS` · `ALREADY EARNING` · `ALMOST THERE`

---

## Buttons

### Primary — Espresso pill
```js
{
  background: '#1a1410',
  color: '#fbf7f3',
  border: 'none',
  borderRadius: 999,
  padding: '12px 24px',
  fontSize: '0.85rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  boxShadow: '0 14px 32px -14px rgba(26,20,16,0.4)',
  transition: 'background .15s, transform .12s',
}
// Hover:
{ background: '#2a1f18', transform: 'translateY(-1px)' }
```

### Secondary / Ghost
```js
{
  background: 'transparent',
  border: 'none',
  color: '#a89485',
  fontSize: '0.85rem',
  cursor: 'pointer',
}
// Hover: color → '#1a1410'
```

### Pill toggle group (active/inactive)
```js
// Active
{ background: '#1a1410', color: '#fbf7f3', borderRadius: 999, border: 'none' }
// Inactive
{ background: 'transparent', color: '#7a6b5d', borderRadius: 999, border: '1px solid transparent' }
// Hover inactive: color → '#1a1410'
```

---

## Cards

### Standard card
```js
{
  background: '#ffffff',
  border: '1px solid #f1ebe5',
  borderRadius: 20,
  boxShadow: '0 2px 12px rgba(26,20,16,0.04)',
}
// Hover lift:
{ boxShadow: '0 14px 32px -18px rgba(26,20,16,0.18)', transform: 'translateY(-2px)' }
```

### Espresso feature card (e.g. earnings goal)
```js
{
  background: '#1a1410',
  borderRadius: 20,
  color: '#fbf7f3',
  position: 'relative',
  overflow: 'hidden',
}
// With ambient pink bloom inside:
// <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200,
//   background:'radial-gradient(circle, rgba(251,207,232,0.15) 0%, transparent 70%)' }} />
```

### Glassmorphic sticky bar (e.g. AppHeader, filter bar)
```js
{
  background: 'rgba(251, 247, 243, 0.85)',
  backdropFilter: 'saturate(140%) blur(12px)',
  WebkitBackdropFilter: 'saturate(140%) blur(12px)',
  borderBottom: '1px solid #f1ebe5',
}
```

---

## Ambient Pink Blooms

Radial gradient decorations placed in corners of page backgrounds and feature cards. Never interactive.

```jsx
{/* Top-right bloom */}
<div style={{
  position: 'absolute', top: -180, right: -120,
  width: 480, height: 480, pointerEvents: 'none',
  background: 'radial-gradient(circle, rgba(251,207,232,0.5) 0%, rgba(251,207,232,0) 70%)',
}} />

{/* Bottom-left bloom */}
<div style={{
  position: 'absolute', bottom: -200, left: -150,
  width: 520, height: 520, pointerEvents: 'none',
  background: 'radial-gradient(circle, rgba(253,242,248,0.7) 0%, rgba(253,242,248,0) 70%)',
}} />
```

---

## Badges & Pills

### Rate badge — tiered
```js
// ≥ 25%: espresso black
{ background: '#1a1410', color: '#fbf7f3' }
// ≥ 12%: pink
{ background: '#fdf2f8', color: '#9d174d' }
// < 12%: cream
{ background: '#f5ede5', color: '#7a6b5d' }

// Base styles shared:
{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px',
  borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }
```

### Status badges
```js
// Live / active — pink blush
{ background: '#fdf2f8', color: '#9d174d', borderRadius: 999, padding: '3px 10px' }
// Expired — cream
{ background: '#f5ede5', color: '#a89485', borderRadius: 999, padding: '3px 10px' }
// Accepted — pink
{ background: '#fdf2f8', color: '#ec4899', borderRadius: 999, padding: '2px 8px' }
// Ends today — espresso
{ background: '#1a1410', color: '#fbf7f3', borderRadius: 999, padding: '2px 8px' }
```

### Category pills
Each category has its own warm color pair — bg + text. No blue, no gray. Examples:

```js
"Women's Fashion":   { bg: '#fdf2f8', color: '#9d174d' }
"Beauty & Skincare": { bg: '#fef3e7', color: '#92400e' }
"Home & Kitchen":    { bg: '#f0fdf4', color: '#166534' }
"Fitness":           { bg: '#eff6ff', color: '#1e40af' }
"Shoes":             { bg: '#faf5ff', color: '#6b21a8' }
```

---

## Form Inputs

```js
// Base
{
  width: '100%',
  border: '1px solid #f1ebe5',
  background: '#ffffff',
  borderRadius: 14,
  padding: '14px 16px',
  fontSize: '0.92rem',
  color: '#1a1410',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color .15s, box-shadow .15s',
}
// Focus
{ borderColor: '#fbcfe8', boxShadow: '0 0 0 4px rgba(251,207,232,0.35)' }
// Blur (reset)
{ borderColor: '#f1ebe5', boxShadow: 'none' }
```

### Labels
```js
{
  fontSize: '0.7rem', fontWeight: 600,
  color: '#7a6b5d',
  textTransform: 'uppercase', letterSpacing: '0.14em',
  display: 'block', marginBottom: 8,
}
```

---

## Dividers

```js
// Horizontal cream line
{ borderTop: '1px solid #f1ebe5', margin: '28px 0' }

// Vertical separator (e.g. in nav)
{ width: 1, height: 18, background: '#e8dfd6', margin: '0 10px' }
```

---

## Skeleton Loaders

Use `animate-pulse` (Tailwind) with cream tones — never gray.

```js
// Card skeleton
{ background: '#fbf7f3', border: '1px solid #f1ebe5', borderRadius: 14 }
// Image placeholder block
{ background: '#f5ede5', borderRadius: 10 }
// Text line
{ background: '#faf5ef', borderRadius: 4, height: 12 }
```

---

## Tour Popovers (driver.js)

Overrides live in `src/index.css`. Key rules:

- Popover bg: `#ffffff`, border: `1px solid #f1ebe5`, border-radius: `18px`
- Title: Georgia serif, `1.05rem`, weight 400, color `#1a1410`
- Description: Inter, `0.85rem`, color `#7a6b5d`
- Progress text: pink `#ec4899`, uppercase, `0.7rem`
- Next button: espresso pill `#1a1410` → cream text
- Prev/close: transparent, color `#a89485`
- Overlay: `rgba(26, 20, 16, 0.45)` warm tint
- No emojis in tour step titles

---

## AppHeader

Sticky, 64px tall, glassmorphic cream. Wordmark in Georgia serif left, nav links right.

- Active nav item: white pill with `border: 1px solid #f1ebe5`
- Inactive nav: `color: #7a6b5d`, transparent bg
- Sign out: `color: #a89485`, hover → `#1a1410`
- Logo: Georgia `1.15rem` + pink `PORTAL` eyebrow in `0.62rem`

---

## Page Layout Pattern

```
┌─────────────────────────────────────────────┐
│ AppHeader (sticky, 64px, glassmorphic)       │
├─────────────────────────────────────────────┤
│ Hero section                                 │
│   Pink eyebrow label                         │
│   Georgia serif headline with pink <em>      │
│   Warm muted subtitle                        │
├─────────────────────────────────────────────┤
│ Content (cream bg #fbf7f3, min-height 100vh) │
│   White cards with cream borders             │
│   Ambient pink blooms in corners             │
└─────────────────────────────────────────────┘
```

Max content width: `1400px`, padding: `0 28px`, top padding: `40px`.
