# Portfolio website

Source for my personal portfolio: **https://shehab6157-design.github.io**

Shehab Shibli, Network Engineering and Computer Security graduate (CCNA, AWS Certified Cloud Practitioner). The site presents the security tools I build and test on real data: APIS (lateral-movement detection), the MCP Security Proxy for AI agents, my edge-to-cloud animal detection project, the bio-inspired solar screen, ScamShield, the phishing detector, S.O.S (NASA Space Apps 3rd place), plus certifications and contact details.

## Design

My flagship project, APIS, defends a network the way a honeybee colony defends its hive, so the site is built inside one: a real-time 3D honeycomb of brushed gold and amber glass, lit like a product shot. Scrolling moves the camera over the comb, each project lights its own cell in its own colour, and in the hero you can click any cell to launch an attack and watch the hive detect it, confirm it and seal it off. The full design system is in [`MASTER.md`](MASTER.md).

## About this repo

- `index.html`: the page, with inline CSS and JavaScript (fonts come from Google Fonts).
- `hive.js`: the 3D honeycomb, built with [three.js](https://threejs.org) (MIT) and a small film pipeline (bloom, depth of field, tone mapping). It loads after the page, and only on devices with a GPU; everyone else sees `hive-*.webp`, a still render of the same scene.
- `intro.js` and `intro.mp3`: the 33-second intro film, rendered live in the same hive, and its original soundtrack. Loaded only when the film plays; press **Play intro** in the navigation to watch it again.
- `og.jpg`: the 1200×630 preview image shown when the link is shared.
- `robots.txt`, `sitemap.xml`, `favicon-32.png`, `apple-touch-icon.png`: search and icon files.
- `Shehab_Shibli_CV.pdf`: the CV behind the Download CV buttons.
- `shehab-shibli.webp`: the About portrait. `shehab-shibli.jpg` is the same photo for search-engine data.
- `404.html`: the "This cell is empty" page GitHub Pages shows for missing URLs.
- `MASTER.md`: design system and motion rules.
- Every animation runs live in the browser (WebGL for the hive, Canvas 2D for the project sketches), only while it is on screen, and stops when the tab is hidden. Visitors with "reduce motion" turned on (or who press the pause button) see still frames instead.
- Hosted with GitHub Pages straight from the `main` branch. To run it locally, serve the folder with any static server (for example `python3 -m http.server`) and open it in a browser.

## Links

- GitHub profile: https://github.com/shehab6157-design
- LinkedIn: https://www.linkedin.com/in/shehab-shibli
