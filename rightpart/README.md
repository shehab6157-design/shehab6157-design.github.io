# RightPart

**The right part, every time.** A working prototype of digital work instructions that know what every part is, and check themselves.

Live (once this folder is on `main`): **https://shehab6157-design.github.io/rightpart/**

Most assembly lines still build from step-by-step PDFs. One screw can go by four names (internal, customer, supplier, an old code), two screws can differ by 2 mm, and a PDF cannot check anything. When an engineering change swaps one screw for another and the instructions are never updated, the old screw keeps being fitted for years. RightPart connects the data so a computer catches that in milliseconds.

The demo library is a **fictional** bench-top console, the *Nova-1*, with 32 parts under 106 codes and 10 assembly steps. Its instructions contain one deliberate mistake (step 7 still fits the screw an engineering change replaced) for the integrity check to find. No real company data is used anywhere.

## What it does

| | |
|---|---|
| **One part, every code** | Internal, customer, supplier, manufacturer, drawing and retired codes all resolve to one record, ignoring dashes, spaces and capitals. A code recorded for two parts is a stop. Typos get "did you mean". |
| **Reads codes** | `ISO 7380 M3x8 A2`, `DIN 912 M4x10 12.9`, `#4-40 x 1/4 PPH`, `AF-7045-M3-6-A2`: every piece explained in plain words. |
| **Drawn from the data** | Screws, nuts, washers and standoffs are drawn from their own spec in 2D and 3D, at true size on a calibrated screen or a printed label. The picture cannot disagree with the data. |
| **Look-alike guard** | Finds parts that are easy to confuse (length, diameter, metric vs inch, Phillips vs Pozidriv, plain vs lock nut, duplicate records) and names the difference. |
| **Build guide in 3D** | Each step: which parts, how many, torque, tools, how, why, what to check. The step's parts fly into place in a 3D model generated from the library (an M3 × 10 is really 10 mm long). |
| **Learn and Build modes** | Learn: explanations and "More about this part". Build: scan or type the bin code before fitting; wrong part = red stop with the reason; a critical issue needs a recorded supervisor decision; everything goes into a build record. |
| **Integrity check** | BOM vs instructions vs change history vs part records: likely wrong part in a step, one code for two parts, unknown codes, retired parts, quantity mismatches, revision mismatch, old codes, codes that spell a different size, duplicates, look-alikes on the same device, missing torque. |
| **Identify a loose part** | Lay it on the screen and measure it (calibrated with a bank card), photograph it (the identifier learns your parts on the device), or scan any code. |
| **Bin labels** | 100 × 50 mm, Code 128 barcode, every code the part goes by, a "NOT M3 × 10" warning, and the part's outline at actual size. |
| **Training** | Fastener basics (heads, drives, threads, length, materials) and a quiz generated from the real device. |
| **Private and offline** | Installs as an app, works without a network, keeps all data in the browser. No server, no account, no tracking. |

## Five-minute tour

1. **Home → Try** the example codes: `C-55013` (customer code), `DS-103-308` (one code, two parts), `100-0283` (typo).
2. **Check**: the integrity check finds that step 7 fits `100-0234` (M3 × 10) where BOM rev C asks for `100-0233` (M3 × 8), and names the engineering change that never reached the instructions.
3. **Build → Learn**: walk the 10 steps in 3D. Step 7 is flagged.
4. **Build → Start a build**: scan or type `AF-SO-M3-12-MF` at step 1 (wrong standoff: red stop), then `C-55030` (right one: green).
5. **Identify → Measure**: calibrate with a card, lay a screw on the screen, drag the handles.
6. **Part page → Bin label**, then print at 100 %.

## Your own data

Everything you import stays in this browser (IndexedDB). Use **Your data** in the app.

**Parts CSV** (Excel → Save as CSV; comma, semicolon or tab). Download the template in the app. Columns:

`id, category, name, designation, thread, d_mm, pitch_mm, length_mm, head, drive, drive_size, material, torque_nm, tool, status, replaced_by, function, why, if_wrong, tips, customer_codes, supplier_codes, manufacturer_codes, drawing_codes, legacy_codes`

- Only `id` is required (`part_number`, `pn` and `description` are understood too).
- Several codes in one cell: `AF-7380-M3-8-A2@Alpha Fasteners|DS-103-308@Delta Supply` (`@` names the source).
- If size columns are empty, they are read from `designation` or `name` (`ISO 7380 M3x8 A2` fills head, drive, thread, length and material).

**BOM CSV**: `device_id, device_name, bom_rev, item, code, qty, where`. The code can be any code of the part; `qty` can be `A/R`.

**Library JSON** (everything, including steps and 3D scenes): see `data/demo-library.json`. In short:

```text
{ schema: "rightpart/1",
  parts:   [{ id, category, name, designation, spec: { head, drive, thread, d, pitch, length, material, ... },
              aliases: [{ type: customer|supplier|manufacturer|drawing|legacy, code, source, note }],
              torque: { value, unit }, tool, status, replacedBy, details: { function, why, ifWrong, tips } }],
  devices: [{ id, name, bom: { rev, lines: [{ item, code, qty, where }] },
              instructions: { rev, steps: [{ id, title, summary, parts: [{ code, qty, torque?, note? }],
                                             tools, instructions, checks, warnings, why, critical, esd }] },
              changes: [{ rev, eco, date, text, parts }],
              scene: { overview, cameras, objects: [{ kind, code, step, pos | at+dir, from, ... }] } }] }
```

## Before using it with real data

- **Confidentiality.** This site is public. Never commit real drawings, BOMs or customer part numbers to this repository. Import them only on devices your company approves; they stay in that browser.
- **Regulated production.** In medical-device manufacturing, software that guides or records production is part of the quality system: it must be validated and released under document control (ISO 13485 §4.1.6 and §7.5.6, FDA QMSR / 21 CFR 820) and, for electronic records and signatures, meet 21 CFR Part 11. Run RightPart as a pilot alongside the controlled work instructions, never instead of them.
- **Demo values are illustrative.** Torques and specs in the demo library are invented for the fictional device.

## How it is built

Plain HTML, CSS and JavaScript modules: no framework, no build step. Serve the folder and open it.

```
index.html            app shell (strict Content Security Policy: scripts from this site only)
css/app.css           design system, light and dark
js/app.js             router, global search, navigation
js/core/              pure logic, runs in the browser and in Node tests
  decode.js           reads designations: ISO/DIN standards, metric and inch threads, drives, materials
  model.js            the index: every code -> one part, search, where-used
  lookalike.js        similarity of fasteners and the difference in words
  audit.js            the integrity check
  importer.js         CSV / JSON import
  code128.js, csv.js, dims.js
js/draw.js            parametric 2D drawings (true scale)
js/viewer3d.js        3D assembly viewer (three.js), parts generated from specs
js/gauge.js           screen calibration and on-screen measuring
js/vision.js          on-device photo identification (TensorFlow.js + MobileNet v1, loaded only when used)
js/scan.js            barcode scanning (BarcodeDetector, or ZXing)
js/views/             one file per page
data/demo-library.json   the fictional Nova-1 library
vendor/               three.js (tree-shaken bundle), TensorFlow.js, MobileNet weights, ZXing
sw.js                 offline cache
tests/                node --test
```

Run locally from the repository root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/rightpart/ (the offline cache is skipped on localhost; add `?sw=1` to test it).

Run the tests from this folder (Node 18 or later, no install needed):

```bash
node --test tests/*.test.mjs
```

The three.js bundle exports only what `js/viewer3d.js` uses (listed in `vendor/three/three-entry.js`). After adding a name there, rebuild it with esbuild from a folder where `three` is installed:

```bash
npx esbuild three-entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof --outfile=three.bundle.js
```

When you change a file listed in `sw.js`, bump `VERSION` there so installed copies update.

## Next steps

Pilot on one sub-assembly with real data on an approved private copy · read codes, BOMs and changes from the ERP/PLM so the check runs on every change · load the real 3D model from CAD (glTF) · instructions in Hebrew, Arabic, Russian and English with right-to-left layout · log-in, electronic signatures and audit trail, then validation · a shared photo identifier trained on the line's own parts · a supervisor dashboard (wrong scans per step, doubts, training scores).

## Credits

[three.js](https://threejs.org) (MIT) · [TensorFlow.js](https://www.tensorflow.org/js) and MobileNet v1 weights (Apache 2.0) · [ZXing](https://github.com/zxing-js/library) (Apache 2.0). The Nova-1, its parts, codes and suppliers are fictional.
