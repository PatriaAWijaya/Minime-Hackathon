# Rekap Pekerjaan Minime-Hackathon — 3 November 2026 (v3, sampai v212 LIVE + v213 dalam pengerjaan)

Acuan sebelumnya: `docs/rekap-pekerjaan-02-nov-2026-v2.md` (v2, sampai v201 LIVE:
153 item ✓, 67 item ✗). Dokumen ini menggantikannya sebagai acuan terbaru.
Repo: PatriaAWijaya/Minime-Hackathon, branch main. HEAD remote saat audit:
`d437071` (log-LIVE v212). App LIVE di MacBook = v212, PID 89860.

## Legenda

- ✅ = selesai dan terbukti (lolos rig/gerbang, dan/atau konfirmasi live Patria).
- 🟡 = dibangun dan lolos rig, tapi sebagian, belum bukti live, atau menunggu
  satu keputusan kecil.
- ❌ = belum dibangun, diblokir, atau menunggu vonis/keputusan Patria.

## Perubahan sejak v2 (v202–v213)

- v202: template pola sinematik VLOG CINEMATIC ke panel video (10 tombol).
- v203–v205: Skenario 1 Tahap 0+2, 4+5, 6 (brief interaktif diperluas, poster
  otomatis ke Planner, pengingat H-3 + konfirmasi terbit).
- v206: browser riset teks untuk agen (Rust research.rs, DuckDuckGo).
- v207–v210: Skenario 2 ujung-ke-ujung (rencana 30 hari + Gerbang 1, naskah 3
  jalur + QC + Gerbang 2, visual + caption + Gerbang 3, batch 90 draf
  bertanggal + H-3).
- v211: DIBATALKAN (carousel maks 10 slide di form Batch lama — formnya
  dihapus di v212, tidak pernah terkirim).
- v212 (LIVE 3 Nov ~06:16 WIB): alur rencana + riset lewat chat; panel
  Rencana, form Batch lama, dan panel Riset Live DIHAPUS dari app; perintah
  riset memakai titik-dua (`riset: <topik>`); 14 rig lolos; gerbang 9/9.
- v213 (dalam pengerjaan, BELUM terkirim): rasio default preview Video
  Editor 9:16 + picker rasio (16:9, 9:16, 1:1, 4:5) di kanan bawah preview,
  berlaku juga saat kosong; thumbnail Library mengecil (faktor 40% vs 60%
  menunggu jawaban Patria — pertanyaan sudah diajukan 06:17 WIB).

## Ringkasan eksekutif

- Versi terkirim: v1–v212 (v211 dibatalkan, tidak dihitung sebagai terkirim).
- Gerbang v212: vite build lolos, svelte-check 0 error / 21 warning (baseline),
  14 rig ALL PASSED, root build, gate-test 14 grup, scan bersih (hanya false
  positive yang diketahui: `kb-ask-del`, `task-close`, `kb-task-x`), ledger
  md5 tetap `d542428fe9901fbd417e098e9249d4b6`, i18n 1271/bahasa (v212)
  → 1272/bahasa (tree v213), cargo fmt/check/check --tests 0 warning/error,
  Cargo.lock bersih.
- Catatan gerbang v212 (jujur): cek i18n skrip gerbang sempat FAIL karena
  bug parser skrip (regex kunci tanpa tanda kutip), BUKAN kode. Parser
  diperbaiki, cek diulang pada tree yang sama: 1271/bahasa, 0 duplikat.
  Efektif 9/9 lolos. Sejak v212, log gerbang + rig disimpan di lokasi
  persisten (`~/workspace/riglogs-v212/`), bukan /tmp (tmpfs VM sempat
  membersihkan log loop rig v212 di tengah jalan).
- Ukuran: dist 1,1 MB (JS 681 KB, CSS 61 KB); src 18.359 baris (terbesar:
  i18n.ts 3.943 baris data, v5logic.js 3.708, social.js 1.644, App.svelte
  1.607, creative-brief.ts 1.135). Tidak ada marker TODO/FIXME/XXX di src.
- Vonis tumpang tindih: TIDAK ditemukan fungsi yang tumpang tindih (§4).
  Dead code yang tersisa: 1 fungsi (`ve2ClipKind`, sudah diketahui sejak
  audit v2, menunggu kata Patria).
- Satu inkonsistensi user-facing yang MASIH ADA sejak v2: label Billing
  "Veo 3.1" untuk spend yang sebenarnya Omni (§3.1). Menunggu kata Patria
  (rekomendasi audit §8 v2 belum dieksekusi — lihat §7).

## 1. CHECKLIST DETAIL per modul

### 1.1 Fondasi & Fase 0 (27–28 Okt 2026)

- ✅ Scaffold Tauri 2 + Svelte 5 dari nol, tema system/gelap/terang.
- ✅ Router: Meta muse-spark-1.3 → Gemini flash-lite → Ollama DeepSeek/Qwen;
  `LiveUnavailableError` terlihat, bukan diam-diam diganti model.
- ✅ Policy gates server-side (GS/GSTP/GKonten/GBatch); GTemplate null dan
  GBatch false BY DESIGN, bukan error (lihat §2.9 v2 — tetap berlaku).
- ✅ Ledger biaya append-only + hard limit; md5 tidak berubah sejak v46.
- ✅ Fase 0 LOLOS PENUH (vonis Patria 28 Okt ~11:20).
- ✅ Fase 1 (GSTP, brand fiksi TEST-BRAND-001), Fase 2 (kalender 7 hari +
  7 brief, GKonten), Fase 3 (7 carousel × 3 slide, QC 100/100), Fase 4
  (12 lead → 10 dedup, 6 draf Outreach, 0 model call, draft-only).

### 1.2 Home / Chat (termasuk 3 Alur Patria)

- ✅ Alur 1 (brief → Prime buat folder → delegasi → kesediaan → QC →
  laporan lengkap) = v103.
- ✅ Alur 2 (folder + agen aktif → brief → delegasi HANYA agen aktif) = v117.
- ✅ Alur 3 (Graph → project → node → instruksi; muncul di list agen
  aktif) = v115 + v117.
- ✅ Aturan sinkron dua arah (menu utama ↔ graph) = 30 Okt 13:47, dipegang.
- ✅ Aturan agen menyatakan kesediaan → dipanggil, status aktif, muncul di
  sidebar list agen aktif = 30 Okt 16:16, dipegang.
- ✅ Pesan chat tanpa cap jumlah (v159); hapus langsung tanpa dialog (v141);
  aksi bubble Reply/Star/Copy/Delete + react 8 emoji (v131).
- ✅ Standar penulisan laporan (v130/v132/v143/v154): opsi ►RECOMMEND
  mendahulukan pendalaman hasil itu sendiri, dilarang menawarkan versi
  usaha/industri lain kecuali diminta (v143).
- ✅ Navigasi otomatis ke Media Studio saat mendalami brief (v145).
- 🟡 QC 5 kriteria + mode gate maks 2 revisi (v159/v161): lolos rig, belum
  penilaian live yang tersisa (grounding v155, Brain v152, gate v161).
- 🟡 Brief Image otomatis (v162): lolos rig; auto-brief untuk fan-out +
  Script/Voice/Video Editor belum dibangun (menunggu vonis bila diinginkan).
- ✅ v212: alur rencana + riset lewat chat (LIVE); panel/form dihapus total.
- 🟡 Delegasi Riset umum dari chat BELUM memakai researchRun — hanya entri
  `riset: ...` dan tahap riset rencana yang browsing (batasan dinyatakan).
- 🟡 Konfirmasi live Patria untuk alur chat v212 BELUM ada.

### 1.3 Kanban

- ✅ Kartu tugas agen muncul di Kanban (v149), menetap + detail 2x klik
  (v150), popup detail + tombol X sudut kanan atas (v153).
- ✅ Tidak ada penghapusan otomatis kartu/project (aturan 25 Okt 22:33).
- 🟡 Konfirmasi live eksplisit untuk kartu Kanban tidak tercatat (lolos rig;
  bukan bagian konfirmasi 22:10–22:11).

### 1.4 Graph

- ✅ Node/edge, pan, zoom 0,5–2, header + dropdown project + Buat Project
  Baru, play/stop mengambang, dialog hapus project (teks persis kata
  Patria).
- ✅ Render ditunda double-rAF (v157); delegasi menghubungkan node otomatis
  via connector (v151).
- 🟡 Garis Graph v157 masuk vonis 4 Nov (dianggap teknis sudah bila tak ada
  perubahan, namun belum uji live).
- ❌ Klik + tengah Graph menjalankan alur — belum dibangun (menunggu vonis).

### 1.5 Library

- ✅ Hanya 3 bulan kalender terakhir tampil; selebihnya DIARSIPKAN (bukan
  hapus); tombstone untuk hapus.
- ✅ Detail klik-2x (v118); tombol "Masuk Planner" (v204); caption
  dipasangkan ke gambar (v204).
- ✅ Galeri Image Editor hanya 10 output terakhir, thumbnail saja (v158).
- 🟡 Detail klik-2x untuk kartu ARSIP belum dibangun.
- 🟡 Thumbnail mengecil (v213): menunggu jawaban faktor 40% vs 60%.
- ❌ Upload arsip Library ke Google Drive (OAuth) — belum dibangun.

### 1.6 Media Studio — Script Editor

- ✅ Menu Social (platform, format image/carousel/reels, framework
  aida/pas/bab/fab/empatp/acca/hso/golden), Artikel (bridge seSetArtikel),
  Movie (formulir PROVISIONAL manual).
- ✅ Caption 3 jalur terpisah: artikel, sosmed, video (v172, aturan berdiri).
- ✅ Tombol Bersihkan di 3 menu (v146); field 5W1H roll-over (v147).
- ✅ Impor dari Library + Chat maks 20 + 20 (v166) — mengisi kolom HASIL.
- 🟡 Impor v166 masuk vonis 4 Nov (perilaku sekarang = mengisi Hasil).
- ❌ Bridge penerimaan naskah movie dari chat (scope v160 butir 1) — BLOCKED.
- 🟡 Spec movie edukasi/komedi belum ditulis Patria — jalur sementara
  direct-generate.

### 1.7 Media Studio — Image Editor

- ✅ Redesain v163: Gaya Visual terpisah dari Output Desain (Poster, Story
  Board, Carousel); rasio untuk Poster; durasi + rasio + scene untuk Story
  Board; jumlah slide 6–10 untuk Carousel; Judul/Subjudul/Listicle.
- ✅ Pola prompt poster WAJIB (v171); pola carousel (v173, blocked cap);
  struktur storyboard 7 field per panel (v174, LIVE).
- ✅ Storyboard SEQUENCE + STYLE LOCK (v164/v165): bible + satu shot per
  frame, gaya konsisten.
- ✅ Setujui draft: Poster/Carousel → caption + Library (+ Poster otomatis
  ke Planner, v204); Story Board → rencana Video Editor + naskah VO ke
  Audio Editor + caption video (v163/v174).
- ✅ Edit di Canva + Impor dari Canva per varian (v163); round-trip Canva
  masuk vonis 4 Nov (prefill caption Planner + round-trip Canva v163).
- 🟡 Auto-toggle "Tanpa teks" saat field teks overlay diisi — belum
  dijanjikan, masih manual.
- ❌ Batas slide carousel v173 — BLOCKED (referensi 11 slide vs maks app 10;
  widget 1 Nov ~23:00 belum dijawab).

### 1.8 Media Studio — Video Editor (ve2)

- ✅ Timeline 4 track (Video, B-Roll, Audio, Teks); render FFmpeg 1280×720@30;
  fade = pass kedua; zoom = preview-only; track Teks tidak ikut render.
- ✅ Bar editor track (v191), pesan probe jelas (v193), sintaks ffprobe
  benar (v194), snap magnet track sama default TRUE (v195), geser grip
  cap durasi asli (v195).
- ✅ Play/stop/idempotent (v195/v198), pratinjau idle = isi file asli
  (v186), pratinjau 9:16 (v193), dialog pemilih file (v183, terkonfirmasi
  live), daftar aset grid thumbnail (v188), × per tile aset (v189).
- ✅ Generate HTML dari deskripsi HyperFrames (v185, fungsi ok, hasil belum
  memuaskan — rincian ketidakpuasan belum dijawab Patria).
- ✅ Omni mesin utama footage (v181, pengganti Veo yang dimatikan Google);
  Wan 3.0 via ClassAI sebagai alternatif (v201); HyperFrames hanya motion
  graphics/teks (aturan berdiri 2 Nov 01:12).
- ✅ Template pola sinematik VLOG CINEMATIC 10 tombol (v202).
- 🟡 Rasio preview + picker (v213): kode + build + svelte-check lolos,
  rig-ve2 §v213 ditulis, BELUM jalan (menunggu faktor thumbnail Library
  agar satu rebuild + satu gerbang).
- 🟡 Generate live Omni pertama: BELUM PERNAH dicoba (butuh billing aktif;
  masuk vonis 4 Nov).
- 🟡 Generate live Wan pertama: BELUM PERNAH dicoba (butuh kunci ClassAI
  Patria di Settings app; tidak ada kunci di Secure Vault).
- 🟡 Burn-in teks/caption di atas footage: belum bisa (batas dinyatakan).
- 🟡 Seek #ve2Video via controls bawaan saat playback: desync, belum
  ditangani, belum dilaporkan Patria.
- 🟡 Snap lintas track: belum ada vonis (saat ini hanya track yang sama).
- 🟡 Berkas disk ikut terhapus saat × aset ditekan: belum ada vonis (saat
  ini hanya entri daftar).
- ❌ Yang hilang di redesain v178 dan diakui: render manual Tier 1, form
  caption ASS standalone, Asset Library Tier 2.
- ❌ "Button render" di Inspector (v193): diartikan Ekspor MP4; belum ada
  koreksi Patria.

### 1.9 Media Studio — Voice

- ✅ VoiceStudio engine utama via local API 127.0.0.1:3900 (proses
  terpisah, tidak di-bundle); yovoice fallback; UI voice editor native
  timeline multi-track.
- ✅ Naskah VO storyboard mengalir ke Voice Editor (v174: vsSetScript).
- 🟡 Upgrade VoiceStudio v0.5.7: belum diputuskan.
- 🟡 Penyambungan transkrip Voice Editor ke caption ASS video: belum
  dibangun.
- 🟡 Penghapusan PENUH fungsi setup VoiceStudio: belum dibangun.
- 🟡 Daftar model VoiceStudio pajangan: belum diputuskan.

### 1.10 Planner (native, menggantikan Postiz)

- ✅ 8 kanal; antrean + scheduler 30 detik (hanya saat app terbuka; hanya
  menerbitkan 'queued' bertanggal); OAuth loopback 127.0.0.1:4317.
- ✅ Komposer menolak berkas lokal untuk IG/Threads/TikTok (soc.err.file_url)
  — pengaman, bukan bug.
- ✅ Draf tanpa tanggal diterima (v204); 'queued' tanpa tanggal ditolak;
  seksi "Belum terjadwal" (v204).
- ✅ H-3: seksi "Menunggu konfirmasi terbit" + pesan chat sekali per item +
  konfirmasi mengubah draf menjadi queued; tanpa konfirmasi = tidak terbit
  (v205, Skenario 1 Tahap 6).
- ✅ Batch Skenario 2: 90 draf bertanggal (30 baris × IG + Threads +
  LinkedIn) + jejak media per format (v210, LIVE).
- ✅ Skenario 1 Tahap 0+2/4+5 (v203/v204): pemicu brief diperluas, urai
  IMAGE-PLAN, poster disetujui otomatis ke Planner + caption.
- ❌ Tahap 7 Skenario 1 (terbit IG/Threads): BLOCKED — menunggu keputusan
  mekanisme unggah (API Meta vs URL hosting). LinkedIn TIDAK terblokir
  (publish native berfungsi).
- ❌ Settings per-kanal Postiz + tag + komentar pertama: tidak relevan lagi
  (Postiz diganti Planner native); scope Publish/Permissions/Folders/Tables
  di detail agen belum diputuskan.

### 1.11 Campaign (disembunyikan sementara — v199)

- ❌ Tombol rail disembunyikan (display:none); view + logika tetap utuh,
  tidak ada yang dihapus. Scope perbaikan BELUM PERNAH dirinci Patria.
  Ditampilkan lagi dengan menghapus blok v199 di layout-scroll.css.

### 1.12 Billing

- ✅ Kartu per model (.bill-grid/.bill-card, v200) + kartu Wan (v201); data
  dari cost.ts + imgSpend + videoSpend + classaiSpend + liveCost.
- ❌ Label "Veo 3.1" untuk blok videoSpend: SALAH — spend-nya Omni (§3.1).
  Menunggu kata Patria (rekomendasi audit §8 v2).
- 🟡 Penautan kartu + konfirmasi Spend Limit Meta ($150 aktif, kartu belum
  tertaut, Spend Limit belum terlihat): belum diputuskan.
- 🟡 Batas $5 = peringatan tampilan saja, bukan blokir (keputusan lama).

### 1.13 Settings

- ✅ Per-kunci Hubungkan (uji live) untuk Gemini + Meta + ClassAI + Ollama;
  tanpa tombol Simpan bersama (dihapus v87); rig-settings mengharapkan
  4 kartu kunci.
- ✅ Detail agen: avatar picker, Model LIVE (v152), skill, Memories, Files.
- 🟡 Reasoning/Effort: MASIH gimmick (belum live; belum dijanjikan).
- 🟡 Publish/Permissions/Folders/Tables di detail agen = baris nota saja.

### 1.14 Router, model, biaya

- ✅ Rantai Meta → Gemini → Ollama; timeout postJson 30 dtk (Ollama 15 dtk).
- ✅ Meta muse-spark-1.3 ($1,25/$4,25 per 1 jt token); muse-image-1.0
  $0,01/gambar (live-verified); kredit $150 aktif (sisa $149,71 per
  screenshot 31 Okt 11:53; outstanding Rp 0).
- ✅ Nano Banana 2 = gemini-3.1-flash-image ($0,067/gambar); Imagen 4
  PENSIUN — jangan dipakai; Google Flow TIDAK punya API publik.
- 🟡 Vonis billing Google: BELUM DIPILIH (menggantung paling lama) —
  memblokir generate live Omni, Nano Banana, dan Gemini QC berbayar.
- 🟡 Akses Nano Banana live: BELUM dibuktikan (billing).
- 🟡 Referensi gambar untuk generate GAMBAR Meta: belum terverifikasi.
- 🟡 Engine gambar internal (SD-turbo hidup lagi vs MOSS-Image vs tetap API
  eksternal): belum dijawab Patria. SD-turbo era v2 tipografinya GAGAL;
  server 127.0.0.1:8080 MATI; Canva = handoff sementara (vonis 24 Okt).

### 1.15 Repo, gerbang, deploy

- ✅ Repo publik PatriaAWijaya/Minime-Hackathon, branch main, dari nol
  27 Okt 2026; push via Git Data API (push_rebased.py, tanpa force-push);
  identitas git lokal Mimi <mimi@minime-hackathon.local>.
- ✅ Rantai build MacBook mh-build{N}.sh (pull --ff-only, npm install,
  vite build, cargo tauri build --debug, tambal ikon, pkill lama, open
  app, echo MH_BUILD{N}_OK); verifikasi HEAD + PID + marker literal +
  md5 dist lokal == MacBook.
- ✅ Frontend TIDAK tertanam di bundle.app — app memuat dari app/dist di
  disk (frontendDist "../dist"); rantai TIDAK PERNAH menyentuh WebsiteData.
- ✅ Gerbang per versi: vite → svelte-check → rig terkait → loop rig →
  run.sh 9 cek; cargo WAJIB 0 warning/error; `grep -c` exit 1 saat 0 hit
  bukan kegagalan.
- 🟡 /tmp VM = tmpfs, bisa bersih antar sesi (skrip gerbang + log rig v212
  sempat hilang) — mitigasi: log persisten di ~/workspace/riglogs-v212/
  dan seterusnya; skrip gerbang v213 dibuat dari pola yang sama.
- 🟡 Pembersihan ikon Square*.png untracked di MacBook: belum diputuskan.

## 2. DAFTAR BELUM — yang wajib diputuskan / diperintah Patria

### 2.1 v160 — scope fitur editor Media Studio [BLOCKED sejak 31 Okt ~20:11]

Widget `widget-925d9f0d-dfe9-496f-8657-b74db19a487f` belum dijawab. Butir:
(1) Script Editor bridge Movie `seSetMovie`; (2) Voice Editor intake naskah
VO/audio; (3) Video Editor intake rencana perakitan. Butir (2)(3) sebagian
tertutup jalur Story Board v163 + v174, status resmi tetap blocked; butir
(1) belum dibangun. Jangan di-nag berulang.

### 2.2 v173 — batas slide carousel [BLOCKED sejak 1 Nov ~23:00]

Widget `widget-9fffd56e-6274-4846-af65-53fbd6f57a87` belum dijawab:
"Maks 12 slide, struktur utuh" vs "Tetap 10 slide, pangkas 1 beat".
Referensi carousel @marketingharry 11 slide vs maks app 10. Jangan di-nag
berulang.

### 2.3 Vonis billing Google [BELUM DIPILIH — menggantung paling lama]

Pilihan: aktifkan billing proyek kunci Gemini / kunci paid-tier lain /
tunda jalur Google. Memblokir: generate live Omni pertama, akses Nano
Banana live, Gemini QC berbayar. Tidak ada jalur Google yang dijalankan
sebelum Patria memilih.

### 2.4 Kunci ClassAI [BELUM DIKETAHUI]

Generate live Wan pertama butuh kunci ClassAI Patria dimasukkan di Settings
app. Tidak ada kunci ClassAI di Secure Vault/konektor/memory. JANGAN minta
raw key di chat. Belum diketahui apakah Patria punya akun/kunci ClassAI.

### 2.5 Mekanisme unggah untuk terbit IG/Threads [BELUM DIPUTUSKAN]

Komposer menolak berkas lokal (soc.err.file_url). Pilihan: API Meta vs URL
hosting. Mempengaruhi Tahap 7 Skenario 1 DAN batch Skenario 2
(draf/antrean boleh; klaim terbit menunggu ini; LinkedIn tidak terpengaruh).

### 2.6 Scope perbaikan Campaign [BELUM PERNAH DIRINCI]

Alasan v199 disembunyikan belum dirinci; daftar kerusakan belum ada.
Campaign tetap utuh di balik display:none.

### 2.7 Faktor thumbnail Library v213 [PERTANYAAN MENGGANTUNG, diajukan 06:17 WIB]

"Jadi 40% dari sekarang" vs "Jadi 60% dari sekarang". Thumbnail gambar di
kartu Library yang mengecil; kartu/teks/tombol tetap. v213 menunggu jawaban
ini sebelum rebuild + gerbang + deploy (satu paket dengan picker rasio).

### 2.8 Konfirmasi live yang masih tertunda

- Alur chat v212 (rencana + riset lewat chat) — belum ada ketukan live.
- v206–v210 sebagai panel — TIDAK LAGI relevan sebagai panel (dihapus di
  v212); dinilai lewat alur chat v212.
- Grounding v155, Brain live v152, gate v161, auto-brief v162.
- Generate live Omni pertama, generate live Wan pertama, akses Nano Banana
  live, generate live v203/v204/v205 (via chat v212).
- Vonis 4 Nov (2 Nov 22:12): 6 item — generate live Omni pertama, generate
  ulang storyboard v165, Impor v166 (Hasil vs Apa), prefill caption Planner
  + round-trip Canva v163, scrollbar Brand v177, garis Graph v157 — bila
  sampai 4 Nov tidak ada perubahan, dianggap SUDAH secara teknis, namun
  BELUM uji live.
- Rincian ketidakpuasan hasil v185/HyperFrames (ditanyakan 22:15, belum
  dijawab); fungsi terkonfirmasi, KUALITAS belum memuaskan.
- Snap lintas track, berkas disk ikut terhapus saat × aset, "button render"
  di Inspector, detail klik-2x kartu ARSIP Library, boleh-tidaknya memilih
  ulang rekomendasi v132, ketatnya v154 untuk pertanyaan brief, riwayat
  revisi mode gate v161, auto-brief v162 untuk fan-out + Script/Voice/Video
  Editor, referensi gambar generate Meta, auto-toggle "Tanpa teks",
  pengelompokan multi-shot per scene untuk storyboard.
- Fase 5 (harness evaluasi live golden set + rehearsal + cost-per-task)
  BELUM dimulai; video demo final dijadwalkan 3 Nov; submit sebelum
  5 Nov 09:00 WIB — butuh kata "lanjut" Patria + keputusan solo/tim + nama
  tim.

### 2.9 GTemplate/GBatch — BUKAN error (kunci pengaman by design)

GTemplate-v1 belum ada persetujuan tercatat karena persetujuan template
hanya boleh dari Patria; GBatch di policy server terkunci false sehingga
output Fase 4 tetap draft-only tanpa jalur kirim di modul — satu-satunya
kirim adalah klik manual tautan wa.me. Gerbang ini hidup di runner Node
(root `src/`), bukan UI app Tauri, jadi tidak memblokir apa pun di UI app
hari ini.

## 3. CEK KONSISTENSI LOGIC (klaim log vs kode nyata)

### 3.1 TEMUAN-1 — Label "Veo 3.1" untuk spend Omni [INKONSISTENSI NYATA, user-facing, MASIH ADA]

Bukti audit v3 (bukan kutipan v2): `app/src/App.svelte:1551` —
`<div><b>Veo 3.1</b> <span>Google</span></div>` merender blok
`videoSpend` (kartu tampil hanya bila `videoSpend.videos > 0`). Sejak v181,
satu-satunya pengisi videoSpend adalah Omni (`omniGenerateClip` →
`addVideoSpend`); Veo pensiun 22 Okt 2026 dan TIDAK PERNAH sukses di app.
Jadi angka dolar yang tampil = spend Omni, labelnya = Veo 3.1. Ini
menyesatkan di layar Billing — satu-satunya inkonsistensi user-facing yang
ditemukan audit ini. Status: MENUNGGU kata Patria (rekomendasi audit §8 v2,
belum dieksekusi).

### 3.2 TEMUAN-2 — Komentar basi "batch-flow" [MINOR, non-fungsional]

Tiga komentar menyebut modul yang sudah dihapus di v212:
`gates.ts:55`, `image-api.ts:1`, `image-api.ts:128`, `image-flow.ts:224`.
Bukan import, bukan kode mati yang dieksekusi — hanya kata basi di
komentar. Disarankan dibersihkan pada sentuhan berikutnya di file-file itu
(bukan versi khusus).

### 3.3 TEMUAN-3 — Pemicu riset titik-dua [KONSISTEN, diperbaiki sebelum gerbang v212]

Bentuk lama `riset ...` membajak brief delegasi (rig-chat §v152: pesan
`riset GAGAL-UJI` masuk jalur riset sehingga bubble error tak muncul).
Perbaikan: perintah wajib `riset: <topik>`; brief `riset pasar ...` tetap
masuk delegasi agen Riset. Rig-chat + rig-plan30 diulang dan lolos; gerbang
v212 lolos. Konsisten dengan aturan "delegasi eksplisit menang atas
fan-out" dan tidak mengubah perilaku delegasi lama.

### 3.4 TEMUAN-4 — State rasio preview v213 [KONSISTEN]

Rantai lengkap diverifikasi di kode: `ve2Load` memvalidasi ratio ke
himpunan {16:9, 9:16, 1:1, 4:5} (nilai lain → default 9:16);
`ve2PreviewRatio` default 9:16; `ve2RatioCss` mengonversi `:` menjadi ` / `
untuk CSS `aspect-ratio`; kotak `.ve2-preview-box` memakai inline style
yang meng-override CSS 9/16; picker menyimpan via `ve2SaveState` yang sama
dengan zoom/plan/snap. Kotak dirender di SEMUA cabang (termasuk cabang
kosong tanpa klip terpilih) — permintaan "termasuk saat kosong" terpenuhi
oleh struktur, bukan cabang khusus.

### 3.5 Aturan berdiri — dipegang, kecuali label Veo (§3.1)

Draft-first (tidak ada publikasi/pengiriman tanpa persetujuan bernama);
kredensial tidak di repo/log; gate push sebelum deploy; project user tidak
hilang otomatis; AGPL hard stop untuk bundling; Postiz diganti Planner
native (single post draft-only; autopost hanya batch terjadwal dengan
persetujuan di awal batch); Mimi tidak menyetujui gerbang atas nama Patria.
Semua diverifikasi masih dipegang di tree v213.

## 4. CEK KONSISTENSI CODE + FUNGSI TUMPANG TINDIH

### 4.1 Vonis: TUMPANG TINDIH NYATA — tidak ditemukan

Bukti audit v3 (dihitung dari tree, bukan kutipan): 12 fungsi kunci masing-
masing TEPAT 1 definisi di seluruh src — `socQueueAdd`, `postChat`,
`renderPlanner`, `ve2SaveState`, `libAddImage`, `socSetCaption`,
`gatedScript`, `researchRun`, `planChatStart`, `doBatch`,
`socCheckReminders`, `libPairCaption`. Tidak ada definisi ganda.

### 4.2 Vonis: DEAD CODE — 1 fungsi

`ve2ClipKind` di App.svelte (diketahui sejak audit v2 §4.2) MASIH ADA dan
tidak dipakai jalur mana pun. Satu-satunya dead code yang ditemukan.
Menunggu kata Patria (rekomendasi audit §8 v2).

### 4.3 Vonis: KUNCI YATIM (orphan keys) — sengaja dibiarkan, bukan error

- `vg2.veo31` + `vg2.model.veo`: 0 referensi di luar i18n.ts (diverifikasi
  audit v3). Yatim sejak Veo pensiun; keluarga `vg2.*` lainnya HIDUP
  (31 kunci `vg2.*` total, mayoritas dipakai UI generator video: model
  omni/wan/hf, tab prompt/refs/frames, cine, dsb.) — JANGAN hapus keluarga
  `vg2.*` sekaligus; hanya 2 nama itu yang yatim.
- `rs.*` (panel Riset) + `batch.*` (form Batch lama): yatim sejak v212,
  DIBIARKAN sesuai aturan (kunci yatim yang sudah ada sebelum versi
  berjalan tidak dihapus).
- `ve2.asset_empty`: yatim sejak v183, DIBIARKAN (aturan yang sama).
- Koreksi atas v2: v2 menyebut "3 kunci vg2.* yatim"; audit v3 memverifikasi
  2 nama kunci yang benar-benar 0 referensi (`vg2.veo31`,
  `vg2.model.veo`). Nama ketiga tidak ditemukan sebagai yatim.

### 4.4 Vonis: MIRIP TAPI BEDA TANGGUNG JAWAB (bukan tumpang tindih)

- `plan-chat.ts` vs `plan30.ts`: lapisan percakapan vs mesin pipeline.
  plan-chat memegang step/jawaban/resume; plan30 memegang store, parsing
  tabel, gatedScript, generateRowVisual, gerbang. Satu arah pemakaian
  (plan-chat memanggil do*/planGate* plan30) — bukan duplikasi.
- `researchRun` dipakai 2 pemanggil (entri chat `riset: ...` + tahap riset
  rencana): satu mesin, dua pemanggil = reuse, bukan tumpang tindih.
- `socQueueAdd` (jalur antrean langsung, dipakai batch/draf otomatis) vs
  `socComposerSave` (jalur komposer manual dengan validasi file_url):
  tanggung jawab berbeda; keduanya bermuara ke antrean yang sama.
- `#ve2Video` (elemen playback saat timeline jalan) vs `.ve2-preview-box`
  (kotak pratinjau idle/gambar/audio/video): dua elemen, dua keadaan —
  picker rasio v213 sengaja HANYA mengatur kotak preview, bukan elemen
  playback (konten video asli tidak di-letterbox paksa).
- `renderPlanner` (render antrean Planner) vs `renderPlan` (SUDAH TIDAK
  ADA — hasil grep `renderPlan` di tree v213 semuanya adalah substring dari
  `renderPlanner`; tidak ada referensi basi ke fungsi panel yang dihapus).
- `libDetail` (dialog detail) vs kartu Library: dialog memakai
  `.lib-detail-img` sendiri, bukan `.lib-thumb` — pengecilan thumbnail
  v213 tidak mengubah dialog detail.

## 5. CEK PERFORMA + COMPACTNESS

- Bundle: dist 1,1 MB (JS 681 KB, CSS 61 KB) untuk 15 modul + 3 bahasa +
  14 rig. Tidak ada aset base64 raksasa baru di bundle JS (ikon rail
  base64 masih inline di App.svelte: 4 kemunculan — rekomendasi §8 v2
  belum dieksekusi, dampaknya kecil dan tidak memblokir).
- Cache: `ve2B64Cache` maks 3 entri (preview video); cache thumbnail
  data-URL BERSAMA di image-api (dipakai image-flow + batch lama — komentar
  basi §3.2, fungsinya hidup).
- Scheduler Planner: 1 interval 30 detik; riset: cap 10 pencarian / 15 buka
  / 14 panggilan; tidak ada polling lain di app.
- State: 59 string kunci `minime.*` terdeteksi di src, termasuk varian
  migrasi (`.pre-v84`, `.pre-v88`, `.corrupt`) yang inert — unifikasi store
  (M6) masih diparkir sejak audit v2; bukan error, tapi bukan compact
  penuh.
- Tidak ada marker TODO/FIXME/XXX di src (0 hasil grep) — tidak ada stub
  yang ditandai; pengecualian ujung-ke-ujung yang DINYATAKAN tetap hanya
  tiga: rakitan reels manual (Q6), konfirmasi H-3 (Q3), terbit IG/Threads
  (menunggu keputusan unggah).
- Vite build bersih (tanpa warning yang dilaporkan); svelte-check 0 error,
  21 warning — SEMUA pra-ada (baseline sejak v174; tidak ada warning BARU
  dari v212 maupun v213).

## 6. GERBANG NOL ERROR — tabel bukti

| Cek | v212 (LIVE) | Tree v213 (saat audit) |
|---|---|---|
| vite build | lolos | lolos (3,89 dtk) |
| svelte-check | 0 error / 21 warning | 0 error / 21 warning |
| rig (14) | ALL PASSED | §v213 ditulis; loop penuh BELUM jalan (menunggu faktor thumbnail) |
| root build (tsc) | lolos | belum diulang (tidak ada perubahan root di v213) |
| gate-test (14 grup) | lolos | belum diulang (alasan sama) |
| scan kredensial | bersih* | belum diulang (tidak ada kunci baru di v213) |
| ledger md5 | tetap | tetap (tidak disentuh v213) |
| i18n | 1271/bahasa, 0 duplikat | 1272/bahasa, 0 duplikat |
| cargo fmt/check/check --tests | 0 | belum diulang (tidak ada perubahan Rust di v213) |
| Cargo.lock | bersih | bersih |

\* Hanya false positive yang diketahui (substring `sk-` di `kb-ask-del`,
`task-close`, class `kb-task-x`/`kb-task-pop`).

Pernyataan nol error: untuk app LIVE (v212), NOL error lolos — 14 rig +
gerbang 9/9 + cargo 0. Untuk tree v213, klaim yang sama BELUM BOLEH dibuat
sampai loop rig + gerbang v213 jalan (menunggu jawaban faktor thumbnail).
Dokumen ini tidak mengklaim v213 lolos — v213 ditandai 🟡 di mana-mana.

## 7. REKOMENDASI + APA YANG DIMINTA DARI PATRIA

Rekomendasi audit §8 v2 yang BELUM dieksekusi (status v3):

1. Label Billing "Veo 3.1" → "Gemini Omni" — BELUM (masih salah di layar).
2. Hapus dead code `ve2ClipKind` — BELUM.
3. Hapus 2 kunci `vg2.*` yatim (`vg2.veo31`, `vg2.model.veo`) — BELUM
   (koreksi: bukan 3 kunci, dan JANGAN hapus keluarga `vg2.*` sekaligus).
4. Ikon rail base64 → `public/` — BELUM (4 kemunculan inline).
5. Cache b64 pratinjau per src — SUDAH ADA (`ve2B64Cache`, cap 3) — dianggap
   selesai, tidak perlu ditagih lagi.

Rekomendasi baru dari audit v3:

6. Bersihkan 4 komentar basi "batch-flow" (§3.2) pada sentuhan berikutnya
   di file-file itu — bukan versi khusus.
7. Jawab faktor thumbnail v213 (40% vs 60%) agar v213 bisa masuk gerbang +
   deploy dalam satu paket.
8. Putuskan mekanisme unggah IG/Threads — satu-satunya blocker Tahap 7
   Skenario 1 dan klaim terbit batch Skenario 2.
9. Vonis billing Google — blocker generate live Omni/Nano Banana/QC berbayar.
10. Vonis v160 + v173 — dua blocked tertua (31 Okt, 1 Nov).
11. Setelah v213 LIVE: uji live alur chat v212 (`buatkan rencana konten
    30 hari`, `riset: <topik>`) + ketukan live picker rasio — konfirmasi
    live adalah gerbang terakhir yang tidak bisa digantikan rig.

Penutup: aplikasi ini compact untuk cakupannya (1,1 MB bundle, 0 stub
bertanda, 0 fungsi ganda di 12 fungsi kunci, 0 error di gerbang v212) dan
tetap powerful (3 alur Patria, Skenario 1 + 2 ujung-ke-ujung kecuali tiga
pengecualian yang dinyatakan, 4 mesin video/gambar, 3 bahasa, 14 rig).
Yang belum powerful BUKAN karena kode kurang, tapi karena keputusan yang
menggantung: billing, kunci ClassAI, mekanisme unggah, v160, v173, dan
label Billing yang salah. Enam keputusan itu — bukan baris kode — yang
memisahkan app ini dari klaim "selesai".
