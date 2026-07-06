import { redirect, type RequestHandler } from '@sveltejs/kit';
import { signInWithGoogle, verifyGoogleStateCookie } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code || !verifyGoogleStateCookie(cookies, state)) {
		throw redirect(303, `/?authError=${encodeURIComponent('Google sign-in could not be verified.')}`);
	}

	try {
		await signInWithGoogle(cookies, { code, origin: url.origin });
	} catch {
		throw redirect(303, `/?authError=${encodeURIComponent('Google sign-in failed.')}`);
	}

	throw redirect(303, '/');
};
