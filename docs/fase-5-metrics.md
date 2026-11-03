# Fase 5 — Metrik evaluasi live (golden set + rehearsal)

Tanggal: 3 Nov 2026 malam WIB. Harness: `src/fase5.ts` + `src/fase5-run.ts`
(`npm run fase5`), golden set: `docs/fase-5-golden-set.json` (8 kasus).
Output mentah: `docs/fase-5-output.json` (final), `docs/fase-5-output-attempt1.json`
(run 1), `docs/fase-5-output-mock.json` (kontrol mock).
Prinsip: diukur, bukan diklaim. Semua angka di bawah berasal dari panggilan
nyata yang tercatat; yang tidak terukur dinyatakan tidak terukur.

## Headline — run final (trace fase5-1793721280185, ~22:53–23:04 WIB)

**7/8 kasus sukses.** Satu-satunya kasus yang gagal adalah g5-carousel,
karena Gemini 503 (high demand) pada percobaan pertama DAN retry — bukan
karena kasusnya cacat (carousel SUKSES di run 1). Batas $5 tidak tersentuh
(total $0,0427 = 0,85% dari limit). Rekonsiliasi ledger cocok, 0 mock.

## Per kasus — run final

| Kasus | Maker | Hasil | Latensi | Token in/out | Biaya | QC LLM (cross-family) |
|---|---|---|---|---|---|---|
| g5-stp | meta | ✓ | 15.861 ms | 50 / 1.606 | $0,006888 | gemini 95 |
| g5-image | meta | ✓ | 9.134 ms | 76 / 1.145 | $0,004961 | det 100 ✓ + gemini 95 |
| g5-carousel | gemini | ✗ 503 ×2 | — | — | — | — |
| g5-caption | meta | ✓ | 17.209 ms | 38 / 1.502 | $0,006431 | gemini GAGAL 503 ×2 (skor hilang, kasus tetap ✓) |
| g5-storyboard | gemini | ✓ (retry) | 2.762 ms | 39 / 377 | $0 | meta 95 |
| g5-planner | meta | ✓ (QC retry) | 7.254 ms | 41 / 673 | $0,002912 | gemini 60 |
| g5-chain | meta | ✓ (QC retry) | 9.532 ms | 21 / 980 | $0,004191 | gemini 100 |
| g5-ollama | ollama | gagal terlihat (diharapkan) | — | — | — | — |

## Per provider — run final (maker only)

| Provider | Panggilan OK | Rata-rata latensi | Biaya |
|---|---|---|---|
| meta (muse-spark-1.3) | 5/5 | 11.798 ms | $0,025383 |
| gemini (3.1-flash-lite) | 1/2 | 2.762 ms (hanya yang sukses) | $0 (free tier) |
| ollama | 0/1 (diharapkan: tidak ada di VM) | — | — |

## QC

- LLM QC (live, cross-family): 5 ternilai — rata-rata 89, min 60 (planner),
  max 100 (chain). 2 skor hilang karena 503 Gemini (caption QC di run 1 dan
  run 2; carousel tidak punya output untuk dinilai).
- QC deterministik (struktural): image 100 lolos; rehearsal QC 100 lolos.

## Biaya & ledger — run final

- Total ledger: **$0,0427085** (maker $0,025383 + QC meta $0,005712 +
  rehearsal $0,011614), 13 record, 0 mock, rekonsiliasi cocok
  (ledger total == jumlah record).
- IDR: null — tidak ada kurs yang diset, tidak pernah ditebak.
- Limit $5: bukti append-refused DAN guard pra-panggil, keduanya lolos
  (pengujian limit $0,000001, nol biaya API).

## Rehearsal end-to-end — run final

- Sample chain (Research → Strategy → GSTP → QC → GKonten → draf):
  OK, LIVE (bukan mock), stages queued → brief → done, QC 100,
  **draftPublished = false** (draf-only, tidak ada yang terbit).

## Retry — run final (kebijakan: 1× ulang setelah 60 detik, hanya 503/429)

6 kejadian: carousel maker 503→503 gagal; caption QC 503→503 gagal;
storyboard maker 503→sukses; planner QC 503→sukses; chain QC 503→sukses;
ollama maker gagal→retry (KELEBIHAN matcher: kata "unavailable" sempat
menjadi pemicu — hasil tetap sama, hanya +60 detik; matcher diperbaiki
di kode sesudah run, tanpa rerun live karena hasilnya tidak berubah).

## Run 1 (attempt1, ~22:41–22:47 WIB) — untuk perbandingan

7/8 juga, tapi kasus gagalnya BERBEDA: storyboard maker 503 (sukses di
run 2); caption QC + chain QC 503; LLM QC rata-rata 84 (4 ternilai:
95/90/90/60); ledger $0,0404265; 12 record; rehearsal OK.
**Gabungan dua run: semua 8 tipe kasus terbukti bisa sukses** — 7/8 di
tiap run mencerminkan ketersediaan Gemini (spike 503 selama 22:41–23:04),
bukan kegagalan struktural harness atau kasus.

## Kontrol mock (tanpa biaya)

8/8 sukses, $0, rekonsiliasi cocok — membuktikan struktur harness sebelum
live run. Mock tidak pernah dicampur ke angka live (0 record mock di
ledger live).

## Yang TIDAK diukur / TIDAK diklaim

- Claude/Anthropic: tidak bisa diukur dari runner Node (hanya lewat
  Tauri invoke di app desktop) — menunggu uji live jalur app.
- Ollama lokal: tidak tersedia di VM (fetch gagal, terlihat) — model
  lokal hanya bisa diukur di MacBook.
- Latensi Gemini saat spike tidak representatif (2.762 ms hanya dari
  satu panggilan yang lolos; panggilan 503 tidak punya latensi sukses).
- Tidak ada publikasi, outreach, atau trading dalam Fase 5 — semua draf.

## Sisa setelah Fase 5 (bukan bagian Fase 5)

Video demo 3 menit + isi formulir + submit (tenggat 5 Nov 09:00 WIB);
konfirmasi live app v237–v242 + v244; deploy v244+v245 (masih ditahan
gerbang posting YoKafe + API key ImgBB).
