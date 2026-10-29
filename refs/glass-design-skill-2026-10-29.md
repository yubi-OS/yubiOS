# Prior Art & Design Architecture: Liquid Glass UI System (glass-design-skill)

Date: 2026-10-29
Source: prior-art-search + frontend-ui-engineering synthesis
Queries run: 4 (prior-art) + 12 (searXNG corpus dig)
Hits fetched in depth: 3

## Search anchor
How do modern web and OS interfaces engineer physically-based Liquid Glass (optical refraction, asymmetric Fresnel specular rims, multi-pass backdrop-filter frost, dual-theme WCAG 2.2 AA contrast, and tactile elevation tiers) without suffering the readability or GPU compositing failures of 2020-era glassmorphism?

## Direct competitors / equivalents
- **Apple Liquid Glass (WWDC25 / iOS 26 / macOS Tahoe)** - Unified optical meta-material across Apple platforms combining real-time lens refraction, specular rim lighting, and adaptive dimming layers. https://developer.apple.com/videos/play/wwdc2025/219/
  - Key observation: Separates navigation/controls into an elevated optical layer floating above content; switches from clear to 35% adaptive dimming over high-luminance backdrops.
- **WebTricks 5-Layer Liquid Glass CSS + SVG Architecture** - Decomposes Liquid Glass into five composable web layers: (1) Tint, (2) Blur + Saturation + Brightness, (3) Asymmetric Specular Rim, (4) Diagonal Screen Sheen, and (5) SVG feDisplacementMap Refraction. https://webtricks.dev/blog/liquid-glass-css
  - Key observation: Top inset highlight must be ~2x brighter than side/bottom rims so the pane reads as top-lit physical glass rather than a flat outlined box.
- **Kube.io Physics-Based SVG Displacement Lens** - Derives convex squircle height functions and Snell's-law displacement vector fields encoded into 8-bit R/G SVG feDisplacementMap channels (128 = neutral). https://kube.io/blog/liquid-glass-css-svg
  - Key observation: Convex squircle profiles keep refracted rays inside the bezel and avoid harsh interior edges when stretched to rectangular cards; switches use a lip profile (convex outer rim, concave inner well).
- **Hyalite & Rizroze Liquid Glass Libraries** - Single-file SVG/Canvas displacement generators with 3-channel RGB scale offsets for subtle edge chromatic dispersion. https://github.com/VII-Cae/hyalite--liquid-glass

## Failed attempts
- **Windows Vista Aero Glass (2006)** - Early DWM real-time blur+glow glass that suffered severe GPU frame drops on integrated graphics and poor title-bar text legibility over white windows, leading to its removal in Windows 8. https://interfacecafe.com/liquid-glass-design-history/
  - Key observation: Unbounded blur radii and uncalibrated text scrims caused both battery drain and unreadable chrome.
- **2020 Dribbble Glassmorphism Trend** - Naive single-layer translucency (rgba(255,255,255,0.1) + blur(20px) + uniform 1px border) that failed WCAG 2.2 4.5:1 text contrast on light backgrounds and looked like flat frosted plastic. https://axesslab.com/glassmorphism-meets-accessibility-can-frosted-glass-be-inclusive/
  - Key observation: Uniform borders lack directional Fresnel lighting, and relying on blur alone without saturation/brightness modulation or adaptive tint alpha breaks legibility in Light Mode.
- **Unscoped SVG backdrop-filter declarations** - Combining backdrop-filter: blur(10px) url(#liquid) in a single rule without @supports causes Safari and Firefox to drop the entire declaration, removing the frost fallback completely. https://webtricks.dev/blog/liquid-glass-css

## Academic / formal
- **WCAG 2.2 SC 1.4.3 (Contrast Minimum) & SC 1.4.11 (Non-Text Contrast)** - Requires >= 4.5:1 contrast for body text and >= 3.0:1 for interactive UI boundaries (buttons, switches, inputs, active tabs) against worst-case backdrop luminance. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- **MDN <feDisplacementMap> Specification** - Defines P'(x,y) = P(x + scale*(XC(x,y) - 0.5), y + scale*(YC(x,y) - 0.5)) in sRGB color-interpolation-filters space. https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap

## Adjacent / historical
- **Mac OS X Aqua (2000)** - Introduced liquid capsule buttons with internal caustic glow and top meniscus highlights. https://interfacecafe.com/liquid-glass-design-history/
- **Microsoft Fluent Acrylic & Mica (2017-2021)** - Introduced noise-grain texture overlays, luminosity blend passes, and single-pass wallpaper sampling for GPU efficiency. https://fluent2.microsoft.design/

## What this means for glass-design-skill and /jev/

### 1. Five-Layer Optical Material Stack
Every Liquid Glass surface in glass-design-skill composes five explicit layers:
1. **Adaptive Tint & Luminosity Scrim:** Dual-palette CSS custom properties tuned separately for Dark Mode (obsidian-cyan/violet refractive wash, alpha 0.42-0.62) and Light Mode (high-albedo pearl wash, alpha 0.68-0.86, with subtle slate bottom shadow so white-on-white never vanishes).
2. **Optical Frost Pipeline:** Multi-stage backdrop-filter combining blur(12px-18px), saturate(175%-190%), and brightness(1.06-1.12) in Dark Mode / contrast(1.03) in Light Mode, with progressive @supports (backdrop-filter: url(#jev-liquid-lens)) SVG refraction.
3. **Asymmetric Fresnel Specular Rim:** Multi-stop inset box-shadow stack where top incident light (inset 0 1px 0.5px rgba(255,255,255,0.62) dark / 0.95 light) is 2.5x stronger than lateral edges, paired with a bottom caustic reflection (inset 0 -1px 1px rgba(95,217,242,0.18) dark / rgba(15,23,42,0.08) light).
4. **Diagonal Meniscus Sheen:** A pointer-events: none ::before/::after pseudo-element with a 135deg specular linear-gradient and radial cursor-proximal caustic glow.
5. **Inline SVG Displacement Filter (#jev-liquid-lens):** A zero-dependency inline SVG filter using low-frequency fractalNoise + feGaussianBlur + feDisplacementMap (scale 6-10, color-interpolation-filters="sRGB") applied selectively to elevated chrome (dock bar, primary pills, switches, modal dialogs) behind @supports.

### 2. Five-Tier Elevation Hierarchy (Lifting Every Control)
- **Tier 0 (Backdrop Canvas):** Standard subtle gradient, Dynamic Textured Caustic Mesh (1st Alt+Click on theme button), or User Custom Full-Screen Wallpaper (2nd Alt+Click upload dialog, background-size: cover; background-position: center; background-attachment: fixed).
- **Tier 1 (Section & Drawer Cards - .sec.drawer, .h2-inspector):** Thick refractive slab, 18px radius, multi-stop Fresnel rim, soft ambient drop shadow, top meniscus sheen.
- **Tier 2 (Inner Cards & Sub-Panels - .card, .kpi, .pol-ctrl-card, .ap-card, .chat-card, .chat-starter, .funnel-strip):** Nested convex lens cards with crisp border luminance and hover lift (translateY(-1.5px)).
- **Tier 3 (Interactive Controls - Buttons, Switches, Tabs, Menus, Inputs):**
  - **Buttons (button, .ghost, .primary, .danger, .sec-toggle, .dock-btn):** Capsule/squircle geometry, top specular meniscus, inner caustic glow on .primary, tactile press compression (scale(0.985)) on :active.
  - **Switches (.sw-switch, .sw-track, .sw-knob):** Lip-bezel recessed glass trough (.sw-track) with a convex liquid-mercury/pearl thumb (.sw-knob) that slides with cubic-bezier(0.22, 1, 0.36, 1) and blooms emerald/violet when checked.
  - **Tabs (.composer-seg, .diagtab, .diag-cat, .chat-mode):** Recessed glass well container (.composer-bar, .chat-mode-bar, .diag-cat-bar) with a floating refractive pill indicator on the active tab.
  - **Menus & Inputs (select, input, textarea, .chat-composer):** Concave optical well with crisp focus ring and high-contrast typography.
- **Tier 4 (Floating Modals & Tooltips - dialog.cmdk, dialog.chat-h2-modal, #chat-wayfinder-tooltip, #bg-upload-dialog):** Deepest blur (24px), strongest Fresnel rim, and ambient chromatic aura.

## Sources
- https://webtricks.dev/blog/liquid-glass-css
- https://kube.io/blog/liquid-glass-css-svg
- https://axesslab.com/glassmorphism-meets-accessibility-can-frosted-glass-be-inclusive/
- https://developer.apple.com/videos/play/wwdc2025/219/
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
