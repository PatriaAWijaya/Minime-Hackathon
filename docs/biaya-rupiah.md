# Biaya dalam Rupiah — aturan pelaporan (Patria, 27 Okt 2026)

**Aturan:** sebisa mungkin, semua biaya dilaporkan dalam Rupiah.
USD hanya tampil sebagai sumber (dalam kurung) bila provider memang
menagih dalam USD, atau bila harga belum diketahui sehingga tidak ada
yang bisa dikonversi — dalam kasus terakhir, jangan mengarang angka Rp.

## Bagaimana ini diterapkan di kode

- Sumber kebenaran ledger tetap USD (`costUsd`), karena provider
  menagih dalam USD — itu tidak bisa diubah.
- Setiap record juga membawa `costIdr`, dihitung oleh `CostLedger`
  pada saat pencatatan dengan kurs `USD_IDR_RATE` dari environment.
  `summary()` melaporkan `totalIdr` lebih dulu, lalu `totalUsd`
  sebagai sumber.
- Kurs TIDAK pernah di-hardcode sebagai default permanen. Bila
  `USD_IDR_RATE` tidak diset, `costIdr`/`totalIdr` bernilai null —
  bukan tebakan. Kurs yang dipakai selalu tercatat di summary sehingga
  setiap angka Rp bisa diaudit ke kurs dan tanggalnya.
- Hard limit tetap ditegakkan dalam USD (satuan tagihan provider),
  tetapi selalu dilaporkan juga dalam Rp pada kurs yang berlaku.

## Angka referensi 27 Okt 2026 (dicek hari itu, bukan konstanta)

Kurs: ~Rp18.137 per USD (Finnhub; sumber publik lain hari itu
berkisar Rp18.131–Rp18.152). Perbarui `USD_IDR_RATE` sebelum memakai
ulang angka-angka di bawah ini untuk tanggal lain.

- Hard limit ledger $5 = **Rp90.685** (pada kurs di atas).
- Kredit Meta Model API $150 = **Rp2.720.550** setara — tetapi
  kreditnya sendiri berdenominasi USD, jadi di laporan selalu
  ditulis keduanya: Rp2.720.550 (setara $150).
- Biaya ilustratif Gemini per tugas singkat ~$0,0001 = **~Rp1,81**
  (tarif publikasi sekunder, BUKAN angka ledger resmi — perlu
  konfirmasi halaman pricing Google sebelum dipakai sebagai angka
  ledger).
- Ollama lokal (DeepSeek/Qwen di MacBook) = **Rp0** marginal.
- Biaya Fase 1 live 27 Okt siang (1.551 token Gemini): **belum bisa
  dirupiahkan** — harga per token Gemini belum di-baseline resmi,
  sehingga `costUsd` bernilai null dan konversi Rp-nya juga null.
  Ini pengecualian yang jujur dari aturan, bukan pelanggaran:
  tidak ada harga = tidak ada konversi.

## Angka aktual live Meta 28 Okt 2026 (panggilan pertama yang berhasil)

Kurs: ~Rp18.148 per USD (Finnhub, 28 Okt 2026).

- Uji live Muse Spark 1.3, 28 Okt ~03:36 WIB, lewat router repo
  (hanya kunci Meta yang diset, sengaja): provider `meta`, tanpa
  fallback, `mock: false`, latensi 10.549 ms, 34 token input +
  684 token output, jawaban satu kalimat Bahasa Indonesia.
  Persetujuan akses kali ini disetujui sehingga request berangkat.
- Biaya aktual panggilan ini: **$0,00295 (≈ Rp53,5)** — hitungan
  manual dari usage + tarif standar: 34 × $1,25/1 jt +
  684 × $4,25/1 jt. `costUsd` router tetap null karena router
  tidak menghitung biaya; angka ini hitungan dari usage API,
  bukan klaim ledger otomatis. Token output 684 untuk satu kalimat
  dicatat apa adanya dari usage API (kemungkinan mencakup token
  penalaran internal); tidak diubah.
- Catatan jujur: prompt uji ("apa itu MiniMe?") ambigu, sehingga
  model menjawab dari pengetahuan umum (karakter film Austin
  Powers), bukan tentang aplikasi MiniMe Patria. Uji ini membuktikan
  konektivitas, model, dan token — bukan pengetahuan model tentang
  aplikasi.
- Status re-baseline: Meta kini punya angka aktual (satu panggilan).
  Re-baseline PENUH selesai per keputusan Patria 28 Okt ~04:36 WIB
  (lihat seksi penutup di bawah). Kondisi Fase 0 (1) dan (2)
  keduanya tertutup. Lolos penuh Fase 0 DINYATAKAN Patria 28 Okt
  2026 ~11:20 WIB ("Fase 0 lengkap").
- Setara kredit pada kurs 28 Okt: $150 = **Rp2.722.200**
  (kreditnya sendiri tetap berdenominasi USD).

## Yang masih berdenominasi USD (pengecualian)

1. Harga resmi provider (Meta, Google) — sumbernya USD; laporan
   menampilkan Rp setara + USD sumbernya.
2. Kredit Meta $150 — berdenominasi USD; laporan menampilkan
   keduanya.
3. Biaya yang harganya belum diketahui — tidak dikonversi, ditulis
   "belum diketahui". UPDATE 27 Okt malam (Meta aktif): tarif standar
   Muse Spark 1.3 = $1,25 input / $4,25 output per 1 jt token
   (katalog 23 Okt + dokumentasi provider; konfirmasi akhir menyusul
   live test) — dipakai sebagai baseline harga, BUKAN angka ledger
   aktual; biaya aktual per tugas tetap null sampai ada token live
   dari pemakaian Meta. Muse Image ($0,01/gambar per katalog 23 Okt)
   tetap provisional sampai keputusan provider final + live call.

## Re-baseline selesai — bagian 2 ditutup (keputusan Patria, 28 Okt 2026 ~04:36 WIB)

- Gemini Fase 1–3 (7 panggilan, 10.859 token): **tertagih $0 (Rp0)**
  karena pemakaian berjalan di free tier (Google AI Studio, proyek
  'Default Gemini Project'). Bukan $0 karena tidak dipakai — dipakai,
  tapi tier-nya gratis.
- Rincian input/output 7 panggilan tersebut **tidak dapat
  direkonstruksi**: cek dashboard Google Cloud 28 Okt 03:54–04:27 WIB
  (read-only) hanya memberi agregat harian per proyek dalam bucket
  UTC-8 (26 Okt: in 8,02K + out 4,09K, 28 request; 27 Okt: in 1,09K +
  out 1,54K, 2 request), yang mencampur panggilan Fase dengan
  panggilan lain dan membentang di dua bucket untuk satu hari Jakarta.
  Ledger lokal hanya menyimpan 3 record mock; total 10.859 token
  berasal dari riwayat percakapan, bukan ledger.
- Nilai setara tarif standar untuk 10.859 token itu ($0,0027–$0,0163
  ≈ Rp49–Rp296) dicatat sebagai PEMBANDING saja, bukan biaya
  tertagih, dan tidak lagi dipakai sebagai baseline.
- Total tertagih pekerjaan hackathon yang tercatat: 8 panggilan,
  11.577 token, **$0,00295 (≈ Rp53,5)** — seluruhnya dari uji live
  Meta; kontribusi Gemini $0.
- Dampak ke aplikasi: baris Gemini di view Cost kini $0/Rp0 dengan
  kolom input/output '—' (rincian tidak diketahui); total menjadi
  $0,00295/Rp53,5. Keputusan ini milik Patria (opsi widget
  'Catat $0 free tier, tutup bagian 2').
