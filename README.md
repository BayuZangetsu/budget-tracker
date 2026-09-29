# Budget Tracker — Envelope Budgeting with Pockets

A personal finance tracker built on **envelope budgeting**. It runs entirely
in one browser: no server, no account, no build step. Your data lives only in
that browser's `localStorage` and is never sent anywhere.

## Getting started

**Live version:** <https://bayuzangetsu.github.io/budget-tracker/>

Or open **`index.html`** by double-clicking it. That is the whole install.

No `npm install`, no server. An internet connection is optional: Chart.js and
SheetJS are loaded from a CDN, and if that fails the app still works — you
just lose the charts and the Excel export.

> **Important:** data is stored per browser, per URL. If you open the file
> over `file://`, your data is there and nowhere else. Copying the HTML file
> to another computer does **not** bring the data with it — unless you use the
> Copy Data / Paste Data feature.

## The model

A **pocket** is a category of stored money. Income is not spent directly; it
is *allocated* into pockets, and expenses are then recorded against a pocket.

The interface says **plot** where the code says **allocation** — they are the
same action.

| Term | Meaning |
|---|---|
| **Pocket** | A storage category (Electricity, Groceries, Savings, ...) |
| **Allocate** | Move money from "free cash" into a pocket |
| **Monthly target** | The per-month allocation target for a pocket — a persistent setting |
| **Transfer** | Move money from one pocket to another (both sides, always balanced) |
| **Free cash** | Money not yet allocated — closes to the `__cash__` sentinel |
| **Pocket balance** | **Accumulates across every month.** Last month's remainder is never lost |

Spending past a pocket's balance is allowed. The card turns red and the figure
goes negative, but nothing is blocked and nothing is rounded.

### Auto Allocate (one click)

Every pocket has a `monthlyTarget`: how much you intend to put into it each
month. Instead of allocating pocket by pocket every time, click
**⚡ Auto Allocate All Pockets (1 click)**:

- Each row shows the **shortfall toward the target** (`target − already
  allocated`), not the full target. So it is safe to click repeatedly — it
  never stacks.
- The value in that modal is **for this month only**. Changing it does not
  touch the template.
- If the total exceeds the money still unallocated, it still goes through but
  asks for confirmation, naming the shortfall.

Need to go above the target? Use the regular **⚡ Allocate** button.

The template itself lives in **⚙ Manage Plot Template**, or per pocket
through the **✎** button. Pockets created before this feature existed start
at a target of `0` — fill them in from either of those two places.

## Files

### The app (3 files, this is all you need)

| File | Contents |
|---|---|
| `index.html` | Markup only, with inline `onclick` handlers |
| `styles.css` | Styles |
| `app.js` | All of the logic |

There is no build step. To change something, edit the file and reload.

### Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages
after every push to `main`. There is nothing to compile, so the job only
uploads the files.

Pages must already be switched on for the repository
(**Settings → Pages → Source: GitHub Actions**). The workflow cannot enable
it itself — the job's own token is not allowed to create the Pages site.

The entry file is named `index.html` so the site root resolves without a
redirect.

### Export / Import JSON

For backup or moving data between browsers, use the **Copy & Paste Data Between
Months** section in the app. Two new buttons:

- **Download JSON** — exports the entire `localStorage` as a JSON file to your
  downloads folder
- **Import JSON** — restores from a previously downloaded JSON file

Both are client-side only. No server, no upload, no account.

### Tests

There are no automated tests. The suites that used to live here (9 files,
887 assertions) were removed to keep the repository down to the three files
the app actually needs.

That is a deliberate trade, not an oversight — but it has a cost worth
naming. The `type="number"` defect that silently turned `"1.250.750"` into
an empty string was never caught by a test; it only surfaced by hand in a
real browser. **For any change that touches an input or a render, open the
app and try it.** Checking a change in a real browser is not optional here.

## Things worth knowing

- **Data is not encrypted**, and it is tied to that browser and that URL.
  Clearing site data, or using a private window, deletes it. Use **Copy Data**
  periodically as a backup.
- The Excel export produces one file for the current month
  (`Budget_Pockets_<Month>_<Year>.xlsx`) with 6 sheets: Summary, Pockets,
  Income, Allocations, Expenses, Transfers. Chart.js and SheetJS come from a
  CDN, so the internet is needed **only** for that feature.
- There is no cross-device sync. Moving to another device means copying and
  pasting by hand.
- Amount inputs are `type="text"` with `inputmode="numeric"`, not
  `type="number"`. That is deliberate: `type="number"` discards the text of
  `"1.250.750"` and `"abc"` with no trace, which would turn a typo into a
  silent Rp 0. No `min` or `step` attribute is set, for the same reason.
- Numbers are formatted with `toLocaleString('id-ID')`, so rupiah amounts read
  as `Rp 1.500.000`.
