# Rekap Pekerjaan MiniMe-Hackathon — Audit Malam 30 Okt 2026

Vonis: **0 error lolos.** Seluruh gerbang hijau pada audit malam ini
(13 rig, 14 grup gate-test, tsc, scan kredensial, cargo fmt/check/check
--tests, ledger). Aplikasi tetap compact: bundle JS 464 KB mentah /
~150 KB gzip, CSS 39 KB, ~7.000 baris src app. Dokumen ini adalah
rekap, bukan rilis — tidak ada nomor versi baru untuk audit ini.

## A. SUDAH — selesai dan live di MacBook (HEAD 3eacfe1, PID 72413)

- Fase 0 LOLOS PENUH (vonis Patria 28 Okt): live call Meta muse-spark-1.3
  berhasil; biaya Fase 1–3 tercatat (Gemini 10.859 token, COST_TOTAL 11.577).
- Fase 1 GSTP disetujui (brand uji fiksi TEST-BRAND-001); Fase 2 GKonten
  disetujui (kalender 7 hari + 7 brief); Fase 3 (7 carousel × 3 slide,
  QC 100/100); Fase 4 selesai (12 lead fiksi → 10 deduped, 6 draf Outreach,
  rule-based, nol model call, tanpa jalur kirim).
- 11 view berfungsi: Chat, Search, Kanban, Graph, Library, Media Studio
  (Script/Image/Batch/Voice Editor/Video), Planner native (pengganti Postiz),
  Campaign (4 tab), Billing (Rupiah, peringatan >$5), Settings, New agent.
- Chat: Main chat tanpa project (v101); Alur 1 — brief → project otomatis
  + fan-out multi-agen + ack kesediaan + QC Prime + laporan lengkap +
  dokumen Library (v103); delegasi tanpa project → node Graph-only (v104).
- List agen: hanya agen AKTIF; 3 ikon ▶ ⏹ ✕ per baris project (v98) dan
  per baris Dari Graph (v99); kotak "Belum ada proyek" dihapus (v100);
  folder project collapsable ▸/▾ tersimpan (lama, terverifikasi); hapus
  folder dua-ketuk (v105→v107); rename folder input inline (v106→v107).
- Dialog native NOL: window.confirm/window.prompt terakhir dicabut di
  v107 (folder + approve Studio) — hanya tinggal di komentar kode.
- Graph: kanvas per-project, sinkron dua arah penuh dengan list (v91–v95),
  popup dblclick, kunci node, simulasi visual, pan drag workspace +
  Reset tampilan (v108), kanvas full window (v96).
- Kanban: persisten v2, mode per-project/semua, dialog edit/Approve/
  komentar/tim, drop lintas project diabaikan.
- Library: hanya 3 bulan terakhir tampil, sisanya diarsipkan (bukan hapus)
  + tombol Pulihkan; konfirmasi hapus dialog in-app.
- Media Studio: Image Meta live $0,01/gambar; Canva jalur sementara resmi;
  Batch target linkedin/facebook_page/x; Voice Editor trim + transkrip;
  Video Tier 1 live, Tier 2 ducking + caption ASS sidecar.
- Planner: Rust social.rs + scheduler 30 detik, antrean, OAuth loopback,
  refresh token ala Postiz; 8 kanal (FB profil can:false).
- Router: Meta → Gemini → Ollama (deepseek-r1:1.5b → qwen2.5:3b); kunci
  hanya via Settings per-kunci uji live; tanpa tombol Simpan bersama.
- Audit-audit sebelumnya: menu v76–v79, logic v85, duplikasi v87
  (117 kunci "tampak mati" terbukti HIDUP dinamis — JANGAN dihapus),
  performa v89, inline handler → delegasi v97 (56 handler).
- Live-test dikonfirmasi Patria: folder dua-ketuk + rename inline + wrapping
  (19:05 "Oke sudah berhasil"). v108 pan menunggu ketukan Patria.
- Aturan yang dijaga: app.css verbatim prototype v5 (CSS baru hanya di
  layout-scroll.css); i18n 3 bahasa paritas penuh; project user tidak
  pernah hilang otomatis; draft-first (tanpa kirim tanpa persetujuan).

## B. BELUM — tertunda vonis, keputusan, atau jadwal Patria

- Alur 2 (fan-out dibatasi agen aktif project + laporan progres +
  ringkasan Prime) — belum dibangun; menunggu stabilitas tes live.
- Alur 3 (buat project dari dalam Graph + jaminan sinkron node→list) —
  belum dibangun penuh; yang ada: pasang node, instruksi per node,
  sinkron ke list.
- Uji fan-out brief kopi v103 live (project otomatis + delegasi + QC +
  laporan + dokumen Library) — belum dikonfirmasi Patria.
- Persetujuan GTemplate Fase 4 (masih null); GBatch terkunci false.
- Burn-in caption video TERBLOKIR (FFmpeg MacBook tanpa subtitles/
  drawtext/libass) — butuh keputusan Patria.
- Upload arsip Library ke Google Drive — belum (tak ada OAuth Drive).
- Wiring preferensi Model per agen ke router (router chat masih rantai
  global); detail agen Publish/Permissions/Folders/Tables masih nota.
- Upgrade VoiceStudio v0.5.7; penautan kartu + konfirmasi Spend Limit Meta;
  backup/tracking ledger di git; pembersihan ikon Square*.png untracked.
- Video demo final 3 Nov (hanya pekerjaan 27 Okt–4 Nov); submission
  sebelum 5 Nov 09:00 WIB; nama/komposisi tim submission; brand uji final.
- Keputusan lain yang masih terbuka: Kanban 5 vs tepat 3 kolom; konfirmasi
  tab Campaign "Leads & CRM"; adopsi HyperFrames pasca-freeze; keyword
  delegation chat + routing produk; isi file lampiran chat.

## C. Hasil audit malam ini (30 Okt ~19:20 WIB, kode v108)

- 13 rig ALL PASSED (vs, sherpa, script, chat, image, brand, batch, lib,
  settings, home, graph, audit, ve2) — termasuk §17/§18/§20 baru.
- Gate-test 14 grup PASSED; root tsc bersih; scan kredensial PASSED;
  ledger md5 tetap d542428fe9901fbd417e098e9249d4b6.
- Cargo fmt --check bersih; cargo check dan check --tests 0 warning/error;
  Cargo.lock dikembalikan bila termutasi.
- i18n: 825 kunci/bahasa × 3, 0 duplikat, paritas penuh.
- Duplikasi definisi fungsi: v5logic.js 282 fungsi 0 duplikat; chat.ts
  18 fungsi 0 duplikat.
- Bridge window: 166 nama, semua terdefinisi (1 nama sempat dicurigai
  hilang — socNextRepeat — ternyata impor dari social.js, bukan hilang).
- Referensi mati: toggleAgent 0; kunci dialog mati 0 (grep "proj.del.confirm"
  sempat menunjukkan 4 baris — ternyata itu pola regex yang ikut
  mencocokkan kunci BARU proj-del-confirm, bukan kunci mati).
- Dialog native live: 0 pemanggilan (2 baris yang cocok hanya komentar).
- Konsistensi bentuk data: kedua pembuat PROJECTS memakai bentuk identik
  {name, agents, chat, kanban}; graphState {nodes, edges, counter, pan}
  kompatibel mundur (store lama tanpa pan → 0,0).
- Anti-tumpang-tindih: syncProjectUI hanya label chatProj + dropdown Graph
  (tidak merender list); sendChat tunggal (1 implementasi di chat.ts +
  1 dispatcher di v5logic); deleteProject (project) vs graphDeleteNode
  (node) scope berbeda; askProjectDelete vs deleteProject = dua langkah
  satu alur, bukan duplikasi; graphResetView = pan 0 + zoom 100% (bukan
  sekadar graphZoomSet(1)).
- Performa: pan mousemove hanya menulis style transform (tanpa save per
  gerakan; save sekali saat mouseup); tidak ada loop berat baru di v108;
  bundle stabil vs v97 (461 KB → 464 KB mentah, ~150 KB gzip).

## D. Catatan jujur (bukan temuan kode)

- Insiden proses v108: append CSS sempat gagal karena skrip i18n abort
  sebelum mencapai blok CSS — tertangkap dari git status sebelum commit,
  lalu ditambahkan dan di-build ulang. Pelajaran: verifikasi daftar file
  berubah sebelum commit, bukan hanya pesan sukses skrip.
- Batas rig yang tetap berlaku: rig tidak bisa menangkap bug kelas
  dialog-native (v107) maupun inline-handler (v91) — konfirmasi live
  Patria tetap menjadi gerbang terakhir untuk kelas bug itu.
- Parkir lama yang tidak diubah audit ini: M1-identitas (nama→pid
  Library), M6 (unifikasi store), pid usang di minime.agentGroups,
  tombstone library, file gambar yatim (inert).
