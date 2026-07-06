import { fail, redirect, type Actions } from '@sveltejs/kit';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
	getDevMagicLink,
	getGoogleAuthUrl,
	requestMagicLink,
	setGoogleStateCookie,
	signInWithPassword,
	signOut,
	signUpWithPassword
} from '$lib/server/auth';
import { db } from '$lib/server/db';
import {
	habit,
	habitCompletion,
	pointBalance,
	pointTransaction,
	reward,
	rewardPurchase
} from '$lib/server/db/schema';

type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly';
type ColumnId = 'morning' | 'focus' | 'wellness' | 'home';

const repeats = new Set<Recurrence>(['once', 'daily', 'weekly', 'monthly']);
const columns = new Set<ColumnId>(['morning', 'focus', 'wellness', 'home']);

const defaultRewardImage =
	'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=900&q=80';

export const load = async ({ locals, url }) => {
	if (!locals.user) {
		return {
			user: null,
			authError: url.searchParams.get('authError'),
			points: 0,
			habits: [],
			rewards: [],
			purchases: [],
			completions: [],
			transactions: [],
			completedToday: 0,
			earnedToday: 0
		};
	}

	await ensureUserDefaults(locals.user.id);

	const [balance] = await db
		.select()
		.from(pointBalance)
		.where(eq(pointBalance.userId, locals.user.id))
		.limit(1);

	const today = startOfToday();
	const completions = await db
		.select()
		.from(habitCompletion)
		.where(eq(habitCompletion.userId, locals.user.id))
		.orderBy(desc(habitCompletion.completedAt))
		.limit(8);
	const todayCompletions = await db
		.select()
		.from(habitCompletion)
		.where(and(eq(habitCompletion.userId, locals.user.id), gte(habitCompletion.completedAt, today)));
	const transactions = await db
		.select()
		.from(pointTransaction)
		.where(eq(pointTransaction.userId, locals.user.id))
		.orderBy(desc(pointTransaction.createdAt))
		.limit(10);

	return {
		user: locals.user,
		points: balance?.points ?? 0,
		habits: await db
			.select()
			.from(habit)
			.where(eq(habit.userId, locals.user.id))
			.orderBy(desc(habit.createdAt)),
		rewards: await db
			.select()
			.from(reward)
			.where(eq(reward.userId, locals.user.id))
			.orderBy(desc(reward.createdAt)),
		purchases: await db
			.select()
			.from(rewardPurchase)
			.where(eq(rewardPurchase.userId, locals.user.id))
			.orderBy(desc(rewardPurchase.createdAt))
			.limit(6),
		completions,
		transactions,
		completedToday: todayCompletions.length,
		earnedToday: todayCompletions.reduce((sum, item) => sum + item.points, 0)
	};
};

export const actions: Actions = {
	requestMagicLink: async ({ request, url }) => {
		const form = await request.formData();
		const email = stringValue(form, 'email').toLowerCase();
		const name = stringValue(form, 'name') || 'Earnest user';

		if (!email) return fail(400, { authError: 'Enter an email address.' });

		try {
			await requestMagicLink({ email, name, origin: url.origin });
		} catch {
			return fail(400, { authError: 'Could not create a magic link for that email.' });
		}

		return {
			authMessage: 'Magic link created. In development, use the link below.',
			devMagicLink: getDevMagicLink(email)
		};
	},
	signUp: async ({ cookies, request }) => {
		const form = await request.formData();
		const name = stringValue(form, 'name') || 'Earnest user';
		const email = stringValue(form, 'email').toLowerCase();
		const password = stringValue(form, 'password');

		if (!email || password.length < 8) {
			return fail(400, { authError: 'Enter an email and a password with at least 8 characters.' });
		}

		try {
			await signUpWithPassword(cookies, { name, email, password });
		} catch {
			return fail(400, { authError: 'Could not create that account. The email may already be in use.' });
		}

		throw redirect(303, '/');
	},
	signIn: async ({ cookies, request }) => {
		const form = await request.formData();
		const email = stringValue(form, 'email').toLowerCase();
		const password = stringValue(form, 'password');

		try {
			await signInWithPassword(cookies, { email, password });
		} catch {
			return fail(400, { authError: 'Email or password was not recognized.' });
		}

		throw redirect(303, '/');
	},
	google: async ({ cookies, url }) => {
		const authUrl = getGoogleAuthUrl(url.origin);
		if (authUrl) {
			setGoogleStateCookie(cookies, authUrl.state);
			throw redirect(303, authUrl.url);
		}

		return fail(400, {
			authError: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
		});
	},
	signOut: async ({ cookies }) => {
		await signOut(cookies);
		throw redirect(303, '/');
	},
	addHabit: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		const title = stringValue(form, 'title');
		const points = clampNumber(numberValue(form, 'points'), -100, 100);
		const dueAt = dateValue(form, 'dueAt');
		const repeat = enumValue(form, 'repeat', repeats, 'once');
		const column = enumValue(form, 'column', columns, 'morning');

		if (!title || !dueAt) return fail(400, { appError: 'Habit title and due date are required.' });

		await db.insert(habit).values({ userId, title, points, dueAt, repeat, column });
		return { appMessage: 'Habit added.', section: 'habits' };
	},
	updateHabit: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		const id = stringValue(form, 'id');
		const title = stringValue(form, 'title');
		const points = clampNumber(numberValue(form, 'points'), -100, 100);
		const dueAt = dateValue(form, 'dueAt');
		const repeat = enumValue(form, 'repeat', repeats, 'once');
		const column = enumValue(form, 'column', columns, 'morning');

		if (!title || !dueAt) return fail(400, { appError: 'Habit title and due date are required.' });

		await db
			.update(habit)
			.set({ title, points, dueAt, repeat, column })
			.where(and(eq(habit.id, id), eq(habit.userId, userId)));
		return { appMessage: 'Habit updated.', section: 'habits' };
	},
	completeHabit: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		const id = stringValue(form, 'id');
		const [task] = await db
			.select()
			.from(habit)
			.where(and(eq(habit.id, id), eq(habit.userId, userId)))
			.limit(1);

		if (!task || task.done) return fail(404, { appError: 'Habit was not found.' });

		await db
			.update(pointBalance)
			.set({ points: sql`${pointBalance.points} + ${task.points}` })
			.where(eq(pointBalance.userId, userId));
		await db.insert(habitCompletion).values({
			userId,
			habitId: task.id,
			title: task.title,
			points: task.points
		});
		await db.insert(pointTransaction).values({
			userId,
			sourceId: task.id,
			sourceType: 'habit',
			label: task.title,
			amount: task.points
		});

		if (task.repeat === 'once') {
			await db.update(habit).set({ done: true }).where(eq(habit.id, task.id));
		} else {
			await db.update(habit).set({ dueAt: nextDue(task.dueAt, task.repeat) }).where(eq(habit.id, task.id));
		}

		return { appMessage: `${task.points > 0 ? '+' : ''}${task.points} points applied.`, section: 'habits' };
	},
	moveHabit: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		const id = stringValue(form, 'id');
		const column = enumValue(form, 'column', columns, 'morning');

		await db.update(habit).set({ column }).where(and(eq(habit.id, id), eq(habit.userId, userId)));
		return { appMessage: 'Habit moved.', section: 'habits' };
	},
	deleteHabit: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		await db
			.delete(habit)
			.where(and(eq(habit.id, stringValue(form, 'id')), eq(habit.userId, userId)));
		return { appMessage: 'Habit deleted.', section: 'habits' };
	},
	addReward: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		const title = stringValue(form, 'title');
		const cost = Math.max(1, Math.round(numberValue(form, 'cost')));
		const image = stringValue(form, 'image') || defaultRewardImage;
		const description = stringValue(form, 'description') || 'A personal reward worth working toward.';
		const link = stringValue(form, 'link');

		if (!title) return fail(400, { appError: 'Reward title is required.' });

		await db.insert(reward).values({ userId, title, cost, image, description, link });
		return { appMessage: 'Reward added.', section: 'rewards' };
	},
	updateReward: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		const id = stringValue(form, 'id');
		const title = stringValue(form, 'title');
		const cost = Math.max(1, Math.round(numberValue(form, 'cost')));
		const image = stringValue(form, 'image') || defaultRewardImage;
		const description = stringValue(form, 'description') || 'A personal reward worth working toward.';
		const link = stringValue(form, 'link');

		if (!title) return fail(400, { appError: 'Reward title is required.' });

		await db
			.update(reward)
			.set({ title, cost, image, description, link })
			.where(and(eq(reward.id, id), eq(reward.userId, userId)));
		return { appMessage: 'Reward updated.', section: 'rewards' };
	},
	buyReward: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		const id = stringValue(form, 'id');
		const [item] = await db
			.select()
			.from(reward)
			.where(and(eq(reward.id, id), eq(reward.userId, userId)))
			.limit(1);
		const [balance] = await db
			.select()
			.from(pointBalance)
			.where(eq(pointBalance.userId, userId))
			.limit(1);

		if (!item) return fail(404, { appError: 'Reward was not found.' });
		if ((balance?.points ?? 0) < item.cost) {
			return fail(400, {
				appError: `${item.cost - (balance?.points ?? 0)} more points needed.`,
				section: 'rewards'
			});
		}

		await db
			.update(pointBalance)
			.set({ points: sql`${pointBalance.points} - ${item.cost}` })
			.where(eq(pointBalance.userId, userId));
		await db.insert(rewardPurchase).values({
			userId,
			rewardId: item.id,
			title: item.title,
			cost: item.cost
		});
		await db.insert(pointTransaction).values({
			userId,
			sourceId: item.id,
			sourceType: 'reward',
			label: item.title,
			amount: -item.cost
		});

		return { appMessage: `Purchased ${item.title}.`, section: 'rewards' };
	},
	deleteReward: async ({ locals, request }) => {
		const userId = requireUser(locals.user?.id);
		const form = await request.formData();
		await db
			.delete(reward)
			.where(and(eq(reward.id, stringValue(form, 'id')), eq(reward.userId, userId)));
		return { appMessage: 'Reward deleted.', section: 'rewards' };
	},
	resetDemo: async ({ locals }) => {
		const userId = requireUser(locals.user?.id);

		await db.delete(pointTransaction).where(eq(pointTransaction.userId, userId));
		await db.delete(habitCompletion).where(eq(habitCompletion.userId, userId));
		await db.delete(rewardPurchase).where(eq(rewardPurchase.userId, userId));
		await db.delete(habit).where(eq(habit.userId, userId));
		await db.delete(reward).where(eq(reward.userId, userId));
		await db
			.insert(pointBalance)
			.values({ userId, points: 80 })
			.onConflictDoUpdate({ target: pointBalance.userId, set: { points: 80 } });
		await seedHabits(userId);
		await seedRewards(userId);

		return { appMessage: 'Demo data reset.', section: 'habits' };
	}
};

async function ensureUserDefaults(userId: string) {
	await db.insert(pointBalance).values({ userId, points: 80 }).onConflictDoNothing();

	const userHabits = await db.select({ id: habit.id }).from(habit).where(eq(habit.userId, userId)).limit(1);
	if (userHabits.length === 0) {
		await seedHabits(userId);
	}

	const userRewards = await db
		.select({ id: reward.id })
		.from(reward)
		.where(eq(reward.userId, userId))
		.limit(1);
	if (userRewards.length === 0) {
		await seedRewards(userId);
	}
}

async function seedHabits(userId: string) {
	await db.insert(habit).values([
		{
			userId,
			title: 'Read for 20 minutes',
			points: 20,
			dueAt: offsetDate({ hours: 2 }),
			repeat: 'daily',
			column: 'morning'
		},
		{
			userId,
			title: 'Inbox zero reset',
			points: 10,
			dueAt: offsetDate({ hours: 5 }),
			repeat: 'weekly',
			column: 'focus'
		},
		{
			userId,
			title: 'Skip evening scrolling',
			points: 25,
			dueAt: offsetDate({ hours: 10 }),
			repeat: 'daily',
			column: 'wellness'
		},
		{
			userId,
			title: 'Kitchen reset',
			points: 15,
			dueAt: offsetDate({ hours: 8 }),
			repeat: 'daily',
			column: 'home'
		}
	]);
}

async function seedRewards(userId: string) {
	await db.insert(reward).values([
		{
			userId,
			title: 'Coffee date',
			cost: 120,
			image:
				'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
			description: 'A slow cafe visit with your favorite drink and no multitasking.',
			link: 'https://maps.google.com'
		},
		{
			userId,
			title: 'New book',
			cost: 250,
			image:
				'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80',
			description: 'Pick a title that has been sitting on your wish list.',
			link: 'https://bookshop.org'
		},
		{
			userId,
			title: 'Mini getaway fund',
			cost: 600,
			image:
				'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
			description: 'Set aside guilt-free money for a day trip or tiny adventure.',
			link: 'https://www.google.com/travel/'
		}
	]);
}

function requireUser(userId: string | undefined) {
	if (!userId) throw redirect(303, '/');
	return userId;
}

function stringValue(form: FormData, key: string) {
	return String(form.get(key) ?? '').trim();
}

function numberValue(form: FormData, key: string) {
	return Number(form.get(key) ?? 0);
}

function dateValue(form: FormData, key: string) {
	const value = stringValue(form, key);
	const date = value ? new Date(value) : null;
	return date && !Number.isNaN(date.getTime()) ? date : null;
}

function enumValue<T extends string>(form: FormData, key: string, options: Set<T>, fallback: T) {
	const value = stringValue(form, key) as T;
	return options.has(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, Math.round(value || 0)));
}

function offsetDate(offset: { hours?: number }) {
	const date = new Date();
	date.setHours(date.getHours() + (offset.hours ?? 0));
	date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
	return date;
}

function nextDue(dueAt: Date, repeat: Recurrence) {
	const date = new Date(dueAt);
	if (repeat === 'daily') date.setDate(date.getDate() + 1);
	if (repeat === 'weekly') date.setDate(date.getDate() + 7);
	if (repeat === 'monthly') date.setMonth(date.getMonth() + 1);
	return date;
}

function startOfToday() {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	return date;
}
