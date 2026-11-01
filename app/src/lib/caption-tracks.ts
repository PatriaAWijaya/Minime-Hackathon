// Caption 3 jalur (aturan Patria 1 Nov 22:58): penulisan caption DIBEDAKAN
// sesuai perintah user — Artikel / Sosmed / Video — masing-masing jalurnya
// sendiri, tidak dicampur. Modul ini satu-satunya tempat prompt caption
// dibangun, agar tidak ada lagi prompt caption generik tersebar di app.

export type CaptionTrack = 'sosmed' | 'video' | 'artikel';

export function captionTrackTitle(track: CaptionTrack, title: string): string {
  if (track === 'video') return `Caption Video: ${title}`;
  if (track === 'artikel') return `Caption Artikel: ${title}`;
  return `Caption Sosmed: ${title}`;
}

// Jalur Sosmed: caption postingan — singkat, menarik, siap posting, hashtag maks 10.
export function sosmedCaptionPrompt(kindLabel: string, title: string, subtitle: string, listicle: string, brief: string): string {
  return `Buatkan satu caption media sosial Bahasa Indonesia untuk ${kindLabel} berikut. Judul: ${title}. ${subtitle ? `Subjudul: ${subtitle}. ` : ''}${listicle ? `Daftar: ${listicle}. ` : ''}Brief: ${brief}. Caption singkat, menarik, siap posting, tanpa penjelasan tambahan.`;
}

// Jalur Video: caption video — hook kalimat pertama + ajakan menonton sampai habis.
export function videoCaptionPrompt(subject: string, material: string, duration?: number, scenes?: number): string {
  const span = duration !== undefined && scenes !== undefined ? ` Durasi: ${duration} detik, ${scenes} scene.` : '';
  return `Buatkan satu caption video Bahasa Indonesia untuk video berikut. Subjek: ${subject}.${span} Materi: ${material}. Kalimat pertama harus hook yang membuat orang menonton sampai habis, sertakan ajakan menonton, tanpa penjelasan tambahan.`;
}

// Jalur Artikel: caption artikel — ringkasan 2-3 kalimat + ajakan baca, tanpa hashtag.
export function artikelCaptionPrompt(topic: string, articleText: string): string {
  return `Buatkan satu caption artikel Bahasa Indonesia untuk artikel berikut. Topik: ${topic}. Isi artikel: ${articleText || '-'}. Ringkas isi dalam 2-3 kalimat, sertakan ajakan membaca selengkapnya, tanpa hashtag, tanpa penjelasan tambahan.`;
}
