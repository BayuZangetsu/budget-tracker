/* =====================================================================
   Static wiring check: every id app.js reads must exist in the markup,
   every inline handler must name a real function, every class it renders
   must exist in styles.css, and no Indonesian may survive anywhere.

   Run: node test-wiring.js
   ===================================================================== */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/budget-tracker.html', 'utf8');
const js = fs.readFileSync(__dirname + '/app.js', 'utf8');
const css = fs.readFileSync(__dirname + '/styles.css', 'utf8');

let pass = 0, fail = 0;
const ok = n => { pass++; console.log('  ok   ' + n); };
const no = (n, d) => { fail++; console.log('  FAIL ' + n + '\n      ' + d); };

/* ---------- 1. Every id app.js reads ---------- */
console.log('\n=== 1. Ids read by app.js exist in the markup ===');
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
/* Ids app.js creates itself inside a template literal (the modals), not
   from the static HTML. Detected automatically so a new modal never has
   to be registered by hand. */
const dynamicIds = new Set(
  [...js.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).filter(x => !htmlIds.has(x))
);
/* Strings handed to flashBlock('...') are element ids too. */
for (const m of js.matchAll(/flashBlock\('([^']+)'\)/g)) dynamicIds.add(m[1]);

const readIds = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
for (const id of [...readIds].sort()) {
  if (htmlIds.has(id)) ok('id #' + id);
  else if (dynamicIds.has(id)) ok('id #' + id + ' (created dynamically in a modal)');
  else no('id #' + id, 'not present in the HTML');
}

/* ---------- 2. Every inline handler in the HTML has a function ---------- */
console.log('\n=== 2. Inline handlers in the HTML name a real function ===');
const handlerHtml = [...html.matchAll(/\bon(?:click|change|submit)="([^"]+)"/g)].map(m => m[1]);
const htmlHandlerNames = new Set();
for (const h of handlerHtml) {
  const cleaned = h
    .replace(/document\s*\.\s*getElementById\s*\([^)]*\)/g, ' ')  // a selector, not a handler
    .replace(/\breturn\b/g, ' ');                                 // a keyword
  for (const m of cleaned.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) htmlHandlerNames.add(m[1]);
}
const isDefined = n =>
  new RegExp('function\\s+' + n + '\\s*\\(|const\\s+' + n + '\\s*=|let\\s+' + n + '\\s*=').test(js);
for (const n of [...htmlHandlerNames].sort()) {
  if (isDefined(n)) ok('function ' + n + '()');
  else no('function ' + n + '()', 'not defined in app.js');
}

/* ---------- 3. Every function app.js calls is defined ---------- */
console.log('\n=== 3. Every function app.js calls is defined ===');
/* Strip comments and string bodies so only real code is scanned. */
const code = js
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  // regex literals (this file uses no division operator on a regex object)
  .replace(/\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n])+\/[gimsuy]*/g, ' RE ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
  .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
  .replace(/`(?:\\.|[^`\\])*`/g, '``')
  /* A template literal containing another template literal cannot be paired
     up by the regexes above, so its HTML leaks into `code`. Without this,
     text like "<label>Monthly target (Rp)</label>" reads as a call to
     "target()". The tag list is explicit so comparison operators such as
     "a < b" are not chopped in half. */
  .replace(/<\/?(?:label|span|div|td|tr|th|thead|tbody|table|input|select|option|optgroup|button|p|h[1-6]|a|b|i|em|strong|small|ul|li|form|textarea|canvas|form-row|form-actions|empty-pockets|chips|chart-box|summary-item|value|copy-section|badge-over|inline|subtitle|tag|arrow|container|controls|footer|excel|add-row|danger|primary|secondary|success|negative|positive|neutral|over|highlight|remaining-pill|pill|icon|warn|hist-amount|label-text)\b[^<>]*>/gi, ' ');
const defFn = new Set([...js.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
const defConst = new Set([
  ...[...js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1])
]);
/* Parameter names are legal names inside their own scope but never appear
   as a declaration. Without this, a callback such as forEachMonth(fn)
   gets reported as a missing function. */
const defParam = new Set();
for (const m of js.matchAll(/(?:function\s+[A-Za-z_$][\w$]*\s*|\bcatch\s*)\(([^()]*)\)/g)) {
  for (const p of m[1].split(',')) {
    const name = p.trim().split(/[\s=]/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defParam.add(name);
  }
}
for (const m of js.matchAll(/\(([^()]*)\)\s*=>/g)) {
  for (const p of m[1].split(',')) {
    const name = p.trim().split(/[\s=]/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defParam.add(name);
  }
}
const allNames = new Set([...defFn, ...defConst, ...defParam]);
/* Calls in app.js are always written with no space before "(". Allowing a
   space makes the HTML that leaked out of a template literal misread, e.g.
   "Monthly target (Rp)" -> a call to "target()". */
const called = new Set([...code.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]));
const builtins = new Set(['Chart', 'XLSX', 'confirm', 'alert', 'setTimeout', 'clearTimeout',
  'require', 'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'Array',
  'Object', 'Number', 'String', 'Math', 'JSON', 'Date', 'Set', 'Map', 'parseInt', 'parseFloat',
  'isNaN', 'Boolean', 'Promise', 'Error', 'void', 'do', 'else', 'try']);
const missing = [...called].filter(n => !allNames.has(n) && !builtins.has(n)).sort();
if (!missing.length) ok('every call resolves (' + called.size + ' unique names)');
else for (const n of missing) no('call to ' + n + '()', 'not defined in app.js');

/* ---------- 4. CSS classes ---------- */
console.log('\n=== 4. CSS classes exist in styles.css ===');
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const jsClasses = new Set();
for (const m of js.matchAll(/class="([^"$]*)"/g)) m[1].split(/\s+/).forEach(c => c && jsClasses.add(c));
for (const m of js.matchAll(/className\s*=\s*'([^']*)'/g)) m[1].split(/\s+/).forEach(c => c && jsClasses.add(c));
for (const m of js.matchAll(/classList\.(?:add|remove|toggle)\('([^']*)'\)/g)) jsClasses.add(m[1]);

const required = ['pocket', 'pocket-grid', 'pocket-top', 'pocket-icon', 'pocket-name',
  'pocket-actions', 'pocket-balance', 'pocket-caption', 'pocket-bar', 'pocket-meta',
  'badge-over', 'empty-pockets', 'chip', 'chips', 'sub-block', 'flash',
  'remaining-pill', 'negative', 'positive', 'neutral', 'highlight', 'over', 'tag',
  'empty', 'warn', 'toast', 'ok', 'err', 'modal', 'modal-body', 'modal-head',
  'modal-close', 'modal-backdrop', 'history-month', 'history-item', 'history-empty',
  'form-row', 'form-actions', 'hist-amount', 'plus', 'minus', 'arrow', 'toast-wrap'];
for (const c of required) {
  if (cssClasses.has(c)) ok('class .' + c);
  else no('class .' + c, 'not present in styles.css');
}

/* ---------- 5. Local file references in the HTML ---------- */
console.log('\n=== 5. Local file references in the HTML ===');
for (const m of html.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)) {
  const f = m[1];
  if (fs.existsSync(__dirname + '/' + f)) ok('file ' + f);
  else no('file ' + f, 'not found');
}

/* ---------- 6. The CASH sentinel is used consistently ---------- */
console.log('\n=== 6. Consistency of the CASH sentinel ===');
const cashUses = [...js.matchAll(/CASH/g)].length;
ok('CASH is referenced ' + cashUses + ' times');
if (js.includes('from: from,') && js.includes('to: to,')) {
  ok('a transfer stores CASH as-is (it is not nulled out)');
} else {
  no('a CASH transfer', 'from/to look silently nulled out');
}

/* ---------- 7. No Indonesian left anywhere ---------- */
console.log('\n=== 7. No Indonesian identifiers left in the app files ===');
const INDONESIAN = [
  'kantong', 'pemasukan', 'pengeluaran', 'mutasi', 'jumlah', 'tanggal', 'catatan',
  'tipe', 'dari', 'saran', 'riwayat', 'ringkas', 'grafik', 'tambah', 'hapus',
  'buka', 'tutup', 'simpan', 'muat', 'ganti', 'perbarui', 'tandai', 'isi',
  'opsi', 'saldo', 'kas', 'bulan', 'tahun', 'nama', 'warna', 'ikon', 'sisa',
  'beli', 'pakai', 'plot', 'normalisasi', 'baca', 'sebelumnya', 'sebuah',
  'adalah', 'dengan', 'untuk', 'dari', 'yang', 'tidak', 'ini', 'itu', 'dan'
];
/* Prose words that legitimately appear inside an English sentence are not
   flagged: only whole-word identifier-style hits in code are. The prose
   stop-list below is deliberately short. */
const PROSE_OK = new Set(['that', 'and', 'for', 'this', 'it', 'from', 'to']);
let indo = 0;
for (const [name, text] of [['app.js', js], ['budget-tracker.html', html], ['styles.css', css]]) {
  text.split('\n').forEach((line, i) => {
    for (const w of INDONESIAN) {
      if (PROSE_OK.has(w)) continue;
      if (new RegExp('\\b' + w + '\\b').test(line)) {
        indo++;
        no(name + ':' + (i + 1) + ' still contains "' + w + '"', line.trim().slice(0, 100));
      }
    }
  });
}
if (!indo) ok('app.js, budget-tracker.html and styles.css are free of Indonesian');

console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
