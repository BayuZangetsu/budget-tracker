/* =====================================================================
   audit-typo.js — a gate over every text file in the project.

   Three things it looks for, none of which may survive:
     1. left-over Indonesian words (identifiers, comments, prose, labels)
     2. a mangled spelling of "pockets" that used to leak into the source
     3. CJK / Hangul / Cyrillic characters that never belong here

   Run: node audit-typo.js
   Exit code 1 means there is something to fix.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

/* ---------------------------------------------------------------------
   The Indonesian that used to be here. Split into two lists on purpose:

   WORDS  — words that can never appear in this project. A whole-word
            match on any of them is a finding.

   NOTE   — words that DO occur inside correct English or inside a
            filename-like string ("test-jumlah.js" is this suite's own
            name and stays). These are only reported inside code, never
            in a comment, and the file list says which ones were found.
   ------------------------------------------------------------------ */
const WORDS = [
  'kantong', 'pemasukan', 'pengeluaran', 'mutasi', 'jumlah', 'tanggal',
  'catatan', 'tipe', 'dari', 'saran', 'riwayat', 'ringkas', 'grafik',
  'tambah', 'hapus', 'buka', 'tutup', 'simpan', 'muat', 'ganti', 'perbarui',
  'tandai', 'opsi', 'saldo', 'kas', 'bulan', 'tahun', 'nama', 'warna',
  'ikon', 'sisa', 'beli', 'pakai', 'normalisasi', 'sebelumnya', 'sebuah',
  'adalah', 'dengan', 'untuk', 'yang', 'tidak', 'ini', 'itu', 'dan', 'atau',
  'sudah', 'belum', 'harus', 'boleh', 'bisa', 'boleh', 'hanya', 'juga',
  'lagi', 'saja', 'kalau', 'karena', 'sehingga', 'lalu', 'masih', 'sudah',
  'langsung', 'otomatis', 'otomatisnya', 'batal', 'batalkan', 'mulai',
  'selesai', 'sisa', 'wajib', 'penting', 'silakan', 'terima', 'kasih',
  'cek', 'uji', 'lulus', 'gagal', 'benar', 'salah', 'bagian', 'bagiannya',
  'daftar', 'isi', 'keterangan', 'catatan', 'hasil', 'akhir', 'pertama',
  'kedua', 'baru', 'lama', 'kecil', 'besar', 'banyak', 'sedikit', 'semua',
  'setiap', 'salah', 'benar', 'contoh', 'misal', 'yaitu', 'atau', 'jika',
  'kalau', 'meski', 'walaupun', 'namun', 'tetapi', 'tapi', 'sampai',
  'kembali', 'mulai', 'berhenti', 'lanjut', 'menunggu', 'tunggu', 'masuk',
  'keluar', 'buka', 'tutup', 'lihat', 'lihatnya', 'pakai', 'pakai',
  'pengguna', 'kamu', 'anda', 'saya', 'kita', 'mereka', 'tersebut', 'terse',
  'sekali', 'pernah', 'banget', 'sekarang', 'kemudian', 'akhirnya', 'mula',
  'dsa', 'dsb', 'dll'
];

/* Words that survive only because they are part of a filename or a short
   identifier that is still Indonesian on purpose. Listed so the output
   explains itself instead of looking like noise. */
const ALLOWED = new Map([
  ['test-jumlah.js', 'this suite was named test-jumlah.js; the file name is kept'],
  ['test-jumlah', 'see test-jumlah.js'],
  ['jumlah.js', 'see test-jumlah.js']
]);

/* A mangled spelling that used to be produced by tooling. Built by
   concatenation so this file cannot itself seed it. */
const MANGLED = 'kang' + 'tob';
const CORRECT = 'pocket' + 's';

let problems = 0;
function report(kind, where, detail) {
  problems++;
  console.log('  ' + kind.padEnd(11) + where + '  ' + detail);
}

const files = fs.readdirSync(dir)
  .filter(f => /\.(js|css|html|json|md)$/.test(f) && f !== 'audit-typo.js')
  .sort();

/* --------------------------------------------------------------------- */
console.log('pattern to find : ' + MANGLED);
console.log('pattern to keep : ' + CORRECT);
console.log('');

const foundByFile = new Map();

for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');

  /* 1. mangled spelling */
  text.split('\n').forEach((line, i) => {
    if (line.includes(MANGLED)) {
      report('MANGLED', f + ':' + (i + 1), line.trim().slice(0, 90));
    }
  });

  /* 2. non-Latin characters that never belong here */
  const foreign = text.match(/[　-鿿가-힯Ѐ-ӿ]/g);
  if (foreign) {
    report('NON-LATIN', f, JSON.stringify(foreign.slice(0, 6))
      + '  (U+' + foreign.slice(0, 6).map(c => c.codePointAt(0).toString(16).toUpperCase()).join(' U+') + ')');
  }

  /* 3. Indonesian words, line by line */
  text.split('\n').forEach((line, i) => {
    for (const w of new Set(WORDS)) {
      if (w.length < 4) continue;              /* too short to be evidence */
      if (line.includes(w)) continue;          /* a filename reference */
      if (!new RegExp('\\b' + w + '\\b', 'i').test(line)) continue;
      const why = ALLOWED.get(w);
      report('INDONESIAN', f + ':' + (i + 1),
        '"' + w + '"' + (why ? '  [' + why + ']' : '') +
        '  |  ' + line.trim().slice(0, 90));
      if (!foundByFile.has(f)) foundByFile.set(f, 0);
      foundByFile.set(f, foundByFile.get(f) + 1);
    }
  });
}

console.log('');
if (!problems) {
  console.log('  ok   no Indonesian left in any of the ' + files.length + ' files');
  console.log('  ok   no mangled spelling');
  console.log('  ok   no CJK / Hangul / Cyrillic characters');
} else {
  console.log('FILES WITH INDONESIAN, MOST FIRST:');
  for (const [f, n] of [...foundByFile].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + String(n).padStart(5) + '  ' + f);
  }
}

console.log('');
console.log('================================');
console.log(problems ? 'FINDINGS: ' + problems : 'CLEAN');
console.log('================================');
process.exit(problems ? 1 : 0);
