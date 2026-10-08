# Portfolio website

Source for my personal portfolio: **https://shehab6157-design.github.io**

Shehab Shibli, Network Engineering and Computer Security graduate (CCNA, AWS Certified Cloud Practitioner). The site presents the security tools I build and test on real data: APIS (lateral-movement detection), the MCP Security Proxy for AI agents, my edge-to-cloud animal detection project, the bio-inspired solar screen, ScamShield, the phishing detector, S.O.S (NASA Space Apps 3rd place), plus certifications and contact details.

## Design

The page is built like a darkfield microscope bench: the hero is a live "microscope view" of a network where APIS-style network and login signals are drawn as two stains, and each project is shown as a glass slide running its own live simulation. The full design system (colors, type, spacing, motion rules) is in [`MASTER.md`](MASTER.md).

## About this repo

- `index.html`: the whole site in one static page with inline CSS and JavaScript. No build step and no dependencies (fonts come from Google Fonts).
- `og.jpg`: the 1200×630 preview image shown when the link is shared on LinkedIn, X or WhatsApp.
- `robots.txt`, `sitemap.xml`, `favicon-32.png`, `apple-touch-icon.png`: search and icon files.
- `404.html`: custom "Specimen not found" page that GitHub Pages shows for missing URLs.
- `MASTER.md`: design system and motion rules.
- Every animation is drawn live with the Canvas 2D API, runs only while it is on screen, and stops when the tab is hidden. Visitors with "reduce motion" turned on (or who press the pause button) see still frames instead.
- Hosted with GitHub Pages straight from the `main` branch. To run it locally, open `index.html` in a browser.

## Links

- GitHub profile: https://github.com/shehab6157-design
- LinkedIn: https://www.linkedin.com/in/shehab-shibli
