/**
 * Smoke test — запускать отдельно: npm run test:smoke
 * Проверяет: env loading, DB init, Mistral API
 */
import 'dotenv/config';
import { initDatabase } from './db/database';
import { pingMistral } from './ai/mistral';
import { buildInitialWorld } from './game/worldMap';
import { createCharacter } from './game/character';

async function run() {
  console.log('\n=== AI World Sim — Smoke Test ===\n');

  // 1. Env check
  console.log('[1/4] Environment:');
  console.log('  MISTRAL_API_KEY:', process.env.MISTRAL_API_KEY ? '✅ Set' : '❌ Not set');
  console.log('  MISTRAL_MODEL:  ', process.env.MISTRAL_MODEL ?? 'mistral-large-latest (default)');
  console.log('  PORT:           ', process.env.PORT ?? '3001 (default)');

  // 2. DB init
  console.log('\n[2/4] Database:');
  try {
    initDatabase();
    console.log('  ✅ SQLite initialized');
  } catch (err) {
    console.error('  ❌ DB error:', err);
    process.exit(1);
  }

  // 3. World creation
  console.log('\n[3/4] World & Character:');
  const tiles = buildInitialWorld();
  const char  = createCharacter();
  console.log(`  ✅ World created: ${tiles.length}x${tiles[0].length} tiles`);
  console.log(`  ✅ Character: ${char.name} at (${char.position.x}, ${char.position.y})`);
  console.log(`  ✅ Needs: hunger=${char.needs.hunger}, energy=${char.needs.energy}`);

  // 4. Mistral API ping
  console.log('\n[4/4] Mistral API:');
  const ping = await pingMistral();
  if (ping.ok) {
    console.log('  ✅', ping.message);
  } else if (!ping.hasKey) {
    console.log('  ⚠️  No API key — character will use rule-based fallbacks');
    console.log('     Set MISTRAL_API_KEY in .env to enable AI brain');
  } else {
    console.error('  ❌ API error:', ping.message);
  }

  console.log('\n=== Smoke test complete ===');
  console.log('Run `npm run dev` in the root to start the full application.\n');
  process.exit(0);
}

run().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
