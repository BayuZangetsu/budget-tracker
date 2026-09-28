/* =====================================================================
   Contract test: pins the STORAGE FORMAT of the app.

   Everything here is about the bytes that end up in localStorage, not
   about behaviour. If this file needs editing, the data format changed
   and every other test file plus any saved user data has to move with
   it.

   Run: node test-kontrak.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ok   ' + name + ' = ' + a); }
  else { fail++; console.log('  FAIL ' + name + '\n      actual:   ' + a + '\n      expected: ' + e); }
}
function checkTrue(name, value) {
  if (value) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function section(n) { console.log('\n=== ' + n + ' ==='); }

/* =====================================================================
   1. Literal constants
   ===================================================================== */
section('1. Literal constants in app.js');
check('the global pocket list key', (src.match(/POCKETS_KEY\s*=\s*'([^']+)'/) || [])[1], 'budget_tracker');
check('the cash sentinel value', (src.match(/=\s*'(__[a-z_]+__)'/) || [])[1], '__cash__');

/* =====================================================================
   2. The month key pattern
   ===================================================================== */
section('2. The month key pattern');
check('the key is built from the prefix', src.includes('`budget_tracker_${p.year}_${p.month}`'), true);
check('the scan pattern', (src.match(/\/\^budget_tracker_\\d\{4\}_\\d\{1,2\}\$\//g) || []).length, 1);
check('the parse pattern', (src.match(/\/\^budget_tracker_\(\\d\{4\}\)_\(\\d\{1,2\}\)\$\//g) || []).length, 1);
check('the prefix literal is only written in the two key builders plus the two patterns',
  (src.match(/budget_tracker_/g) || []).length, 4);

/* =====================================================================
   3. Pocket record shape
   ===================================================================== */
section('3. Pocket record shape');
check('fields kept when loading', ['id', 'name', 'icon', 'color', 'monthlyTarget'],
  ['id', 'name', 'icon', 'color', 'monthlyTarget'].filter(f => src.includes(f + ':')));
checkTrue('the icon is whitelisted', /safeIcon\(p\.icon\)/.test(src));
checkTrue('the color is whitelisted', /safeColor\(p\.color\)/.test(src));
checkTrue('a missing name falls back', src.includes(`name: String(p.name || 'Unnamed')`));

/* =====================================================================
   4. Month record shape
   ===================================================================== */
section('4. Month record shape');
check('the four stored arrays',
  ['income', 'expenses', 'allocations', 'transfers'].filter(k => src.includes(k + ': []')),
  ['income', 'expenses', 'allocations', 'transfers']);

/* Shape checks run against a copy with comments and whitespace collapsed,
   so a note written inside an object literal does not break the pattern. */
const flat = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/\s+/g, ' ');

check('income fields', flat.includes("{ name: String(i.name ?? ''), amount: num(i.amount) }"), true);
checkTrue('expense fields are name/amount/pocketId/date',
  flat.includes("out.expenses.push({ name: String(i.name ?? ''), amount: num(i.amount), "
    + "pocketId: i.pocketId || null, date: safeDate(i.date) })"));
checkTrue('allocation fields are pocketId/amount/note',
  flat.includes("out.allocations.push({ pocketId: i.pocketId || null, amount: num(i.amount), "
    + "note: String(i.note ?? '') })"));
checkTrue('transfer fields are type/from/to/amount/note',
  flat.includes("out.transfers.push({ type: i.type === 'transfer' ? 'transfer' : 'withdraw', "
    + "from: i.from || null, to: i.to || null, amount: num(i.amount), "
    + "note: String(i.note ?? '') })"));

/* =====================================================================
   5. Enum values
   ===================================================================== */
section('5. Enum values');
checkTrue("anything that is not 'transfer' becomes 'withdraw'",
  src.includes("i.type === 'transfer' ? 'transfer' : 'withdraw'"));
checkTrue('a transfer touching CASH is typed "withdraw"',
  src.includes("(from === CASH || to === CASH) ? 'withdraw' : 'transfer'"));
checkTrue("the older 'tarik' spelling is gone", !/\btarik\b/.test(src));
checkTrue("the Indonesian 'mutasi' is gone", !/\bmutasi\b/.test(src));

/* =====================================================================
   6. No Indonesian field name may survive anywhere
   ===================================================================== */
section('6. No Indonesian field name survives');
const OLD_FIELDS = ['nama', 'jumlah', 'kantongId', 'tanggal', 'catatan', 'tipe',
  'dari', 'ke', 'pemasukan', 'pengeluaran', 'mutasi', 'plot', 'defaultPlot',
  'bulan', 'tahun', 'saldo', 'kas', 'kantong', 'arsip', 'periode', 'ikon', 'warna'];
/* Only scan code, with comments and string bodies blanked out, so an
   English sentence that happens to use a short word is not a false hit. */
const codeOnly = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
  .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
  .replace(/`(?:\\.|[^`\\])*`/g, '``');
for (const f of OLD_FIELDS) {
  if (new RegExp('\\b' + f + '\\b').test(codeOnly)) {
    fail++; console.log('  FAIL the old field "' + f + '" still appears in code');
  } else {
    pass++; console.log('  ok   the old field "' + f + '" is gone from code');
  }
}

/* =====================================================================
   7. Round trip: write English data, read it back, check the ledger
   ===================================================================== */
section('7. Round trip through localStorage');

const store = new Map();
global.localStorage = {
  get length() { return store.size; },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

let period = { month: 9, year: 2026 };
const elements = new Map();
function makeEl(id) {
  return {
    id,
    value: id === 'month' ? String(period.month) : id === 'year' ? String(period.year) : '',
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

const POCKETS_VAR = 'pockets';
const boot = new Function('VARNAME', src + `
;var _read = function(){ return eval(VARNAME); };
;return {
  get Pockets(){return _read()}, set Pockets(v){ eval(VARNAME + ' = v') },
  get data(){return data}, set data(v){data=v},
  get archive(){return archive}, set archive(v){archive=v},
  CASH, POCKETS_KEY, allMonthKeys,
  loadMonth, saveMonth, emptyMonth, computeArchive, renderAll
};`)(POCKETS_VAR);

check('the cash sentinel at runtime', boot.CASH, '__cash__');
check('the pocket list key at runtime', boot.POCKETS_KEY, 'budget_tracker');
check('no month keys yet', boot.allMonthKeys(), []);

/* Write one month in the English format, straight into localStorage. */
store.set('budget_tracker', JSON.stringify([
  { id: 'p1', name: 'Electricity', icon: '💡', color: '#2563eb', monthlyTarget: 800000 },
  { id: 'p2', name: 'Groceries', icon: '🛒', color: '#16a34a', monthlyTarget: 1000000 }
]));
store.set('budget_tracker_2026_9', JSON.stringify({
  income: [{ name: 'Salary', amount: 5000000 }],
  expenses: [
    { name: 'Token', amount: 539630, pocketId: 'p1', date: '2026-09-05' },
    { name: 'Groceries run', amount: 250000, pocketId: 'p2', date: '' },
    { name: 'Coffee', amount: 25000, pocketId: null, date: '2026-09-06' }
  ],
  allocations: [
    { pocketId: 'p1', amount: 800000, note: '' },
    { pocketId: 'p2', amount: 1000000, note: '' }
  ],
  transfers: [
    { type: 'withdraw', from: 'p1', to: '__cash__', amount: 100000, note: 'leftover' }
  ]
}));

boot.Pockets = JSON.parse(store.get('budget_tracker'));
boot.loadMonth();
boot.computeArchive();

check('income is read back', boot.data.income, [{ name: 'Salary', amount: 5000000 }]);
check('the expense count is read back', boot.data.expenses.length, 3);
check('a dated expense keeps its date', boot.data.expenses[0].date, '2026-09-05');
check('an undated expense stays empty, not invented', boot.data.expenses[1].date, '');
check('a null pocket stays null', boot.data.expenses[2].pocketId, null);
check('the allocation count is read back', boot.data.allocations.length, 2);
check('the transfer type is read back', boot.data.transfers[0].type, 'withdraw');
check('the CASH sentinel survives normalisation', boot.data.transfers[0].to, '__cash__');

/* Ledger:
   p1 = allocated 800000 - spent 539630 - transferredOut 100000 = 160370
   p2 = allocated 1000000 - spent 250000               = 750000
   cash = income 5000000 - allocated 1800000
       - the 25000 expense recorded with no pocket
       + the 100000 withdrawn back into free cash
       = 3275000
   Note that cash.thisMonth deliberately ignores transfers: it is
   "income - already allocated - spending taken straight from free cash",
   which is the figure the auto-allocate shortfall is measured against. */
check('p1 balance', boot.archive.balances.p1.balance, 160370);
check('p2 balance', boot.archive.balances.p2.balance, 750000);
check('p1 transferred out', boot.archive.balances.p1.transferOut, 100000);
check('cash outside the pockets', boot.archive.cash.total, 3275000);
check('this month, p1 allocated', boot.archive.thisMonth.p1.allocated, 800000);
check('this month, p1 spent', boot.archive.thisMonth.p1.spent, 539630);
check('income this month', boot.archive.cash.income, 5000000);
check('allocated this month', boot.archive.cash.allocated, 1800000);
check('unallocated this month', boot.archive.cash.thisMonth, 3175000);

/* Nothing may be lost: balances + cash must equal income - expenses. */
const totalHeld = Object.values(boot.archive.balances).reduce((s, b) => s + b.balance, 0)
  + boot.archive.cash.total;
check('total money held', totalHeld, 4185370);
check('income - expenses', 5000000 - (539630 + 250000 + 25000), 4185370);

/* =====================================================================
   8. Saving writes the English shape back
   ===================================================================== */
section('8. Saving writes the English shape back');
boot.saveMonth();
const written = JSON.parse(store.get('budget_tracker_2026_9'));
check('the four arrays come back', Object.keys(written).sort(),
  ['allocations', 'expenses', 'income', 'transfers']);
checkTrue('no Indonesian key survives a write',
  !/pemasukan|pengeluaran|mutasi|kantongId|"nama"|"jumlah"/.test(JSON.stringify(written)));
check('the pocket list is written in the English shape',
  Object.keys(JSON.parse(store.get('budget_tracker'))[0]).sort(),
  ['color', 'icon', 'id', 'monthlyTarget', 'name']);

/* =====================================================================
   9. The copy/paste payload version was bumped
   ===================================================================== */
section('9. The copy/paste payload version');
check('payload version', (src.match(/_v:\s*(\d+)/) || [])[1], '3');
checkTrue('the payload names the period in English', src.includes('_period:'));
checkTrue('the payload names the pockets in English', /\n\s+pockets: pockets\.map/.test(src));

console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
