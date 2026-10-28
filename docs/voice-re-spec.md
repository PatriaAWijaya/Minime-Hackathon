# Spec hasil RE — VoiceStudio (perilaku, bukan kode) → rebuild native hackathon

Tanggal: 28 Okt 2026. Target: **app hackathon MiniMe** (koreksi Patria 16:28 WIB —
bukan Minime v2; Minime v2 hanya prior art/integrasi referensi).
Metode: observasi runtime live di MacBook + struktur bundle (nama file saja).
Garis keras: yang di-reverse = perilaku (endpoint, parameter, bentuk output,
alur UI). TIDAK menyalin/menempel kode VoiceStudio, TIDAK memakai bobot
modelnya, TIDAK me-rebrand, TIDAK membongkar watermark/lisensi/gate consent.
Clone suara tetap hanya suara pemilik sendiri + consent (gate sama seperti
Pipeline). Kode aplikasi VoiceStudio tidak dikutip di dokumen ini.

## 1. Yang diamati (bukti live, 28 Okt 2026)

Transport: HTTP lokal `127.0.0.1:3900`, API kompatibel OpenAI.
Backend: Python (pyproject.toml, uv.lock, Python 3.11.16, torch 2.8.0 —
terbaca dari respons engine) di dalam bundle Electron (app.asar).
Struktur bundle (nama saja): app.asar, backend/, omnivoice/, native/,
tools/, brand/, LICENSE, README.md.

### GET /v1/models — daftar model (OpenAI-compatible list)
Objek: `{"object":"list","data":[...]}`; tiap item:
`id, object:"model", created:0, owned_by:"voicestudio",
voicestudio:{kind, alias_for_active_engine}`.
- TTS alias (alias_for_active_engine=true): tts-1, tts-1-hd, gpt-4o-mini-tts
- TTS engine (false): omnivoice, kittentts, mlx-audio
- STT alias: whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe
- STT engine: faster-whisper
Catatan: nama alias bergaya OpenAI; yang dieksekusi = engine aktif.

### GET /v1/audio/voices — daftar voice + engine
Bentuk: `{"voices":[...],"engines":[...]}`.
- Voice alias (type openai_alias, 13 nama): alloy, ash, ballad, cedar,
  coral, echo, fable, marin, nova, onyx, sage, shimmer, verse — deskripsi
  masing-masing: "maps to the active VoiceStudio engine's default voice".
  Artinya: BUKAN 13 suara berbeda; semua alias mengarah ke suara default
  engine aktif. Rebuild TIDAK perlu meniru alias ini.
- Voice profil: demo0001 "VoiceStudio Demo Voice" (type profile, English).
- Engine omnivoice (terbaca penuh): display "VoiceStudio (k2-fsa/OmniVoice,
  600+ languages)", available=true, supports_cloning=true,
  supports_emotion=false, max_ref_seconds=20.0, ref_strategy="best_window",
  estimasi unduh model ~2,58 GB. Engine lain (kittentts, mlx-audio, dst)
  hanya terbaca sebagian (respons 36 KB terpotong di tengah) — dicatat
  sebagai bukti parsial, tidak diklaim.

### POST /v1/audio/speech — TTS (terbukti live)
Request JSON: `{model, input, voice, response_format:"wav", speed,
language:"id"}`. Respons: byte WAV langsung (bila JSON, berisi path audio
untuk diunduh susulan — tidak terjadi pada uji ini).
Bukti 28 Okt 16:26: model omnivoice, voice default, kalimat Indonesia
"Halo, ini uji suara otomatis MiniMe." → WAV 113.324 byte, durasi 2,36 dtk.

### POST /generate — clone (kontrak dari integrasi, BUKAN probe live)
Multipart: text, language:"id", ref_audio (file), ref_text (opsional),
speed. Respons: WAV. Probe live TIDAK dijalankan di tahap ini — clone
butuh file referensi suara pemilik + consent; itu pekerjaan tahap 2/4
(QC), bukan observasi.

### Alur UI (VoiceStudio app ↔ tab Voice MiniMe, sudah sejalan)
Status → daftar voice → TTS (naskah/voice/speed) → clone (naskah +
referensi + teks referensi + speed) → daftar model → player + unduh WAV.
Tab Voice hackathon sudah mencerminkan alur ini (status pill, voice
select, TTS, clone, model list, player + download).

### Di luar scope rebuild (TIDAK ditiru)
Dubbing, terjemahan, podcast multi-speaker, engine lain (kittentts,
mlx-audio), STT (sudah ditutup Tier 2 chunk 3 via Whisper), server MCP,
katalog/ unduhan model, emosi. Scope rebuild = workflow harian MiniMe:
TTS Indonesia + daftar voice + speed + player + unduh WAV + clone
suara pemilik.

## 2. Batas alat REA (dicatat jujur)
Skill REA dibaca; jalur CLI-nya TIDAK dijalankan: `rea-agents doctor`
di MacBook menyatakan environment tidak sehat karena Node 24.19.0 di
bawah syarat rea-agents 6.8.0 (>=24.22.1). Memasang Node baru adalah
perubahan sistem → butuh persetujuan Patria, tidak dilakukan diam-diam.
Analisis asar TIDAK dibutuhkan untuk scope minimal ini (endpoint yang
diperlukan sudah terbukti dari runtime); bila scope membesar, analisis
asar menunggu upgrade Node yang disetujui. Tidak ada evidence_id REA
yang diklaim — bukti tahap ini = probe live di atas + riwayat integrasi.

## 3. Keputusan rebuild (masukan tahap 2)

### Engine TTS: sherpa-onnx — TER VERIFIKASI Apache-2.0
Kode Next-gen Kaldi berlisensi Apache-2.0 (catatan lisensi k2-fsa +
metadata npm sherpa-onnx-darwin-x64). API Rust-nya ada (OfflineTts
VITS: model + tokens + data_dir, GenerationConfig sid/speed) — bentuk
yang dipakai prototipe tahap 2. Runtime CPU, cocok untuk M1 8 GB
(verifikasi latensi/RAM di tahap 4).

### Voice Indonesia: file TERIDENTIFIKASI, lisensi dataset BELUM terverifikasi
Repo rhasspy/piper-voices (model repo, diakses via API publik):
`id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx` (62.950.044 byte)
+ `id_ID-news_tts-medium.onnx.json`. Konfig: sample_rate 22050,
phoneme_type espeak, espeak voice "id", 1 speaker, noise_scale 0.667,
length_scale 1.0, noise_w 0.8 — langsung dipetakan ke config sherpa.
MODEL_CARD voice itu: bahasa id_ID, 1 speaker, medium, 22050 Hz,
"Finetuned from U.S. English lessac voice (medium quality)",
dataset: URL Kaggle + "License: See URL". Artinya: lisensi dataset
voice ini BELUM dibaca — tahap 2 wajib membaca halaman Kaggle itu
sebelum voice di-bundle, dan ada kejanggalan judul (URL menyebut
Malayalam, bukan Indonesia) yang harus diklarifikasi, bukan diabaikan.
Bila lisensinya restriktif, voice diganti — engine tetap sherpa-onnx.

### espeak-ng-data: SATU-SATUNYA pertanyaan lisensi yang mengubah bentuk paket
VITS butuh data_dir espeak-ng-data (phonemization). espeak-ng sendiri
proyek GPL-3.0. Apakah mengikutkan data-nya sebagai data runtime
(bukan kode tertaut) memengaruhi bundle MIT MiniMe adalah pertanyaan
yang tidak bisa diputus dari hasil pencarian — perlu keputusan Patria:
(a) ikut di-bundle sebagai data (risiko GPL dicatat), atau
(b) diunduh saat setup (pola sama seperti Setup VoiceStudio — data
tidak menjadi bagian bundle yang didistribusikan, tapi native murni
berkurang satu langkah). Keputusan ini ditunggu sebelum prototipe
tahap 2 dipasang permanen.

### Engine clone: BELUM diputuskan
Sherpa-onnx tidak melakukan voice cloning. Clone butuh engine terpisah
(kandidat untuk diverifikasi di tahap 2, bukan keputusan: OpenVoice
dan sejenisnya — lisensinya dicek dulu, tidak diklaim di sini).
Gate consent clone (suara pemilik sendiri) berlaku apa pun engine-nya.

### UI + berdampingan
UI yang diadaptasi = tab Voice hackathon yang sudah ada (bukan UI baru).
Command Tauri sherpa berdampingan dengan command VoiceStudio lama selama
tahap 2 (perbandingan apel-ke-apel); default dialihkan hanya setelah
tahap 4 lolos.

## 4. Yang masih belum diketahui (unknowns)
1. Lisensi dataset voice id_ID-news_tts-medium (baca halaman Kaggle di
   MODEL_CARD; klarifikasi judul Malayalam).
2. Perlakuan lisensi espeak-ng-data (keputusan Patria: bundle vs unduh
   saat setup).
3. Engine clone + lisensinya.
4. Inventaris endpoint di luar probe runtime (hanya relevan bila scope
   membesar; butuh analisis asar + upgrade Node yang disetujui).
5. Kualitas perseptual pelafalan Indonesia voice baru (butuh telinga
   Patria di tahap 4 — tidak bisa diputus dari angka saja).
