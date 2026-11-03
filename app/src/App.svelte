<script lang="ts">
  import { onMount } from "svelte";
  import { initV5, setSendChatImpl, doSearch, filterAgents, mediaTab, campaignTab, renderAgents, renderCampaign, cpAddLead, renderDetail, renderKanban, renderLib, renderPlanner, libSetFilter, libToggleView, kbSetProj, runGraphSim, sendChat, showView, toggleAddMenu, waAttach, waMic, waToggleAttach, graphNewProject, graphPrimeFirst, graphZoomIn, graphZoomOut, graphStopSim, getTheme, setTheme, graphClosePanel, renderGraphProjSel, kbTeamOpen, ollamaCheck, libAll } from "./lib/v5logic.js";
  import { getLang, setLang, t } from "./lib/i18n.js";
  import { sendChatReal, connectKey, renderKeyButtons } from "./lib/chat.js";
  import { vsCheck, vsEmbedCheck, vsEmbedReload, vsGenerateTts, vsGenerateClone, vsRenderStatus, vsRefreshVoiceUI } from "./lib/voicestudio.js";
  import { sherpaSetup, sherpaTtsFromTab, sherpaRenderStatus, sherpaRefreshUI } from "./lib/sherpa.js";
  import { vedPlay, vedTrimSel, vedCutSel, vedClearSel, vedRefresh } from "./lib/voice-editor.js";
  import { initScriptEditor, setSeMenu, seRefreshUI } from "./lib/script-editor.js";
  import { initImageFlow, imgRefreshUI } from "./lib/image-flow.js";
  import { initBrand, brandRefreshUI } from "./lib/brand.js";
  import { readImgSpend } from "./lib/image-api.js";
  import { assFromCaptions, compileTimeline, validateSequence } from "./lib/video.js";
  import { readVideoSpend, omniGenerateClip, omniPriceUsd, mimeForB64, b64FromBytes } from "./lib/omni-gen.js";
  import { wanGenerateClip, wanPriceUsd, readClassaiSpend } from "./lib/classai-video.js";
  import { CINE_BEATS, CINE_TITLECARD_HTML } from "./lib/cine-title.js";
  import { open as pickFiles } from "@tauri-apps/plugin-dialog";
  import { HF_SAMPLE } from "./lib/hf-sample.js";
  import { hfGenerateHtml } from "./lib/hf-gen.js";
  import { readKeys } from "./lib/chat.js";
  import { BILLING_HARD_LIMIT, COST_ROWS, COST_TOTAL, fmtIdr, fmtIdrNum, fmtInt, fmtUsd, readLiveCost } from "./lib/cost.js";
  import type { T1Caption, T1Clip, T1Sequence } from "./lib/video.js";
  import { invoke } from "@tauri-apps/api/core";

  let lang = $state(getLang());
  let theme = $state(getTheme());

  function applyThemeSel(value: string) {
    const next = value === 'dark' || value === 'light' ? value : 'system';
    theme = next;
    setTheme(next);
  }
  let imgSpend = $state(readImgSpend());
  let liveCost = $state(readLiveCost());
  let videoSpend = $state(readVideoSpend());
  let classaiSpend = $state(readClassaiSpend());

  function applyLanguage(value: string) {
    const next = value === 'en' || value === 'zh' ? value : 'id';
    lang = next;
    setLang(next);
    renderAgents();
    renderKanban();
    renderPlanner();
    renderLib();
    imgRefreshUI();
    brandRefreshUI();
    renderCampaign();
    renderDetail();
    vsRefreshVoiceUI();
    sherpaRefreshUI();
    seRefreshUI();
    renderKeyButtons();
  }

  onMount(() => {
    initV5();
    renderCampaign();
    setSendChatImpl(sendChatReal);
    vsRenderStatus();
    sherpaRefreshUI();
    vsCheck();
    vsEmbedCheck();
    initScriptEditor();
    initImageFlow();
    initBrand();
    (window as unknown as Record<string, unknown>).refreshImgSpend = () => { imgSpend = readImgSpend(); };
    (window as unknown as Record<string, unknown>).refreshLiveCost = () => { liveCost = readLiveCost(); imgSpend = readImgSpend(); videoSpend = readVideoSpend(); };
    (window as unknown as Record<string, unknown>).veSetPlan = (t: string) => { ve2Plan = t; ve2SaveState(); };
    renderKeyButtons();
  });


  // ---- Engine Video Editor ve2 NYATA (v80, gantikan simulasi) ----
  // State timeline + aset tersimpan di localStorage minime.ve2 (pola
  // yang sama dengan Kanban: tiap mutasi lalu simpan). Pratinjau
  // memakai elemen <video>/<audio> + file dibaca lewat video_read
  // (cap 20 MB, sama dengan image_read/audio_read). Ekspor memakai
  // compiler Tier 1 yang sudah terbukti (compileTimeline) + QC +
  // frame tengah; efek Fade diterapkan sebagai fade in/out pada
  // hasil akhir (pass kedua), efek Zoom hanya zoom tampilan
  // pratinjau (bukan filter render). B-Roll ikut dirangkai sebagai
  // klip gambar berurutan bersama track Video.
  interface Ve2Clip { id: string; name: string; track: 'Video' | 'B-Roll' | 'Audio' | 'Teks'; start: number; dur: number; src: string; effect: 'none' | 'fade' | 'zoom'; }
  interface Ve2Asset { id: string; name: string; icon: string; kind: 'Video' | 'B-Roll' | 'Audio' | 'Teks' | 'Image'; src: string; duration: number; }
  function ve2Load(): { clips: Ve2Clip[]; assets: Ve2Asset[]; out: string; zoom: number; plan: string; snap: boolean; ratio: string } | null {
    try {
      const raw = localStorage.getItem('minime.ve2');
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (!Array.isArray(v.clips) || !Array.isArray(v.assets)) return null;
      const tracks = ['Video', 'B-Roll', 'Audio', 'Teks'];
      const clips: Ve2Clip[] = v.clips.filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string' && Number.isFinite(c.start) && Number.isFinite(c.dur)).map((c: any) => ({ id: c.id, name: c.name, track: (tracks.includes(c.track) ? c.track : 'Video') as Ve2Clip['track'], start: Number(c.start), dur: Number(c.dur), src: typeof c.src === 'string' ? c.src : '', effect: (['fade', 'zoom'].includes(c.effect) ? c.effect : 'none') as Ve2Clip['effect'] }));
      const assetKinds = [...tracks, 'Image'];
      const assets: Ve2Asset[] = v.assets.filter((a: any) => a && typeof a.id === 'string' && typeof a.name === 'string').map((a: any) => ({ id: a.id, name: a.name, icon: typeof a.icon === 'string' ? a.icon : '🎬', kind: (assetKinds.includes(a.kind) ? a.kind : 'Video') as Ve2Asset['kind'], src: typeof a.src === 'string' ? a.src : '', duration: Number.isFinite(a.duration) ? Number(a.duration) : 0 }));
      return { clips, assets, out: typeof v.out === 'string' ? v.out : '', zoom: [0.5, 1, 2].includes(Number(v.zoom)) ? Number(v.zoom) : 1, plan: typeof v.plan === 'string' ? v.plan : '', snap: typeof v.snap === 'boolean' ? v.snap : true, ratio: ['16:9', '9:16', '1:1', '4:5'].includes(v.ratio) ? v.ratio : '9:16' };
    } catch { return null; }
  }
  const ve2Loaded = ve2Load();
  // v146: dummy Video Editor dihapus total (perintah Patria 1 Nov 10:59).
  // State lama yang masih memuat klip/aset bawaan (id ve2c*/ve2a*) dianggap
  // proyek dummy -> seluruh timeline dikosongkan sekali jalan, lalu disimpan.
  // Klip/aset baru tidak pernah memakai id tersebut, jadi aturan ini tidak
  // akan terpicu lagi setelah migrasi.
  const VE2_DUMMY_CLIP_IDS = ['ve2c1', 've2c2', 've2c3', 've2c4', 've2c5', 've2c6', 've2c7', 've2c8'];
  const VE2_DUMMY_ASSET_IDS = ['ve2a1', 've2a2', 've2a3', 've2a4', 've2a5'];
  const ve2IsDummy = !!ve2Loaded && (ve2Loaded.clips.some((c) => VE2_DUMMY_CLIP_IDS.includes(c.id)) || ve2Loaded.assets.some((a) => VE2_DUMMY_ASSET_IDS.includes(a.id)));
  let ve2Clips = $state<Ve2Clip[]>(ve2IsDummy ? [] : (ve2Loaded?.clips ?? []));
  let ve2Assets = $state<Ve2Asset[]>(ve2IsDummy ? [] : (ve2Loaded?.assets ?? []));
  let ve2Out = $state(ve2Loaded?.out || '/Users/mac/Movies/minime-ve2.mp4');
  let ve2Zoom = $state(ve2Loaded?.zoom ?? 1);
  let ve2PreviewRatio = $state(ve2Loaded?.ratio ?? '9:16');
  let ve2RatioCss = $derived(ve2PreviewRatio.replace(':', ' / '));
  let ve2Plan = $state(ve2Loaded?.plan ?? '');
  let ve2Snap = $state(ve2Loaded?.snap ?? true);
  if (ve2IsDummy) ve2SaveState();
  // v187: klip yang masuk timeline dari generator (HF/Omni) tidak pernah
  // menambah daftar aset — backfill satu kali saat muat: tiap klip bersrc
  // yang belum punya aset mendapat asetnya (jenis dari ekstensi).
  // Dibaca dari ve2Loaded (bukan dari $state) agar tidak memicu warning
  // state_referenced_locally — backfill memang memakai nilai awal muat.
  const ve2InitClips = ve2IsDummy ? [] : (ve2Loaded?.clips ?? []);
  const ve2InitAssets = ve2IsDummy ? [] : (ve2Loaded?.assets ?? []);
  const ve2Orphans = ve2InitClips.filter((c) => c.src && !ve2InitAssets.some((a) => a.src === c.src));
  if (ve2Orphans.length) {
    ve2Orphans.forEach((c, i) => ve2EnsureAsset(c.src, c.name, ve2IsImage(c.src) ? 'Image' : ve2IsAudio(c.src) ? 'Audio' : 'Video', c.dur, i));
    ve2SaveState();
  }
  let ve2SelId = $state(ve2Clips[0]?.id ?? '');
  let ve2Status = $state('');
  let ve2Frame = $state('');
  let ve2Busy = $state(false);
  let ve2Playing = $state(false);
  let ve2Playhead = $state(0);
  let ve2VideoOn = $state(false);
  let ve2VideoEl = $state<HTMLVideoElement>();
  let ve2NewSrc = $state('');
  let ve2NewKind = $state('Video');
  let ve2Thumbs = $state<Record<string, string>>({});
  const ve2ThumbFailed = new Set<string>();
  const ve2ThumbLoading = new Set<string>();
  let ve2AssetDlg = $state(false);
  let ve2LibDlg = $state(false);
  let ve2LibList = $state<{ title: string; file: string }[]>([]);
  $effect(() => {
    // v188: thumbnail daftar aset — gambar dibaca langsung, video dari
    // frame capture, audio cukup ikon (tanpa byte media).
    const seen = new Set<string>();
    for (const a of ve2Assets) {
      seen.add(a.id);
      if (!a.src || a.kind === 'Audio' || ve2Thumbs[a.id] || ve2ThumbFailed.has(a.id) || ve2ThumbLoading.has(a.id)) continue;
      ve2ThumbLoading.add(a.id);
      (async () => {
        try {
          if (a.kind === 'Image' || ve2IsImage(a.src)) {
            const r = await invoke<{ b64: string }>('video_read', { req: { path: a.src } });
            if (!r.b64) throw new Error('empty');
            const ext = a.src.split('.').pop()?.toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg';
            ve2Thumbs[a.id] = `data:${mime};base64,${r.b64}`;
          } else {
            const cap = await invoke<{ data_url: string }>('video_capture', { req: { path: a.src, at: 0.5 } });
            if (!cap.data_url) throw new Error('empty');
            ve2Thumbs[a.id] = cap.data_url;
          }
        } catch {
          ve2ThumbFailed.add(a.id);
        } finally {
          ve2ThumbLoading.delete(a.id);
        }
      })();
    }
    for (const id of Object.keys(ve2Thumbs)) if (!seen.has(id)) delete ve2Thumbs[id];
  });
  let ve2Timer: ReturnType<typeof setInterval> | null = null;
  let ve2AudioTimers: ReturnType<typeof setTimeout>[] = [];
  let ve2AudioEls: HTMLAudioElement[] = [];
  let ve2VidTimer: ReturnType<typeof setTimeout> | null = null;
  let ve2VidList: Ve2Clip[] = [];
  // v89 (audit M2): cache base64 per path selama satu sesi preview (maks 3
  // entri) — tanpa ini tiap klip dibaca ulang penuh (cap 20 MB) per preview.
  const ve2B64Cache = new Map<string, string>();
  async function ve2ReadB64(path: string): Promise<string> {
    const hit = ve2B64Cache.get(path);
    if (hit !== undefined) return hit;
    const r = await invoke<{ b64: string }>('video_read', { req: { path } });
    if (ve2B64Cache.size >= 3) { const first = ve2B64Cache.keys().next().value; if (first !== undefined) ve2B64Cache.delete(first); }
    ve2B64Cache.set(path, r.b64);
    return r.b64;
  }
  let ve2Total = $derived(Math.max(30, ...ve2Clips.map((c) => c.start + c.dur)));
  let ve2PlayheadPct = $derived((ve2Playhead / ve2Total) * 100);
  let ve2RulerTicks = $derived(Array.from({ length: Math.floor(ve2Total / 10) + 1 }, (_, i) => i * 10));
  let ve2PreviewLabel = $derived(`Preview: ${ve2SelClip()?.name ?? '—'}`);
  let ve2PreviewSrc = $state('');
  let ve2PreviewFail = $state(false);
  let ve2PreviewErr = $state('');
  let ve2PreviewKind = $derived(ve2IsImage(ve2SelClip()?.src ?? '') ? 'image' : ve2IsAudio(ve2SelClip()?.src ?? '') ? 'audio' : 'video');
  // v186: pratinjau idle menampilkan isi file asli klip terpilih (bukan
  // canvas dummy). Dipicu perubahan klip terpilih; saat playback berjalan
  // (ve2VideoOn) elemen <video> utama yang tampil, jadi cabang idle ini
  // tidak berebut elemen dengannya.
  $effect(() => {
    const c = ve2Clips.find((x) => x.id === ve2SelId);
    ve2PreviewSrc = '';
    ve2PreviewFail = false;
    ve2PreviewErr = '';
    if (!c || !c.src) return;
    let live = true;
    ve2ReadB64(c.src).then((b64) => {
      if (!live) return;
      if (b64) ve2PreviewSrc = `data:${ve2MimeFor(c.src)};base64,${b64}`;
      else ve2PreviewFail = true;
    }).catch((e) => { if (live) { ve2PreviewFail = true; ve2PreviewErr = String(e); } });
    return () => { live = false; };
  });
  let ve2TimeText = $derived(`${ve2Fmt(ve2Playhead)} / ${ve2Fmt(ve2Total)}`);
  function ve2Fmt(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function ve2SelClip(): Ve2Clip | undefined {
    return ve2Clips.find((c) => c.id === ve2SelId);
  }
  function ve2SaveState() {
    try { localStorage.setItem('minime.ve2', JSON.stringify({ clips: ve2Clips, assets: ve2Assets, out: ve2Out, zoom: ve2Zoom, plan: ve2Plan, snap: ve2Snap, ratio: ve2PreviewRatio })); } catch { /* kuota penuh: abaikan */ }
  }
  function ve2SelectClip(id: string) {
    ve2SelId = id;
  }
  function ve2Bars(trackId: string): { clip: Ve2Clip; margin: number }[] {
    const list = ve2Clips.filter((c) => c.track === trackId).sort((a, b) => a.start - b.start);
    let prevEnd = 0;
    return list.map((c) => {
      const margin = Math.max(0, ((c.start - prevEnd) / ve2Total) * 100);
      prevEnd = Math.max(prevEnd, c.start + c.dur);
      return { clip: c, margin };
    });
  }
  function ve2BarWidth(c: Ve2Clip): number {
    return (c.dur / ve2Total) * 100;
  }
  function ve2SetField(field: string, value: string) {
    const c = ve2SelClip();
    if (!c) return;
    if (field === 'name') { c.name = value; ve2SaveState(); return; }
    if (field === 'start') { c.start = Number(value); ve2InspectorCommit(); return; }
    if (field === 'dur') { let d = Number(value); const orig = ve2OrigDur(c); if (orig !== null) d = Math.min(d, orig); c.dur = d; ve2InspectorCommit(); return; }
    if (field === 'track') { c.track = value as Ve2Clip['track']; ve2SaveState(); return; }
    if (field === 'effect') { c.effect = value as Ve2Clip['effect']; ve2SaveState(); ve2EffectNote(); return; }
  }
  function ve2InspectorCommit() {
    const c = ve2SelClip();
    if (!c) return;
    if (!(c.start >= 0)) c.start = 0;
    if (!(c.dur >= 0.5)) c.dur = 0.5;
    ve2SaveState();
  }
  function ve2EffectNote() {
    const c = ve2SelClip();
    if (!c) return;
    ve2Status = c.effect === 'fade' ? t('ve2.fx_fade_note', lang) : c.effect === 'zoom' ? t('ve2.fx_zoom_note', lang) : '';
  }
  function ve2SaveProject() {
    ve2SaveState();
    ve2Status = t('ve2.saved', lang);
  }
  function ve2Cut() {
    const c = ve2SelClip();
    if (!c) { ve2Status = t('ve2.no_clip', lang); return; }
    const ph = ve2Playhead;
    if (!(ph > c.start && ph < c.start + c.dur)) { ve2Status = t('ve2.split_out', lang); return; }
    const second: Ve2Clip = { id: 've2c' + Date.now(), name: c.name + ' (2)', track: c.track, start: ph, dur: c.start + c.dur - ph, src: c.src, effect: c.effect };
    c.dur = ph - c.start;
    ve2Clips = [...ve2Clips, second];
    ve2SelId = second.id;
    ve2SaveState();
    ve2Status = t('ve2.split_ok', lang);
  }
  function ve2AddText() {
    const n = ve2Clips.filter((c) => c.track === 'Teks').length + 1;
    const clip: Ve2Clip = { id: 've2c' + Date.now(), name: `${t('ve2.text_new', lang)} ${n}`, track: 'Teks', start: ve2Playhead, dur: 5, src: '', effect: 'none' };
    ve2Clips = [...ve2Clips, clip];
    ve2SelId = clip.id;
    ve2SaveState();
    ve2Status = t('ve2.text_added', lang);
  }
  async function ve2Subtitle() {
    const caps = ve2Clips.filter((c) => c.track === 'Teks').sort((a, b) => a.start - b.start).map((c) => ({ text: c.name, start: c.start, end: c.start + c.dur }));
    if (caps.length === 0) { ve2Status = t('ve2.no_text', lang); return; }
    try {
      const ass = assFromCaptions(caps, 1280, 720);
      const r = await invoke<{ path: string }>('video_write_ass', { req: { content: ass } });
      ve2Status = `${t('ve2.ass_saved', lang)} ${r.path}`;
    } catch (e) {
      ve2Status = `${t('ve2.fail', lang)} ${String(e)}`;
    }
  }
  function ve2Transition() {
    const c = ve2SelClip();
    if (!c) { ve2Status = t('ve2.no_clip', lang); return; }
    c.effect = 'fade';
    ve2SaveState();
    ve2Status = t('ve2.fx_fade_note', lang);
  }
  async function ve2PushAsset(path: string, kind: Ve2Asset['kind'], suffix: number): Promise<boolean> {
    try {
      const probe = await invoke<{ duration: number }>('video_probe', { req: { path } });
      const name = path.split('/').pop() || path;
      const icon = kind === 'Image' ? '🖼️' : kind === 'Teks' ? '🔤' : kind === 'Audio' ? '🎵' : '🎬';
      const duration = kind === 'Image' && !(probe.duration > 0) ? 5 : probe.duration;
      ve2Assets = [...ve2Assets, { id: 've2a' + (Date.now() + suffix), name, icon, kind, src: path, duration }];
      return true;
    } catch (e) {
      // v193: gambar tidak butuh durasi ffprobe (default 5 dtk) — probe
      // gagal tetap menambah aset supaya daftar tidak kosong. Video/Audio
      // tetap gagal karena durasi wajib dari probe, dengan pesan Rust yang
      // kini menyebut berkas + sebabnya (bukan lagi 'EOF line 1 column 0').
      if (kind === 'Image') {
        ve2Assets = [...ve2Assets, { id: 've2a' + (Date.now() + suffix), name: path.split('/').pop() || path, icon: '🖼️', kind, src: path, duration: 5 }];
        return true;
      }
      ve2Status = `${t('ve2.asset_bad', lang)} ${String(e)}`;
      return false;
    }
  }

  // v187: tambah aset bila belum ada aset dengan src yang sama (dipakai
  // generator masuk timeline + backfill klip yatim). Tanpa probe: durasi
  // sudah diketahui dari generator/klip.
  function ve2EnsureAsset(src: string, name: string, kind: Ve2Asset['kind'], duration: number, suffix = 0) {
    if (!src || ve2Assets.some((a) => a.src === src)) return;
    const icon = kind === 'Image' ? '🖼️' : kind === 'Teks' ? '🔤' : kind === 'Audio' ? '🎵' : '🎬';
    ve2Assets = [...ve2Assets, { id: 've2a' + (Date.now() + suffix), name, icon, kind, src, duration }];
  }
  async function ve2AddAssetFiles() {
    // v188: isi lama cabang path kosong v183 — dipilih dari dialog sumber.
    try {
      const picked = await pickFiles({ multiple: true, filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'mp4', 'mov', 'webm', 'mkv', 'avi', 'mp3', 'wav', 'm4a', 'ogg', 'flac'] }] });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      let added = 0;
      for (let i = 0; i < paths.length; i++) {
        const fp = paths[i];
        const kind = ve2IsImage(fp) ? 'Image' : ve2IsAudio(fp) ? 'Audio' : 'Video';
        if (await ve2PushAsset(fp, kind as Ve2Asset['kind'], i)) added++;
      }
      if (added > 0) { ve2SaveState(); ve2Status = t('ve2.asset_added', lang); }
    } catch (e) {
      ve2Status = `${t('ve2.asset_bad', lang)} ${String(e)}`;
    }
  }
  async function ve2AddAsset() {
    const path = ve2NewSrc.trim();
    if (!path) {
      // v188: path kosong -> dialog sumber (Library / file), bukan langsung picker.
      ve2AssetDlg = true;
      return;
    }
    if (await ve2PushAsset(path, ve2NewKind as Ve2Asset['kind'], 0)) {
      ve2NewSrc = '';
      ve2SaveState();
      ve2Status = t('ve2.asset_added', lang);
    }
  }
  function ve2LibLoad() {
    // v188: daftar gambar Library (kind image + imageFile) untuk dialog sumber.
    try {
      const raw = localStorage.getItem('minime.library.added');
      const items = raw ? JSON.parse(raw) : [];
      ve2LibList = (Array.isArray(items) ? items : []).filter((it) => it && it.kind === 'image' && it.imageFile).map((it) => ({ title: it.o || it.imageFile, file: it.imageFile }));
    } catch { ve2LibList = []; }
    ve2AssetDlg = false;
    ve2LibDlg = true;
  }
  function ve2LibPick(file: string, title: string) {
    ve2EnsureAsset(file, title, 'Image', 5);
    ve2SaveState();
    ve2Status = t('ve2.asset_added', lang);
    ve2LibDlg = false;
  }
  function ve2AddAssetClip(assetId: string) {
    const a = ve2Assets.find((x) => x.id === assetId);
    if (!a) return;
    // v182: jenis aset (Image/Video/Audio) dipetakan ke track timeline.
    const track = (a.kind === 'Image' ? 'B-Roll' : a.kind) as Ve2Clip['track'];
    const onTrack = ve2Clips.filter((c) => c.track === track);
    const start = onTrack.length ? Math.max(...onTrack.map((c) => c.start + c.dur)) : 0;
    const dur = a.duration > 0 ? Math.round(a.duration * 10) / 10 : (a.kind === 'Image' || a.kind === 'Teks' ? 5 : 8);
    const clip: Ve2Clip = { id: 've2c' + Date.now(), name: a.name, track, start, dur, src: a.src, effect: 'none' };
    ve2Clips = [...ve2Clips, clip];
    ve2SelId = clip.id;
    ve2SaveState();
  }
  function ve2DropAsset(e: DragEvent) {
    // v188: thumbnail diseret ke timeline — posisi dari X drop (skala
    // ve2Total, pola ve2RulerClick); tarikan asing diabaikan. Impor
    // langsung ke timeline ikut masuk daftar aset (ve2EnsureAsset).
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/ve2-asset') || e.dataTransfer?.getData('text/plain') || '';
    const a = ve2Assets.find((x) => x.id === id);
    if (!a) return;
    const track = (a.kind === 'Image' ? 'B-Roll' : a.kind) as Ve2Clip['track'];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let start: number;
    if (rect.width > 0) {
      // v196: -78px (label 70 + gap 8, sama seperti ve2StartFromClientX).
      const frac = (e.clientX - rect.left - 78) / rect.width;
      start = Math.round(Math.min(ve2Total, Math.max(0, frac * ve2Total)) * 10) / 10;
    } else {
      const onTrack = ve2Clips.filter((c) => c.track === track);
      start = onTrack.length ? Math.max(...onTrack.map((c) => c.start + c.dur)) : 0;
    }
    const dur = a.duration > 0 ? Math.round(a.duration * 10) / 10 : (a.kind === 'Image' ? 5 : 8);
    const clip: Ve2Clip = { id: 've2c' + Date.now(), name: a.name, track, start, dur, src: a.src, effect: 'none' };
    ve2Clips = [...ve2Clips, clip];
    ve2SelId = clip.id;
    ve2EnsureAsset(a.src, a.name, a.kind, a.duration);
    ve2SaveState();
  }
  function ve2TrackFromRow(row: Element): Ve2Clip['track'] | null {
    // v192: petakan baris track dari labelnya (tahan ganti bahasa).
    const lbl = (row.querySelector('.tlabel')?.textContent || '').trim();
    if (lbl === 'B-Roll') return 'B-Roll';
    if (lbl === t('word.teks', lang)) return 'Teks';
    if (lbl === t('word.video', lang)) return 'Video';
    if (lbl === t('word.audio', lang)) return 'Audio';
    return null;
  }
  function ve2StartFromClientX(clientX: number): number | null {
    // v192: posisi dari X pointer pada skala ve2Total; lebar tak terbaca
    // (jsdom) -> null = posisi lama dipertahankan.
    const inner = document.querySelector('#ve2Timeline > div');
    const rect = inner?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    // v196: -78px (label 70 + gap 8): posisi bar diukur dari tepi area bar,
    // bukan tepi div dalam; tanpa ini seret mendarat 78px ke kanan target.
    const frac = (clientX - rect.left - 78) / rect.width;
    return Math.round(Math.min(ve2Total, Math.max(0, frac * ve2Total)) * 10) / 10;
  }
  function ve2ApplyClipMove(id: string, track: Ve2Clip['track'] | null, start: number | null) {
    const c = ve2Clips.find((x) => x.id === id);
    if (!c) return;
    if (track) c.track = track;
    if (start !== null) {
      // v195: snap awal klip; bila awal tidak menempel, coba tempelkan akhir.
      let st = ve2SnapTime(start, id, c.track);
      if (st === start) {
        const eSnap = ve2SnapTime(start + c.dur, id, c.track);
        if (eSnap !== start + c.dur) st = eSnap - c.dur;
      }
      c.start = Math.max(0, Math.round(st * 10) / 10);
    }
    ve2Clips = [...ve2Clips];
    ve2SelId = c.id;
    ve2SaveState();
  }
  let ve2Drag: { id: string; x0: number; y0: number; moved: boolean } | null = null;
  function ve2BarDragStart(e: PointerEvent, id: string) {
    // v192: seret klip pakai pointer event, bukan HTML5 drag — HTML5 drag
    // tidak jalan di WebView live (Tauri/WKWebView), itu sebabnya klip
    // track tidak bisa digeser di app live padahal rig v189 lolos.
    // Tanpa pointer capture (supaya target pointerup = elemen di bawah
    // pointer, bukan bar asal); klik biasa (gerak < ambang) dibiarkan ke
    // onclick yang memilih klip.
    if (e.button !== undefined && e.button !== 0) return;
    ve2Drag = { id, x0: e.clientX, y0: e.clientY, moved: false };
    const onMove = (m: PointerEvent) => {
      if (!ve2Drag) return;
      if (Math.abs(m.clientX - ve2Drag.x0) + Math.abs(m.clientY - ve2Drag.y0) > 5) {
        ve2Drag.moved = true;
        m.preventDefault();
      }
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const d = ve2Drag; ve2Drag = null;
      if (!d || !d.moved) return;
      const row = (u.target as HTMLElement | null)?.closest?.('.track')
        ?? (document.elementFromPoint ? document.elementFromPoint(u.clientX, u.clientY)?.closest?.('.track') : null);
      ve2ApplyClipMove(d.id, row ? ve2TrackFromRow(row) : null, ve2StartFromClientX(u.clientX));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function ve2End(): number {
    // v195: ujung konten terakhir (klip apa pun, track apa pun); 0 bila kosong.
    return ve2Clips.length ? Math.max(...ve2Clips.map((c) => c.start + c.dur)) : 0;
  }
  function ve2OrigDur(c: Ve2Clip): number | null {
    // v195: null = bebas (gambar/teks, atau tidak ada acuan asli: klip
    // sintetis / asetnya sudah dihapus). Video/Audio ber-aset -> durasi aset.
    if (c.track === 'Teks') return null;
    const a = ve2Assets.find((x) => x.src && x.src === c.src);
    if (a && a.kind === 'Image') return null;
    if (ve2IsImage(c.src)) return null;
    if (a && a.duration > 0) return a.duration;
    return null;
  }
  function ve2SnapTime(t: number, selfId: string, track: Ve2Clip['track']): number {
    // v195: magnet — tempelkan waktu ke ujung klip lain di track yang sama
    // bila dalam ambang 0,5 dtk; nonaktif -> waktu apa adanya.
    if (!ve2Snap) return t;
    let best = t; let bestD = 0.5;
    for (const o of ve2Clips) {
      if (o.id === selfId || o.track !== track) continue;
      for (const e of [o.start, o.start + o.dur]) {
        const d = Math.abs(t - e);
        if (d <= bestD) { bestD = d; best = e; }
      }
    }
    return Math.round(best * 10) / 10;
  }
  let ve2Resize: { id: string; startX: number; startDur: number } | null = null;
  function ve2ResizeStart(e: PointerEvent, id: string) {
    // v195: geser ujung kanan klip untuk ubah durasi. stopPropagation
    // supaya seret-pindah bar (v192) tidak ikut jalan; klik bar tetap memilih.
    e.stopPropagation();
    const c = ve2Clips.find((x) => x.id === id);
    if (!c) return;
    ve2SelId = id;
    ve2Resize = { id, startX: e.clientX, startDur: c.dur };
    const onMove = (m: PointerEvent) => {
      if (!ve2Resize) return;
      const cc = ve2Clips.find((x) => x.id === id);
      if (!cc) return;
      const inner = document.querySelector('#ve2Timeline > div');
      const rect = inner?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const dxTime = ((m.clientX - ve2Resize.startX) / rect.width) * ve2Total;
      let nd = ve2Resize.startDur + dxTime;
      nd = ve2SnapTime(cc.start + nd, id, cc.track) - cc.start;
      const orig = ve2OrigDur(cc);
      if (orig !== null) nd = Math.min(nd, orig);
      nd = Math.max(0.1, Math.round(nd * 10) / 10);
      cc.dur = nd;
      ve2Clips = [...ve2Clips];
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (ve2Resize) { ve2Resize = null; ve2SaveState(); }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function ve2DelAsset(id: string) {
    // v189 (revisi Patria 17:55 — x di tiap list ASET, bukan agen):
    // tekan x -> entri aset hilang dari daftar + tersimpan. Klip timeline
    // yang memakai sumbernya TIDAK ikut terhapus, dan berkas di disk juga
    // TIDAK dihapus — yang dihapus hanya entrinya di daftar aset.
    // Thumbnail ikut bersih lewat $effect loader (seen-set).
    ve2Assets = ve2Assets.filter((a) => a.id !== id);
    ve2SaveState();
  }
  function ve2DelClip() {
    // v188: hapus klip terpilih (klik langsung; klip bisa ditambah lagi
    // dari daftar aset karena asetnya tidak ikut terhapus).
    const c = ve2SelClip();
    if (!c) return;
    if (ve2VideoOn) ve2StopPlayback();
    ve2Clips = ve2Clips.filter((x) => x.id !== c.id);
    ve2SelId = '';
    ve2SaveState();
  }
  function ve2IsImage(path: string): boolean {
    return /\.(png|jpe?g|webp|gif|bmp)$/i.test(path);
  }
  function ve2IsAudio(path: string): boolean {
    return /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(path);
  }
  function ve2MimeFor(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.flac')) return 'audio/flac';
    if (lower.endsWith('.aac')) return 'audio/aac';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    return 'video/mp4';
  }
  function ve2StopPlayback() {
    if (ve2Timer) { clearInterval(ve2Timer); ve2Timer = null; }
    ve2AudioTimers.forEach((id) => clearTimeout(id)); ve2AudioTimers = [];
    if (ve2VidTimer) { clearTimeout(ve2VidTimer); ve2VidTimer = null; }
    ve2AudioEls.forEach((a) => { try { a.pause(); } catch { /* noop */ } });
    ve2AudioEls = [];
    if (ve2VideoEl) { try { ve2VideoEl.pause(); } catch { /* noop */ } ve2VideoEl.removeAttribute('src'); ve2VideoEl.load(); }
    ve2VideoOn = false;
    ve2Playing = false;
    ve2B64Cache.clear();
  }
  // v198: pause bawaan video playback (#ve2Video) harus menghentikan
  // timeline — sebelumnya video membeku tapi interval playhead jalan
  // terus (kebalikan laporan v197). Syarat ganda: timeline sedang jalan
  // DAN elemen benar-benar paused — ini menyaring event pause palsu
  // (mis. pergantian src klip) yang datang saat elemen sudah kembali
  // bermain, serta membuat pemanggilan ulang ve2StopPlayback aman
  // (pause() pada elemen yang sudah paused tidak memicu event lagi).
  function ve2VideoPaused() {
    if (ve2Playing && ve2VideoEl && ve2VideoEl.paused) ve2StopPlayback();
  }
  async function ve2PlayVideoAt(idx: number) {
    if (idx >= ve2VidList.length) return;
    const clip = ve2VidList[idx];
    try {
      const b64 = await ve2ReadB64(clip.src);
      if (!ve2Playing) return;
      const el = ve2VideoEl;
      if (!el) return;
      el.src = `data:${ve2MimeFor(clip.src)};base64,${b64}`;
      ve2VideoOn = true;
      el.style.transform = clip.effect === 'zoom' ? 'scale(1.25)' : '';
      try { await el.play(); } catch { /* autoplay ditolak: playhead tetap jalan */ }
      const offset = Math.max(0, ve2Playhead - clip.start);
      if (offset > 0 && offset < clip.dur) { try { el.currentTime = offset; } catch { /* noop */ } }
      const remain = Math.max(0.2, (clip.start + clip.dur - Math.max(ve2Playhead, clip.start)));
      if (ve2VidTimer) clearTimeout(ve2VidTimer);
      ve2VidTimer = setTimeout(() => { if (ve2Playing) void ve2PlayVideoAt(idx + 1); }, remain * 1000);
      el.onended = () => { if (ve2Playing) { if (ve2VidTimer) clearTimeout(ve2VidTimer); void ve2PlayVideoAt(idx + 1); } };
    } catch (e) {
      ve2Status = `${t('ve2.preview_fail', lang)} ${String(e)}`;
    }
  }
  function ve2ScheduleAudio() {
    const startAt = ve2Playhead;
    for (const c of ve2Clips.filter((x) => x.track === 'Audio' && x.src && x.start + x.dur > startAt)) {
      const delay = Math.max(0, (c.start - startAt)) * 1000;
      const id = setTimeout(async () => {
        if (!ve2Playing) return;
        try {
          const b64 = await ve2ReadB64(c.src);
          if (!ve2Playing) return;
          const a = new Audio(`data:${ve2MimeFor(c.src)};base64,${b64}`);
          ve2AudioEls.push(a);
          try { await a.play(); } catch { /* noop */ }
          const stopId = setTimeout(() => { try { a.pause(); } catch { /* noop */ } }, Math.max(0, (c.start + c.dur - Math.max(startAt, c.start))) * 1000);
          ve2AudioTimers.push(stopId);
        } catch { /* klip audio gagal: playhead tetap jalan */ }
      }, delay);
      ve2AudioTimers.push(id);
    }
  }
  function ve2PlayToggle() {
    if (ve2Playing) { ve2StopPlayback(); return; }
    // v195: berhenti di ujung klip terakhir, bukan di ujung skala timeline
    // (ve2Total minimal 30 dtk — itulah sebab player terus berjalan walau
    // klip sudah habis). Tanpa klip -> tidak jalan; playhead lewat ujung
    // -> putar ulang dari 0.
    const end = ve2End();
    if (end <= 0) { ve2Status = t('ve2.no_clip', lang); return; }
    let startAt = ve2Playhead;
    if (startAt >= end) { startAt = 0; ve2Playhead = 0; }
    ve2Playing = true;
    const hasMedia = ve2Clips.some((c) => c.src && c.start + c.dur > startAt);
    if (!hasMedia) ve2Status = t('ve2.preview_nosrc', lang);
    ve2VidList = ve2Clips.filter((c) => (c.track === 'Video' || c.track === 'B-Roll') && c.src && c.start + c.dur > startAt).sort((a, b) => a.start - b.start);
    if (ve2VidList.length > 0) void ve2PlayVideoAt(0);
    ve2ScheduleAudio();
    const t0 = performance.now() - startAt * 1000;
    ve2Timer = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      if (el >= end) { ve2Playhead = end; ve2StopPlayback(); return; }
      ve2Playhead = el;
    }, 100);
  }
  // v197: tombol play bawaan monitor pratinjau idle (video/audio) harus
  // menggerakkan playhead seperti tombol Putar transport — sebelumnya ia
  // memutar elemen pratinjau itu sendiri sehingga playhead diam. Elemen
  // dijeda dulu supaya tidak berbunyi sendiri, lalu timeline yang jalan.
  function ve2PreviewPlay(e: Event) {
    const el = e.currentTarget as HTMLMediaElement | null;
    try { el?.pause(); } catch { /* noop */ }
    if (!ve2Playing) ve2PlayToggle();
  }
  function ve2Preview() {
    ve2StopPlayback();
    ve2Playhead = 0;
    ve2PlayToggle();
  }
  function ve2ToStart() {
    ve2StopPlayback();
    ve2Playhead = 0;
  }
  function ve2ToEnd() {
    ve2StopPlayback();
    ve2Playhead = ve2Total;
  }
  function ve2RulerClick(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0) return;
    // v196: -78px (label 70 + gap 8): klik penggaris mendarat di waktu labelnya.
    const frac = (e.clientX - rect.left - 78) / rect.width;
    ve2StopPlayback();
    ve2Playhead = Math.min(ve2Total, Math.max(0, frac * ve2Total));
  }
  // v181: generator video Gemini Omni (panel tab Video). Prompt ->
  // satu panggilan Interactions API -> base64 MP4 -> simpan
  // ~/Movies/minime-veo (folder lama dipertahankan) -> aset ve2.
  // Satu klik lagi (Tambah ke timeline) menaruhnya di timeline.
  // Durasi tidak diminta (klip hingga 10 detik, ditentukan model).
  let vgPrompt = $state('');
  let vgModel = $state('omni');
  let vgAspect = $state('9:16');
  let vgRes = $state('720p');
  let vgBusy = $state(false);
  let vgStatus = $state('');
  let vgLastPath = $state('');
  let vgLastDur = $state(0);
  let vgWanRes = $state('720p');
  let vgWanSec = $state(10);
  let vgWanLastPath = $state('');
  let vgWanLastDur = $state(0);
  let hfHtml = $state('');
  let hfDesc = $state('');
  let hfGenBusy = $state(false);
  let hfQuality = $state('draft');
  let hfBusy = $state(false);
  let hfStatus = $state('');
  let hfLastPath = $state('');
  let hfLastDur = $state(0);
  // v178: mode input generator Veo (desain Veo 3.1): tab Prompt /
  // References (0/3) / First and last frames. Mode saling eksklusif:
  // refs > 0 -> referenceImages (durasi dipaksa 8, Lite ditolak);
  // vgFirst saja -> image-to-video; vgFirst + vgLast -> first+last.
  // Semua input gambar bersifat sesi (tidak dipersistensikan), dari
  // file atau dari Library (gambar kind 'image' + imageFile, terbaru
  // dulu). Menggantikan referensi tunggal v168 (vgRef).
  let vgTab = $state('prompt');
  let vgFirst = $state(null as null | { label: string; mime: string; b64: string });
  let vgLast = $state(null as null | { label: string; mime: string; b64: string });
  let vgRefs = $state([] as Array<{ label: string; mime: string; b64: string }>);
  let vgLibTarget = $state('refs');
  let vgLibList = $state([] as Array<{ file: string; title: string; mime: string; b64: string }>);
  async function vgFileToImg(file: File | null) {
    if (!file) return null;
    const buf = await file.arrayBuffer();
    const mime = file.type || 'image/png';
    return { label: file.name, mime: mime.startsWith('image/') ? mime : 'image/png', b64: b64FromBytes(new Uint8Array(buf)) };
  }
  async function vgFirstFromFile(file: File | null) {
    try { const img = await vgFileToImg(file); if (img) vgFirst = img; } catch (e) { vgStatus = `${t('vg.fail', lang)} ${String(e)}`; }
  }
  async function vgLastFromFile(file: File | null) {
    try { const img = await vgFileToImg(file); if (img) vgLast = img; } catch (e) { vgStatus = `${t('vg.fail', lang)} ${String(e)}`; }
  }
  function vgRefsAdd(img: { label: string; mime: string; b64: string }) {
    if (vgRefs.length >= 3) { vgStatus = t('vg2.refs.max', lang); return; }
    vgRefs = [...vgRefs, img];
  }
  async function vgRefsFromFile(file: File | null) {
    try { const img = await vgFileToImg(file); if (img) vgRefsAdd(img); } catch (e) { vgStatus = `${t('vg.fail', lang)} ${String(e)}`; }
  }
  function vgRefsDel(i: number) {
    vgRefs = vgRefs.filter((_, j) => j !== i);
  }
  async function loadLibImages(limit: number) {
    const items = libAll().filter((x: { kind?: string; imageFile?: string }) => x.kind === 'image' && x.imageFile).reverse().slice(0, limit);
    const out = [];
    for (const it of items) {
      try {
        const res = await invoke<{ b64: string }>('image_read', { req: { name: it.imageFile } });
        out.push({ file: it.imageFile as string, title: it.o as string, mime: mimeForB64(res.b64), b64: res.b64 });
      } catch { /* file hilang: lewati */ }
    }
    return out;
  }
  async function vgLibLoad(target: string) {
    vgLibTarget = target;
    try {
      vgLibList = await loadLibImages(10);
      if (!vgLibList.length) vgStatus = t('vg.ref.lib_empty', lang);
    } catch (e) {
      vgStatus = `${t('vg.fail', lang)} ${String(e)}`;
    }
  }
  function vgLibPick(it: { file: string; title: string; mime: string; b64: string }) {
    const img = { label: it.title, mime: it.mime, b64: it.b64 };
    if (vgLibTarget === 'first') vgFirst = img;
    else if (vgLibTarget === 'last') vgLast = img;
    else vgRefsAdd(img);
  }
  function vgMode(): string {
    if (vgRefs.length > 0) return 'refs';
    if (vgFirst) return 'frames';
    return 'text';
  }
  function vgLoadSample(portrait: boolean) {
    vgTab = 'prompt';
    if (portrait) vgAspect = '9:16';
    vgPrompt = portrait ? t('vg2.portraittext', lang) : t('vg2.sampletext', lang);
  }
  async function vgGenerate() {
    const key = readKeys().gemini;
    if (!key) { vgStatus = t('vg.need_key', lang); return; }
    if (!vgPrompt.trim()) { vgStatus = t('vg.need_prompt', lang); return; }
    vgBusy = true;
    vgStatus = t('vg.status.start', lang);
    try {
      const mode = vgMode();
      const imgs = mode === 'refs' ? vgRefs.map((r) => ({ b64: r.b64, mime: r.mime })) : mode === 'frames' && vgFirst ? [{ b64: vgFirst.b64, mime: vgFirst.mime }, ...(vgLast ? [{ b64: vgLast.b64, mime: vgLast.mime }] : [])] : undefined;
      const r = await omniGenerateClip(key, { prompt: vgPrompt.trim(), aspect: vgAspect, resolution: vgRes, images: imgs }, (phase, elapsed) => {
        vgStatus = phase === 'save' ? t('vg.status.download', lang) : phase === 'generating' ? `${t('vg.status.poll', lang)} (${elapsed ?? 0}s)` : t('vg.status.start', lang);
      });
      ve2Assets = [...ve2Assets, { id: 'omni' + Date.now(), name: `Omni ${r.seconds.toFixed(1)}s`, icon: '🎬', kind: 'Video', src: r.path, duration: r.seconds }];
      ve2SaveState();
      videoSpend = readVideoSpend();
      vgLastPath = r.path;
      vgLastDur = r.seconds;
      vgStatus = `${t('vg.done', lang)} ${r.path} ($${r.usd.toFixed(2)})`;
    } catch (e) {
      vgStatus = `${t('vg.fail', lang)} ${String(e)}`;
    } finally {
      vgBusy = false;
    }
  }
  function vgAddToTimeline() {
    if (!vgLastPath) return;
    const start = ve2Clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
    ve2Clips = [...ve2Clips, { id: 'omnic' + Date.now(), name: `Omni ${vgLastDur.toFixed(1)}s`, track: 'Video', start, dur: vgLastDur, src: vgLastPath, effect: 'none' }];
    ve2EnsureAsset(vgLastPath, `Omni ${vgLastDur.toFixed(1)}s`, 'Video', vgLastDur);
    ve2SaveState();
    vgStatus = t('vg.added_timeline', lang);
  }
  async function vgWanGenerate() {
    const key = readKeys().classai;
    if (!key) { vgStatus = t('vg.wan.need_key', lang); return; }
    if (!vgPrompt.trim()) { vgStatus = t('vg.need_prompt', lang); return; }
    const sec = Math.min(30, Math.max(2, Math.round(Number(vgWanSec) || 10)));
    vgWanSec = sec;
    vgBusy = true;
    vgStatus = t('vg.status.start', lang);
    try {
      const r = await wanGenerateClip(key, { prompt: vgPrompt.trim(), aspect: vgAspect, resolution: vgWanRes, seconds: sec }, (phase, elapsed) => {
        vgStatus = phase === 'save' ? t('vg.status.download', lang) : phase === 'generating' ? `${t('vg.status.poll', lang)} (${elapsed ?? 0}s)` : t('vg.status.start', lang);
      });
      ve2Assets = [...ve2Assets, { id: 'wan' + Date.now(), name: `Wan ${r.seconds.toFixed(1)}s`, icon: '🎬', kind: 'Video', src: r.path, duration: r.seconds }];
      ve2SaveState();
      classaiSpend = readClassaiSpend();
      vgWanLastPath = r.path;
      vgWanLastDur = r.seconds;
      vgStatus = `${t('vg.done', lang)} ${r.path} ($${r.usd.toFixed(2)})`;
    } catch (e) {
      vgStatus = `${t('vg.fail', lang)} ${String(e)}`;
    } finally {
      vgBusy = false;
    }
  }
  function vgWanAddToTimeline() {
    if (!vgWanLastPath) return;
    const start = ve2Clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
    ve2Clips = [...ve2Clips, { id: 'wanc' + Date.now(), name: `Wan ${vgWanLastDur.toFixed(1)}s`, track: 'Video', start, dur: vgWanLastDur, src: vgWanLastPath, effect: 'none' }];
    ve2EnsureAsset(vgWanLastPath, `Wan ${vgWanLastDur.toFixed(1)}s`, 'Video', vgWanLastDur);
    ve2SaveState();
    vgStatus = t('vg.added_timeline', lang);
  }
  function vgCineLoadBeat(b: { n: number; prompt: string }) {
    if (vgModel === 'hyperframes') vgModel = 'omni';
    vgAspect = '9:16';
    vgPrompt = b.prompt;
    vgStatus = t('vg2.cine.loaded', lang, { label: `${t('vg.tpl.beat', lang)} ${b.n}` });
  }
  function vgCineLoadTitle() {
    vgModel = 'hyperframes';
    hfHtml = CINE_TITLECARD_HTML;
    hfStatus = t('vg2.cine.titlecard_loaded', lang);
  }
  async function hfCheck() {
    try {
      const r = await invoke<{ found: boolean; version: string; method: string }>('hyperframes_check');
      hfStatus = t('hf.checked', lang, { v: r.version, m: r.method });
    } catch (e) {
      hfStatus = String(e);
    }
  }
  async function hfGen() {
    if (!hfDesc.trim()) { hfStatus = t('hf.gen_empty', lang); return; }
    if (hfGenBusy) return;
    hfGenBusy = true;
    hfStatus = t('hf.generating', lang);
    try {
      const r = await hfGenerateHtml(hfDesc, lang);
      hfHtml = r.html;
      hfStatus = `${t('chat.footer.via', lang)} ${r.provider} ${r.model}`;
    } catch (e) {
      hfStatus = (e instanceof Error && e.message === 'HF_GEN_INVALID') ? t('hf.gen_invalid', lang) : String(e);
    }
    hfGenBusy = false;
  }
  async function hfRender() {
    if (!hfHtml.trim()) { hfStatus = t('hf.need_html', lang); return; }
    hfBusy = true;
    hfStatus = t('hf.rendering', lang);
    try {
      const r = await invoke<{ path: string; quality: string; bytes: number }>('hyperframes_render', { req: { html: hfHtml, quality: hfQuality } });
      hfLastPath = r.path;
      let dur = 0;
      try {
        const pr = await invoke<{ duration: number; size: number }>('video_probe', { req: { path: r.path } });
        dur = Math.round(pr.duration);
      } catch { /* fallback ke data-duration root di bawah */ }
      if (!dur) {
        const m = hfHtml.match(/data-duration="([\d.]+)"/);
        dur = m ? Math.round(Number(m[1])) : 0;
      }
      hfLastDur = dur;
      hfStatus = t('hf.done', lang, { path: r.path, s: dur });
    } catch (e) {
      hfStatus = String(e);
    } finally {
      hfBusy = false;
    }
  }
  function hfAddToTimeline() {
    if (!hfLastPath || !hfLastDur) return;
    const start = ve2Clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
    ve2Clips = [...ve2Clips, { id: 'hf' + Date.now(), name: `HyperFrames ${hfLastDur}s`, track: 'Video', start, dur: hfLastDur, src: hfLastPath, effect: 'none' }];
    ve2EnsureAsset(hfLastPath, `HyperFrames ${hfLastDur}s`, 'Video', hfLastDur);
    ve2SaveState();
    hfStatus = t('hf.added_timeline', lang);
  }
  // v178: tipe + teks QC bersama (dipakai Ekspor ve2; dulu bagian
  // panel Tier 1 yang dihapus — fungsinya pindah ke helper ini).
  interface T1RenderResult { success: boolean; output: string; duration_ms: number; stderr_tail: string; }
  interface T1Segment { start: number; end: number; }
  interface T1QcResult { duration: number; has_video: boolean; has_audio: boolean; black: T1Segment[]; silent: T1Segment[]; passed: boolean; notes: string[]; }
  interface T1CaptureResult { data_url: string; }
  function t1QcText(qc: T1QcResult): string {
    const seg = (ss: T1Segment[]) => ss.length ? ss.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)}`).join(', ') : t('t1.qc.none', lang);
    return [
      (qc.passed ? t('t1.qc.pass', lang) : t('t1.qc.fail', lang)),
      `${t('t1.qc.duration', lang)}: ${qc.duration.toFixed(1)}s`,
      `${t('t1.qc.black', lang)}: ${seg(qc.black)}`,
      `${t('t1.qc.silent', lang)}: ${seg(qc.silent)}`,
      ...qc.notes,
    ].join('\n');
  }
  async function ve2Export() {
    if (ve2Busy) return;
    const out = ve2Out.trim();
    if (!out) { ve2Status = t('ve2.need_out', lang); return; }
    const vids = ve2Clips.filter((c) => (c.track === 'Video' || c.track === 'B-Roll') && c.src).sort((a, b) => a.start - b.start);
    if (vids.length === 0) { ve2Status = t('ve2.need_video', lang); return; }
    const auds = ve2Clips.filter((c) => c.track === 'Audio' && c.src);
    const clips: T1Clip[] = [
      ...vids.map((c) => ({ id: c.id, src: c.src, kind: (ve2IsImage(c.src) ? 'image' : 'video') as 'image' | 'video', trimIn: 0, dur: c.dur, volume: 1 })),
      ...auds.map((c) => ({ id: c.id, src: c.src, kind: 'audio' as const, trimIn: 0, dur: c.dur, volume: 1, track: (/musik|music/i.test(c.name) ? 'music' : 'voice') as 'voice' | 'music' })),
    ];
    const seq: T1Sequence = { name: 've2', width: 1280, height: 720, fps: 30, clips };
    const errs = validateSequence(seq, out);
    if (errs.length > 0) { ve2Status = errs.map((e) => t(e, lang)).join(' '); return; }
    const hasFade = ve2Clips.some((c) => c.effect === 'fade');
    const hasZoom = ve2Clips.some((c) => c.effect === 'zoom');
    const baseOut = hasFade ? out.replace(/\.mp4$/i, '') + '-base.mp4' : out;
    const compiled = compileTimeline(seq, baseOut);
    ve2Busy = true;
    ve2Status = t('ve2.rendering', lang);
    ve2Frame = '';
    try {
      const r = await invoke<T1RenderResult>('video_render', { req: { args: compiled.args, output: compiled.output } });
      if (!r.success) { ve2Status = `${t('ve2.fail', lang)} ${r.stderr_tail}`; return; }
      let finalOut = compiled.output;
      if (hasFade) {
        const total = compiled.expectedDuration;
        const fadeArgs = ['-nostdin', '-y', '-i', compiled.output, '-vf', `fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, total - 0.5)}:d=0.5`, '-c:a', 'copy', out];
        const fr = await invoke<T1RenderResult>('video_render', { req: { args: fadeArgs, output: out } });
        if (!fr.success) { ve2Status = `${t('ve2.fail', lang)} ${String(fr.stderr_tail)}`; return; }
        finalOut = out;
      }
      const qc = await invoke<T1QcResult>('video_qc', { req: { path: finalOut, expectedDuration: compiled.expectedDuration } });
      const cap = await invoke<T1CaptureResult>('video_capture', { req: { path: finalOut, at: compiled.expectedDuration / 2 } });
      ve2Frame = cap.data_url;
      let msg = `${t('ve2.done', lang)} ${finalOut}\n${t1QcText(qc)}`;
      if (hasFade) msg += `\n${t('ve2.base_note', lang)} ${compiled.output}`;
      if (hasZoom) msg += `\n${t('ve2.zoom_preview_only', lang)}`;
      ve2Status = msg;
    } catch (e) {
      ve2Status = `${t('ve2.fail', lang)} ${String(e)}`;
    } finally {
      ve2Busy = false;
    }
  }
</script>

<div class="app">
  <div class="sidebar">
    <img class="appmark" src="minime-icon.png" alt="MiniMe">
    <button data-view="home" class="active"><img class="railicon" src="./chat-icon.png" style="filter:invert(1);object-fit:contain" alt=""><span class="tip">{t('nav.home', lang)}</span></button>
    <button data-view="search"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEyUlEQVR42u2dP4gWRxjGf3snB/FPVJQIVkJEE4imsDBKTq3EA8EiRQ4xJLVIDMbKJkHRIiioXSCgeJVioQiCokSiKQKKkquOGAKBaNKdUQyCMim+7+AIipnd2f1m3vd54OtmZnfn/c0z7+zuN1uFEJD8akhdIAAkASAJAEkASAJAEgCSAJAEgCQAJAeaU/j5DwO7gC3ABmBB//cX8Ai4B1wCLirUL1dV0LOA+cA1YH2Cts4C4wp//gBsBm50cJy5wD/KAfLRbSB0FHyAp/3jnZQDDFa5nMxNYJMcoPsRn4tG++dzUA7QrlYBUyX0kxygHbufKqSfAnBeDmBvrnfvBl07wNuFBx8D5z8wAD4F7hvptyAA4rQPON1S21eAncDyvj3P/FYCu1vMM0xA0EUOsAuYSNjeF8CJBvXPAJ8oJ+gGgLfoPZhpqp+ADzIexZUAaKeD2wp8GyAUCcGcjDu1yw6tEpxzKBGCtpLAvxvU/XKAHVkBkw3q79EUACPAs8JtdGt/dWF+KmgDgGCo44J1CFJPAeeNdVjd83rXqwMEo6PF6nUldYBfDFvl7hp1dnhzgNiGjgH7C8qXTLpAKgc4VaNOScGvG8wlXhwgWBsZr9D79P5rYOZaUwAwH3gcUX4aWEy5MgV7iikg9mFPycGvE9A91h0gpoGnwDzKlxkX6PqVMAvBB/jYyHU0BuArfOpcZPkRqwB8HVH2An71ndUcIKaytT9X7AWOl379AqC7ZDDL69cOIc4lAARAbY1FlL2srrYHwIaIsleN9t9zzwAsiCj70CgAv0aUXWgNgLkyUKYjyr6wBsCDiLLDRgFYEVH2iTUAYuhfZxSAZZ5zgOsRZbdrtshTuhPYTLoTKPmdArxrRADE6UNjAPwQUfaZVQBiloI3jQEQs2n151aTwHX0dvn0mAiaSICbOsCdyPJjRoJ/V8vAeiPBigvEXPNj4E3LSeA3keXfKDz4RyPLL7XuAN5cQP8MSqC9hQY/du+j7Fc+qRxgIXEPh0p0gWHiXwCpvABQxxpLg0D7A7xGozXq/Kbg2wHgVo06K4DDBoNfjFIngXWoP0BvN/Ec9WeH/eBqFfBfHQO+zXDk13nj51BJDtDWZtFNGq0yCT7WR3+bDrCo0DnXwidtsgDgEfX32p2B4McBjPr7idpxDwDAtob1N/Y7s+1NKL5vIWjFQNDFJ2NSHWAKeKewIFWeHSB1J6zuBy0AvwPvRdYfm1W/qxEa5ACFzo1enGBIneAb/iGNBN8QDOJOYAUcEQT+coDS84IKg98ZHMqgUy9kHvjPZgWssgb+oB0gZzeYBNa2fK6VAMgPhGn+347mJiDI8c+hM1//vtLxcQ/1j7u448AFOcDr9TOwpoV2zwLjmQSwkgO8WmtnOcPqBu4wQe8lj5m2xjMKXJADaI3fuRNog4i0uUtxTiAAnEMgAJxDIACcQyAAnEMgAJxDIACcQyAAnEMgAJxDIADKhOCPZCekW8EDUcgFJjlAuU4QBIAgEACCQAAIAgHgEoKPtArwvTrQKsCxEySbNgRAnhBMdpUzaArIW1vpfXLvOnCxFdoEgG9pChAAkgCQBIAkACQBIAkASQBIAkASAJIAkASAJAAkASAJAEkASAJAEgCSAJDM6F9cZScWKqW6hAAAAABJRU5ErkJggg==" alt=""><span class="tip">{t('nav.search', lang)}</span></button>
    <button data-view="kanban"><img class="railicon" src="./kanban-icon.png" style="filter:invert(1);object-fit:contain" alt=""><span class="tip">{t('nav.kanban', lang)}</span></button>
    <button data-view="graph"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">{t('nav.graph', lang)}</span></button>
    <button data-view="library"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">{t('nav.library', lang)}</span></button>
    <button data-view="media"><img class="railicon" src="./media-icon.png" style="filter:invert(1);object-fit:contain" alt=""><span class="tip">{t('nav.media', lang)}</span></button>
    <button data-view="planner"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">{t('nav.planner', lang)}</span></button>
    <button data-view="campaign"><img class="railicon" src="./campaign-icon.png" style="filter:invert(1);object-fit:contain" alt=""><span class="tip">{t('nav.campaign', lang)}</span></button>
    <button data-view="billing"><img class="railicon" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%222.5%22%20y%3D%225%22%20width%3D%2219%22%20height%3D%2214%22%20rx%3D%223%22/%3E%3Cline%20x1%3D%222.5%22%20y1%3D%2210%22%20x2%3D%2221.5%22%20y2%3D%2210%22/%3E%3Crect%20x%3D%226%22%20y%3D%2214%22%20width%3D%224%22%20height%3D%222.5%22%20rx%3D%220.5%22%20fill%3D%22white%22%20stroke%3D%22none%22/%3E%3C/svg%3E" alt=""><span class="tip">{t('nav.billing', lang)}</span></button>
    <div class="spacer"></div>
    <button data-view="settings"><img class="railicon" src="./setting-icon.png" style="filter:invert(1);object-fit:contain" alt=""><span class="tip">{t('nav.settings', lang)}</span></button>
  </div>

  <div class="col" id="agentCol">
    <div class="agent-topbar">
      <span class="scope-dot"></span><span class="agent-scope">Local</span><span style="color:#a1a1a1">⌄</span>
      <span style="flex:1"></span>
      <button class="agent-plus" onclick={() => { toggleAddMenu() }} title={t('title.addagent', lang)}>＋</button>
    </div>
    <div class="add-menu" id="addMenu"></div>
    <div class="agent-searchbox"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1a1" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg><input type="text" id="navSearch" placeholder={t('word.search', lang)} oninput={(e) => { filterAgents(e.currentTarget.value) }}></div>
    <div style="padding:0 14px;flex-shrink:0"><div class="mainchat" onclick={() => { showView('home') }}><div class="av" style="background:#EB87B4">P</div><div><b>Main chat</b><br><small style="color:#a1a1a1">{t('nav.prime', lang)}</small></div></div></div>
    <div class="scroll" id="agentList"></div>
  </div>
  <div class="resizer" id="resizeAgent"></div>

  <div class="col" id="chatCol">
    <div class="view active" id="view-home">
      <div class="colhead chat-date-head">
        <div class="chat-date">{t('home.chatdate', lang)}</div>
        <div class="chat-proj" id="chatProj">—</div>
      </div>
      <div id="pinnedBar" style="display:none"></div>
      <div class="scroll" id="chatBox"></div>
      <div class="composer">
        <div id="replyBar" style="display:none"><span id="replyBarText"></span><button class="reply-x" data-act="reply-cancel">✕</button></div>
        <div class="wa-pop" id="attachMenu">
          <button onclick={() => { waAttach('Gambar') }}>{t('composer.attach.img', lang)}</button>
          <button onclick={() => { waAttach('Dokumen') }}>{t('composer.attach.doc', lang)}</button>
          <button onclick={() => { waAttach('Kamera') }}>{t('composer.attach.cam', lang)}</button>
          <button onclick={() => { waAttach('Audio') }}>{t('composer.attach.audio', lang)}</button>
        </div>
        <div class="wa-pill main-pill">
          <button class="pill-plus" onclick={() => { waToggleAttach() }} title={t('title.attach', lang)}>＋</button>
          <input type="text" id="chatInput" placeholder={t('composer.ph', lang)} autocomplete="off">
          <button class="pill-mic" onclick={() => { waMic() }} title={t('title.voice', lang)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a1a1a1" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/></svg></button>
          <button class="pill-send" onclick={() => { sendChat() }} title={t('title.send', lang)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
        </div>
        <div class="notice" id="waNote" style="display:none;margin-top:0"></div>
      </div>
    </div>
    <div class="view" id="view-newagent">
      <div class="scroll" id="newAgentBody"></div>
    </div>
    <div class="view" id="view-search">
      <div class="colhead"><h2>{t('word.search', lang)}</h2></div>
      <div class="scroll">
        <input type="text" id="searchInput" placeholder={t('search.ph', lang)} oninput={() => { doSearch() }}>
        <p id="searchCount" style="color:#555"></p>
        <div id="searchResults"></div>
      </div>
    </div>
    <div class="view" id="view-kanban">
      <div class="colhead">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="av" style="background:#EB87B4">P</div>
          <h2 id="kanbanTitle" style="margin:0">—</h2><span style="color:#EB87B4;font-size:18px">☆</span>
          <div style="margin-left:auto;display:flex;align-items:center">
            <div id="kbTeamAvs" style="display:flex"></div>
            <button class="btn btn-sm" style="margin-left:10px" onclick={() => { kbTeamOpen() }}>＋</button><span id="kbTeamNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span>
          </div>
        </div>
        <div class="kb-tabs">
          <button data-kbtab="kanban" class="active">{t('word.kanban', lang)}</button>
          <span style="flex:1"></span>
          <label style="margin:0;font-weight:400;font-size:13px">{t('kb.proj.label', lang)}
            <select id="kbProjSel" onchange={(e) => { kbSetProj((e.target as HTMLSelectElement).value) }} style="width:auto;margin-left:6px"></select>
          </label>
          <label style="margin:0;font-weight:400;font-size:13px">{t('home.filter', lang)}
            <select id="kbFilter" onchange={() => { renderKanban() }} style="width:auto;margin-left:6px">
              <option value="">{t('home.allagents', lang)}</option>
            </select>
          </label>
        </div>
      </div>
      <div class="scroll"><div id="kanbanBox"></div><div id="kbDlg" style="display:none"></div><div id="kbTaskDlg" style="display:none"></div></div>
    </div>
    <div class="view" id="view-graph">
      <div class="colhead"><h2>{t('view.graph.title', lang)}</h2>
      <div class="graph-head-btns">
        <button class="btn" onclick={() => { graphZoomOut() }}>−</button>
        <span id="graphZoomLabel">100%</span>
        <button class="btn" onclick={() => { graphZoomIn() }}>+</button>
        <div class="graph-proj-dd" id="graphProjDd">
          <button class="btn" id="graphProjBtn" data-act="graph-dd-toggle">— ▾</button>
          <div class="graph-dd-list" id="graphProjList" style="display:none"></div>
        </div>
        <button class="btn btn-primary" onclick={() => { graphNewProject() }}>{t('graph.newproj', lang)}</button>
      </div></div>
      <div class="scroll">
        <div class="graph-wrap">
          <div class="n8n-canvas" id="graphBox"><div class="graph-runbar">
            <button class="btn btn-primary" title={t('graph.run', lang)} onclick={(e) => { e.stopPropagation(); runGraphSim(); }}>▶</button>
            <button class="btn" title={t('graph.stop', lang)} onclick={(e) => { e.stopPropagation(); graphStopSim(); }}>⏹</button>
          </div><div id="graphZoom"><svg id="graphEdges"></svg><div id="graphNodes"></div></div><button id="graphEmptyPlus" class="graph-empty-plus" onclick={() => { graphPrimeFirst() }}>+</button></div>
        </div>
        <div id="graphPopup" class="g-popup" style="display:none" onclick={(e) => { if (e.target === e.currentTarget) graphClosePanel(); }}><div class="g-popup-card" id="graphPopupCard"></div></div>
        <div id="graphProjDelDlg" style="display:none"></div>
      </div>
    </div>
    <div class="view" id="view-library">
      <div class="colhead"><h2>{t('view.library.title', lang)}</h2></div>
      <div class="lib-filters">
        <label>{t('lib.filter.kind', lang)}
          <select id="libFilterKind" onchange={(e) => libSetFilter('kind', (e.target as HTMLSelectElement).value)}>
            <option value="all">{t('lib.filter.all', lang)}</option>
            <option value="script">{t('lib.kind.script', lang)}</option>
            <option value="image">{t('lib.kind.image', lang)}</option>
            <option value="doc">{t('lib.kind.doc', lang)}</option>
          </select>
        </label>
        <label>{t('lib.filter.period', lang)}
          <select id="libFilterPeriod" onchange={(e) => libSetFilter('period', (e.target as HTMLSelectElement).value)}>
            <option value="all">{t('lib.filter.all', lang)}</option>
            <option value="today">{t('lib.filter.period.today', lang)}</option>
            <option value="d7">{t('lib.filter.period.d7', lang)}</option>
            <option value="d30">{t('lib.filter.period.d30', lang)}</option>
            <option value="d90">{t('lib.filter.period.d90', lang)}</option>
          </select>
        </label>
        <label>{t('lib.filter.agent', lang)}
          <select id="libFilterAgent" onchange={(e) => libSetFilter('agent', (e.target as HTMLSelectElement).value)}></select>
        </label>
        <label>{t('lib.filter.proj', lang)}
          <select id="libFilterProj" onchange={(e) => libSetFilter('proj', (e.target as HTMLSelectElement).value)}></select>
        </label>
        <span id="libFilterCount"></span>
        <button id="libArchiveBtn" class="btn btn-sm" onclick={() => { libToggleView() }}>{t('lib.view.archive', lang)}</button>
      </div>
      <div class="scroll">
        <div id="libGrid"></div>
        <div class="notice" id="libNotice" style="display:none"></div>
      </div>
      <div id="libDetailDlg" style="display:none"></div>
      <div id="libConfirmDlg" style="display:none"></div>
    </div>
    <div class="view" id="view-media">
      <div class="colhead"><h2>{t('view.media.title', lang)}</h2></div>
      <div class="filters" style="flex-shrink:0;margin:0 14px 12px">
        <button id="ms-tabbtn-script" onclick={() => { mediaTab('script') }}>{t('ms.tab.script', lang)}</button>
        <button id="ms-tabbtn-image" onclick={() => { mediaTab('image') }}>{t('ms.tab.image', lang)}</button>
        <button id="ms-tabbtn-voice" onclick={() => { mediaTab('voice'); vedRefresh(); }}>{t('ms.tab.voice', lang)}</button>
        <button id="ms-tabbtn-video" class="active" onclick={() => { mediaTab('video') }}>{t('ms.tab.video', lang)}</button>
      </div>
      <div class="scroll">
        <div id="ms-tab-script" style="display:none">
          <h3>{t('ms.tab.script', lang)}</h3>
          <div class="se-wrap">
            <div class="se-side">
              <button class="se-menubtn" data-se-menu="social" onclick={() => setSeMenu('social')}>{t('se.menu.social', lang)}</button>
              <button class="se-menubtn" data-se-menu="artikel" onclick={() => setSeMenu('artikel')}>{t('se.menu.artikel', lang)}</button>
              <button class="se-menubtn" data-se-menu="movie" onclick={() => setSeMenu('movie')}>{t('se.menu.movie', lang)}</button>
            </div>
            <div id="se-main" class="se-main"></div>
          </div>
        </div>
        <div id="ms-tab-image" style="display:none">
          <div class="img-layout">
          <div class="img-brand-side">
          <h4>{t('ms.tab.brand', lang)}</h4>
          <div id="brand-main"></div>
          </div>
          <div class="img-main">
          <div id="img-bulk-tabs"></div>
          <div class="se-group"><label>{t('img.brief', lang)}<textarea id="img-brief" rows="10" class="se-field" placeholder={t('img.brief.ph', lang)}></textarea></label></div>
          <div class="se-group"><label>{t('img.header', lang)}<input id="img-header" class="se-field" type="text"></label></div>
          <div class="se-group"><label>{t('img.title', lang)}<input id="img-title" class="se-field" type="text"></label></div>
          <div class="se-group"><label>{t('img.subtitle', lang)}<input id="img-subtitle" class="se-field" type="text"></label></div>
          <div class="se-group"><label>{t('img.body', lang)}<textarea id="img-body" rows="3" class="se-field"></textarea></label></div>
          <div class="se-group"><label>{t('img.listicle', lang)}<textarea id="img-listicle" rows="3" class="se-field"></textarea></label></div>
          <div class="se-group"><label>{t('img.footer', lang)}<textarea id="img-footer" rows="2" class="se-field"></textarea></label></div>
          <div class="se-group"><label>{t('img.palette', lang)}<input id="img-palette" class="se-field" type="text"></label></div>
          <div class="se-group"><label>{t('img.style', lang)}<select id="img-style" class="se-field">
            <option value="photorealistic">photorealistic</option><option value="product photography">product photography</option><option value="flat design">flat design</option><option value="illustration">illustration</option><option value="3D model">3D model</option>
          </select></label></div>
          <div class="se-group"><label>{t('img.provider', lang)}<select id="img-provider" class="se-field">
            <option value="meta">{t('img.provider.meta', lang)}</option><option value="google">{t('img.provider.google', lang)}</option>
          </select></label></div>
          <div class="se-group"><label>{t('img.output', lang)}<select id="img-output" class="se-field">
            <option value="poster">{t('img.output.poster', lang)}</option><option value="storyboard">{t('img.output.storyboard', lang)}</option><option value="carousel">{t('img.output.carousel', lang)}</option>
          </select></label></div>
          <div class="se-group" id="img-ratio-wrap"><label>{t('img.ratio', lang)}<select id="img-ratio" class="se-field">
            <option value="1:1">1:1</option><option value="4:5">4:5</option><option value="9:16">9:16</option><option value="16:9">16:9</option><option value="3:4">3:4</option><option value="3:2">3:2</option><option value="2:3">2:3</option>
          </select></label></div>
          <div class="se-group" id="img-n-wrap"><label>{t('img.n', lang)}<select id="img-n" class="se-field">
            <option value="1">1</option><option value="2">2</option><option value="4">4</option>
          </select></label></div>
          <div class="se-group" id="img-duration-wrap"><label>{t('img.duration', lang)}<input id="img-duration" class="se-field" type="number" min="5" max="60" value="30"></label></div>
          <div class="se-group" id="img-scenes-wrap"><label>{t('img.scenes', lang)}<select id="img-scenes" class="se-field">
            <option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option>
          </select></label></div>
          <div class="se-group" id="img-sb-wrap"><h4>{t('img.sb.title', lang)}</h4><button id="img-sb-build" class="se-btn2">{t('img.sb.build', lang)}</button><div id="img-sb-panels"></div><p class="se-note" id="img-sb-total"></p></div>
          <div class="se-group" id="img-slides-wrap"><label>{t('img.slides', lang)}<select id="img-slides" class="se-field">
            <option value="6">6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option>
          </select></label></div>
          <div class="se-group" id="img-tpl-wrap"><label><input type="checkbox" id="img-tpl-mh"> {t('img.tpl.mh', lang)}</label><p class="se-note">{t('img.tpl.mh.note', lang)}</p></div>
          <div class="se-group"><label><input type="checkbox" id="img-textfree" checked> {t('img.textfree', lang)}</label></div>
          <div id="img-preview" class="se-note"></div>
          <div class="se-group"><button id="img-generate" class="se-btn">{t('img.generate', lang)}</button> <button id="img-approve" class="se-btn2">{t('img.approve', lang)}</button> <button id="img-load-script" class="se-btn2">{t('img.loadscript', lang)}</button> <button id="img-clear" class="se-btn2">{t('img.clear', lang)}</button></div>
          <div id="img-status" class="se-note"></div>
          <div id="img-loaded" class="img-card" style="display:none"></div>
          <div id="img-variants" class="mediagrid"></div>
          <h4>{t('img.gallery', lang)}</h4>
          <div id="img-gallery" class="mediagrid"></div>
          </div>
          </div>
        </div>
        <div id="ms-tab-voice" style="display:none">
          <h3>{t('ms.tab.voice', lang)}</h3>
          <h4>{t('vs.embed.title', lang)}</h4>
          <div class="vs-embed">
            <div class="vs-bar"><b>VoiceStudio</b> <span id="vsEmbedStatus" class="badge"></span> <button class="btn btn-sm" onclick={() => { vsEmbedReload() }}>{t('vs.embed.reload', lang)}</button></div>
            <iframe id="vsEmbedFrame" title="VoiceStudio" onload={() => { vsEmbedCheck() }} style="display:none"></iframe>
            <p class="se-note" id="vsEmbedNote"></p>
          </div>
          <h4>{t('vs.clone.title', lang)}</h4>
          <label>{t('vs.voice.label', lang)}</label>
          <select id="vsVoiceSel"><option value="">{t('vs.voice.empty', lang)}</option></select>
          <label>{t('vs.text.label', lang)}</label>
          <textarea id="vsText" rows="4" style="width:100%;box-sizing:border-box" placeholder={t('vs.text.placeholder', lang)}></textarea>
          <label>{t('vs.speed.label', lang)}</label>
          <input id="vsSpeed" type="number" min="0.5" max="2" step="0.1" value="1">
          <button class="btn btn-primary" onclick={() => { vsGenerateTts() }}>{t('vs.generate', lang)}</button>
          <span id="vsNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span>
          <audio id="vsAudio" controls style="display:none;width:100%;margin-top:8px"></audio>
          <a id="vsDownload" style="display:none">{t('vs.download', lang)}</a>
          <h4>{t('sherpa.title', lang)}</h4>
          <p><span id="sherpaStatus" class="badge"></span> <button class="btn btn-sm" onclick={() => { sherpaRenderStatus() }}>{t('vs.status.check', lang)}</button> <button class="btn btn-primary" onclick={() => { sherpaSetup() }}>{t('sherpa.setup', lang)}</button> <button class="btn btn-primary" onclick={() => { sherpaTtsFromTab() }}>{t('sherpa.tts', lang)}</button> <span id="sherpaNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span></p>
          <p style="color:#a1a1a1;font-size:13px">{t('sherpa.note', lang)}</p>
          <h4>{t('vs.ref.title', lang)}</h4>
          <label>{t('vs.ref.label', lang)}</label>
          <input id="vsRefFile" type="file" accept="audio/*">
          <label>{t('vs.text.label', lang)}</label>
          <textarea id="vsCloneText" rows="4" style="width:100%;box-sizing:border-box" placeholder={t('vs.text.placeholder', lang)}></textarea>
          <textarea id="vsRefText" rows="2" style="width:100%;box-sizing:border-box" placeholder={t('vs.ref.text.placeholder', lang)}></textarea>
          <label>{t('vs.speed.label', lang)}</label>
          <input id="vsCloneSpeed" type="number" min="0.5" max="2" step="0.1" value="1">
          <button class="btn btn-primary" onclick={() => { vsGenerateClone() }}>{t('vs.generate.clone', lang)}</button>
          <span id="vsCloneNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span>
          <audio id="vsCloneAudio" controls style="display:none;width:100%;margin-top:8px"></audio>
          <a id="vsCloneDownload" style="display:none">{t('vs.download', lang)}</a>
          <h4>{t('vs.models.title', lang)}</h4>
          <ul id="vsModelList" style="font-size:14px;line-height:1.8"><li>{t('vs.models.empty', lang)}</li></ul>
          <h4>{t('ved.title', lang)}</h4>
          <p style="color:#a1a1a1;font-size:13px">{t('ved.note', lang)}</p>
          <canvas id="vedCanvas" width="900" height="120" style="width:100%;height:120px;background:#161616;border:1px solid #2a2a2a;cursor:crosshair"></canvas>
          <p><button class="btn btn-primary" id="vedPlay" onclick={() => { vedPlay() }}>{t('ved.play', lang)}</button> <span id="vedTime" style="color:#a1a1a1;font-size:13px;margin-left:8px">—</span> <span id="vedSelInfo" style="color:#A6EBB1;font-size:13px;margin-left:8px"></span></p>
          <p><button class="btn btn-sm" onclick={() => { vedTrimSel() }}>{t('ved.trim', lang)}</button> <button class="btn btn-sm" onclick={() => { vedCutSel() }}>{t('ved.cut', lang)}</button> <button class="btn btn-sm" onclick={() => { vedClearSel() }}>{t('ved.clear_sel', lang)}</button></p>
          <audio id="vedAudio" style="display:none"></audio>
          <p><label for="vedUpload">{t('ved.upload', lang)}</label> <input id="vedUpload" type="file" accept="audio/*"> <span id="vedNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span></p>
          <h4>{t('ved.assets', lang)}</h4>
          <div id="vedAssets"></div>
          <h4>{t('ved.transcript', lang)}</h4>
          <div id="vedTranscript"></div>
        </div>
        <div id="ms-tab-video" class="ms-video">
          <div class="ms-card">
<div class="se-group"><h4>{t('vg.title', lang)}</h4></div>
<div class="vg-card">
<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><label>{t('vg2.model', lang)} <select id="vg-model" bind:value={vgModel}><option value="omni">{t('vg2.model.omni', lang)}</option><option value="wan">{t('vg2.model.wan', lang)}</option><option value="hyperframes">{t('vg2.model.hf', lang)}</option></select></label></div>
<div class="se-group"><h4>{t('vg2.cine.title', lang)}</h4>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn btn-sm" data-vg-cine="1" onclick={() => vgCineLoadTitle()}>{t('vg2.cine.titlecard', lang)}</button>{#each CINE_BEATS as b}<button class="btn btn-sm" data-vg-cine={b.n} onclick={() => vgCineLoadBeat(b)}>{t('vg.tpl.beat', lang)} {b.n}</button>{/each}</div></div>
{#if vgModel === 'omni'}
<div class="vg-tabs"><button class="vg-tab {vgTab === 'prompt' ? 'vg-tab-sel' : ''}" data-vg-tab="prompt" onclick={() => { vgTab = 'prompt'; }}>{t('vg2.tab.prompt', lang)}</button><button class="vg-tab {vgTab === 'refs' ? 'vg-tab-sel' : ''}" data-vg-tab="refs" onclick={() => { vgTab = 'refs'; }}>{t('vg2.tab.refs', lang)}</button><button class="vg-tab {vgTab === 'frames' ? 'vg-tab-sel' : ''}" data-vg-tab="frames" onclick={() => { vgTab = 'frames'; }}>{t('vg2.tab.frames', lang)}</button></div>
{#if vgTab === 'prompt'}
<label>{t('vg.prompt', lang)}<textarea id="vg-prompt" rows="3" class="se-field" bind:value={vgPrompt}></textarea></label>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button id="vg-sample" class="btn btn-sm" onclick={() => vgLoadSample(false)}>{t('vg2.sample', lang)}</button><button id="vg-portrait" class="btn btn-sm" onclick={() => vgLoadSample(true)}>{t('vg2.portrait', lang)}</button><button id="vg-prompt-clear" class="btn btn-sm" onclick={() => { vgPrompt = ''; vgStatus = ''; }}>{t('img.clear', lang)}</button></div>
{:else if vgTab === 'refs'}
<p class="se-note">{t('vg2.refs.count', lang, { n: vgRefs.length })}</p>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px"><input id="vg-refs-file" type="file" accept="image/*" aria-label={t('vg.ref.file', lang)} onchange={(e) => vgRefsFromFile((e.target as HTMLInputElement).files?.[0] || null)}><button id="vg-refs-lib" class="btn btn-sm" onclick={() => vgLibLoad('refs')}>{t('vg.ref.lib', lang)}</button><button id="vg-refs-clear" class="btn btn-sm" onclick={() => { vgRefs = []; vgStatus = ''; }}>{t('img.clear', lang)}</button></div>
{#if vgLibTarget === 'refs' && vgLibList.length}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">{#each vgLibList as it}<button class="vg-ref-thumb" data-vg-ref={it.file} onclick={() => vgLibPick(it)} title={it.title}><img src="data:{it.mime};base64,{it.b64}" alt={it.title} style="width:72px;height:72px;object-fit:cover;display:block"></button>{/each}</div>{/if}
{#if vgRefs.length}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">{#each vgRefs as r, i}<div class="vg-refslot"><img src="data:{r.mime};base64,{r.b64}" alt={r.label}><button class="vg-refslot-x" data-vg-refdel={i} onclick={() => vgRefsDel(i)}>✕</button><span class="se-note">{r.label}</span></div>{/each}</div>{/if}
<p class="se-note">{t('vg2.refs.note', lang)}</p>
{:else}
<div class="se-group"><label for="vg-first-file">{t('vg2.first', lang)}</label>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px"><input id="vg-first-file" type="file" accept="image/*" aria-label={t('vg.ref.file', lang)} onchange={(e) => vgFirstFromFile((e.target as HTMLInputElement).files?.[0] || null)}><button id="vg-first-lib" class="btn btn-sm" onclick={() => vgLibLoad('first')}>{t('vg.ref.lib', lang)}</button>{#if vgFirst}<button id="vg-first-clear" class="btn btn-sm" onclick={() => { vgFirst = null; vgStatus = ''; }}>{t('vg.ref.clear', lang)}</button>{/if}</div>
{#if vgLibTarget === 'first' && vgLibList.length}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">{#each vgLibList as it}<button class="vg-ref-thumb" data-vg-ref={it.file} onclick={() => vgLibPick(it)} title={it.title}><img src="data:{it.mime};base64,{it.b64}" alt={it.title} style="width:72px;height:72px;object-fit:cover;display:block"></button>{/each}</div>{/if}
{#if vgFirst}<div style="margin-top:8px"><img id="vg-first-preview" src="data:{vgFirst.mime};base64,{vgFirst.b64}" alt={vgFirst.label} style="max-width:220px;display:block"><span class="se-note">{vgFirst.label}</span></div>{/if}
</div>
<div class="se-group"><label for="vg-last-file">{t('vg2.last', lang)}</label>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px"><input id="vg-last-file" type="file" accept="image/*" aria-label={t('vg.ref.file', lang)} onchange={(e) => vgLastFromFile((e.target as HTMLInputElement).files?.[0] || null)}><button id="vg-last-lib" class="btn btn-sm" onclick={() => vgLibLoad('last')}>{t('vg.ref.lib', lang)}</button>{#if vgLast}<button id="vg-last-clear" class="btn btn-sm" onclick={() => { vgLast = null; vgStatus = ''; }}>{t('vg.ref.clear', lang)}</button>{/if}</div>
{#if vgLibTarget === 'last' && vgLibList.length}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">{#each vgLibList as it}<button class="vg-ref-thumb" data-vg-ref={it.file} onclick={() => vgLibPick(it)} title={it.title}><img src="data:{it.mime};base64,{it.b64}" alt={it.title} style="width:72px;height:72px;object-fit:cover;display:block"></button>{/each}</div>{/if}
{#if vgLast}<div style="margin-top:8px"><img id="vg-last-preview" src="data:{vgLast.mime};base64,{vgLast.b64}" alt={vgLast.label} style="max-width:220px;display:block"><span class="se-note">{vgLast.label}</span></div>{/if}
</div>
<p class="se-note">{t('vg2.frames.note', lang)}</p>
{/if}
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
<label>{t('vg.aspect', lang)} <select id="vg-aspect" bind:value={vgAspect}><option value="9:16">9:16</option><option value="16:9">16:9</option></select></label>
<label>{t('vg.res', lang)} <select id="vg-res" bind:value={vgRes}><option value="360p">360p</option><option value="720p">720p</option><option value="1080p">1080p</option><option value="4k">4K</option></select></label>
</div>
<button id="vg-generate" class="btn btn-primary" disabled={vgBusy} onclick={() => vgGenerate()}>{vgBusy ? t('vg.generating', lang) : t('vg.generate', lang)}</button> <button id="vg-add-timeline" class="btn btn-sm" disabled={!vgLastPath} onclick={() => vgAddToTimeline()}>{t('vg.add_timeline', lang)}</button>
<p id="vg-status" class="se-note" style="white-space:pre-line">{vgStatus}</p>
{:else if vgModel === 'wan'}
<label>{t('vg.prompt', lang)}<textarea id="vg-wan-prompt" rows="3" class="se-field" bind:value={vgPrompt}></textarea></label>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button id="vg-wan-prompt-clear" class="btn btn-sm" onclick={() => { vgPrompt = ''; vgStatus = ''; }}>{t('img.clear', lang)}</button></div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
<label>{t('vg.aspect', lang)} <select id="vg-wan-aspect" bind:value={vgAspect}><option value="9:16">9:16</option><option value="16:9">16:9</option></select></label>
<label>{t('vg.res', lang)} <select id="vg-wan-res" bind:value={vgWanRes}><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
<label>{t('vg.dur', lang)} <input id="vg-wan-sec" type="number" min="2" max="30" bind:value={vgWanSec} style="width:80px"></label>
</div>
<p class="se-note">{t('vg.wan.note', lang)}</p>
<p class="se-note">{t('vg.wan.price', lang, { usd: wanPriceUsd(vgWanRes, vgWanSec).toFixed(2), idr: Math.round(wanPriceUsd(vgWanRes, vgWanSec) * 18148).toLocaleString('id-ID'), res: vgWanRes, s: vgWanSec })}</p>
<button id="vg-wan-generate" class="btn btn-primary" disabled={vgBusy} onclick={() => vgWanGenerate()}>{vgBusy ? t('vg.generating', lang) : t('vg.generate', lang)}</button> <button id="vg-wan-add-timeline" class="btn btn-sm" disabled={!vgWanLastPath} onclick={() => vgWanAddToTimeline()}>{t('vg.add_timeline', lang)}</button>
<p id="vg-wan-status" class="se-note" style="white-space:pre-line">{vgStatus}</p>
{:else}
<div class="se-group"><h4>{t('hf.title', lang)}</h4>
<div class="se-group"><label>{t('hf.desc', lang)}<textarea id="hf-desc" rows="3" class="se-field" bind:value={hfDesc}></textarea></label></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px"><button id="hf-gen-html" class="btn btn-primary" disabled={hfGenBusy} onclick={() => hfGen()}>{hfGenBusy ? t('hf.generating', lang) : t('hf.generate', lang)}</button></div>
<label for="hf-html">{t('hf.html', lang)}</label>
<textarea id="hf-html" rows="14" class="se-field" style="font-family:monospace" bind:value={hfHtml}></textarea>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
<button id="hf-sample" class="btn btn-sm" onclick={() => { hfHtml = HF_SAMPLE; }}>{t('hf.sample', lang)}</button>
<label>{t('hf.quality', lang)} <select id="hf-quality" bind:value={hfQuality}><option value="draft">{t('hf.quality.draft', lang)}</option><option value="looks">{t('hf.quality.looks', lang)}</option><option value="delivery">{t('hf.quality.delivery', lang)}</option></select></label>
<button id="hf-check" class="btn btn-sm" onclick={() => hfCheck()}>{t('hf.check', lang)}</button>
<button id="hf-render" class="btn btn-primary" disabled={hfBusy} onclick={() => hfRender()}>{hfBusy ? t('hf.rendering', lang) : t('hf.render', lang)}</button>
<button id="hf-add-timeline" class="btn btn-sm" disabled={!hfLastPath || !hfLastDur} onclick={() => hfAddToTimeline()}>{t('hf.add_timeline', lang)}</button><button id="hf-clear" class="btn btn-sm" onclick={() => { hfHtml = ''; hfStatus = ''; }}>{t('img.clear', lang)}</button>
</div>
<p id="hf-status" class="se-note" style="white-space:pre-line">{hfStatus}</p>
</div>
{/if}
<div class="se-group"><label>{t('img.plan', lang)}<textarea id="ve-plan" rows="2" class="se-field" value={ve2Plan} oninput={(e) => { ve2Plan = (e.target as HTMLTextAreaElement).value; ve2SaveState(); }}></textarea></label></div>
</div>
          <p id="ve2Status" class="se-note" style="white-space:pre-line">{ve2Status ? ve2Status : t('ve2.ready', lang)}</p>
          {#if ve2Frame}<div><img id="ve2Frame" src={ve2Frame} alt="" style="max-width:100%"></div>{/if}
          </div>
          <div class="se-group"><h4>{t('ve2.editor', lang)}</h4></div>
          <div class="ms-card">
          <div class="ve2-top">
          <div class="ve2-assets">
          <h4 style="margin:0 0 8px">{t('word.aset', lang)}</h4>
          <div style="display:flex;gap:6px;margin-top:8px"><input id="ve2NewSrc" type="text" bind:value={ve2NewSrc} placeholder="/Users/mac/Movies/klip.mp4" style="flex:1"><select id="ve2NewKind" bind:value={ve2NewKind}><option value="Image">Image</option><option value="Video">Video</option><option value="Audio">Audio</option></select><button id="ve2AssetAdd" class="btn btn-sm" onclick={() => { ve2AddAsset() }}>{t('t1.add', lang)}</button></div>
          <div class="ve2-asset-grid">
          {#each ve2Assets as a (a.id)}
          <div class="ve2-thumb-wrap">
          <button type="button" class="ve2-thumb" data-ve2-asset={a.id} title={a.name} draggable="true" ondragstart={(e) => { e.dataTransfer?.setData('text/ve2-asset', a.id); e.dataTransfer?.setData('text/plain', a.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'; }} onclick={() => { ve2AddAssetClip(a.id) }}>
          {#if ve2Thumbs[a.id]}
          <img src={ve2Thumbs[a.id]} alt={a.name} draggable="false">
          {:else}
          <span class="ve2-thumb-icon">{a.icon}</span>
          {/if}
          </button>
          <button type="button" class="ve2-thumb-x" data-ve2-assetdel={a.id} title={t('ve2.del_asset', lang)} onclick={() => { ve2DelAsset(a.id) }}>×</button>
          </div>
          {/each}
          </div>
          </div>
          <div class="ve2-preview">
          <video id="ve2Video" bind:this={ve2VideoEl} style="width:100%;background:#000;display:{ve2VideoOn ? 'block' : 'none'};max-height:min(480px, 55vh);object-fit:contain" controls onpause={() => { ve2VideoPaused(); }}></video>
          {#if !ve2VideoOn}
          <div class="ve2-preview-box" style="aspect-ratio: {ve2RatioCss}">
            {#if ve2SelClip() && ve2PreviewSrc}
              {#if ve2PreviewKind === 'image'}
                <img id="ve2PreviewImg" src={ve2PreviewSrc} alt={ve2SelClip()?.name ?? ''} style="width:100%;background:#000;display:block;max-height:min(480px, 55vh);object-fit:contain">
              {:else if ve2PreviewKind === 'audio'}
                <div class="ve2-canvas"><div id="ve2PreviewLabel">{ve2PreviewLabel}</div><audio id="ve2PreviewAudio" src={ve2PreviewSrc} controls style="width:90%" onplay={(e) => { ve2PreviewPlay(e); }}></audio></div>
              {:else}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video id="ve2PreviewVideo" src={ve2PreviewSrc} style="width:100%;background:#000;display:block;max-height:min(480px, 55vh);object-fit:contain" controls onplay={(e) => { ve2PreviewPlay(e); }}></video>
              {/if}
            {:else if ve2SelClip() && ve2PreviewFail}
              <div class="ve2-canvas"><div id="ve2PreviewLabel">{ve2PreviewLabel}</div><small>{t('ve2.preview_fail', lang)} {ve2PreviewErr}</small></div>
            {:else if ve2SelClip()}
              <div class="ve2-canvas"><div id="ve2PreviewLabel">{ve2PreviewLabel}</div></div>
            {:else}
              <div class="ve2-canvas"><div id="ve2PreviewLabel">{ve2PreviewLabel}</div><small>{t('ve2.no_clip', lang)}</small></div>
            {/if}
          </div>
          {/if}
          <div class="ve2-transport"><button onclick={() => { ve2ToStart() }} title={t('title.first', lang)}>⏮</button><button onclick={() => { ve2PlayToggle() }} title={t('title.play', lang)}>{ve2Playing ? t('ve2.stop', lang) : t('ve.play', lang)}</button><button onclick={() => { ve2ToEnd() }} title={t('title.last', lang)}>⏭</button><span id="ve2Time">{ve2TimeText}</span><span style="margin-left:auto">{t('ve.zoom', lang)} <select id="ve2Zoom" value={ve2Zoom} onchange={(e) => { ve2Zoom = Number(e.currentTarget.value); ve2SaveState(); }}><option value={0.5}>50%</option><option value={1}>100%</option><option value={2}>200%</option></select> {t('ve2.ratio', lang)} <select id="ve2Ratio" value={ve2PreviewRatio} onchange={(e) => { ve2PreviewRatio = e.currentTarget.value; ve2SaveState(); }}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="4:5">4:5</option></select></span></div>
          </div>
          <div class="ve2-inspector">
          {#if ve2SelClip()}
          <h4 style="margin:0 0 8px">{t('ve.inspector', lang)}</h4>
          <label>{t('word.nama', lang)}</label><input id="ve2Name" type="text" value={ve2SelClip()?.name ?? ''} oninput={(e) => { ve2SetField('name', e.currentTarget.value) }}>
          <label>{t('ve.start.label', lang)}</label><input id="ve2Start" type="number" step="0.1" value={ve2SelClip()?.start ?? 0} onchange={(e) => { ve2SetField('start', e.currentTarget.value) }}>
          <label>{t('ve.dur.label', lang)}</label><input id="ve2Dur" type="number" step="0.1" value={ve2SelClip()?.dur ?? 0} onchange={(e) => { ve2SetField('dur', e.currentTarget.value) }}>
          <label>{t('ve.track', lang)}</label><select id="ve2Track" value={ve2SelClip()?.track ?? 'Video'} onchange={(e) => { ve2SetField('track', e.currentTarget.value) }}><option value="Video">{t('word.video', lang)}</option><option value="B-Roll">B-Roll</option><option value="Audio">{t('word.audio', lang)}</option><option value="Teks">{t('word.teks', lang)}</option></select>
          <label>{t('ve.effect', lang)}</label><select id="ve2Fx" value={ve2SelClip()?.effect ?? 'none'} onchange={(e) => { ve2SetField('effect', e.currentTarget.value) }}><option value="none">{t('ve.fx.none', lang)}</option><option value="fade">{t('ve.fx.fade', lang)}</option><option value="zoom">{t('ve.fx.zoom', lang)}</option></select>
          {/if}
          <!-- v217: toolbar atas dihapus; blok tombol proyek kini selalu tampil (id I dipertahankan). -->
          <div class="ve2-inspector-acts">
          <button id="ve2BtnSaveI" class="btn btn-sm" onclick={() => { ve2SaveProject() }}>{t('settings.saveproj', lang)}</button>
          <button id="ve2BtnExportI" class="btn btn-sm" onclick={() => { ve2Export() }} disabled={ve2Busy}>{ve2Busy ? t('ve2.rendering', lang) : t('ve.export', lang)}</button>
          <button id="ve2BtnPreviewI" class="btn btn-sm" onclick={() => { ve2Preview() }}>{t('ve.render', lang)}</button>
          <label>{t('t1.output', lang)}<input id="ve2OutI" type="text" bind:value={ve2Out}></label>
          </div>
          </div>
          </div>
          </div>
          <div class="ms-card">
          <div class="timeline" id="ve2Timeline" style="overflow-x:auto">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div style="position:relative;width:{ve2Zoom * 100}%" ondragover={(e) => { e.preventDefault(); }} ondrop={(e) => { ve2DropAsset(e) }}>
          <!-- v196: +78px = label track 70 + gap 8 (app.css .track); tanpa ini playhead meleset 78px dari bar (tampak berhenti ~2 dtk lebih awal). --><div class="playhead" id="playhead2" style="left:calc(78px + {ve2PlayheadPct}%)"></div>
          <div class="ve-ruler" id="ve2Ruler" onclick={(e) => { ve2RulerClick(e) }}>{#each ve2RulerTicks as tick}<span style="left:calc(78px + {(tick / ve2Total) * 100}%)">{ve2Fmt(tick)}</span>{/each}</div>
          <div class="track"><span class="tlabel">{t('word.video', lang)}</span>
          {#each ve2Bars('Video') as b (b.clip.id)}
          <div class="bar ve-clip" onpointerdown={(e) => { ve2BarDragStart(e, b.clip.id) }} class:selected={b.clip.id === ve2SelId} data-ve2-clip={b.clip.id} style="margin-left:{b.margin}%;width:{ve2BarWidth(b.clip)}%;background:{b.clip.id === ve2SelId ? '#EB87B4' : '#5b5b5b'}" onclick={() => { ve2SelectClip(b.clip.id) }}>{b.clip.name}<button type="button" class="ve2-resize" data-ve2-resize={b.clip.id} aria-label={t('ve2.resize', lang)} onpointerdown={(e) => { ve2ResizeStart(e, b.clip.id) }}></button></div>
          {/each}
          </div>
          <div class="track"><span class="tlabel">B-Roll</span>
          {#each ve2Bars('B-Roll') as b (b.clip.id)}
          <div class="bar ve-clip" onpointerdown={(e) => { ve2BarDragStart(e, b.clip.id) }} class:selected={b.clip.id === ve2SelId} data-ve2-clip={b.clip.id} style="margin-left:{b.margin}%;width:{ve2BarWidth(b.clip)}%;background:{b.clip.id === ve2SelId ? '#EB87B4' : '#5b5b5b'}" onclick={() => { ve2SelectClip(b.clip.id) }}>{b.clip.name}<button type="button" class="ve2-resize" data-ve2-resize={b.clip.id} aria-label={t('ve2.resize', lang)} onpointerdown={(e) => { ve2ResizeStart(e, b.clip.id) }}></button></div>
          {/each}
          </div>
          <div class="track"><span class="tlabel">{t('word.audio', lang)}</span>
          {#each ve2Bars('Audio') as b (b.clip.id)}
          <div class="bar ve-clip" onpointerdown={(e) => { ve2BarDragStart(e, b.clip.id) }} class:selected={b.clip.id === ve2SelId} data-ve2-clip={b.clip.id} style="margin-left:{b.margin}%;width:{ve2BarWidth(b.clip)}%;background:{b.clip.id === ve2SelId ? '#EB87B4' : '#5b5b5b'}" onclick={() => { ve2SelectClip(b.clip.id) }}>{b.clip.name}<button type="button" class="ve2-resize" data-ve2-resize={b.clip.id} aria-label={t('ve2.resize', lang)} onpointerdown={(e) => { ve2ResizeStart(e, b.clip.id) }}></button></div>
          {/each}
          </div>
          <div class="track"><span class="tlabel">{t('word.teks', lang)}</span>
          {#each ve2Bars('Teks') as b (b.clip.id)}
          <div class="bar ve-clip" onpointerdown={(e) => { ve2BarDragStart(e, b.clip.id) }} class:selected={b.clip.id === ve2SelId} data-ve2-clip={b.clip.id} style="margin-left:{b.margin}%;width:{ve2BarWidth(b.clip)}%;background:{b.clip.id === ve2SelId ? '#EB87B4' : '#5b5b5b'}" onclick={() => { ve2SelectClip(b.clip.id) }}>{b.clip.name}<button type="button" class="ve2-resize" data-ve2-resize={b.clip.id} aria-label={t('ve2.resize', lang)} onpointerdown={(e) => { ve2ResizeStart(e, b.clip.id) }}></button></div>
          {/each}
          </div>
          </div>
          </div>
          </div>
          <div id="ve2TrackBar" class="ve2-trackbar">
          <button id="ve2BtnCut" class="btn btn-sm" disabled={!ve2SelClip()} onclick={() => { ve2Cut() }}>{t('ve.cut', lang)}</button>
          <button id="ve2ClipDel" class="btn btn-sm" disabled={!ve2SelClip()} onclick={() => { ve2DelClip() }}>{t('ve2.del_clip', lang)}</button>
          <button id="ve2BtnText" class="btn btn-sm" onclick={() => { ve2AddText() }}>{t('ve.addtext', lang)}</button>
          <button id="ve2BtnSub" class="btn btn-sm" onclick={() => { ve2Subtitle() }}>{t('ve.subtitle', lang)}</button>
          <button id="ve2BtnTrans" class="btn btn-sm" disabled={!ve2SelClip()} onclick={() => { ve2Transition() }}>{t('ve.transition', lang)}</button>
          <button id="ve2BtnPlay" class="btn btn-sm" disabled={ve2Playing} onclick={() => { if (!ve2Playing) ve2PlayToggle(); }}>{t('ve.play', lang)}</button>
          <button id="ve2BtnStop" class="btn btn-sm" disabled={!ve2Playing} onclick={() => { if (ve2Playing) ve2PlayToggle(); }}>{t('ve2.stop', lang)}</button>
          <button id="ve2BtnSnap" type="button" class="btn btn-sm" aria-pressed={ve2Snap} style:background={ve2Snap ? '#8ED694' : undefined} style:color={ve2Snap ? '#262626' : undefined} onclick={() => { ve2Snap = !ve2Snap; ve2SaveState(); }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M6 2h4v7a2 2 0 0 0 4 0V2h4v7a6 6 0 0 1-12 0V2z"/></svg> {t('ve2.snap', lang)}</button>
          </div>
        </div>
      </div>
    </div>
    {#if ve2AssetDlg}
    <div class="ve2-dlg"><div class="ve2-dlg-box">
    <h4 style="margin:0 0 12px">{t('ve2.add_src', lang)}</h4>
    <button id="ve2-src-lib" class="btn btn-sm" onclick={() => { ve2LibLoad() }}>{t('ve2.from_lib', lang)}</button>
    <button id="ve2-src-file" class="btn btn-sm" onclick={() => { ve2AssetDlg = false; ve2AddAssetFiles(); }}>{t('ve2.from_file', lang)}</button>
    <button class="btn btn-sm" onclick={() => { ve2AssetDlg = false; }}>{t('se.import.close', lang)}</button>
    </div></div>
    {/if}
    {#if ve2LibDlg}
    <div class="ve2-dlg"><div class="ve2-dlg-box">
    <h4 style="margin:0 0 12px">{t('ve2.from_lib', lang)}</h4>
    {#if ve2LibList.length}
    {#each ve2LibList as it}
    <button data-ve2-libpick={it.file} class="btn btn-sm" style="display:block;width:100%;text-align:left" onclick={() => { ve2LibPick(it.file, it.title) }}>🖼️ {it.title}</button>
    {/each}
    {:else}
    <p class="se-note">{t('ve2.lib_empty', lang)}</p>
    {/if}
    <button class="btn btn-sm" onclick={() => { ve2LibDlg = false; }}>{t('se.import.close', lang)}</button>
    </div></div>
    {/if}
    <div class="view" id="view-planner">
      <div class="scroll">
        <h3 style="margin:0 14px 12px">{t('planner.header', lang)}</h3>
        <div id="socNotice" style="display:none;margin:0 14px 12px;padding:10px 12px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px"></div>
        <div id="socPasteWrap" style="display:none;margin:0 14px 12px;padding:10px 12px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px"></div>
        <div id="nativePlanner"></div>
        <div id="socItemDlg"></div>
      </div>
    </div>
    <div class="view" id="view-campaign">
      <div class="colhead"><h2>{t('nav.campaign', lang)}</h2></div>
      <div class="filters" style="flex-shrink:0;margin:0 14px 12px">
        <button id="cp-tabbtn-leads" class="active" onclick={() => { campaignTab('leads') }}>{t('cp.tab.leads', lang)}</button>
        <button id="cp-tabbtn-crm" onclick={() => { campaignTab('crm') }}>{t('cp.tab.crm', lang)}</button>
        <button id="cp-tabbtn-outreach" onclick={() => { campaignTab('outreach') }}>{t('cp.tab.outreach', lang)}</button>
        <button id="cp-tabbtn-followup" onclick={() => { campaignTab('followup') }}>{t('cp.tab.followup', lang)}</button>
      </div>
      <div class="scroll">
        <div id="cp-tab-leads">
          <p>{t('cp.leads.note', lang)}</p>
          <div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:12px;padding:16px;margin-bottom:12px">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
              <label style="flex:1;min-width:140px">{t('cp.lead.name', lang)}<br><input id="cpLeadName" class="input" style="width:100%"></label>
              <label style="flex:1;min-width:140px">{t('cp.lead.contact', lang)}<br><input id="cpLeadContact" class="input" style="width:100%"></label>
              <label>{t('cp.lead.channel', lang)}<br><select id="cpLeadChannel" class="input"><option>WhatsApp</option><option>Instagram</option><option>Facebook</option><option>Email</option><option>Telepon</option><option>Lainnya</option></select></label>
              <label>{t('cp.lead.stage', lang)}<br><select id="cpLeadStage" class="input"><option>Prioritas</option><option>Prospek</option><option>Nurture</option><option>Dingin</option></select></label>
              <button class="btn" onclick={() => { cpAddLead() }}>{t('cp.lead.add', lang)}</button>
            </div>
            <p id="cpLeadNote" style="margin:8px 0 0"></p>
          </div>
          <div id="cp-leads-added"></div>
        </div>
        <div id="cp-tab-crm" style="display:none">
          <p>{t('cp.crm.note', lang)}</p>
          <div id="cp-crm-body"></div>
        </div>
        <div id="cp-tab-outreach" style="display:none">
          <p>{t('cp.outreach.note', lang)}</p>
          <div id="cp-outreach-body"></div>
        </div>
        <div id="cp-tab-followup" style="display:none">
          <p>{t('cp.followup.note', lang)}</p>
          <div id="cp-followup-body"></div>
        </div>
        <div id="cpDlg"></div>
      </div>
    </div>
    <div class="view" id="view-billing">
      <div class="colhead"><h2>{t('billing.title', lang)}</h2></div>
      <div class="scroll">
        <div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:12px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 12px">{t('billing.usage', lang)}</h3>
          <div class="bill-grid">
          {#each COST_ROWS as r}
          <div class="bill-card">
            <div><b>{r.model}</b> <span style="color:#a1a1a1">{r.provider}</span></div>
            <div style="color:#a1a1a1;font-size:13px">{t('cost.col.calls', lang)}: {r.calls} · {t('cost.col.input', lang)}: {r.input === null ? '—' : fmtInt(r.input, lang)} · {t('cost.col.output', lang)}: {r.output === null ? '—' : fmtInt(r.output, lang)} · {t('cost.col.tokens', lang)}: {fmtInt(r.tokens, lang)}</div>
            <div>{t('cost.col.usd', lang)}: {fmtUsd(r, lang)} · {t('cost.col.idr', lang)}: {fmtIdr(r, lang)}</div>
          </div>
          {/each}
          {#if imgSpend.images > 0}
          <div class="bill-card">
            <div><b>muse-image-1.0</b> <span style="color:#a1a1a1">Meta</span></div>
            <div>{t('img.billing', lang, { n: imgSpend.images })} · ${imgSpend.usd.toFixed(2)} ≈ Rp{imgSpend.idr.toLocaleString('id-ID')}</div>
          </div>
          {/if}
          {#if videoSpend.videos > 0}
          <div class="bill-card">
            <div><b>Gemini Omni</b> <span style="color:#a1a1a1">Google</span></div>
            <div>{t('vg.spend', lang, { n: videoSpend.videos })} · ${videoSpend.usd.toFixed(2)} ≈ Rp{videoSpend.idr.toLocaleString('id-ID')}</div>
          </div>
          {/if}
          {#if classaiSpend.videos > 0}
          <div class="bill-card">
            <div><b>Wan 3.0</b> <span style="color:#a1a1a1">ClassAI</span></div>
            <div>{t('vg.wan.spend', lang, { n: classaiSpend.videos })} · ${classaiSpend.usd.toFixed(2)} ≈ Rp{classaiSpend.idr.toLocaleString('id-ID')}</div>
          </div>
          {/if}
          {#if liveCost.calls > 0}
          <div class="bill-card">
            <div><b>{t('cost.live', lang)}</b> <span style="color:#a1a1a1">app</span></div>
            <div>{liveCost.calls} {t('cost.col.calls', lang)} · {fmtInt(liveCost.tokens, lang)} {t('cost.col.tokens', lang)} · ${liveCost.usd.toFixed(5)}</div>
          </div>
          {/if}
          </div>
          <div style="border-top:1px solid #2a2a2a;padding-top:12px"><b>{t('cost.total', lang)}</b>: {COST_TOTAL.calls} {t('cost.col.calls', lang)} · {fmtInt(COST_TOTAL.tokens, lang)} {t('cost.col.tokens', lang)} · {fmtUsd(COST_TOTAL, lang)} · {fmtIdr(COST_TOTAL, lang)}</div>
        </div>
        <div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:12px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 12px">{t('billing.credit', lang)}</h3>
          <div>{t('billing.credit.meta', lang)}: $150.00</div>
          <div>{t('billing.outstanding', lang)}: Rp 0</div>
          <div>{t('billing.paymethod', lang)}: {t('billing.paymethod.none', lang)}</div>
        </div>
        <div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:12px;padding:16px;margin-bottom:12px">
          <h3 style="margin:0 0 12px">{t('billing.limit', lang)}</h3>
          <div>{t('billing.limit.hard', lang)}: {fmtUsd(BILLING_HARD_LIMIT, lang)} (≈ Rp{fmtIdrNum(90740)})</div>
          <div>{t('billing.used', lang)}: ${(COST_TOTAL.usdMax + liveCost.usd + imgSpend.usd + videoSpend.usd + classaiSpend.usd).toFixed(4)} (≈ Rp{fmtIdrNum(Math.round((COST_TOTAL.usdMax + liveCost.usd + imgSpend.usd + videoSpend.usd + classaiSpend.usd) * 18137))})</div>
          {#if COST_TOTAL.usdMax + liveCost.usd + imgSpend.usd + videoSpend.usd + classaiSpend.usd > BILLING_HARD_LIMIT.usdMax}
          <div style="color:#EB87B4;margin-top:8px">{t('billing.over', lang)}</div>
          {/if}
        </div>
      </div>
    </div>
    <div class="view" id="view-settings">
      <div class="colhead"><h2>{t('view.settings.title', lang)}</h2><p>{t('colhead.settings.sub', lang)}</p></div>
      <div class="scroll">
        <h3>{t('settings.lang', lang)}</h3>
        <p><label>{t('settings.lang', lang)}: <select id="langSel" value={lang} onchange={(e) => { applyLanguage(e.currentTarget.value) }}><option value="id">Bahasa Indonesia</option><option value="en">English</option><option value="zh">中文</option></select></label></p>
        <h3>{t('settings.theme', lang)}</h3>
        <p><label>{t('settings.theme', lang)}: <select id="themeSel" value={theme} onchange={(e) => { applyThemeSel(e.currentTarget.value) }}><option value="system">{t('settings.theme.system', lang)}</option><option value="dark">{t('settings.theme.dark', lang)}</option><option value="light">{t('settings.theme.light', lang)}</option></select></label></p>
        <h3>{t('settings.keys', lang)}</h3>
        <div class="key-card"><b>{t('key.gemini', lang)}</b><div class="key-row"><input type="password" id="apiKeyGemini" placeholder={t('key.ph.empty', lang)} style="width:320px" oninput={() => { renderKeyButtons() }}> <button class="btn btn-primary" id="keyBtnGemini" onclick={() => { connectKey('gemini') }}>{t('key.connect', lang)}</button></div><span id="keyNoteGemini"></span></div>
        <div class="key-card"><b>{t('key.meta', lang)}</b><div class="key-row"><input type="password" id="apiKeyMeta" placeholder={t('key.ph.meta', lang)} style="width:320px" oninput={() => { renderKeyButtons() }}> <button class="btn btn-primary" id="keyBtnMeta" onclick={() => { connectKey('meta') }}>{t('key.connect', lang)}</button></div><span id="keyNoteMeta"></span></div>
        <div class="key-card"><b>{t('key.classai', lang)}</b><div class="key-row"><input type="password" id="apiKeyClassai" placeholder={t('key.ph.empty', lang)} style="width:320px" oninput={() => { renderKeyButtons() }}> <button class="btn btn-primary" id="keyBtnClassai" onclick={() => { connectKey('classai') }}>{t('key.connect', lang)}</button></div><span id="keyNoteClassai"></span></div>
        <div class="key-card"><b>{t('set.ollama.url', lang)}</b><div class="key-row"><input id="ollamaUrl" placeholder="http://127.0.0.1:11434" style="width:320px"> <button class="btn btn-primary" onclick={() => { ollamaCheck() }}>{t('set.ollama.check', lang)}</button></div><span id="ollamaNote"></span></div>
      </div>
    </div>
  </div>
  <div class="resizer" id="resizeDetail"></div>

  <div class="col" id="detailCol">
    <div class="scroll" id="detailBody"></div>
  </div>
  <div id="chanOverlay"></div>
</div>
