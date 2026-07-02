import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

const devMagicLinks = new Map<string, { url: string; expiresAt: number }>();

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
	socialProviders:
		env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: env.GOOGLE_CLIENT_ID,
						clientSecret: env.GOOGLE_CLIENT_SECRET
					}
				}
			: undefined,
	plugins: [
		magicLink({
			expiresIn: 10 * 60,
			sendMagicLink({ email, url }) {
				devMagicLinks.set(email.toLowerCase(), { url, expiresAt: Date.now() + 10 * 60 * 1000 });
				console.info(`Magic link for ${email}: ${url}`);
			}
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});

export function getDevMagicLink(email: string) {
	const key = email.toLowerCase();
	const link = devMagicLinks.get(key);
	if (!link || link.expiresAt < Date.now()) {
		devMagicLinks.delete(key);
		return null;
	}

	return link.url;
}
