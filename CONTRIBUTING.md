# Contributing / Developing RecordsGuard FL

This is a **static site** — plain HTML, CSS, and vanilla JavaScript with **no build
step and no dependencies**. If you can edit a text file and open a browser, you can
work on it.

- **Active branch:** `claude/florida-hoa-records-portal-gywq8p`
- **Repo:** `smg1129-cloud/TrackStart`

---

## 1. Get the code on your machine

### Easiest (graphical, good if you don't live in a terminal)

1. Install **[GitHub Desktop](https://desktop.github.com/)** and sign in.
2. Install **[VS Code](https://code.visualstudio.com/)** (the editor).
3. GitHub Desktop → **File → Clone repository →** `smg1129-cloud/TrackStart`.
4. **Current Branch** dropdown → `claude/florida-hoa-records-portal-gywq8p`.

### Command line

```bash
git clone https://github.com/smg1129-cloud/TrackStart.git
cd TrackStart
git checkout claude/florida-hoa-records-portal-gywq8p
```

---

## 2. Preview it locally

Pick any one. The site must be served over HTTP (not opened as a `file://` path),
because the pages load shared CSS/JS.

```bash
python3 -m http.server 8000     # then open http://localhost:8000
# or
npx serve .                     # prints a local URL
```

In VS Code you can instead install the **Live Server** extension, then right-click
`index.html` → *Open with Live Server*.

There's **no compile step** — edit a file, save, refresh the browser.

---

## 3. Project map

```
index.html            Home (public)
how-it-works.html     The workflow / the three areas (public)
law.html              Ch. 718 & 720 records reference (public)
faq.html              FAQ (public)
contact.html          Demo request form (public)
portal.html           Client digitization portal (app)
owners.html           Owner records request portal (app)
assets/
  css/site.css        Shared design system (all colors/spacing are CSS variables at the top)
  js/data.js          Domain model: records taxonomy, protected lists,
                      sensitive-info detectors, deadlines/penalties
  js/store.js         Shared browser-local state (localStorage)
  js/site.js          Shared header/footer injected into every public page
  js/portal.js        Client portal logic + simulated AI pipeline
  js/owners.js        Owner portal logic
  favicon.svg
.github/workflows/pages.yml   Deploys the site to GitHub Pages
```

### Where to make common changes

| I want to change… | Edit… |
| --- | --- |
| The records categories / folders, retention, or citations | `assets/js/data.js` (`CONDO_CATEGORIES`, `HOA_CATEGORIES`) |
| Which sensitive data gets flagged | `assets/js/data.js` (`DETECTORS`) |
| Protected / withheld record types | `assets/js/data.js` (`CONDO_PROTECTED`, `HOA_PROTECTED`) |
| Deadlines, penalties, checklist rules | `assets/js/data.js` (`RULES`) |
| Colors, fonts, spacing | CSS variables at the top of `assets/css/site.css` |
| Nav links / footer | `assets/js/site.js` |
| Marketing copy | the relevant `*.html` page |
| Client-portal behavior (upload, review, fulfillment) | `assets/js/portal.js` |
| Owner-portal behavior | `assets/js/owners.js` |

`assets/js/data.js` is the **single source of truth** — the public pages and both
portals all read from it, so a change there propagates everywhere.

---

## 4. Sanity checks before you commit

No test suite yet, but two quick checks catch most breakage:

```bash
# 1. JavaScript still parses
for f in assets/js/*.js; do node --check "$f" && echo "ok $f"; done

# 2. Click through the app in the browser:
#    Client Login -> Use demo account -> Load sample records
#    -> Review queue -> Owner request -> Fulfill & generate checklist
```

---

## 5. Save and share your changes

### GitHub Desktop
Review the changed files → write a summary → **Commit to
`claude/florida-hoa-records-portal-gywq8p`** → **Push origin**.

### Command line

```bash
git pull                    # get any changes made elsewhere first
git add -A
git commit -m "Describe what you changed"
git push
```

If a push asks for a password, use a **GitHub personal access token** or install the
**[GitHub CLI](https://cli.github.com/)** and run `gh auth login` once.

Pushing to this branch automatically updates the open pull request.

---

## 6. Working alongside Claude Code

This project is often edited with Claude Code (web or CLI). Both push to the **same
branch**, so:

- Run `git pull` **before** you start editing locally.
- Run `git pull` again to bring down changes made in a web session.
- Let only one place edit at a time to avoid merge conflicts.

To use Claude Code locally (requires [Node.js](https://nodejs.org)):

```bash
npm install -g @anthropic-ai/claude-code
cd TrackStart
claude
```

---

## 7. Deployment

`.github/workflows/pages.yml` publishes the site to GitHub Pages. GitHub serves
**one** Pages site per repository, and the `github-pages` environment only allows
deploys from approved branches (currently `main`). To publish:

- **Merge to `main`** → auto-deploys to `https://smg1129-cloud.github.io/TrackStart/`, **or**
- Add this branch under **Settings → Environments → github-pages → Deployment
  branches**, then re-run the workflow.

Because it's a plain static site, it can alternatively be hosted on any static host
(Netlify, Cloudflare Pages, S3, etc.).

---

## Scope reminder

This is a **prototype**: AI, authentication, and storage run client-side to
demonstrate the workflow. See the "From prototype to production" section of the
[README](README.md) for what a production build adds. Nothing here is legal advice.
