# Design system: Darkfield

The single source of truth for the visual and motion language of this portfolio. Every color, size and timing in `index.html` comes from the tokens below (they live in the `:root` block at the top of the page's `<style>`).

## Theses

**Visual.** A darkfield-microscope bench: a near-black ground with a faint green bias, bone-white type, one warm "halogen lamp" accent for anything you can act on, and three fluorescence channels (host blue, network green, auth magenta) used only inside the live specimens. An editorial serif carries the name and headings, a plain grotesk carries reading text, and a mono carries data. Spacing is airy on a 4px base. Components are flat with hairline borders and 3px corners; the only "objects" with depth are the lens and the glass slides.

**Interaction.** Calm and precise. Micro-interactions take 140ms, UI changes 240ms, reveals 700ms with an expo ease-out and a 70ms stagger. Hover fills buttons with the lamp color from the left, lifts a slide by 3px and speeds its specimen up. Scroll reveals are tied to scroll position (no hidden content waiting on a script). The hero opens once like a microscope iris and pulls focus. **Never:** bounce or elastic easing, scroll-jacking, glitch or matrix effects, typewriter text, custom cursors, 3D tilt cards, infinite marquees, motion that ignores reduced-motion.

## Tokens

| Group | Token | Value | Use |
|---|---|---|---|
| Color | `--ground` | `#060908` | Page background (darkfield) |
| | `--stage` / `--stage-2` | `#0C1110` / `#121917` | Raised surfaces, slide glass |
| | `--hair` / `--hair-2` | `#1F2826` / `#2C3734` | Hairline borders |
| | `--bone` | `#E9EEE9` | Primary text |
| | `--mute` | `#A2ADA8` | Secondary text (8.6:1 on ground) |
| | `--faint` | `#7D8A85` | Labels, captions (5.6:1 on ground, 4.7:1 on the frosted label) |
| | `--lumen` / `--lumen-ink` | `#F0D29A` / `#1A1408` | Accent: actions, focus, immune response |
| Channels | `--ch-host` | `#7C9CFF` | Devices (like a DAPI stain) |
| | `--ch-net` | `#4FE3A1` | Network signal |
| | `--ch-auth` | `#F25CCF` | Auth signal, anomalies |
| | `--ch-merge` | `#FFF3D1` | Both signals overlap: confirmed |
| Projects | `--c-apis` `--c-mcp` `--c-animal` `--c-solar` | `#4FE3A1` `#B79BFF` `#FFB547` `#5BD6FF` | One fluorophore per project: frosted slide label, metric ticks, signal names, hover glow |
| | `--c-sos` `--c-scam` `--c-phish` `--c-ai` | `#FF8A5C` `#7C9CFF` `#F25CCF` `#F0D29A` | |
| Type | `--f-display` | Newsreader | Name, headings, serif italics |
| | `--f-body` | Hanken Grotesk | Reading text, buttons |
| | `--f-mono` | IBM Plex Mono | Data, labels, specimen tags |
| Scale | | 12 / 13 / 15 / 17 / 20 / 26 / clamp(36–56) / clamp(64–150) px | |
| Space | `--s-1`…`--s-9` | 4 8 12 16 24 32 48 72 112 px | |
| Radius | `--r-1` / `--r-2` | 3px / 6px | Controls / slides |
| Motion | `--d-micro` `--d-ui` `--d-reveal` | 140ms / 240ms / 700ms | |
| | `--e-out` | `cubic-bezier(.16,1,.3,1)` | Enter, reveal |
| | `--e-in` | `cubic-bezier(.4,0,1,1)` | Exit |
| | `--e-move` | `cubic-bezier(.65,0,.35,1)` | State-to-state |
| | `--stagger` | 70ms | |

## Components

- **Button**: 44px tall, hairline border, lamp fill sweeps in from the left on hover; `.primary` is filled. Focus: 2px lamp outline, 3px offset.
- **Lens**: circular canvas inside a graduated focus ring that turns with the focus value.
- **Slide**: glass slide with a frosted label end tinted in the project's color and a cover-slip outline over the live specimen. The featured slide keeps the real 3:1 shape of a 75×25 mm slide; half-width slides use 2.4:1 and phones 2.1:1 so the specimen stays readable.
- **Readout**: mono label over a serif number with tabular figures.
- **Examine dialog**: native `<dialog>` with a live full-size copy of a specimen, a color legend and numbered steps (the steps are a real sequence). Opens with `@starting-style` fade and lift, closes on Esc or backdrop click.
- **Attack control**: clicking a host in the hero lens (or the Launch button) restarts the APIS cycle with that host as the intruder.
- **Print**: a white, two-column CV layout; canvases, navigation and buttons are hidden and link URLs are printed.
- **404**: `404.html`, an empty microscope slide in the same tokens.

## Motion rules in code

- **Ambient field**: a fixed canvas behind the page, drawn at half resolution and 30 fps. Four slow color blooms take three channels from the `data-tint` of the section in view and blend over ~1 s; drifting particles move with a little scroll parallax.
- **Section sweep**: a short line of the section's color (`--sc`) travels along each section's top border every 9 s.
- **Glass highlight**: a specular spot follows the pointer across each slide.
- **Focus pull**: on load the name and intro come into focus (blur 14px → 0) as the lens iris opens.
- **Scroll progress**: a 2px line under the navigation in the six project colors, scaled by scroll position.
- **APIS honeycomb**: the nine layers light up in order, 0.6 s apart, on a 7.2 s loop.

- All canvases run on one `requestAnimationFrame` loop, only while on screen, and stop when the tab is hidden.
- `prefers-reduced-motion` or the "Pause motion" button draws one still frame per specimen and disables reveals.
- Only `transform`, `opacity` and `clip-path` are animated in CSS.
