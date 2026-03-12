import { Router } from 'express';
import { pingMistral } from '../ai/mistral';
import type { WorldManager } from '../game/world';

export function createApiRouter(world: WorldManager): Router {
  const router = Router();

  // --------------------------------------------------------
  // GET /api/health — basic server health check
  // --------------------------------------------------------
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      tick: world.tick,
      character: world.character.name,
      uptime: process.uptime(),
    });
  });

  // --------------------------------------------------------
  // GET /api/ping-brain — smoke test for Mistral API
  // --------------------------------------------------------
  router.get('/ping-brain', async (_req, res) => {
    try {
      const result = await pingMistral();
      res.json(result);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --------------------------------------------------------
  // GET /api/state — full world state snapshot
  // --------------------------------------------------------
  router.get('/state', (_req, res) => {
    res.json(world.getSnapshot());
  });

  // --------------------------------------------------------
  // GET /api/character — character state only
  // --------------------------------------------------------
  router.get('/character', (_req, res) => {
    res.json(world.character);
  });

  return router;
}
