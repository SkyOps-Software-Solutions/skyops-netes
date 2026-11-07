import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool, PoolClient } from 'pg';

function resolveModuleDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // fallback
  }
  return process.cwd();
}

const currentDir = resolveModuleDir();

export interface MigrationRecord {
  id: string;
  appliedAt: Date;
}

export class PostgresMigrator {
  private migrationsDir: string;

  constructor(private pool: Pool, migrationsDir?: string) {
    if (migrationsDir) {
      this.migrationsDir = migrationsDir;
    } else if (process.env.MIGRATIONS_DIR) {
      this.migrationsDir = process.env.MIGRATIONS_DIR;
    } else {
      const candidates = [
        path.join(currentDir, 'migrations'),
        path.join(process.cwd(), 'server', 'persistence', 'migrations'),
        path.join(process.cwd(), 'dist', 'migrations'),
        path.join(currentDir, '..', 'server', 'persistence', 'migrations')
      ];
      const found = candidates.find((dir) => fs.existsSync(dir));
      this.migrationsDir = found || path.join(currentDir, 'migrations');
    }
  }

  /**
   * Initializes the schema_migrations tracking table if it does not already exist.
   */
  public async ensureMigrationsTable(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  /**
   * Returns list of already-applied migration IDs.
   */
  public async getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
    await this.ensureMigrationsTable(client);
    const res = await client.query('SELECT id FROM schema_migrations ORDER BY id ASC');
    return new Set(res.rows.map((r) => r.id));
  }

  /**
   * Executes pending migrations in alphanumeric order inside transactions.
   */
  public async runPendingMigrations(): Promise<string[]> {
    if (!fs.existsSync(this.migrationsDir)) {
      console.warn(`[PostgresMigrator] Migrations directory does not exist: ${this.migrationsDir}`);
      return [];
    }

    const files = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied: string[] = [];
    const client = await this.pool.connect();

    try {
      const alreadyApplied = await this.getAppliedMigrations(client);

      for (const file of files) {
        if (alreadyApplied.has(file)) {
          continue;
        }

        const filePath = path.join(this.migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        console.log(`[PostgresMigrator] Applying migration: ${file}...`);
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW())', [file]);
          await client.query('COMMIT');
          applied.push(file);
          console.log(`[PostgresMigrator] Successfully applied migration: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[PostgresMigrator] Failed applying migration ${file}. Rolled back.`, err);
          throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      client.release();
    }

    return applied;
  }
}
