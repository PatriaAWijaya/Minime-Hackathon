# Flow Konten Batch + Brand Identity (28 Okt 2026)

Perintah Patria: 19:40 usulan flow batch (disetujui Mimi dengan evaluasi
+ urutan Fase A–D), 19:42 tap "Buatkan flow ini", 19:44 menu Brand
Identity di Media Studio, 19:45 varian logo, 19:46 legal + commercial.

## Arsitektur

Media Studio kini 5 tab: Script, Image, Batch, Voice, Video
(mediaTab; default tetap Video PROVISIONAL). Brand TIDAK lagi tab
sendiri — sejak 28 Okt 20:55 atas perintah Patria, Brand menjadi
sidebar kiri di dalam tab Image (`.img-layout`: sidebar 320px +
form gambar fleksibel; `.mediagrid` 1 kolom di lebar sidebar).

### Brand (`app/src/lib/brand.ts`, state `minime.brand`)

- Nama brand + checkbox "Pakai brand ini di semua generate gambar".
- Logo 7 varian (perintah Patria): normal, negative (putih), positive
  (hitam), logotype, wordmark, legal, commercial. Tiap varian = slot
  unggah (file -> `image_save` ke `~/minime-images/`) + preview (via
  `image_read`) + hapus (metadata + `image_delete`).
- Elemen visual: daftar (file + label) + tambah/hapus.
- Font: daftar (nama + peran teks bebas) + tambah/hapus.
- Warna korporat: daftar (color picker <-> hex + nama) + tambah/hapus.
- Header: teks + slot gambar. Footer: teks + slot gambar.
- (Preview "Sufiks prompt dari brand" + catatan binding DIHAPUS atas
  perintah Patria 28 Okt 20:53 — sufiks tetap bekerja di balik layar
  untuk generate Image & Batch.)

Binding v1 (JUJUR): prompt-level saja. Endpoint generations Meta hanya
menerima teks — yang masuk ke prompt: nama, warna (hex), font (nama),
teks header/footer, label elemen visual. Logo & file elemen visual
TERSIMPAN untuk Canva/manual dan binding gambar-referensi masa depan
(endpoint edits, encoding-nya masih perlu probe). Model teks tidak bisa
menempel logo ke gambar — itu pekerjaan Canva, bukan prompt.

Perangkap yang ditemukan rig: filter load yang membuang font bernama
kosong membuat baris font baru hilang saat re-render. Perbaikan: baris
kosong adalah state edit yang sah; filter hanya membuang non-string,
dan `brandSuffix()` melewati font tanpa nama.

### Batch (`app/src/lib/batch-flow.ts`, state `minime.batch`)

Urutan: form -> skrip -> kartu -> jadwal.

1. **Form**: jenis (image / carousel 3 slide), topik/brief, jumlah hari
   (1–30, clamp), mulai tanggal (default hari ini, lokal — bukan UTC),
   channel Postiz (Instagram/Facebook), baris status brand.
2. **Skrip**: satu panggilan router per hari (persona Agen Kreatif +
   instruksi bahasa UI). Format keluaran dipaksa tiga baris bermarker
   Inggris tetap (TITLE:/CONCEPT:/VISUAL:) agar parsing tidak bergantung
   bahasa UI; nilai dalam bahasa UI. Parse longgar: gagal parse ->
   seluruh teks jadi konsep. Tiap skrip bisa diedit (judul, konsep,
   visual) + dihapus; edit teks menyimpan TANPA re-render (caret-safe,
   pola yang sama dengan Script Editor & Brand).
3. **Approve** ("Setujui Semua & Generate"): kartu dibangun dari skrip
   (3 pilihan visual per kartu, belum dipilih). Generate = antrean
   tugas datar (kartu x pilihan x slide) dengan konkurensi 3 (rate
   limit Meta tidak dipublikasikan) + progres + tombol batal.
   - Image: 1 generate per pilihan (rasio 4:5).
   - Carousel: 3 generate per pilihan (satu per slide: hook/body/CTA,
     rasio 1:1).
   - Prompt = visual + ", no text, no words, no letters, no watermark"
     + sufiks brand (bila aktif). Tiap gambar langsung `image_save`
     + `addImgSpend(1)` (akuntansi tunggal di `image-api.ts`) — reload
     di tengah jalan tidak menghilangkan progres; tugas yang filenya
     sudah ada dilewati.
   - Kartu gagal: status + pesan error + tombol "Coba lagi" (hanya
     tugas yang hilang). `generating` TIDAK dipulihkan dari storage
     (reload tidak boleh mengunci UI pada loop yang sudah mati).
4. **Kartu draf**: klik pilihan = pilih (border aksen). Kartu yang
   tidak dipilih menampilkan catatan sistem-pilih-Visual-1.
   - Canva (round-trip manual, BUKAN API sekali klik): "Unduh + Salin
     prompt" (unduh file pilihan + salin prompt visual ke clipboard;
     catatan menjelaskan fallback klik-kanan bila WebView tidak
     memicu unduhan) -> edit di Canva (browser) -> "Tarik revisi"
     (unggah 1..n file -> pilihan baru "Revisi via Canva", otomatis
     terpilih; untuk carousel, revisi boleh multi-file).
5. **Jadwal Postiz** (tombol double-confirm: arm -> eksekusi; ini
   adalah "batch step" yang diotorisasi Patria 28 Okt, menggantikan
   constraint draft-only di app/AGENTS.md HANYA untuk langkah ini):
   - Per kartu (hanya status ready/failed; failed yang dilewati
     dilaporkan, bukan diam-diam): file terpilih (atau Visual 1 bila
     tak dipilih) -> `image_read` -> upload multipart
     (`POST {base}/api/public/v1/upload`, field `file`, kunci mentah)
     -> {id, path} -> `POST {base}/api/public/v1/posts`
     `{type: 'schedule', date, posts: [{integration: {id}, value:
     [{content: judul + konsep, image: [{id, path}]}],
     settings: {__type, post_type: 'post'}}]}`.
   - Tanggal = mulai + (hari−1) pukul 09:00 WIB (= 02:00 UTC).
   - Base `http://127.0.0.1:4007` (instansi lokal MacBook, sama dengan
     klien draf Fase 3; CSP sudah mengizinkan 127.0.0.1:4007).
     ID channel dari draf Fase 3 (Instagram cmvc8dsxd0001jv6wa8786o2h,
     Facebook cmvcffnhy0001jv6o6cw6wpac) — bila channel berubah di
     dashboard, jadwal gagal jujur dengan HTTP error.
   - Berurutan (tanpa konkurensi) + status per kartu + ringkasan
     (terjadwal/gagal/dilewati) + tombol "Ulangi yang gagal".
   - Kunci Postiz hilang -> catatan jujur (isi di Pengaturan).
     Postiz tidak berjalan -> error koneksi per kartu + catatan.

### Refaktor pendukung

- `image-api.ts` (BARU): klien `metaGenerateImage` + `RATIO_SIZE` +
  `IMG_*` + `readImgSpend`/`saveImgSpend`/`addImgSpend` — dipakai
  image-flow & batch-flow (satu sumber akuntansi, tanpa duplikasi
  logika fetch). image-flow direfaktor memakai modul ini + sufiks
  brand di `sentPrompt()`; App.svelte mengimpor `readImgSpend` dari
  image-api.
- Rust `image_delete` (baru, std-only, idempotent bila file hilang)
  + registrasi di main.rs. Dipakai hapus logo/elemen/header/footer.
- CSS: `.batch-card`, `.choices-row`, `.choice(.sel)`,
  `.choice-thumbs img` di layout-scroll.css (app.css tetap verbatim).
- i18n: 479 kunci x 3 (per 28 Okt malam, setelah hapus brand.prompt.*, img.title, dan kunci chip mati; dulu 486: ms.tab.brand/batch, brand.*,
  batch.*), 0 duplikat, 0 selisih.

### Verifikasi dokumen vs live

- Postiz upload + schedule: DOKUMEN RESMI (docs.postiz.com, diakses
  28 Okt 2026) — endpoint, field `file`, bentuk {id, path}, bentuk
  schedule, settings `__type`. BUKAN tebakan integrator.
- Bukti LIVE di app MASIH MENUNGGU (sama seperti flow gambar):
  Postiz berjalan di MacBook (bangun; rantai deploy berjalan) + klik
  Patria di tab Image/Batch. Status schedule = docs-verified, bukan
  live-proven —
  dan setiap kartu melaporkan sukses/gagal sendiri-sendiri supaya
  kegagalan live tidak tertutup.

### Gerbang (28 Okt malam)

root+app tsc 0, svelte-check 0 error, vite build OK, gate-test 14/14,
scan PASSED, cargo fmt/check/clippy 0, rig-brand 14/14,
rig-batch BARU 15/15, rig-vs/sherpa/script/chat/image tetap PASS.

Dua bug yang ditangkap rig (bukan asumsi): (1) filter load font
membuang baris kosong; (2) `readBatch()` tidak menyalin
`scheduleArmed` sehingga tombol jadwal tidak pernah mengeksekusi.
Keduanya diperbaiki + dibuktikan rig.

### Follow-up (bukan janji)

- Probe endpoint edits Meta (encoding input) sebelum binding
  gambar-referensi brand.
- Probe Gemini-image sebagai provider kedua (endpoint + harga +
  cakupan kunci) — saat ini slot kosong, Meta satu-satunya primer.
- Juri visi untuk auto-pick "terbaik" sejati (v2); v1 = Visual 1.
- Verifikasi unduhan anchor di WebView MacBook (fallback klik-kanan
  sudah dicatat di UI).
- Live proof: Brand (unggah 7 varian + warna + font), Batch end-to-end
  (2 hari image + 1 hari carousel), jadwal Postiz pertama.
