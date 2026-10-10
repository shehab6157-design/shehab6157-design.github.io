# Design system: Golden Hive

The single source of truth for the look and motion of this portfolio. Every colour, size and timing in `index.html` comes from the tokens below (the `:root` block at the top of the page's `<style>`), and the 3D hive is `hive.js`.

## Theses

**Subject.** APIS, the flagship project, defends a network the way a honeybee colony defends its hive (*apis* is Latin for bee). So the whole site lives in a hive: a realistic 3D honeycomb of brushed gold and amber glass, lit like a luxury product shot. Every cell is a host; light travelling between cells is traffic; a red cell is an attack; a gold cap is containment.

**Visual.** Black, honey gold and warm wax white. The comb is the one bold thing; everything around it is quiet: a high-contrast Didone for the name and headings, a plain grotesque for reading, thin gold hairlines, and panels cut with bevelled corners (an Art Deco cut that echoes the hexagon). Colour beyond gold appears only as light: each project has a gem colour (honey, amethyst, emerald, aquamarine, sunstone, sapphire, rose, peridot) that lights its own cell in the comb, its card's rim and its live sketch.

**Motion.** The camera, not the page, moves. Scrolling glides the camera between stations over the comb and racks focus into a soft gold haze behind the reading sections, then pulls back to the whole comb at Contact. In the hero the comb turns toward the pointer, a cell under the pointer lights up, and a click attacks from it. There is one orchestrated entrance (the intro film's hand-off, or the name rising on later visits); no fade-up on every section.
**Never:** bounce, scroll-jacking, parallax on text, flashing, motion that ignores reduced motion or Pause motion.

## Tokens

| Group | Token | Value | Use |
|---|---|---|---|
| Colour | `--propolis` | `#0D0905` | Page ground, the studio's darkness |
| | `--comb` / `--comb-2` | `#17100A` / `#21170D` | Dark panel bodies |
| | `--wax` | `#F3E8D2` | Headings, primary text |
| | `--wax-2` | `#CDBB9E` | Body text |
| | `--wax-3` | `#A99677` | Labels, captions |
| | `--gold` / `--gold-2` | `#E3B04B` / `#C4913A` | Hairlines, ranks, gold buttons |
| | `--honey` | `#FFB43F` | Light, focus ring, status |
| | `--ruby` | `#FF4D3D` | Attacks only |
| Gems | `--c-apis` `--c-mcp` `--c-animal` `--c-solar` | `#FFB43F` `#B38CFF` `#3FD69A` `#4FD3E6` | One colour per project: its cell in the comb, card rim, sketch, skill gems |
| | `--c-sos` `--c-scam` `--c-phish` `--c-ai` | `#FF9466` `#6E9BFF` `#FF6FAE` `#B6E36A` | |
| Sketch | `--ch-host` `--ch-auth` `--ch-merge` `--lumen` | `#8EB0D6` `#FF4D3D` `#FFF2D8` `#FFD27A` | Neutral hosts, alerts, confirmed, observations and daylight inside the live sketches |
| Type | `--f-display` | Bodoni Moda (optical sizes) | Name, headings, numbers |
| | `--f-body` | Instrument Sans | Reading text, buttons, labels |
| | `--f-mono` | IBM Plex Mono | Code identifiers only (signal names) |
| Scale | | 13 / 14 / 15 / 17 / 24–30 / 46–92 / 64–176 px | Caption, label, small, body, card title, section title, name |
| Shape | `--cut` | 14 px bevel | Buttons; panels 20–28 px bevel; gems and markers are hexagons |
| Motion | `--d-micro` `--d-ui` | 140 / 240 ms | Hover, state changes |
| | `--e-out` / `--e-io` | `cubic-bezier(.16,1,.3,1)` / `(.65,0,.35,1)` | Enter / state to state |

No ALL-CAPS eyebrows, no middle-dot meta strings, no arrows appended to buttons; numbers appear only where the content is a sequence (the nine APIS layers).

## The hive (`hive.js`)

three.js (WebGL2) with a small film pipeline of its own, built from `hive/src/hive.js` with esbuild.

- **Comb**: about 280 hexagonal cells grown outward from the middle, with a gentle swell, small irregularities and walls still being built at the edge. Walls are anisotropic brushed gold; filled cells hold amber honey (refractive glass on desktops); a band of cells is sealed with gold caps.
- **Light**: a studio environment (soft boxes in a dark room), a warm key with soft shadows, an amber rim light, floating pollen motes, a dome with a warm pool behind the comb.
- **Pipeline**: HDR render, multisampled; bright-pass bloom; depth of field; a dual-filter "haze" for defocused backgrounds; AgX tone mapping with a warm grade, vignette and fine grain.
- **Events**: everything that moves is a function of time (waves, packets hopping cell to cell, glows, seals), so the film can render any frame exactly. The page drives persistent lights (each project's cell, the hovered cell) on top.
- **Quality**: `high` on desktops (refractive honey, shadows, MSAA), `low` on phones and touch screens. Frames that come slower than about 45 fps lower the render resolution, and it climbs back when there is room. The hive renders only when something moves: it rests under the haze.
- **Fallbacks**: no WebGL2, or only a software renderer: the page shows a still render of the hero (`hive-*.webp`), softened behind the reading sections. Reduced motion or Pause motion: still frames, one per section, no camera travel.

## Components

- **Hero**: the name in Bodoni Moda, the thesis, the lede, actions and three credentials, left; the comb, right (on phones, above). A glass console narrates APIS's real layers while you attack: *The Queen* (baseline), *Alarm Broadcast* (one signal, watched), *Quorum Consensus* (the pattern repeats, confirmed), *Containment* (sealed for review).
- **Results**: five measured results in a gold-ruled ledger; each with its project gem.
- **Glass cells** (project cards): dark smoked glass with a bevel, a gem-coloured rim that lights while the card is in view, the live sketch in a bevelled window with an Examine button.
- **Examine**: a dialog with a full-size live sketch, a colour legend and numbered steps.
- **Timeline, credentials, skills, contact**: the same panels and hairlines; validity bars fill like honey; skill gems light per project.
- **Print**: white, two columns, no 3D, link URLs printed.
- **404**: one empty cell over the hive, softened.

## Intro film

A 33-second film plays on a first visit, rendered live in the same hive and cut to the original score (`intro.mp3`, 124 BPM): power on (one cell lights in the dark), the thesis over traffic hopping across the comb, APIS, the measured results drawn with the comb's own cells (alerts flaring and 79.2% of them going dark; an attack confirmed and sealed; 236 cells for 236 tests; 9 of 12 caught and capped; a pulse every ~340 ms; 68 of 100 cells going dark), "tested on real data.", four builds each lit in its gem colour, the four credentials sealed in gold on the score's four notes, and the name. The camera then glides onto the page's own hero shot and the name lands in the heading, so the film becomes the page. No timecode or HUD: a thin progress line, Skip and Sound.

- **Gate**: sound needs a click, so it opens on a dark studio with one breathing cell, **Play the intro** and **Skip to the portfolio**. Esc skips at any point; skipping dips the picture to black and opens on the hero.
- **Clock**: the music drives the picture (the film reads the audio position every frame); if sound is blocked it runs on its own clock.
- **Honesty**: every number in the film is one the site states.
- **Who sees it**: not with reduced motion, after Pause motion, on links to a section, for crawlers and test tools, without WebGL2, or twice in a session. `?intro=1` forces it, `?intro=0` turns it off. **Play intro** in the nav replays it.

## Performance

- The page and its poster paint first; `hive.js` (three.js, ~156 KB gzipped) loads when the page is idle, or at once when the film plays.
- One `requestAnimationFrame` loop drives the hive and the sketches; sketches run only on screen; everything stops when the tab is hidden.
- Panels don't use backdrop blur over the 3D (it would re-blur every frame); only the nav, the hero console and dialogs do. `?glforce` forces WebGL on a software renderer for testing.
