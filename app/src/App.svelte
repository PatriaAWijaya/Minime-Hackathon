<script lang="ts">
  import { onMount } from "svelte";
  import { initV5, setSendChatImpl, addGraphEdge, doSearch, filterAgents, mediaTab, primeCurate, quickChat, refreshBackendData, renderAgents, renderDetail, renderKanban, renderMedia, renderPlanner, runGraphSim, sendChat, showSetNotice, showView, switchProject, toggleAddMenu, ve2Add, ve2Note, ve2Play, ve2Select, ve2SyncName, ve2Transport, veTool, viewBack, viewForward, waAttach, waInputChanged, waMic, waToggleAttach } from "./lib/v5logic.js";
  import { getLang, setLang, t } from "./lib/i18n.js";
  import { sendChatReal, saveKeys, updateKeyStatus } from "./lib/chat.js";
  import { createPostizDraftFromComposer } from "./lib/postiz.js";
  import { vsCheck, vsGenerateTts, vsGenerateClone, vsRenderStatus, vsRefreshVoiceUI } from "./lib/voicestudio.js";
  import { assFromCaptions, compileTimeline, validateSequence } from "./lib/video.js";
  import { COST_ROWS, COST_TOTAL, fmtIdr, fmtInt, fmtUsd } from "./lib/cost.js";
  import type { T1Caption, T1Clip, T1Sequence } from "./lib/video.js";
  import { invoke } from "@tauri-apps/api/core";

  let lang = $state(getLang());

  function applyLanguage(value: string) {
    const next = value === 'en' || value === 'zh' ? value : 'id';
    lang = next;
    setLang(next);
    refreshBackendData();
    renderAgents();
    renderKanban();
    renderPlanner();
    renderMedia();
    renderDetail();
    vsRefreshVoiceUI();
    updateKeyStatus();
  }

  onMount(() => {
    initV5();
    setSendChatImpl(sendChatReal);
    vsRenderStatus();
    updateKeyStatus();
  });

  // ---- Panel Render Video Tier 1 ----
  interface T1RenderResult { success: boolean; output: string; duration_ms: number; stderr_tail: string; }
  interface T1Segment { start: number; end: number; }
  interface T1QcResult { duration: number; has_video: boolean; has_audio: boolean; black: T1Segment[]; silent: T1Segment[]; passed: boolean; notes: string[]; }
  interface T1CaptureResult { data_url: string; }

  let t1Clips = $state<T1Clip[]>([{ id: 't1c1', src: '', kind: 'video', trimIn: 0, dur: 2, volume: 1, track: 'voice' }]);
  let t1Next = $state(2);
  let t1W = $state(1280);
  let t1H = $state(720);
  let t1Fps = $state(30);
  let t1Out = $state('');
  let t1Busy = $state(false);
  let t1Status = $state('');
  let t1Qc = $state('');
  let t1Frame = $state('');
  let t1Json = $state('');

  function t1AddClip() {
    t1Clips = [...t1Clips, { id: 't1c' + t1Next, src: '', kind: 'video', trimIn: 0, dur: 2, volume: 1, track: 'voice' }];
    t1Next += 1;
  }
  function t1RemoveClip(id: string) {
    t1Clips = t1Clips.filter((c) => c.id !== id);
  }
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
  async function t1Render() {
    const seq: T1Sequence = {
      name: 't1',
      width: Number(t1W), height: Number(t1H), fps: Number(t1Fps),
      clips: t1Clips.map((c) => ({ id: c.id, src: c.src.trim(), kind: c.kind, trimIn: Number(c.trimIn), dur: Number(c.dur), volume: Number(c.volume), track: c.track ?? 'voice' })),
    };
    const out = t1Out.trim();
    const errs = validateSequence(seq, out);
    if (errs.length > 0) { t1Status = errs.map((e) => t(e, lang)).join(' '); return; }
    const compiled = compileTimeline(seq, out);
    t1Json = JSON.stringify({ sequence: seq, ffmpegArgs: compiled.args }, null, 2);
    t1Busy = true;
    t1Status = t('t1.rendering', lang);
    t1Qc = ''; t1Frame = '';
    try {
      const r = await invoke<T1RenderResult>('video_render', { args: compiled.args, output: compiled.output });
      if (!r.success) { t1Status = `${t('t1.fail', lang)} ${r.stderr_tail}`; return; }
      const qc = await invoke<T1QcResult>('video_qc', { path: compiled.output, expectedDuration: compiled.expectedDuration });
      t1Qc = t1QcText(qc);
      const cap = await invoke<T1CaptureResult>('video_capture', { path: compiled.output, at: compiled.expectedDuration / 2 });
      t1Frame = cap.data_url;
      t1Status = `${t('t1.done', lang)} ${qc.passed ? t('t1.qc.pass', lang) : t('t1.qc.fail', lang)}`;
    } catch (e) {
      t1Status = `${t('t1.fail', lang)} ${String(e)}`;
    } finally {
      t1Busy = false;
    }
  }

  // ---- Caption ASS sidecar Tier 2 (bukan burn-in: ffmpeg tanpa subtitles) ----
  let t1Caps = $state<{ id: string; text: string; start: number; end: number }[]>([]);
  let t1CapNext = $state(1);
  let t1CapBusy = $state(false);
  let t1CapStatus = $state('');
  let t1CapPath = $state('');
  let t1CapAss = $state('');
  function t1AddCap() {
    t1Caps = [...t1Caps, { id: 't1cap' + t1CapNext, text: '', start: 0, end: 2 }];
    t1CapNext += 1;
  }
  function t1RemoveCap(id: string) {
    t1Caps = t1Caps.filter((c) => c.id !== id);
  }
  async function t1SaveAss() {
    const caps: T1Caption[] = t1Caps.map((c) => ({ text: c.text.trim(), start: Number(c.start), end: Number(c.end) }));
    const errs: string[] = [];
    for (const cap of caps) {
      if (!cap.text) errs.push('t2.err.captext');
      if (!(cap.start >= 0) || !(cap.end > cap.start)) errs.push('t2.err.caprange');
    }
    const uniq = [...new Set(errs)];
    if (uniq.length > 0) { t1CapStatus = uniq.map((e) => t(e, lang)).join(' '); return; }
    t1CapBusy = true;
    t1CapStatus = '';
    try {
      const ass = assFromCaptions(caps, Number(t1W), Number(t1H));
      const r = await invoke<{ path: string }>('video_write_ass', { content: ass });
      t1CapPath = r.path;
      t1CapAss = ass;
      t1CapStatus = `${t('t2.cap.saved', lang)} ${r.path}`;
    } catch (e) {
      t1CapStatus = `${t('t1.fail', lang)} ${String(e)}`;
    } finally {
      t1CapBusy = false;
    }
  }

  // ---- Panel Asset Library Tier 2 ----
  interface T2Stream { index: number; codec_type: string; codec_name: string; width: number | null; height: number | null; }
  interface T2ProbeResult { duration: number; size: number; streams: T2Stream[]; format_name: string; }
  interface T2HashResult { sha256: string; size: number; }
  interface T2Asset { id: string; src: string; name: string; duration: number; size: number; streams: T2Stream[]; sha256: string; thumb: string; }
  let t2Assets = $state<T2Asset[]>([]);
  let t2Next = $state(1);
  let t2NewSrc = $state('');
  let t2Busy = $state(false);
  let t2Status = $state('');
  function t2StreamsText(streams: T2Stream[]): string {
    return streams.map((x) => x.codec_type === 'video' && x.width && x.height ? `${x.codec_name} ${x.width}x${x.height}` : x.codec_name).join(' + ') || '-';
  }
  function t2Manifest(): string {
    return JSON.stringify({ version: 1, assets: t2Assets.map((a) => ({ src: a.src, name: a.name, duration: a.duration, size: a.size, streams: a.streams, sha256: a.sha256 })) }, null, 2);
  }
  function t2RemoveAsset(id: string) {
    t2Assets = t2Assets.filter((a) => a.id !== id);
  }
  async function t2AddAsset() {
    const src = t2NewSrc.trim();
    if (!src) { t2Status = t('t2.assets.fail', lang); return; }
    t2Busy = true;
    t2Status = t('t2.assets.loading', lang);
    try {
      const probe = await invoke<T2ProbeResult>('video_probe', { path: src });
      const hash = await invoke<T2HashResult>('video_asset_hash', { path: src });
      let thumb = '';
      try {
        const cap = await invoke<T1CaptureResult>('video_capture', { path: src, at: Math.min(1, probe.duration / 2) });
        thumb = cap.data_url;
      } catch { thumb = ''; }
      const name = src.split('/').pop() || src;
      t2Assets = [...t2Assets, { id: 't2a' + t2Next, src, name, duration: probe.duration, size: hash.size, streams: probe.streams, sha256: hash.sha256, thumb }];
      t2Next += 1;
      t2NewSrc = '';
      t2Status = '';
    } catch (e) {
      t2Status = `${t('t2.assets.fail', lang)} ${String(e)}`;
    } finally {
      t2Busy = false;
    }
  }
</script>

<div class="app">
  <div class="sidebar">
    <img class="appmark" src="minime-icon.png" alt="MiniMe">
    <button data-view="home" class="active"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEA0lEQVR42u2dO4gVZxSAv7m76YS10RRGVLSSGJWkSGEQU/gqRFAERVGSTgykSCWpUisGQSWQmCAqCFqJr05MFUjhozW4lWCwSLAQfDAp9i4um13vndm5M//j++Cyy525c/ec8805/95nUZYlki89U6AAogCiAKIAogCiAKIAogCiAKIAybIIKGddJhQgD24AL+a4/p/+tqwoMnsyaNhgCztAvsWvuq8CBM7WmgUtgX2OgLh5Aqxc4DGeA0sUIO2Wn+26oGfx814XpCbA9yMuVAn84AhI56wvGritHSDC4j+dVcACmMxxJMQuwESNQuwGls1x/SpgTw0JljoCuuEScGBEbbtqUq4DuxQgjnkf0n04Aloo/vWahSmAO6mvC2ISYHONBK9ZYGveDqytIcFWR0CzPATWddyOqyZqsr+wVIAI5n2264JeYsX/ccQJL4CzKa0LQu0Ah4HfAj/TqibuKHBOAQbzGhiPpM1GPxJCGwFlxeK/6TihRUvSZCFA1cQcAj4IoYsCX9eIdUwBpjhRo/gFcDEgec/X6AZvgFO5rwFSfLg1qph6ESXqD+J4rL0AHsWyLuhCgNU1Av4M+Jx4+AT4ooYEH6c+Am4D2xJr+U2f3XeBLSkKkO3LrkKOvRdoAi6T1suwC+BKiOuCUXeATcDvFW+zGPiXNJlg6k2oVdgJ3IqxA/xUo/hFwsWnH1vVznYTuBpbB/gVOJLpvB9Vi78G7I2hA3xZsfjHMyz+tPDfVth/D7Ajhg5QetbHk7OexQ+mG3Ty30GTAuwfcr/HFn9eCZ4Oue/BEEfAMAc6CXxnrd/LaeCbtjpoUwJ8Cvw5YJ/7wEbrOxT3GPxcwgbgQSgClG0Z68Kw2Zy29VCwxQ80Z00IsMJadcZHIQgw6EmOtdapNh8O2P5zCGuAQQew/QecXz8sOnMUQAFEAUQBRAFEAUQBRAFEAUQBRAFEAUQBRAFEAUQBRAFi4iv+/wXRdS/7FCAezvSL9kuDx7zSP+aZ1JKV2msC2/q8m5Bi8jWBLRe/7ftyBAzZ9tvmgiMgnBHQ1RkZQmzZj4DDHd73MTtA9x2g63lcxNwBxkmfInLBXASKAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAogCiAKIAsgs2nhrWJl4Dks7gCiA5CvA8oDjW9zAMVYGHN+C35re5pdHR5mg1OPrBZboEIufdHy9BJP0bER/S5LxjY8oSeuBQ7z7duu3/Z9jM35/O+P36W3zMde26du/Ap4D54G/WjrrNjH16aHvW2O8miP2+eIam7V9Zl5eApNMffDl340H1NAaQPw3UBRAFEAUQBRAFEAUQBRAFEAUQBRAFEAC5D+lrP3K2LgEFAAAAABJRU5ErkJggg==" alt=""><span class="tip">{t('nav.home', lang)}</span></button>
    <button data-view="search"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEyUlEQVR42u2dP4gWRxjGf3snB/FPVJQIVkJEE4imsDBKTq3EA8EiRQ4xJLVIDMbKJkHRIiioXSCgeJVioQiCokSiKQKKkquOGAKBaNKdUQyCMim+7+AIipnd2f1m3vd54OtmZnfn/c0z7+zuN1uFEJD8akhdIAAkASAJAEkASAJAEgCSAJAEgCQAJAeaU/j5DwO7gC3ABmBB//cX8Ai4B1wCLirUL1dV0LOA+cA1YH2Cts4C4wp//gBsBm50cJy5wD/KAfLRbSB0FHyAp/3jnZQDDFa5nMxNYJMcoPsRn4tG++dzUA7QrlYBUyX0kxygHbufKqSfAnBeDmBvrnfvBl07wNuFBx8D5z8wAD4F7hvptyAA4rQPON1S21eAncDyvj3P/FYCu1vMM0xA0EUOsAuYSNjeF8CJBvXPAJ8oJ+gGgLfoPZhpqp+ADzIexZUAaKeD2wp8GyAUCcGcjDu1yw6tEpxzKBGCtpLAvxvU/XKAHVkBkw3q79EUACPAs8JtdGt/dWF+KmgDgGCo44J1CFJPAeeNdVjd83rXqwMEo6PF6nUldYBfDFvl7hp1dnhzgNiGjgH7C8qXTLpAKgc4VaNOScGvG8wlXhwgWBsZr9D79P5rYOZaUwAwH3gcUX4aWEy5MgV7iikg9mFPycGvE9A91h0gpoGnwDzKlxkX6PqVMAvBB/jYyHU0BuArfOpcZPkRqwB8HVH2An71ndUcIKaytT9X7AWOl379AqC7ZDDL69cOIc4lAARAbY1FlL2srrYHwIaIsleN9t9zzwAsiCj70CgAv0aUXWgNgLkyUKYjyr6wBsCDiLLDRgFYEVH2iTUAYuhfZxSAZZ5zgOsRZbdrtshTuhPYTLoTKPmdArxrRADE6UNjAPwQUfaZVQBiloI3jQEQs2n151aTwHX0dvn0mAiaSICbOsCdyPJjRoJ/V8vAeiPBigvEXPNj4E3LSeA3keXfKDz4RyPLL7XuAN5cQP8MSqC9hQY/du+j7Fc+qRxgIXEPh0p0gWHiXwCpvABQxxpLg0D7A7xGozXq/Kbg2wHgVo06K4DDBoNfjFIngXWoP0BvN/Ec9WeH/eBqFfBfHQO+zXDk13nj51BJDtDWZtFNGq0yCT7WR3+bDrCo0DnXwidtsgDgEfX32p2B4McBjPr7idpxDwDAtob1N/Y7s+1NKL5vIWjFQNDFJ2NSHWAKeKewIFWeHSB1J6zuBy0AvwPvRdYfm1W/qxEa5ACFzo1enGBIneAb/iGNBN8QDOJOYAUcEQT+coDS84IKg98ZHMqgUy9kHvjPZgWssgb+oB0gZzeYBNa2fK6VAMgPhGn+347mJiDI8c+hM1//vtLxcQ/1j7u448AFOcDr9TOwpoV2zwLjmQSwkgO8WmtnOcPqBu4wQe8lj5m2xjMKXJADaI3fuRNog4i0uUtxTiAAnEMgAJxDIACcQyAAnEMgAJxDIACcQyAAnEMgAJxDIADKhOCPZCekW8EDUcgFJjlAuU4QBIAgEACCQAAIAgHgEoKPtArwvTrQKsCxEySbNgRAnhBMdpUzaArIW1vpfXLvOnCxFdoEgG9pChAAkgCQBIAkACQBIAkASQBIAkASAJIAkASAJAAkASAJAEkASAJAEgCSAJDM6F9cZScWKqW6hAAAAABJRU5ErkJggg==" alt=""><span class="tip">{t('nav.search', lang)}</span></button>
    <button data-view="kanban"><img class="railicon" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAFYElEQVR42u2dz2sVVxTHv+N7jSSYkKC0UCndReKqpbtCu1f8U9pFF7qq1KxENwkt+q+0biPVLgqKBfsHFAtm09C0UeMLrwunNYTOjzv33Dv3znw+MAQe7809c8537rnnzH0vxXw+F4yXU7gAAQACAAQACAAQACAAQACAAGAcTI3PN8GlUThKQQD0kNOiiCUAAp8m8y5CcFkD3CH42QjhTutpo+XTwL8lLeHbrNiXtGIxA/xE8LNkWdKPvjPAoqSDEIuPDmxIetrj+C5roouSfu1x/OOclnTYVQDzBALfZE+KAkjFN4321KWALxIL/kJG028fthZdYlk3A8wTCr70psk0y2QGmMqwWWM0ExS+ZaAkbbO2Sh6nGFUJ4FLF619VvP6hpJel+nyOW8bOeGJg0xNjm24Z2PSy9LlLjC65pIAdSZ+1nEa+kXQjQj5zTQHzCDa5pgBrm25I2mw5zn1Jn7cVgEseCdEd9BXAM0nvG9v0u6TziQnAJSYzSe/4rgEgX6YWi8CqaSg1zmdyzt59byGATUkfSHplcK7bhmVdIekXg/M8NrbptsF5Dkqfb3obZLAGoA+QVh/AKX6sAUYOAkAAgAAAARjxWt3bm2cDXeOWh01bgWw662HTa0tDrKqAdyU9N7BnT9KaYRVg1XlzHaOuCvhD0qqBTe9J2k2lCnhudJ5VSVcDl0J9nuuqUfDNfD7UZwEh7ErxYZBrTEbTB3gU4Jw/swhsz71SbUvl3fB/RyHpQqDxP6q5A+psWqq50z8JZOuFcswmm+6FGDxUCnBpz7adQl1SQOvHoTXVzNRjLF/7XXyVZApYTHC2mwZ6byyC+JRG0MgJJYAXCV7rLNB7Y/EiJwH8UP49U+a+k8dC+Xe94vMhHqVOj02lk4pjMWAKqLqm9RM+OXmcOeHTLBaBffcBHtVUAl15LOnjofUBaAT52ZS9AE4FdExXrg14zXUtkiijpgCJh0FtZwBpoA+DdsuT+2wMPVcTfJ/AbXt8fjvADLdWXmtXXpU27aayCIwFm0L9bAo6A0CmIAAEAAgAEIAhO3Lb5PhM0pUR+v5Kee0uvtqxNsKyCrCouZdU/dBjKFVAm19eC9GbCFoFWDVcDkZw5x+k5HMLAXwbqYYdAtbX5u37IT8MSjEFsCsY0iLU3jffjY4T9dtKDcEkkK+S7AMscm/l4dNQAjgiXnn4NJQADolXHj4NJYB14pWHTykDKQNhzFgIYBk39sZyCgL4S282c/bRQ8gNy2vbK32fxCJwTdJ1gh/tGq/LaANtyE2hTf9G1rWuHfqmUEt/tY5fyK9B0wzKwF9UAVQBgABgtExxQe9MWr7viBlgOBzf6TtreRz/zNdmNSnfDYxeBlo9D9ir6QXwLCDhO9+KVb39+RhSwEjZRwCAADJf7Rctj4shjGIRGG8ROKqfigV7FkgBpBAEMGKC/FQsreB4hG4MMQMAAhgb31EGjvdZQN21UwYmzFLg4JMCMljNF5IuS/rN8bP39bYzaKMiUkD0FNCXTaQAIAUAAgAEAAgAEAAgAEAACAAQACAAQACAAP5jhmsGx8xFAA/x1+B46CKAm/hrcNx0EcD3Fa9v4cfk2XKJadWGECm9TSFsCOluT6Wf6qqALx0HiCGAXJgkFvyqWNbOAE3BLhK5wBRngCKh4Nfa09QHON0wYMzZYCOjGWAjcuDnHWPY+NWwQ0kPJH3aUXl9K78vniZixwM1/KeRphTwL3+Kn4XPjX1JK01vatsKXpF0F59mw902wXeZAVKfcqHjAnTqMQBCyDjwPgKoG3BCHKJg1mTqkgJgQLAfAAEAAgAEAAgAEAAgAEAAgABgJPwD1XDtp0kXZY4AAAAASUVORK5CYII=" alt=""><span class="tip">{t('nav.kanban', lang)}</span></button>
    <button data-view="graph"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">{t('nav.graph', lang)}</span></button>
    <button data-view="library"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">{t('nav.library', lang)}</span></button>
    <button data-view="media"><img class="railicon" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%222.5%22%20y%3D%225%22%20width%3D%2219%22%20height%3D%2214%22%20rx%3D%223%22/%3E%3Cpolygon%20points%3D%2210%2C9%2015.5%2C12%2010%2C15%22%20fill%3D%22white%22%20stroke%3D%22none%22/%3E%3C/svg%3E" alt=""><span class="tip">{t('nav.media', lang)}</span></button>
    <button data-view="planner"><img class="railicon" src="data:image/png;base64,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" alt=""><span class="tip">{t('nav.planner', lang)}</span></button>
    <button data-view="cost"><img class="railicon" src="./cost-icon.png" style="filter:invert(1)" alt=""><span class="tip">{t('nav.cost', lang)}</span></button>
    <div class="spacer"></div>
    <button data-view="settings"><img class="railicon" src="./setting-icon.png" style="filter:invert(1);object-fit:contain" alt=""><span class="tip">{t('nav.settings', lang)}</span></button>
  </div>

  <div class="col" id="agentCol">
    <div class="brand"><img src="minime-logo.png" alt="MiniMe"></div>
    <div class="agent-topbar">
      <span class="scope-dot"></span><span class="agent-scope">Local</span><span style="color:#a1a1a1">⌄</span>
      <span style="flex:1"></span>
      <button class="nav-arrow" onclick={() => { viewBack() }} title={t('title.back', lang)}>‹</button>
      <button class="nav-arrow" onclick={() => { viewForward() }} title={t('title.advance', lang)}>›</button>
      <button class="agent-plus" onclick={() => { toggleAddMenu() }} title={t('title.addagent', lang)}>＋</button>
    </div>
    <div class="add-menu" id="addMenu"></div>
    <div class="agent-searchbox"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1a1" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg><input type="text" id="navSearch" placeholder={t('word.search', lang)} oninput={(e) => { filterAgents(e.currentTarget.value) }}></div>
    <div style="padding:0 14px;flex-shrink:0"><div class="mainchat" onclick={() => { showView('home') }}><div class="av" style="background:#FFD1DC">P</div><div><b>Main chat</b><br><small style="color:#a1a1a1">{t('nav.prime', lang)}</small></div></div></div>
    <div class="scroll" id="agentList"></div>
    <div style="padding:0 14px 12px;flex-shrink:0"><div class="notice" id="addNotice" style="display:none"></div></div>
  </div>
  <div class="resizer" id="resizeAgent"></div>

  <div class="col" id="chatCol">
    <div class="view active" id="view-home">
      <div class="colhead chat-date-head">
        <div class="chat-date">{t('home.chatdate', lang)}</div>
        <div class="chat-proj" id="chatProj">TEST Kopi Surabaya</div>
        <label style="margin-top:8px">{t('home.proj', lang)}
          <select id="projectSel" onchange={(e) => { switchProject(e.currentTarget.value) }} style="margin-top:4px">
            <option value="kopi">TEST Kopi Surabaya</option>
            <option value="produk">TEST Produk Digital</option>
          </select>
        </label>
      </div>
      <div class="scroll" id="chatBox"></div>
      <div class="composer">
        <div>
          <span class="chip" onclick={() => { quickChat(t('chip.1', lang)) }}>Riset kompetitor + carousel</span>
          <span class="chip" onclick={() => { quickChat(t('chip.2', lang)) }}>Talking head promo</span>
          <button class="btn btn-sm" onclick={() => { primeCurate() }}>{t('composer.curate', lang)}</button>
        </div>
        <div class="wa-pop" id="attachMenu">
          <button onclick={() => { waAttach('Gambar') }}>{t('composer.attach.img', lang)}</button>
          <button onclick={() => { waAttach('Dokumen') }}>{t('composer.attach.doc', lang)}</button>
          <button onclick={() => { waAttach('Kamera') }}>{t('composer.attach.cam', lang)}</button>
          <button onclick={() => { waAttach('Audio') }}>{t('composer.attach.audio', lang)}</button>
        </div>
        <div class="wa-pill main-pill">
          <button class="pill-plus" onclick={() => { waToggleAttach() }} title={t('title.attach', lang)}>＋</button>
          <input type="text" id="chatInput" placeholder={t('composer.ph', lang)} oninput={() => { waInputChanged() }} autocomplete="off">
          <button class="pill-mic" onclick={() => { waMic() }} title={t('title.voice', lang)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a1a1a1" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/></svg></button>
          <button class="pill-send" onclick={() => { sendChat() }} title={t('title.send', lang)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#262626" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
        </div>
        <div class="notice" id="waNote" style="display:none;margin-top:0"></div>
      </div>
    </div>
    <div class="view" id="view-search">
      <div class="colhead"><h2>{t('word.search', lang)}</h2><p>{t('colhead.search.sub', lang)}</p></div>
      <div class="scroll">
        <input type="text" id="searchInput" placeholder={t('search.ph', lang)} oninput={() => { doSearch() }}>
        <p id="searchCount" style="color:#555"></p>
        <div id="searchResults"></div>
      </div>
    </div>
    <div class="view" id="view-kanban">
      <div class="colhead">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="av" style="background:#FFD1DC">P</div>
          <h2 id="kanbanTitle" style="margin:0">TEST Kopi Surabaya</h2><span style="color:#FFD1DC;font-size:18px">☆</span>
          <div style="margin-left:auto;display:flex;align-items:center">
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#FFD1DC">P</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#FFD1DC;margin-left:-8px">R</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#404040;margin-left:-8px">S</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#5b5b5b;margin-left:-8px">K</div>
            <div class="av" style="width:28px;height:28px;font-size:12px;background:#5b5b5b;margin-left:-8px">M</div>
            <button class="btn btn-sm" style="margin-left:10px" onclick={() => { alert('Simulasi: tambah anggota tim (tampilan saja).') }}>＋</button>
          </div>
        </div>
        <div class="kb-tabs">
          <button data-kbtab="kanban" class="active">{t('word.kanban', lang)}</button>
          <button data-kbtab="table">{t('word.table', lang)}</button>
          <button data-kbtab="list">{t('word.list', lang)}</button>
          <span style="flex:1"></span>
          <label style="margin:0;font-weight:400;font-size:13px">{t('home.filter', lang)}
            <select id="kbFilter" onchange={() => { renderKanban() }} style="width:auto;margin-left:6px">
              <option value="">{t('home.allagents', lang)}</option><option>Prime Agent</option><option>Riset</option><option>Strategi</option><option>Kreatif</option><option>Media</option><option>Distribusi</option><option>Produk Digital</option>
            </select>
          </label>
        </div>
        <p style="margin-top:8px">{t('kanban.hint', lang)}</p>
      </div>
      <div class="scroll"><div id="kanbanBox"></div></div>
    </div>
    <div class="view" id="view-graph">
      <div class="colhead"><h2>{t('view.graph.title', lang)}</h2><p>{t('graph.hint', lang)}</p>
      <button class="btn btn-primary" onclick={() => { runGraphSim() }}>{t('graph.run', lang)}</button></div>
      <div class="scroll">
        <div class="n8n-canvas" id="graphBox"><svg id="graphEdges"></svg><div id="graphNodes"></div></div>
        <div style="background:#1f1f1f;border:1px solid #2a2a2a;border-radius:8px;padding:12px;margin-top:12px">
          <h3 style="margin:0 0 6px" id="gnodeInfo">{t('graph.nodedetail', lang)}</h3>
          <p id="gnodeDetail" style="color:#a1a1a1;margin:0">{t('graph.detail', lang)}</p>
        </div>
        <label>{t('settings.addconn', lang)}</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="gFrom" style="flex:1"></select>
          <select id="gTo" style="flex:1"></select>
          <input type="text" id="gLabel" placeholder={t('flow.ph', lang)} style="flex:1">
          <button class="btn btn-primary" onclick={() => { addGraphEdge() }}>+ Tambah</button>
        </div>
        <ul id="graphList"></ul>
        <div class="notice" id="graphNotice" style="display:none"></div>
      </div>
    </div>
    <div class="view" id="view-library">
      <div class="colhead"><h2>{t('view.library.title', lang)}</h2></div>
      <div class="scroll">
        <table><tbody id="libBody"></tbody></table>
        <div class="notice" id="libNotice" style="display:none"></div>
      </div>
    </div>
    <div class="view" id="view-media">
      <div class="colhead"><h2>{t('view.media.title', lang)}</h2></div>
      <div class="filters" style="flex-shrink:0;margin:0 14px 12px">
        <button id="ms-tabbtn-script" onclick={() => { mediaTab('script') }}>{t('ms.tab.script', lang)}</button>
        <button id="ms-tabbtn-image" onclick={() => { mediaTab('image') }}>{t('ms.tab.image', lang)}</button>
        <button id="ms-tabbtn-voice" onclick={() => { mediaTab('voice') }}>{t('ms.tab.voice', lang)}</button>
        <button id="ms-tabbtn-video" class="active" onclick={() => { mediaTab('video') }}>{t('ms.tab.video', lang)}</button>
      </div>
      <div class="scroll">
        <div id="ms-tab-script" style="display:none">
          <h3>{t('ms.tab.script', lang)}</h3>
          <textarea id="msScript" rows="12" style="width:100%;box-sizing:border-box" placeholder={t('ms.script.placeholder', lang)} oninput={(e) => { try { localStorage.setItem('minime.script', e.currentTarget.value); } catch (_) {} }}></textarea>
        </div>
        <div id="ms-tab-image" style="display:none">
          <div class="filters">
          <button class="active" data-filter="semua">{t('filter.all', lang)}</button>
          <button data-filter="gambar">{t('filter.gambar', lang)}</button>
          <button data-filter="carousel">{t('filter.carousel', lang)}</button>
          <button data-filter="reels">{t('filter.reels', lang)}</button>
          <button data-filter="talking">{t('filter.talking', lang)}</button>
          </div>
          <div class="mediagrid" id="mediaGrid"></div>
          <div class="notice" id="mediaNotice" style="display:none"></div>
          <p style="color:#a1a1a1;font-size:13px">{t('ms.image.note', lang)}</p>
        </div>
        <div id="ms-tab-voice" style="display:none">
          <h3>{t('ms.tab.voice', lang)}</h3>
          <p><span id="vsStatus" class="badge"></span> <button class="btn btn-sm" onclick={() => { vsCheck() }}>{t('vs.status.check', lang)}</button></p>
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
          <h4>{t('vs.ref.title', lang)}</h4>
          <label>{t('vs.ref.label', lang)}</label>
          <input id="vsRefFile" type="file" accept="audio/*">
          <label>{t('vs.text.label', lang)}</label>
          <textarea id="vsCloneText" rows="4" style="width:100%;box-sizing:border-box" placeholder={t('vs.text.placeholder', lang)}></textarea>
          <textarea id="vsRefText" rows="2" style="width:100%;box-sizing:border-box" placeholder={t('vs.ref.text.placeholder', lang)}></textarea>
          <label>{t('vs.speed.label', lang)}</label>
          <input id="vsCloneSpeed" type="number" min="0.5" max="2" step="0.1" value="1">
          <button class="btn btn-primary" onclick={() => { vsGenerateClone() }}>{t('vs.generate', lang)}</button>
          <span id="vsCloneNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span>
          <audio id="vsCloneAudio" controls style="display:none;width:100%;margin-top:8px"></audio>
          <a id="vsCloneDownload" style="display:none">{t('vs.download', lang)}</a>
          <h4>{t('vs.models.title', lang)}</h4>
          <ul id="vsModelList" style="font-size:14px;line-height:1.8"><li>{t('vs.models.empty', lang)}</li></ul>
          <h4>{t('vs.assets.title', lang)}</h4>
          <ul style="font-size:14px;line-height:1.8">
            <li>🎙 Voice-over: Promo bundling (30 dtk)</li>
            <li>🎵 Musik: Akustik ringan</li>
          </ul>
        </div>
        <div id="ms-tab-video">
          <div class="ve-toolbar">
          <button class="btn btn-sm" onclick={() => { veTool('Potong') }}>{t('ve.cut', lang)}</button>
          <button class="btn btn-sm" onclick={() => { veTool('Tambah Teks') }}>{t('ve.addtext', lang)}</button>
          <button class="btn btn-sm" onclick={() => { veTool('Subtitle') }}>{t('ve.subtitle', lang)}</button>
          <button class="btn btn-sm" onclick={() => { veTool('Transisi') }}>{t('ve.transition', lang)}</button>
          <span class="veToolNote" style="color:#a1a1a1;font-size:13px;margin-left:8px"></span>
          </div>
          <div class="ve2-toolbar">
          <button class="btn btn-sm" onclick={() => { ve2Note('Simulasi: proyek tersimpan (tampilan saja).') }}>{t('settings.saveproj', lang)}</button>
          <button class="btn btn-sm" onclick={() => { ve2Note('Belum bisa diekspor: engine render belum ada (lihat daftar engine di bawah).') }}>{t('ve.export', lang)}</button>
          <button class="btn btn-sm" onclick={() => { ve2Note('Simulasi: render preview belum tersedia — butuh preview engine.') }}>{t('ve.render', lang)}</button>
          </div>
          <div class="ve2-top">
          <div class="ve2-assets">
          <h4 style="margin:0 0 8px">{t('word.aset', lang)}</h4>
          <div class="ve2-asset" onclick={() => { ve2Add('Footage: Kedai kopi pagi') }}><span>🎬 Footage: Kedai kopi pagi</span><span>+</span></div>
          <div class="ve2-asset" onclick={() => { ve2Add('B-Roll: Seduh & sajikan') }}><span>🎬 B-Roll: Seduh &amp; sajikan</span><span>+</span></div>
          <div class="ve2-asset" onclick={() => { ve2Add('Voice-over: Promo bundling') }}><span>🎙 Voice-over: Promo bundling</span><span>+</span></div>
          <div class="ve2-asset" onclick={() => { ve2Add('Musik: Akustik ringan') }}><span>🎵 Musik: Akustik ringan</span><span>+</span></div>
          <div class="ve2-asset" onclick={() => { ve2Add('Teks: Overlay harga') }}><span>🔤 Teks: Overlay harga</span><span>+</span></div>
          <p style="color:#a1a1a1;font-size:13px">{t('ve.asset.note', lang)}</p>
          </div>
          <div class="ve2-preview">
          <div class="ve2-canvas"><div style="font-size:42px">▶</div><div id="ve2PreviewLabel">Preview: Hook (0–8 dtk)</div><small>{t('ve.canvas', lang)}</small></div>
          <div class="ve2-transport"><button onclick={() => { ve2Transport('start') }} title={t('title.first', lang)}>⏮</button><button onclick={() => { ve2Play() }} title={t('title.play', lang)}>{t('ve.play', lang)}</button><button onclick={() => { ve2Transport('end') }} title={t('title.last', lang)}>⏭</button><span id="ve2Time">00:00:00 / 00:00:30</span><span style="margin-left:auto">{t('ve.zoom', lang)} <select id="ve2Zoom" onchange={() => { ve2Note('Simulasi: zoom timeline belum mengubah skala (tampilan saja).') }}><option>100%</option><option>50%</option><option>200%</option></select></span></div>
          </div>
          <div class="ve2-inspector">
          <h4 style="margin:0 0 8px">{t('ve.inspector', lang)}</h4>
          <label>{t('word.nama', lang)}</label><input id="ve2Name" value="Hook (0–8 dtk)" oninput={() => { ve2SyncName() }}>
          <label>{t('ve.start.label', lang)}</label><input id="ve2Start" value="0" type="number">
          <label>{t('ve.dur.label', lang)}</label><input id="ve2Dur" value="8" type="number">
          <label>{t('ve.track', lang)}</label><div id="ve2Track" class="ve-field">{t('word.video', lang)}</div>
          <label>{t('ve.effect', lang)}</label><select id="ve2Fx" onchange={() => { ve2Note('Simulasi: efek belum diterapkan — butuh engine render.') }}><option>{t('ve.fx.none', lang)}</option><option>{t('ve.fx.fade', lang)}</option><option>{t('ve.fx.zoom', lang)}</option></select>
          <span id="ve2Note" class="ve2-note"></span>
          </div>
          </div>
          <div class="timeline">
          <div class="playhead" id="playhead2" style="left:0%"></div>
          <div class="ve-ruler"><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span></div>
          <div class="track"><span class="tlabel">{t('word.video', lang)}</span><div class="bar ve-clip" style="background:#FFD1DC;width:27%" onclick={(e) => { ve2Select(e.currentTarget,'Hook (0–8 dtk)',0,8,'Video') }}>Hook (0–8 dtk)</div><div class="bar ve-clip" style="background:#5b5b5b;width:47%" onclick={(e) => { ve2Select(e.currentTarget,'Isi (8–22 dtk)',8,14,'Video') }}>Isi (8–22 dtk)</div><div class="bar ve-clip" style="background:#404040;width:26%" onclick={(e) => { ve2Select(e.currentTarget,'CTA (22–30 dtk)',22,8,'Video') }}>CTA</div></div>
          <div class="track"><span class="tlabel">B-Roll</span><div class="bar ve-clip" style="background:#5b5b5b;margin-left:27%;width:47%" onclick={(e) => { ve2Select(e.currentTarget,'B-Roll: seduh kopi',8,14,'B-Roll') }}>B-Roll: seduh kopi</div></div>
          <div class="track"><span class="tlabel">{t('word.audio', lang)}</span><div class="bar ve-clip" style="background:#5b5b5b;width:80%" onclick={(e) => { ve2Select(e.currentTarget,'Voice-over promo bundling',0,30,'Audio') }}>Voice-over promo bundling</div><div class="bar ve-clip" style="background:#4a4a4a;width:20%" onclick={(e) => { ve2Select(e.currentTarget,'Musik: akustik ringan',0,30,'Audio') }}>Musik</div></div>
          <div class="track"><span class="tlabel">{t('word.teks', lang)}</span><div class="bar ve-clip" style="background:#5b5b5b;width:30%" onclick={(e) => { ve2Select(e.currentTarget,'Overlay: TEST Kopi — Rp15.000',0,9,'Teks') }}>Overlay: TEST Kopi — Rp15.000</div><div class="bar ve-clip" style="background:#4a4a4a;margin-left:10%;width:30%" onclick={(e) => { ve2Select(e.currentTarget,'Overlay: Pesan via WA',12,9,'Teks') }}>Overlay: Pesan via WA</div></div>
          </div>
          <div class="t1-panel">
            <h3>{t('t1.title', lang)}</h3>
            <p>{t('t1.note', lang)}</p>
            <div class="t1-row">
              <label>{t('t1.width', lang)} <input type="number" bind:value={t1W}></label>
              <label>{t('t1.height', lang)} <input type="number" bind:value={t1H}></label>
              <label>{t('t1.fps', lang)} <input type="number" bind:value={t1Fps}></label>
            </div>
            <label>{t('t1.output', lang)} <input type="text" bind:value={t1Out} placeholder="/Users/mac/Movies/minime-t1.mp4" style="width:100%;box-sizing:border-box"></label>
            <h4>{t('t1.clips', lang)}</h4>
            {#each t1Clips as c (c.id)}
              <div class="t1-clip">
                <input type="text" bind:value={c.src} placeholder={t('t1.src', lang)}>
                <select bind:value={c.kind} title={t('t1.kind', lang)}><option value="video">{t('t1.kind.video', lang)}</option><option value="audio">{t('t1.kind.audio', lang)}</option></select>
                <input type="number" step="0.1" bind:value={c.trimIn} title={t('t1.trim', lang)}>
                <input type="number" step="0.1" bind:value={c.dur} title={t('t1.dur', lang)}>
                {#if c.kind === 'audio'}<select bind:value={c.track} title={t('t2.audio.track', lang)}><option value="voice">{t('t2.audio.voice', lang)}</option><option value="music">{t('t2.audio.music', lang)}</option></select><input type="number" step="0.1" bind:value={c.volume} title={t('t1.vol', lang)}>{/if}
                <button onclick={() => t1RemoveClip(c.id)}>{t('t1.remove', lang)}</button>
              </div>
            {/each}
            <button onclick={t1AddClip}>{t('t1.add', lang)}</button>
            <h4>{t('t2.cap.title', lang)}</h4>
            <p>{t('t2.cap.note', lang)}</p>
            {#each t1Caps as cap (cap.id)}
              <div class="t1-clip">
                <input type="text" bind:value={cap.text} placeholder={t('t2.cap.text', lang)}>
                <input type="number" step="0.1" bind:value={cap.start} title={t('t2.cap.start', lang)}>
                <input type="number" step="0.1" bind:value={cap.end} title={t('t2.cap.end', lang)}>
                <button onclick={() => t1RemoveCap(cap.id)}>{t('t1.remove', lang)}</button>
              </div>
            {/each}
            <button onclick={t1AddCap}>{t('t2.cap.add', lang)}</button>
            <button onclick={t1SaveAss} disabled={t1CapBusy}>{t('t2.cap.save', lang)}</button>
            {#if t1CapStatus}<p id="t1CapStatus">{t1CapStatus}</p>{/if}
            {#if t1CapAss}<div><textarea id="t1CapAss" readonly rows="8" style="width:100%;box-sizing:border-box" value={t1CapAss}></textarea></div>{/if}
            <button onclick={t1Render} disabled={t1Busy}>{t1Busy ? t('t1.rendering', lang) : t('t1.render', lang)}</button>
            {#if t1Status}<p id="t1Status">{t1Status}</p>{/if}
            {#if t1Qc}<div><h4>{t('t1.qc', lang)}</h4><pre id="t1Qc">{t1Qc}</pre></div>{/if}
            {#if t1Frame}<div><h4>{t('t1.frame', lang)}</h4><img id="t1Frame" src={t1Frame} alt=""></div>{/if}
            {#if t1Json}<div><h4>{t('t1.json', lang)}</h4><textarea id="t1Json" readonly rows="8" style="width:100%;box-sizing:border-box" value={t1Json}></textarea></div>{/if}
          </div>
          <div class="t2-panel">
            <h3>{t('t2.assets.title', lang)}</h3>
            <p>{t('t2.assets.note', lang)}</p>
            <label>{t('t2.assets.src', lang)} <input id="t2NewSrc" type="text" bind:value={t2NewSrc} placeholder="/Users/mac/Movies/minime-t1-clip1.mp4" style="width:100%;box-sizing:border-box"></label>
            <button onclick={t2AddAsset} disabled={t2Busy}>{t2Busy ? t('t2.assets.loading', lang) : t('t2.assets.add', lang)}</button>
            {#if t2Status}<p id="t2Status">{t2Status}</p>{/if}
            {#each t2Assets as a (a.id)}
              <div class="t2-asset">
                {#if a.thumb}<img src={a.thumb} alt="">{/if}
                {#if !a.thumb}<span>{t('t2.assets.nothumb', lang)}</span>{/if}
                <span>{a.name} — {a.duration.toFixed(1)}s — {t2StreamsText(a.streams)} — {a.sha256.slice(0, 12)}…</span>
                <button onclick={() => t2RemoveAsset(a.id)}>{t('t2.assets.remove', lang)}</button>
              </div>
            {/each}
            {#if t2Assets.length}<div><h4>{t('t2.assets.manifest', lang)}</h4><textarea id="t2Manifest" readonly rows="8" style="width:100%;box-sizing:border-box" value={t2Manifest()}></textarea></div>{/if}
          </div>
        </div>
      </div>
    </div>
    <div class="view" id="view-planner">
      <div class="colhead"><h2>{t('view.planner.title', lang)}</h2><p>{t('settings.cost.mode', lang)} <span class="badge b-ok">{t('word.drafsaja', lang)}</span>{t('planner.media.note', lang)}</p></div>
      <div class="scroll">
        <table><thead><tr><th>{t('word.item', lang)}</th><th>{t('word.channel', lang)}</th><th>{t('planner.header.date', lang)}</th><th>{t('word.status', lang)}</th><th>{t('planner.header.postiz', lang)}</th></tr></thead><tbody id="plannerBody"></tbody></table>
        <p><textarea id="postizText" placeholder={t('planner.composer.ph', lang)} rows="3" style="width:100%"></textarea></p>
        <button class="btn btn-primary" onclick={() => { createPostizDraftFromComposer() }}>{t('planner.composer.btn', lang)}</button>
        <div class="notice" id="postizNotice" style="display:none"></div>
      </div>
    </div>
    <div class="view" id="view-cost">
      <div class="colhead"><h2>{t('cost.title', lang)}</h2><p>{t('cost.sub', lang)}</p></div>
      <div class="scroll">
        <table><thead><tr><th>{t('cost.col.model', lang)}</th><th>{t('cost.col.provider', lang)}</th><th>{t('cost.col.calls', lang)}</th><th>{t('cost.col.input', lang)}</th><th>{t('cost.col.output', lang)}</th><th>{t('cost.col.tokens', lang)}</th><th>{t('cost.col.usd', lang)}</th><th>{t('cost.col.idr', lang)}</th></tr></thead><tbody>{#each COST_ROWS as r}<tr><td>{r.model}</td><td>{r.provider}</td><td>{r.calls}</td><td>{r.input === null ? t('cost.pending', lang) : fmtInt(r.input, lang)}</td><td>{r.output === null ? t('cost.pending', lang) : fmtInt(r.output, lang)}</td><td>{fmtInt(r.tokens, lang)}</td><td>{fmtUsd(r, lang)}</td><td>{fmtIdr(r, lang)}</td></tr>{/each}<tr><td><b>{t('cost.total', lang)}</b></td><td></td><td><b>{COST_TOTAL.calls}</b></td><td>{t('cost.pending', lang)}</td><td>{t('cost.pending', lang)}</td><td><b>{fmtInt(COST_TOTAL.tokens, lang)}</b></td><td><b>{fmtUsd(COST_TOTAL, lang)}</b></td><td><b>{fmtIdr(COST_TOTAL, lang)}</b></td></tr></tbody></table>
        <p>{t('cost.note.rates', lang)}</p>
        <p>{t('cost.note.pending', lang)}</p>
        <p>{t('cost.note.local', lang)}</p>
      </div>
    </div>
    <div class="view" id="view-settings">
      <div class="colhead"><h2>{t('view.settings.title', lang)}</h2><p>{t('colhead.settings.sub', lang)}</p></div>
      <div class="scroll">
        <h3>{t('settings.lang', lang)}</h3>
        <p><label>{t('settings.lang', lang)}: <select id="langSel" value={lang} onchange={(e) => { applyLanguage(e.currentTarget.value) }}><option value="id">Bahasa Indonesia</option><option value="en">English</option><option value="zh">中文</option></select></label></p>
        <h3>{t('settings.conn', lang)}</h3>
        <p><label><input type="checkbox" checked> {t('settings.meta.main', lang)}</label><label><input type="checkbox" checked> {t('settings.gemini.fb', lang)}</label><label><input type="checkbox" checked> {t('settings.ollama.fb', lang)}</label><label><input type="checkbox" checked> {t('ve.canva.title', lang)}</label><label><input type="checkbox"> {t('settings.voicestudio', lang)}</label></p>
        <h3>{t('settings.keys', lang)}</h3>
        <p><label>{t('key.gemini', lang)} <input type="password" id="apiKeyGemini" placeholder={t('key.ph.empty', lang)} style="width:320px"></label><label>{t('key.meta', lang)} <input type="password" id="apiKeyMeta" placeholder={t('key.ph.meta', lang)} style="width:320px"></label><label>{t('key.postiz', lang)} <input type="password" id="apiKeyPostiz" placeholder={t('key.ph.postiz', lang)} style="width:320px"></label><span>{t('key.ollama', lang)}</span></p>
        <button class="btn btn-primary" onclick={() => { saveKeys() }}>{t('key.save', lang)}</button>
        <div class="notice" id="keyStatus"></div>
        <h3 id="gateHead">{t('settings.gates', lang)}</h3>
        <p><label><input type="checkbox" checked> {t('settings.dist.default', lang)}</label><label><input type="checkbox"> {t('settings.dist.batch', lang)}</label></p>
        <h3>{t('settings.cost', lang)}</h3>
        <p><label><input type="checkbox" checked> {t('settings.cost.rupiah', lang)}</label><label>{t('settings.cost.rate', lang)} <input type="text" value="18137" style="width:120px"></label></p>
        <button class="btn btn-primary" onclick={() => { showSetNotice() }}>{t('settings.save', lang)}</button>
        <div class="notice" id="setNotice" style="display:none"></div>
      </div>
    </div>
  </div>
  <div class="resizer" id="resizeDetail"></div>

  <div class="col" id="detailCol">
    <div class="scroll" id="detailBody"></div>
  </div>
</div>
