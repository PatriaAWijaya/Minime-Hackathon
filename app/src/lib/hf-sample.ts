// Komposisi contoh panel HyperFrames (v175) — adaptasi langsung dari
// komposisi probe 29 Okt 2026 yang LOLOS (struktur, atribut, dan timing
// dipertahankan; hanya teks yang diganti). File ini .ts biasa, jadi
// string </script> di dalamnya aman (masalah </script> hanya berlaku
// di dalam blok <script> file .svelte).
export const HF_SAMPLE = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="./gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #0e0e0e; }
      #root { width: 100%; height: 100%; position: relative; font-family: sans-serif; background: #0e0e0e; }
      #title { position: absolute; top: 620px; left: 0; width: 1080px; text-align: center; color: #EB87B4; font-size: 150px; font-weight: 800; letter-spacing: -0.02em; }
      #subtitle { position: absolute; top: 830px; left: 0; width: 1080px; text-align: center; color: #ececec; font-size: 54px; font-weight: 600; }
      #caption { position: absolute; top: 1560px; left: 90px; width: 900px; text-align: center; color: #262626; background: #A6EBB1; border-radius: 24px; padding: 28px 32px; font-size: 44px; font-weight: 600; line-height: 1.3; }
      #bar { position: absolute; bottom: 0; left: 0; height: 18px; background: #EB87B4; width: 1080px; transform-origin: left center; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="15" data-width="1080" data-height="1920">
      <h1 id="title" class="clip" data-start="0" data-duration="15" data-track-index="0">MINIME</h1>
      <div id="subtitle" class="clip" data-start="2" data-duration="13" data-track-index="1">Motion graphics dari HTML</div>
      <div id="caption" class="clip" data-start="5" data-duration="10" data-track-index="2">Komposisi contoh — ubah teksnya, lalu Render.</div>
      <div id="bar" class="clip" data-start="0" data-duration="15" data-track-index="3"></div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#title", { opacity: 0, y: 90 }, { opacity: 1, y: 0, duration: 1.0, ease: "power4.out" }, 0.3);
      tl.fromTo("#subtitle", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, 2);
      tl.fromTo("#caption", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 5);
      tl.fromTo("#bar", { scaleX: 0 }, { scaleX: 1, duration: 15, ease: "none" }, 0);
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
