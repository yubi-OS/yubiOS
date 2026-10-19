---
name: gradiate
description: "Build a layered CSS background gradient with the Steady Orbit Gradient Designer at steadyorbitsystems.com/radiant/, then output the CSS and a copy-out agent prompt. Use when someone asks for a gradient background, wants gradient colors layered or tuned, wants a gradient that fades toward the center, or asks for CSS or a prompt to restyle a page background. Triggers on: gradiate, gradient designer, background gradient, layered gradient, fade to center, copy agent prompt."
---

# Gradiate

Make page-background gradients with the designer's own CSS and prompt code. The generator reads the designer page at run time, so its output matches what the page itself would copy.

## When to use

- A page or component needs a gradient background, and the user wants it layered, tuned, or faded toward the center.
- The user wants CSS plus a copy-out prompt that another agent can apply.
- The user wants to replace a grid, a flat color, or a radial effect on a page background.

## Where the designer lives

- Working URL: https://steadyorbitsystems.com/radiant/. The same page also serves at https://steady-orbit.systems-a.workers.dev/radiant/.
- https://steadyorbitsystems.com/gradiant/ returns 404. Use /radiant/.
- The generator fetches the page, reads its component script, and runs the designer's buildCss and buildPrompt functions. Set GRADIATE_DESIGNER_URL to point at another copy of the page.

## Workflow

1. Pick two or three colors from the target UI's tokens. Four is the limit.
2. Use linear layers unless the user asks for radial. To fade toward the center, give each layer alpha at 0%, alpha 0 at 50%, and alpha at 100%. Stack a horizontal band and a vertical band to get a frame that fades to the middle.
3. Keep edge alpha low when text sits on the gradient. Alpha 0.4 on the edges kept page text readable. Alpha 0.85 to 0.9 was too loud. Estimate contrast against the text color before shipping, then check the real page. For example, #E7EAF6 text over a 0.4 cyan edge on #0B1026 is roughly 5.7:1 by color math, not measured on the page.
4. Write a JSON spec (see Examples) and run the generator. It prints the CSS and the prompt. With --out DIR it also writes gradient.css and prompt.md.
5. Apply the CSS to the page background. On a scrolling page add background-repeat: no-repeat and background-size: 100% 100%. Without them the gradient tiles and leaves a seam at each viewport height.
6. Check the result in a real browser. Read the computed background-image and confirm it is not none. A declaration with a missing semicolon is dropped silently, and that takes the whole background with it.
7. Measure any control you changed with getBoundingClientRect(). Judge the look with fixed overlays hidden, because dialogs and fixed bars dim screenshots.

## Examples

Edge-fade band, horizontal violet to cyan and vertical amber to violet, faded to the center (examples/edge-fade.json):

```bash
node scripts/gradiate.mjs examples/edge-fade.json --sel .gradient-bg --out out/
```

Output CSS:

```css
.gradient-bg {
  background-color: #0B1026;
  background-image:
    linear-gradient(90deg, #DB46F566 0%, #DB46F500 50%, #5FD9F266 100%),
    linear-gradient(180deg, #FFC85766 0%, #FFC85700 50%, #DB46F566 100%);
}
```

Print a starter spec: `node scripts/gradiate.mjs --sample`.

## Guidelines

1. Run the generator instead of hand-writing CSS. Hand edits drop semicolons and drift from the designer's format.
2. Keep colors, stop positions, angles, and layer order as generated. The first layer is the top layer.
3. The prompt targets .gradient-bg by default. Pass --sel to match the element you will style.
4. Verify in a browser before you report success. A page that still renders says nothing about whether the new CSS applied.
5. If text is hard to read, lower the alpha first. Change the text color only when the gradient is already faint.
6. Don't add background-attachment: fixed unless asked.
