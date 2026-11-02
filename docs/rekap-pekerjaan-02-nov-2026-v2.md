# Rekap Pekerjaan Minime-Hackathon — 2 November 2026 (v2, sampai v201 LIVE)

> **Sifat dokumen:** rekap audit v2, read-only. Audit ini TIDAK mengubah satu pun file
> source, CSS, rig, i18n, MEMORY, atau log — kecuali dokumen ini sendiri.
> Semua klaim di bawah diverifikasi ulang terhadap kode pada HEAD saat audit
> ditutup, bukan dikutip dari ringkasan sesi sebelumnya. Rig TIDAK dijalankan
> ulang oleh audit ini: hasilnya dibaca dari log gerbang parent
> (`/tmp/rig-v201/*.log`, `/tmp/gate-v201/summary.txt`) dan dari laporan
> parent untuk rig-video (yang jalan di foreground parent, tanpa file log
> terpisah). Nomor baris kode yang dikutip dari audit v1 merujuk tree v200
> dan sudah bergeser sesudah v201 (App.svelte +60 baris bersih).
>
> - **Repo:** `PatriaAWijaya/Minime-Hackathon` (publik, branch `main`).
> - **Repo lokal:** `~/workspace/minime-hackathon/` (app di `app/`).
> - **HEAD saat audit ditutup:** `0a442cd` (`log: v201 wiring Wan 3.0 via
>   ClassAI`).
> - **App live di MacBook:** v201 (deploy mh-build201.sh OK,
>   MH_BUILD201_OK, 2 Nov ~22:32; HEAD MacBook `63b1e77`; PID 66435;
>   md5 dist JS `f4eaaa7c1d203efa732575f3f97cb30a` + CSS
>   `13647ae902959d218a44d9b61a232fb3` lokal == MacBook, diverifikasi
>   audit ini; penanda `router.classai.id` (2x) + `wan-3.0` di bundle JS
>   MacBook).
> - **Pasangan SHA v200:** kode `e48b6bf ↔ 4e82f15`, log `664c2a9`,
>   log-LIVE `e949923` (semua tree identik).
> - **Pasangan SHA v201:** kode `3b5bb68 ↔ 69be4d8`, log `0a442cd ↔
>   63b1e77`, log-LIVE `1f78043 ↔ 75c7e29` (semua tree identik).
> - **Stack:** Tauri 2 + Svelte 5, frontend dimuat dari `app/dist` di disk
>   (`tauri.conf.json` `"frontendDist": "../dist"`).
> - **Log master:** `docs/fase-0-log.md` — 143 heading versi berformat `## v…`
>   (v57.1–v201) ditambah fondasi Fase 0 (Blok A–J) dan rantai awal v29–v56.
>   Entri v201 + log-LIVE v201 sudah ada.
> - **Cara membaca checklist:** `✓` = sudah, dengan nomor versi + satu baris
>   bukti. `✗` = belum, dengan statusnya (blocked menunggu vonis Patria /
>   ditunda / belum diperintah / masuk vonis 4 Nov). Checklist ini bisa
>   dicentang per item saat Patria memberi vonis lanjutan.

---

## Perubahan sejak v1 (audit 2 Nov, sampai v200)

Dokumen v1 (`docs/rekap-pekerjaan-02-nov-2026.md`, 1.099 baris) sudah basi di
titik-titik berikut. Semua delta di bawah SUDAH tercermin di checklist dan
cek dokumen ini — bagian ini hanya ringkasannya.

- **v201 DIBANGUN + PUSH + LIVE.** Wiring video Wan 3.0 via ClassAI,
  diperintahkan Patria 2 Nov 22:09 ("lakukan"): modul baru
  `app/src/lib/classai-video.ts` (154 baris), opsi model ketiga 'wan' di
  panel Video + cabang UI Wan, kartu kunci ClassAI di Settings, spend
  terpisah + kartu Billing sendiri, i18n +6 kunci/bahasa (1110 → 1116),
  rig-video §v201 (10 cek). Kode `3b5bb68 ↔ 69be4d8`, log `0a442cd ↔ 63b1e77`, log-LIVE `1f78043 ↔ 75c7e29`.
  Gerbang penuh lolos; deploy mh-build201.sh OK (MH_BUILD201_OK) 2 Nov
  ~22:32 (HEAD MacBook 63b1e77, PID 66435, md5 dist lokal == MacBook,
  penanda router.classai.id 2x + wan-3.0 di bundle JS MacBook). App live
  = v201. Uji generate live Wan pertama TETAP BELUM BISA dibuktikan: butuh kunci
  ClassAI Patria di app, dan sampai audit ini ditutup belum ada kunci
  ClassAI yang tercatat.
- **Konfirmasi live Patria 2 Nov 22:10–22:11 (dicatat di MEMORY.md).**
  SUDAH OK: v196, v197, v198; v195, v191, v189, v193; v185, render
  HyperFrames dari deskripsi, dialog pemilih file v183, tambah ulang mp4
  drinksaints + berkas render HF. Catatan penting: untuk v185/HF,
  konfirmasinya "sudah oke secara fungsi, TAPI hasilnya belum memuaskan" —
  rincian ketidakpuasan BELUM dijawab Patria (pertanyaan sudah diajukan
  22:15, jawaban belum ada). Item-item §2.7 v1 yang terkonfirmasi sudah
  dipindah ke ✓ di dokumen ini.
- **Vonis 4 Nov (Patria 2 Nov 22:12).** 6 item — generate live Omni pertama,
  generate ulang storyboard v165, Impor v166, prefill caption Planner +
  round-trip Canva v163, scrollbar Brand v177, garis Graph v157 — bila
  sampai 4 Nov tidak ada perubahan, dianggap SUDAH secara teknis, namun
  BELUM uji live. Keenamnya di dokumen ini berstatus "MASUK VONIS 4 NOV",
  bukan lagi "menggantung tanpa batas".
- **Perintah antre (SUDAH diperintahkan, BELUM dikerjakan).** v202 template
  pola sinematik ke panel video (22:12, antre sesudah v201); v174 struktur
  storyboard di app (22:13, nomor reserved, antre sesudah v202). Keduanya
  keluar dari daftar "menunggu vonis" dan masuk antrean bangun.
- **Tetap BLOCKED.** v173 carousel (menunggu vonis batas slide); v160 scope
  editor (menunggu vonis Patria). Vonis billing Google tetap terbuka.
- **GTemplate/GBatch — BUKAN error.** Penjelasan lengkap di §2.9 baru:
  GTemplate null + GBatch false adalah kunci pengaman by design (modul
  Fase 4 dilarang mengarang persetujuan; batch draft-only; tanpa jalur
  kirim; hanya klik manual wa.me).
- **Rekomendasi v1 §8 TETAP TERBUKA (belum dieksekusi, menunggu kata
  Patria).** Label Billing "Veo 3.1" → "Gemini Omni"; hapus dead code
  `ve2ClipKind`; hapus 3 kunci `vg2.*` yatim; pindahkan 3 ikon rail base64
  ke `public/`; cache b64 pratinjau per src. v201 TIDAK mengerjakan satu
  pun dari lima ini (satu versi = satu perubahan).
- **Tetap outstanding.** Fase 5 BELUM dimulai; video demo final 3 Nov;
  submit sebelum 5 Nov 09:00 WIB (butuh kata "lanjut" + keputusan solo/tim
  + nama tim); vonis billing Google; kunci ClassAI Patria; rincian
  ketidakpuasan hasil v185/HF.

---

## Ringkasan eksekutif

- **Yang sudah (v2):** seluruh fondasi Fase 0, 3 alur Patria (Alur 1/2/3),
  Home/Chat dengan QC gate + kurasi, Kanban, Graph dua arah, Library,
  Media Studio 4 tab, Script Editor 3 jalur caption, Image Editor (pola
  image v171 + storyboard sequence + STYLE LOCK), Video Editor ve2 lengkap
  (timeline, aset, pratinjau, transport, snap, cap durasi) + **mesin video
  ketiga Wan 3.0 via ClassAI (v201, LIVE 2 Nov ~22:32)**,
  Voice (VoiceStudio eksternal + Sherpa/Piper), Planner native 8 kanal
  (draft-only + autopost batch berpersetujuan), Billing kartu per model
  (v200) + kartu Wan (v201), Settings 4 kartu kunci (v201), router
  Meta → Gemini → Ollama, dan gerbang nol-error per versi.
- **Yang sudah terkonfirmasi live sejak v1 (22:10–22:11):** v196, v197,
  v198, v195, v191, v189, v193, v185 (fungsi), render HyperFrames dari
  deskripsi (fungsi), dialog pemilih file v183, tambah ulang drinksaints
  + berkas render HF. Sisa konfirmasi live yang benar-benar menggantung:
  penilaian live grounding v155 / Brain v152 / gate v161 / auto-brief
  v162, akses Nano Banana live, dan rincian ketidakpuasan hasil v185/HF.
  Enam item lain masuk vonis 4 Nov (lihat bawah).
- **Yang belum (garis besar):** 2 item versi yang diblokir vonis (v160,
  v173), 2 item antre bangun (v202, v174), 1 vonis billing Google yang
  menggantung, 1 kunci ClassAI Patria yang belum ada (syarat uji live
  Wan), Fase 5 + video demo 3 Nov + submit 5 Nov 09:00 WIB, dan 1
  pertanyaan kualitas hasil v185/HF yang belum dijawab.
- **Vonis 4 Nov (Patria 2 Nov 22:12):** generate live Omni pertama,
  generate ulang storyboard v165, Impor v166, prefill caption Planner +
  round-trip Canva v163, scrollbar Brand v177, garis Graph v157 — bila
  sampai 4 Nov tidak ada perubahan, dianggap SUDAH secara teknis, namun
  BELUM uji live.
- **Temuan inkonsistensi teratas (TETAP, belum diperbaiki):**
  1. Label **"Veo 3.1"** masih dipakai untuk spend video yang sumbernya
     **Gemini Omni** (Billing + tab Video) — mesin Veo sudah pensiun total
     sejak v181, kodenya sudah dihapus, tapi labelnya tertinggal.
     Bukti baru v2: kartu Wan v201 justru berlabel benar ("Wan 3.0 /
     ClassAI"), sehingga kontrasnya makin terlihat.
  2. Tiga kunci i18n keluarga `vg2.*` peninggalan Veo sudah yatim
     (0 referensi di luar `i18n.ts`) — diverifikasi ulang di v2, tetap 0.
  3. Satu fungsi mati: `ve2ClipKind` (definisi saja, 1 hit di seluruh
     `src/`) — diverifikasi ulang di v2, tetap mati. v201 menambah 0 dead
     code (semua ekspor barunya terpakai).
- **Fungsi tumpang tindih nyata:** TIDAK DITEMUKAN — termasuk untuk kode
  baru v201 (pasangan Wan/Omni terbukti beda mesin dan beda state; lihat
  §4). Yang ada tetap 1 dead code, pola spend paralel kini 3 pasang
  (img/video/classai), dan 1 risiko penamaan (`ve2ToEnd` vs `ve2End`).
- **Sapu error (§6, v2):** vite build v201 lolos; rig-video ALL PASSED
  (termasuk 10 cek v201); 12 rig lain ALL PASSED dari file log; 1 log
  rig-settings di disk masih merekam run pra-perbaikan (2 gagal karena
  ekspektasi jumlah kartu 3, bukan bug — ekspektasi diperbarui ke 4 dan
  lolos sesudah perbaikan menurut laporan parent); svelte-check 0 error /
  21 warning (baseline); root build + tsc OK; gate-test 14/14 grup lolos;
  scan kredensial 0 temuan; i18n 1116/bahasa 0 duplikat; cargo fmt +
  check + check --tests lolos, Cargo.lock bersih. Dengan batas §6.8 (uji
  live MacBook v201 dan generate live Wan tidak termasuk), dokumen ini
  boleh dibaca sebagai **nol error pada seluruh cek yang dijalankan** —
  kecuali satu catatan jujur: file log rig-settings di disk belum
  diperbarui sesudah perbaikan, jadi klaim lolosnya bersandar pada
  laporan parent, bukan pada file log itu.
- **Performa (§5, v2):** bundle dist 972K (JS 625.080 byte, +1,4% dari
  v200 untuk satu mesin video baru; CSS 60.473 byte, IDENTIK dengan
  v200 — v201 tidak menambah CSS). Tidak ada dependensi baru. Tetap
  compact namun powerful; lima rekomendasi v1 §5.3 tetap terbuka.

## 1. CHECKLIST DETAIL per modul

### 1.1 Fondasi & Fase 0 (27–28 Okt 2026)

- ✓ **Blok A — kunci akses tulis repo** (log Blok A; push via Git Data API,
  pola `push_rebased.py`, tanpa force-push).
- ✓ **Blok B — struktur repo + kontrak JSON v1** (log Blok B, terverifikasi).
- ✓ **Blok C — Model Router** (log Blok C; struktur + mock, live menyusul
  saat itu — live kemudian terbukti 28 Okt, lihat §1.12).
- ✓ **Blok D — CostLedger + hard limit $5** (log Blok D; ledger
  `data/cost-ledger.jsonl`, md5 `d542428fe9901fbd417e098e9249d4b6` — tidak
  berubah pada gerbang v46–v200).
- ✓ **Blok E — Policy Engine + gate service** (log Blok E; gerbang ditegakkan
  server-side di runner Node, BUKAN di app — koreksi audit v66).
- ✓ **Blok F — antrean + progres SSE** (log Blok F).
- ✓ **Blok G — job contoh ujung-ke-ujung** (log Blok G; mock, draf saja).
- ✓ **Blok H — tes gerbang tiga jalur** (log Blok H; sebagian, live tertunda
  saat itu — kemudian lolos penuh, lihat Fase 0).
- ✓ **Blok I — re-baseline biaya + kunci Fase 1** (tertunda saat itu, selesai
  sebelum Fase 1 jalan; token selamat Fase 1 4.660 + Fase 2 3.604 +
  Fase 3 2.595 = 10.859 Gemini; COST_TOTAL 11.577).
- ✓ **Blok J — scan + log + push** (log Blok J; scan kredensial jadi bagian
  gerbang tiap versi).
- ✓ **FASE 0 LOLOS PENUH** (vonis Patria 28 Okt ~11:20; addendum di
  `docs/fase-0-gate-results.md`).
- ✓ **Fase 1 GSTP disetujui** (Patria 27 Okt 12:04; brand uji fiksi
  `TEST-BRAND-001`).
- ✓ **Fase 2 — kalender 7 hari + 7 brief, GKonten disetujui.**
- ✓ **Fase 3 — 7 carousel × 3 slide, QC 100/100.**
- ✓ **Fase 4 — form → CRM Leads, rule-based, nol model call** (fixture 12 lead
  → 10 deduped, 6 draf Outreach).
- ✗ **Persetujuan GTemplate Fase 4** — status: masih `null`, menunggu Patria.
  (BUKAN error dan bukan blocker teknis: approval gate milik Patria; modul
  Fase 4 dilarang mengarang persetujuan sendiri. Penjelasan lengkap di §2.9.)
- ✗ **GBatch** — status: terkunci `false`, menunggu Patria.
  (BUKAN error: batch draft-only by design; tidak ada jalur kirim di modul
  Fase 4; hanya klik manual wa.me. Lihat §2.9.)
- ✗ **Fase 5 (harness evaluasi live golden set + rehearsal + cost-per-task)**
  — status: BELUM DIMULAI.
- ✗ **Video demo final** — status: belum dibuat (jadwal 3 Nov; hanya pekerjaan
  27 Okt–4 Nov yang boleh tampil, aturan NEW WORK ONLY Indie).
- ✗ **Submit project** — status: DITUNDA ke awal November atas keputusan
  Patria 27 Okt 08:17; tenggat 4 Nov 21:00 ET = **5 Nov 09:00 WIB**; form
  cerebralvalley.ai tanpa simpan draf (hanya Submit final); nama tim dan
  solo-vs-tim belum diputuskan (saat ini hanya Patria).

### 1.2 Home / Chat (termasuk 3 Alur Patria)

- ✓ **Alur 1: brief → folder project otomatis → fan-out → QC → laporan
  lengkap** — v103 (perintah Patria 30 Okt 16:02 "lanjut").
- ✓ **Alur 2: folder + agen aktif → brief → delegasi HANYA agen aktif** —
  v117.
- ✓ **Alur 3: Graph → buat project → pasang node → instruksi node; semua
  muncul di list agen aktif** — v115 + v117.
- ✓ **Aturan sinkron dua arah** ("apa pun di menu utama = di graph, dan
  sebaliknya") — v91 + v94 + v95 (aturan Patria 30 Okt 13:47).
- ✓ **Aturan agen menyatakan kesediaan → dipanggil, status aktif, muncul di
  sidebar list agen aktif** — v104 + v117 (aturan Patria 30 Okt 16:16).
- ✓ **List agen hanya agen aktif; Prime tidak pernah jadi anggota project**
  — v98–v100; tombol ▶ ⏹ ✕ per baris; × = NONAKTIFKAN (bukan hapus definisi).
- ✓ **Folder project: rename inline + hapus dua ketuk (armed bertahan)**
  — v105 + v106 + v107 + v125.
- ✓ **Header Graph + dropdown project custom + dialog hapus**
  ("Yakin menghapus project Ini? …") — v129.
- ✓ **Standar penulisan laporan agen** (judul 1 baris + subjudul + header
  `##` bernomor + bullet + baris marker `►RECOMMEND:`) — v130; opsi
  rekomendasi mendahulukan pendalaman hasil itu sendiri, dilarang menawarkan
  versi usaha/industri lain — v143 (aturan Patria 31 Okt 20:37).
- ✓ **Aksi bubble: tombol V, menu Reply/Star/Copy/Delete, react 8 emoji,
  reply bar, pinned bar; hapus LANGSUNG tanpa dialog** — v131 + v141.
- ✓ **Tombol rekomendasi di window chat + navigasi otomatis ke Media Studio
  saat pendalaman dipilih** — v132 + v145 (aturan Patria 31 Okt 21:07).
- ✓ **Tombol saran hanya untuk kurasi Prime + flag cbAsk; mutu saran
  (mempertajam tujuan / memperjelas manfaat / memudahkan keputusan)**
  — v154.
- ✓ **Grounding 6 titik** (scopeLine + GROUNDING_INSTRUCTION) — v155.
- ✓ **QC kuat 5 kriteria** (kesesuaian brief, grounding, konsistensi internal,
  kelengkapan, fabrikasi) + verdict LOLOS/REVISI — v159 (arah produk Patria
  1 Nov 14:32: kurasi + reasoning kuat sebagai pembeda).
- ✓ **Pendalaman tanpa cap jumlah** (postChat cabang project memanggil
  saveHomeState tiap bubble) — v159.
- ✓ **Mode gate QC** (maks 3 versi, 2 revisi; verdict interim tidak pernah
  diposting; regex kecocokan PERTAMA menang; tanpa verdict → LOLOS) — v161
  (disetujui Patria 1 Nov 14:41).
- ✓ **Brief Image otomatis dari output kurasi** (tugas visual → imgSetBrief
  teks mentah, tanpa navigasi paksa; fan-out + Prime dikecualikan) — v162.
- ✓ **Brain per-agen LIVE + tombol Coba lagi** (model per agen via substring;
  cap pendingRetries 50) — v152.
- ✓ **Reasoning/Effort di detail agen** — status: MASIH GIMMICK (tampilan
  saja, belum live). Pemetaan ke live belum dijanjikan.
- ✓ **Tema Dark Violet Glass duo-tone + terang sepasang; tema mengikuti
  sistem default** — v109–v113 (keputusan Patria 19–30 Okt).
- ✓ **Tema button teks** (rounded 10px, gradasi → hijau permanen setelah
  diklik via btnDoneWire; status on/off tidak digantungkan ke class) — v126.
- ✓ **Penghitung karakter chat DIHAPUS TOTAL** — v144 (jangan dibangun ulang
  tanpa perintah Patria).
- ✓ **Main chat jalan tanpa project** — v101.
- ✓ **Link chat bisa diklik → buka URL eksternal via Rust** — v116.
- ✓ **Approve Studio dari chat dua ketuk** (seLoadOutput + Media Studio tab
  Script + hijau permanen) — v131-era (studioButton/approveStudio).
- ✗ **Pemicu alur brief kreatif diperluas ke semua brief kreatif** — status:
  BELUM DIJAWAB. Saat ini hanya brief yang MENYEBUT Kreatif dengan nama
  (`cbIsFlowEntry`, keputusan implementasi v138, belum ada vonis Patria).
- ✗ **Fan-out multi-agen yang memuat Kreatif: bagiannya interaktif atau
  tidak** — status: BELUM DIJAWAB.
- ✗ **Pesan chat Prime tanpa delegasi tidak membuat node Graph** — status:
  DESAIN SAAT INI (bukan bug yang dilaporkan); perubahan menunggu perintah.

### 1.3 Kanban

- ✓ **Tugas agen muncul di Kanban otomatis** — v149 (aturan Patria 1 Nov
  11:55).
- ✓ **Kartu menetap + detail 2x klik (popup, tutup via X sudut kanan atas)**
  — v150 + v153.
- ✓ **Dialog edit kartu klik-1x; kartu tidak pernah terhapus otomatis**
  — v149/v150.
- ✓ **Kanban semua project + graph dua arah** — v91-era.
- ✗ **Kanban 5 kolom vs tepat 3 kolom** — status: BELUM DIPUTUSKAN Patria.

### 1.4 Graph

- ✓ **Kanvas Graph: pan, zoom 0.5–2, node + edge + connector, popup node
  lewat listener delegasi (bukan inline onclick)** — v91 + v108 + v115.
- ✓ **Setting per node ala OpenBot; node seragam; outline sehat; layar
  penuh** — v77 + v82 + v83 + v96.
- ✓ **Connector delegasi otomatis saat tugas terdelegasikan** — v151
  (graphEnsureEdge).
- ✓ **Hapus node Graph → list ikut hilang; kembali ke Home → list segar**
  — v95.
- ✓ **Agen Graph tanpa proyek tampil di list utama + delegasi + adopsi**
  — v94.
- ✓ **Render Graph ditunda double-rAF di showView('graph')** — v157
  (koreksi atas salah diagnosis v156 — v156 JANGAN dikutip sebagai berhasil).
- ✓ **Ikon status agen (14px list, 7px node) + dot folder project**
  — v124 + v127 + v128.
- ✗ **Konfirmasi visual live garis Graph v157** — status: MASUK VONIS 4 NOV
  (Patria 2 Nov 22:12): bila sampai 4 Nov tidak ada perubahan, dianggap
  SUDAH secara teknis, namun BELUM uji live.
- ✗ **Klik + tengah Graph juga menjalankan alur** — status: BELUM DIPUTUSKAN.

### 1.5 Library

- ✓ **Arsip otomatis: hanya 3 bulan kalender terakhir tampil; selebihnya ke
  `minime.library.archived`, BUKAN hapus** — v90.
- ✓ **Detail klik-2x lewat delegasi** — v118.
- ✓ **Galeri Image Editor hanya 10 output terakhir, thumbnail saja**
  — v158 (aturan Patria 1 Nov 13:34).
- ✓ **Judul item = field `o`; LIB bawaan kosong; tombol varian tersimpan
  tetap "Simpan ke Library"** — perilaku yang dijaga rig.
- ✗ **Detail klik-2x untuk kartu ARSIP Library** — status: BELUM DIBANGUN.
- ✗ **Upload arsip Library ke Google Drive (OAuth)** — status: BELUM DIBANGUN
  (Drive belum terhubung; tidak ada OAuth Drive di app).
- ✗ **M1-identitas Library, M6 unifikasi store, tombstone library, file
  gambar yatim** — status: DIPARKIR (inert, tidak mengganggu).

### 1.6 Media Studio — Script Editor

- ✓ **Media Studio 4 tab: Script, Image, Voice, Video** — sejak 27 Okt;
  Batch pindah ke Planner — v148.
- ✓ **Menu Social (platform, mode content/caption/both, format
  image/carousel/reels, framework AIDA/PAS/BAB/FAB/4P/ACCA/HSO/Golden)**
  — fondasi Script Editor.
- ✓ **Menu Artikel + bridge `window.seSetArtikel` + tombol Caption artikel**
  — v138 + v172.
- ✓ **Menu Movie formulir PROVISIONAL + tombol Caption video** — v139 + v172.
- ✓ **Caption 3 jalur terisolasi-terintegrasi** (artikel / sosmed / video,
  masing-masing prompt sendiri, tidak dicampur) — v172 (aturan Patria
  1 Nov 22:58 + prinsip 23:03).
- ✓ **Tombol Bersihkan di 3 menu + 5W1H roll-over "Brief tambahan (5W1H)"**
  — v146 + v147.
- ✓ **Tombol Impor (Library maks 20 + Chat maks 20) mengisi kolom HASIL**
  — v166.
- ✓ **`seUse`: libAddScript dulu, lalu bercabang — caption → Planner,
  selain itu → Image Editor** — v172.
- ✓ **Reset outputKind='script' di 5 titik** (seClear, seGenerate sukses,
  seImportOpen, seSetArtikel, seLoadOutput) — v172.
- ✗ **v160 — scope fitur editor Media Studio** — status: BLOCKED menunggu
  vonis Patria (widget `widget-925d9f0d-dfe9-496f-8657-b74db19a487f`,
  31 Okt ~20:11, BELUM dijawab). Butir (1) bridge Movie `seSetMovie` tetap
  belum dibangun; butir (2)(3) (intake Voice/Video) kini sudah terwujud
  konkret untuk jalur Story Board lewat v163, tapi status resmi v160 tetap
  blocked. **Jangan dikerjakan sebelum vonis.**
- ✗ **Cakupan impor v166 (kolom Hasil vs kolom Apa)** — status: MASUK
  VONIS 4 NOV (perilaku saat ini: mengisi HASIL; bila sampai 4 Nov tidak
  ada perubahan, dianggap SUDAH secara teknis, namun BELUM uji live).
- ✗ **Spec movie Edukasi/Komedi** — status: BELUM DITULIS Patria; jalur
  sementara direct-generate (v139).
- ✗ **Konfirmasi struktur PROVISIONAL Artikel/Movie Script Editor** — status:
  BELUM DIKONFIRMASI Patria.

### 1.7 Media Studio — Image Editor

- ✓ **Redesain Image Editor: brief lebih besar; Gaya Visual dipisah dari
  Output Desain (Poster / Story Board / Carousel)** — v163 (spec Patria
  1 Nov 15:56).
- ✓ **Poster → rasio; Story Board → durasi (maks 60 dtk) + rasio, dibagi
  scene sebagai keyframe; Carousel → 6–10 slide; Judul/Subjudul/Listicle**
  — v163.
- ✓ **Pola prompt image WAJIB v171** (3 bagian: Text Prompt → Breakdown
  elemen visual & layout → Color Palette; urutan kirim: brief → Header →
  Title → Subtitle → List → Footer → Color palette → style → textfree →
  brandSuffix) — v171; dokumen pola di `~/workspace/specs-visualisasi/`.
- ✓ **Storyboard jadi SEQUENCE konsisten (shot list + bible)** — v164.
- ✓ **STYLE LOCK storyboard** (medium, palet, lighting, lens feel sama di
  semua frame; satu shot per frame; larangan kolase/poster/header bar) —
  v165.
- ✓ **Setujui draft: simpan SEMUA varian; Story Board → veSetPlan + naskah
  VO (vsSetScript + libAddScript) + caption video; Poster/Carousel → caption
  sosmed** — v163.
- ✓ **Per varian: Edit di Canva (clipboard prompt + unduh + buka canva.com)
  + Impor dari Canva (varian baru label 'Canva')** — v163.
- ✓ **Generate image: Meta muse-image-1.0 ($0,01, live-verified) + Google
  Nano Banana 2 / gemini-3.1-flash-image ($0,067, pencatatan)** — v168.
- ✓ **Provider select Meta/Google; aspek 1:1/3:4/4:3/9:16/16:9 (pemetaan
  app: 4:5→3:4, 3:2→4:3, 2:3→3:4)** — v168.
- ✓ **Scrollbar sendiri kolom Brand** — v177 (CSS saja).
- ✗ **v173 — template carousel di app** — status: BLOCKED menunggu vonis
  batas slide (widget `widget-9fffd56e-6274-4846-af65-53fbd6f57a87`,
  1 Nov ~23:00, BELUM dijawab): referensi @marketingharry 11 slide vs maks
  app 10. Opsi: "Maks 12 slide, struktur utuh" vs "Tetap 10 slide, pangkas
  1 beat". **Jangan di-nag berulang; jangan dibangun sebelum vonis.**
- ✗ **v174 — struktur storyboard di app + auto-placeholder** — status:
  DIPERINTAHKAN Patria 2 Nov 22:13 (nomor reserved); ANTRE sesudah v202
  (belum dikerjakan). Struktur pola sudah ada di dokumen; handoff v163
  wajib terisi otomatis saat dibangun.
- ✗ **Auto-toggle "Tanpa teks" saat field teks overlay v171 diisi** — status:
  BELUM DIJANJIKAN (saat ini manual).
- ✗ **Referensi gambar untuk generate GAMBAR Meta** — status: BELUM
  TERVERIFIKASI live.
- ✗ **Engine gambar internal** (SD-turbo hidup lagi vs MOSS-Image vs tetap
  API eksternal) — status: BELUM DIJAWAB Patria. Fakta: SD-turbo era Minime
  v2 tipografinya GAGAL; server 127.0.0.1:8080 MATI (cek 2 Nov 00:42);
  MOSS-Image belum pernah dibangun/diuji.
- ✗ **Bukti visual live scrollbar Brand v177** — status: MASUK VONIS 4 NOV
  (bila sampai 4 Nov tidak ada perubahan, dianggap SUDAH secara teknis,
  namun BELUM uji live).
- ✗ **Generate ulang storyboard v165 (konsistensi gaya)** — status: MASUK
  VONIS 4 NOV (bila sampai 4 Nov tidak ada perubahan, dianggap SUDAH
  secara teknis, namun BELUM uji live).
### 1.8 Media Studio — Video Editor (ve2)

- ✓ **Engine ve2 nyata + FFmpeg terintegrasi** (video_render/qc/capture/
  probe/asset_hash/read/write_ass/save) — v80 + fondasi.
- ✓ **Timeline 4 track (Video, B-Roll, Audio, Teks); render 1280×720@30;
  fade = pass FFmpeg kedua; zoom = PREVIEW-ONLY; track Teks TIDAK ikut
  render** — arsitektur ve2.
- ✓ **Daftar aset berfungsi + tombol '+' + jenis Image/Video/Audio**
  — v182.
- ✓ **Tombol '+' buka pemilih file asli via plugin dialog** (plugin-dialog
  2.8.4 JS + `tauri-plugin-dialog = "2"` Rust; capability hanya
  `core:default` + `dialog:allow-open`) — v183.
- ✓ **Tombol Bersihkan di tiap form input Omni + HyperFrames** — v184.
- ✓ **Generate HTML dari deskripsi (hf-gen.ts) + komposisi HyperFrames**
  — v185.
- ✓ **Pratinjau isi file asli klip terpilih + batas proporsional
  (max-height min(480px, 55vh), object-fit contain)** — v186.
- ✓ **Aset sumber klip tampil di daftar Aset (backfill satu kali saat muat,
  dedup by src, tanpa probe)** — v187.
- ✓ **Daftar Aset grid thumbnail 2 kolom berscrollbar (tanpa label teks) +
  tombol + (Library/file) + drag-drop thumbnail ke timeline** — v188.
- ✓ **× per tile Aset hanya menghapus ENTRI daftar** (klip timeline + berkas
  disk TIDAK ikut terhapus) — v189 (koreksi Patria 17:55: × yang dimaksud
  ada di tile ASET, bukan agen).
- ✓ **Petunjuk drag di bawah grid Aset DIHAPUS dari UI** — v190.
- ✓ **Bar editor track di bawah kartu timeline** (Potong, Hapus klip,
  Tambah Teks, Subtitle, Transisi, Putar, Berhenti; id lama dipertahankan;
  disabled berbasis seleksi/playing) — v191.
- ✓ **Pratinjau idle dibungkus kotak tinggi tetap (perbaiki lompat view) +
  seret klip diganti pointer events (HTML5 drag tidak jalan di WebView
  live)** — v192.
- ✓ **Inspector kosong = tombol proyek (Simpan, Ekspor MP4, Render Preview,
  File output; tombol atas tetap ada) + pratinjau default 9:16** — v193.
- ✓ **Pesan probe diperjelas (berkas tak ada → menyebut path; ffprobe gagal
  → stderr tail 300) + fallback gambar (probe gagal tetap menambah aset
  durasi 5 dtk)** — v193.
- ✓ **Sintaks ffprobe diperbaiki (field dipisah koma, seksi dipisah titik
  dua)** — v194. Berkas drinksaints Patria terverifikasi: h264 720×1280 +
  AAC, 9,122585 dtk. Jalur probe tambah-aset TIDAK PERNAH lolos live
  sebelum v194.
- ✓ **Player berhenti di ujung klip terakhir (bukan ujung skala 30 dtk);
  tanpa klip → Putar tidak jalan; playhead lewat ujung → ulang dari 0**
  — v195.
- ✓ **Geser durasi dari grip ujung kanan klip + cap durasi asli
  (`ve2OrigDur`: null = bebas untuk teks/gambar/tanpa acuan; aset
  duration>0 → cap; lantai geser 0,1 dtk, lantai Inspector 0,5 dtk)**
  — v195.
- ✓ **Snap magnet on/off (default AKTIF; persist di state ve2; kandidat =
  start/end klip lain di TRACK YANG SAMA; ambang 0,5 dtk inklusif)**
  — v195.
- ✓ **Playhead + penggaris + klik/seret timeline segaris bar (offset label
  78px: label 70 + gap 8; semua overlay/pemetaan pointer berbasis koordinat
  div dalam WAJIB ±78px)** — v196.
- ✓ **Play pada monitor pratinjau idle menggerakkan playhead (handler
  `onplay` menjeda elemen lalu memanggil jalur tombol Putar transport)**
  — v197.
- ✓ **Pause pada monitor preview menghentikan playhead (handler `onpause`
  dengan syarat ganda: sedang jalan + benar-benar paused; idempotent)**
  — v198.
- ✓ **Migrasi generator video Veo → Gemini Omni** (video-gen.ts DIHAPUS
  total; omni-gen.ts; kontrak POST interactions; durasi tidak bisa diminta,
  klip 3–10 dtk ditentukan model) — v181 (vonis Patria 2 Nov 02:47 setelah
  Veo 404: model dimatikan Google 22 Okt 2026; generate Veo TIDAK PERNAH
  sukses di app; upaya gagal tidak memakan biaya).
- ✓ **HyperFrames CLI 0.8.212 terintegrasi** (check + render; job dir
  `~/Movies/minime-hyperframes/hf-<ts>/`; TMPDIR = job dir; timeout 600 dtk;
  GSAP 3.14.2 vendored) — v175. HyperFrames = tool pihak ketiga (Apache-2.0),
  TIDAK boleh diklaim karya event; yang karya event = panel + perintah Rust
  + wiring.
- ✓ **Pilihan model omni/hyperframes di panel Video; template Seri Harian
  v176 + batch video v170 + heading ganda DIHAPUS total** — v179.
- ✓ **Redesain panel video ala Veo 3.1 (desain, bukan mesin) + hapus UI lama**
  — v178 (vonis Patria 02:19 "Hapus semua, ganti desain Veo 3.1").
- ✓ **Menu Campaign DISEMBUNYIKAN SEMENTARA — tidak terkait ve2, dicatat di
  sini karena satu rantai versi: tombol rail Campaign display:none; view +
  logika utuh** — v199 (lihat §1.10).
- ✓ **Wan 3.0 via ClassAI — mesin video ketiga di panel Video** — v201
  (perintah Patria 2 Nov 22:09; LIVE 2 Nov ~22:32, PID 66435, HEAD MacBook
  63b1e77, md5 dist lokal == MacBook, penanda `router.classai.id` 2x +
  `wan-3.0` di bundle JS MacBook). Modul baru `app/src/lib/classai-video.ts`
  (154 baris): POST `router.classai.id/v1/videos` (Bearer kunci milik user)
  → poll GET `/v1/videos/{id}` tiap ~10 detik sampai completed (Wan 3.0:
  2–3 menit) → unduh dari field url atau GET `/v1/videos/{id}/content` →
  video_save → video_probe → spend. Opsi model 'wan' di #vg-model (kini
  3 opsi) + cabang UI Wan (prompt #vg-wan-prompt, aspek 9:16/16:9, resolusi
  480p/720p/1080p, detik 2–30, harga live, Generate #vg-wan-generate +
  Tambah ke timeline #vg-wan-add-timeline dengan state terakhir TERPISAH
  dari Omni). Tarif (1 miliar kredit = $12,48): 480p 9,2 jt/detik; 720p
  18,5 jt/detik; 1080p 37 jt/detik; minimum 33,3 jt/video. Posisi jujur:
  klip 10 detik 1080p = $4,62, LEBIH MAHAL dari Omni 1080p $1,52 — Wan =
  mesin alternatif tanpa billing Google, Omni tetap utama. Tagihan
  mengikuti detik YANG DIMINTA, bukan durasi probe. Rig-video §v201:
  10 cek lolos (lihat §6.1). Generate live Wan pertama TETAP BELUM
  terbukti: butuh kunci ClassAI Patria di app (belum ada kunci tercatat).
- ✓ **Konfirmasi live v196 (playhead berhenti tepat menempel di ujung kanan
  bar klip coffeeroom; angka transport 00:09 = floor dari 9,5, BUKAN
  patokan)** — status: TERKONFIRMASI LIVE Patria 2 Nov 22:10 ("sudah ok").
- ✓ **Konfirmasi live v197 (▶ besar di tengah monitor pratinjau → playhead
  bergerak + transport jadi Berhenti)** — status: TERKONFIRMASI LIVE Patria
  2 Nov 22:10.
- ✓ **Konfirmasi live v198 (Putar → pause lewat tombol pause monitor →
  playhead membeku + transport kembali ke Putar)** — status: TERKONFIRMASI
  LIVE Patria 2 Nov 22:10.
- ✓ **Konfirmasi live 22:10 untuk v195/v191/v189/v193** — grip cap durasi
  asli + snap magnet (v195), bar editor track (v191), × aset (v189),
  pratinjau 9:16 + tombol proyek Inspector (v193) — semua SUDAH OK live
  menurut Patria 2 Nov 22:10.
- ✓ **Tambah ulang mp4 drinksaints + berkas render HF
  (hf-1793593163508/out.mp4) ke daftar aset** — status: TERKONFIRMASI LIVE
  Patria 2 Nov 22:11 ("sudah oke" secara fungsi).
- ✗ **Generate live Omni pertama** — status: MASUK VONIS 4 NOV (belum
  dicoba; butuh billing aktif di proyek kunci Gemini; vonis billing masih
  terbuka, lihat §2.4; bila sampai 4 Nov tidak ada perubahan, dianggap
  SUDAH secara teknis, namun BELUM uji live).
- ✓ **Generate HTML live pertama (v185)** — status: TERKONFIRMASI LIVE
  Patria 2 Nov 22:11 secara FUNGSI, namun hasilnya BELUM MEMUASKAN
  (rincian ketidakpuasan menunggu jawaban Patria; lihat ✗ berikut).
- ✗ **Rincian ketidakpuasan hasil v185 / render HyperFrames** — status:
  MENUNGGU JAWABAN Patria (pertanyaan diajukan 2 Nov 22:15; belum dijawab).
  Tanpa rincian ini, perbaikan kualitas tidak bisa diarahkan.
- ✓ **Dialog pemilih file v183** — status: TERKONFIRMASI ketukan live
  Patria 2 Nov 22:11.
- ✓ **Render HyperFrames live pertama dari deskripsi (v175, kini lewat
  pilihan model)** — status: TERKONFIRMASI LIVE Patria 2 Nov 22:11 secara
  FUNGSI, namun hasilnya BELUM MEMUASKAN (sama dengan v185 di atas;
  rincian menunggu jawaban Patria).
- ✗ **Seek #ve2Video via controls bawaan saat playback** — status: BELUM
  DITANGANI (keputusan scope v198: risiko mengganggu pergantian klip;
  desync video vs playhead mungkin terjadi; belum dilaporkan Patria).
- ✗ **Snap lintas track** — status: KEPUTUSAN MIMI v195 (hanya track yang
  sama) disampaikan sebagai koreksi-terbuka; BELUM ADA VONIS Patria.
- ✗ **"Button render" di Inspector (v193)** — status: DIARTIKAN sebagai
  Ekspor MP4; disampaikan di laporan v193; BELUM ADA KOREKSI Patria.
- ✗ **Berkas disk ikut terhapus saat × aset ditekan?** — status: BELUM ADA
  VONIS (saat ini hanya entri yang dihapus, v189).
- ✗ **Template pola sinematik ke panel video** — status: DIPERINTAHKAN
  Patria 2 Nov 22:12 sebagai v202; ANTRE sesudah v201 (belum dikerjakan).
  Pola sudah didokumentasikan (28,3 dtk, 10 beat, kartu judul HyperFrames).
- ✗ **Jalur burn-in caption / teks-di-atas-footage** (termasuk eksperimen
  HyperFrames-over-video) — status: BELUM DIPUTUSKAN. Batas jujur saat ini:
  FFmpeg tanpa drawtext/libass; track Teks ve2 tidak ikut render; kartu
  judul = klip teks mandiri HyperFrames.
- ✗ **Penyambungan transkrip Voice Editor ke caption ASS video** — status:
  BELUM DIPUTUSKAN.
- ✗ **Batch video + scene berurutan (v170)** — status: DIHAPUS TOTAL di v179
  (bukan pending; dicatat agar tidak dibangun ulang tanpa perintah baru).

### 1.9 Media Studio — Voice

- ✓ **VoiceStudio eksternal sebagai engine utama** (AGPL-3.0, TIDAK
  dibundel; local API 127.0.0.1:3900; proses terpisah) — keputusan Patria;
  yovoice fallback.
- ✓ **Voice Editor: timeline waveform + daftar aset + transkrip Whisper**
  — v65.
- ✓ **Sherpa-ONNX + Piper id_ID PROVISIONAL; Whisper terpasang
  (/opt/homebrew/bin/whisper-cli + model ~/whisper-models/ggml-small.bin)**
  — v65-era + 28 Okt.
- ✓ **Periksa status + Setup VoiceStudio (satu paket) DIHAPUS dari tab
  Voice** — v67 (perintah Patria 29 Okt 21:01).
- ✓ **Naskah VO Story Board masuk Voice Editor (vsSetScript) + caption
  video** — v163.
- ✗ **Voice Editor intake naskah VO/audio untuk jalur chat umum** — status:
  BAGIAN DARI v160 yang blocked (lihat §1.6); untuk jalur Story Board
  sudah ada via v163.
- ✗ **Upgrade VoiceStudio v0.5.7** — status: BELUM DIPUTUSKAN.
- ✗ **Daftar model VoiceStudio pajangan** — status: BELUM DIKONFIRMASI.

### 1.10 Planner

- ✓ **Planner native menggantikan Postiz total** (Postiz dihapus dari app
  v63; stack Docker Postiz MacBook DIHAPUS TOTAL 30 Okt ~04:10) — v61–v64.
- ✓ **8 kanal native** (FB profil `can:false` — API tidak mengizinkan
  autopost; IG, Threads, LinkedIn personal, X, TikTok foto, dll.) — v62–v64.
- ✓ **OAuth loopback 127.0.0.1:4317 → localhost; timeout 600 dtk; fallback
  tempel code manual (socParsePaste)** — v119–v122.
- ✓ **Perbaikan exchange Meta (curl config `silent` telanjang)** — v123.
- ✓ **Antrean `minime.socialQueue` + scheduler 30 dtk (hanya saat app
  terbuka)** — v61-era.
- ✓ **Draft-only kiriman tunggal; autopost HANYA batch terjadwal dengan
  persetujuan di awal batch** — aturan berdiri 24 Okt (REVISI) + 28 Okt;
  di kode: tombol komposer terpisah `socCompDraft` → 'draft' vs
  `socCompSave` → 'queued' (social.js:1396–1397); scheduler hanya
  menerbitkan status 'queued' yang waktunya tiba (social.js:1427).
- ✓ **Instagram TERHUBUNG (31 Okt 09:27)** via aplikasi Meta "Hackathon"
  (ID 1750866606006134; aplikasi lama 1864975714526471 DIHAPUS Patria
  31 Okt 07:02). Nilai token/secret tidak dicatat di mana pun — hanya
  fakta keberadaannya.
- ✓ **LinkedIn PERSONAL (bukan Page)** — keputusan Patria 29 Okt 16:50
  (Page di form hanya formalitas; posting ke profil via w_member_social).
- ✓ **Batas login provider** (di dalam app sebisa mungkin; bila browser tak
  terhindarkan, app membuka browser ke alamat login yang benar dengan
  tracing) — keputusan Patria 29 Okt 16:17.
- ✓ **Batch pindah ke Planner (dari Media Studio)** — v148.
- ✓ **Prefill caption komposer Planner dari Image Editor (socSetCaption +
  socPendingCaption)** — v163.
- ✓ **Wizard Hubungkan terpandu semua kanal + ikon kanal logo asli**
  — v68–v73.
- ✗ **Settings per-kanal Postiz + tag + komentar pertama** — status:
  BELUM DIPUTUSKAN (peninggalan era Postiz).
- ✗ **LinkedIn Page sebagai kanal terpisah; TikTok Business sebagai varian**
  — status: BELUM DIPUTUSKAN.
- ✗ **Konfirmasi prefill caption Planner v163 dibuktikan live** — status:
  MASUK VONIS 4 NOV (round-trip Canva live masuk vonis yang sama; bila
  sampai 4 Nov tidak ada perubahan, dianggap SUDAH secara teknis, namun
  BELUM uji live).
### 1.11 Campaign (disembunyikan sementara — v199)

- ✓ **Campaign 4 tab: Leads Generator, Leads & CRM, Outreach, Follow Up;
  form lead manual, ubah stage, salin draf, tugas Follow Up** — fondasi
  (menu Campaign di sidebar sejak 28 Okt; audit v78/v79).
- ✓ **Menu Campaign DISEMBUNYIKAN SEMENTARA** (tombol rail antara Planner
  dan Billing `display:none`; view + logika tetap utuh; tidak ada yang
  dihapus) — v199 (perintah Patria 2 Nov 21:38). Cara menampilkan lagi:
  hapus blok v199 di `layout-scroll.css`. Bukti live: screenshot Patria
  21:44 sudah tidak menampilkan ikon Campaign di rail.
- ✗ **Perbaikan Campaign** — status: BELUM DIPERINTAHKAN (alasan
  penyembunyian: "sebelum kita sempat memperbaikinya"). Scope perbaikan
  belum dispesifikasi — menunggu perintah Patria.
- ✗ **Konfirmasi tab Campaign ke-4 "Leads & CRM"** — status: BELUM
  DIKONFIRMASI Patria.

### 1.12 Billing

- ✓ **Billing = Cost jadi kartu** (ikon kartu kredit; tampilan kartu) —
  28 Okt.
- ✓ **Total = COST_TOTAL + live + imgSpend + videoSpend; peringatan >$5
  (bukan blokir); format Rupiah** — fondasi + audit v66 (hard limit $5 =
  peringatan tampilan saja, bukan blokir; kredit aktif $150).
- ✓ **Layout Billing jadi kartu per model** (grid `.bill-grid`; tiap entri
  pemakaian — COST_ROWS, image, video, live — jadi kartu `.bill-card`
  dengan isi persis sama seperti baris lama; baris Total tetap strip
  ringkasan di luar grid; panel Kredit & Batas tidak berubah) — v200
  (perintah Patria 2 Nov 21:45 + screenshot).
- ✓ **Kartu Billing Wan 3.0 / ClassAI sendiri (bila videos > 0)** — v201
  (LIVE ~22:32). Spend terpisah `minime.classaiSpend` (videos, kredit, USD,
  IDR); kartu memakai kunci baru `vg.wan.spend`, berlabel benar — berbeda
  dengan kartu video lama yang masih berlabel "Veo 3.1" (lihat §3.1).
- ✓ **Kredit gratis Meta $150; saldo tertunggak Rp 0; belum ada payment
  method** (fakta screenshot Billing Patria 31 Okt 11:53: sisa $149,71,
  terpakai $0,29 dalam 4 hari — angka dashboard, bukan angka app).
- ✗ **Penautan kartu + konfirmasi Spend Limit Meta** — status: BELUM
  DIKONFIRMASI Patria.
- ✗ **Backup/tracking ledger di git** — status: BELUM DIPUTUSKAN
  (ledger `data/` gitignored; md5 dijaga tiap gerbang).

### 1.13 Settings

- ✓ **Settings per-kunci Hubungkan (uji live, satu-satunya jalur tulis
  kunci); TANPA tombol Simpan bersama** — v87 (tombol simpan bersama
  dihapus).
- ✓ **Kartu kunci ClassAI di Settings (Hubungkan + uji live GET /v1/models
  tanpa memakan kredit)** — v201 (LIVE ~22:32). Storage `minime.classaiKey`;
  KeyKind kini gemini|meta|classai; tombol mengikuti pola per-kunci yang
  sama (TERHUBUNG hanya bila uji live lolos). Rig-settings diperbarui:
  ekspektasi kartu kunci 3 → 4.
- ✓ **Periksa Ollama** (server diperbaiki 31 Okt ~14:30 via
  `brew services start ollama`; terverifikasi 1 Nov 12:20: 5 model
  termasuk deepseek-r1:1.5b, qwen2.5:3b) — bukan bug app.
- ✓ **Detail agen: avatar picker, Model live (v152), skill, Memories,
  Files; Publish/Permissions/Folders/Tables = baris nota** — fondasi.
- ✓ **Tema System/Gelap/Terang di Pengaturan; selector bahasa (B7 i18n)**
  — v109 + B7.
- ✓ **Kunci storage live terverifikasi ada (nama saja): `minime.metaKey`,
  `minime.geminiKey`, `minime.ollamaUrl`** (cek 1 Nov 12:20; nilai tidak
  pernah dibaca). Kartu ClassAI (v201) sudah ada di UI, tetapi
  `minime.classaiKey` BELUM tercatat ada — kunci ClassAI Patria belum
  dimasukkan; ini syarat uji live Wan (lihat §2.5 v2).
- ✗ **Scope Publish/Permissions/Folders/Tables di detail agen** — status:
  BELUM DIPUTUSKAN (saat ini baris nota).

### 1.14 Router, model, biaya

- ✓ **Router: Meta muse-spark-1.3 → Gemini gemini-3.1-flash-lite → Ollama
  deepseek-r1:1.5b → Ollama qwen2.5:3b** (repo root `src/router.ts`;
  timeout 30 dtk, Ollama 15 dtk; `callGemini` memakai `?key=` query param,
  BUKAN header).
- ✓ **Meta muse-spark-1.3 live** (uji live BERHASIL 28 Okt ~03:36; tarif
  $1,25/$4,25 per 1 jt token; muse-image-1.0 $0,01/gambar; Meta tanpa TTS).
- ✓ **QC keluarga berbeda dari pembuat** (Muse → Gemini; bila Gemini down
  → DeepSeek) — keputusan router 27 Okt 09:13.
- ✓ **Reintegrasi Meta: default router 1.1 → 1.3; QC tetap Gemini; Muse
  Image 1.0 tetap PROVISIONAL; transkripsi Tier 2 tetap Whisper lokal**
  — 27 Okt 21:14.
- ✓ **Gemini Fase 1–3 dicatat $0 free tier** (keputusan Patria 'Catat $0
  free tier, tutup bagian 2').
- ✓ **Harga Omni** ($17,50/1 jt token video output; per detik 360p $0,034 /
  720p $0,101 / 1080p $0,152 / 4k $0,304; klip 10 dtk ≈ $0,34/$1,01/$1,52/
  $3,04; input $1,50/1 jt token TIDAK dihitung app di spend).
- ✓ **Harga Wan 3.0 via ClassAI** — v201 (LIVE ~22:32). 1 miliar kredit =
  $12,48; 480p 9,2 jt kredit/detik; 720p 18,5 jt/detik; 1080p 37 jt/detik;
  minimum 33,3 jt/video (≈ $0,42). Klip 10 detik: 480p $1,15; 720p $2,31;
  1080p $4,62. Posisi jujur: di 1080p Wan LEBIH MAHAL dari Omni ($1,52);
  Wan = alternatif tanpa billing Google, Omni tetap utama.
- ✗ **Vonis billing Google** — status: BELUM DIPILIH (lihat §2.4).
- ✗ **Klaim kredit Meta $150: Spend Limit belum terlihat; kartu belum
  tertaut** — status: BELUM DIKONFIRMASI (tenggat klaim 4 Nov 21:00 ET ≈
  5 Nov 09:00 WIB; pantauan 6 jam jalan s.d. 10 Nov — jadwal pantauan ini
  dari sesi lain, bukan dari chat ini).

### 1.15 Repo, gerbang, deploy

- ✓ **Gerbang push per versi** (vite build, 14 rig, root tsc, gate-test
  14 grup, scan kredensial, ledger md5, hitungan i18n, svelte-check,
  cargo fmt+check+check-tests; cargo WAJIB 0 warning/error) — dipatuhi
  v141–v201 (gerbang v201: /tmp/gate-v201/, lolos penuh; lihat §6).
- ✓ **Svelte-check baseline: 0 error, 21 warning (semua pra-ada); warning
  BARU dari perubahan sendiri wajib diperbaiki sebelum kirim.**
- ✓ **Rantai deploy MacBook `mh-buildNNN.sh`** (pull ff-only, npm install,
  vite build, tauri build --debug, tambal ikon + CFBundleIconFile, pkill
  lama, open app, marker `MH_BUILD{N}_OK`) — s.d. mh-build201
  (MH_BUILD201_OK 2 Nov ~22:32; HEAD MacBook 63b1e77; PID 66435; md5 dist
  lokal == MacBook).
- ✓ **`app/src/app.css` verbatim prototype v5, TIDAK diedit** (terakhir
  disentuh commit v93, 30 Okt; semua CSS baru masuk blok berversi di
  `app/src/layout-scroll.css`).
- ✓ **String UI baru wajib kunci i18n ID/EN/ZH, 0 duplikat** — hitungan
  saat ini 1116/bahasa (v201: +6 kunci; verifikasi audit §6.6 v2).
- ✓ **Kredensial tidak pernah masuk repo/log/prompt/chat** (scan tiap
  gerbang; false positive yang diketahui: substring "sk-" di 'kb-ask-del',
  'task-close', class CSS 'kb-task-x'/'kb-task-pop').
- ✗ **Pembersihan ikon `Square*.png` + `icons/android/` + `icons/ios/`
  untracked di tree MacBook** — status: BELUM DIPUTUSKAN (jangan disentuh
  tanpa perintah).
- ✗ **Node upgrade untuk REA** — status: BELUM DIPUTUSKAN.
- ✗ **Penilaian live v108–v201** — status: SEBAGIAN MENGGANTUNG (daftar
  lengkap di §2.7 v2). Yang sudah terkonfirmasi live sejak v1: v196–v198,
  v195, v191, v189, v193, v185 (fungsi), v183, drinksaints + HF. Yang masuk
  vonis 4 Nov: 6 item. Yang benar-benar menggantung: grounding v155, Brain
  v152, gate v161, auto-brief v162, Nano Banana live, rincian kualitas
  v185/HF.
## 2. DAFTAR BELUM — yang wajib diputuskan / diperintah Patria

### 2.1 v160 — scope fitur editor Media Studio [BLOCKED]

- Widget `widget-925d9f0d-dfe9-496f-8657-b74db19a487f` (31 Okt ~20:11),
  BELUM dijawab.
- Butir (1) bridge Movie `seSetMovie` (Script Editor menerima naskah movie
  dari chat): belum dibangun.
- Butir (2) Voice Editor intake naskah VO/audio dan (3) Video Editor intake
  rencana perakitan: sudah terwujud konkret untuk jalur Story Board lewat
  v163 (veSetPlan, vsSetScript, caption video), tapi status resmi v160 tetap
  blocked — jangan anggap selesai tanpa vonis yang menyatakan butir (2)(3)
  tertutup oleh v163.

### 2.2 v173 — batas slide carousel [BLOCKED]

- Widget `widget-9fffd56e-6274-4846-af65-53fbd6f57a87` (1 Nov ~23:00),
  BELUM dijawab. Referensi @marketingharry 11 slide vs maks app 10.
- Opsi yang ditawarkan: (a) "Maks 12 slide, struktur utuh" atau
  (b) "Tetap 10 slide, pangkas 1 beat". Jangan di-nag berulang; jangan
  dibangun sebelum vonis.

### 2.3 v174 — struktur storyboard di app [DIPERINTAHKAN, ANTRE]

- DIPERINTAHKAN Patria 2 Nov 22:13 ("lakukan"); nomor v174 reserved.
- ANTRE sesudah v202 (urutan: v201 selesai → v202 → v174), masing-masing
  gerbang + deploy sendiri karena menyentuh file yang sama.
- Struktur pola sudah ada di dokumen
  (`~/workspace/specs-visualisasi/struktur-prompt-storyboard.md`): 3 bagian
  (prompt engine per panel; breakdown 7 field; system lock + bible +
  STYLE LOCK + konsistensi karakter/lokasi + rasio final).
- Yang wajib saat dibangun: handoff v163 (veSetPlan / vsSetScript /
  caption) terisi otomatis.

### 2.4 Vonis billing Google [BELUM DIPILIH — menggantung paling lama]

- Pilihan yang belum dipilih: (a) aktifkan billing di proyek kunci Gemini,
  (b) kunci paid-tier lain, atau (c) tunda jalur Google (Omni, Nano Banana,
  QC Gemini).
- Dampak: TANPA billing aktif, tidak satu pun jalur ini boleh jalan:
  generate live Omni pertama (belum dicoba), akses Nano Banana live (belum
  dibuktikan; harga pencatatan $0,067/gambar 1K), dan QC Gemini sebagai
  keluarga berbeda dari Muse (saat ini QC Gemini melempar tanpa kunci di
  lingkungan rig karena rig hanya menyetel `minime.metaKey`).
- Fakta terkait: ClassAI (gateway OpenAI-compatible) TIDAK punya Omni dan
  TIDAK lebih murah dari Google langsung (klip Wan 3.0 10 dtk 1080p ≈
  $4,44–$7,40 vs Omni 1080p $1,52) — jadi bukan jalan pintas billing.

### 2.5 Wiring video Wan 3.0 via ClassAI [DIBANGUN, LIVE — uji live generate menunggu kunci]

- Widget `widget-4e267e88-c0ea-4a8f-905e-19293c199335` (2 Nov ~08:54)
  DIJAWAB Patria 2 Nov 22:09 ("lakukan") → v201.
- Pelaksanaan: modul `classai-video.ts`, opsi model 'wan', cabang UI Wan,
  kartu kunci ClassAI, spend terpisah + kartu Billing, i18n +6/bahasa,
  rig-video §v201 (10 cek). Kode `3b5bb68 ↔ 69be4d8`, log `0a442cd ↔
  63b1e77`, log-LIVE `1f78043 ↔ 75c7e29`; deploy MH_BUILD201_OK 2 Nov
  ~22:32; HEAD MacBook 63b1e77; PID 66435; md5 dist lokal == MacBook;
  penanda `router.classai.id` (2x) + `wan-3.0` di bundle JS MacBook.
  App live = v201.
- Posisi jujur (tetap): Wan 3.0 1080p 10 detik = $4,62 vs Omni 1080p
  $1,52 — Wan BUKAN jalan pintas biaya; nilainya = mesin alternatif
  tanpa billing Google; Omni tetap utama.
- Yang BELUM: generate live Wan pertama — BUTUH kunci ClassAI Patria di
  app (diinput sendiri lewat Settings, bukan lewat chat). Sampai audit
  ini ditutup, belum ada kunci ClassAI yang tercatat, jadi wiring + rig
  lolos, live generate menunggu kunci.

### 2.6 Template pola sinematik ke panel video [DIPERINTAHKAN sebagai v202, ANTRE]

- DIPERINTAHKAN Patria 2 Nov 22:12 ("Lakukan") sebagai v202; antre
  sesudah v201 (belum dikerjakan).
- Pola prompt video/reels SINEMATIK sudah didokumentasikan (reverse
  engineering 2 Nov 01:02: 28,3 dtk, 720×1280 9:16, 30fps, 10 beat ±2,8
  dtk, kartu judul 4 dtk + 9 beat alam + fade to black, kamera lambat,
  dissolve/blur-wipe, grade golden-hour, tanpa manusia/teks selain kartu
  judul).
- Batas jujur (tetap): teks di atas footage belum bisa burn-in di app
  (FFmpeg tanpa drawtext/libass; track Teks ve2 tidak ikut render) →
  kartu judul = klip teks mandiri HyperFrames.

### 2.7 Konfirmasi live — status v2 (sesudah konfirmasi 22:10–22:11 + vonis 4 Nov)

Vonis 4 Nov (Patria 2 Nov 22:12): bila sampai 4 Nov tidak ada perubahan,
item bertanda "MASUK VONIS 4 NOV" dianggap SUDAH secara teknis, namun
BELUM uji live.

| # | Item | Sejak | Status v2 |
|---|------|-------|--------|
| 1 | Playhead segaris bar v196 | 2 Nov 18:56 | ✓ TERKONFIRMASI LIVE 22:10 |
| 2 | Play pratinjau v197 (▶ besar monitor → playhead bergerak) | 2 Nov 21:23 | ✓ TERKONFIRMASI LIVE 22:10 |
| 3 | Pause pratinjau v198 (pause monitor → playhead membeku) | 2 Nov 21:32 | ✓ TERKONFIRMASI LIVE 22:10 |
| 4 | Generate HTML live pertama v185 | 2 Nov 11:00 | ✓ FUNGSI OK 22:11; ✗ KUALITAS belum memuaskan (rincian menunggu jawaban Patria) |
| 5 | Generate live Omni pertama (butuh vonis billing §2.4) | 2 Nov 02:47 | MASUK VONIS 4 NOV |
| 6 | Dialog pemilih file v183 (ketukan live) | 2 Nov 08:42 | ✓ TERKONFIRMASI LIVE 22:11 |
| 7 | Render HyperFrames live pertama dari deskripsi | 2 Nov 00:52 | ✓ FUNGSI OK 22:11; ✗ KUALITAS belum memuaskan (sama dengan #4) |
| 8 | Scrollbar kolom Brand v177 (bukti visual) | 2 Nov 02:00 | MASUK VONIS 4 NOV |
| 9 | Garis Graph v157 (konfirmasi visual) | 1 Nov 13:41 | MASUK VONIS 4 NOV |
| 10 | Generate ulang storyboard v165 (konsistensi gaya) | 1 Nov 16:33 | MASUK VONIS 4 NOV |
| 11 | Uji live tombol Impor v166 | 1 Nov 16:53 | MASUK VONIS 4 NOV |
| 12 | Grounding v155, Brain live v152, gate v161, auto-brief v162 (penilaian live) | 31 Okt–1 Nov | MENGGANTUNG (di luar vonis 4 Nov) |
| 13 | Prefill caption Planner v163 + round-trip Canva live | 1 Nov 15:56 | MASUK VONIS 4 NOV |
| 14 | Akses Nano Banana live (butuh vonis billing §2.4) | 1 Nov 17:25 | BELUM DIBUKTIKAN |
| 15 | Tambah ulang drinksaints (probe lolos sejak v194) + berkas HF hf-1793593163508/out.mp4 | 2 Nov 18:33 | ✓ TERKONFIRMASI LIVE 22:11 |
| 16 | Seret grip cap durasi + snap magnet v195 | 2 Nov 18:38 | ✓ TERKONFIRMASI LIVE 22:10 |
| 17 | Bar editor track v191, × aset v189, pratinjau 9:16 + Inspector tombol v193 | 2 Nov | ✓ TERKONFIRMASI LIVE 22:10 |
| 18 | (BARU) Generate live Wan pertama (v201) | 2 Nov 22:32 | BELUM DICOBA — butuh kunci ClassAI Patria di app |
| 19 | (BARU) Rincian ketidakpuasan hasil v185/HF | 2 Nov 22:11 | MENUNGGU JAWABAN Patria (ditanyakan 22:15) |

### 2.8 Keputusan lain yang masih tertunda (ringkas, status v2)

- v160 (scope editor) — widget 31 Okt belum dijawab; v173 (batas slide
  carousel) — widget 1 Nov belum dijawab; vonis billing Google — belum
  dipilih; GTemplate (null) + GBatch (false) — lihat §2.9 (bukan error).
- Antre bangun (sudah diperintahkan, belum dikerjakan): v202 (template
  sinematik) sesudah v201; v174 (storyboard) sesudah v202.
- Menunggu kunci/data dari Patria: kunci ClassAI (syarat uji live Wan);
  rincian ketidakpuasan hasil v185/HF; nama/komposisi tim submission;
  brand uji final.
- Menunggu vonis/keputusan lain: perluasan pemicu alur brief kreatif +
  fan-out Kreatif interaktif; spec movie edukasi/komedi; scope
  Publish/Permissions/Folders/Tables; isi file lampiran chat; klik +
  tengah Graph menjalankan alur; upgrade VoiceStudio v0.5.7; penautan
  kartu + Spend Limit Meta; backup/tracking ledger di git; pembersihan
  ikon untracked MacBook; penghapusan PENUH fungsi setup VoiceStudio;
  triase C-B1 v66; LinkedIn Page sebagai kanal terpisah; TikTok Business
  sebagai varian; Settings per-kanal Postiz + tag + komentar pertama;
  Node upgrade untuk REA; penyambungan transkrip Voice Editor ke caption
  ASS; detail klik-2x kartu ARSIP Library; boleh-tidaknya memilih ulang
  rekomendasi v132; ketatnya v154 untuk pertanyaan brief (cbAsk);
  menyimpan riwayat revisi mode gate v161; auto-brief v162 untuk fan-out +
  Script/Voice/Video Editor (Script tetap approve dua-ketuk; Voice/Video
  jalur chat menunggu v160); referensi gambar untuk generate GAMBAR Meta;
  auto-toggle "Tanpa teks" v171; engine gambar internal.
- Jadwal: Fase 5 BELUM dimulai; video demo final 3 Nov; submit sebelum
  5 Nov 09:00 WIB (butuh kata "lanjut" dari Patria).

### 2.9 GTemplate/GBatch — BUKAN error (kunci pengaman by design)

- Fakta (disampaikan ke Patria 2 Nov 22:15): GTemplate = template pesan
  Outreach (GTemplate-v1) dari Fase 4; status null = belum ada
  persetujuan tercatat, karena persetujuan HANYA boleh dari Patria dan
  modulnya dilarang mengarang persetujuan sendiri — test menegaskan
  `gtemplateApproval` harus null (`src/tests/run-tests.ts:196`).
- GBatch = gerbang di policy server (`src/policy.ts`: Gate = 'GS' |
  'GSTP' | 'GKonten' | 'GBatch') yang mengizinkan pengiriman batch;
  false = terkunci; batch hanya draf; di modul Fase 4 memang tidak ada
  jalur kirim sama sekali, by construction (test: `run-tests.ts:197`).
- Efek praktis: 6 draf Outreach dari Fase 4 (12 lead → 10 deduped) tetap
  draf; tidak ada yang terkirim; satu-satunya "kirim" adalah klik manual
  tautan wa.me.
- Berbeda dengan GSTP Fase 1 dan GKonten Fase 2 yang file approval-nya
  ada; untuk GTemplate/GBatch memang tidak ada file approval.
- Nuansa: gerbang ini hidup di runner Node (root `src/`), bukan di UI
  app Tauri — app tidak menegakkan gerbang dalam kode (audit v66) — jadi
  null/false ini tidak memblokir apa pun di UI app hari ini.
- Yang ditunggu: keputusan Patria BILA suatu hari mau menyetujui template
  dan membuka batch — belum pernah diperintahkan, sejalan dengan aturan
  draft-only tanpa live outreach.

## 3. CEK KONSISTENSI LOGIC (klaim log vs kode nyata)

### 3.1 TEMUAN-1 — Label "Veo 3.1" untuk spend Omni [INKONSISTENSI NYATA, user-facing]

- **Bukti:**
  - `app/src/App.svelte:1485` — kartu Billing video: `<div><b>Veo 3.1</b>
    <span …>Google</span></div>` untuk baris `videoSpend`.
  - `app/src/App.svelte:1258` — nota tab Video memakai kunci yang sama:
    `{t('vg.spend', …)}` untuk `videoSpend`.
  - `app/src/lib/i18n.ts:727 / 1843 / 2959` — `vg.spend` = 'Video Veo ·
    {n} klip' / 'Veo videos · {n} clips' / 'Veo 视频 · {n} 个片段'.
  - `app/src/lib/omni-gen.ts:28,138,149–164` — satu-satunya penulis
    `videoSpend` adalah `omniGenerateClip` → `addVideoSpend`, dengan
    `OMNI_MODEL = 'gemini-omni-1.1-flash'`. Tidak ada penulis lain.
  - `app/src/lib/video-gen.ts` — TIDAK ADA (dihapus total di v181).
- **Vonis:** label salah. Video yang dihitung di `videoSpend` adalah output
  Gemini Omni, bukan Veo. Sejak migrasi v181, setiap video yang digenerate
  lewat app akan tampil di Billing sebagai "Veo 3.1" — menyesatkan karena
  Veo 3.1-fast sudah dimatikan Google 22 Okt 2026 dan tidak pernah sukses
  di app. Perbaikan yang benar: ganti label kartu + kunci `vg.spend` menjadi
  "Gemini Omni" (3 bahasa), tanpa mengubah satu pun angka/spend.
  **Catatan pemisah:** komentar `App.svelte:732` ("mode input generator Veo
  (desain Veo 3.1)") BUKAN temuan — itu merujuk gaya desain panel v178
  yang memang meniru Veo 3.1, bukan klaim mesin. Yang salah hanya label
  spend.
- **Tingkat:** kosmetik tapi user-facing (muncul di Billing, layar yang
  Patria screenshot 2 Nov 21:44). Perlu vonis parent sebelum diubah (audit
  ini read-only).

- **Bukti baru v2:** kartu Wan v201 berlabel benar ("Wan 3.0" / "ClassAI",
  kunci `vg.wan.spend`) — pola pelabelan yang benar sudah dipakai di kartu
  baru, sehingga kartu lama yang masih "Veo 3.1" makin kontras salahnya.
  v201 TIDAK menyentuh `vg.spend` maupun kartu video lama (diff i18n v201
  hanya +18 baris kunci baru); temuan ini tetap terbuka dan tetap butuh
  vonis Patria.

### 3.2 TEMUAN-2 — Sisa-sisa teks Veo yang sudah yatim / basi

- **Kunci i18n yatim (0 referensi di luar `i18n.ts`):**
  `vg2.veo31` ('Veo 3.1'), `vg2.audio` ('Audio dibuat otomatis bersama video
  (audio native Veo …)'), `vg2.model.veo` ('Veo 3.1 — API') — ketiganya
  peninggalan opsi model v178 yang digantikan omni/hyperframes di v179
  (pembanding hidup: `vg2.model.omni` dan `vg2.model.hf` masing-masing
  1 referensi di `App.svelte:1224`). Keluarga `vg2.*` sendiri masih hidup
  (75 kunci di i18n, 10 referensi di App.svelte) — hanya subset Veo-nya
  yang yatim.
- **Teks perbandingan basi:** `img.provider.note` (i18n.ts:123 / 1239 / 2355)
  masih menulis "Google butuh kunci Gemini dengan billing aktif (sama
  seperti Veo)" — perbandingan dengan produk yang sudah pensiun dan tidak
  pernah jalan di app. Isi instruksinya (billing aktif) tetap benar;
  rujukannya basi.
- **Komentar kode (tidak user-facing, dibiarkan):** `image-api.ts:91,119`
  dan `omni-gen.ts:2,16` menyebut Veo sebagai konteks historis — bukan
  temuan.
- **Vonis:** kandidat pembersihan, BUKAN pelanggaran berat. Aturan berdiri
  menyebut kunci yatim yang SUDAH ada sebelum versi berjalan DIBIARKAN
  (preseden `ve2.asset_empty` sejak v183) — jadi penghapusan ketiga kunci
  ini butuh keputusan eksplisit, bukan aksi otomatis audit.

- **Verifikasi ulang v2:** ketiga kunci masih 0 referensi di luar
  `i18n.ts` (grep ulang atas tree v201). v201 menambah 0 kunci yatim
  baru: keenam kunci barunya masing-masing punya 1–2 referensi di
  `App.svelte` (`vg.wan.spend` 2x: cabang Wan + kartu Billing; sisanya 1x).

### 3.3 Campaign v199 — KONSISTEN dengan perintah "sementara"

- Perintah Patria 2 Nov 21:38: menu Campaign (di bawah Planner, di atas
  Billing) disembunyikan dulu sebelum sempat diperbaiki.
- Pelaksanaan terverifikasi: blok v199 di `app/src/layout-scroll.css`
  (baris 766 dst) hanya menyembunyikan tombol rail
  (`.sidebar button[data-view="campaign"] { display: none; }`); view
  `#view-campaign` (`App.svelte:1426`) + 4 tab (`1429–1432`) + impor
  `campaignTab`/`renderCampaign` (`App.svelte:3`) + pemanggilan render
  tetap utuh; tidak ada jalur lain menuju Campaign selain tombol rail itu
  (satu-satunya `showView('campaign')` lain adalah rig-audit programatik,
  yang tetap lolos). Mengembalikan = hapus blok v199 saja.
- **Vonis:** konsisten. Satu-satunya yang belum ada adalah scope perbaikan
  Campaign itu sendiri (§2, §1.11) — bukan inkonsistensi kode.

### 3.4 State ve2 — KONSISTEN dengan log

- **Snap default AKTIF:** `App.svelte:113`
  `let ve2Snap = $state(ve2Loaded?.snap ?? true)` — sesuai log v195.
- **Cap durasi:** `App.svelte:246` (Inspector: `dur` dicap `ve2OrigDur`),
  `App.svelte:497–506` (`ve2OrigDur`: Teks → null; Image → null; aset
  duration>0 → cap; sisanya null = bebas), `App.svelte:540` (geser durasi
  ikut cap). Sesuai log v195.
- **Floor timecode:** `App.svelte:216–219` (`ve2Fmt` memakai `Math.floor`
  ganda) — 9,5 dtk tampil "00:09", sesuai konvensi yang dicatat v195/v196.
  JANGAN diubah ke round tanpa vonis.
- **Skala minimal:** `App.svelte:189`
  `ve2Total = $derived(Math.max(30, …))` — sesuai log v195.
- **Koordinat 78px:** `App.svelte:1358` (label penggaris
  `calc(78px + …%)`) + pemetaan pointer −78 di `ve2RulerClick` /
  `ve2StartFromClientX` / `ve2DropAsset` (v196) — sesuai pelajaran (67).
- **Vonis:** tidak ada penyimpangan state ve2 dari log.

### 3.5 Aturan berdiri — dipegang, kecuali label Veo (§3.1)

| Aturan | Bukti kode | Vonis |
|---|---|---|
| Pola wajib image/carousel/storyboard, satu jalur per permintaan | `image-flow.ts:56–62` urutan kirim v171; `image-flow.ts:296,309` STYLE LOCK; carousel v173 + storyboard v174 BELUM dibangun (menunggu vonis, bukan dilanggar) | DIPEGANG |
| Caption 3 jalur, tidak dicampur | `caption-tracks.ts:8,15,20,26` (3 prompt builder); `script-editor.ts:437,462` seCaption artikel/video; `image-flow.ts:442` sosmedCaptionPrompt; `script-editor.ts:202` socSetCaption | DIPEGANG |
| Planner draft-only; autopost hanya batch terjadwal + persetujuan awal batch | `social.js:1396–1397` (tombol Draft vs Queued terpisah); `social.js:1427` (scheduler hanya menerbitkan 'queued' yang waktunya tiba); FB profil `can:false` | DIPEGANG |
| QC gate + kurasi kuat | `chat.ts:344,400,405,432,575` (gatedAgentAnswer, parseQcVerdict, loop maks 3 versi) | DIPEGANG |
| i18n 3 bahasa, 0 duplikat | Hitungan audit §6.6 v2: 1116/1116/1116, dup 0 | DIPEGANG |
| app.css verbatim | Terakhir disentuh commit v93 (30 Okt); v94–v200 tidak menyentuhnya (cek `git log -- app/src/app.css`) | DIPEGANG |
| Project user tidak hilang otomatis | Tidak ada penghapus otomatis project di kode yang diaudit; penghapusan hanya via perintah eksplisit (dialog konfirmasi v129, hapus folder dua ketuk v125) | DIPEGANG |
| Kredensial tidak di repo/log | Scan gerbang lolos (§6.5); audit ini tidak membaca/mencetak nilai kunci apa pun | DIPEGANG |
| Badge "Terhubung" hanya dari uji live valid | IG terhubung 31 Okt 09:27 via uji live; Ollama terverifikasi 1 Nov 12:20 | DIPEGANG |
| Label mesin video | §3.1 — spend Omni berlabel "Veo 3.1" | DILANGGAR (label) |
| Wan = alternatif tanpa billing Google; Omni tetap utama | `classai-video.ts` header + nota v201; kartu Wan berlabel benar; spend terpisah | DIPEGANG |
| AGPL hard stop untuk bundling | VoiceStudio tetap proses eksternal via API, tidak dibundel; HyperFrames CLI eksternal, tidak diklaim karya event | DIPEGANG |

---

### 3.6 v201 — cek logic khusus (kontrak, harga, state)

- **Kontrak vs docs resmi ClassAI:** POST body `{model: 'wan-3.0',
  prompt, aspect_ratio, resolution, seconds}` ✓; poll GET
  `/v1/videos/{id}` ✓; unduh dari field `url` atau GET
  `/v1/videos/{id}/content` ✓; auth `Authorization: Bearer` ✓. Semua
  dicocokkan dengan docs `router.classai.id/docs` (dibaca 2 Nov) dan
  dengan 10 cek rig-video §v201.
- **Matematika harga (diverifikasi, bukan dikutip):** 1 miliar kredit =
  $12,48. 720p 10 detik = 18,5 jt × 10 = 185 jt kredit → $2,3088 →
  **$2,31** (cocok dengan rig + status app). 1080p 10 detik = 37 jt × 10
  = 370 jt → $4,6176 → **$4,62** (cocok dengan nota v201). Minimum 33,3
  jt → $0,4156 → **$0,42** (cocok dengan docs: minimum $0,416).
- **State terakhir TERPISAH (benar):** `vgWanLastPath`/`vgWanLastDur` vs
  `vgLastPath`/`vgLastDur` — tombol Tambah Wan tidak pernah menambahkan
  klip Omni dan sebaliknya. Pemisahan ini disengaja dan diverifikasi di
  kode (`App.svelte`: state Wan 726–729, set sesudah generate, pakai
  saat tambah timeline).
- **State bersama (disengaja, bukan bug):** `vgPrompt`/`vgAspect`/
  `vgBusy`/`vgStatus` dipakai bersama cabang Omni dan Wan (hanya satu
  cabang yang ter-render dalam satu waktu). Prompt yang sama bisa dipakai
  ulang lintas mesin — itu guna, bukan cacat. Status terakhir ikut
  terbawa saat pindah cabang — kosmetik, bukan salah data.
- **Resolusi terpisah (benar):** `vgWanRes` (480p/720p/1080p) vs `vgRes`
  (360p/720p/1080p/4k) — benar karena himpunan resolusi Wan berbeda dari
  Omni; memakai satu select bersama justru akan menawarkan opsi yang
  tidak didukung Wan.
- **Basis tagihan (disengaja, didokumentasikan):** tagihan mengikuti detik
  YANG DIMINTA (kontrak per detik), sementara durasi aset/klip mengikuti
  durasi hasil probe. Bila probe menyimpang sedikit dari permintaan,
  spend dan durasi klip bisa berbeda tipis — itu konsekuensi kontrak,
  bukan inkonsistensi; header modul mencatatnya eksplisit.
- **Asumsi kecil (jujur):** status terminal yang melempar error adalah
  'failed'/'cancelled'/'expired' — 'failed' tersirat dari docs (kredit
  hanya ditagih bila video jadi); 'cancelled'/'expired' adalah tebakan
  standar. Status tak dikenal TIDAK dilempar — terus dipoll sampai
  timeout 10 menit (default aman, bukan kegagalan palsu).
- **Folder simpan (dicatat, bukan bug):** `video_save` menulis ke
  `~/Movies/minime-veo/` yang sama dengan Omni; berkas Wan dibedakan
  lewat nama (`wan-<ts>.mp4` vs `omni-<ts>.mp4`). Konsisten dengan rig
  (path `wan-uji.mp4`).
- **Vonis:** KONSISTEN. v201 tidak menambah inkonsistensi user-facing
  baru; satu-satunya inkonsistensi yang tersisa tetap §3.1 (label Veo).

## 4. CEK KONSISTENSI CODE + FUNGSI TUMPANG TINDIH

Metode: grep definisi (`function …(`) di `v5logic.js` dan `App.svelte` untuk
duplikat nama (hasil: NOL duplikat di kedua file); grep hitungan referensi
(definisi + pemakaian) untuk tiap kandidat; baca badan fungsi pasangan yang
mirip. **Tidak ada kode yang diubah dalam audit ini.**

### 4.1 Vonis: TUMPANG TINDIH NYATA — tidak ditemukan

Tidak ada dua fungsi berbeda nama yang mengerjakan pekerjaan yang sama
dengan hasil yang sama. Semua pasangan mirip di bawah terbukti beda
tanggung jawab atau beda lapisan.

Kode baru v201 juga lolos vonis ini: pasangan Wan/Omni dianalisis di
§4.3; tidak ada dua fungsi berbeda nama yang mengerjakan pekerjaan yang
sama dengan hasil yang sama.

### 4.2 Vonis: DEAD CODE — 1 fungsi

- **`ve2ClipKind` — `app/src/App.svelte:489–496` — DEAD CODE.**
  Didefinisikan sekali, dipanggil NOL kali (grep seluruh `src/` hanya
  menemukan baris definisinya). Fungsinya (track → 'Video'/'Audio'/'Image'/
  'Teks' via aset + ekstensi) sudah diimplementasikan inline di dua tempat
  lain: derivasi `ve2PreviewKind` (`App.svelte:196`, memakai `ve2IsImage` /
  `ve2IsAudio` / fallback 'video') dan logika `ve2OrigDur` (`497–506`).
  Kandidat hapus — butuh vonis parent (audit read-only; penghapusan fungsi
  tanpa vonis dilarang oleh pola kerja audit ini).

- **v201 menambah 0 dead code.** Semua fungsi/ekspor baru terpakai:
  `wanGenerateClip`, `wanPriceUsd`, `wanPriceCredits`,
  `readClassaiSpend`, `addClassaiSpend` (dipakai internal/modul),
  `vgWanGenerate`, `vgWanAddToTimeline`, cabang `connectKey('classai')`.
  `ve2ClipKind` tetap satu-satunya dead code (masih 1 hit: definisi
  saja).

### 4.3 Vonis: MIRIP TAPI BEDA TANGGUNG JAWAB (bukan tumpang tindih)

| Pasangan | File | Bukti beda tanggung jawab |
|---|---|---|
| `ve2EnsureAsset` (329) vs `ve2PushAsset` (304) vs `ve2AddAssetFiles` (334) vs `ve2AddAsset` (355) | App.svelte | Ensure = tambah langsung tanpa probe + dedup by src (dipakai hfAddToTimeline/vgAddToTimeline/backfill); Push = probe dulu baru tambah + fallback gambar 5 dtk (dipakai tambah manual + dialog file); AddAssetFiles = picker dialog multi → Push per berkas; AddAsset = input ketikan → Push, atau buka dialog sumber bila path kosong. Berlapis, bukan duplikat. |
| `ve2PlayToggle` vs `ve2PreviewPlay` (v197) vs `ve2VideoPaused` (v198) | App.svelte | Toggle = transport; PreviewPlay = tombol ▶ bawaan monitor IDLE → alihkan ke transport; VideoPaused = tombol pause bawaan monitor PLAYING → hentikan timeline (syarat ganda). Tiga pemicu berbeda, satu mesin playback — pelengkap, bukan duplikat (pelajaran 68). |
| `agentDeactivate` (v5logic:486) vs `agentGraphDeact` (478) | v5logic.js | Deactivate = nonaktifkan anggota project (status + hapus node project itu); GraphDeact = nonaktifkan node graph-only (hapus node + edge + popup). Konteks berbeda; keduanya hidup (masing-masing 2 hitungan: definisi + pemakaian). |
| `seCaption` vs `socSetCaption` | script-editor.ts / social.js | seCaption = GENERATE caption via router (artikel/video); socSetCaption = SET caption pending komposer Planner. Lapisan berbeda. |
| `hfGenPrompt` vs `hfExtractHtml` vs `hfGenerateHtml` | hf-gen.ts | Tahap pipeline: bangun prompt → ekstrak HTML dari jawaban → panggil router + catat biaya. Bukan duplikat. |
| `omniGenerateClip` vs perintah Rust `video_save`/`video_probe` | omni-gen.ts / video.rs | Lapisan berbeda: Omni = panggil API + simpan + catat spend; Rust = tulis berkas + probe durasi. |
| `readImgSpend`/`addImgSpend` vs `readVideoSpend`/`addVideoSpend` | image-api.ts / omni-gen.ts | Pola paralel, store berbeda (`minime.imgSpend` vs `minime.videoSpend`). Duplikasi POLA, bukan fungsi — unifikasi dimungkinkan tapi tidak wajib (lihat §4.4). |
| `validateSequence` / `assFromCaptions` / `compileTimeline` | video.ts | Tiga tahap murni berbeda: validasi → ASS sidecar → rakitan FFmpeg. |
| `parseStoryboardShots` / `storyboardPrompt` / `sentPrompt` / `approveDraft` | image-flow.ts | Parse → prompt per frame → kirim → setujui. Tahap berbeda. |
| `kbTaskStart` / `kbTaskMove` / `kbUpdateTaskOut` | v5logic.js | Buat kartu → pindah kolom → update output. Tahap berbeda. |
| `graphEnsureAgentNode` / `graphEnsureEdge` / `graphBuildProject` | v5logic.js | Node → edge → bangun project. Tahap berbeda. |
| `fmtUsd` / `fmtIdr` / `fmtIdrNum` / `fmtInt` | cost.ts | Format berbeda: CostRow→USD, CostRow→IDR, number→IDR, number→ribuan. Keluarga format, bukan duplikat. |
| `postChat` vs `postKreatifAsk` | v5logic.js / creative-brief.ts | Pesan biasa vs pertanyaan langkah alur brief (flag cbAsk). Saluran berbeda. |
| `wanGenerateClip` vs `omniGenerateClip` | classai-video.ts / omni-gen.ts | Pola lapisan sama (API → simpan → probe → spend), mesin + kontrak beda total (task + polling ClassAI vs satu panggilan sinkron Omni). Paralel, bukan duplikat. |
| `readClassaiSpend`/`addClassaiSpend` vs `readVideoSpend`/`addVideoSpend` | classai-video.ts / omni-gen.ts | Pola paralel, store berbeda (`minime.classaiSpend` vs `minime.videoSpend`). Kini 3 pasang dengan imgSpend (lihat §4.4). |
| `vgWanGenerate`/`vgWanAddToTimeline` vs `vgGenerate`/`vgAddToTimeline` | App.svelte | Handler cabang model berbeda; state terakhir TERPISAH (`vgWanLastPath`/`vgWanLastDur` vs `vgLastPath`/`vgLastDur`) sehingga tombol Wan tidak pernah menambahkan klip Omni. Sengaja dipisah, bukan duplikat. |
| Cabang `connectKey('classai')` vs `connectKey('gemini'/'meta')` | chat.ts | Satu fungsi, cabang baru: uji kunci via GET /v1/models (tanpa memakan kredit) vs panggilan model minimal. Bukan fungsi baru, bukan duplikat. |
| `b64FromBytes` (dipakai ulang) | omni-gen.ts → classai-video.ts | Wan mengimpor helper dari omni-gen, TIDAK menduplikasi konversi byte→base64. Contoh baik yang tidak menambah duplikasi mini. |

### 4.4 Vonis: DUPLIKASI MINI / RISIKO PENAMAAN (bukan tumpang tindih fungsional)

1. **Pola ikon 3 baris terduplikasi** di `ve2EnsureAsset` dan `ve2PushAsset`
   (`kind === 'Image' ? '🖼️' : …` — baris yang sama persis di kedua badan).
   Dampak: nol (tampilan konsisten); kandidat ekstraksi ke helper kecil
   bila parent menghendaki — bukan prioritas.
2. **Penghapusan node graph tidak diekstraksi** — `agentDeactivate` dan
   `agentGraphDeact` masing-masing menghapus node graph dengan loop sendiri
   (konteks filter berbeda: per-project vs graph-only). Dampak: nol saat
   ini; bila logika hapus berubah, dua tempat harus diubah.
3. **Risiko penamaan `ve2ToEnd` vs `ve2End`** (App.svelte) — SEMANTIK
   BERBEDA, nama mirip: `ve2ToEnd` = tombol ⏭ yang menyetel playhead =
   `ve2Total` (BUKAN ujung klip); `ve2End` = ujung klip terakhir (dipakai
   penghentian playback). Keduanya hidup (masing-masing definisi +
   1 pemakaian). Risiko: pembaca/pengubah baru mudah salah sangka. Bukan
   bug; kandidat rename `ve2ToEnd` → `ve2ToTotal` bila parent setuju.
4. **Pola spend paralel** (§4.3, baris img/video/classai) — tiga pasang
   read/add dengan badan hampir sama, store berbeda. Unifikasi ke satu
   helper generik dimungkinkan (hemat ~30 baris) tapi mengubah tiga jalur
   yang sudah lolos gerbang — tidak direkomendasikan tanpa alasan kuat.

### 4.5 Vonis: INERT / SUDAH BERSIH (bukan dead code)

- **Dihapus dan TERBUKTI hilang (0 hit di seluruh `src/`):**
  `ve2MoveClip`, `ve2TimelineDrop` (v192), `hf.note` (v180), `ve.canvas`
  (v186), `ve2.drag_hint` (v190), `vg.billing_note` (v169).
- **`ve2IsDummy` (App.svelte:107–121) — HIDUP, bukan dead code:** guard
  migrasi satu kali v146 (6 referensi, semua di jalur muat state: deteksi
  dummy → state kosong → simpan ulang). Selama ada pengguna lama dengan
  state dummy pra-v146, guard ini masih bertugas.
- **`minime.agentGroups` (v5logic.js:1084, 2510, 2518) — HIDUP:**
  persistensi lipatan grup (collapsedGroups). Kekhawatiran "pid usang"
  dari sesi lalu tidak bisa dibuktikan dari kode saja (butuh data live);
  kodenya membaca/menulis dengan try/catch, jadi pid usang tidak melempar
  error — dampaknya tampilan, bukan crash.
- **Tidak ada duplikat definisi fungsi** di `v5logic.js` maupun `App.svelte`
  (cek `sort | uniq -c`, nol nama muncul >1 kali sebagai definisi).

---

## 5. PERFORMA — menjaga compact namun powerful

### 5.1 Ukuran bundle (dist v201, diukur audit ini)

- Total `app/dist`: **972K** (v200: 964K — naik 8K).
- JS: `index-DTedqan7.js` = **625.080 byte** (v200: 616.239 — naik 8.841
  byte, +1,4%, untuk satu mesin video baru utuh).
- CSS: `index-CIN3PxBc.css` = **60.473 byte** — IDENTIK dengan v200 (nama
  berkas sama; v201 tidak menambah CSS sama sekali).
- Verifikasi: dist memuat marker v201 (`vg-wan-prompt`, `wan-3.0`) — dist
  memang build v201, bukan build basi. md5 dist JS
  `f4eaaa7c1d203efa732575f3f97cb30a` + CSS
  `13647ae902959d218a44d9b61a232fb3` lokal == MacBook (verifikasi
  deploy v201).
- Penilaian: tetap ringkas untuk app Tauri + Svelte sebesar ini (14 rig,
  4 tab Media Studio, editor video lengkap, 1116 kunci i18n × 3 bahasa,
  kini 3 mesin video). Tidak ada dependensi baru sejak v183
  (plugin-dialog); tidak ada artefak duplikat di dist.

### 5.2 Pola render berat — yang sudah dijaga

- **Thumbnail aset ter-cache** (`App.svelte:137,149,158,162,171`):
  `ve2Thumbs[a.id]` dilewati bila sudah ada; ada set `ve2ThumbFailed` dan
  `ve2ThumbLoading` sehingga thumbnail gagal/berjalan tidak diminta ulang;
  entri yang tidak terlihat lagi di-prune. Thumbnail TIDAK diregenerasi
  tiap render.
- **$effect pratinjau berguard** (`App.svelte:196–214`): early return bila
  tidak ada klip/src; flag `live` + cleanup mencegah balapan saat seleksi
  berpindah cepat; state gagal eksplisit (`ve2PreviewFail`/`ve2PreviewErr`).
- **Cache playback b64 maks 3** (`ve2B64Cache`, dibersihkan di
  `ve2StopPlayback`) — video besar tidak menumpuk di memori.
- **Cap baca video 20 MB** (`video_read`) — pratinjau tidak pernah menarik
  berkas raksasa utuh.
- **Grid Billing responsif** (`repeat(auto-fill, minmax(280px, 1fr))`) —
  1 kolom di sempit, 2–3 kolom di lebar, tanpa JS.
- **Tidak ada polling liar:** scheduler Planner 30 dtk hanya saat app
  terbuka; interval playback 100 ms hanya saat bermain dan dibersihkan
  di stop.

- **Polling Wan hanya saat generate** (`classai-video.ts`): interval 10
  detik, berhenti di completed/failed/timeout 10 menit; tidak ada
  polling liar di luar generate. Scheduler Planner 30 dtk dan interval
  playback 100 ms tetap seperti v1.

### 5.3 Rekomendasi konkret (diurutkan dari termurah ke termahal)

1. **Pindahkan 3 ikon rail base64 ke `public/`** (hemat ~8KB + keterbacaan):
   `App.svelte:958` (graph, 3.268 karakter), `:959` (library, 2.436),
   `:961` (planner, 2.400) masih inline base64, sementara 5 ikon rail lain
   (chat, kanban, media, campaign, settings) sudah berupa berkas
   (`./chat-icon.png` dll.). Inkonsistensi ini juga membuat baris-baris
   tersebut tidak terbaca di diff. Perkiraan hemat bundle: ~8KB source
   (≈6KB setelah minifikasi/base64 → file). Risiko: rendah (ganti `src`
   ke path berkas, sama seperti 5 ikon lain).
2. **Hapus `ve2ClipKind` + 3 kunci `vg2.*` yatim bila parent memutuskan**
   (§4.2, §3.2) — hemat kecil (ratusan byte + 3 kunci × 3 bahasa), nilai
   utamanya kebersihan, bukan ukuran.
3. **Cache b64 pratinjau per src** — saat ini $effect pratinjau memanggil
   `ve2ReadB64` tiap pergantian seleksi; klik bolak-balik dua klip membaca
   ulang berkas. Cache kecil (mis. 3 entri seperti cache playback) akan
   menghilangkan baca ulang ini. Risiko: rendah; manfaat: terasa pada
   video besar (mendekati cap 20 MB).
4. **Jangan tambah dependensi tanpa vonis** — setiap dependensi baru
   menambah bundle + permukaan audit lisensi (AGPL hard stop tetap berlaku
   untuk bundling).
5. **Jaga /tmp (lihat §7)** — artefak build Rust di /tmp adalah satu-satunya
   sumber pembengkakan yang terbukti dalam audit ini (511M). Bila cargo
   check dijalankan di VM, arahkan `CARGO_TARGET_DIR` ke disk home, bukan
   /tmp.
6. **Pertahankan pola gerbang** — vite build → rig → svelte-check → root
   tsc → gate-test → scan → cargo, dengan md5 ledger + hitungan i18n, per
   versi. Pola inilah yang membuat 201 versi terkirim tanpa error lolos
   (lihat §6).

---

- **Catatan v2:** v201 TIDAK mengerjakan satu pun rekomendasi di atas
  (satu versi = satu perubahan). Kelimanya tetap terbuka dan tetap
  menunggu kata Patria (lihat §8).

## 6. SAPU ERROR — hasil jujur per cek (audit v2, dist v201 + gerbang parent)

> Aturan audit: **jangan pernah menulis "nol error" kecuali semua cek yang
> dijalankan benar-benar lolos.** Audit ini TIDAK menjalankan rig sendiri
> (read-only): hasil rig dibaca dari log parent. Satu kejujuran yang wajib
> dicatat dulu: **file log rig-settings di disk masih merekam run
> pra-perbaikan (2 gagal)** — klaim lolos rig-settings bersandar pada
> laporan parent + ekspektasi yang sudah diperbaiki di tree, bukan pada
> file log itu. Di luar catatan itu, seluruh kelompok cek di bawah lolos,
> jadi klaim yang jujur adalah: **nol error pada seluruh cek yang
> dijalankan/dilaporkan dalam audit ini**, dengan batas §6.8 (uji live
> generate Wan dan pengukuran runtime tidak termasuk).

### 6.1 Rig — 14 rig, dengan satu catatan log basi

Dijalankan oleh parent atas dist v201 (`npm run rig:<nama>`); audit ini
membaca lognya.

| Rig | Hasil | Catatan v2 |
|---|---|---|
| rig:vs | ALL PASSED | Log file. |
| rig:sherpa | ALL PASSED | Log file. |
| rig:script | ALL PASSED | Log file. |
| rig:chat | ALL PASSED | Termasuk §37 v162 auto-brief. Log file. |
| rig:image | ALL PASSED | Log file. |
| rig:brand | ALL PASSED | v177 lolos tanpa perubahan. Log file. |
| rig:batch | ALL PASSED | Log file. |
| rig:lib | ALL PASSED | Log file. |
| rig:settings | LOLOS SESUDAH PERBAIKAN (log file basi) | Log file di disk (`/tmp/rig-v201/settings.log`) merekam run pra-perbaikan: 2 FAILED — "3 kartu kunci tersisa" dan "tiap kartu kunci: input + tombol sebaris" — karena ekspektasi jumlah kartu masih 3, padahal v201 menambah kartu ClassAI menjadi 4. Itu kegagalan ekspektasi, BUKAN bug: ekspektasi diperbarui ke 4 di tree (`rig-settings.js`), dan re-run sesudah perbaikan dilaporkan lolos oleh parent. File log di disk belum diperbarui — audit ini TIDAK mengklaim lolos dari file itu. |
| rig:graph | ALL PASSED | Termasuk §26 v157 showView render. Log file. |
| rig:audit | ALL PASSED | Termasuk `showView('campaign')` programatik — bukti view Campaign tetap berfungsi di balik sembunyian v199. Log file. |
| rig:ve2 | ALL PASSED | Termasuk §27 v196, §28 v197, §29 v198. Log file. |
| rig:video | ALL PASSED | Termasuk § v184 Bersihkan + § v185 Generate HTML + §v201 Wan (10 cek: 3 opsi model, form Wan tampil + Omni/HF sembunyi, harga 720p 10 detik $2.31, tolak tanpa kunci sebelum fetch ClassAI, POST wan-3.0 + format 9:16/720p/10 detik, polling 2x sampai completed, spend $2.31, aset + klip timeline). Laporan parent (jalan di foreground parent, tanpa file log terpisah di `/tmp/rig-v201/`). |
| rig:home | ALL PASSED | Termasuk §22 v199 dan §23 v200. Log file. |

### 6.2 Svelte-check — LOLOS (baseline)

- `npm run check` → **`svelte-check found 0 errors and 21 warnings in 1 file`**
  (log `/tmp/rig-v201/svelte.log`).
- 21 warning = baseline yang sudah ditetapkan (semua pra-ada); tidak ada
  warning baru dari v201 (v201 tidak menambah elemen ber-label tanpa
  asosiasi; cabang Wan memakai `<label>` + `aria-label` pada input
  seperti pola yang sudah ada).

### 6.3 TypeScript root — LOLOS

- Gerbang parent: root build + `tsc --noEmit` → **OK**
  (`/tmp/gate-v201/root-build.log`, `root-tsc.log`).

### 6.4 Gate-test — LOLOS

- `node dist/tests/run-tests.js` → **ALL 14 GATE TEST GROUPS PASSED
  (mock-labelled where applicable)**. Termasuk grup rupiah reporting dan
  QC scoring, serta asersi GTemplate null + GBatch false (lihat §2.9).

### 6.5 Scan kredensial — LOLOS

- Scan gerbang → **SCAN OK (nol temuan)** (`/tmp/gate-v201/summary.txt`).
- False positive yang diketahui tetap tidak muncul sebagai hit: substring
  "sk-" di 'kb-ask-del', 'task-close', class CSS 'kb-task-x'/'kb-task-pop'.
- Audit ini tidak membaca/mencetak nilai kunci apa pun (hanya nama
  storage: `minime.classaiKey` dkk.).

### 6.6 i18n — LOLOS

- Hitungan kunci per seksi (`const ID/EN/ZH: Dict = {`): **ID 1116,
  EN 1116, ZH 1116, duplikat 0/0/0** (diverifikasi audit ini langsung atas
  tree v201 + gerbang parent). v201: +6 kunci/bahasa, 0 duplikat, 0 kunci
  yatim baru (keenamnya terpakai, §3.2).
- Tiga kunci yatim §3.2 tidak memengaruhi hitungan ini (kunci yatim tetap
  terhitung sebagai kunci; duplikat = kunci yang sama dua kali, bukan
  kunci tak terpakai).

### 6.7 Cargo check (Rust) — LOLOS (0 error, 0 warning)

- Gerbang parent (atas tree repo, bukan salinan scratch seperti v1):
  `cargo fmt --check`, `cargo check`, `cargo check --tests` → **ketiganya
  OK**; `Cargo.lock` bersih (tidak ada mutasi). v201 tidak menyentuh Rust
  sama sekali, jadi hasil ini adalah konfirmasi tidak ada regresi, bukan
  pengujian kode baru.
- **Catatan:** `cargo test` (eksekusi) tetap tidak dijalankan — tidak
  bisa link di VM; `cargo check --tests` adalah pengganti yang dipakai
  gerbang.

### 6.8 Yang TIDAK diperiksa dalam audit ini (jujur, bukan diklaim)

- **Generate live Wan pertama** — belum dicoba siapa pun (butuh kunci
  ClassAI Patria di app); wiring + rig lolos, live generate menunggu
  kunci.
- **Ketukan live Patria atas UI Wan** (cabang model, harga live, tombol
  Generate/Tambah) — belum ada; app live v201 sejak ~22:32, belum ada
  laporan balik.
- **Eksekusi unit test Rust di MacBook** (`cargo test` tidak bisa link di
  VM).
- **Pengukuran performa runtime di MacBook** (RAM 8 GB, WebView nyata) —
  tidak diukur; §5 hanya mengukur bundle + pola kode.
- **Re-run rig-settings dengan file log baru** — tidak dilakukan audit
  ini (read-only); klaim lolosnya bersandar pada laporan parent (lihat
  §6.1).

## 7. INSIDEN AUDIT — /tmp VM penuh (temuan lingkungan, bukan kode app)

- **Gejala:** tiga sesi cek background pertama audit ini menghasilkan log
  kosong/hilang dan satu sesi "selesai" dalam 9 milidetik tanpa benar-benar
  menjalankan apa pun (sesi svelte-check gagal karena direktori log belum
  ada — balapan `mkdir` antar sesi paralel).
- **Akar masalah (terbukti):** `df -h /tmp` menunjukkan **tmpfs 512M terisi
  100% (0 tersedia)**. Penyebab terbesar: artefak build Rust dari percobaan
  cargo check pertama audit ini (`/tmp/audit-tauri2` = 511M) — target dir
  cargo di tmpfs kecil.
- **Perbaikan:** artefak audit di /tmp dibersihkan (`/tmp/audit-tauri2`,
  `/tmp/cargo-audit2.log`, `/tmp/audit-v200`); sesudah bersih, /tmp kembali
  511M tersedia. Semua cek §6 kemudian dijalankan ulang di foreground dan
  hasilnya di atas adalah hasil ulangan yang terverifikasi — BUKAN hasil
  sesi background pertama yang rusak.
- **Pelajaran untuk gerbang berikutnya:** (a) jangan menaruh `CARGO_TARGET_DIR`
  di /tmp (tmpfs 512M); pakai disk home; (b) skrip gerbang di /tmp tetap
  boleh (kecil), tapi JANGAN menganggap file /tmp pasti bertahan antar
  sesi — pelajaran lama yang terkonfirmasi ulang oleh insiden ini;
  (c) sesi background paralel yang saling bergantung pada `mkdir` harus
  dibuat berurutan, bukan bersamaan.

---

- **Insiden baru v201 — skrip edit i18n membuang prefix file (tertangkap
  sebelum kirim).** Selama pengerjaan v201, skrip python pertama untuk
  menyisipkan kunci i18n hanya menggabungkan 3 seksi (`const ID/EN/ZH`)
  dan membuang 48 baris prefix file (header + `getLang`/`setLang`) —
  build vite gagal (`"getLang" is not exported`), terdeteksi dari pesan
  build, file dipulihkan dari git, dan kunci disisipkan ulang dengan
  prefix dipertahankan; diff akhir i18n persis +18 baris. Pelajaran
  (dicatat di log v201): skrip edit seksi i18n WAJIB menyertakan prefix
  sebelum `const ID`. Tidak ada kode rusak yang terkirim: commit v201
  memuat i18n yang benar (1116/bahasa, 0 duplikat, diverifikasi audit
  ini).
- **Tidak berulang pada gerbang v201:** /tmp tidak penuh (log gerbang
  `/tmp/gate-v201/` + log rig `/tmp/rig-v201/` lengkap, kecuali rig-video
  yang jalan di foreground parent).

## 8. PENUTUP — apa yang bisa jalan sekarang vs yang menunggu Patria

**Bisa dieksekusi agen utama tanpa vonis baru (siap, tinggal perintah):**

- ✗ Perbaiki label spend video "Veo 3.1" → "Gemini Omni" (3 bahasa) —
  temuan §3.1. Satu-satunya perubahan user-facing yang direkomendasikan
  audit ini; tidak mengubah angka/spend/logika.
- ✗ Hapus `ve2ClipKind` (dead code §4.2) — bila parent memutuskan.
- ✗ Hapus 3 kunci `vg2.*` yatim (§3.2) — bila parent memutuskan (ingat
  aturan yatim: butuh keputusan eksplisit).
- ✗ Pindahkan 3 ikon rail base64 ke `public/` (§5.3 butir 1).
- ✗ Cache b64 pratinjau per src (§5.3 butir 3).

**Sudah diperintahkan, antre bangun (bukan lagi "menunggu vonis"):**

- ✗ v202 (template pola sinematik ke panel video) — antre sesudah v201.
- ✗ v174 (struktur storyboard di app) — antre sesudah v202.

**Menunggu vonis / perintah / data dari Patria (jangan dieksekusi sebelum ada kata Patria):**

- ✗ v160 (scope editor) — widget 31 Okt belum dijawab.
- ✗ v173 (batas slide carousel) — widget 1 Nov belum dijawab.
- ✗ Vonis billing Google — aktifkan billing / kunci lain / tunda.
- ✗ Kunci ClassAI Patria di app — syarat uji live Wan (v201 sudah live,
  generate live menunggu kunci).
- ✗ Rincian ketidakpuasan hasil v185/HF — ditanyakan 22:15, belum dijawab.
- ✗ Perbaikan Campaign (alasan v199) — scope belum dispesifikasi.
- ✗ Konfirmasi live §2.7 yang tersisa — grounding v155, Brain v152, gate
  v161, auto-brief v162, Nano Banana live (di luar vonis 4 Nov).
- ✗ Vonis 4 Nov — 6 item dianggap teknis sudah bila sampai 4 Nov tidak ada
  perubahan; uji live tetap belum (lihat §2.7).
- ✗ Submit sebelum 5 Nov 09:00 WIB + video demo 3 Nov + Fase 5.

**Keadaan terakhir yang dicatat audit ini (2 Nov 2026, penutup v2):**

- App live = v201 (Wan 3.0 via ClassAI + semua v200 ke bawah). HEAD
  `0a442cd`; pasangan SHA v201: kode `3b5bb68 ↔ 69be4d8`, log `0a442cd ↔
  63b1e77`, log-LIVE `1f78043 ↔ 75c7e29`; deploy MH_BUILD201_OK ~22:32;
  PID 66435; md5 dist lokal == MacBook.
- Semua kelompok cek audit lolos (nol error, §6) dengan satu catatan
  jujur: file log rig-settings di disk masih run pra-perbaikan — klaim
  lolosnya bersandar pada laporan parent.
- Tidak ada fungsi tumpang tindih nyata (termasuk kode baru v201);
  satu-satunya inkonsistensi user-facing tetap label "Veo 3.1" untuk
  spend Omni.
- Generate live Wan pertama adalah satu-satunya kemampuan v201 yang belum
  terbukti live — dan satu-satunya penghalangnya adalah kunci ClassAI
  Patria, bukan kode.
