import { callMistral } from './mistral';
import {
  buildSystemPrompt,
  buildThoughtPrompt,
  buildIntentPrompt,
  buildChatPrompt,
  buildMemorySummarizationPrompt,
} from './prompts';
import { getRecentMemories, addMemory } from '../db/database';
import type { CharacterState, ActionType, GameEvent } from '../../../shared/types';

// ============================================================
// FALLBACK responses when LLM is unavailable
// ============================================================
const FALLBACK_THOUGHTS = [
  'The wind is calm today. I should make the most of it.',
  'I wonder if there are more berries further in.',
  'The stones feel cold this morning.',
  'A bit tired, but there is still work to do.',
  'I should check on my supplies soon.',
  'The clearing looks peaceful. I like it here.',
  'Need to keep building. Bit by bit, it comes together.',
  'Hunger gnaws a little. Time to find something to eat.',
];

const FALLBACK_INTENTS: ActionType[] = ['WANDER', 'COLLECT_FOOD', 'COLLECT_WOOD', 'THINK'];

function randomFallback<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// Generate a thought — called every ~15 ticks
// ============================================================
export async function generateThought(
  character: CharacterState,
  recentEvents: GameEvent[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt(character);
  const userPrompt = buildThoughtPrompt(character, recentEvents);

  const result = await callMistral(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 80, temperature: 0.85 }
  );

  if (!result.success || !result.content) {
    return randomFallback(FALLBACK_THOUGHTS);
  }

  // Clean up any accidental meta-commentary
  return sanitizeResponse(result.content);
}

// ============================================================
// Select intent — called every ~20 ticks
// ============================================================
export async function selectIntent(
  character: CharacterState,
  availableActions: ActionType[],
  urgentNeed: string | null
): Promise<ActionType> {
  const memories = getRecentMemories(5);
  const systemPrompt = buildSystemPrompt(character);
  const userPrompt = buildIntentPrompt(
    character,
    availableActions,
    memories,
    urgentNeed
  );

  const result = await callMistral(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 20, temperature: 0.3 }
  );

  if (!result.success || !result.content) {
    return urgentNeed ? pickUrgentFallback(urgentNeed) : randomFallback(FALLBACK_INTENTS);
  }

  // Parse the response — expect one of the action names
  const raw = result.content.trim().toUpperCase().replace(/[^A-Z_]/g, '');
  const matched = availableActions.find(a => a === raw);
  if (matched) return matched;

  // If no match, try to find a partial match
  const partial = availableActions.find(a => raw.includes(a) || a.includes(raw));
  if (partial) return partial;

  console.warn('[Mind] Could not parse intent from:', result.content, '— using fallback');
  return urgentNeed ? pickUrgentFallback(urgentNeed) : randomFallback(FALLBACK_INTENTS);
}

function pickUrgentFallback(urgentNeed: string): ActionType {
  if (urgentNeed.includes('hunger')) return 'COLLECT_FOOD';
  if (urgentNeed.includes('energy')) return 'REST';
  return 'WANDER';
}

// ============================================================
// Generate chat response — called on player message
// ============================================================
export async function generateChatResponse(
  character: CharacterState,
  playerMessage: string,
  recentChat: Array<{ role: string; content: string }>,
  recentEvents: GameEvent[]
): Promise<string> {
  const fullPrompt = buildChatPrompt(character, playerMessage, recentChat, recentEvents);

  const result = await callMistral(
    [{ role: 'user', content: fullPrompt }],
    { maxTokens: 200, temperature: 0.75 }
  );

  if (!result.success || !result.content) {
    return getFallbackChatResponse(character, playerMessage);
  }

  return sanitizeResponse(result.content);
}

function getFallbackChatResponse(character: CharacterState, _msg: string): string {
  const responses = [
    `I heard you, but... my thoughts are scattered right now. Give me a moment.`,
    `Something about your voice feels distant today. Could you say that again?`,
    `Sorry, I was distracted. The wind was loud. What did you say?`,
    `I'm here, just busy with my own thoughts. What do you need?`,
  ];
  return randomFallback(responses);
}

// ============================================================
// Summarize recent events into a memory
// ============================================================
export async function summarizeIntoMemory(
  character: CharacterState,
  events: string[],
  tick: number
): Promise<void> {
  if (events.length === 0) return;

  const systemPrompt = buildSystemPrompt(character);
  const userPrompt = buildMemorySummarizationPrompt(character, events);

  const result = await callMistral(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 80, temperature: 0.4 }
  );

  const summary = result.success && result.content
    ? sanitizeResponse(result.content)
    : events.slice(0, 2).join('; ');

  addMemory(tick, summary, 1);
}

// ============================================================
// Sanitize LLM output — remove meta-commentary
// ============================================================
function sanitizeResponse(text: string): string {
  // Remove leading/trailing quotes
  text = text.replace(/^["']|["']$/g, '').trim();

  // Block any accidental fourth-wall breaks
  const forbidden = [
    /\bAI\b/gi,
    /\bLLM\b/gi,
    /\blanguage model\b/gi,
    /\bsimulation\b/gi,
    /\bgame\b/gi,
    /\bNPC\b/gi,
    /\bprogram\b/gi,
    /\bcode\b/gi,
    /\bbrowser\b/gi,
    /\bcomputer\b/gi,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      console.warn('[Mind] Blocked fourth-wall break in response:', text);
      return 'I find myself at a loss for words just now.';
    }
  }

  return text;
}
