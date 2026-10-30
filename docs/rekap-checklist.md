# Rekap Pekerjaan MiniMe Hackathon — Checklist per Fase/Modul

Status per 30 Okt 2026 ~15:00 WIB (v97 live setelah deploy; v96 sudah live).
Legenda: ✅ selesai & teruji · ⚠️ sebagian / provisional / menunggu keputusan · ❌ belum.

## Ringkasan eksekutif (hasil audit 30 Okt 13:55–15:00)

- Bundle: JS 461 KB (gzip ~151 KB), CSS 39 KB — sehat; naik ~1,7% dari v89 untuk fitur v91–v97.
- i18n: 813 kunci/bahasa (ID/EN/ZH identik, 0 duplikat). Turun dari 818: 4 kunci notice Graph (v96) + 1 kunci mati Section (v97).
- Gerbang: tsc 0, svelte-check 0 error/26 warning, vite build, 13 rig ALL PASSED, gate-test 14/14, scan kredensial bersih, cargo fmt+check+check --tests 0 warning, ledger md5 tetap `d542428fe9901fbd417e098e9249d4b6`.
- Temuan audit: 1 MAJOR diperbaiki (56 inline handler → delegated listeners, v97), 1 MINOR diperbaiki (kunci mati `ns.note.created`, v97), 1 MINOR diperbaiki (bar keterangan Graph → kanvas penuh, v96, atas perintah langsung). Bukan tumpang tindih (terverifikasi): helper `el/bind/loadState/saveState/setNote` per modul (scope modul, beda store), `readFileB64` ganda (kontrak beda: string vs {b64,mime,name}), 55 kunci dinamis (prefix se./ved./graph./na./brand. — hidup via konstruksi dinamis, terbukti).
- Aturan dua arah Graph ↔ menu utama (perintah Patria 13:47) kini tertutup dua sisi: menu → Graph (picker, DnD, buat project, popup agen) dan Graph → menu (pilih agen, hapus node, kembali ke Home me-render ulang list).

## Fase kanon

| Fase | Status | Bukti / catatan |
|---|---|---|
| Fase 0 (fondasi: router, ledger, gate) | ✅ | Dinyatakan lolos penuh oleh Patria 28 Okt. Catatan jujur: record live Fase 1–3 lama hilang oleh gate-test lama; ledger kini hanya 3 record mock, tidak direkonstruksi. |
| Fase 1 (GSTP) | ✅ | Disetujui Patria 27 Okt 12:04. Brand uji fiksi TEST-BRAND-001. |
| Fase 2 (kalender 7 hari + 7 brief, GKonten) | ✅ | Disetujui Patria ~13:06. |
| Fase 3 (7 carousel × 3 slide, QC 100/100, 7 draf Postiz) | ✅ konten, ⚠️ integrasi | Draf Postiz jadi SEJARAH/seed Library. Integrasi Postiz DIHAPUS dari app v63, diganti Planner native. Stack Docker Postiz MacBook dihapus total 30 Okt ~04:10. |
| Fase 4 (leads/CRM/outreach rule-based) | ⚠️ | Fixture 12 lead → 10 deduped, 6 draf. GTemplate BELUM disetujui (menunggu Patria); GBatch terkunci false; tanpa jalur kirim (wa.me manual saja). |
| Fase 5 (evaluasi live golden set + rehearsal + cost-per-task) | ❌ | Direncanakan 29 Okt sore, tertunda rangkaian native v61–v97. |
| Fase 6 / freeze | ⚠️ berjalan | Hari ini 30 Okt; audit ini bagian dari freeze. Buffer 31 Okt–2 Nov; video demo 3 Nov; submit 4 Nov 21:00 ET = 5 Nov 09:00 WIB. |

## Modul aplikasi

| Modul | Status | Catatan |
|---|---|---|
| Home + Chat orkestrasi | ✅ | Bubble agen, delegasi keyword, cap 500 pesan/proyek, lampiran 5 MB (nama saja terkirim). Agen Graph-only ikut terdelegasi (fallback v94). |
| Search | ✅ | Klik hasil → sorot bubble (v97: wiring delegasi + perbaikan data-idx). |
| Kanban | ✅ | 5 kolom + mode per-project/semua + dialog edit/Approve/komentar/tim. Keputusan pending: 5 vs tepat 3 kolom. |
| Graph | ✅ | Node trigger/agen/gate/dist/revisi/model/memory/tool, popup dblclick, kesehatan node, kunci hanya-baca, drag ringan, filter per-project, sinkron dua arah (v91–v95), kanvas penuh tanpa bar keterangan (v96). Eksekusi alur = simulasi visual; Webhook belum punya listener. |
| Library | ✅ | Arsip 3 bulan (bukan hapus) + pulihkan (v90). ❌ Upload arsip ke Google Drive (butuh OAuth + perintah Patria). |
| Media Studio — Script | ⚠️ | Social lengkap; Artikel/Movie PROVISIONAL (menunggu konfirmasi). |
| Media Studio — Image | ✅ | Meta muse-image-1.0 live probe ($0,01). Canva = jalur sementara resmi. |
| Media Studio — Batch | ✅ | Antrean native; target linkedin/facebook_page/x; carousel multi-gambar TIDAK didukung (file pertama saja). |
| Media Studio — Voice Editor | ✅ | Trim/potong non-destruktif, transkrip Whisper (segmen, tanpa per-kata). |
| Media Studio — VoiceStudio/Sherpa | ⚠️ | VoiceStudio eksternal (AGPL, via API, tidak dibundel); upgrade v0.5.7 menunggu keputusan. Sherpa PROVISIONAL (paritas 1 kalimat, klik ulang Patria pending). |
| Media Studio — Video | ⚠️ | Tier 1 live; Tier 2 chunk 1–2 live (ducking + caption ASS sidecar). ❌ Burn-in caption TERBLOKIR (FFmpeg MacBook tanpa subtitles/drawtext/libass — butuh keputusan Patria). |
| Planner native | ✅ | 8 kanal, antrean + scheduler 30 detik (hanya saat app terbuka), refresh token ala Postiz (Meta tak perlu). FB profil can:false (API tak bisa autopost profil). Bukti publish live BUTUH setup Patria per platform (app developer + OAuth). |
| Campaign | ✅ | 4 tab; form lead manual, ubah stage, salin draf, tugas Follow Up. 3 kartu statis Leads = provisional (form manual v79). Konfirmasi pending: tab ke-4 "Leads & CRM". |
| Billing | ✅ | Total = COST_TOTAL + live + imgSpend; peringatan >$5 (bukan blokir); format Rupiah. Kredit Meta $150, outstanding Rp0. |
| Settings + i18n | ✅ | Per-kunci Hubungkan (uji live) + Periksa Ollama; tanpa tombol Simpan bersama. 813 kunci, 3 bahasa. |
| Keamanan / kredensial | ✅ | Tanpa kunci di repo/log (scan bersih); token hanya env/Vault/Keychain/localStorage; GitHub PAT s.d. 28 Nov 2026. |

## Temuan audit v97 (diperbaiki)

- **F1 MAJOR — 56 inline handler di HTML hasil render** (detail panel, dialog Kanban, dialog Library, hasil Search, bubble chat, bar lampiran): kelas yang sama dengan 2 permukaan yang terbukti mati di WebView live (popup Graph, menu +). Dikonversi ke `data-act` + satu listener per container persisten (pola v91/v93). Pelajaran: di string JS kutip-tunggal, interpolasi diputus dengan `'`, bukan `"` (bug data-idx search yang sempat lolos, tertangkap rig-audit, diperbaiki + dibuktikan ulang).
- **F2 MINOR — kunci mati** `ns.note.created` (sisa penghapusan Section v93) dihapus.
- **F3 (perintah langsung, v96)** — bar keterangan Graph dihapus; kanvas penuh via `.graph-wrap`/`.n8n-canvas` height 100% (hapus elemen saja tidak cukup karena tinggi lama calc viewport).
- **Bukan temuan**: duplikat nama helper per modul, `readFileB64` dua kontrak, kunci dinamis, `showNotice` (masih dipakai view lain), `kbOpenCall` (diganti `kbOpenAttrs`, bukan duplikat).

## Menunggu keputusan Patria (tidak dikerjakan tanpa vonis)

GTemplate; burn-in caption; brand uji final; nama/komposisi tim submission; kolom Kanban; tab Campaign ke-4; upgrade VoiceStudio; kartu + Spend Limit Meta; backup ledger di git; ikon `Square*.png` untracked; Artikel/Movie provisional; keyword delegasi chat; adopsi HyperFrames; Node upgrade (REA); transkrip → caption ASS; hapus penuh setup VoiceStudio; triase C-B1; LinkedIn Page; TikTok Business; Settings per-kanal + tag + komentar pertama; scope Publish/Permissions/Folders/Tables; wiring Model per-agen ke router; isi file lampiran chat; upload Drive arsip Library; klik + tengah Graph menjalankan alur; chat Prime tanpa delegasi tidak membuat node; drop Kanban lintas project diabaikan; cakupan kartu 13:07; panduan "Belum ada proyek".

## Uji live yang diminta dari Patria (klik, bukan teori)

- v96: buka Graph — bar bawah hilang, kanvas penuh sampai bawah jendela.
- v97: klik baris detail agen (avatar/model/reasoning/memori/file/nota), dialog Kanban (simpan/Approve/komentar/hapus), dialog Library (media/hapus/revisi/arsip), hasil Search (sorot bubble), lampiran chat (kamera/audio/hapus chip), tombol setujui studio di chat.
- v95: hapus node Graph → baris agen hilang dari menu utama; kembali ke Home → list segar.
- v94: grup "Dari Graph" (Riset + Kreatif + brief) tampil; seret ke project → keluar dari grup.
- v93: menu + → New agent (picker kartu + Aktifkan) dan New project (kartu + Create + Graph otomatis); Prime tidak tampil di list project.
