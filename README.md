# Budget Tracker — Envelope Budgeting with Pockets

A personal finance tracker built on **envelope budgeting**. It runs entirely
in one browser: no server, no account, no build step. Your data lives only in
that browser's `localStorage` and is never sent anywhere.

## Getting started

Open **`index.html`** by double-clicking it. That is the whole install.

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

### Export / Import JSON

For backup or moving data between browsers, use the **Copy & Paste Data Between
Months** section in the app. Two new buttons:

- **Download JSON** — exports the entire `localStorage` as a JSON file to your
  downloads folder
- **Import JSON** — restores from a previously downloaded JSON file

Both are client-side only. No server, no upload, no account.

### Tests

9 suites, 887 assertions, no dependencies (`jsdom` is not used — the DOM is
stubbed by hand).

```bash
node test-ledger.js      # ledger arithmetic and two-sided balance
node test-wiring.js      # every id app.js reads exists; every handler resolves
node test-render.js      # escaping: no injection through a pocket name
node test-tanggal.js     # the transaction date field, end to end
node test-periode.js     # the month/year switch guards
node test-perbaiki.js    # the duplicate detector and the repair script
node test-jumlah.js      # amount inputs: no broken amount ever becomes Rp 0
node test-template.js    # the target template and one-click auto allocate
node test-kontrak.js     # pins the exact localStorage format
node audit-typo.js       # gate: leftover Indonesian, mangled spellings, non-Latin
```

Every suite must print `FAIL: 0`, and `audit-typo.js` must print `CLEAN`.

> Stub-based tests are not exhaustive. The `type="number"` defect that
> silently turned `"1.250.750"` into an empty string was **never** visible
> from a test — it only showed up in a real browser. For any change that
> touches an input or a render, still try it by hand.

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
