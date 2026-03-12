import dotenv from 'dotenv';
import path from 'path';
import { execFile } from 'child_process';

// Load .env from server/ or parent dirs
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ============================================================
// Mistral API Adapter — server-side only, key never leaves server
// Uses curl via child_process for reliable DNS in all environments
// ============================================================

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const API_TIMEOUT_MS  = 30_000;

function getKey():   string { return process.env.MISTRAL_API_KEY  ?? ''; }
function getModel(): string { return process.env.MISTRAL_MODEL ?? 'mistral-large-latest'; }

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
// Call via curl — bypasses Node.js DNS issues in sandbox envs
// ============================================================
export function callMistral(
  messages: MistralMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<MistralResponse> {
  const apiKey = getKey();

  if (!apiKey) {
    console.warn('[Mistral] No API key — using fallback');
    return Promise.resolve({ content: '', success: false, error: 'No API key' });
  }

  const body = JSON.stringify({
    model: getModel(),
    messages,
    max_tokens: options.maxTokens ?? 300,
    temperature: options.temperature ?? 0.7,
  });

  return new Promise((resolve) => {
    const args = [
      '--silent',
      '--max-time', String(Math.floor(API_TIMEOUT_MS / 1000)),
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${apiKey}`,
      '-d', body,
      MISTRAL_API_URL,
    ];

    const proc = execFile('curl', args, { timeout: API_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Mistral] curl error:', error.message);
        resolve({ content: '', success: false, error: error.message });
        return;
      }

      try {
        const data = JSON.parse(stdout) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };

        if (data.error) {
          console.error('[Mistral] API error:', data.error.message);
          resolve({ content: '', success: false, error: data.error.message });
          return;
        }

        const content = data.choices?.[0]?.message?.content?.trim() ?? '';
        resolve({ content, success: true });
      } catch (e) {
        console.error('[Mistral] Parse error, stdout:', stdout.slice(0, 200));
        resolve({ content: '', success: false, error: `Parse error: ${e}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ content: '', success: false, error: `spawn error: ${err.message}` });
    });
  });
}

// ============================================================
// Convenience helper
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
// Health check
// ============================================================
export async function pingMistral(): Promise<{
  ok: boolean; model: string; hasKey: boolean; message: string;
}> {
  const hasKey = Boolean(getKey());
  if (!hasKey) {
    return { ok: false, model: getModel(), hasKey: false, message: 'MISTRAL_API_KEY not set' };
  }

  const result = await callMistral(
    [{ role: 'user', content: 'Say "hello" in exactly one word.' }],
    { maxTokens: 10, temperature: 0 }
  );

  return {
    ok: result.success,
    model: getModel(),
    hasKey: true,
    message: result.success
      ? `API OK — response: "${result.content}"`
      : `API error: ${result.error}`,
  };
}
