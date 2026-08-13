# RecordsGuard FL

**Records-inspection compliance for Florida condominium (Ch. 718) and homeowners (Ch. 720) associations.**

RecordsGuard FL helps associations meet their statutory duty to respond to owner
records-inspection requests: digitize official records once, let an AI component
organize and screen them, and fulfill every owner request with a defensible,
audit-ready trail — including the records checklist Chapter 718 now requires.

> This repository is a **deployable static prototype**. It demonstrates the full
> user experience end-to-end with an on-device (in-browser) AI simulation. It is
> **not** legal advice, and the AI/auth/storage layers are stubs intended to show
> the workflow and product design, not a production system. See
> [Production notes](#from-prototype-to-production).

---

## The three areas

The site is organized around how a records request actually flows.

1. **Public informational site** — plain-language explanations of the Ch. 718 and
   Ch. 720 records-inspection requirements: what records must be maintained,
   retention periods, response deadlines, protected records, and penalties.
   - `index.html` · `how-it-works.html` · `law.html` · `faq.html` · `contact.html`

2. **Client digitization area** (password-protected) — associations upload their
   records. The AI reads each document, files it into the correct statutory
   category, and **flags anything with sensitive information** (SSNs, bank/account
   numbers, protected health information, driver-license numbers, personal contact
   info) into a human review queue before anything can be released.
   - `portal.html` (demo login — any credentials, or the "Use demo account" link)

3. **Owner request portal** — owners submit and track inspection requests against
   the statutory clock. The association fulfills the request and the system
   generates the **records checklist** (mandatory for condominiums since 2024;
   produced for HOAs too as best practice), documenting what was provided,
   redacted, or withheld — with the statutory basis for each.
   - `owners.html`

The client portal and owner portal share a browser-local data store, so a request
submitted by an owner appears in the association's portal for fulfillment, and the
resulting records + checklist appear back in the owner's tracker.

---

## Try it locally

It's a static site — no build step.

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

Suggested walkthrough:

1. Open **Client Login** → *Use demo account* → **Load sample records**.
2. Watch the AI categorize each file and flag three of them. Open **Review queue**
   and redact/approve or withhold each flagged document.
3. In a second tab, open **Owner Records Request**, submit a request for *All
   official records*.
4. Back in the client portal → **Owner requests** → *Fulfill & generate checklist*.
5. In the owner tab → **Track my requests** → enter the same email to see the
   released records and the checklist.

Use **Settings** in the client portal to switch the association between
Condominium (718) and HOA (720) and to reset the demo data.

---

## Project structure

```
index.html            Home (public)
how-it-works.html     The workflow / the three areas (public)
law.html              Ch. 718 & 720 records reference (public)
faq.html              FAQ (public)
contact.html          Demo request form (public)
portal.html           Client digitization portal (app)
owners.html           Owner records request portal (app)
assets/
  css/site.css        Shared design system
  js/data.js          Domain model: records taxonomy, protected lists,
                      sensitive-info detectors, deadlines/penalties
  js/store.js         Shared browser-local state (localStorage)
  js/site.js          Shared header/footer for public pages
  js/portal.js        Client portal logic + simulated AI pipeline
  js/owners.js        Owner portal logic
  favicon.svg
```

`assets/js/data.js` is the single source of truth for the statutory taxonomy and
is consumed by the public pages **and** both portals.

---

## From prototype to production

The prototype deliberately runs client-side. A production build would add:

- **Real authentication & tenancy** — encrypted logins, per-association data
  isolation, and roles for board members, managers, and counsel.
- **Server-side storage** — encrypted document storage with immutable audit logs
  of every access and disposition.
- **A real document-AI pipeline** — OCR + a vision/LLM model to read scanned pages,
  classify records, and detect sensitive data (replacing the regex/keyword
  heuristics in `data.js`), always with human-in-the-loop confirmation before
  release.
- **Redaction tooling** — actual redaction of flagged content rather than a status
  flag.
- **Deadline automation** — reminders and escalation tied to the 10-day clock.

---

## Deployment

A GitHub Actions workflow (`.github/workflows/pages.yml`) publishes the site to
GitHub Pages on pushes to this branch. Because it's a plain static site, it can be
hosted anywhere.

---

## Disclaimer

Informational only and **not legal advice**. Use of this site does not create an
attorney-client relationship. Statutory summaries are provided for product-design
purposes; always confirm requirements against the current official text of
Chapters 718 and 720, Florida Statutes.
