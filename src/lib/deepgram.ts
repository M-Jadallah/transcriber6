// Deepgram transcription client
// Docs: https://developers.deepgram.com/reference/pre-recorded-transcription
// Auth: Authorization: Token <API_KEY>  (NOT Bearer!)

export interface DeepgramOptions {
  model?: string; // whisper-large | nova-3 | nova-2 | enhanced | base
  language?: string; // ar | en | ar-SA ...
  smartFormat?: boolean;
  diarize?: boolean;
  utterances?: boolean;
  punctuate?: boolean;
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

export interface DeepgramResult {
  text: string;
  words?: DeepgramWord[];
  raw: unknown;
}

export async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  apiKey: string,
  options: DeepgramOptions = {}
): Promise<DeepgramResult> {
  const {
    model = "whisper-large",
    language = "ar",
    smartFormat = true,
    diarize = false,
    utterances = false,
    punctuate = true,
  } = options;

  const params = new URLSearchParams({
    model,
    language,
    smart_format: smartFormat ? "true" : "false",
    punctuate: punctuate ? "true" : "false",
    diarize: diarize ? "true" : "false",
    utterances: utterances ? "true" : "false",
  });

  const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "audio/mpeg",
    },
    body: new Uint8Array(audioBuffer),
  });

  if (!res.ok) {
    const body = await res.text();
    let reason = "Unknown error";
    try {
      const j = JSON.parse(body);
      reason = j?.err_code || j?.reason || j?.message || body;
    } catch {
      reason = body;
    }
    throw new DeepgramError(res.status, reason);
  }

  const json = await res.json();
  const channel = json?.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  const text = alt?.transcript ?? "";

  return {
    text,
    words: alt?.words,
    raw: json,
  };
}

export class DeepgramError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(`Deepgram ${status}: ${reason}`);
    this.status = status;
    this.reason = reason;
    this.name = "DeepgramError";
  }
  isAuthError() {
    return this.status === 401;
  }
  isRateLimit() {
    return this.status === 429;
  }
  isQuota() {
    return this.status === 402;
  }
}

// Available models (for settings dropdown)
export const DEEPGRAM_MODELS = [
  { value: "whisper-large", label: "Whisper Large (v2)" },
  { value: "nova-3", label: "Nova-3 (Recommended for Arabic)" },
  { value: "nova-2", label: "Nova-2" },
  { value: "enhanced", label: "Enhanced" },
  { value: "base", label: "Base" },
];

export const DEEPGRAM_LANGUAGES = [
  { value: "ar", label: "العربية (Arabic)" },
  { value: "ar-SA", label: "العربية - السعودية" },
  { value: "ar-EG", label: "العربية - مصر" },
  { value: "en", label: "English" },
  { value: "en-US", label: "English - US" },
  { value: "en-GB", label: "English - UK" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "tr", label: "Türkçe" },
  { value: "hi", label: "हिन्दी" },
  { value: "ur", label: "اردو" },
  { value: "fa", label: "فارسی" },
];
