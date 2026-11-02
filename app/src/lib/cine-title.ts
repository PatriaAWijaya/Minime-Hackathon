// Template pola sinematik "VLOG CINEMATIC" (v202) — dari dokumen pola
// ~/workspace/specs-visualisasi/pola-prompt-video-reels.md (analisis frame
// + ffprobe video referensi kiriman Patria 2 Nov 2026 01:02; 28,3 detik,
// 720x1280 9:16, 10 beat: kartu judul 4 detik + 9 beat alam 2-3 detik +
// fade to black; kamera lambat saja; grade golden-hour; tanpa manusia;
// tanpa teks selain kartu judul).
// Beat 2-10 = prompt footage verbatim dari §5 dokumen (satu prompt =
// satu klip; generate per beat, lalu trim 2-3 detik di timeline ve2).
// Kartu judul = komposisi HyperFrames mandiri (teks di atas footage
// BELUM bisa burn-in di app — batas jujur §6 dokumen — jadi kartu judul
// versi app = klip teks di atas latar gelap/gradien di awal timeline,
// BUKAN teks menempel di atas footage seperti referensi).
// File ini .ts biasa, jadi string </script> di dalam komposisi aman
// (masalah </script> hanya berlaku di dalam blok <script> file .svelte).

export interface CineBeat {
  n: number;
  prompt: string;
}

export const CINE_BEATS: CineBeat[] = [
  { n: 2, prompt: 'Aerial drone hutan autumn dan jalan berkelok dari ketinggian, slow push, golden hour, cinematic warm grade, 8 detik, vertikal 9:16, tanpa manusia, tanpa teks.' },
  { n: 3, prompt: 'Aerial drone lembah sungai di antara hutan autumn, slow drift, golden hour, cinematic warm grade, 8 detik, vertikal 9:16, tanpa manusia, tanpa teks.' },
  { n: 4, prompt: 'Ground-level jeram sungai, flare matahari menembus pepohonan, static dengan drift pelan, golden hour backlight, cinematic warm grade, 8 detik, vertikal 9:16, tanpa manusia, tanpa teks.' },
  { n: 5, prompt: 'Macro close-up bunga backlit dengan bokeh, depth-of-field dangkal, static, golden hour, cinematic warm grade, 8 detik, vertikal 9:16, tanpa teks.' },
  { n: 6, prompt: 'Aerial drone tebing pantai dan ombak, cahaya emas sore, slow push, cinematic warm grade, 8 detik, vertikal 9:16, tanpa manusia, tanpa teks.' },
  { n: 7, prompt: 'Ground-level ombak pecah di karang, langit biru berawan, static, cahaya siang hangat, cinematic warm grade, 8 detik, vertikal 9:16, tanpa manusia, tanpa teks.' },
  { n: 8, prompt: 'Ground-level burung camar terbang di atas ombak, slow follow, cahaya sore, cinematic warm grade, 8 detik, vertikal 9:16, tanpa teks.' },
  { n: 9, prompt: 'Laut saat sunset, horizon emas, ombak lembut, static dengan drift pelan, golden hour, cinematic warm grade, 8 detik, vertikal 9:16, tanpa manusia, tanpa teks.' },
  { n: 10, prompt: 'Pantai saat sunset, burung di langit oranye, ombak ke pasir, static, golden hour, cinematic warm grade, 8 detik, vertikal 9:16, tanpa manusia, tanpa teks. Akhiri fade to black.' },
];

export const CINE_TITLECARD_HTML = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="./gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { width: 100%; height: 100%; position: relative; font-family: sans-serif; background: linear-gradient(180deg, #1a1207 0%, #000 55%, #1a1207 100%); }
      #cat { position: absolute; top: 780px; left: 0; width: 1080px; text-align: center; color: #ffffff; font-size: 54px; font-weight: 600; letter-spacing: 0.35em; }
      #title { position: absolute; top: 870px; left: 0; width: 1080px; text-align: center; color: #e8b84b; font-size: 150px; font-weight: 800; letter-spacing: -0.02em; }
      #credit { position: absolute; top: 1070px; left: 0; width: 1080px; text-align: center; color: #ffffff; font-size: 44px; font-weight: 500; }
      #fade { position: absolute; top: 0; left: 0; width: 1080px; height: 1920px; background: #000; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="cine-title" data-start="0" data-duration="4" data-width="1080" data-height="1920">
      <div id="cat" class="clip" data-start="0" data-duration="4" data-track-index="0">VLOG</div>
      <h1 id="title" class="clip" data-start="0" data-duration="4" data-track-index="1">CINEMATIC</h1>
      <div id="credit" class="clip" data-start="0" data-duration="4" data-track-index="2">A Video by Your Name</div>
      <div id="fade" class="clip" data-start="0" data-duration="1" data-track-index="3"></div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#fade", { opacity: 1 }, { opacity: 0, duration: 1.0, ease: "none" }, 0);
      tl.fromTo("#cat", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out" }, 0.2);
      tl.fromTo("#title", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.0, ease: "power3.out" }, 0.3);
      tl.fromTo("#credit", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out" }, 0.8);
      window.__timelines["cine-title"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
