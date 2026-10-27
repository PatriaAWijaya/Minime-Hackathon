# Spesifikasi UI Utama — Window Chat Prime Agent (DRAF v3)

Status: DRAF, 27 Okt 2026. BUKAN implementasi, BUKAN persetujuan.
Spesifikasi layout utama ini ditetapkan atas perintah Patria
27 Okt siang, setelah prototype v2: "kita mulai dari UI utama,
window chat dengan Prime Agen". Dokumen ini mengatur LAYOUT
UTAMA; rancangan perilaku (Prime Agent, harness, Kanban, koneksi,
Media Studio) tetap mengacu ke docs/ui-draft-v2.md, kecuali yang
diubah di sini.

Gerbang: persetujuan spesifikasi + prototype oleh Patria.
Tidak ada gerbang yang disetujui atas nama Patria.

## 1. Layout utama — 4 kolom (kiri ke kanan)

```
[Sidebar ikon] | [Kolom Agen] | [Chat Window (utama)] | [Panel Detail]
   64px              260px*          fleksibel              300px*
   *lebar bisa dikustomisasi dengan drag (lihat §6)
```

Semua kolom kecuali sidebar memiliki scrollbar sendiri
(overflow-y independen), sehingga daftar agen, riwayat chat, dan
panel detail yang menumpuk sampai bawah masing-masing bisa
di-scroll tanpa menggerakkan kolom lain.

### Kolom 1 — Sidebar (ikon saja, 64px)
- Menu hanya berupa ikon; nama menu muncul saat hover (tooltip
  di samping ikon). Tidak ada label permanen.
- Urutan menu (atas ke bawah):
  1. **Home** — kembali ke UI utama (chat Prime Agent).
  2. **Search** — pencarian tugas atau kata kunci lain (memfilter
     chat dan daftar tugas di proyek aktif).
  3. **Kanban** — semua proses tugas dalam papan 5 kolom.
  4. **Graph** — node koneksi antar agen dalam sebuah tugas
     (kanvas ala N8N; tambah edge oleh pengguna).
  5. **Library** — semua output akhir masing-masing agen yang
     bisa segera digunakan, disimpan, atau diperbaiki lebih lanjut.
  6. **Media Studio** — produksi suara (integrasi Voice Studio),
     produksi Image dan Reels, serta produksi video untuk Reels
     dan Talking Head beserta timeline editor-nya (lihat §7).
  7. **Planner** — integrasi auto post dengan Meta dan Postiz
     (lihat §8).
- **Settings di bagian bawah sidebar** (terpisah, menempel bawah):
  semua pengaturan aplikasi (akun/koneksi, provider, fallback,
  gerbang, tampilan, biaya). Settings bukan menu proyek; ia
  mengatur aplikasi secara global.

### Kolom 2 — Kolom Agen (daftar agen aktif)
- Menampilkan list agen yang AKTIF dan dapat dipantau: nama,
  status (idle / mengerjakan / menunggu approval / selesai /
  nonaktif), tugas aktif, dan proyeknya.
- **Prime Agent selalu aktif** dan selalu di paling atas daftar.
  Prime Agent tidak bisa dinonaktifkan dari list ini.
- Agen lain dapat diaktifkan secara OTOMATIS oleh Prime Agent
  saat Prime Agent memberi mereka tugas (agen muncul di list
  dengan status mengerjakan).
- Pengguna juga bisa MENAMBAH agen (dari roster agen yang
  tersedia) dan ME-NONAKTIFKAN agen yang dibutuhkan/tidak
  dibutuhkan, per proyek. Nonaktif tidak menghapus riwayat agen
  itu; ia hanya berhenti menerima tugas baru sampai diaktifkan
  lagi.
- **Pengelompokan per proyek:** list dikelompokkan berdasarkan
  proyek tertentu (header grup per proyek). Dalam beberapa
  proyek berbeda, agen yang SAMA bisa muncul bersamaan (satu
  baris per proyek — mis. Riset muncul di grup "TEST Kopi
  Surabaya" dan juga di grup "TEST Produk Digital", dengan tugas
  yang berbeda di tiap proyek).
- Klik agen di list → Panel Detail (kolom 4) menampilkan agen itu.

### Kolom 3 — Chat Window (kolom utama, seperti grup chat)
- Perlakuan chat adalah seperti GRUP CHAT: User, Prime Agent,
  dan sub-agen bisa saling chat untuk membahas suatu proyek.
  Pesan masing-masing pengirim dibedakan warna/avatar dan nama.
- Masing-masing agen sifatnya INDEPENDEN: bekerja sesuai goal-nya
  masing-masing dan bisa menyampaikan hasilnya di chat — tetapi
  semua hasil HARUS DIKURASI oleh Prime Agent sebelum dianggap
  final. Kurasi Prime Agent tampil sebagai pesan kurasi yang
  jelas ("Kurasi Prime: … disetujui / perlu revisi karena …"),
  bukan sekadar pesan biasa.
- Chat tersimpan per proyek (pindah proyek = pindah riwayat chat).
- Input di bawah chat: kolom tulis + kirim + contoh arahan cepat.
  Pesan pengguna, Prime Agent, dan sub-agen semuanya masuk ke
  riwayat yang sama.

### Kolom 4 — Panel Detail (Prime Agent & Agen)
- Menampilkan detail agen yang sedang dipilih (klik dari Kolom
  Agen atau dari avatar di chat): nama, peran, goal, status dan
  kondisi saat ini, provider/model yang dipakai, dan daftar
  harness skill.
- **Semua kondisi dan skill agen bisa dikustomisasi dari panel
  ini:** centang/hapus skill dari harness, ubah provider/model,
  ubah goal/catatan agen, ubah status (kecuali Prime Agent yang
  selalu aktif). Perubahan tersimpan per agen (dan per proyek
  bila agen itu muncul di beberapa proyek — kustomisasi bisa
  berbeda per proyek, dan panel menandai proyek mana yang sedang
  dikustomisasi).
- Panel Detail untuk Prime Agent sendiri menampilkan aturan
  kurasi dan gerbang yang dipegang Prime Agent (GSTP/GKonten/
  GBatch) — gerbang ini tidak bisa dimatikan dari panel.

## 2. Perilaku sidebar (apa yang terjadi saat menu diklik)

- **Home:** kembali ke Chat Window proyek aktif.
- **Search:** bilah pencarian muncul di atas Chat Window;
  mengetik memfilter pesan chat dan judul tugas di proyek aktif
  (hasil yang tidak cocok disembunyikan, jumlah hasil ditampilkan).
- **Kanban / Graph / Library / Media Studio / Planner:**
  kolom utama (Chat Window) diganti sementara oleh view tersebut;
  kolom Agen dan Panel Detail tetap di tempatnya, dan tombol
  Home mengembalikan ke chat. View-view ini adalah MODE dari
  jendela utama yang sama, bukan aplikasi terpisah.
- **Settings:** panel pengaturan menggantikan kolom utama
  sementara; kembali lewat Home.

## 3. Media Studio (isi view, dari perintah Patria)

- **Produksi suara:** integrasi dengan Voice Studio (TTS, voice
  cloning, auto-mastering — sesuai arsitektur yang sudah ada).
- **Produksi Image dan Reels:** generator utama Meta dan Gemini.
  **Fallback:** bila generator image Meta DAN Gemini tidak
  bekerja, gunakan koneksi ke Canva sebagai fallback (Canva
  adalah jalur image-only yang sudah terbukti; fallback ini
  hanya untuk image, dan status fallback selalu ditampilkan:
  "Menggunakan Canva (fallback)" — tidak pernah disembunyikan
  sebagai generator utama).
- **Produksi video untuk Reels dan Talking Head beserta timeline
  editor-nya:** timeline multi-track (video, audio/suara,
  teks/overlay) dengan playhead, potong/pindah klip, dan pratinjau.
  Hasil video berstatus sama seperti media lain (Draf / Menunggu
  GKonten / Siap untuk Post).
- Semua hasil Media Studio masuk juga ke Library sebagai output
  akhir agen Media.

## 4. Planner (isi view, dari perintah Patria)

- Integrasi auto post dengan Meta dan Postiz.
- Pada slice hackathon, Planner menampilkan jadwal + status draf
  per channel dan mode "DRAF saja" sebagai default. Auto post
  live hanya dalam mode batch terjadwal dengan persetujuan awal
  pengguna (aturan berdiri Meta/Postiz) — Planner tidak pernah
  mengubah mode itu sendiri.
- Item yang sudah "Siap untuk Post" dari Media Studio muncul di
  Planner sebagai kandidat jadwal; item yang belum lolos GKonten
  tidak muncul di Planner.

## 5. Library (isi view, dari perintah Patria)

- Semua output akhir masing-masing agen, dikelompokkan per agen
  dan per proyek: STP, riset, kalender, brief, gambar, carousel,
  reels, talking head, brief produk.
- Tiap output memiliki tiga aksi: **Gunakan** (pakai sebagai
  bahan tahap berikutnya), **Simpan** (tandai/arsipkan), dan
  **Perbaiki Lebih Lanjut** (buka kembali sebagai tugas revisi
  untuk agen pemiliknya, dengan catatan pengguna).
- Output yang masih draf (belum lolos gerbangnya) berlabel DRAF
  dan tidak bisa dipakai sebagai bahan final sampai gerbangnya
  lolos.

## 6. Kustomisasi lebar kolom & scrollbar

- Lebar Kolom Agen dan Panel Detail bisa dikustomisasi dengan
  drag pada pembatas antar kolom (gagang drag 6px, kursor
  col-resize). Batas yang diusulkan: Kolom Agen 180–420px,
  Panel Detail 220–420px, default masing-masing 260px dan 300px.
  Chat Window mengisi sisa lebar.
- Lebar yang dipilih tersimpan per pengguna (preferensi lokal),
  bukan per proyek.
- Scrollbar: Kolom Agen, Chat Window, dan Panel Detail masing-
  masing overflow-y independen dengan scrollbar yang terlihat
  (bukan tersembunyi), sehingga konten yang menumpuk sampai
  bawah tetap bisa dijangkau.

## 7. Yang TIDAK berubah dari v2

- Prime Agent sebagai satu pintu masuk arahan; delegasi ke agen
  berdasarkan harness skill; gerbang GSTP/GKonten/GBatch
  ditegakkan di backend.
- Biaya Rupiah dulu; tidak ada autopublish live di slice ini;
  proyek dan koneksi pengguna tidak hilang otomatis.
- Prototype v3 di bawah ini adalah simulasi klik (data dummy,
  keputusan simulasi) — sama seperti prototype sebelumnya.
