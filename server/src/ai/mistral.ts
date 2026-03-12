import dotenv from 'dotenv';
dotenv.config();

// ============================================================
// Mistral API Adapter
// Server-side only — ключ никогда не покидает сервер
// ============================================================

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';
const API_TIMEOUT_MS = 30_000;

export interface MistralMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MistralResponse {
  content: string;
  success: boolean;
  error?: string;
}

// ============================================================
// Core API call with timeout + error handling
// ============================================================
export async function callMistral(
  messages: MistralMessage[],
  options: {
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<MistralResponse> {
  if (!MISTRAL_API_KEY) {
    console.warn('[Mistral] No API key configured — using fallback');
    return { content: '', success: false, error: 'No API key configured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages,
        max_tokens: options.maxTokens ?? 300,
        temperature: options.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      console.error(`[Mistral] API error ${response.status}: ${text}`);
      return { content: '', success: false, error: `API ${response.status}: ${text}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim() ?? '';
    return { content, success: true };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort') || message.includes('AbortError')) {
      console.error('[Mistral] Request timed out after', API_TIMEOUT_MS, 'ms');
      return { content: '', success: false, error: 'Request timed out' };
    }
    console.error('[Mistral] Network error:', message);
    return { content: '', success: false, error: message };
  }
}

// ============================================================
// Convenience: single user message with system prompt
// ============================================================
export async function askMistral(
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<MistralResponse> {
  return callMistral(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    options
  );
}

// ============================================================
// Health check — для smoke test
// ============================================================
export async function pingMistral(): Promise<{
  ok: boolean;
  model: string;
  hasKey: boolean;
  message: string;
}> {
  const hasKey = Boolean(MISTRAL_API_KEY);

  if (!hasKey) {
    return {
      ok: false,
      model: MISTRAL_MODEL,
      hasKey: false,
      message: 'MISTRAL_API_KEY not set in .env',
    };
  }

  const result = await callMistral(
    [{ role: 'user', content: 'Say "hello" in exactly one word.' }],
    { maxTokens: 10, temperature: 0 }
  );

  return {
    ok: result.success,
    model: MISTRAL_MODEL,
    hasKey: true,
    message: result.success
      ? `API OK — response: "${result.content}"`
      : `API error: ${result.error}`,
  };
}
