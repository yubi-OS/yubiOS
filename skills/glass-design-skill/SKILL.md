---
name: glass-design-skill
description: "Engineers physically-based Liquid Glass user interfaces across Dark and Light modes: 5-layer optical material stack (adaptive tint scrim, multi-pass backdrop-filter blur+saturation+brightness, asymmetric Fresnel specular inset rims, diagonal meniscus sheen, and progressive SVG feDisplacementMap refraction), 5-tier tactile elevation for cards, sections, buttons, lip-bezel switches, segmented tabs, menus, and dialogs, WCAG 2.2 AA contrast enforcement, and dynamic textured or user-uploaded full-bleed backdrops. Triggers on 'liquid glass', 'glassmorphism', 'glass-design-skill', 'frosted glass UI', 'refractive UI', 'specular rim', 'liquid glass redesign'."
---

# Glass Design Skill

## Overview

Engineers production-grade **Liquid Glass** interfaces grounded in physical optics rather than naive 2020-era single-layer translucency. Every surface behaves like a curved, top-lit optical meta-material with five distinct layers: an adaptive luminance tint, a multi-stage `backdrop-filter` frost (`blur` + `saturate` + `brightness`/`contrast`), an asymmetric Fresnel specular rim (`inset` box-shadow stack), a diagonal meniscus sheen, and progressive SVG `feDisplacementMap` edge refraction.

## When to Use

- Redesigning or building a web application, console, or component library in the **Liquid Glass** aesthetic.
- Lifting flat or basic translucent cards, sections, buttons, switches, tabs, menus, inputs, and dialogs into a cohesive optical hierarchy.
- Engineering dual-theme (Dark Mode + Light Mode) translucent surfaces that preserve WCAG 2.2 AA contrast (`>= 4.5:1` body text, `>= 3.0:1` UI boundaries) over arbitrary or dynamic backgrounds.
- Adding dynamic caustic/textured backgrounds and custom full-bleed user wallpaper upload flows designed to showcase optical refraction.

## Five-Layer Optical Material Stack

Every Liquid Glass surface is constructed from five composable layers:

| Layer | Optical Role | CSS / SVG Implementation |
|---|---|---|
| **1. Adaptive Tint Scrim** | Establishes surface albedo and guarantees WCAG 2.2 AA text legibility against worst-case background luminance | Dark: `linear-gradient(165deg, rgba(18, 25, 56, 0.62), rgba(10, 14, 34, 0.48))`; Light: `linear-gradient(165deg, rgba(255, 255, 255, 0.82), rgba(244, 247, 254, 0.68))` |
| **2. Optical Frost & Saturation** | Scatters background rays and boosts chromatic vibrancy so the pane reads as thick glass rather than gray film | `backdrop-filter: blur(16px) saturate(185%) brightness(1.08)` (Dark) / `blur(18px) saturate(160%) contrast(1.03)` (Light) |
| **3. Asymmetric Fresnel Specular Rim** | Simulates overhead incident light hitting a polished bevel: top highlight is 2.5x brighter than side edges, paired with a bottom caustic reflection | `box-shadow: 0 14px 38px -10px rgba(2, 6, 23, 0.55), inset 0 1.2px 0.5px rgba(255, 255, 255, 0.52), inset 0 -1px 1px rgba(95, 217, 242, 0.18), inset 1px 0 0.5px rgba(255, 255, 255, 0.16), inset -1px 0 0.5px rgba(255, 255, 255, 0.16)` |
| **4. Diagonal Meniscus Sheen** | Adds a soft 135-degree surface reflection across the upper-left quadrant without washing out foreground text | `::before` pseudo-element with `linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 32%, transparent 62%)`, `pointer-events: none` |
| **5. SVG Lens Refraction** | Warps backdrop pixels along bezel normals via Snell's law (`n = 1.5`) in Chromium while degrading cleanly in Safari/Firefox | Inline `<svg><filter id="liquid-glass-lens">` with `feTurbulence` + `feGaussianBlur` + `feDisplacementMap`, gated inside `@supports (backdrop-filter: url('#liquid-glass-lens'))` |

## Dual-Theme Design Tokens (Dark & Light Mode)

Never reuse dark-mode white alphas on a light background. Light mode requires higher tint opacity (`0.68-0.86`), a crisp pure-white top specular rim (`rgba(255,255,255,0.96)`), and a cool slate outer/bottom edge (`rgba(15,23,42,0.12)`) so every glass boundary meets the 3:1 non-text contrast floor:

```css
:root {
  --lg-blur-card: 16px;
  --lg-blur-ctrl: 12px;
  --lg-blur-modal: 24px;
  --lg-sat: 185%;
  --lg-surface-1: linear-gradient(165deg, rgba(19, 27, 62, 0.60) 0%, rgba(11, 16, 38, 0.46) 100%);
  --lg-surface-2: linear-gradient(165deg, rgba(26, 36, 78, 0.54) 0%, rgba(14, 20, 46, 0.40) 100%);
  --lg-ctrl-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%);
  --lg-ctrl-hover: linear-gradient(180deg, rgba(255, 255, 255, 0.20) 0%, rgba(95, 217, 242, 0.10) 100%);
  --lg-rim-border: rgba(255, 255, 255, 0.18);
  --lg-rim-shadow:
    0 16px 40px -12px rgba(2, 6, 23, 0.62),
    0 2px 10px rgba(0, 0, 0, 0.28),
    inset 0 1px 0.5px rgba(255, 255, 255, 0.50),
    inset 0 -1px 1px rgba(95, 217, 242, 0.16),
    inset 1px 0 0.5px rgba(255, 255, 255, 0.14),
    inset -1px 0 0.5px rgba(255, 255, 255, 0.14);
  --lg-sheen: linear-gradient(135deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.04) 30%, transparent 60%);
}

html[data-theme="light"] {
  --lg-sat: 165%;
  --lg-surface-1: linear-gradient(165deg, rgba(255, 255, 255, 0.78) 0%, rgba(244, 247, 254, 0.64) 100%);
  --lg-surface-2: linear-gradient(165deg, rgba(255, 255, 255, 0.86) 0%, rgba(248, 250, 255, 0.72) 100%);
  --lg-ctrl-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(241, 245, 249, 0.72) 100%);
  --lg-ctrl-hover: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(237, 233, 254, 0.85) 100%);
  --lg-rim-border: rgba(255, 255, 255, 0.85);
  --lg-rim-shadow:
    0 14px 34px -10px rgba(15, 23, 42, 0.12),
    0 2px 6px rgba(15, 23, 42, 0.06),
    0 0 0 1px rgba(15, 23, 42, 0.08),
    inset 0 1.5px 0.5px rgba(255, 255, 255, 0.98),
    inset 0 -1px 1px rgba(15, 23, 42, 0.06);
  --lg-sheen: linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.18) 32%, transparent 62%);
}
```

## Component Elevation Taxonomy

1. **Sections & Drawer Cards (`.sec.drawer`, `.h2-inspector`):**
   - Use `--lg-surface-1`, `backdrop-filter: blur(var(--lg-blur-card)) saturate(var(--lg-sat))`, `border-radius: 18px`, and `--lg-rim-shadow`.
   - Attach a top-edge meniscus highlight (`::before`) that spans 85% of the width and fades at the corners.
2. **Nested Cards & KPI Tiles (`.card`, `.kpi`, `.pol-ctrl-card`, `.ap-card`, `.chat-card`, `.chat-starter`):**
   - Use `--lg-surface-2`, `border-radius: 14px`, and an interactive hover lift (`transform: translateY(-1.5px)`) that brightens the top Fresnel highlight and adds a subtle cyan/violet caustic edge.
3. **Buttons (`button`, `.ghost`, `.primary`, `.danger`, `.sec-toggle`, `.dock-btn`):**
   - Pill or squircle geometry with `--lg-ctrl-bg`, `backdrop-filter: blur(var(--lg-blur-ctrl)) saturate(180%)`, top specular rim `inset 0 1px 0.5px rgba(255,255,255,0.65)`, and tactile compression (`transform: translateY(0.5px) scale(0.985)`) on `:active`.
   - Primary buttons (`.primary`) layer an internal luminous plasma gradient under a glassy specular meniscus.
4. **Switches (`.sw-switch`, `.sw-track`, `.sw-knob`):**
   - Lip-bezel geometry: `.sw-track` is a concave recessed glass trough (`inset 0 2px 4px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.18)`), and `.sw-knob` is a convex liquid-glass lens with a bright top specular dome that slides with spring physics.
5. **Segmented Tabs & Docks (`.workspace-dock`, `.composer-bar`, `.chat-mode-bar`, `.diag-cat-bar`, `.diag-nav`):**
   - Outer bar is a recessed optical channel; active tab (`[data-active="true"]`, `[aria-expanded="true"]`, `[aria-selected="true"]`, `[aria-checked="true"]`) lifts into a raised convex liquid-glass lens pill with a specular rim and subtle chromatic glow.
6. **Menus, Selects & Inputs (`select`, `input`, `textarea`, `.chat-composer`):**
   - Recessed optical well with high-contrast text, crisp top-inner shadow, and a refractive focus halo (`0 0 0 3px rgba(95, 217, 242, 0.24)`).

## Dynamic Textured & Custom Wallpaper Backdrop Protocol

Liquid Glass requires spatial luminance and color variation behind the panes so refraction and blur have high-frequency detail to bend. Every Liquid Glass surface supports a 3-state backdrop controller bound to `Alt+Click` on the theme toggle button (alongside `Click` for Light/Dark and `Shift+Click` for System):

1. **Default Backdrop (`data-bg-mode="default"`):** Ambient multi-stop radial gradient tuned per theme.
2. **Dynamic Textured Glass Backdrop (`1st Alt+Click` -> `data-bg-mode="dynamic"`):** Activates a multi-layered animated caustic mesh + procedural SVG fractal-noise grain + floating chromatic orbs (tuned for both Dark and Light modes) behind the glass layers so every card border and scrolling edge visibly refracts.
3. **Custom Full-Screen Wallpaper Upload Dialog (`2nd Alt+Click` when `dynamic` or `custom` is active -> `data-bg-mode="custom"`):** Opens a Liquid Glass upload dialog prompting the user to select an image file (or preset/URL/reset), reads it as a Data URL / Object URL, and applies it to the viewport canvas with `background-size: cover; background-position: center; background-repeat: no-repeat; background-attachment: fixed;` plus an adaptive legibility scrim so foreground cards remain WCAG 2.2 AA compliant.

## Accessibility & Performance Guardrails

- **WCAG 2.2 AA Contrast:** Never rely on `backdrop-filter: blur()` alone for text readability. Pair every glass surface with a calibrated tint alpha and subtle text-shadow or adaptive contrast scrim.
- **Reduced Transparency & Motion:** Honor `@media (prefers-reduced-transparency: reduce)` by raising surface opacity to `>= 0.94` and disabling `backdrop-filter`. Honor `@media (prefers-reduced-motion: reduce)` by pausing dynamic backdrop animations.
- **GPU Compositor Budget:** Keep `blur()` radii within `10px-24px`, gate SVG `url(#liquid-glass-lens)` inside `@supports (backdrop-filter: url('#liquid-glass-lens'))`, and avoid applying SVG displacement to hundreds of tiny list rows simultaneously.

## Examples

**Worked setup** — applying the 5-layer Liquid Glass stack and dual-theme tokens to a console surface:

- Define `--lg-*` custom properties on `:root` and `html[data-theme="light"]`, mount the hidden inline `<svg><filter id="liquid-glass-lens">` at the top of `<body>`, and apply the 5-tier elevation classes to cards, drawers, buttons, switches, tabs, and menus.
- Wire `#theme-toggle` so `Click` toggles Dark/Light, `Shift+Click` resets to system theme, `1st Alt+Click` enables `data-bg-mode="dynamic"`, and `2nd Alt+Click` opens `#bg-upload-dialog` to fit a custom user image to screen.

**In-repo touchpoints** — sections this skill owns or extends: Overview, When to Use, Five-Layer Optical Material Stack, Dual-Theme Design Tokens, Component Elevation Taxonomy, Dynamic Textured & Custom Wallpaper Backdrop Protocol.

**Boundary case** — when a request asks only for a static CSS color gradient without translucent glass layers, route to `gradiate` instead of `glass-design-skill`.

## Guidelines

1. Always make the top inset specular highlight at least 2x brighter than lateral edges so panes read as top-lit physical glass rather than flat outlined boxes.
2. Always tune Light Mode and Dark Mode glass tokens separately; Light Mode requires higher surface opacity (`0.68-0.86`), a pure-white top rim, and a subtle dark outer/bottom border (`rgba(15,23,42,0.08-0.14)`).
3. Always gate `backdrop-filter: url(#liquid-glass-lens)` inside `@supports` so Safari and Firefox preserve the frosted blur+saturation stack.
4. Always provide `@media (prefers-reduced-transparency: reduce)` and `@media (prefers-reduced-motion: reduce)` fallbacks.

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.

## Verification

- [ ] Cards, sections, buttons, switches, tabs, menus, and dialogs all carry asymmetric Fresnel inset rims and multi-pass `backdrop-filter`.
- [ ] Both Dark Mode and Light Mode pass visual inspection and maintain >= 4.5:1 text contrast and >= 3:1 control boundary contrast.
- [ ] `Alt+Click` on the theme toggle activates the dynamic textured background, and a second `Alt+Click` opens the custom background upload dialog fitted to screen (`background-size: cover`).

## Changelog

- **2026-10-29 v1.0.0**: Initial release of `glass-design-skill` synthesized from `frontend-ui-engineering` and the 2026-10-29 Liquid Glass prior-art search + 48-result Clef-weighted `yubi-OS/knowledge` corpus mint.
