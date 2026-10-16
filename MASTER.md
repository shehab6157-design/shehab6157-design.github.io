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
- **Fallbacks**: no WebGL2, or only a software renderer: the page shows a still render of the hero (`hive-*.webp`), softened behind the reading sections, and a still of each project's world in its chapter. Reduced motion or Pause motion: still frames, one per section, no camera travel.

## Project worlds

APIS keeps the hive: the comb is its world and the page's home. Every other project has a world of its own, staged in the same dark studio and rendered through the same film pipeline, and each one shows how that project actually works. Reaching a project's chapter, the camera dives into the project's lit cell and the world opens out of the honeycomb, cell by cell behind a thin gold rim; leaving, it closes back into the cell; between two projects the honeycomb sweeps straight from one world to the next.

| Chapter | Gem | What the world shows |
|---|---|---|
| MCP Security Proxy | amethyst | Three agents call six tools through a machined ring. Every call is written to a hash-chained audit log; one unusual signal is a gold observation, two correlated signals a red alert narrated to Telegram. Calls are never blocked. |
| Animal detection | emerald | A night road. The camera on the streetlight pole sees a deer (YOLOv5 on a Raspberry Pi 5) and publishes over MQTT/TLS to AWS IoT Core; Lambda finds the cars within 1 km (DynamoDB) and they get the alert and brake. |
| Bio-inspired solar screen | aquamarine | A phone with its nature layers floating above it. One by one they come down into the screen and the office day's energy steps down in a glass column: 6,300, 4,530, 3,438, 2,530, 2,004 J; then the hive sends messages to the best-placed screen and 73 phone wake-ups become 3. |
| S.O.S | sunstone | A sweeper in low orbit nets a cluster of small debris and draws it in, and lasers a larger fragment down toward the atmosphere. |
| More builds | sapphire, rose, peridot | One gold line through three stations; the camera moves to the card being read. ScamShield: a Matrix room, my Dendrite homeserver (with its Postgres), my client scanning each message before it shows and warning on likely scams, never blocking. Phishing Detector: the content model (0.85 line), behavioral signals and simulated sender history, the real flagging rule, and a calm lure that gets through. Personal AI Assistant: the prompt built from every saved fact and the last 20 messages, the Claude API, and `save_memory` keeping a new fact in SQLite. |

- **Design**: the same studio as the hive (glossy dark floor with real reflections on desktops, warm key light, soft fog), gold and glass, the project's gem as light, hexagons where they belong. Text in the worlds is set in the page's own faces and stays in focus.
- **Honesty**: every number shown in a world is one the project states (its README or its card).
- **Loading**: the worlds are a separate chunk, built one at a time while the page is idle near them; three.js is shared with the hive. Each is a loop of 10 to 24 seconds, a pure function of time.
- **Screens**: worlds are composed beside the card on wide screens and above it on narrow ones, where the lens widens a little and steps back so the whole piece fits.
- **Fallbacks**: without the live 3D, each chapter cross-fades to a still of its world (`world-*.webp`, landscape and portrait). Reduced motion or Pause motion: the world appears as a still, cut in, with no dive.

## Components

- **Hero**: the name in Bodoni Moda, the thesis, the lede, actions and three credentials, left; the comb, right (on phones, above). A glass console narrates APIS's real layers while you attack: *The Queen* (baseline), *Alarm Broadcast* (one signal, watched), *Quorum Consensus* (the pattern repeats, confirmed), *Containment* (sealed for review).
- **Results**: five measured results in a gold-ruled ledger; each with its project gem.
- **Glass cells** (project cards): dark smoked glass with a bevel, a gem-coloured rim that lights while the card is in view, the live sketch in a bevelled window with an Examine button.
- **Examine**: a dialog with a full-size live sketch, a colour legend and numbered steps.
- **Timeline, credentials, skills, contact**: the same panels and hairlines; validity bars fill like honey; skill gems light per project.
- **Print**: white, two columns, no 3D, link URLs printed.
- **404**: one empty cell over the hive, softened.

## Intro film

A 55-second film plays on a first visit, rendered live in the hive and the project worlds and cut to an original organ score (`intro.mp3`, 100 BPM): power on (one cell lights in the dark), the thesis over traffic hopping across the comb, APIS, an attack moving laterally until the hive confirms and seals it (96% of the red team's stolen-credential logins caught), the alerts flaring and 79.2% of them going dark, and a dive into the first project's lit cell. From there each project plays in its own world for two bars, the honeycomb sweeping from one world to the next: the MCP proxy raising its alert, the deer detected and the cars warned, the solar screen's layers landing as the energy steps down, the sweeper netting debris and lasering a fragment, and the three stations of the more builds along their gold line. The comb closes back over the last world on "tested on real data.", the four credentials are sealed in gold on four bells, and the name rises in a hush before the full organ. The camera then glides onto the page's own hero shot and the name lands in the heading, so the film becomes the page. No timecode or HUD: a thin progress line, Skip and Sound.

- **Score**: an original piece for a synthesised pipe organ in a stone cathedral (no samples, no borrowed melody): a 3+3+2 ostinato on a flute, a theme on the principal chorus that climbs a step with each project, a rank added with each world, D minor to a final D major. Sound effects follow what is on screen (the honeycomb sweeps, scans, alerts, seals, the lasers) and are mixed under the music, never above it.
- **Worlds in the film**: each world runs on the film's clock, so its story lands on the beat. The film builds them in its own order from the gate on; a world that is not ready in time is played by the hive instead (a macro on the project's lit cell), never a pop.
- **Gate**: sound needs a click, so it opens on a dark studio with one breathing cell, **Play the intro** and **Skip to the portfolio**. Esc skips at any point; skipping dips the picture to black and opens on the hero.
- **Clock**: the music drives the picture (the film reads the audio position every frame); if sound is blocked it runs on its own clock.
- **Honesty**: every number in the film is one the site states.
- **Who sees it**: not with reduced motion, after Pause motion, on links to a section, for crawlers and test tools, without WebGL2, or twice in a session. `?intro=1` forces it, `?intro=0` turns it off. **Play intro** in the nav replays it.

## Performance

- The page and its poster paint first; `hive.js` and three.js (~165 KB gzipped) load when the page is idle, or at once when the film plays. The project worlds (~50 KB gzipped, plus a few textures for S.O.S) load as you near them, or from the film's gate.
- Smooth scrolling: a world is built in small slices between frames, its textures go up to the GPU a few per frame and one small offscreen frame warms it before it first appears; moving shadows redraw every other frame and floor reflections render at a quarter of the resolution. The world camera follows the reader eased, so a jumpy scroll still makes a smooth move.
- One `requestAnimationFrame` loop drives the hive and the sketches; sketches run only on screen; everything stops when the tab is hidden.
- Panels don't use backdrop blur over the 3D (it would re-blur every frame); only the nav, the hero console and dialogs do. `?glforce` forces WebGL on a software renderer for testing.
