// Model komposisi timeline + compiler ke perintah FFmpeg — Tier 1 engine video.
// MURNI: tanpa DOM, tanpa i18n, tanpa invoke. Bisa diuji dari Node lewat tsc.
// Semantik Tier 1:
// - Klip video dirangkai BERURUTAN (concat) sesuai urutan array, masing-masing
//   di-trim dari sumbernya lalu di-scale cover-crop ke ukuran sequence (tanpa
//   distorsi, tanpa bar hitam) + fps sequence.
// - Klip audio dirangkai berurutan dengan volume per klip (0-2).
// - Tanpa klip audio = output video-only (bukan error).
// - Teks/overlay BELUM di Tier 1 (engine #8) — kind hanya 'video' | 'audio'.
// - Output Tier 1: MP4 (libx264 + aac).

export interface T1Clip {
  id: string;
  src: string;
  kind: 'video' | 'audio';
  trimIn: number;
  dur: number;
  volume: number;
}

export interface T1Sequence {
  name: string;
  width: number;
  height: number;
  fps: number;
  clips: T1Clip[];
}

export interface T1Compiled {
  inputs: string[];
  filterComplex: string;
  args: string[];
  output: string;
  videoClips: T1Clip[];
  audioClips: T1Clip[];
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
  return [...new Set(errs)];
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
  const alabels: string[] = [];
  audios.forEach((c, n) => {
    const k = indexOf(c.src);
    const end = c.trimIn + c.dur;
    parts.push(
      `[${k}:a]atrim=start=${c.trimIn}:end=${end},asetpts=PTS-STARTPTS,` +
        `volume=${c.volume}[a${n}]`,
    );
    alabels.push(`[a${n}]`);
  });
  if (audios.length > 0) {
    parts.push(`${alabels.join('')}concat=n=${audios.length}:v=0:a=1[aout]`);
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
    expectedDuration: videos.reduce((s, c) => s + c.dur, 0),
  };
}
