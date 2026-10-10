# Design system: Darkfield, in glass and light

The single source of truth for the visual and motion language of this portfolio. Every color, size and timing in `index.html` comes from the tokens below (they live in the `:root` block at the top of the page's `<style>`).

## Theses

**Visual.** A microscope bench lit like a studio. A violet-black ground, and behind everything a living field of light: three soft lamps in the colors of the section you are reading, drifting slowly, with defocused discs at depth and a reading lamp that follows the pointer. Every surface is optical glass: a tinted, translucent body, a bevel whose bright edge faces the light and whose far edge carries the project's color, and a glint at the pointer. The hero lens is real glass (WebGL): the live network is refracted through it, split into color at the rim, with an iridescent edge. Bone-white type, one warm "halogen" gold for the main actions, an editorial serif for the name and headings, a plain grotesk for reading, a mono for data. Rounded, layered surfaces (18 to 26 px) and pills for controls.

**Interaction.** Depth answers the hand. Slides, cards and the lens turn toward the pointer on a smoothed spring (at most 4.5 to 8 degrees), the specimen inside sits deeper than its label, and the light moves with the pointer across every bevel. Scrolling deals the slides and cards off the tray in perspective; headings pull into focus. Micro-interactions take 140 ms, UI changes 240 ms, reveals 700 ms with an expo ease-out. **Never:** bounce or elastic easing, scroll-jacking, matrix effects, custom cursors, infinite marquees, rainbow fills behind text, or any motion that ignores reduced motion or "Pause motion" (both stop the tilt, the field and the lens, and leave still frames).

**Light and contrast.** The field never gets brighter than text can stand on: its luminance has a soft ceiling, so even the smallest labels keep 4.5:1 over the hottest lamp. Color lives in light (the field, the glass edges, glows), never as flat fills behind text.

**Performance.** WebGL is used only where a GPU draws it: the page asks WebGPU for an adapter first (cheap, and it touches no canvas) and otherwise runs the 2D field and the 2D lens, because even a failed WebGL context on a machine without a GPU slows every canvas on the page. Frosted blur (`backdrop-filter`) is kept for the surfaces that sit over detail (the nav capsule, the dialog, buttons over live specimens); in lite mode only the nav and dialogs blur, since the small glass pieces sit over the smooth light field. An SVG liquid-glass refraction on the nav was tried and dropped: Chromium rendered it unevenly at fractional pixel ratios. `?glforce` forces the WebGL path for testing.

## Tokens

| Group | Token | Value | Use |
|---|---|---|---|
| Color | `--ground` | `#05060C` | Page background (violet-black bench) |
| | `--stage` / `--stage-2` | `#0B0E1A` / `#141932` | Dark glass bodies, canvases |
| | `--hair` / `--hair-2` | `#1C2135` / `#2B324D` | Hairlines |
| | `--bone` | `#EEF0F7` | Primary text |
| | `--mute` | `#AEB4C8` | Secondary text (9.6:1 on ground) |
| | `--faint` | `#A4ABC2` | Labels, captions (8.9:1 on ground, 4.8:1 or better over the brightest lamp) |
| | `--lumen` / `--lumen-ink` | `#F2D49B` / `#1A1408` | Gold: primary actions, focus |
| Polarizer | `--pol-v` `--pol-m` `--pol-c` `--pol-g` | `#8A7BFF` `#E85CCB` `#46D5F5` `#FFC873` | The colors a crystal throws under crossed polarizers: hover glows, the iridescent lens rim |
| Glass | `--glass` / `--glass-deep` | `rgb(12 14 28 / .56)` / `rgb(9 11 22 / .74)` | Translucent glass bodies |
| | `--g-sheen` | light-to-clear gradient | The top of every pane catches more light |
| | `--g-bevel` | two inset 1px edges driven by `--lx` / `--ly` | Catch-light on the edge facing the light |
| | `--g-drop` | soft long shadow | Panes float above the bench |
| | `--lx` / `--ly` | -1.4 to 1.4, set from the pointer | Light direction for every bevel |
| Channels | `--ch-host` | `#7C9CFF` | Devices (like a DAPI stain) |
| | `--ch-net` | `#4FE3A1` | Network signal |
| | `--ch-auth` | `#F25CCF` | Auth signal, anomalies |
| | `--ch-merge` | `#FFF3D1` | Both signals overlap: confirmed |
| Projects | `--c-apis` `--c-mcp` `--c-animal` `--c-solar` | `#4FE3A1` `#B79BFF` `#FFB547` `#5BD6FF` | One fluorophore per project: glass edges, glows, metric ticks, the field's lamps |
| | `--c-sos` `--c-scam` `--c-phish` `--c-ai` | `#FF8A5C` `#7C9CFF` `#F25CCF` `#F0D29A` | |
| Type | `--f-display` | Newsreader | Name, headings, serif italics |
| | `--f-body` | Hanken Grotesk | Reading text, buttons |
| | `--f-mono` | IBM Plex Mono | Data, labels, specimen tags |
| Scale | | 12 / 13 / 15 / 17 / 20 / 26 / clamp(36–56) / clamp(64–150) px | |
| Space | `--s-1`…`--s-9` | 4 8 12 16 24 32 48 72 112 px | |
| Radius | `--r-1` / `--r-2` / `--r-3` | 10 / 18 / 26 px, pills 999px | Chips / cards and tiles / slides and panels |
| Motion | `--d-micro` `--d-ui` `--d-reveal` | 140ms / 240ms / 700ms | |
| | `--e-out` | `cubic-bezier(.16,1,.3,1)` | Enter, reveal |
| | `--e-in` | `cubic-bezier(.4,0,1,1)` | Exit |
| | `--e-move` | `cubic-bezier(.65,0,.35,1)` | State-to-state |
| | tilt spring | exponential, 120 ms time constant | Pointer tilt and light |

## Components

- **Field**: the WebGL light behind the page (`makeField`), 30 fps, rendered at half resolution; the lamps take the three colors of the section in view (`data-tint`) and turn further along their orbits as you scroll. The 2D version (radial lamps, rings, drifting particles) runs where there is no GPU.
- **Nav**: a floating glass capsule; links light on hover, a gold indicator under the current section, a thin spectrum line along the bottom shows scroll progress. On phones the menu drops down as a solid pane of tinted glass (it sits inside the capsule, so it cannot blur the page behind it).
- **Button**: a glass pill; a glint crosses it on hover and it lifts 1px. `.primary` (and Email me in the nav) is gold glass. Focus: 2px gold outline, 3px offset, following the pill.
- **Lens**: the hero objective. A WebGL pass refracts the live 2D specimen like a thick lens (compressed and split into color at the rim), adds an iridescent edge, a window glint that follows the light, and an inner image that shifts as the lens tilts toward the pointer. Clicks are mapped back through the glass to the specimen. Without a GPU, a CSS glint and rim stand in.
- **Slide**: a microscope slide in glass: a frosted label end tinted in the project's color, a cover-slip outline over the live specimen, a bevel lit from the light's side, a colored glow beneath. It tilts toward the pointer with the specimen parallaxing deeper inside, and rises off the tray in perspective as it scrolls in. The featured slide keeps the real 3:1 shape of a 75×25 mm slide; half-width slides use 2.4:1 and phones 2.1:1.
- **Readout**: one glass instrument panel under the hero; each value glows faintly in its project color. It tilts up into place once on load.
- **Cards and tiles** (metrics, honeycomb layers, project cards, certificates, skills, contact channels, the about panel): glass panes with the shared bevel and sheen; certificates and project cards also tilt.
- **Examine dialog**: native `<dialog>` as a heavy glass sheet with a live full-size copy of a specimen, a color legend and numbered steps. Opens with `@starting-style` fade and lift (and a view-transition morph from the slide), closes on Esc or backdrop click.
- **Attack control**: clicking a host in the hero lens (or the Launch button) restarts the APIS cycle with that host as the intruder.
- **Skills key**: six project pills (one per fluorophore). Each skill carries a dot for every project that uses it in code you can read; picking a project lights its skills and fades the rest to `--faint`. Networking carries a CCNA tag instead.
- **Name**: each letter flips up into place in perspective as it rises into focus, then one pass of lamp light crosses the name.
- **Brand mark**: the lens with two stains (network and auth). The stains drift toward each other every 6 s, the cream "merged" dot brightens when they meet, and they merge on hover, the APIS idea in 22 px.
- **Print**: a white, two-column CV layout; canvases, navigation, buttons and every glass effect are removed and link URLs are printed.
- **404**: `404.html`, an empty microscope slide in the same tokens.

## Intro film

A 33-second title sequence plays on a visitor's first visit in a session, cut to an original score (`intro.mp3`, composed and rendered for the site) in the manner of a product-launch film: piano and warm strings in D minor over a soft low pulse, no drums, a quiet passage under the galaxy, and a string crescendo that opens into D major on the name. It is drawn live on one full-screen canvas, one scene per musical phrase, paced so every number and project stays on screen about 1.5 s: power on, the thesis, APIS, lateral movement, measured results, method, builds, credentials, the name, and the hand-off.

- **Look**: the same glass and light as the page. The scenes play over the lamp-lit field, its colors changing cut by cut (the WebGL field where a GPU draws it, the same lamps as 2D gradients otherwise). The lens draws itself as a glass objective; NETWORK and MODELED ON are extruded in depth and DEFENSES arrives as a sheet of gold glass; the APIS plate is a glass hexagon over a honeycomb floor in perspective and turns in depth to its result; the network has depth and the camera swings around it; each measured result is a card of colored glass dealt in from the right; the galaxy is a disc that opens toward the viewer; each build swings in and its title sits on a pane of glass; the credentials stand on a floor of light; the name flips up letter by letter inside a ring of split light. The cuts are marked by a pane of glass sweeping across the frame and bending it.
- **Gate**: browsers only allow sound after a click, so the film opens on a quiet title card with **Play the intro** and **Skip to the portfolio**. Esc skips at any point.
- **Clock**: the music drives the picture. The film reads the audio position every frame, so every cut lands on its beat (124 BPM); if sound is blocked or fails, it runs on its own clock. The picture's small pulses follow the score's accents (the hits and chord changes), not a drum beat.
- **Sound design**: there is no separate effects layer; the score plays the picture, the way a launch film is scored. One piano note for each word of the thesis and a celesta glint for its green full stop; a deep, soft hit with each reveal (APIS, the results, the builds, the name); soft glints for the anomaly signals; four piano notes for the lateral hops and a resolved chord when CONFIRMED lands; a chord and a falling melody for each result card and each project panel, with small celesta moments for the test suite, the animal found, the falling energy, the reflective screen and the medal; reverse-piano swells into each new scene; rising notes under the credentials and a string crescendo into the name; an arpeggio that rises with its letters; and one high note and a bell as the name lands in the page.
- **Hand-off**: the name flies into the hero heading (900 ms, `--e-move`) while a lens ring draws over the real hero lens, then the page opens from that lens like an iris and the hero's normal entrance plays.
- **Replay**: the **Play intro** button in the navigation plays it again (it scrolls to the top first).
- **Honesty**: every number in the film is one the site already states (79.2%, 96% · 166 of 173, 236 tests, 9/12 with 0 false alarms, ~340 ms per frame, 6,300 J → 2,004 J simulated).
- **Who sees it**: not shown with reduced motion, after "Pause motion", to links with a `#section`, to crawlers and test tools, or again in the same browser session. `?intro=1` forces it and `?intro=0` turns it off.
- **Loading**: the film is `intro.js`, fetched only when the intro shows or when someone presses Play intro, so a normal page load does not pay for it.

## Motion rules in code

- **Field**: a fixed canvas behind the page, drawn at half resolution and 30 fps (WebGL where a GPU draws it). Three soft lamps take the colors of the `data-tint` of the section in view and blend over ~1 s; a soft luminance ceiling keeps small labels at 4.5:1; defocused discs drift with a little scroll parallax; a reading lamp follows the pointer.
- **Light**: the pointer sets the light direction (`--lx`, `--ly`, eased with a 120 ms spring, written only when it changes by a tenth); every bevel and the lens glint follow it.
- **Tilt**: slides (4.5°), project and certificate cards (6°) and the lens (8°) turn toward the pointer with the same spring, through the `rotate` property so CSS animations keep `transform`; the parent holds the perspective. Fine pointers only; off with reduced motion or Pause motion.
- **Tray**: slides, project cards and certificates rise off the tray in perspective as they scroll in (scroll-driven `animation-timeline: view()`, content visible without it).
- **Section sweep**: a short line of the section's color (`--sc`) travels along each section's top border every 9 s.
- **Glint**: a specular spot follows the pointer across each slide and card, fading in through a registered `--glare` property; buttons get a glint that crosses them on hover.
- **Focus pull**: on load each letter of the name flips up into place in perspective and rises into focus (blur 12px → 0, 45 ms apart, left to right) as the lens iris opens. Once it settles, one pass of lamp light crosses the name (1.6 s, once).
- **Navigation**: a single gold line glides between links (340 ms, `--e-move`) to the section in view, and previews the link under the pointer or keyboard focus.
- **Headings**: section titles wipe in from the left and clear a 6 px blur as they go, tied to scroll.
- **Examine**: the specimen grows out of its slide into the dialog and shrinks back on close (View Transitions, 480 ms expo-out); without support, or with reduced motion, the dialog simply fades.
- **Certificates**: each validity bar fills to the real share of time used when it comes into view (1.4 s).
- **Timeline**: a lit gradient line; only the current role pulses; past roles hold a steady dot.
- **Scroll progress**: a thin line along the bottom of the nav capsule in the six project colors, scaled by scroll position.
- **APIS honeycomb**: the nine layers light up in order, 0.6 s apart, on a 7.2 s loop.

- All canvases run on one `requestAnimationFrame` loop, only while on screen, and stop when the tab is hidden. A scene is warmed up and first drawn only when it scrolls near the viewport.
- **Lite mode** (phones, touch screens, ≤4 CPU cores; the `lite` class on `<html>`): frosted blur only on the nav and dialogs, canvas resolution capped at 1.5×, drawing at ~30 fps, no film grain, the hero's background bubbles baked into a cached layer, no pointer tilt (touch), and the animation loop starts only once the page has loaded and is idle.
- While the Examine dialog is open, only its specimen animates.
- `prefers-reduced-motion` or the "Pause motion" button draws one still frame per specimen and disables reveals.
- Only `transform`, `opacity` and `clip-path` are animated in CSS.
