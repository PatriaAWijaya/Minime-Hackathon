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
