> REVISI ARAH 27 Okt siang: draf ini DIGANTIKAN oleh docs/ui-draft-v2.md.
> Arah baru (perintah Patria): UI bekerja seperti personal assistant
> dengan Prime Agent, agen + harness skill, mode Kanban, kanvas
> koneksi ala N8N, dan Media Studio (Gambar/Carousel/Reels/Talking
> Head siap post). Dokumen ini dipertahankan sebagai riwayat v1;
> jangan dipakai sebagai acuan build. Acuan build adalah v2.

# Draf UI — Aplikasi Konten (Fase UI, DRAF SAJA)

Status: DRAF, 27 Okt 2026. BUKAN implementasi, BUKAN persetujuan.
Fase baru ini ditambahkan atas perintah Patria 27 Okt 2026 siang,
setelah GKonten lolos dan SEBELUM lanjut ke Fase 3: "tambahkan fase
baru kita membuat UI untuk user berinteraksi; UI ini berbentuk
aplikasi yang pada hasil akhirnya dapat diinstall baik dalam Mac
maupun Windows; draft dulu UI-nya."

Gerbang fase ini: persetujuan draf oleh Patria (setuju / revisi /
tolak). Tidak ada kode UI yang dibangun sebelum draf ini disetujui,
dan tidak ada gerbang yang disetujui atas nama Patria.

## 1. Untuk siapa dan untuk apa

- **Pengguna utama:** pemilik brand / tim konten kecil (1–3 orang)
  yang menjalankan alur Intake → Riset → Strategi → STP → Kalender →
  Produksi → Distribusi draf, tanpa harus paham model AI di baliknya.
- **Janji UI:** satu layar per satu keputusan manusia. Model boleh
  mengusulkan, tetapi tidak ada yang terbit, terkirim, atau
  terlanjur jalan tanpa ketukan persetujuan manusia di UI.
- **Bukan untuk:** publik umum yang mengisi form lead (itu Fase 4),
  dan bukan dashboard analitik penuh (itu di luar slice hackathon).

## 2. Prinsip desain (mengikat untuk build nanti)

Diambil dari aturan dasar UI yang sudah ditetapkan Patria untuk
semua build (desain untuk user beneran, bukan gaya portofolio AI):

- Readability dulu: body 14–16px minimum, judul section tebal dan
  jelas, label di atas field (bukan placeholder saja), tombol
  minimal 44px tinggi dan berlabel kata lengkap ("Setujui STP",
  bukan "OK").
- Satu primary action per section. Tombol destruktif (hapus, tolak)
  selalu dengan konfirmasi.
- Hierarki lewat tipografi dan spacing dulu, baru warna. Satu warna
  aksen; hijau/kuning/merah hanya untuk status yang sudah jelas
  (lolos / menunggu / ditolak).
- Navigasi stabil dan predictable: sidebar kiri selalu di tempat
  yang sama, tidak berpindah-pindah per layar.
- Minimalis dan bersih: satu layar, satu tugas, tanpa panel yang
  berebut perhatian. Angka rata kanan, status selalu terlihat.
- Setiap angka biaya tampil dalam Rupiah dulu (aturan 27 Okt siang);
  USD hanya sebagai sumber dalam kurung bila provider menagih USD.
- Setiap draf model selalu berlabel jelas: "DRAF — belum disetujui",
  "Menunggu GSTP/GKonten", atau "Disetujui oleh [nama], [tanggal]".
  Tidak ada draf yang tampil seolah-olah sudah final.

## 3. Arsitektur layar (7 layar, 1 alur)

Alur mengikuti gerbang yang sudah ada — UI tidak membuat gerbang
baru, ia hanya menampilkan gerbang yang sudah ada:

```
Proyek → Intake → Riset & Strategi → STP (GSTP) → Kalender →
Brief & QC (GKonten) → Distribusi Draf → Biaya & Jejak
```

### Layar 1 — Proyek (beranda)
- Daftar proyek (kartu per brand): nama, status gerbang terakhir
  (mis. "Menunggu GKonten", "GSTP disetujui"), tanggal update.
- Tombol utama: "+ Proyek Baru" → ke Intake.
- Proyek uji yang sudah ada (TEST-BRAND-001) tampil sebagai kartu
  pertama dengan label "TEST — brand uji, bukan klien nyata".
- Tidak ada proyek yang bisa dihapus dari layar ini tanpa konfirmasi
  eksplisit (aturan berdiri: proyek user tidak boleh hilang otomatis).

### Layar 2 — Intake (form ProductBrief)
- Field: nama produk/brand, audiens, masalah, tawaran. Satu kolom,
  label di atas, contoh pengisian singkat di bawah tiap field.
- Tombol: "Simpan Brief" (draft) → lanjut ke Riset. Tidak ada
  tombol "Jalankan semua" — tiap tahap dipicu terpisah supaya
  jejaknya jelas.

### Layar 3 — Riset & Strategi (baca + verifikasi)
- Tiga blok terbaca vertikal: Fakta riset (dengan label "DRAF —
  belum terverifikasi"), Asumsi, dan Behaviour (digital, paparan
  media, jenis konten, cara transaksi, touch points, pain point +
  solusi, spending bulanan, spending digital).
- Setiap fakta bisa ditandai pengguna: "Terverifikasi" / "Ragukan"
  (catatan bebas). Penanda ini tersimpan dan ikut ke STP, bukan
  sekadar tampilan.
- Blok Strategi di bawahnya: positioning + pilar-pilar.

### Layar 4 — STP & Gerbang GSTP (layar keputusan)
- Kartu STP: Segmen, Targeting, Positioning — teks penuh, bukan
  ringkasan yang memotong.
- Tiga tombol keputusan yang selalu terlihat bersama: "Setujui STP
  (GSTP)", "Minta Revisi" (wajib isi catatan revisi), "Tolak"
  (wajib isi alasan). Keputusan dicatat sebagai record baru
  (append-only); STP yang ditolak/revisi tidak menimpa STP lama.
- Sampai GSTP disetujui, tombol "Lanjut ke Kalender" dalam keadaan
  nonaktif dengan keterangan "Diblokir sampai GSTP disetujui" —
  blokir ini ditegakkan di backend juga, bukan hanya di UI.

### Layar 5 — Kalender 7 Hari (papan minggu)
- Tampilan minggu: 7 kolom (Hari 1–7), tiap kartu berisi tema,
  pilar, jenis konten, channel, hook, dan CTA.
- Klik kartu → masuk ke Brief hari itu (Layar 6). Kalender bisa
  digeser minggu berikutnya hanya setelah Fase 3+ (di luar slice
  ini, kalender minggu berikutnya ditandai "Segera").

### Layar 6 — Brief & QC (layar produksi per item)
- Kiri: deskripsi visual (visual prompt text-free) + overlay
  template + ukuran channel.
- Kanan: panel Gambar — pada slice ini menampilkan status jujur:
  "Gambar menunggu provider (Muse Image belum aktif)" dengan
  placeholder abu-abu berlabel, BUKAN gambar palsu. Begitu provider
  aktif, gambar hasil generate tampil di sini dengan label
  "Hasil generate — overlay diterapkan template, bukan digambar
  model".
- Panel QC di bawah: skor, daftar pelanggaran (bila ada), dan label
  "QC rule (bukan penilaian model live)". QC yang gagal menampilkan
  tombol "Minta Perbaiki" — bukan tombol yang menyembunyikan gagal.
- Tombol keputusan GKonten per item dan per paket: "Setujui Konten
  (GKonten)", "Minta Revisi", "Tolak dengan alasan".

### Layar 7 — Distribusi Draf & Biaya/Jejak
- Dua tab:
  - **Distribusi Draf:** daftar item yang sudah lolos GKonten,
    status per channel (Postiz DRAF — tidak pernah "Terbit" di
    slice ini), tombol "Kirim ke Postiz sebagai DRAF" (Fase 3).
    Tidak ada tombol "Terbitkan" di slice ini.
  - **Biaya & Jejak:** total biaya dalam Rupiah (dengan kurs dan
    tanggal kurs), per model/per tahap, jumlah token, dan jejak
    (trace ID) per pekerjaan dengan status job (antrian → jalan →
    selesai/gagal) yang diperbarui live (SSE). Biaya yang harganya
    belum diketahui tampil "Belum diketahui", bukan Rp0 yang
    menyesatkan.

## 4. Komponen yang dipakai ulang di semua layar

- **Kartu Keputusan:** judul, isi penuh, status, tiga tombol
  (Setujui / Revisi / Tolak) — dipakai di STP dan di Brief.
- **Lencana Status:** DRAF (abu-abu), Menunggu (kuning),
  Disetujui (hijau), Ditolak (merah), Diblokir (abu-abu dengan
  keterangan gerbangnya).
- **Panel Biaya:** selalu format Rp dulu, kurs + tanggal di
  footnote kecil.
- **Jejak Pekerjaan:** daftar job dengan trace ID, tahap, dan
  status live; gagal menampilkan pesan error apa adanya (bukan
  "Terjadi kesalahan" tanpa isi).
- **Bilah Progres Alur:** Intake → Riset → STP → Kalender →
  Brief → Distribusi, dengan tahap saat ini disorot dan tahap yang
  diblokir gerbang ditandai gembok + nama gerbangnya.

## 5. Target install (hasil akhir)

- **macOS:** aplikasi `.app` dalam `.dmg`, berjalan di Apple Silicon
  (dan Intel bila memungkinkan tanpa upaya ekstra).
- **Windows:** installer `.msi` (atau `.exe` bila .msi tidak
  memungkinkan), berjalan di Windows 10/11 64-bit.
- Satu basis kode UI untuk kedua OS (tidak ada dua UI terpisah).
  Instalasi tidak membutuhkan terminal, tidak membutuhkan
  Node/Python di mesin pengguna, dan tidak membundel kredensial
  apa pun (kredensial diisi pengguna sendiri di dalam aplikasi,
  tersimpan di OS keychain/credential store, tidak ikut installer).
- Update aplikasi di luar slice hackathon (diperlukan penanda
  "Pembaruan tersedia" saja, bukan auto-update diam-diam).

## 6. Teknologi yang diusulkan (PROVISIONAL, belum diputuskan)

Pilihan utama yang diusulkan untuk diputuskan Patria:

- **Tauri 2 + Svelte 5** — alasan: bundle kecil, performa ringan,
  installer Mac (.dmg) dan Windows (.msi) dari satu basis kode,
  dan Patria sudah berpengalaman dengan stack ini di proyek lain.
  Ini adalah pilihan teknologi, BUKAN pemakaian ulang kode lama:
  UI Aplikasi Konten dibangun dari nol di repo hackathon ini
  (aturan Indie: new work only), tidak menyalin kode proyek lama.
- Alternatif yang dicatat bila Tauri bermasalah: Electron
  (bundle lebih besar, tetapi ekosistem WebView lebih mapan).
  Keputusan final ada di Patria pada gerbang draf ini.
- Backend tetap yang sudah ada (NestJS/Fastify, PostgreSQL +
  pgvector, BullMQ/Redis, SSE) — UI berbicara ke backend lewat
  API yang sama dengan pipeline, bukan logika baru di frontend.
  Gerbang (GS/GSTP/GKonten/GBatch) tetap ditegakkan di backend;
  UI hanya menampilkan dan memicu, tidak pernah melonggarkan.

## 7. Yang TIDAK ada di draf ini (sengaja)

- Tidak ada editor gambar di dalam aplikasi (overlay diterapkan
  template di backend; editor visual penuh di luar slice).
- Tidak ada autopost/publish live (distribusi berhenti di DRAF).
- Tidak ada login multi-user / peran (satu pengguna per instalasi
  pada slice ini; kolaborasi tim di luar slice).
- Tidak ada video/Reels editor (video dipotong dari slice).
- Tidak ada sinkronisasi cloud antar perangkat (data lokal +
  backend VPS pada slice ini).

## 8. Urutan build setelah draf disetujui (usulan, bukan janji)

1. **Prototype klik:** wireframe statis yang bisa diklik
   (7 layar, data dummy berlabel TEST) — untuk validasi alur
   dengan Patria sebelum ada backend wiring.
2. **Scaffold aplikasi:** proyek Tauri baru dari nol di repo ini,
   satu layar Proyek + Intake yang jalan di Mac dan Windows.
3. **Wiring gerbang:** Layar STP (GSTP) dan Brief (GKonten) tersambung
   ke backend + record approval append-only.
4. **Kalender + Biaya/Jejak:** Layar 5 dan 7 tersambung, SSE live.
5. **Paket install:** .dmg (Mac) dan .msi (Windows) diuji instal
   bersih di mesin yang belum pernah memasang aplikasi ini.
6. **Gate UI:** draf disetujui ulang setelah prototype klik, dan
   build installable diuji sebelum demo video.

## 9. Pertanyaan yang masih menunggu Patria (tidak menghambat draf)

- Teknologi final: Tauri 2 + Svelte 5 (usulan) atau Electron?
- Nama aplikasi yang tampil di installer dan judul jendela
  (saat ini placeholder: "Aplikasi Konten")?
- Apakah prototype klik (langkah 1) perlu dibuat dulu, atau
  langsung scaffold aplikasi setelah draf disetujui?
