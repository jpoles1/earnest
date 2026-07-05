import { createRequire } from 'node:module';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const require = createRequire(import.meta.url);
let dbInstance: unknown;

function getDb() {
	if (!dbInstance) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
		const Database = require('better-sqlite3') as typeof import('better-sqlite3');
		const { drizzle } = require('drizzle-orm/better-sqlite3') as typeof import(
			'drizzle-orm/better-sqlite3'
		);
		dbInstance = drizzle(new Database(env.DATABASE_URL), { schema });
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
) as BetterSQLite3Database<typeof schema>;
