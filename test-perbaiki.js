/* =====================================================================
   Self-test for cek-data.js and perbaiki-duplikat.js.

   Two parts:
     PART A — cek-data.js must DETECT duplicate months in a data dump
     PART B — perbaiki-duplikat.js must DELETE the right keys, and delete
              nothing at all when the run is cancelled

   Run: node test-perbaiki.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  OK    ' + name + ' = ' + a); }
  else { fail++; console.log('  FAIL ' + name + '\n      actual:   ' + a + '\n      expected: ' + e); }
}
function checkTrue(name, value) {
  if (value) { pass++; console.log('  OK    ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function section(n) { console.log('\n=== ' + n + ' ==='); }

/* =====================================================================
   Synthetic data: September holds the real content, then October and
   November got contaminated with identical copies (the old bug).
   ===================================================================== */
const POCKETS = [
  { id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' },
  { id: 'p2', name: 'Groceries', icon: '\uD83C\uDF7D', color: '#16a34a' }
];

const SEPT = {
  income: [{ name: 'Salary', amount: 5000000 }],
  expenses: [
    { name: 'Electricity token', amount: 539630, pocketId: 'p1', date: '2026-09-05' },
    { name: 'Shopping', amount: 250000, pocketId: 'p2', date: '' }
  ],
  allocations: [{ pocketId: 'p1', amount: 700000, note: '' }],
  transfers: []
};

/* An exact copy of September. This is what the old bug produced. */
const OCT = JSON.parse(JSON.stringify(SEPT));
const NOV = JSON.parse(JSON.stringify(SEPT));
/* December is genuinely empty and was not contaminated. */
const DEC = { income: [], expenses: [], allocations: [], transfers: [] };

const dump = {
  budget_tracker: JSON.stringify(POCKETS),
  budget_tracker_2026_9: JSON.stringify(SEPT),
  budget_tracker_2026_10: JSON.stringify(OCT),
  budget_tracker_2026_11: JSON.stringify(NOV),
  budget_tracker_2026_12: JSON.stringify(DEC)
};
const FILE = path.join('/tmp/opencode', 'dump-duplikat.json');
fs.writeFileSync(FILE, JSON.stringify(dump, null, 2));

/* =====================================================================
   PART A — cek-data.js
   ===================================================================== */
section('A1. cek-data.js finds the duplicate group');
let out = '';
try {
  out = execFileSync('node', [path.join(__dirname, 'cek-data.js'), FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
}
console.log(out.split('\n')
  .filter(l => /CROSS-MONTH|Group|budget_tracker_2026|duplicate|FOUND|PROBLEMS/.test(l))
  .slice(0, 30).map(l => '    | ' + l).join('\n'));

checkTrue('prints the CROSS-MONTH OVERWRITING TRACES section',
  /CROSS-MONTH OVERWRITING TRACES/.test(out));
checkTrue('names how many duplicate groups were found',
  /Found 1 group\(s\) of duplicate months/.test(out));
checkTrue('names the 3 months as a single group',
  /3 months contain byte-identical copies/.test(out));
checkTrue('shows the contents of each month in the group',
  /budget_tracker_2026_9\s+income 1, expenses 2, allocations 1, transfers 0/.test(out));
checkTrue('suggests perbaiki-duplikat.js', /perbaiki-duplikat\.js/.test(out));
checkTrue('states that an auto backup is taken first',
  /AUTO BACKUP BEFORE CHANGING ANYTHING/.test(out));
checkTrue('flags it as a problem (exits with a non-zero code)',
  /FOUND \d+ PROBLEM\(S\)/.test(out));

section('A2. Data with no duplicates must be reported as clean');
const clean = {
  budget_tracker: JSON.stringify(POCKETS),
  budget_tracker_2026_9: JSON.stringify(SEPT),
  budget_tracker_2026_10: JSON.stringify({ income: [{ name: 'Salary', amount: 5200000 }],
    expenses: [], allocations: [], transfers: [] })
};
const FILE2 = path.join('/tmp/opencode', 'dump-bersih.json');
fs.writeFileSync(FILE2, JSON.stringify(clean, null, 2));
let out2 = '';
try {
  out2 = execFileSync('node', [path.join(__dirname, 'cek-data.js'), FILE2],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) { out2 = (e.stdout || '') + (e.stderr || ''); }
checkTrue('reports no overwriting trace',
  /No months with identical content/.test(out2));
checkTrue('does not mention a duplicate group',
  !/group\(s\) of duplicate months/.test(out2));

/* =====================================================================
   PART B — perbaiki-duplikat.js
   ===================================================================== */
const SRC = fs.readFileSync(path.join(__dirname, 'perbaiki-duplikat.js'), 'utf8');

function run({ promptAnswer, confirmYes }) {
  const store = new Map(Object.entries(dump));
  const downloaded = [];
  const log = [];

  global.localStorage = {
    get length() { return store.size; },
    key: i => [...store.keys()][i],
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => { store.delete(k); log.push('DEL:' + k); },
    clear: () => store.clear()
  };
  const body = { appendChild() {}, removeChild() {} };
  global.document = {
    createElement: () => ({
      set href(v) {}, download: '', click() { downloaded.push(this.download); }
    }),
    body: body
  };
  global.Blob = function (parts) { this.parts = parts; };
  global.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
  global.setTimeout = fn => { fn(); return 0; };
  global.confirm = () => confirmYes;
  global.prompt = () => promptAnswer;
  const realLog = console.log;
  console.log = () => {};
  try { new Function(SRC)(); } finally { console.log = realLog; }
  return { store, downloaded, log };
}

section('B1. Choosing the first month to keep');
{
  const r = run({ promptAnswer: '1', confirmYes: true });
  check('backup downloaded once', r.downloaded.length, 1);
  checkTrue('the backup name carries a timestamp',
    /^budget-tracker-backup-\d{4}-\d{2}-\d{2}T/.test(r.downloaded[0] || ''));
  check('keys that remain', [...r.store.keys()].sort(),
    ['budget_tracker', 'budget_tracker_2026_12', 'budget_tracker_2026_9']);
  check('the global pocket list is untouched', r.store.has('budget_tracker'), true);
  check('the kept month is intact', r.store.get('budget_tracker_2026_9'), JSON.stringify(SEPT));
}

section('B2. Choosing the second month to keep');
{
  const r = run({ promptAnswer: '2', confirmYes: true });
  check('keys that remain', [...r.store.keys()].sort(),
    ['budget_tracker', 'budget_tracker_2026_10', 'budget_tracker_2026_12']);
  check('October is the one kept', r.store.get('budget_tracker_2026_10'), JSON.stringify(OCT));
}

section('B3. Cancelling at the confirm step -> nothing changes');
{
  const r = run({ promptAnswer: '1', confirmYes: false });
  check('no key was deleted', r.log.length, 0);
  check('every key is still there', r.store.size, Object.keys(dump).length);
  checkTrue('the backup is still taken before the cancel', r.downloaded.length === 1);
}

section('B4. Cancelling at the prompt -> nothing changes');
{
  const r = run({ promptAnswer: 'cancel', confirmYes: true });
  check('no key was deleted', r.log.length, 0);
  check('every key is still there', r.store.size, Object.keys(dump).length);
}

section('B5. An answer out of range -> nothing changes');
{
  const r = run({ promptAnswer: '9', confirmYes: true });
  check('no key was deleted', r.log.length, 0);
  check('every key is still there', r.store.size, Object.keys(dump).length);
}

section('B6. No duplicates -> nothing downloaded, nothing deleted');
{
  const store = new Map(Object.entries(clean));
  global.localStorage = {
    get length() { return store.size; },
    key: i => [...store.keys()][i],
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };
  global.document = { createElement: () => ({ click() {} }), body: {} };
  let output = '';
  const realLog = console.log;
  console.log = (...a) => { output += a.join(' '); };
  try { new Function(SRC)(); } finally { console.log = realLog; }
  checkTrue('it says there is nothing to repair',
    /No months with identical content/.test(output));
  check('nothing was deleted', [...store.keys()].length, Object.keys(clean).length);
}

section('B7. Guards in the source itself');
checkTrue('the backup is made before anything is deleted',
  SRC.indexOf('backupName') < SRC.indexOf('localStorage.removeItem'));
checkTrue('it only ever touches month keys',
  /MONTH_KEY\.test\(k\)/.test(SRC));
checkTrue('there is a cancel path', /CANCELLED/.test(SRC));
checkTrue('it never calls localStorage.clear',
  !/localStorage\.clear\(\)/.test(SRC));

/* ---------- Summary ---------- */
console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
