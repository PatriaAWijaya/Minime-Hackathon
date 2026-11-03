# Rekap Pekerjaan — Minime-Hackathon — 3 November 2026 (v4)

Menggantikan v3 sebagai acuan terbaru. Disusun 3 Nov 2026 pagi, sesudah v213 LIVE +
konfirmasi live v213. Cakupan: seluruh app sampai v213 (LIVE 08:01 WIB, konfirmasi
live Patria 08:03 WIB "v213 ok") + v214 yang sudah disetujui tapi belum dibangun.

Legenda: ✅ sudah (centang hijau) · ❌ belum (silang merah) · 🟡 parsial
(dibangun sebagian / lolos rig tapi belum uji live / menunggu vonis).

## Ringkasan eksekutif

- v213 LIVE + LOLOS LIVE. Isi: picker rasio preview Video Editor (default 9:16),
  thumbnail Library 40%, Veo→Omni tuntas di string user-facing, detail klik-2x
  kartu ARSIP. Kode 4eaadba ↔ remote a24091a; log 733464b ↔ 7cccc76;
  log-LIVE 58d3a35 ↔ 2e7ef99; konfirmasi log e1334d6 ↔ 156aff4. PID 92499.
- Kanban & Graph LOLOS LIVE (Patria 06:39). Item garis Graph v157 dalam vonis 4 Nov
  dianggap selesai uji live; vonis 4 Nov tersisa 5 item yang belum uji live.
- Daftar parsial menyusut: dari rekap v3, yang lulus menjadi ✅ adalah thumbnail
  Library, label Billing Veo, kunci vg2 yatim, detail arsip, Kanban, Graph.
- Gerbang v213 9/9 GENUINE (bukan 8/9): cek i18n gerbang sempat gagal 3x karena bug
  quoting skrip gerbang (bukan kode) — diperbaiki dengan Python file sendiri;
  koreksi atas catatan v212 ada di §6 dan entri log v213.
- v214 DISETUJUI (Patria 06:40, "Lolos" atas 4 item Voice) tapi BELUM dibangun —
  antre sesudah v213, menunggu kata mulai (sesuai tawaran: mulai sesudah Patria
  mencoba v213 atau bila Patria bilang lanjut).
- Yang tetap ❌/blocked: v160, v173, Tahap 7 terbit IG/Threads (mekanisme unggah),
  Campaign (scope belum dirinci), billing Google, kunci ClassAI, submit hackathon.

## §1 Checklist detail per fase/modul

### 1.1 Fondasi / Fase 0 / gerbang

- ✅ Fase 0 LOLOS PENUH (vonis Patria 28 Okt 11:20).
- ✅ Gerbang v213 9/9: vite build, svelte-check 0 error/21 warning (baseline),
  14 rig ALL PASSED (2 loop penuh), root build, gate-test 14 grup, scan bersih
  (hanya false positive yang diketahui: 'kb-ask-del', 'task-close', 'kb-task-x'),
  ledger md5 tetap d542428fe9901fbd417e098e9249d4b6, i18n 1270/bahasa 0 duplikat,
  cargo fmt + check + check --tests 0 warning, Cargo.lock bersih.
- ✅ Koreksi catatan gerbang: bug quoting skrip i18n (v212–v213) sudah diperbaiki
  dan dibuktikan lewat skrip gerbang itu sendiri, bukan cek mandiri (§6).
- ✅ Mitigasi /tmp: skrip gerbang + log rig di lokasi persisten
  (~/workspace/riglogs-v213/, pola sejak v212).

### 1.2 Chat (delegasi, QC, kurasi, alur kreatif)

- ✅ Delegasi Alur 1 (split JSON), Alur 2 (anggota aktif), delegasi eksplisit,
  delegasi tunggal + fan-out; keyword DELEGATE_RULES; Brain per-agen (v152).
- ✅ QC 5 kriteria (v159) + mode gate (v161, maks 2 revisi) + grounding (v155) +
  auto-brief Image (v162) — semua lolos rig.
- 🟡 Penilaian live tertunda untuk QC gate, grounding, Brain, auto-brief
  (lolos rig, belum ketukan live Patria).
- ✅ Alur brief kreatif interaktif (v138–v140, v203): pemicu cbIsCreative,
  parse IMAGE-PLAN, 3 jalur caption (v172), pola wajib image/carousel/storyboard.
- 🟡 Alur rencana + riset lewat chat v212: lolos rig-plan30 (19 cek), TAPI
  konfirmasi live Patria BELUM ada. Catatan: "v213 ok" (08:03) mengesahkan v213,
  bukan alur chat v212 — jangan dicampur.
- ✅ Perintah riset bentuk titik-dua ('riset: <topik>') — tidak membajak brief
  delegasi (perbaikan v212).
- 🟡 Delegasi Riset umum dari chat BELUM memakai researchRun (hanya entri
  'riset:...' + tahap riset rencana yang browsing).
- ✅ Rekomendasi: opsi mendahulukan pendalaman hasil (v143), navigasi otomatis
  Media Studio (v145), tombol saran kurasi Prime (v154), hapus pesan langsung
  tanpa popup (v141), penghitung karakter dihapus total (v144).

### 1.3 Graph

- ✅ LOLOS LIVE (Patria 06:39, "Kanban & Graph lolos").
- ✅ Garis Graph v157 (render ditunda double-rAF) — selesai uji live, keluar
  dari vonis 4 Nov.
- ✅ Sinkron dua arah menu utama ↔ graph (aturan 30 Okt 13:47); Alur 3
  (Graph → project → node → instruksi, v115+v117); node agen aktif di sidebar
  (aturan 30 Okt 16:16).
- ✅ Header graph (dropdown project, Buat Project Baru, runbar play/stop),
  pan + zoom 0.5–2, popup node via dblclick delegasi.

### 1.4 Kanban

- ✅ LOLOS LIVE (Patria 06:39) — kartu tugas agen + detail 2x klik.
- ✅ Kartu menetap (v150), dialog edit klik-1x, popup detail klik-2x (v153),
  tugas agen muncul di Kanban (v149), tanpa penghapusan otomatis.

### 1.5 Library

- ✅ Detail klik-2x kartu AKTIF (v118) + detail klik-2x kartu ARSIP (v213:
  dialog judul+meta+tanggal arsip+pratinjau, aksi hanya Pulihkan + Tutup).
- ✅ Thumbnail Library 40% (v213, LOLOS LIVE 08:03); kartu/teks/tombol tetap;
  dialog detail (.lib-detail-img) tidak ikut mengecil.
- ✅ Arsip otomatis 3 bulan kalender + Pulihkan (tanggal baru supaya tidak
  langsung terarsip lagi) + tombstone hapus menyeluruh.
- ✅ Galeri Image Editor 10 thumbnail terakhir (v158).
- ❌ Upload arsip Library ke Google Drive (OAuth belum dibangun).

### 1.6 Script Editor

- ✅ Menu Social/Artikel/Movie, 5W1H roll-over, Clear Script, bridge
  seSetArtikel (v138), caption 3 jalur (v172), seUse bercabang.
- 🟡 Impor v166: mengisi kolom HASIL (bukan Apa) — masuk vonis 4 Nov
  (cakupan Hasil vs Apa belum diputuskan).
- ❌ Spec movie edukasi/komedi belum ditulis Patria (jalur sementara
  direct-generate).
- ❌ Bridge penerimaan naskah movie dari chat (scope v160 butir 1, blocked).

### 1.7 Image Editor

- ✅ Redesain v163 (Gaya Visual terpisah dari Output Desain; Poster → rasio;
  Story Board → durasi + rasio + scene keyframe; Carousel 6–10 slide;
  Judul/Subjudul/Listicle; Edit di Canva + Impor dari Canva per varian).
- ✅ Storyboard sequence + STYLE LOCK (v164+v165) + struktur 7 field per panel
  (v174: shot, visual, action, vo, transition, duration).
- ✅ Pola prompt poster wajib (v171); auto-urai IMAGE-PLAN (v203);
  setujui → caption + Library (+ Planner otomatis untuk poster, v204).
- 🟡 Auto-toggle "Tanpa teks" saat field teks overlay diisi — masih manual,
  belum dijanjikan.
- ✅ Canva sebagai jalur sementara gambar (vonis 24 Okt) — handoff browser
  terbukti end-to-end.

### 1.8 Video Editor (ve2)

- ✅ Picker rasio preview (v213, LOLOS LIVE): default 9:16 termasuk saat kosong,
  select di kanan bawah area pratinjau, tersimpan di state ve2.
- ✅ Timeline ve2 (4 track, compileTimeline murni, FFmpeg render, QC, capture);
  snap magnet track-sama (v195, default TRUE); bar editor track (v191);
  × aset (v189); daftar aset grid (v188); pratinjau idle isi asli (v186);
  probe ffprobe jelas (v193+v194); player berhenti di ve2End (v195);
  onplay/onpause playback (v197+v198).
- ✅ Mesin: Omni utama (v181), Wan 3.0 via ClassAI alternatif (v201),
  HyperFrames motion graphics/teks (v175+v185), template sinematik VLOG
  CINEMATIC 10 beat (v202).
- ✅ Dialog pemilih file (v183, plugin-dialog 2.8.4) — terkonfirmasi live.
- ❌ Generate live Omni pertama (butuh billing aktif — masuk vonis 4 Nov).
- ❌ Generate live Wan pertama (butuh kunci ClassAI Patria di Settings).
- ❌ Burn-in teks di atas footage (batas utama pola seri harian).
- ❌ Seek via controls bawaan #ve2Video saat playback (desync, belum ditangani).
- ❌ Snap lintas track (saat ini hanya track yang sama — belum ada vonis).
- ❌ Berkas disk ikut terhapus saat × aset (saat ini hanya entri — belum ada vonis).

### 1.9 Voice Editor / VoiceStudio / Sherpa

- ✅ Timeline waveform + daftar aset + transkrip (segmen + teks) di Voice Editor;
  TTS/clone/Sherpa otomatis terdaftar; Whisper lokal Tier 2 (model ggml-small).
- ✅ ASS sidecar: assFromCaptions + tombol Simpan file ASS (belum burn-in karena
  ffmpeg MacBook tanpa filter subtitles/drawtext — dinyatakan jujur di UI).
- 🟡 Backend VoiceStudio TIDAK JALAN saat probe 06:40 (tidak ada proses, :3900
  tanpa respons) — perlu dinyalakan sebelum pakai; lokasi install belum ketemu
  (discovery = langkah pertama v214).
- 🟡 v214 (DISETUJUI 06:40, BELUM dibangun): upgrade VoiceStudio v0.5.7;
  transkrip Voice Editor → caption ASS; hapus penuh fungsi setup VoiceStudio;
  daftar model jadi bisa dipilih (saat ini pajangan murni — vsRenderModels hanya
  <li> teks, sintesis hardcode 'omnivoice').

### 1.10 Planner native

- ✅ Antrean + scheduler 30 detik (hanya saat app terbuka, hanya 'queued'
  bertanggal); komposer + prefill caption/media (v204); draf tanpa tanggal
  diterima, 'queued' tanpa tanggal ditolak; seksi "Belum terjadwal" (v204).
- ✅ H-3 "Menunggu konfirmasi terbit" + pesan chat sekali per item (v205);
  tanpa konfirmasi = tidak terbit (draft-only).
- ✅ Batch Skenario 2: 90 draf bertanggal (30 hari × IG/Threads/LinkedIn) +
  planDay/imageFiles/videoFiles diteruskan socQueueAdd (v210).
- ✅ Skenario 1 Tahap 0+2/4+5/6 (v203–v205) LIVE.
- ❌ Tahap 7 terbit IG/Threads: komposer MENOLAK berkas lokal (soc.err.file_url)
  — butuh keputusan mekanisme unggah (API Meta vs URL hosting). LinkedIn TIDAK
  terblokir (publish native berfungsi).

### 1.11 Billing / Settings / Router / biaya

- ✅ Kartu Billing per model (v200) + kartu Wan (v201); label video kini
  'Gemini Omni' (v213, LOLOS LIVE).
- ❌ Penautan kartu + konfirmasi Spend Limit Meta (kredit $150 aktif, sisa
  $149,71 per screenshot 31 Okt; belum ada payment method).
- ✅ Router: Meta muse-spark-1.3 → Gemini flash-lite → Ollama deepseek/qwen;
  QC family berbeda; timeout + LiveUnavailableError; localStorage kunci
  (meta/gemini/classai).
- 🟡 Settings: 4 kartu kunci (Gemini/Meta/ClassAI/Ollama) dengan uji live;
  Model agen LIVE (v152); Reasoning/Effort masih gimmick; detail agen
  Publish/Permissions/Folders/Tables = nota.
- ❌ Vonis billing Google (aktifkan billing proyek kunci Gemini / kunci paid-tier
  lain / tunda jalur Google) — belum dipilih; imbas: Nano Banana live, Gemini QC
  live, referensi gambar Meta.
- ❌ Engine gambar internal (SD-turbo hidup lagi vs MOSS-Image vs tetap API
  eksternal) — belum dijawab Patria.
- ✅ Batas $5 = peringatan tampilan saja (bukan blokir).

### 1.12 Campaign (4 tab: Leads, CRM, Outreach, Follow Up)

- ❌ Tombol rail DISEMBUNYIKAN sementara (v199, display:none; view + logika
  utuh, tidak ada yang dihapus). Scope perbaikan BELUM pernah dirinci Patria.
- ✅ Mesin Campaign yang tersembunyi: form lead manual, ubah stage, salin draf,
  tugas Follow Up (tidak bisa diakses sampai tombol ditampilkan lagi).

### 1.13 Skenario 1 & 2 (program)

- ✅ Skenario 1 (kecuali Tahap 7 ❌ di atas): pemicu diperluas, urai otomatis,
  masuk Planner otomatis, H-3 — semua LIVE (v203–v205).
- ✅ Skenario 2 mesin: Q1–Q8 terkunci (12 image + 10 carousel 8 slide + 8 reels;
  kanal IG+Threads+LinkedIn; batch draf bertanggal; 3 gerbang; riset live;
  reels tanpa rakitan otomatis; QC per naskah maks 2 revisi) — v206–v210 LIVE
  sebagai panel, digantikan kendali chat di v212 (mesin sama).
- 🟡 Skenario 2 lewat chat (v212): penilaian live tertunda (lihat 1.2).

### 1.14 Hackathon (kepatuhan + submission)

- ✅ Kompatibilitas: 0/10 penyimpangan (jauh di bawah ambang lapor 50%).
- ✅ Indie NEW WORK ONLY dipatuhi: yang dibangun 27 Okt–4 Nov saja yang
  diajukan; fitur pra-event tidak diklaim sebagai karya event.
- ❌ Submit: form cerebralvalley.ai masih kosong (tanpa simpan draf); tenggat
  4 Nov 21:00 ET = 5 Nov 09:00 WIB; DITUNDA ke awal November atas keputusan
  Patria 27 Okt 08:17 — lanjut saat Patria bilang lanjut.
- ❌ Nama tim + solo-vs-tim belum diputuskan; tim saat ini hanya Patria.
- ❌ Fase 5 (harness evaluasi live golden set + rehearsal + cost-per-task)
  belum dimulai; video demo final dijadwalkan 3 Nov.
- ✅ Posting harian TIDAK otomatis (cron dihapus 28 Okt); Day 2 + Day 3 terbit
  (Threads + LinkedIn, tautan tercatat di MEMORY).

### 1.15 Repo / gerbang / deploy

- ✅ Repo publik PatriaAWijaya/Minime-Hackathon, branch main; HEAD lokal
  e1334d6 ↔ remote 156aff4 (sesudah konfirmasi v213); rantai push_rebased
  (tanpa force-push) + log + log-LIVE terpisah.
- ✅ Rantai deploy mh-build213.sh terverifikasi (MH_BUILD213_OK, HEAD MacBook
  = SHA remote log, PID segar, marker bundle, md5 lokal == MacBook).
- ✅ Frontend TIDAK tertanam di bundle.app (memuat dari app/dist di disk);
  rantai tidak menyentuh WebsiteData/WebKit; data user tidak hilang saat update
  (aturan 25 Okt).
- 🟡 Ikon Square*.png + icons/android + icons/ios untracked di tree MacBook —
  belum dibersihkan (parkir, jangan disentuh).
- ✅ Kredensial GitHub custom.github (PAT scope repo, kedaluwarsa 28 Nov 2026);
  nilai token tidak pernah dilihat/dicatat; kredensial tidak masuk repo/log.

## §2 Daftar yang belum (gabungan ❌ + 🟡 yang butuh vonis/aksi)

1. v160 (blocked): scope fitur editor Media Studio — widget 31 Okt belum dijawab.
   Butir (2)(3) sebagian tertutup jalur Story Board v163+v174; butir (1) bridge
   Movie Script Editor belum dibangun.
2. v173 (blocked): batas slide carousel — referensi 11 slide vs maks app 10;
   widget 1 Nov belum dijawab; jangan di-nag berulang.
3. Vonis billing Google (lihat 1.11) — memblokir generate live Omni, Nano Banana
   live, Gemini QC live, referensi gambar Meta.
4. Kunci ClassAI Patria (Settings app) — memblokir generate live Wan pertama.
   JANGAN minta raw key di chat.
5. Mekanisme unggah untuk terbit IG/Threads (API Meta vs URL hosting) — memblokir
   Tahap 7 Skenario 1 + klaim terbit batch Skenario 2 (draf/antrean boleh).
6. Scope perbaikan Campaign — belum dirinci Patria (tombol tetap tersembunyi).
7. Spec movie edukasi/komedi — belum ditulis Patria.
8. v214 (disetujui, antre): upgrade VoiceStudio v0.5.7 (discovery dulu),
   transkrip → ASS, hapus penuh setup VoiceStudio, daftar model bisa dipilih.
9. Konfirmasi live alur chat v212 (rencana 30 hari + riset lewat chat).
10. Vonis 4 Nov yang belum uji live (5 item): generate live Omni pertama,
    generate ulang storyboard v165, Impor v166 (Hasil vs Apa), prefill caption
    Planner + round-trip Canva v163, scrollbar Brand v177. Bila sampai 4 Nov
    tidak ada perubahan, dianggap SUDAH secara teknis namun BELUM uji live.
11. Dead code ve2ClipKind (satu-satunya, audit v2+v3+v4) — menunggu kata Patria.
12. Ikon rail masih inline base64 (5 baris data:image di App.svelte) — belum
    dipindah ke public/.
13. Komentar basi "batch-flow" di image-api.ts (2 tempat), image-flow.ts,
    gates.ts — minor, non-fungsional, bersihkan pada sentuhan berikutnya.
14. Submit hackathon + nama/komposisi tim + video demo + Fase 5 (lihat 1.14).
15. GTemplate approval null + GBatch terkunci false — BY DESIGN (bukan belum):
    hanya berubah bila Patria menyetujui template / membuka batch.

## §3 Konsistensi logic (temuan audit v4)

- T-1 (SELESAI di v213): label Veo di Billing/spend/audio/provider — kini Omni;
  2 kunci yatim dihapus; folder ~/Movies/minime-veo dipertahankan (path).
- T-2 (TERBUKA, minor): komentar "batch-flow" di 3 file (lihat §2.13) — modul
  batch-flow sudah dihapus v212; komentar tidak memengaruhi perilaku.
- T-3 (DIPEGANG): pemicu riset bertitik-dua — tidak membajak brief delegasi;
  setiap pemicu chat baru wajib dicek bentroknya dengan DELEGATE_RULES.
- T-4 (DIPEGANG): state rasio preview tersimpan di minime.ve2 (persist + validasi
  whitelist); kotak preview di semua cabang termasuk kosong.
- T-5 (DIPEGANG): aturan berdiri — draft-first, hapus project hanya atas perintah
  eksplisit, sinkron menu↔graph, alur chat bukan form, pola wajib tidak campur.
- T-6 (BARU, mendukung v214): vsSetupInstall + vsSetupLaunch TANPA pemanggil di
  seluruh src (grep 0 referensi di luar definisi) — fungsi setup praktis sudah
  mati secara wiring; penghapusan penuh di v214 aman dari sisi pemanggil
  (kunci i18n vs.setup.* ikut diverifikasi saat itu).
- T-7 (BARU, koreksi): cek i18n skrip gerbang gagal 3x pada v213 karena bug
  quoting (heredoc python dalam argumen double-quote + eval menghancurkan
  regex → SyntaxError); traceback ada SEBELUM baris FAIL di ringkasan.
  Perbaikan: check-i18n.py terpisah; gerbang diulang 9/9. Koreksi ini
  membatalkan klaim v212 bahwa parser skrip "sudah diperbaiki" — yang diperbaiki
  di v212 hanya regex kunci berkutip, bukan bug quoting.

## §4 Code: tumpang tindih, dead code, kunci yatim

- VONIS: TIDAK ada tumpang tindih nyata. 17 fungsi kunci masing-masing tepat
  1 definisi (grep): socQueueAdd, postChat, renderPlanner, ve2SaveState,
  libAddImage, socSetCaption, gatedScript, researchRun, planChatStart, doBatch,
  socCheckReminders, libPairCaption, libDetailArchived (BARU v213),
  libRestoreArchived, vsRenderModels, vsSetupInstall, vsSetupLaunch.
- Mirip-tapi-beda (BUKAN duplikasi): plan-chat vs plan30 (chat vs mesin);
  researchRun 2 pemanggil (riset chat + tahap riset rencana — satu mesin);
  socQueueAdd vs socComposerSave (antrean vs komposer — komposer menolak berkas
  lokal, antrean menerima draf; perbedaan disengaja v204);
  #ve2Video vs .ve2-preview-box (playback vs kotak pratinjau — v213 sengaja
  hanya mengatur kotak); renderPlanner vs renderPlan (renderPlan SUDAH TIDAK
  ADA — semua hasil grep adalah substring renderPlanner);
  libDetail vs libDetailArchived (aktif vs arsip — sumber data berbeda:
  libAll() vs loadLibArchived(); aksi dialog berbeda — pembedaan disengaja v213);
  libDetail vs .lib-thumb (dialog vs thumbnail — bukan fungsi).
- Dead code: TETAP 1 fungsi — ve2ClipKind di App.svelte (menunggu kata Patria).
  vsSetupInstall/vsSetupLaunch bukan dead code menurut definisi (terdaftar di
  modul) tapi tanpa pemanggil (lihat T-6) — masuk v214.
- Kunci yatim: keluarga vg2.* kini 29 kunci hidup (87 baris i18n) sesudah 2 kunci
  Veo dihapus — JANGAN hapus sekaligus. Kunci rs.* panel Riset + batch.* form
  lama tetap yatim (dibiarkan, v212). Kunci ve2.ratio TERPAKAI (App.svelte +
  3 seksi i18n). Kunci lib.detail.hint TERPAKAI (kartu aktif + kartu arsip).
- i18n: 1270/bahasa, 0 duplikat, himpunan ID=EN=ZH identik (check-i18n.py).
- 0 TODO/FIXME/XXX di app/src (grep).

## §5 Performa & compact

- dist 1,1 MB (JS 681.745 byte, CSS 61.026 byte) — praktis sama dengan v3
  (JS 681 KB, CSS 61 KB): v213 menambah 4 fitur tanpa menggembungkan bundle.
- src 19.384 baris (semua .ts/.js/.svelte/.css di app/src): i18n 3.937,
  v5logic 3.746, social 1.644, App 1.607, creative-brief 1.135, voice-editor 980,
  image-flow 825, layout-scroll 797, chat 777, script-editor 588, plan30 538,
  voicestudio 432, plan-chat 359, brand 347, video 201, omni-gen 177,
  cost 159, research-browser 156, classai-video 154, video.ts 201 (urut ukur).
- Cache b64 pratinjau ve2B64Cache cap 3 (sudah ada); thumbnail dibatasi CSS
  (40%) tanpa duplikasi aset; store minime.* 48 nama distinct terukur
  (varian migrasi inert .pre-v84/.pre-v88/.corrupt masih ada — unifikasi store
  M6 tetap diparkir).
- Perhatian: ikon rail masih inline base64 (5 baris) — pemindahan ke public/
  menghemat sedikit bundle + kerapian, bukan darurat performa.

## §6 Tabel gerbang nol error

- v212: vite build ✓, svelte-check 0/21 ✓, 14 rig ✓, root build ✓, gate-test ✓,
  scan ✓, ledger ✓, i18n (klaim 1271 — lihat koreksi) ✓-dengan-catatan,
  cargo fmt/check/check --tests ✓, Cargo.lock ✓. Catatan koreksi v4: cek i18n
  gerbang v212 TIDAK PERNAH lolos lewat skrip (bug quoting sudah ada sejak
  skrip itu dibuat; yang diverifikasi saat itu hanya cek mandiri).
- v213: vite build ✓, svelte-check 0/21 ✓, 14 rig ✓ (2 loop), root build ✓,
  gate-test 14 grup ✓, scan ✓, ledger ✓, i18n 1270 ✓ (LEWAT skrip gerbang
  yang diperbaiki — pertama kalinya cek ini benar-benar lolos di dalam gerbang),
  cargo fmt/check/check --tests 0 warning ✓ (termasuk perbaikan dead assignment
  research.rs), Cargo.lock ✓. Total: 9/9.
- Aturan yang dipegang: tidak ada error yang lolos — setiap FAIL gerbang
  ditelusuri ke akar (bukan ditoleransi); verifikasi standalone tidak
  menggantikan verifikasi lewat gerbang (pelajaran v213, dicatat di AGENTS.md).

## §7 Rekomendasi (urutan saran)

1. Mulai v214 begitu Patria bilang lanjut (scope sudah disetujui + dipetakan;
   discovery VoiceStudio dulu karena backend tidak jalan + lokasi belum ketemu).
2. Minta konfirmasi live alur chat v212 (satu-satunya alur besar yang belum
   ketukan live) — cara pakai: "buatkan rencana konten 30 hari" / "riset: ...".
3. Putuskan mekanisme unggah IG/Threads (API Meta vs URL hosting) — ini kunci
   Tahap 7 + klaim terbit batch; LinkedIn tidak tergantung padanya.
4. Putuskan vonis billing Google + kunci ClassAI — membuka 3 generate live
   (Omni, Wan, Nano Banana) + Gemini QC live.
5. Jawab v160 + v173 (dua widget tertua yang menggantung sejak 31 Okt / 1 Nov).
6. Pada sentuhan berikutnya: bersihkan komentar batch-flow (T-2), pindahkan
   ikon rail base64 ke public/, putuskan nasib ve2ClipKind.
7. Persiapan submit: nama tim + solo-vs-tim + video demo + Fase 5 — tenggat
   5 Nov 09:00 WIB (2 hari lagi dari rekap ini).
