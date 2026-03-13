import { callMistral } from './mistral';
import {
  buildSystemPrompt,
  buildThoughtPrompt,
  buildIntentPrompt,
  buildChatPrompt,
  buildMemorySummarizationPrompt,
  buildInventionPrompt,
} from './prompts';
import { getRecentMemories, addMemory } from '../db/database';
import type { CharacterState, ActionType, GameEvent } from '../../../shared/types';

// ============================================================
// FALLBACK ответы когда LLM недоступен (РУССКИЙ)
// ============================================================
const FALLBACK_THOUGHTS = [
  'Ветер сегодня тихий. Надо этим воспользоваться.',
  'Интересно, есть ли дальше ещё ягоды...',
  'Камни холодные этим утром.',
  'Немного устал, но ещё есть дела.',
  'Надо проверить запасы.',
  'Поляна выглядит мирно. Мне тут нравится.',
  'Надо продолжать строить. По кирпичику, по камешку.',
  'Голод даёт о себе знать. Пора поесть.',
  'Хорошо бы найти кого-нибудь... Устал быть один.',
  'Может, придумаю что-нибудь новое сегодня.',
  'Дом потихоньку растёт. Горжусь собой.',
  'Эх, были бы помощники... Столько всего надо сделать.',
];

const FALLBACK_INTENTS: ActionType[] = ['WANDER', 'COLLECT_FOOD', 'COLLECT_WOOD', 'THINK'];

function randomFallback<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// Генерация мысли — каждые ~15 тиков
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

  return sanitizeResponse(result.content);
}

// ============================================================
// Выбор намерения — каждые ~20 тиков
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

  const raw = result.content.trim().toUpperCase().replace(/[^A-Z_]/g, '');
  const matched = availableActions.find(a => a === raw);
  if (matched) return matched;

  const partial = availableActions.find(a => raw.includes(a) || a.includes(raw));
  if (partial) return partial;

  console.warn('[Mind] Не удалось распознать намерение из:', result.content, '— используем фолбэк');
  return urgentNeed ? pickUrgentFallback(urgentNeed) : randomFallback(FALLBACK_INTENTS);
}

function pickUrgentFallback(urgentNeed: string): ActionType {
  if (urgentNeed.includes('голод') || urgentNeed.includes('hunger')) return 'COLLECT_FOOD';
  if (urgentNeed.includes('энерг') || urgentNeed.includes('energy')) return 'REST';
  return 'WANDER';
}

// ============================================================
// Ответ в чате — на сообщение игрока
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

function getFallbackChatResponse(_character: CharacterState, _msg: string): string {
  const responses = [
    'Я тебя слышу, но... мысли разбегаются. Дай мне минутку.',
    'Что-то в твоём голосе сегодня далёкое. Можешь повторить?',
    'Прости, отвлёкся. Ветер шумел. Что ты сказал?',
    'Я тут, просто задумался. Что тебе нужно?',
  ];
  return randomFallback(responses);
}

// ============================================================
// Генерация изобретения — НОВОЕ
// ============================================================
export async function generateInvention(
  character: CharacterState,
  existingInventions: string[]
): Promise<{ name: string; type: string; description: string; recipe: Record<string, number>; effect: string } | null> {
  const systemPrompt = buildSystemPrompt(character);
  const userPrompt = buildInventionPrompt(character, existingInventions);

  const result = await callMistral(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 200, temperature: 0.8 }
  );

  if (!result.success || !result.content) return null;

  try {
    // Extract JSON from response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.name && parsed.type && parsed.description && parsed.recipe) {
      return parsed;
    }
    return null;
  } catch {
    console.warn('[Mind] Не удалось распарсить изобретение:', result.content);
    return null;
  }
}

// ============================================================
// Суммаризация событий в память
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
// Санитизация вывода LLM
// ============================================================
function sanitizeResponse(text: string): string {
  text = text.replace(/^["']|["']$/g, '').trim();

  const forbidden = [
    /\bAI\b/gi,
    /\bLLM\b/gi,
    /\blanguage model\b/gi,
    /\bsimulation\b/gi,
    /\bNPC\b/gi,
    /\bprogram\b/gi,
    /\bbrowser\b/gi,
    /\bcomputer\b/gi,
    /\bсимуляци/gi,
    /\bпрограмм/gi,
    /\bнейросет/gi,
    /\bискусственн/gi,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      console.warn('[Mind] Заблокирован выход из роли:', text);
      return 'Не могу подобрать слов...';
    }
  }

  return text;
}
