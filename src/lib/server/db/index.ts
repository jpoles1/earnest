import { createRequire } from 'node:module';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const require = createRequire(import.meta.url);
let dbInstance: unknown;

function getDb() {
	if (!dbInstance) {
		const { drizzle } = require('drizzle-orm/bun-sqlite');
		dbInstance = drizzle(env.DATABASE_URL, { schema });
	}

	return dbInstance as Record<PropertyKey, unknown>;
}

export const db = new Proxy(
	{},
	{
		get(_target, property) {
			return getDb()[property];
		}
	}
) as BunSQLiteDatabase<typeof schema>;
