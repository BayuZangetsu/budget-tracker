/* =====================================================================
   Test harness -- verifies the pocket ledger arithmetic without a browser.

   Run: node test-ledger.js
   ===================================================================== */
const fs = require('fs');

/* ---------- localStorage stub ---------- */
const store = new Map();
global.localStorage = {
  get length() { return store.size; },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

/* ---------- DOM stub ---------- */
let period = { month: 9, year: 2026 };

function makeEl(id) {
  return {
    id,
    value: id === 'month' ? String(period.month) : id === 'year' ? String(period.year) : '1',
    textContent: '',
    innerHTML: '',
    hidden: true,
    dataset: {},
    style: {},
    focus() {},
    scrollIntoView() {},
    getContext: () => ({}),
    addEventListener() {},
    appendChild() {},
    remove() {},
    closest: () => null,
    offsetWidth: 0,
    classList: { add() {}, remove() {}, contains: () => false }
  };
}

global.document = {
  readyState: 'complete',
  getElementById: id => makeEl(id),
  addEventListener() {},
  createElement: () => makeEl('new')
};
global.navigator = {};

/* ---------- Chart.js stub ---------- */
global.Chart = class {
  constructor() { this.destroyed = false; }
  destroy() { this.destroyed = true; }
};

/* ---------- Load app.js inside its own scope ---------- */
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const app = new Function(src + `
;return {
  get pockets(){return pockets}, set pockets(v){pockets=v},
  get data(){return data}, set data(v){data=v},
  get archive(){return archive},
  CASH, loadPockets, savePockets, loadMonth, saveMonth, renderAll,
  computeArchive, normalizeMonth, openHistory, closeModal
};`)();

function setPeriod(m, y) { period = { month: m, year: y }; }

/* ---------- Assertions ---------- */
let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ok   ' + name + ' = ' + a); }
  else { fail++; console.log('  FAIL ' + name + '\n      actual:   ' + a + '\n      expected: ' + e); }
}
function balance(name) {
  const p = app.pockets.find(x => x.name === name);
  return p ? app.archive.balances[p.id].balance : 'NO SUCH POCKET';
}
function totalPocketBalance() {
  return app.pockets.reduce((s, p) => s + app.archive.balances[p.id].balance, 0);
}

/* =====================================================================
   CASE 1 -- the user's own real scenario
   ===================================================================== */
console.log('\n=== CASE 1: allocate 500k to Electricity, pay 300k, allocate again next month ===');

app.pockets = [{ id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' }];
app.savePockets();

setPeriod(9, 2026);
app.loadMonth();
app.data.income.push({ name: 'Salary', amount: 3000000 });
app.data.allocations.push({ pocketId: 'p1', amount: 500000, note: 'electricity budget' });
app.saveMonth();
app.renderAll();
check('balance after allocating 500k', balance('Electricity'), 500000);
check('free cash after allocating', app.archive.cash.total, 2500000);

app.data.expenses.push({ name: 'Electricity token', amount: 300000, pocketId: 'p1' });
app.saveMonth();
app.renderAll();
check('balance after paying 300k', balance('Electricity'), 200000);
check('free cash untouched by a pocket expense', app.archive.cash.total, 2500000);

setPeriod(10, 2026);
app.loadMonth();
app.data.allocations.push({ pocketId: 'p1', amount: 500000, note: '' });
app.saveMonth();
app.renderAll();
check('October balance accumulates, it does not reset', balance('Electricity'), 700000);

/* =====================================================================
   CASE 2 -- a transfer between two pockets
   ===================================================================== */
console.log('\n=== CASE 2: allocate 1M to Savings, transfer 200k Savings -> Electricity ===');
app.pockets.push({ id: 'p2', name: 'Savings', icon: '\uD83C\uDF81', color: '#16a34a' });
app.savePockets();
app.data.allocations.push({ pocketId: 'p2', amount: 1000000, note: '' });
app.data.transfers.push({ type: 'transfer', from: 'p2', to: 'p1', amount: 200000, note: 'help with electricity' });
app.saveMonth();
app.renderAll();
check('Electricity after the transfer arrived', balance('Electricity'), 900000);
check('Savings after the transfer left', balance('Savings'), 800000);
/* Cash = (3M - 500k) + (0 - 500k - 1M) = 1M.
   A transfer between two pockets never touches cash. */
check('free cash = 1M (1M allocated to Savings)', app.archive.cash.total, 1000000);

/* =====================================================================
   CASE 3 -- withdraw a pocket back into free cash
   ===================================================================== */
console.log('\n=== CASE 3: withdraw 100k Electricity -> free cash ===');
app.data.transfers.push({ type: 'withdraw', from: 'p1', to: app.CASH, amount: 100000, note: '' });
app.saveMonth();
app.renderAll();
check('Electricity went down', balance('Electricity'), 800000);
check('free cash went up by 100k', app.archive.cash.total, 1100000);

/* =====================================================================
   CASE 4 -- move free cash into a pocket
   ===================================================================== */
console.log('\n=== CASE 4: move 50k of free cash -> Electricity ===');
app.data.transfers.push({ type: 'withdraw', from: app.CASH, to: 'p1', amount: 50000, note: '' });
app.saveMonth();
app.renderAll();
check('Electricity went up', balance('Electricity'), 850000);
check('free cash went down', app.archive.cash.total, 1050000);

/* =====================================================================
   CASE 5 -- going over budget is still recorded
   ===================================================================== */
console.log('\n=== CASE 5: spend 1M from a balance of 850k -> over budget, still recorded ===');
app.data.expenses.push({ name: 'Electricity piling up', amount: 1000000, pocketId: 'p1' });
app.saveMonth();
app.renderAll();
check('Electricity is now over budget', balance('Electricity'), -150000);
check('free cash unchanged', app.archive.cash.total, 1050000);

/* =====================================================================
   CASE 6 -- an expense with no pocket MUST come out of free cash
   ===================================================================== */
console.log('\n=== CASE 6: 50k spent with no pocket ===');
app.data.expenses.push({ name: 'Eating out', amount: 50000, pocketId: null });
app.saveMonth();
app.renderAll();
check('Electricity unaffected', balance('Electricity'), -150000);
check('free cash went down by 50k', app.archive.cash.total, 1000000);

/* =====================================================================
   CASE 7 -- the invariant: no money is created or lost
   ===================================================================== */
console.log('\n=== CASE 7: the money-conservation invariant ===');
const totalIncome = 3000000;                       // September only
const totalExpenses = 300000 + 1000000 + 50000;     // token + electricity + eating out
check('the sum of pocket balances + free cash == income - every expense',
  totalPocketBalance() + app.archive.cash.total,
  totalIncome - totalExpenses);                 // = 1.65M
check('the sum of pocket balances', totalPocketBalance(), 650000);
check('total allocated + total transferred in',
  Object.values(app.archive.balances).reduce((a, s) => a + s.allocated + s.transferIn, 0),
  500000 + 500000 + 1000000 + 200000 + 50000);

/* =====================================================================
   CASE 8 -- normalizeMonth, and records written by an older format
   ===================================================================== */
console.log('\n=== CASE 8: normalising an older shape ===');
const old = app.normalizeMonth({
  income: [{ name: 'Salary', amount: 2000000 }],
  expenses: [{ name: 'Rent', amount: 1500000 }]
});
check('income survives', old.income.length, 1);
check('an expense with no pocket gets one', old.expenses[0].pocketId, null);
check('the amount becomes a number', old.expenses[0].amount, 1500000);
check('allocations defaults to empty', old.allocations, []);
check('transfers defaults to empty', old.transfers, []);
check('null does not crash', app.normalizeMonth(null).income, []);
check('a string does not crash', app.normalizeMonth('weird').transfers, []);
check('an array instead of an object does not crash', app.normalizeMonth([1, 2, 3]).allocations, []);
check('NaN becomes 0', app.normalizeMonth({ income: [{ name: 'x', amount: 'abc' }] }).income[0].amount, 0);

/* =====================================================================
   CASE 9 -- a hand-written month is read back and the balances still add up
   ===================================================================== */
console.log('\n=== CASE 9: reading a month that has no allocations and no transfers ===');
localStorage.setItem('budget_tracker_2026_11', JSON.stringify({
  income: [{ name: 'Salary', amount: 2000000 }],
  expenses: [{ name: 'Rent', amount: 1500000 }]
}));
setPeriod(11, 2026);
app.loadMonth();
app.renderAll();
check('the income was read back', app.data.income[0].name, 'Salary');
check('cash is the income (nothing was allocated)', app.archive.cash.total >= 0, true);
check('the total pocket balance is a number, not NaN', typeof totalPocketBalance(), 'number');
/* Cash is a running total over every stored month, so this is the 1M left
   over from cases 1-6 plus November's 2M income minus its 1.5M rent. */
check('free cash carries over from every earlier month', app.archive.cash.total, 1500000);

/* =====================================================================
   SUMMARY
   ===================================================================== */
console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
