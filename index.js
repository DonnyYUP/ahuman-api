require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || '';

/**
 * Auth middleware for all /commands routes.
 */
app.use((req, res, next) => {
  if (req.path.startsWith('/commands')) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${INTERNAL_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next();
});

/**
 * POST /commands
 * Body: { command_id, type, payload }
 * - Idempotent by command_id
 * - If same command_id exists with different payload -> 409
 */
app.post('/commands', async (req, res) => {
  const { command_id, type, payload } = req.body || {};
  if (!command_id || !type) {
    return res.status(400).json({ error: 'command_id and type required' });
  }

  const newPayload = payload ?? {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM commands WHERE command_id = $1',
      [command_id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const oldPayload = row.payload_json ?? null;

      // If old payload exists and is different -> conflict
      if (oldPayload !== null) {
        const same = JSON.stringify(oldPayload) === JSON.stringify(newPayload);
        if (!same) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'Payload conflict',
            message: 'This command_id already exists with a different payload. Use a new command_id.'
          });
        }
      }

      await client.query('COMMIT');
      return res.json(row);
    }

    await client.query(
      `INSERT INTO commands (command_id, type, payload_json, status)
       VALUES ($1, $2, $3, 'PENDING')`,
      [command_id, type, newPayload]
    );

    const created = await client.query(
      'SELECT * FROM commands WHERE command_id = $1',
      [command_id]
    );

    await client.query('COMMIT');
    return res.json(created.rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('POST /commands failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  } finally {
    client.release();
  }
});

/**
 * GET /commands/:id
 */
app.get('/commands/:id', async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    'SELECT * FROM commands WHERE command_id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.json(result.rows[0]);
});

/**
 * POST /commands/:id/result
 * Body: { status: DONE|FAILED, result, logs: [{level,message}] }
 */
app.post('/commands/:id/result', async (req, res) => {
  const { id } = req.params;
  const { status, result, logs } = req.body || {};

  if (!['DONE', 'FAILED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE commands
       SET status = $1,
           result_json = $2,
           updated_at = NOW()
       WHERE command_id = $3`,
      [status, result ?? {}, id]
    );

    if (Array.isArray(logs) && logs.length > 0) {
      for (const l of logs) {
        await client.query(
          `INSERT INTO command_logs (command_id, level, message)
           VALUES ($1, $2, $3)`,
          [id, l.level || 'INFO', l.message || '']
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('POST /commands/:id/result failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /commands/next
 * Atomically claim ONE oldest PENDING command and mark RUNNING.
 * If none: 204 No Content.
 */
app.post('/commands/next', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pick = await client.query(
      `
      SELECT command_id
      FROM commands
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `
    );

    if (pick.rows.length === 0) {
      await client.query('COMMIT');
      return res.status(204).send();
    }

    const commandId = pick.rows[0].command_id;

    await client.query(
      `
      UPDATE commands
      SET status = 'RUNNING',
          updated_at = NOW()
      WHERE command_id = $1
      `,
      [commandId]
    );

    await client.query(
      `
      INSERT INTO command_logs (command_id, level, message)
      VALUES ($1, 'INFO', 'Command claimed by worker')
      `,
      [commandId]
    );

    const claimed = await client.query(
      'SELECT * FROM commands WHERE command_id = $1',
      [commandId]
    );

    await client.query('COMMIT');
    return res.json(claimed.rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('POST /commands/next failed:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`A Human API running on port ${PORT}`));
