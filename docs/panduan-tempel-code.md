# Panduan: Menghubungkan Kanal Meta dengan Tempel Code

Wizard ini untuk user MiniMe yang menghubungkan kanal Meta (Instagram, Facebook Page)
dan jalur otomatisnya gagal. Ditulis dari pengalaman live 31 Okt 2026: 6 percobaan
otomatis gagal, lalu tempel code berhasil sampai kanal Terhubung.

## Kapan pakai cara ini

Pakai tempel code bila salah satu ini terjadi saat Hubungkan:

- Browser menampilkan **"This site can't be reached / localhost refused to connect"**
  sesudah klik Lanjutkan di dialog Meta.
- MiniMe menampilkan nota **"Waktu tunggu login habis"** (listener sudah mati).

Halaman refused BUKAN kegagalan. Itu hanya berarti penunggu callback MiniMe tidak
menangkap redirect — code-nya sudah diterbitkan Meta dan bisa dipakai manual.
Form tempel muncul otomatis saat connect kanal Meta dimulai; tidak perlu menunggu
timeout, dan tempel code TIDAK punya batas waktu seperti listener.

## Prasyarat

- Aplikasi Meta (developers.facebook.com) dengan produk Facebook Login; URI
  `http://localhost:4317/callback` sudah tersimpan di Valid OAuth Redirect URIs.
- Akun Instagram Bisnis/Kreator yang tertaut ke Halaman Facebook yang Anda admin.
- App ID + App Secret aplikasi Meta tersebut.

## Langkah-langkah

1. Di Planner MiniMe, klik **+ Tambah Channel**, lalu pilih **Instagram**
   (atau Facebook Page).
2. Bila wizard "Panduan Hubungkan" muncul, ikuti 4 langkahnya berurutan:
   buat aplikasi, salin URI, tempel URI di dashboard Meta, isi ID & Secret,
   lalu klik **Hubungkan**. Bila kredensial sudah tersimpan dari percobaan
   sebelumnya, wizard dilewati dan form tempel langsung tampil — itu normal.
3. Browser membuka dialog Meta. Klik **Lanjutkan** (atau "Lanjutkan sebagai …").
4. Dua kemungkinan:
   - (a) Browser menampilkan **"Login selesai"** — jalur otomatis menang.
     Pemilih Halaman muncul sendiri di MiniMe, lanjut ke langkah 7.
   - (b) Browser menampilkan halaman **refused** — lanjut ke langkah 5.
     Jangan klik Reload di halaman refused; itu tidak menghidupkan apa pun.
5. Salin **alamat lengkap** dari address bar browser (mulai
   `http://localhost:4317/callback?code=…` sampai akhir).
6. Tempel ke kolom di MiniMe ("Tempel alamat callback atau code di sini"),
   lalu klik **Gunakan code**. Menempel code-nya saja juga bisa.
7. Nota berubah menjadi **"Menukar code…"**. Bila berhasil, muncul
   **"Pilih Page yang akan dipakai:"** — klik Halaman yang tertaut ke akun
   Instagram Anda. Kanal berubah menjadi **Terhubung** dan muncul di daftar kanal.

## Bila nota menampilkan error

- **"Code tidak ditemukan — tempel alamat lengkap dari browser atau code-nya
  saja."** — yang ditempel bukan URL callback / bukan code. Salin ulang alamat
  lengkap dari address bar.
- **"State login tidak cocok — ulangi."** — URL berasal dari percobaan lain.
  Ulangi dari dialog segar (klik tile lagi, dialog baru, Lanjutkan, salin URL baru).
- **"Token Meta gagal (HTTP …)"** — code kedaluwarsa, sudah terpakai, atau ID &
  Secret tidak cocok dengan aplikasi di dialog. Ulangi dialog segar dan pastikan
  ID & Secret berasal dari aplikasi Meta yang sama.
- **"Token Meta tanpa access_token"** atau daftar Page kosong — dialog tidak
  memberi izin yang diminta. Ulangi dialog dan setujui semua izin (termasuk
  daftar Halaman).

## Yang perlu diingat

- Code Meta **sekali pakai dan berumur pendek** (hitungan menit). Setiap
  percobaan butuh dialog segar; jangan tempel ulang code lama.
- Form tempel tetap tampil bila gagal, supaya bisa dicoba ulang dengan code
  baru; tombol **Tutup** menutupnya manual.
- Jalur otomatis tetap menjadi jalur utama; tempel code adalah jalan keluar
  bila callback tidak sampai — bukan pengganti login Meta.
- Code di address bar bersifat rahasia sekali pakai: jangan dibagikan ke siapa
  pun, jangan ditempel di chat publik. Tempel hanya ke kolom MiniMe.
