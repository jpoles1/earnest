import { redirect, type RequestHandler } from '@sveltejs/kit';
import { consumeMagicLink } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const email = url.searchParams.get('email') ?? '';
	const token = url.searchParams.get('token') ?? '';

	try {
		await consumeMagicLink(cookies, { email, token });
	} catch {
		throw redirect(303, `/?authError=${encodeURIComponent('That magic link is invalid or expired.')}`);
	}

	throw redirect(303, '/');
};
