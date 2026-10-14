import { drizzle as pgDrizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import type { AppConfig } from '../config';
export type Database = NodePgDatabase<typeof schema>;

export async function openDatabase(config: AppConfig) {
  if (config.development) {
    throw new Error('La base embarquée est réservée au serveur de développement explicite.');
  }
  // TLS verification follows the connection string (Neon supplies sslmode=require).
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  return { db: pgDrizzle(pool, { schema }), close: () => pool.end() };
}
