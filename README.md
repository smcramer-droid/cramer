# Pool Care Guide Generator

Internal tool that generates branded new-pool care guides (Traditional, Hot Start, or
Full-Service), lets you customize the content per-customer, saves drafts to come back
to, and exports a print-ready PDF via the browser's native print dialog.

## What it is

A single `index.html` file — no build step, no backend, no dependencies. Deploys as a
static Cloudflare Pages site.

## Workflow

1. **Pick a template.** Enter project/customer name, select Traditional / Hot Start /
   Full-Service, hit Generate.
2. **Review or customize.** The preview opens read-only. Click **✎ Edit** in the
   toolbar to switch into edit mode — every piece of text becomes clickable and
   typeable. Pressing Enter in a bullet list adds a new bullet; Backspace at the start
   of an empty line removes it. The design stays intact the whole time.
3. **Save a draft** (optional). Click **💾 Save Draft** to stash the current state in
   your browser's local storage. Drafts show up on the form view under *Continue
   editing* so you can reopen and keep working.
4. **Save as PDF.** Click **Save as PDF / Print**. In the browser's print dialog,
   choose destination **"Save as PDF"**, name the file, and save.

The customer name replaces "The First 28 Days" in the heading — e.g.,
"Your New Pool — *Smith Residence*"

## Deploy (first time)

From this directory:

```bash
npx wrangler pages deploy . --project-name=pool-care-generator
```

That creates **pool-care-generator.pages.dev** and prints the URL.

## Deploy (updates)

Same command. Wrangler re-uses the existing project.

## Alternative: add to your existing tools project

If you'd rather put this under `tools.pasadena-pools.pages.dev` alongside the dig
sheet tool and cover box calculator, copy `index.html` into that project's repo at
`/pool-care-generator/index.html` and push. It'll live at
`tools.pasadena-pools.pages.dev/pool-care-generator/`.

## Notes on drafts

- Drafts are stored in **localStorage** — meaning they live in the browser on whatever
  device you used, and don't sync between devices. If you need cross-device access,
  see the "Future: cloud drafts" section below.
- Up to ~5 MB of drafts per device (hundreds of guides).
- Drafts include the full edited HTML, so every customization survives reload.
- Deleting a draft is permanent (no undo).

## Why not Google Docs?

Short answer: the design wouldn't survive. Google Docs can't render the navy hero
strip, gradient cards, color-coded warnings, or the single-page print layout. Going
the Docs route would mean stripping the guide down to plain text and tables, which
makes it much less useful as a customer handoff.

Editing directly in the browser via `contenteditable` keeps the full design intact and
feels Docs-like — click any text, type, done.

## Editing the base templates

Open `index.html` and find the `GUIDE_DATA` JavaScript object near the top of the
`<script>` block. Each guide has:

- `label`, `description` — shown in the picker
- `eyebrow` — small caps subtitle under the main heading
- `hero` — `{ icon, text }` for the dark navy callout strip
- `cards` — array of 4 cards, each with `cls`, `num`, `title`, `icon`, `items[]`
- `fyiSubtitle` — italic caption for the "A Few Things That Are Normal" block
- `fyi` — array of 4 normal-things bullets

Card CSS classes available: `""` (default white), `"card-warn"` (sunset warning),
`"card-ours"` (soft blue — "we're doing this"), `"card-phase1"` (sunset, same as
warn), `"card-milestone"` (sunset with handshake vibe).

The shared cover-care section and footer are in `COVER_CARD_HTML` and `FOOTER_HTML`
below the guide data.

## Future: cloud drafts (if you want shareable URLs)

Today drafts are browser-local. If you want drafts you can share (e.g., "here's
Scott's edit, review it from your laptop"), the upgrade is:

1. Add a Cloudflare KV namespace + binding
2. Add `functions/api/draft/[id].ts` using `PagesFunction` with the binding
3. Change `saveDraft` / `loadDraft` in the JS to POST/GET against that function
4. Drafts get a URL like `pool-care-generator.pages.dev/?draft=abc123` — open that
   URL anywhere to edit

Scope is ~30 lines of Worker code + a wrangler.toml binding. Holler if you want it.
