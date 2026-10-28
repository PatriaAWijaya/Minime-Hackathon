import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { showAudio } from './voicestudio.js';

// Klien engine TTS native Sherpa-ONNX (prototipe tahap 2, berdampingan
// dengan VoiceStudio). Aset di ~/minime-voices/sherpa-id (TIDAK di git):
// voice .onnx + tokens.txt (dibuat dari phoneme_id_map). Phonemize oleh
// crate piper-phonemize (data ikut di dalam crate — keputusan bundle).
// UI memakai input yang sama dengan VoiceStudio (#vsText/#vsSpeed)
// supaya perbandingan apel-ke-apel memakai naskah & kecepatan identik.

export interface SherpaStatus {
  installed: boolean;
  modelPath: string | null;
}

export interface SherpaSetupResult {
  installed: boolean;
  modelPath: string;
  tokensPath: string;
}

export interface SherpaTtsResult {
  dataUrl: string;
  sampleRate: number;
  durationSecs: number;
}

function setNote(text: string): void {
  const el = document.getElementById('sherpaNote');
  if (el) el.textContent = text;
}

export async function sherpaRenderStatus(): Promise<void> {
  const el = document.getElementById('sherpaStatus');
  if (!el) return;
  try {
    const r = await invoke<SherpaStatus>('sherpa_status', {});
    el.textContent = r.installed
      ? tr('sherpa.status.ready') + (r.modelPath ? ' ' + r.modelPath : '')
      : tr('sherpa.status.missing');
    el.className = 'badge ' + (r.installed ? 'b-ok' : 'b-warn');
  } catch (e) {
    el.textContent = tr('vs.error') + (e instanceof Error ? e.message : String(e));
    el.className = 'badge b-warn';
  }
}

export function sherpaRefreshUI(): void {
  void sherpaRenderStatus();
}

export async function sherpaSetup(): Promise<void> {
  setNote(tr('sherpa.working'));
  try {
    const r = await invoke<SherpaSetupResult>('sherpa_setup', {});
    setNote(tr('sherpa.done') + ' ' + r.modelPath);
    await sherpaRenderStatus();
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  }
}

export async function sherpaTtsFromTab(): Promise<void> {
  const text = (document.getElementById('vsText') as HTMLTextAreaElement | null)?.value.trim() || '';
  if (!text) {
    setNote(tr('vs.text.empty'));
    return;
  }
  const speed = parseFloat((document.getElementById('vsSpeed') as HTMLInputElement | null)?.value || '1') || 1;
  setNote(tr('vs.generating'));
  try {
    const r = await invoke<SherpaTtsResult>('sherpa_tts', { req: { text, speed } });
    showAudio('vsAudio', 'vsDownload', r.dataUrl, 'voice-sherpa.wav');
    setNote(tr('vs.done') + ' (Sherpa, ' + r.sampleRate + ' Hz, ' + r.durationSecs.toFixed(2) + ' dtk)');
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  }
}
