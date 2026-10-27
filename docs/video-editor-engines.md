# Engine Video/Timeline Editor MiniMe — Evaluasi 27 Okt 2026 sore

Keputusan provisional Diffusion siang 27 Okt dikesampingkan atas perintah
Patria ("abaikan keputusan tadi siang"), lalu dievaluasi ulang dari nol:
bisakah kita membangun video editor seperti Diffusion Studio dengan
engine kita sendiri? **Vonis: BELUM BISA lengkap.** Yang dikerjakan
sekarang adalah UI-nya dulu (view Video Editor di prototipe v5); daftar
di bawah adalah engine yang harus dilengkapi agar editor itu nyata.

## Yang sudah ada (tool, bukan karya event)

- **FFmpeg / ffprobe (CLI)** — ada di paket install Minime (Minime, Ollama,
  FFmpeg, OpenCode, Postiz). Bisa potong, gabung, scale/crop, overlay,
  mix audio, encode. BELUM di-wire ke repo hackathon mana pun.
- **HyperFrames (Apache-2.0, CLI)** — render MP4 dari komposisi HTML
  (draft 6 dtk 1080p ±15 dtk tanpa GPU; butuh Node 22+, FFmpeg, Chrome
  Headless). Hanya untuk motion graphics berbasis HTML — BUKAN editor
  timeline footage (tidak ada trim klip, mixing audio, preview canvas).
- **Minime v2 (repo lama, pre-event)** — `assemble_video_ai` (FFmpeg:
  concat footage + narasi + burn subtitle, 9:16/16:9), `text_to_video`
  (Wan/LTX via fal.ai), `hyperframes_assemble`, `pexels_search`. Ini
  referensi pola SAJA — TIDAK di-copy ke repo hackathon (keputusan repo
  dari nol 27 Okt; kode pre-event juga bukan karya event untuk demo
  Indie).

## Yang harus dilengkapi (checklist)

1. **Model komposisi timeline** — project → sequence → klip (sumber,
   mulai, durasi, trim, track, efek, caption) dalam JSON yang bisa
   disimpan. Kode sendiri, dibangun selama event. [BELUM]
2. **Compiler timeline → perintah render** — dari JSON timeline menjadi
   filter graph FFmpeg (trim, concat, scale/crop, overlay, mix, encode).
   [BELUM]
3. **Preview engine (tersulit)** — playback komposisi real-time
   multi-track + overlay + transisi. Kandidat: canvas + WebCodecs di
   WebView (terbatas di WKWebView macOS), atau frame server headless
   ala Diffusion `capture` (render frame on demand). [BELUM]
4. **Probe & inspeksi media** — wrapper ffprobe (durasi, codec, track),
   filmstrip/thumbnail, waveform audio. [BELUM di-wire]
5. **Transkripsi & caption** — Whisper lokal dengan word-level timestamps
   → track subtitle/caption (dan "buang filler word"). [BELUM di-wire]
6. **Audio engine** — mix voice-over + musik + SFX, ducking, data
   waveform untuk tampilan. [BELUM]
7. **Asset library** — impor media, hashing, thumbnail, manifest proyek.
   [BELUM]
8. **Motion graphics & teks** — HyperFrames untuk komposisi HTML;
   overlay teks via FFmpeg drawtext/ASS. [SEBAGIAN]
9. **Agent tool layer (MCP/CLI)** — `probe / grab / transcribe / check /
   capture / render` sebagai tool yang bisa dipanggil agen, pola
   Diffusion. [BELUM]
10. **Encoder final + QC** — render MP4 final + `check` (black-frame,
    gap, klip tak terlihat) + `capture` verifikasi sebelum kirim.
    [BELUM]

## Aturan yang tetap berlaku

- Engine pihak ketiga (FFmpeg, Whisper, HyperFrames, mediabunny) adalah
  TOOL, bukan karya event: boleh dipakai, tidak boleh diklaim sebagai
  build hackathon.
- Kode Minime lama tidak di-copy ke repo hackathon.
- Demo Indie hanya menampilkan yang dibangun 27 Okt–4 Nov 2026.
