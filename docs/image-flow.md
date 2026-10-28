# Flow Produksi Gambar — MiniMe Hackathon

## Kontrak API (TERVERIFIKASI probe live 28 Okt 2026 ~19:32 WIB)

- `POST https://api.meta.ai/v1/images/generations`, Bearer kunci Meta
  (localStorage `minime.metaKey`, sama seperti chat).
- Body: `{model: 'muse-image-1.0', prompt, n, size,
  response_format: 'b64_json', output_format: 'webp'}`.
- Respons: `{created, data: [{b64_json}], output_format, background,
  usage}`. Probe: STATUS 200, 1 gambar WebP 210.454 byte.
- Biaya: $0,01/gambar (flat per daftar harga yang dipegang);
  kurs Rp18.148/USD (Finnhub 28 Okt). Bila respons membawa usage
  bertarif, tampilkan itu — bila tidak, pakai rumus `n × $0,01`.

## Arsitektur

- Frontend `app/src/lib/image-flow.ts`: prompt state (localStorage
  `minime.imageFlow`), panggil API langsung via fetch (CSP sudah
  mengizinkan api.meta.ai), varian sesi sebagai data URL.
- Rust `app/src-tauri/src/image.rs` (std-only, tanpa dependensi baru):
  `image_save` (b64 → `$HOME/minime-images/<nama>.webp`) dan
  `image_read` (nama → b64). Nama file divalidasi (tanpa `/`, `\`,
  `..`). File TIDAK masuk git — pola sama dengan aset Sherpa.
- Metadata gambar tersimpan di Library (`minime.library.added`,
  kind `'image'`): judul, prompt, nama file, biaya per gambar.
  Spend kumulatif di `minime.imageSpend` ({images, usd, idr}).
- Tab Image lama (grid dummy MEDIA + placeholder "Bukan hasil
  generate" + tombol simulasi) DIHAPUS TOTAL: `renderMedia`,
  `carSlide`, `saveScript`, `mediaToPlanner`, array `MEDIA`,
  kunci `filter.*`, `ms.image.note`, `media.toplanner.note`,
  `planner.status.local`, `planner.when.session`.

## Alur (6 tahap)

1. Brief (bisa diedit) + rasio + gaya + text-free + jumlah varian
   → baris "Prompt terkirim" (preview persis yang dikirim).
2. Generate = async, tombol dikunci selama jalan. Tanpa kunci →
   catatan jujur, tanpa fetch. Error API → catatan + status HTTP,
   tanpa gambar palsu.
3. Varian tampil sebagai grid. Biaya dihitung saat GENERATE
   (API menagih saat itu), bukan saat simpan.
4. Simpan per varian → file + baris Library + galeri tersimpan.
   Galeri dibaca balik via `image_read`.
5. Recall Library (tombol Media Studio pada baris gambar) →
   tab Image + gambar dimuat + brief diisi prompt-nya.
6. "Muat dari Script terakhir" mengisi brief dari output
   Script Editor (localStorage `minime.scriptEditor`).

## Keputusan eksplisit (penyimpangan dari draf awal, beralasan)

- "Perbaiki" = generate ulang dengan prompt revisi. Endpoint edits
  khusus TIDAK dipakai: encoding input-nya (multipart vs base64 JSON)
  belum terverifikasi — tidak ada tombol yang memanggil API dengan
  format tebakan. Probe encoding edits = pekerjaan lanjutan.
- Kontrol reasoning TIDAK ada di UI: parameter `reasoning_strength`
  belum terverifikasi untuk endpoint ini, dan kontrol yang tidak
  memengaruhi request melanggar rule.md no.13.
- Rasio selain 1:1 PROVISIONAL: hanya 1024x1024 terverifikasi live;
  rasio lain memakai pola param yang sama (size dibaca model sebagai
  rasio, bukan piksel persis).
- Lampiran media ke draf Postiz YANG SUDAH ADA belum dibangun
  (butuh verifikasi apakah API mengizinkan tambah media ke draf lama).
  Yang SUDAH dibangun: upload + schedule bermedia lewat langkah batch
  (post terjadwal BARU, bukan menempel ke draf lama) + Library +
  galeri + biaya.
- Hapus gambar: command image_delete SUDAH dibangun (dipakai hapus
  logo/elemen Brand); tombol hapus di galeri Image masih follow-up.
- Kartu Billing menampilkan baris muse-image-1.0 bila spend > 0;
  total statis COST_TOTAL tidak dicampur (ledger Node vs panggilan
  langsung frontend adalah dua pencatatan berbeda).

## Uji

`npm run rig:image` (11 cek): panel render, preview prompt, tolak
tanpa kunci (0 fetch), generate 2 varian + biaya Rp, simpan →
Library + galeri, muat Script, recall Library. Invoke `image_save` /
`image_read` di-stub dengan Map di rig (perilaku sama dengan command
Rust).
