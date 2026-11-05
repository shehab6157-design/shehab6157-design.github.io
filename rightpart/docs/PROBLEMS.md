# Problems to expect

23 problems that products like RightPart, and the companies using them, have run into: what goes wrong, what happened elsewhere, how RightPart handles it today, and what is still open.

Most sources are vendor or consultancy articles. Read them as experience, not as statistics.

The same list is in the app under **More → Problems to expect**. This file is generated from `js/problems.js` by `node tools/problems-md.mjs`; edit that file, not this one.

- [People on the floor](#people-on-the-floor) (4)
- [Content and data](#content-and-data) (4)
- [Technology](#technology) (5)
- [Security, IP and compliance](#security-ip-and-compliance) (4)
- [The business](#the-business) (5)
- [For you, as the person with the idea](#for-you-as-the-person-with-the-idea) (1)

## People on the floor

### Installed is not the same as used

Tablets are mounted, accounts are created, and people keep building from the paper copy because it is what they know.

- **Seen elsewhere:** Playbooks warn that assuming deployment equals adoption is a classic mistake and recommend measuring weekly use. Frontline resistance to change is often named as the first obstacle. ([Manual.to](https://manual.to/the-paper-to-digital-sop-playbook/), [Fabrico](https://www.fabrico.io/blog/digital-work-instructions-vs-paper/))
- **Handled today:** Runs on any phone or tablet and works offline; Learn mode, a quiz and the Ask assistant make it useful to new people from day one.
- **Still open:** In the pilot, count weekly use per line and ask operators what slows them down. Keep the paper copy as a safety net until the digital one has proven itself.

### Designed in an office, not at the bench

Every extra screen, click or code to type becomes a reason to work around the system.

- **Seen elsewhere:** MES failure studies describe systems "designed in conference rooms" that make the floor feed them, and operators quietly working around steps configured for checklists instead of real work. ([Panorama Consulting](https://www.panorama-consulting.com/top-reasons-for-mes-failure-and-why-executives-miss-them-early/), [Tulip](https://tulip.co/blog/why-mes-adoption-fails-at-scale/))
- **Handled today:** One scan per bin, big buttons for gloved hands, handheld scanners that type into the box, and only fasteners need a scan in build mode.
- **Still open:** Watch real builds during the pilot, count taps per step, and remove anything nobody uses.

### People feel watched

Build records name the operator. Without clear rules this reads as surveillance, and in some countries it needs a works council agreement or a privacy assessment.

- **Seen elsewhere:** In several EU countries systems that can monitor performance need works council consent; guides recommend line-level reports, limited access and written retention rules. ([Fabrico](https://www.fabrico.io/blog/oee-monitoring-works-council-approval-guide/))
- **Handled today:** Operators can only see their own records on the company server; supervisors see all. Records hold scans and decisions, not speed.
- **Still open:** Write down what records are for, who sees them and how long they are kept, and agree it with the team before the pilot. Check local privacy law.

### Many languages on one line

Instructions in one language exclude people who read another one better.

- **Seen elsewhere:** Production lines often mix several native languages, and literacy levels differ.
- **Handled today:** Ask understands questions in English, Hebrew and Arabic; part numbers work in any language; drawings carry the meaning without words.
- **Still open:** Translated step text and right-to-left layouts.

## Content and data

### Writing the instructions is the real work

A digital system is only as good as its steps, and nobody has time to rewrite hundreds of PDF pages.

- **Seen elsewhere:** Guides list "no content owner" as a common failure: digital content decays without someone maintaining it. Others note that turning engineering data into usable instructions is where the digital thread breaks. ([Manual.to](https://manual.to/the-paper-to-digital-sop-playbook/), [Why connected worker strategies are leaving workers behind](https://www.pulse.bot/manufacturing/news/why-connected-worker-strategies-are-leaving-workers-behind-bc0eb2a2-372c-43d7-8e05-ba5ae8f5cb95))
- **Handled today:** Steps are read from the PDF work instructions a company already has (every part code linked, unknown codes listed), or imported from a spreadsheet. They stay drafts until an engineer reviews them, and the step editor checks each step against the BOM as you type.
- **Still open:** Name an owner for each device. Scanned PDFs need text recognition first; later, AI help for documents without clear step numbers, always reviewed by an engineer.

### Instructions drift away from the BOM

An engineering change updates the BOM; the work instruction is never updated; the old part keeps being fitted.

- **Seen elsewhere:** This is exactly the wrong-screw case that started RightPart.
- **Handled today:** The integrity check compares BOM, steps and change history, flags the step, names the change it missed, and stops the operator at the bench.
- **Still open:** Read BOMs and changes straight from the ERP or PLM so the check runs on every change, not only when someone imports.

### Messy master data

Duplicate part records, one code used for two parts, codes that say M3×12 on a 10 mm part, retired parts still in documents.

- **Seen elsewhere:** MES failure analyses name poor master data and misalignment between ERP and MES among the main causes. ([Panorama Consulting](https://www.panorama-consulting.com/top-reasons-for-mes-failure-and-why-executives-miss-them-early/))
- **Handled today:** Duplicates, code collisions, spec-versus-code conflicts, unknown and retired codes are all reported by the integrity check.
- **Still open:** Plan a data clean-up before the pilot and give the part master an owner.

### Parts that look alike

M3×8 next to M3×10, Phillips next to Pozidriv, M3 next to #4-40: impossible to tell apart at a glance.

- **Seen elsewhere:** This kind of mix-up is the most common way a wrong part is fitted.
- **Handled today:** Look-alike warnings in every step, true-scale drawings and labels, an on-screen gauge, and a scan before fitting.
- **Still open:** Separate look-alike bins physically, use bin colours, and ask engineering to reduce the number of screw types.

## Technology

### The network drops

Factory Wi-Fi has dead spots; a system that needs the network stops the line.

- **Seen elsewhere:** Lack of an offline mode is named as a common reason digital instructions fail. ([Fabrico](https://www.fabrico.io/blog/digital-work-instructions-vs-paper/))
- **Handled today:** RightPart installs as an app and works fully offline; records upload when the network is back.
- **Still open:** Test sync with several tablets editing at once (the server already refuses to overwrite a newer version).

### Consumer tablets do not survive the floor

Drops, dust, cleaning agents, gloves, static, cleanrooms.

- **Seen elsewhere:** Consumer tablets in industrial environments are reported to fail within months. ([Fabrico](https://www.fabrico.io/blog/digital-work-instructions-vs-paper/))
- **Handled today:** Nothing is tied to one device: any browser, any size, any brand, rugged or not.
- **Still open:** Choose rugged, ESD-safe tablets and mounts, and test the screen with gloves before buying.

### Every company has different systems

SAP, Priority, Oracle, Arena, Windchill, Excel: each with its own codes and exports.

- **Seen elsewhere:** Integration with ERP and MES is a recurring cause of failure; classic MES projects take 18 to 36 months to the first site. ([Panorama Consulting](https://www.panorama-consulting.com/top-reasons-for-mes-failure-and-why-executives-miss-them-early/), [Tulip](https://tulip.co/blog/why-mes-adoption-fails-at-scale/))
- **Handled today:** Plain CSV and JSON imports work with any system's export, and any code works anywhere.
- **Still open:** Read-only connectors for the most common ERP and PLM systems, starting with the pilot company's own.

### Scanning in real conditions

Glare, worn labels, tiny parts with no label at all.

- **Seen elsewhere:** Barcode scanning that works in the office fails under bench lights.
- **Handled today:** Camera scanning, handheld scanners, typing, reading a code from a photo, plus true-scale labels to check by eye.
- **Still open:** Test with the real lights and labels; agree a label standard for bins.

### AI that makes things up

A confident, wrong answer about a torque or a safety step can hurt someone.

- **Seen elsewhere:** Practitioners warn that a confidently wrong answer about a safety procedure can be catastrophic, recommend grounding answers in verified documents with citations, and keep safety-critical content under human approval. NIST lists confabulation among the main risks. ([iFactory](https://ifactoryapp.com/article/ai-hallucination-manufacturing-grounding-strategy), [IndustryWeek](https://industryweek.com/technology-and-iiot/emerging-technologies/article/55316007/making-generative-ai-work-for-everyone-in-a-factory-setting))
- **Handled today:** Ask answers from the data itself, without AI, and shows the source of every answer. The optional AI only sees the company's records, must cite them, is told to refuse when the records do not answer, and never edits instructions.
- **Still open:** Test the AI on a set of real questions before turning it on, and keep it off for safety-critical steps until reviewed.

## Security, IP and compliance

### The data belongs to the customer

A contract manufacturer builds for customers who own the drawings, BOMs and part numbers. Putting them into a new system may break the contract.

- **Seen elsewhere:** Guides advise stating in contracts that BOM and sourcing data belong to the product owner, and note that an NDA alone is not enough. ([OpenBOM](https://www.openbom.com/blog/4-questions-to-ask-your-contract-manufacturer-before-sharing-product-data), [Fractory](https://fractory.com/intellectual-property-protection/))
- **Handled today:** Each company (or each customer) is a separate space; data can stay on the device or on a server the company runs itself.
- **Still open:** Get the customer's written approval before loading their data, and keep one space per customer.

### Fear of the cloud

Manufacturers worry that product data stored outside the plant will leak.

- **Seen elsewhere:** Security publications describe this as the core fear; attackers increasingly target intellectual property. ([Fractory](https://fractory.com/intellectual-property-protection/))
- **Handled today:** Row-level security tested on a real database: one company never sees another, operators cannot publish or rewrite records, published versions cannot be changed. The server can be self-hosted.
- **Still open:** An independent security review, single sign-on with the company's accounts, and a data processing agreement.

### Regulated production

In medical devices, software that guides or records production is part of the quality system: it must be validated, and electronic records and signatures have their own rules. Every vendor update can force a revalidation.

- **Seen elsewhere:** Guides on the FDA QMSR (in force since February 2026, aligned with ISO 13485) and 21 CFR Part 11 list validation, audit trails and integration with production records as requirements. ([eDHR and the QMSR](https://meddeviceguide.com/blog/electronic-device-history-record-edhr-digital-manufacturing-qmsr-2026-guide))
- **Handled today:** Library versions are append-only, every publish and role change is logged, build records keep each scan and each override with who decided it.
- **Still open:** A validation package (requirements, risk assessment, test scripts), electronic signatures, and the option to pin a validated version per site.

### Export-controlled technical data

Some products carry drawings that may not be shown to foreign persons or stored abroad.

- **Seen elsewhere:** Vendors serving regulated industries offer on-premises or country-specific hosting for this reason. ([Fractory](https://fractory.com/intellectual-property-protection/))
- **Handled today:** Fully on-device mode, or a self-hosted server in the right country.
- **Still open:** Not handled: access by nationality. Keep such products out until it is.

## The business

### A crowded market of big platforms

Digital work instruction and connected worker platforms already exist and are being bought by larger software companies.

- **Seen elsewhere:** IFS bought Poka, a connected worker platform with about 250,000 users, in 2023. VKS, Tulip, Dozuki, SwipeGuide, Azumuta and others compete for the same buyers. ([IFS acquires Poka (2023)](https://www.ifs.com/news/corporate/ifs-acquires-poka))
- **Handled today:** RightPart focuses on what they rarely do: one identity for every part code, look-alike guards and the BOM-versus-instructions check.
- **Still open:** Decide the position: a product of its own, or a part-identity and integrity layer that plugs into the existing platforms.

### Platforms disappear

Companies that built their instructions on one vendor's platform can lose it.

- **Seen elsewhere:** Microsoft stopped selling Dynamics 365 Guides and Remote Assist in November 2025 and ends them on 31 December 2026; HoloLens 2 production ended in 2024 with no successor. ([Microsoft Learn](https://learn.microsoft.com/en-us/dynamics365/mixed-reality/remote-assist/ra-overview))
- **Handled today:** Standard web technology on ordinary devices, and every piece of data exports to plain JSON and CSV.
- **Still open:** Promise customers a full export at any time, in writing.

### Betting on special hardware

Products that need new hardware on every bench are expensive to buy and slow to roll out.

- **Seen elsewhere:** DAQRI raised about 275 million dollars for an industrial AR helmet priced around 15,000 dollars and shut down in 2019. ([Engadget](https://engadget.com/2019/09/13/daqri-ar-headset-startup-closing))
- **Handled today:** Needs nothing new: the phones, tablets and scanners factories already have.
- **Still open:** Add AR or projection only when a customer asks and pays for it.

### Stuck in pilot

A pilot that never becomes a rollout, because nobody agreed what success means.

- **Seen elsewhere:** Vendors often quote a high failure rate for digital transformation; the numbers are not independent, but the pattern of endless pilots is widely reported. ([Manual.to](https://manual.to/the-paper-to-digital-sop-playbook/), [Tulip](https://tulip.co/blog/why-mes-adoption-fails-at-scale/))
- **Handled today:** Build records already count wrong parts stopped, steps completed and questions answered.
- **Still open:** Agree three numbers before the pilot starts (for example: wrong parts stopped, onboarding time for a new operator, questions answered without a supervisor) and a date to decide.

### Who is responsible when it is wrong?

If bad data shows a wrong torque and a device fails, who answers for it?

- **Seen elsewhere:** Every system that guides production faces this question.
- **Handled today:** Answers come with their source; the integrity check flags inconsistent data; the demo states its values are illustrative.
- **Still open:** Terms of use that keep released documents as the authority, and an engineering approval step before a library version is published.

## For you, as the person with the idea

### Who owns the idea?

An idea developed during work hours, on company equipment or with company data may belong to the employer under your contract.

- **Seen elsewhere:** Employment contracts commonly include invention and IP clauses.
- **Handled today:** This prototype uses only fictional data and was built outside the company's systems.
- **Still open:** Read your contract, and talk to your manager before using any company data. Presenting it as an improvement for your team is the safest and often the most rewarding path.

## Sources

- [Manual.to: The paper-to-digital SOP playbook](https://manual.to/the-paper-to-digital-sop-playbook/)
- [Fabrico: Digital work instructions vs paper](https://www.fabrico.io/blog/digital-work-instructions-vs-paper/)
- [Fabrico: OEE monitoring and works council approval](https://www.fabrico.io/blog/oee-monitoring-works-council-approval-guide/)
- [Panorama Consulting: Top reasons for MES failure](https://www.panorama-consulting.com/top-reasons-for-mes-failure-and-why-executives-miss-them-early/)
- [Tulip: Why MES adoption fails at scale](https://tulip.co/blog/why-mes-adoption-fails-at-scale/)
- [Why connected worker strategies are leaving workers behind](https://www.pulse.bot/manufacturing/news/why-connected-worker-strategies-are-leaving-workers-behind-bc0eb2a2-372c-43d7-8e05-ba5ae8f5cb95)
- [iFactory: AI hallucination in manufacturing, grounding strategy](https://ifactoryapp.com/article/ai-hallucination-manufacturing-grounding-strategy)
- [IndustryWeek: Making generative AI work for everyone in a factory](https://industryweek.com/technology-and-iiot/emerging-technologies/article/55316007/making-generative-ai-work-for-everyone-in-a-factory-setting)
- [OpenBOM: Questions to ask your contract manufacturer before sharing product data](https://www.openbom.com/blog/4-questions-to-ask-your-contract-manufacturer-before-sharing-product-data)
- [Fractory: IP protection in cloud manufacturing](https://fractory.com/intellectual-property-protection/)
- [Microsoft Learn: Dynamics 365 Remote Assist and Guides end of availability](https://learn.microsoft.com/en-us/dynamics365/mixed-reality/remote-assist/ra-overview)
- [Engadget: AR headset startup Daqri is closing](https://engadget.com/2019/09/13/daqri-ar-headset-startup-closing)
- [IFS acquires Poka (2023)](https://www.ifs.com/news/corporate/ifs-acquires-poka)
- [eDHR and the QMSR: 2026 guide](https://meddeviceguide.com/blog/electronic-device-history-record-edhr-digital-manufacturing-qmsr-2026-guide)
