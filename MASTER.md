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
| | `--faint` | `#8A9792` | Labels, captions (6.6:1 on ground, still 4.5:1 or better over the brightest ambient glow) |
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
- **Skills key**: six project buttons (one per fluorophore). Each skill carries a dot for every project that uses it in code you can read; picking a project lights its skills and fades the rest to `--faint`. Networking carries a CCNA tag instead.
- **Brand mark**: the lens with two stains (network and auth). The stains drift toward each other every 6 s, the cream "merged" dot brightens when they meet, and they merge on hover, the APIS idea in 22 px.
- **Print**: a white, two-column CV layout; canvases, navigation and buttons are hidden and link URLs are printed.
- **404**: `404.html`, an empty microscope slide in the same tokens.

## Intro film

A 33-second title sequence plays on a visitor's first visit in a session, cut to an original 124 BPM soundtrack (`intro.mp3`, composed and rendered for the site): smooth melodic house with gliding bass, warm pads and electric-piano stabs, a breakdown under the galaxy, and a build that drops on the name. It is drawn live on one full-screen canvas, one scene per musical phrase, paced so every number and project stays on screen about 1.5 s: power on, the thesis, APIS, lateral movement, measured results, method, builds, credentials, the name, and the hand-off.

- **Gate**: browsers only allow sound after a click, so the film opens on a quiet title card with **Play the intro** and **Skip to the portfolio**. Esc skips at any point.
- **Clock**: the music drives the picture. The film reads the audio position every frame, so every cut lands on its beat; if sound is blocked or fails, it runs on its own clock.
- **Sound design**: every animation has its own sound, rendered into the same track from the film's timing formulas, tuned to the key and panned to where it happens. The palette is soft (glass, marimba, kalimba, music box, harp, felt, air and pad textures, no clicks or square beeps), and each scene has its own: a glass tone that rises as the lens draws and falls home when the hero lens draws at the end; a falling marimba run for NETWORK, a warm gold chord for DEFENSES, an air glide for MODELED ON, a breath and a water drop for living systems.; a warm hive hum and spreading kalimba notes under the honeycomb, soft warbles for anomaly signals, a turn and a rising glass tone for 79.2%; plucked hops, a felt seal and a resolved chord for CONFIRMED; a music-box fill for 236 tests, plucked and muffled envelopes for 9/12, a charge-up for 340 ms and a power-down for the energy bar; a turning swirl and a gathering swell for the galaxy; night-road wind, sunlight, deep space with a laser, and data-flow mallets with wooden knocks for the projects; a different timbre for each credential; a harp note for each letter of the name; and a breath as the page opens.
- **Hand-off**: the name flies into the hero heading (900 ms, `--e-move`) while a lens ring draws over the real hero lens, then the page opens from that lens like an iris and the hero's normal entrance plays.
- **Replay**: the **Play intro** button in the navigation plays it again (it scrolls to the top first).
- **Honesty**: every number in the film is one the site already states (79.2%, 96% · 166 of 173, 236 tests, 9/12 with 0 false alarms, ~340 ms per frame, 6,300 J → 2,004 J simulated).
- **Who sees it**: not shown with reduced motion, after "Pause motion", to links with a `#section`, to crawlers and test tools, or again in the same browser session. `?intro=1` forces it and `?intro=0` turns it off.
- **Loading**: the film is `intro.js`, fetched only when the intro shows or when someone presses Play intro, so a normal page load does not pay for it.

## Motion rules in code

- **Ambient field**: a fixed canvas behind the page, drawn at half resolution and 30 fps. Four slow color blooms (peak alpha .12, so small labels keep 4.5:1) take three channels from the `data-tint` of the section in view and blend over ~1 s; drifting particles move with a little scroll parallax.
- **Section sweep**: a short line of the section's color (`--sc`) travels along each section's top border every 9 s.
- **Glass highlight**: a specular spot follows the pointer across each slide.
- **Focus pull**: on load each letter of the name rises into focus (blur 12px → 0, 45 ms apart, left to right) as the lens iris opens. Once it settles, one pass of lamp light crosses the name (1.6 s, once).
- **Navigation**: a single lamp-colored line glides between links (340 ms, `--e-move`) to the section in view, and previews the link under the pointer or keyboard focus.
- **Headings**: section titles wipe in from the left and clear a 6 px blur as they go, tied to scroll.
- **Examine**: the specimen grows out of its slide into the dialog and shrinks back on close (View Transitions, 480 ms expo-out); without support, or with reduced motion, the dialog simply fades.
- **Cards**: the pointer light used on the glass slides also lights the smaller cards and the certificate cards.
- **Certificates**: each validity bar fills to the real share of time used when it comes into view (1.4 s).
- **Timeline**: only the current role pulses; past roles hold a steady dot.
- **Scroll progress**: a 2px line under the navigation in the six project colors, scaled by scroll position.
- **APIS honeycomb**: the nine layers light up in order, 0.6 s apart, on a 7.2 s loop.

- All canvases run on one `requestAnimationFrame` loop, only while on screen, and stop when the tab is hidden. A scene is warmed up and first drawn only when it scrolls near the viewport.
- **Lite mode** (phones, touch screens, ≤4 CPU cores): canvas resolution capped at 1.5×, drawing at ~30 fps, no film grain, the hero's background bubbles baked into a cached layer, no backdrop blur on the menu bar, and the animation loop starts only once the page has loaded and is idle.
- While the Examine dialog is open, only its specimen animates.
- `prefers-reduced-motion` or the "Pause motion" button draws one still frame per specimen and disables reveals.
- Only `transform`, `opacity` and `clip-path` are animated in CSS.
