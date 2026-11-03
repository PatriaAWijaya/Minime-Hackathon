// v239 — jembatan streaming Anthropic (Tauri Channel) untuk router.
// Dipisah dari src/router.ts karena @tauri-apps/api hanya bisa
// di-resolve Vite dari dalam app/; router tetap bisa diimpor runner
// Node tanpa handler ini (jatuh ke anthropic_chat utuh).
import { Channel, invoke } from '@tauri-apps/api/core';
import { setAnthropicStreamHandler } from '../../../src/router';
import type { AnthropicStreamReq, AnthropicStreamRes } from '../../../src/router';

export function registerAnthropicStream(): void {
  setAnthropicStreamHandler(async (req: AnthropicStreamReq, onDelta: (delta: string) => void): Promise<AnthropicStreamRes> => {
    const channel = new Channel<string>();
    channel.onmessage = onDelta;
    const res = await invoke('anthropic_chat_stream', { req, on_event: channel });
    return res as AnthropicStreamRes;
  });
}
