// Model komposisi timeline + compiler ke perintah FFmpeg — Tier 1 engine video.
// Tier 2: track audio voice/musik + ducking + caption ASS (sidecar, bukan burn-in:
// ffmpeg MacBook tanpa filter subtitles/drawtext — burn-in diblokir, lihat log).
// MURNI: tanpa DOM, tanpa i18n, tanpa invoke. Bisa diuji dari Node lewat tsc.
// Semantik Tier 1:
// - Klip video dirangkai BERURUTAN (concat) sesuai urutan array, masing-masing
//   di-trim dari sumbernya lalu di-scale cover-crop ke ukuran sequence (tanpa
//   distorsi, tanpa bar hitam) + fps sequence.
// - Klip audio dirangkai berurutan dengan volume per klip (0-2).
// - Tanpa klip audio = output video-only (bukan error).
// - Teks: caption ASS sidecar (Tier 2); burn-in BELUM (ffmpeg tanpa subtitles/drawtext).
// - Output Tier 1: MP4 (libx264 + aac).

export interface T1Clip {
  id: string;
  src: string;
  kind: 'video' | 'audio';
  trimIn: number;
  dur: number;
  volume: number;
  track?: 'voice' | 'music';
}

export interface T1Caption {
  text: string;
  start: number;
  end: number;
}

export interface T1Sequence {
  name: string;
  width: number;
  height: number;
  fps: number;
  clips: T1Clip[];
  captions?: T1Caption[];
}

export interface T1Compiled {
  inputs: string[];
  filterComplex: string;
  args: string[];
  output: string;
  videoClips: T1Clip[];
  audioClips: T1Clip[];
  captions: T1Caption[];
  expectedDuration: number;
}

// Error dikembalikan sebagai KEY i18n (t1.err.*) agar panel bisa menerjemahkan.
export function validateSequence(seq: T1Sequence, output: string): string[] {
  const errs: string[] = [];
  const videos = seq.clips.filter((c) => c.kind === 'video');
  if (videos.length === 0) errs.push('t1.err.novideo');
  if (!Number.isInteger(seq.width) || seq.width <= 0) errs.push('t1.err.size');
  if (!Number.isInteger(seq.height) || seq.height <= 0) errs.push('t1.err.size');
  if (!Number.isInteger(seq.fps) || seq.fps < 1 || seq.fps > 120) errs.push('t1.err.fps');
  if (!output || !output.toLowerCase().endsWith('.mp4')) errs.push('t1.err.out');
  for (const c of seq.clips) {
    if (!c.src || !c.src.trim()) errs.push('t1.err.src');
    if (!(c.trimIn >= 0)) errs.push('t1.err.trim');
    if (!(c.dur > 0)) errs.push('t1.err.dur');
    if (c.kind === 'audio' && !(c.volume >= 0 && c.volume <= 2)) errs.push('t1.err.vol');
  }
  for (const cap of seq.captions ?? []) {
    if (!cap.text || !cap.text.trim()) errs.push('t2.err.captext');
    if (!(cap.start >= 0) || !(cap.end > cap.start)) errs.push('t2.err.caprange');
  }
  return [...new Set(errs)];
}

function assTime(t: number): string {
  const cs = Math.max(0, Math.floor(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${h}:${pad(m, 2)}:${pad(sec, 2)}.${pad(c, 2)}`;
}

// Caption -> ASS (sidecar). Bukan burn-in: compiler TIDAK memancarkan filter
// subtitles karena ffmpeg MacBook tidak punya filter itu (terbukti 27 Okt malam).
export function assFromCaptions(captions: T1Caption[], width: number, height: number): string {
  const lines = captions.map((c) => {
    const text = c.text.replace(/\r\n?/g, '\\N').replace(/\n/g, '\\N');
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${text}`;
  });
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H80000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines,
    '',
  ].join('\n');
}

export function compileTimeline(seq: T1Sequence, output: string): T1Compiled {
  const videos = seq.clips.filter((c) => c.kind === 'video');
  if (videos.length === 0) throw new Error('t1.err.novideo');
  const audios = seq.clips.filter((c) => c.kind === 'audio');
  // Input unik sesuai urutan pemakaian pertama (video dulu, lalu audio).
  const inputs: string[] = [];
  const indexOf = (src: string): number => {
    let i = inputs.indexOf(src);
    if (i === -1) {
      inputs.push(src);
      i = inputs.length - 1;
    }
    return i;
  };
  const parts: string[] = [];
  const vlabels: string[] = [];
  videos.forEach((c, n) => {
    const k = indexOf(c.src);
    const end = c.trimIn + c.dur;
    parts.push(
      `[${k}:v]trim=start=${c.trimIn}:end=${end},setpts=PTS-STARTPTS,` +
        `scale=${seq.width}:${seq.height}:force_original_aspect_ratio=increase,` +
        `crop=${seq.width}:${seq.height},fps=${seq.fps}[v${n}]`,
    );
    vlabels.push(`[v${n}]`);
  });
  parts.push(`${vlabels.join('')}concat=n=${videos.length}:v=1:a=0,format=yuv420p[vout]`);
  // Tier 2: audio dipisah per track. Voice dirangkai sendiri; musik dirangkai
  // sendiri lalu di-ducking oleh voice (sidechaincompress) dan di-mix (amix).
  // Tanpa musik: bentuk Tier 1 (concat langsung ke [aout]). Tanpa voice:
  // musik saja tanpa ducking. Tanpa audio: video-only (seperti Tier 1).
  const voice = audios.filter((c) => c.track !== 'music');
  const music = audios.filter((c) => c.track === 'music');
  const voLabels: string[] = [];
  voice.forEach((c, n) => {
    const k = indexOf(c.src);
    const end = c.trimIn + c.dur;
    parts.push(
      `[${k}:a]atrim=start=${c.trimIn}:end=${end},asetpts=PTS-STARTPTS,` +
        `volume=${c.volume}[va${n}]`,
    );
    voLabels.push(`[va${n}]`);
  });
  const muLabels: string[] = [];
  music.forEach((c, n) => {
    const k = indexOf(c.src);
    const end = c.trimIn + c.dur;
    parts.push(
      `[${k}:a]atrim=start=${c.trimIn}:end=${end},asetpts=PTS-STARTPTS,` +
        `volume=${c.volume}[ma${n}]`,
    );
    muLabels.push(`[ma${n}]`);
  });
  if (voice.length > 0 && music.length > 0) {
    parts.push(`${voLabels.join('')}concat=n=${voice.length}:v=0:a=1[voice]`);
    // Voice dipakai DUA kali (sidechain + amix) -> fan-out eksplisit via asplit.
    // Tanpa asplit, graph gagal binding saat rantai video ikut ada (terbukti
    // manual 27 Okt malam: 'vox matches no streams', padahal audio-only lolos).
    parts.push('[voice]asplit=2[voicemain][voiceside]');
    parts.push(`${muLabels.join('')}concat=n=${music.length}:v=0:a=1[music0]`);
    parts.push('[music0][voiceside]sidechaincompress=threshold=0.05:ratio=8:attack=200:release=500[musicduck]');
    parts.push('[voicemain][musicduck]amix=inputs=2:duration=longest[aout]');
  } else if (voice.length > 0) {
    parts.push(`${voLabels.join('')}concat=n=${voice.length}:v=0:a=1[aout]`);
  } else if (music.length > 0) {
    parts.push(`${muLabels.join('')}concat=n=${music.length}:v=0:a=1[aout]`);
  }
  const args: string[] = ['-nostdin', '-y'];
  for (const src of inputs) args.push('-i', src);
  args.push('-filter_complex', parts.join(';'));
  args.push('-map', '[vout]');
  if (audios.length > 0) args.push('-map', '[aout]');
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(seq.fps));
  if (audios.length > 0) args.push('-c:a', 'aac', '-b:a', '160k');
  args.push(output);
  return {
    inputs,
    filterComplex: parts.join(';'),
    args,
    output,
    videoClips: videos,
    audioClips: audios,
    captions: seq.captions ?? [],
    expectedDuration: videos.reduce((s, c) => s + c.dur, 0),
  };
}
