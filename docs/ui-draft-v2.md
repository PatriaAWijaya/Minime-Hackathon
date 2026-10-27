# Rancangan UI v2 — Personal Assistant dengan Prime Agent (DRAF)

Status: DRAF, 27 Okt 2026. BUKAN implementasi, BUKAN persetujuan.
Menggantikan docs/ui-draft.md (v1) atas perintah Patria 27 Okt siang
("revisi arah"): UI tidak lagi berbentuk formulir 7 layar yang
dijalani berurutan, melainkan bekerja seperti personal assistant.

Gerbang fase ini: persetujuan rancangan oleh Patria (setuju /
revisi / tolak). Tidak ada kode aplikasi sungguhan yang dibangun
sebelum rancangan ini disetujui, dan tidak ada gerbang (GSTP /
GKonten / GBatch) yang disetujui atas nama Patria.

## 1. Ide inti dalam satu kalimat

Pengguna berbicara kepada satu Personal Assistant (Prime Agent);
Prime Agent yang memecah arahan menjadi tugas, memanggil agen-agen
yang dibutuhkan, dan pengguna memantau pekerjaan itu lewat Kanban,
melihat hubungan antar agen lewat kanvas koneksi, dan melihat hasil
konten jadi lewat Media Studio.

## 2. Prime Agent — Personal Assistant

- **Satu pintu masuk.** Pengguna tidak membuka form per tahap;
  pengguna menulis arahan dalam bahasa sehari-hari, misalnya:
  "Riset pasar es kopi susu di Surabaya untuk mahasiswa, lalu
  buatkan kalender konten 7 hari dan gambarnya."
- **Tugas utama Prime Agent:**
  1. Memahami tujuan arahan (riset bisnis? marketing? pembuatan
     produk digital? atau gabungan?).
  2. Memecah menjadi tugas-tugas kecil dengan pemilik (agen) yang
     jelas dan urutan yang jelas.
  3. Memanggil agen yang dibutuhkan — hanya yang dibutuhkan,
     tidak semua agen sekaligus.
  4. Melaporkan progres dalam bahasa manusia ("Riset selesai,
     Strategi sedang dikerjakan, 2 item menunggu persetujuanmu"),
     bukan log mentah model.
  5. Menghentikan alur di gerbang manusia (GSTP, GKonten, GBatch)
     dan menunggu keputusan pengguna — tidak pernah melompati
     gerbang.
- **Tiga jenis arahan utama yang dirancang untuk dilayani:**
  - **Riset bisnis:** riset pasar, kompetitor, behaviour audiens,
    spending — outputnya riset + strategi + STP.
  - **Marketing:** kalender konten, brief, gambar, carousel,
    reels, talking head, draf distribusi — outputnya konten siap
    post (lihat Media Studio).
  - **Pembuatan produk digital:** brief produk, riset pengguna,
    struktur fitur, dan draf konten peluncuran — outputnya dokumen
    produk + materi marketingnya. (Detail produk digital dijabarkan
    pada iterasi rancangan berikutnya; pada v2 ini, jalurnya
    memakai agen yang sama dengan pola delegasi yang sama.)
- **Prinsip percakapan:** Prime Agent selalu menjawab dulu,
  mengumumkan delegasi ("Saya tugaskan Riset untuk…"), dan agen
  mengakui tugas sebelum hasilnya muncul — pengguna tidak pernah
  menebak siapa yang sedang mengerjakan apa.

## 3. Agen-agen dan harness skill-nya

Setiap agen memiliki harness skill: sekumpulan skill yang dipakai
agen itu saat Prime Agent memberinya tugas. Harness bukan sekadar
label — ia menentukan alat, prompt, dan standar kualitas agen itu.
Daftar di bawah ini adalah rancangan v2 untuk slice hackathon
(nama agen boleh diubah Patria pada revisi):

| Agen | Tugas utama | Harness skill (saat diberi tugas) |
|---|---|---|
| Riset | Riset pasar, kompetitor, behaviour & spending audiens | riset-pasar, behaviour-digital, spending-digital, verifikasi-fakta (larangan mengarang angka/URL) |
| Strategi | Positioning, pilar, STP | positioning-stp, pak-bi-branding (kerangka referensi branding), segmentasi-spending |
| Kreatif | Naskah, hook, CTA, CreativeBrief | copywriting-hook-cta, brief-text-free (visual tanpa teks dari model), overlay-template |
| Media | Gambar, Carousel, Reels, Talking Head | image-text-free, carousel-slide, reels-pendek, talking-head-avatar |
| Distribusi | Draf Postiz, jadwal, status per channel | postiz-draft-only (tidak pernah terbit live di slice ini), status-channel |
| Produk Digital | Brief produk, struktur fitur, riset pengguna | brief-produk, riset-pengguna, fitur-mvp |

- **Aturan harness:** agen hanya memakai skill di harness-nya
  untuk tugas itu; bila tugas membutuhkan skill di luar harness,
  Prime Agent yang memutuskan: tugaskan ke agen lain, atau minta
  arahan tambahan dari pengguna — agen tidak diam-diam memakai
  skill yang tidak ditetapkan.
- **Status agen selalu terlihat:** idle (menunggu), mengerjakan
  (dengan nama tugasnya), menunggu approval (tugas selesai,
  menunggu gerbang), selesai. Tidak ada agen yang "hilang" dari
  pandangan pengguna.

## 4. Mode-mode UI (satu jendela, tab berpindah sesuai pekerjaan)

Jendela aplikasi memiliki 4 mode utama. Pengguna bisa pindah
manual kapan pun, dan aplikasi juga berpindah otomatis saat
konteks pekerjaan berubah (dengan pemberitahuan, bukan diam-diam).

### Mode 1 — Asisten (mode utama, selalu kembali ke sini)
- Panel chat dengan Prime Agent di kiri/tengah, panel agen di
  kanan (daftar agen + status + skill yang sedang dipakai).
- Input arahan + tombol kirim + contoh arahan cepat ("Riset pasar
  kopi Surabaya", "Buatkan kalender 7 hari + gambarnya").
- Setiap balasan Prime Agent menampilkan rencana delegasi:
  tugas → agen → harness skill → status. Pengguna bisa mengklik
  tugas untuk melompat ke Kanban pada kartu itu.
- Riwayat chat tersimpan per proyek, bukan chat global yang
  tercampur antar proyek.

### Mode 2 — Kanban (otomatis aktif saat proyek sedang bekerja)
- Saat ada proyek yang sedang dikerjakan, UI beralih ke mode
  Kanban untuk memantau sampai di mana proyek dikerjakan.
- 5 kolom: Antrian → Dikerjakan → Butuh Approval → Revisi →
  Selesai.
- Tiap kartu: judul tugas, agen pemilik, harness skill yang
  dipakai, gerbang yang terkait (bila ada), dan tombol aksi
  sesuai kolomnya (mis. di "Butuh Approval": Setujui / Minta
  Revisi / Tolak — keputusan ini adalah gerbang sungguhan, bukan
  simulasi, pada aplikasi nyata).
- Kartu berpindah kolom karena status pekerjaan berubah, bukan
  karena pengguna menyeretnya seenaknya: drag antar kolom hanya
  diizinkan untuk aksi yang sah (mis. pengguna memindahkan kartu
  "Butuh Approval" kembali ke "Revisi" dengan catatan).
- Filter: per proyek, per agen, per gerbang.

### Mode 3 — Koneksi Agen (kanvas ala N8N)
- Kanvas node: Prime Agent sebagai node pusat, agen-agen sebagai
  node di sekelilingnya, panah (edge) menunjukkan aliran delegasi
  dan ketergantungan (mis. Riset → Strategi → Kreatif → Media →
  Distribusi).
- Pengguna dapat MEMANTAU konektivitas: klik node untuk melihat
  agen itu (tugas aktif, harness skill, status), klik edge untuk
  melihat apa yang mengalir di koneksi itu (mis. "STP yang
  disetujui" dari Strategi ke Kreatif).
- Pengguna dapat MENAMBAH koneksi antar node bila dibutuhkan:
  pilih node sumber → node tujuan → beri label aliran (mis.
  "Riset langsung ke Media untuk referensi visual") → edge baru
  tergambar dan tersimpan sebagai bagian dari proyek. Koneksi
  baru tidak mengubah gerbang: gerbang tetap ditegakkan di
  backend apa pun bentuk kanvasnya.
- Koneksi yang dihapus hanya atas perintah pengguna; kanvas tidak
  pernah mereset koneksi pengguna secara otomatis saat update.

### Mode 4 — Media Studio (otomatis aktif saat mengerjakan konten)
- Saat perintah konten dieksekusi, tab/jendela beralih ke mode
  Media Studio, tempat pengguna melihat hasil konten yang
  dihasilkan — bukan hanya script.
- Empat jenis hasil, masing-masing dengan filternya:
  - **Gambar:** gambar statis hasil generate (text-free, overlay
    template diterapkan terpisah).
  - **Carousel:** rangkaian slide (hook → isi → CTA) yang bisa
    dibuka per slide dan diperiksa satu per satu.
  - **Reels:** video pendek vertikal (9:16) dengan hook, visual,
    dan CTA-nya.
  - **Talking Head:** video presenter avatar yang membacakan
    naskah, dengan script yang bisa diperiksa dan diedit teksnya
    sebelum render ulang.
- Setiap item media berstatus jelas: Draf / Menunggu GKonten /
  Siap untuk Post. "Siap untuk Post" berarti hasil sudah jadi dan
  lolos QC + GKonten — BUKAN berarti sudah terbit: penerbitan
  tetap melalui gerbang distribusi (draf Postiz pada slice ini,
  dan batch terjadwal dengan persetujuan awal pada mode yang
  lebih luas). Tidak ada tombol "Post Sekarang" yang melewati
  gerbang di slice ini.
- Dari Media Studio, pengguna bisa: melihat pratinjau, meminta
  revisi per item (dengan catatan), menolak dengan alasan, atau
  menyetujui (GKonten) — keputusan yang sama dengan Kanban, hanya
  tampilannya media, bukan kartu teks.

## 5. Alur contoh (satu arahan, ujung ke ujung)

1. Pengguna (Mode Asisten): "Riset pasar es kopi susu Surabaya
   untuk mahasiswa, lalu buatkan konten 7 hari beserta gambarnya."
2. Prime Agent menjawab + mengumumkan delegasi: Riset (riset
   pasar + behaviour + spending) → Strategi (STP) → [GERBANG
   GSTP: pengguna menyetujui STP] → Kreatif (kalender + brief) →
   Media (gambar) → [GERBANG GKonten per item] → Distribusi
   (draf Postiz).
3. UI beralih ke Kanban: kartu-kartu berpindah Antrian →
   Dikerjakan → Butuh Approval saat GSTP/GKonten tiba.
4. Pengguna membuka Koneksi: melihat Prime → Riset → Strategi →
   Kreatif → Media → Distribusi, lalu menambahkan edge
   "Riset → Media (referensi visual)" karena ingin Media memakai
   referensi riset langsung.
5. Saat Media bekerja, UI beralih ke Media Studio: gambar hari
   1–7 muncul satu per satu, masing-masing bisa direvisi atau
   disetujui. Bila perintah juga meminta carousel/reels/talking
   head, ketiganya muncul di filter masing-masing dengan status
   yang sama.
6. Setelah GKonten, item berstatus "Siap untuk Post" dan masuk
   daftar Distribusi sebagai DRAF — siap, tetapi belum terbit
   sampai gerbang distribusi diputuskan.

## 6. Prinsip desain yang tetap berlaku dari v1

- Readability dulu (body 14–16px+, label di atas field, tombol
  min 44px berlabel kata lengkap), satu primary action per
  section, navigasi stabil, minimalis dan bersih.
- Biaya selalu Rupiah dulu (USD hanya sebagai sumber).
- Tidak ada draf model yang tampil seolah final; tidak ada
  gambar placeholder yang diklaim sebagai hasil generate.
- Proyek dan koneksi pengguna tidak boleh hilang otomatis saat
  update; hapus hanya atas perintah eksplisit pengguna.
- Gerbang ditegakkan di backend, bukan hanya di UI.

## 7. Yang TIDAK ada di rancangan v2 ini (sengaja)

- Tidak ada autopost/publish live dari Media Studio pada slice
  ini (hasil "Siap untuk Post" ≠ sudah terbit).
- Tidak ada agen yang bisa mengubah gerbang, menghapus proyek,
  atau mengubah koneksi pengguna tanpa perintah pengguna.
- Tidak ada render video/Reels/Talking Head sungguhan di
  prototype klik (prototype memakai placeholder berlabel dummy;
  render sungguhan adalah pekerjaan build, bukan prototype).
- Tidak ada multi-user/peran pada slice ini (satu pengguna per
  instalasi).

## 8. Urutan build setelah rancangan disetujui (usulan)

1. **Prototype klik v2** (langkah ini): Asisten + Kanban +
   Koneksi + Media Studio dengan data dummy TEST, untuk direvisi
   Patria.
2. **Scaffold aplikasi** (Tauri 2 + Svelte 5, provisional, dari
   nol di repo ini): shell 4 mode + chat Prime Agent (mock
   delegasi dulu).
3. **Wiring agen + Kanban:** delegasi sungguhan ke pipeline yang
   sudah ada (Fase 1–2), kartu Kanban dari status job nyata (SSE).
4. **Kanvas koneksi:** simpan/baca edge per proyek, tambah edge
   oleh pengguna.
5. **Media Studio nyata:** gambar dari provider aktif (setelah
   Meta aktif), carousel sebagai turunan gambar, reels dan
   talking head dari pipeline media (di luar slice bila provider
   belum siap — maka statusnya "Segera", bukan pura-pura jadi).
6. **Paket install:** .dmg (Mac) dan .msi (Windows), uji instal
   bersih.

## 9. Pertanyaan yang masih menunggu Patria

- Daftar agen final: apakah 6 agen di atas sudah tepat, atau ada
  agen yang ditambah/digabung (mis. agen Finance untuk spending)?
- Harness skill per agen: apakah ada skill yang harus ditambah
  atau dipindah antar agen?
- Apakah Kanban 5 kolom sudah tepat, atau ada kolom yang diubah?
- Apakah Media Studio harus menjadi tab terpisah atau panel yang
  menempel di samping Kanban?
