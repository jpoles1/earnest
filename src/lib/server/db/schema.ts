import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';

export const pointBalance = sqliteTable('point_balance', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	points: integer('points').notNull().default(0),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull()
});

export const habit = sqliteTable(
	'habit',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		points: integer('points').notNull(),
		dueAt: integer('due_at', { mode: 'timestamp_ms' }).notNull(),
		repeat: text('repeat', { enum: ['once', 'daily', 'weekly', 'monthly'] })
			.notNull()
			.default('once'),
		column: text('column', { enum: ['morning', 'focus', 'wellness', 'home'] })
			.notNull()
			.default('morning'),
		done: integer('done', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [index('habit_user_id_idx').on(table.userId)]
);

export const habitCompletion = sqliteTable(
	'habit_completion',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		habitId: text('habit_id').references(() => habit.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		points: integer('points').notNull(),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [index('habit_completion_user_id_idx').on(table.userId)]
);

export const reward = sqliteTable(
	'reward',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		cost: integer('cost').notNull(),
		image: text('image').notNull(),
		description: text('description').notNull(),
		link: text('link').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [index('reward_user_id_idx').on(table.userId)]
);

export const rewardPurchase = sqliteTable(
	'reward_purchase',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		rewardId: text('reward_id').references(() => reward.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		cost: integer('cost').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [index('reward_purchase_user_id_idx').on(table.userId)]
);

export const pointTransaction = sqliteTable(
	'point_transaction',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		sourceId: text('source_id'),
		sourceType: text('source_type', { enum: ['habit', 'reward', 'adjustment'] }).notNull(),
		label: text('label').notNull(),
		amount: integer('amount').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [index('point_transaction_user_id_idx').on(table.userId)]
);

export const habitRelations = relations(habit, ({ one }) => ({
	user: one(user, {
		fields: [habit.userId],
		references: [user.id]
	})
}));

export const habitCompletionRelations = relations(habitCompletion, ({ one }) => ({
	user: one(user, {
		fields: [habitCompletion.userId],
		references: [user.id]
	}),
	habit: one(habit, {
		fields: [habitCompletion.habitId],
		references: [habit.id]
	})
}));

export const rewardRelations = relations(reward, ({ one }) => ({
	user: one(user, {
		fields: [reward.userId],
		references: [user.id]
	})
}));

export const rewardPurchaseRelations = relations(rewardPurchase, ({ one }) => ({
	user: one(user, {
		fields: [rewardPurchase.userId],
		references: [user.id]
	}),
	reward: one(reward, {
		fields: [rewardPurchase.rewardId],
		references: [reward.id]
	})
}));

export const pointTransactionRelations = relations(pointTransaction, ({ one }) => ({
	user: one(user, {
		fields: [pointTransaction.userId],
		references: [user.id]
	})
}));

export * from './auth.schema';
