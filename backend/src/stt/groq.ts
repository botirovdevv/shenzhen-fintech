// Speech to text with Groq Whisper (PLAN.md §5). Off when GROQ_API_KEY is empty.
import { ApiError } from '../lib/errors';

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // PLAN.md Stage 6: ≤ 2 MB
export const MAX_AUDIO_SECONDS = 60;

export interface SttProvider {
  /** The spoken text, trimmed. Empty when nothing was said. */
  transcribe(audio: { data: Uint8Array; filename: string; mimeType: string }): Promise<string>;
}

// Whisper follows the style of the prompt: digits and "ming" instead of spelled-out numbers,
// which the categorizer reads more reliably. People mix Uzbek, Russian and English.
const PROMPT = "Taksi 20 ming. Osh 35 ming so'm. Kofe 18 000. Такси 20 тысяч. Lunch 45k.";

export function createGroqStt(apiKey: string, model = 'whisper-large-v3'): SttProvider | null {
  if (!apiKey) return null;
  return {
    async transcribe({ data, filename, mimeType }) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }), filename);
      form.append('model', model);
      form.append('prompt', PROMPT);
      form.append('temperature', '0');
      form.append('response_format', 'verbose_json');
      let res: Response;
      try {
        res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new ApiError(502, 'STT_FAILED', 'Couldn’t reach the speech service. Try again, or type the expense.');
      }
      if (res.status === 400 || res.status === 413 || res.status === 415) {
        throw new ApiError(400, 'BAD_AUDIO', 'Couldn’t read that recording. Try again, or type the expense.');
      }
      if (!res.ok) throw new ApiError(502, 'STT_FAILED', 'The speech service didn’t answer. Try again, or type the expense.');
      const body = (await res.json()) as { text?: string; duration?: number };
      if ((body.duration ?? 0) > MAX_AUDIO_SECONDS + 1) {
        throw new ApiError(400, 'AUDIO_TOO_LONG', `Keep it under ${MAX_AUDIO_SECONDS} seconds, like “taxi 20 ming”.`);
      }
      return (body.text ?? '').trim();
    },
  };
}
