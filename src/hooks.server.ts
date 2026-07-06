import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getSessionUser } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const auth = await getSessionUser(event.cookies);
	if (auth) {
		event.locals.session = auth.session;
		event.locals.user = auth.user;
	}

	return resolve(event);
};
