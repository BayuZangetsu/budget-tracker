/* =====================================================================
   cek-data.js — verify the user's REAL data using the real app logic.

   How to use it:
     1. Open budget-tracker.html in Firefox
     2. Press F12 -> Console
     3. Paste the snippet below -> Enter  (copies income to the clipboard)
     4. Paste it here, then save to a file data-user.json
     5. Run:  node cek-data.js data-user.json

   No browser and no server needed. It loads app.js exactly as it is.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || 'data-user.json';
if (!fs.existsSync(FILE)) {
  console.log('File not found: ' + path.resolve(FILE));
  console.log('First save the localStorage copy from the Firefox console to that file.');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/* ---------- localStorage stub, filled from the real data ---------- */
const store = new Map(Object.entries(raw));
const writeLog = [];
global.localStorage = {
  get length() { return store.size; },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); writeLog.push(k); },
  removeItem: k => { store.delete(k); writeLog.push('DEL:' + k); },
  clear: () => store.clear()
};

/* ---------- DOM stub ---------- */
let period = { month: 9, year: 2026 };
const elements = new Map();
function makeEl(id) {
  return {
    id,
    value: id === 'month' ? String(period.month)
         : id === 'year' ? String(period.year)
         : '',
    min: '', max: '', textContent: '', innerHTML: '', hidden: true,
    dataset: {}, style: {}, className: '', title: '',
    focus() {}, scrollIntoView() {}, getContext: () => ({}),
    addEventListener() {}, appendChild() {}, remove() {},
    closest: () => null, offsetWidth: 0,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } }
  };
}
function el(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); }
global.document = {
  readyState: 'complete',
  getElementById: id => el(id),
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => makeEl('new')
};
global.navigator = {};
global.Chart = class { constructor() { this.destroyed = false; } destroy() { this.destroyed = true; } };
global.setTimeout = () => 0;
global.clearTimeout = () => {};

/* ---------- Load app.js exactly as it is ---------- */
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const POCKETS_VAR = 'pockets';
const app = new Function('VARNAME', src + `
;var _read = function(){ return eval(VARNAME); };
;return {
  get Pockets(){return _read()}, set Pockets(v){ eval(VARNAME + ' = v') },
  get data(){return data}, set data(v){data=v},
  get archive(){return archive}, set archive(v){archive=v},
  CASH, POCKETS_KEY, allMonthKeys,
  loadMonth, saveMonth, normalizeMonth, emptyMonth, computeArchive, renderAll,
  loadPockets, savePockets, pocketName, periodLabel, currentPeriod,
  safeDate, shortDate, num, fmt, fmtShort
};`)(POCKETS_VAR);

/* ---------- Display helpers ---------- */
const rupiah = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const line = (c = '=') => console.log(String(c).repeat(72));
let problems = 0;
function row(name, detail) { console.log('  ' + name.padEnd(46) + detail); }
function flag(name, detail) { problems++; console.log('  ! ' + name + ' -> ' + detail); }

/* =====================================================================
   PART 1 — what is in localStorage
   ===================================================================== */
line('=');
console.log('REAL DATA FROM FIREFOX');
line('=');
/* Sort months numerically, not as text. Text order puts October before
   September because "10" sorts lower than "9". */
function byPeriod(a, b) {
  const ap = a.split('_'), bp = b.split('_');
  const diff = parseInt(ap[1], 10) - parseInt(bp[1], 10);
  if (diff) return diff;
  return parseInt(ap[2], 10) - parseInt(bp[2], 10);
}
const monthKeys = Object.keys(raw).filter(k => /^budget_tracker_\d{4}_\d{1,2}$/.test(k)).sort(byPeriod);
const otherKeys = Object.keys(raw).filter(k => !/^budget_tracker_\d{4}_\d{1,2}$/.test(k));
console.log('  Total keys          : ' + Object.keys(raw).length);
console.log('  Month keys          : ' + monthKeys.length + (monthKeys.length ? '  (' + monthKeys.join(', ') + ')' : ''));
console.log('  Non-month keys      : ' + (otherKeys.length ? otherKeys.join(', ') : '(none)'));
line();

/* =====================================================================
   PART 2 — cross-month overwriting traces
   ---------------------------------------------------------------------
   The old bug: moving the month dropdown wrote the month currently on
   screen under the TARGET month's key. Several months could then hold
   byte-identical copies. Such a group is an overwriting trace, and only
   one member of the group can be the real data.
   ===================================================================== */
line('=');
console.log('CROSS-MONTH OVERWRITING TRACES');
line('=');

function countColumns(d) {
  return {
    income: (d.income || []).length,
    expenses: (d.expenses || []).length,
    allocations: (d.allocations || []).length,
    transfers: (d.transfers || []).length
  };
}
function summariseColumns(d) {
  const c = countColumns(d);
  return 'income ' + c.income + ', expenses ' + c.expenses
       + ', allocations ' + c.allocations + ', transfers ' + c.transfers;
}

const groups = new Map();
monthKeys.forEach(k => {
  let body = raw[k];
  try { body = JSON.stringify(JSON.parse(body)); } catch (e) { body = 'RAW:' + body; }
  if (!groups.has(body)) groups.set(body, []);
  groups.get(body).push(k);
});

const duplicates = [...groups.entries()].filter(e => e[1].length > 1);

if (!duplicates.length) {
  console.log('  No months with identical content. No overwriting trace.');
} else {
  console.log('  Found ' + duplicates.length + ' group(s) of duplicate months.');
  duplicates.forEach(entry => {
    const ks = entry[1];
    const lines = ks.map(k => {
      let d = {};
      try { d = JSON.parse(raw[k]); } catch (e) { /* ignore */ }
      return '      ' + k.padEnd(24) + summariseColumns(d);
    }).join('\n');
    flag(ks.length + ' months contain byte-identical copies',
      'only one of them can be real');
    console.log(lines);
  });
  console.log('');
  console.log('  How to repair it:');
  console.log('    1. Open budget-tracker.html in Firefox');
  console.log('    2. Press F12 -> Console');
  console.log('    3. Copy the whole file perbaiki-duplikat.js, then press Enter');
  console.log('    4. Follow the instructions that appear on screen');
  console.log('');
  console.log('  THE SCRIPT CREATES AN AUTO BACKUP BEFORE CHANGING ANYTHING.');
}
line();

/* =====================================================================
   PART 3 — pockets
   ===================================================================== */
const PKEY = Object.keys(raw).find(k => !/^budget_tracker_\d{4}_\d{1,2}$/.test(k));
if (!PKEY) {
  console.log('No global pocket key found. The data may never have been saved.');
} else {
  const pocketList = JSON.parse(raw[PKEY]);
  console.log('Pockets: ' + pocketList.length);
  app.Pockets = pocketList;
  app.savePockets();
  console.log('');
  app.renderAll();
  const balances = app.archive.balances;
  row('NAME', 'BALANCE');
  for (const p of app.Pockets) {
    const s = balances[p.id];
    const v = s ? s.balance : null;
    const mark = v == null ? 'MISSING' : v < 0 ? 'OVER ' + rupiah(v) : rupiah(v);
    console.log('  ' + (p.icon + ' ' + p.name).padEnd(30) + mark);
  }
  if (app.archive.cash) row('💵 Cash outside pockets', rupiah(app.archive.cash.total));
  line();
}

/* =====================================================================
   PART 4 — month by month
   ===================================================================== */
console.log('');
line('=');
console.log('MONTH BY MONTH');
line('=');

let totalIncome = 0, totalExpenses = 0;
for (const key of monthKeys) {
  const m = key.match(/^budget_tracker_(\d{4})_(\d{1,2})$/);
  period = { month: Number(m[2]), year: Number(m[1]) };
  el('month').value = String(period.month);
  el('year').value = String(period.year);

  app.data = app.emptyMonth();
  app.loadMonth();
  const d = app.data;

  const income = d.income.reduce((s, x) => s + app.num(x.amount), 0);
  const expenses = d.expenses.reduce((s, x) => s + app.num(x.amount), 0);
  const allocated = d.allocations.reduce((s, x) => s + app.num(x.amount), 0);
  const transfers = d.transfers.reduce((s, x) => s + app.num(x.amount), 0);
  totalIncome += income;
  totalExpenses += expenses;

  console.log('');
  console.log('  ' + key + '  (' + app.periodLabel(period) + ')');
  row('  income', income + '   ' + rupiah(income));
  row('  expenses', expenses + '   ' + rupiah(expenses));
  row('  allocations to pockets', d.allocations.length + '   ' + rupiah(allocated));
  row('  transfers', d.transfers.length + '   ' + rupiah(transfers));
  if (!d.expenses.length && !d.income.length) row('  ', '(month is empty)');

  /* Dates: how many are filled in */
  const dated = d.expenses.filter(x => app.safeDate(x.date));
  const undated = d.expenses.length - dated.length;
  if (d.expenses.length) {
    row('  expenses with a date', dated.length + '/' + d.expenses.length +
      (undated ? '   (' + undated + ' still empty)' : ''));
  }

  /* A pocket balance ACCUMULATES across months, so the invariant can only
     be checked once every month has been processed, not month by month. */
}

/* =====================================================================
   PART 5 — money invariants, after every month has been processed
   ===================================================================== */
console.log('');
line('=');
console.log('MONEY INVARIANTS (after every month)');
line('=');
if (monthKeys.length) {
  const m = monthKeys[monthKeys.length - 1].match(/^budget_tracker_(\d{4})_(\d{1,2})$/);
  period = { month: Number(m[2]), year: Number(m[1]) };
  el('month').value = String(period.month);
  el('year').value = String(period.year);
  app.data = app.emptyMonth();
  app.loadMonth();
  app.renderAll();

  const pocketTotal = Object.values(app.archive.balances).reduce((s, x) => s + x.balance, 0);
  const cash = app.archive.cash ? app.archive.cash.total : 0;
  const grand = pocketTotal + cash;
  const expected = totalIncome - totalExpenses;
  row('total income, all months', rupiah(totalIncome));
  row('total expenses, all months', rupiah(totalExpenses));
  row('expected (income - expenses)', rupiah(expected));
  row('total pocket balance', rupiah(pocketTotal));
  row('cash outside pockets', rupiah(cash));
  row('pocket + free cash', rupiah(grand));
  if (Math.abs(grand - expected) > 0.5) {
    flag('money mismatch', rupiah(grand - expected));
  } else {
    console.log('  ✓ consistent: no rupiah went missing or appeared out of nowhere');
  }
}

/* =====================================================================
   PART 6 — what the expenses table will show
   ===================================================================== */
console.log('');
line('=');
console.log('WHAT WILL APPEAR ON SCREEN');
line('=');
if (monthKeys.length) {
  const key = monthKeys[monthKeys.length - 1];
  const m = key.match(/^budget_tracker_(\d{4})_(\d{1,2})$/);
  period = { month: Number(m[2]), year: Number(m[1]) };
  el('month').value = String(period.month);
  el('year').value = String(period.year);
  app.data = app.emptyMonth();
  app.loadMonth();
  app.renderAll();
  const html = el('expenseBody').innerHTML;
  console.log('');
  console.log('  Date field per row: ' + ((html.match(/type="date"/g) || []).length) +
    ' out of ' + app.data.expenses.length + ' row(s)');
  console.log('  Rows with no date (yellow marker): ' + ((html.match(/tgl-empty/g) || []).length));
  console.log('');
  const rows = html.split('<tr ').slice(1)
    /* The empty state row ("No expenses recorded this month.") also has a
       <tr>, but no data-row. Printing it would make a month without
       expenses look like one expense whose date still needs filling. */
    .filter(b => /data-row="/.test(b));
  console.log('  ' + 'DATE'.padEnd(12) + 'DESCRIPTION'.padEnd(28) + 'AMOUNT'.padStart(14) + '   POCKET');
  if (!rows.length) console.log('    (no expenses in this month)');
  for (const b of rows) {
    const date = (b.match(/type="date" value="([^"]*)"/) || [])[1] || '—';
    const name = (b.match(/value="([^"]*)"[^>]*data-field="name"/) || [])[1] || '(no name)';
    const amount = (b.match(/value="([^"]*)"[^>]*data-field="amount"/) || [])[1] || '';
    const pk = (b.match(/<option value="([^"]*)" selected/) || [])[1] || '';
    const pocketLabel = pk ? (app.pocketName(pk) || '(pocket missing: ' + pk + ')') : 'No pocket';
    const flagMissing = date === '—' ? ' (needs a date)' : '';
    console.log('    ' + date.padEnd(12) + name.padEnd(28) +
      rupiah(Number(amount) || 0).padStart(14) + '   ' + pocketLabel + flagMissing);
  }
}

/* =====================================================================
   PART 7 — can the data be written back without breaking it
   ===================================================================== */
console.log('');
line('=');
console.log('WRITE-BACK TEST (on a copy, using this real data)');
line('=');
writeLog.length = 0;
if (monthKeys.length) {
  const key = monthKeys[monthKeys.length - 1];
  const m = key.match(/^budget_tracker_(\d{4})_(\d{1,2})$/);
  period = { month: Number(m[2]), year: Number(m[1]) };
  el('month').value = String(period.month);
  el('year').value = String(period.year);
  app.data = app.emptyMonth();
  app.loadMonth();
  const before = JSON.stringify(app.data);
  app.saveMonth();
  const after = JSON.stringify(app.data);
  if (before === after) row('data is identical after saving', 'OK');
  else flag('data changed after saving', 'see the difference above');
  row('keys written back', writeLog.length + ' (' + [...new Set(writeLog)].join(', ') + ')');

  /* How much changes once the date field exists? */
  const original = JSON.parse(raw[key]);
  const wasCount = (Array.isArray(original.expenses) ? original.expenses : []).length;
  const nowCount = app.data.expenses.length;
  if (wasCount === nowCount) row('expense count unchanged', wasCount + ' -> ' + nowCount);
  else flag('expense count changed', wasCount + ' -> ' + nowCount);
  const withDate = (Array.isArray(original.expenses) ? original.expenses : [])
    .filter(x => Object.prototype.hasOwnProperty.call(x, 'date')).length;
  row('rows that already had a date field', withDate + ' (the rest are filled with "" by normalizeMonth)');
}

/* ---------- Summary ---------- */
console.log('');
line('=');
if (!problems) console.log('NO PROBLEMS FOUND. The data is consistent and safe to write back.');
else console.log('FOUND ' + problems + ' PROBLEM(S). See the lines marked "!" above.');
line('=');
process.exit(problems ? 1 : 0);
