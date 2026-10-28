# Rencana Pekerjaan Selanjutnya (DRAF — menunggu persetujuan Patria)

Disusun 28 Okt 2026. Status saat ini: Fase 0 LOLOS PENUH (pernyataan
Patria 28 Okt ~11:20 WIB); app live rantai v23 PID 46181; i18n 269
kunci x 3; deviasi kompatibilitas hackathon 0/10 (cek ulang tiap
gerbang fase).

## 0. Ikon rail — hari ini, 28 Okt (perintah Patria 28 Okt ~11:38 WIB)

- Home -> Chat: ikon rail diganti ikon terlampir; label nav.home
  menjadi 'Chat' (ID 'Chat', EN 'Chat', ZH '聊天'). Hanya label:
  data-view="home" dan logika showView/no-nav TIDAK berubah.
- Kanban: ikon rail diganti ikon terlampir.
- Media Studio: ikon rail diganti ikon terlampir.
- Teknis (terverifikasi dari file terlampir): ketiga ikon adalah PNG
  RGBA dengan glif HITAM murni di atas transparan (Chat 809x705,
  Kanban 770x704, Media Studio 795x673). Di rail gelap (#0a0a0a)
  ketiganya WAJIB tampil dengan filter invert(1) — pola yang sama
  dengan setting-icon.png. File disalin apa adanya ke app/public/
  (chat-icon.png, kanban-icon.png, media-icon.png); blob base64 lama
  di App.svelte dihapus (bundle mengecil); ukuran railicon 26px +
  object-fit contain.
- Verifikasi: gerbang nol-error (vite build, svelte-check, app tsc,
  root tsc, gate-test, scan) + commit/push + rantai v24 + konfirmasi
  visual Patria.

## 1. Fase 4 — 29 Okt (Form -> CRM)

Dedupe lead, scoring 1-5, pipeline + draf Outreach. TANPA pengiriman
nyata (draft-only, sesuai gerbang GBatch). Gerbang nol-error + push +
log per fase.

## 2. Fase 5 — 29 Okt (harness evaluasi live + rehearsal)

Harness: kualitas routing, keberhasilan tugas, latensi, biaya per
tugas; rehearsal demo.

## 3. Fase 6 freeze — 30 Okt

Bekukan fitur; hanya perbaikan error.

## 4. Buffer — 31 Okt s.d. 2 Nov

Perbaikan dari rehearsal + bukti live yang tertunda (klik Render
Tier 1, panel Aset Tier 2, ducking + Simpan ASS, VoiceStudio
TTS/clone — semuanya menunggu Patria buka app-nya).

## 5. Video demo 3 menit — 3 Nov

HANYA fitur/kode yang dibangun 27 Okt s.d. 2 Nov (aturan Indie
new-work-only; menampilkan fitur pra-event = risiko diskualifikasi).

## 6. Submit — 4 Nov sebelum 21:00 ET (5 Nov 09:00 WIB)

Form cerebralvalley.ai (tanpa simpan draf, hanya Submit final).
Yang masih dibutuhkan: nama tim (saat ini solo), problem statement,
deskripsi proyek, repo publik, video demo, deskripsi pemakaian
produk Meta, alasan pentingnya model Meta, checkbox izin publikasi.

## Jalur tertunda — butuh keputusan Patria, tidak menghambat jalur utama

- Tier 2 chunk 3 transkripsi: Whisper belum terpasang (keputusan
  instalasi + model).
- Tier 3: preview engine + agent tool layer MCP/CLI (terblokir Tier 2).
- Caption burn-in: ffmpeg MacBook tanpa libass (keputusan: instal
  ulang ffmpeg dengan libass vs renderer lain).
- Provider gambar final + harga aktual (Muse Image masih PROVISIONAL).
- Keputusan lain: brand uji final, nama/komposisi tim, kolom Kanban
  5-vs-3, tab default Media Studio (Video PROVISIONAL), upgrade
  VoiceStudio v0.5.7 (perhatian: lisensi OmniVoice), kartu + Spend
  Limit Meta, hapus cron hapus-cron-posting-hackathon 5 Nov (sudah
  tanpa tujuan), ketahanan rig harness (/tmp sudah 2x terhapus —
  pindahkan rig ke repo).
- Posting harian: hanya atas perintah langsung Patria (kedua cron
  posting sudah dihapus 28 Okt).
