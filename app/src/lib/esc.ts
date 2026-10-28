// Satu esc() bersama untuk semua modul yang membangun HTML dari string.
// Meng-escape & < > " ' — aman untuk teks MAUPUN atribut kutip-ganda
// dan kutip-tunggal. Jangan lagi ada esc() lokal per modul (audit 28 Okt:
// lima salinan, dua varian, tak satu pun meng-escape kedua jenis kutip).
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape untuk string JS kutip-tunggal di dalam atribut HTML kutip-ganda
// (mis. onclick="detailNote('...')"): parser HTML mendekode entitas DULU,
// lalu JS mem-parse escape-nya — jadi \' \" \\ \n \x3c \x3e \x26
// kembali ke karakter aslinya saat tampil (textContent), tanpa bisa
// breakout dari string maupun atribut. BEDA dari esc(): esc() saja TIDAK
// cukup di konteks JS karena entitasnya didekode sebelum JS jalan.
export function jsEsc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/&/g, '\\x26');
}
