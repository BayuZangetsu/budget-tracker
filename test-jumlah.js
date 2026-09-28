/* =====================================================================
   Test harness -- amount guards.

   Run: node test-jumlah.js

   Background: this defect is only findable in a real browser.
   <input type="number"> turns "1.250.750" and "abc" into an empty string
   without ever setting badInput, so num("") = 0 and an Rp 0 expense is
   stored behind a green toast. A test stub never really goes through
   type="number", so this suite calls num() AND readAmount() directly with
   every piece of junk that could be typed.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

/* ---------- localStorage stub ---------- */
const store = new Map();
global.localStorage = {
  get length() { return store.size; },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

/* ---------- DOM stub ---------- */
const elements = new Map();
const toastList = [];
let lastFocus = null;

function makeEl(id) {
  const el = {
    id,
    value: '', textContent: '', innerHTML: '', hidden: true,
    min: '', max: '', type: 'text', title: '', className: '',
    dataset: {}, style: {}, select() {},
    focus() { lastFocus = id; },
    scrollIntoView() {}, getContext: () => ({}),
    appendChild() {}, remove() {}, closest: () => null, offsetWidth: 0,
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    classList: { _s: new Set(), add() {}, remove() {}, contains: () => false, toggle() {} }
  };
  return el;
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
global.Chart = class { destroy() {} };
global.setTimeout = () => 0;
global.clearTimeout = () => {};
global.confirm = () => true;

/* ---------- Load app.js exactly as it is ---------- */
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const POCKETS_VAR = 'pockets';
const KID = 'pocketId';

const app = new Function('VARNAME', 'TOAST', src + `
;toast = TOAST;
;return {
  get Pockets(){return eval(VARNAME)}, set Pockets(v){ eval(VARNAME + ' = v') },
  get data(){return data}, set data(v){data=v},
  get archive(){return archive}, set archive(v){archive=v},
  CASH, POCKETS_KEY, loadMonth, saveMonth, emptyMonth, computeArchive,
  renderAll, loadPockets, savePockets, pocketName, periodLabel,
  num, fmt, safeDate, defaultDate, readAmount,
  addExpense, addIncome, addAllocation, addTransfer, applyTableEdit
};`)(POCKETS_VAR, (msg, kind) => toastList.push({ msg, kind }));

/* ---------- Assertions ---------- */
let pass = 0, fail = 0;
const section = n => console.log('\n=== ' + n + ' ===');
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ok   ' + name + ' = ' + a); }
  else { fail++; console.log('  FAIL ' + name + '\n      actual:   ' + a + '\n      expected: ' + e); }
}
function checkTrue(name, value) {
  if (value) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const lastToast = () => toastList.length ? toastList[toastList.length - 1] : null;

function reset() {
  store.clear();
  toastList.length = 0;
  lastFocus = null;
  elements.clear();
  el('month').value = '9';
  el('year').value = '2026';
  el('transferFrom').value = 'p1';
  el('transferTo').value = 'p2';
  app.Pockets = [
    { id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' },
    { id: 'p2', name: 'Groceries', icon: '\uD83C\uDF7D', color: '#16a34a' }
  ];
  app.savePockets();
  app.loadMonth();
}

/* =====================================================================
   1 -- num() accepts only sensible amount formats
   ===================================================================== */
section('1. num(): valid formats are accepted');
const VALID = [
  ['539630', 539630], ['1250750', 1250750], ['0', 0],
  ['1234.56', 1234.56], ['1.250.750', 1250750], ['1,250,750', 1250750],
  ['1.500.000', 1500000], ['Rp 1.500.000', 1500000], ['rp1250750', 1250750],
  ['  539630  ', 539630], ['1 250 750', 1250750], ['12,5', 12.5],
  ['-500', -500], [539630, 539630], [1234.56, 1234.56], [0, 0]
];
VALID.forEach(([input, expected]) => check('num(' + JSON.stringify(input) + ')', app.num(input), expected));

section('2. num(): junk is REJECTED, not scavenged for digits');
/* The original time bomb: "12abc" used to become 12, a wrong number that
   still looked plausible. It has to be 0 now so the guard rejects it. */
const JUNK = [
  'abc', '12abc', 'abc12', '5 3 9 x', '12 kg', '1.2.3.4', '--5', '1-2-3',
  'e', 'NaN', 'undefined', 'null', 'true', '0x10', '1e5', 'Rp', 'IDR',
  '1,2,3,4,5', '...', '-', '+', '1e', 'Rp Rp 500'
];
JUNK.forEach(v => check('num(' + JSON.stringify(v) + ')', app.num(v), 0));

/* =====================================================================
   3 -- readAmount(): only a positive number gets through
   ===================================================================== */
section('3. readAmount() accepts a valid amount');
const ACCEPTED = ['1', '539630', '1250750', '1.250.750', '1234.56', 'Rp 75000', '0.5'];
ACCEPTED.forEach(v => {
  reset();
  el('expenseAmount').value = v;
  const n = app.readAmount('expenseAmount', 'Expense amount');
  check('"' + v + '" is accepted', n, app.num(v));
  checkTrue('"' + v + '" raises no toast', toastList.length === 0);
});

section('4. readAmount(): it refuses and says why');
const REFUSED = ['', '   ', 'abc', '12abc', '0', '0.0', '-500', '1.2.3.4', 'NaN', '--'];
REFUSED.forEach(v => {
  reset();
  el('expenseAmount').value = v;
  const n = app.readAmount('expenseAmount', 'Expense amount');
  check('"' + v + '" is refused', n, null);
  const t = lastToast();
  checkTrue('"' + v + '" raises a toast', t !== null);
  checkTrue('"' + v + '" the toast is flagged as a warning', t && t.kind === 'warn');
  checkTrue('"' + v + '" the toast says "must be a number greater than 0"',
    t && t.msg.includes('must be a number greater than 0'));
  check('"' + v + '" returns focus to the input', lastFocus, 'expenseAmount');
});

section('5. readAmount(): the message names the field that failed');
reset();
el('expenseAmount').value = '12abc';
app.readAmount('expenseAmount', 'Expense amount');
checkTrue('it quotes what was typed', lastToast().msg.includes('12abc'));
reset();
el('expenseAmount').value = 'abcdef';
app.readAmount('expenseAmount', 'Expense amount');
checkTrue('a long entry is truncated rather than flooding the message',
  lastToast().msg.length < 120);

/* =====================================================================
   6 -- The add form must never save a row worth Rp 0
   ===================================================================== */
section('6. addExpense never records an Rp 0');
const UGLY = ['abc', '12abc', '0', '', '   ', 'NaN'];
UGLY.forEach(v => {
  reset();
  el('expenseName').value = 'Probe';
  el('expenseAmount').value = v;
  el('expensePocket').value = 'p1';
  el('expenseDate').value = '2026-09-10';
  app.addExpense({ preventDefault() {} });
  check('"' + v + '" -> 0 rows stored', app.data.expenses.length, 0);
});

section('7. addExpense still accepts a valid amount');
[['539630', 539630], ['1.250.750', 1250750], ['1234.56', 1234.56], ['1250750', 1250750]]
  .forEach(([input, expected]) => {
    reset();
    el('expenseName').value = 'A valid probe';
    el('expenseAmount').value = input;
    el('expensePocket').value = 'p1';
    el('expenseDate').value = '2026-09-10';
    app.addExpense({ preventDefault() {} });
    check('"' + input + '" -> 1 row', app.data.expenses.length, 1);
    check('"' + input + '" the amount is intact', app.data.expenses[0].amount, expected);
  });

section('8. addIncome never records an Rp 0');
UGLY.forEach(v => {
  reset();
  el('incomeSource').value = 'Salary';
  el('incomeAmount').value = v;
  app.addIncome({ preventDefault() {} });
  check('"' + v + '" -> 0 rows stored', app.data.income.length, 0);
});
reset();
el('incomeSource').value = 'Salary';
el('incomeAmount').value = '1.250.750';
app.addIncome({ preventDefault() {} });
check('a valid income is stored', app.data.income[0].amount, 1250750);

section('9. addAllocation never records an allocation of Rp 0');
UGLY.forEach(v => {
  reset();
  el('allocPocket').value = 'p1';
  el('allocAmount').value = v;
  app.addAllocation({ preventDefault() {} });
  check('"' + v + '" -> 0 allocations stored', app.data.allocations.length, 0);
});
reset();
el('allocPocket').value = 'p1';
el('allocAmount').value = '700.000';
app.addAllocation({ preventDefault() {} });
check('a valid allocation is stored intact', app.data.allocations[0].amount, 700000);

section('10. addTransfer never records a transfer of Rp 0');
UGLY.forEach(v => {
  reset();
  el('transferFrom').value = 'p1';
  el('transferTo').value = 'p2';
  el('transferAmount').value = v;
  app.addTransfer({ preventDefault() {} });
  check('"' + v + '" -> 0 transfers stored', app.data.transfers.length, 0);
});
reset();
el('transferFrom').value = 'p1';
el('transferTo').value = 'p2';
el('transferAmount').value = '250.000';
app.addTransfer({ preventDefault() {} });
check('a valid transfer is stored intact', app.data.transfers[0].amount, 250000);

/* =====================================================================
   11 -- Inline editing: a broken amount is put back, not turned into 0
   ===================================================================== */
section('11. applyTableEdit must not overwrite an amount with 0');
reset();
el('expenseName').value = 'Original';
el('expenseAmount').value = '539630';
el('expensePocket').value = 'p1';
el('expenseDate').value = '2026-09-05';
app.addExpense({ preventDefault() {} });
check('the starting value is stored', app.data.expenses[0].amount, 539630);

UGLY.forEach(v => {
  const target = { dataset: { row: '0', list: 'expenses', field: 'amount' }, value: v };
  app.applyTableEdit(target);
  check('inline "' + v + '" -> the amount is unchanged', app.data.expenses[0].amount, 539630);
  check('inline "' + v + '" -> the input is put back', target.value, 539630);
  checkTrue('inline "' + v + '" raises a toast', lastToast() !== null);
});

section('12. applyTableEdit accepts a new valid amount');
[['539631', 539631], ['1.250.750', 1250750], ['1234.56', 1234.56]].forEach(([v, h]) => {
  reset();
  el('expenseName').value = 'Original';
  el('expenseAmount').value = '539630';
  el('expensePocket').value = 'p1';
  el('expenseDate').value = '2026-09-05';
  app.addExpense({ preventDefault() {} });
  app.applyTableEdit({ dataset: { row: '0', list: 'expenses', field: 'amount' }, value: v });
  check('inline "' + v + '" is stored', app.data.expenses[0].amount, h);
});

/* =====================================================================
   13 -- Guards in the source itself
   ===================================================================== */
section('13. Guards in the source');
checkTrue('there is a readAmount helper', /^function readAmount\(/m.test(src));
const AMOUNT_IDS = ['expenseAmount', 'incomeAmount', 'allocAmount', 'transferAmount'];
AMOUNT_IDS.forEach(id => {
  checkTrue(id + ' goes through readAmount',
    new RegExp("readAmount\\('" + id + "'").test(src));
});
checkTrue('no hand-rolled "amount <= 0" is left in the add forms',
  !/if \(amount <= 0\)/.test(src));
checkTrue('no amount input uses type=number in app.js',
  !/type="number"[^>]*data-field="amount"/.test(src));
const html = fs.readFileSync(path.join(__dirname, 'budget-tracker.html'), 'utf8');
AMOUNT_IDS.forEach(id => {
  checkTrue(id + ' is type="text" in the HTML',
    new RegExp('<input type="text" id="' + id + '"').test(html));
});
checkTrue('no min="0" step="1" is left in the HTML', !/min="0" step="1"/.test(html));

/* ---------- Summary ---------- */
console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
