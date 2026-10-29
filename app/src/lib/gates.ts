// Persetujuan historis + model persetujuan pengiriman app.
//
// ATURAN BERDIRI (Patria): tidak ada publikasi/pengiriman tanpa
// persetujuan bernama yang tercatat; perintah eksplisit Patria hanya
// mengesahkan tindakan itu.
//
// MODEL PERSETUJUAN YANG SEBENARNYA BERLAKU DI APP (audit v66 C-B1):
// tidak ada guard kode yang memblokir pengiriman. Yang mengesahkan
// sebuah kiriman adalah AKSI EKSPLISIT USER di UI pada saat itu:
//   - klik "Terbit sekarang" = perintah langsung untuk item itu;
//   - klik jadwalkan (composer / dialog tanggal / batch dengan
//     double-confirm) = persetujuan untuk item itu, dieksekusi
//     scheduler 30 detik selama app terbuka.
// Tidak ada pengiriman yang berjalan sendiri tanpa klik itu, dan
// tidak ada persetujuan live-send UMUM yang bisa dibaca dari flag.
// Versi lama modul ini punya fungsi requireGate() yang TIDAK PERNAH
// dipanggil jalur kirim mana pun — fungsi mati itu DIHAPUS v66 agar
// tidak ada yang mengira kode menegakkan gerbang. Bila suatu hari
// gerbang kode benar-benar dipasang, ia harus dipanggil di ketiga
// jalur (langsung, antrean, scheduler) dan diuji, bukan hanya ditulis.
//
// Status historis (snapshot, BUKAN dibaca live dari berkas):
//   GSTP    docs/fase-1-gstp-approval.json    disetujui 27 Okt 2026 12:04 WIB
//   GKonten docs/fase-2-gkonten-approval.json disetujui 27 Okt 2026 13:06 WIB
//   GBatch  (live sending)                    TIDAK ADA persetujuan umum
// Panel status gerbang dihapus 28 Okt 2026 atas perintah Patria;
// GATES hanya dipakai backend-data.ts untuk status kartu Kanban
// snapshot (bukan sebagai gerbang kirim).

export type GateId = 'GSTP' | 'GKonten' | 'GBatch';

export interface GateState {
  approved: boolean;
  trace?: string;
  record?: string;
  note: string;
}

export const GATES: Record<GateId, GateState> = {
  GSTP: {
    approved: true,
    trace: 'trace-fase1-1793077341157',
    record: 'docs/fase-1-gstp-approval.json',
    note: 'Disetujui Patria 27 Okt 2026 12:04 WIB (snapshot historis)',
  },
  GKonten: {
    approved: true,
    trace: 'trace-fase2-1793077740478',
    record: 'docs/fase-2-gkonten-approval.json',
    note: 'Disetujui Patria 27 Okt 2026 13:06 WIB (snapshot historis)',
  },
  GBatch: {
    // approved:false = tidak ada persetujuan live-send UMUM. Langkah
    // jadwal batch TEROTORISASI TERPISAH (perintah Patria 28 Okt +
    // double-confirm di batch-flow) dan TIDAK melewati guard apa pun
    // — jangan baca flag ini sebagai blokir atas langkah tersebut.
    approved: false,
    note: 'Tanpa persetujuan live-send umum; jadwal batch terotorisasi terpisah (perintah Patria 28 Okt + double-confirm)',
  },
};
