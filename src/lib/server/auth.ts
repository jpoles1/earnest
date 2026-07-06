import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Cookies } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { account, session, user, verification } from '$lib/server/db/schema';

const scrypt = promisify(scryptCallback);
const sessionCookie = 'earnest_session';
const sessionDays = 30;
const magicLinkMinutes = 10;
const devMagicLinks = new Map<string, { url: string; expiresAt: number }>();

export type AuthUser = typeof user.$inferSelect;
export type AuthSession = typeof session.$inferSelect;

export async function getSessionUser(cookies: Cookies) {
	const token = cookies.get(sessionCookie);
	if (!token) return null;

	const [currentSession] = await db
		.select()
		.from(session)
		.where(eq(session.token, hashToken(token)))
		.limit(1);
	if (!currentSession || currentSession.expiresAt <= new Date()) {
		if (currentSession) await db.delete(session).where(eq(session.id, currentSession.id));
		clearSessionCookie(cookies);
		return null;
	}

	const [currentUser] = await db.select().from(user).where(eq(user.id, currentSession.userId)).limit(1);
	if (!currentUser) {
		await db.delete(session).where(eq(session.id, currentSession.id));
		clearSessionCookie(cookies);
		return null;
	}

	return { user: currentUser, session: currentSession };
}

export async function signUpWithPassword(cookies: Cookies, input: { name: string; email: string; password: string }) {
	const email = normalizeEmail(input.email);
	const existing = await findUserByEmail(email);
	if (existing) throw new Error('Email is already in use');

	const newUser = await createUser({ name: input.name, email, emailVerified: false });
	await db.insert(account).values({
		id: crypto.randomUUID(),
		accountId: email,
		providerId: 'credential',
		userId: newUser.id,
		password: await hashPassword(input.password),
		createdAt: new Date(),
		updatedAt: new Date()
	});
	await createSession(cookies, newUser.id);
}

export async function signInWithPassword(cookies: Cookies, input: { email: string; password: string }) {
	const email = normalizeEmail(input.email);
	const existing = await findUserByEmail(email);
	if (!existing) throw new Error('Invalid credentials');

	const [credential] = await db
		.select()
		.from(account)
		.where(and(eq(account.userId, existing.id), eq(account.providerId, 'credential'), eq(account.accountId, email)))
		.limit(1);
	if (!credential?.password || !(await verifyPassword(input.password, credential.password))) {
		throw new Error('Invalid credentials');
	}

	await createSession(cookies, existing.id);
}

export async function requestMagicLink(input: { name: string; email: string; origin: string }) {
	const email = normalizeEmail(input.email);
	const token = randomToken();
	const expiresAt = new Date(Date.now() + magicLinkMinutes * 60 * 1000);

	await db.delete(verification).where(eq(verification.identifier, magicIdentifier(email)));
	await db.insert(verification).values({
		id: crypto.randomUUID(),
		identifier: magicIdentifier(email),
		value: JSON.stringify({ token: hashToken(token), name: input.name || 'Earnest user' }),
		expiresAt,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	const url = new URL('/auth/magic', input.origin);
	url.searchParams.set('email', email);
	url.searchParams.set('token', token);
	devMagicLinks.set(email, { url: url.toString(), expiresAt: expiresAt.getTime() });
	console.info(`Magic link for ${email}: ${url.toString()}`);
}

export async function consumeMagicLink(cookies: Cookies, input: { email: string; token: string }) {
	const email = normalizeEmail(input.email);
	const [record] = await db
		.select()
		.from(verification)
		.where(eq(verification.identifier, magicIdentifier(email)))
		.limit(1);
	if (!record || record.expiresAt <= new Date()) throw new Error('Magic link expired');

	const payload = parseMagicPayload(record.value);
	if (!payload?.token || !safeEqual(hashToken(input.token), payload.token)) {
		throw new Error('Invalid magic link');
	}

	await db.delete(verification).where(eq(verification.id, record.id));
	const existing = await findUserByEmail(email);
	const currentUser =
		existing ??
		(await createUser({
			name: payload.name || 'Earnest user',
			email,
			emailVerified: true
		}));
	await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, currentUser.id));
	await createSession(cookies, currentUser.id);
}

export function getGoogleAuthUrl(origin: string) {
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;

	const state = randomToken();
	const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
	url.searchParams.set('redirect_uri', googleRedirectUri(origin));
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', 'openid email profile');
	url.searchParams.set('state', state);
	url.searchParams.set('prompt', 'select_account');
	return { url: url.toString(), state };
}

export async function signInWithGoogle(cookies: Cookies, input: { code: string; origin: string }) {
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth is not configured');

	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			code: input.code,
			grant_type: 'authorization_code',
			redirect_uri: googleRedirectUri(input.origin)
		})
	});
	if (!tokenResponse.ok) throw new Error('Google token exchange failed');

	const tokens = (await tokenResponse.json()) as { access_token?: string; id_token?: string; expires_in?: number };
	if (!tokens.access_token) throw new Error('Google access token missing');

	const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
		headers: { authorization: `Bearer ${tokens.access_token}` }
	});
	if (!profileResponse.ok) throw new Error('Google profile lookup failed');

	const profile = (await profileResponse.json()) as {
		sub?: string;
		email?: string;
		email_verified?: boolean;
		name?: string;
		picture?: string;
	};
	if (!profile.sub || !profile.email) throw new Error('Google profile is missing required fields');

	const email = normalizeEmail(profile.email);
	const existing = await findUserByGoogleId(profile.sub);
	const currentUser =
		existing ??
		(await findUserByEmail(email)) ??
		(await createUser({
			name: profile.name || email,
			email,
			emailVerified: Boolean(profile.email_verified),
			image: profile.picture
		}));

	await db
		.update(user)
		.set({
			name: profile.name || currentUser.name,
			emailVerified: currentUser.emailVerified || Boolean(profile.email_verified),
			image: profile.picture || currentUser.image,
			updatedAt: new Date()
		})
		.where(eq(user.id, currentUser.id));

	await upsertGoogleAccount({
		userId: currentUser.id,
		googleId: profile.sub,
		accessToken: tokens.access_token,
		idToken: tokens.id_token,
		expiresIn: tokens.expires_in
	});
	await createSession(cookies, currentUser.id);
}

export async function signOut(cookies: Cookies) {
	const token = cookies.get(sessionCookie);
	if (token) await db.delete(session).where(eq(session.token, hashToken(token)));
	clearSessionCookie(cookies);
}

export function setGoogleStateCookie(cookies: Cookies, state: string) {
	cookies.set('earnest_google_state', state, cookieOptions(10 * 60));
}

export function verifyGoogleStateCookie(cookies: Cookies, state: string | null) {
	const expected = cookies.get('earnest_google_state');
	cookies.set('earnest_google_state', '', cookieOptions(0));
	return Boolean(expected && state && safeEqual(expected, state));
}

export function getDevMagicLink(email: string) {
	const key = normalizeEmail(email);
	const link = devMagicLinks.get(key);
	if (!link || link.expiresAt < Date.now()) {
		devMagicLinks.delete(key);
		return null;
	}

	return link.url;
}

async function createSession(cookies: Cookies, userId: string) {
	const token = randomToken();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + sessionDays * 24 * 60 * 60 * 1000);

	await db.insert(session).values({
		id: crypto.randomUUID(),
		token: hashToken(token),
		userId,
		expiresAt,
		createdAt: now,
		updatedAt: now
	});
	cookies.set(sessionCookie, token, cookieOptions(sessionDays * 24 * 60 * 60));
}

async function createUser(input: { name: string; email: string; emailVerified: boolean; image?: string }) {
	const [newUser] = await db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			name: input.name,
			email: input.email,
			emailVerified: input.emailVerified,
			image: input.image,
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning();
	return newUser;
}

async function findUserByEmail(email: string) {
	const [existing] = await db.select().from(user).where(eq(user.email, normalizeEmail(email))).limit(1);
	return existing ?? null;
}

async function findUserByGoogleId(googleId: string) {
	const [googleAccount] = await db
		.select()
		.from(account)
		.where(and(eq(account.accountId, googleId), eq(account.providerId, 'google')))
		.limit(1);
	if (!googleAccount) return null;

	const [existing] = await db.select().from(user).where(eq(user.id, googleAccount.userId)).limit(1);
	return existing ?? null;
}

async function upsertGoogleAccount(input: {
	userId: string;
	googleId: string;
	accessToken?: string;
	idToken?: string;
	expiresIn?: number;
}) {
	const now = new Date();
	const [existing] = await db
		.select()
		.from(account)
		.where(and(eq(account.accountId, input.googleId), eq(account.providerId, 'google')))
		.limit(1);
	const values = {
		accessToken: input.accessToken,
		idToken: input.idToken,
		accessTokenExpiresAt: input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null,
		updatedAt: now
	};

	if (existing) {
		await db.update(account).set(values).where(eq(account.id, existing.id));
		return;
	}

	await db.insert(account).values({
		id: crypto.randomUUID(),
		accountId: input.googleId,
		providerId: 'google',
		userId: input.userId,
		...values,
		createdAt: now
	});
}

async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('base64url');
	const derived = (await scrypt(password, salt, 64)) as Buffer;
	return `scrypt:${salt}:${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, stored: string) {
	const [scheme, salt, hash] = stored.split(':');
	if (scheme !== 'scrypt' || !salt || !hash) return false;

	const expected = Buffer.from(hash, 'base64url');
	const actual = (await scrypt(password, salt, expected.length)) as Buffer;
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string) {
	return createHash('sha256').update(token).digest('base64url');
}

function randomToken() {
	return randomBytes(32).toString('base64url');
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function magicIdentifier(email: string) {
	return `magic:${normalizeEmail(email)}`;
}

function parseMagicPayload(value: string) {
	try {
		return JSON.parse(value) as { token?: string; name?: string };
	} catch {
		return null;
	}
}

function googleRedirectUri(origin: string) {
	return `${env.ORIGIN || origin}/auth/google/callback`;
}

function cookieOptions(maxAge: number) {
	const configuredOrigin = env.ORIGIN ? new URL(env.ORIGIN) : null;

	return {
		httpOnly: true,
		path: '/',
		sameSite: 'lax',
		secure: configuredOrigin ? configuredOrigin.protocol === 'https:' : env.NODE_ENV === 'production',
		maxAge
	} as const;
}

function clearSessionCookie(cookies: Cookies) {
	cookies.set(sessionCookie, '', cookieOptions(0));
}

function safeEqual(left: string, right: string) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
