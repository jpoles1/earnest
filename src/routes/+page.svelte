<script lang="ts">
	type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly';
	type ColumnId = 'morning' | 'focus' | 'wellness' | 'home';

	type Habit = {
		id: string;
		title: string;
		points: number;
		dueAt: Date;
		repeat: Recurrence;
		column: ColumnId;
		done: boolean;
	};

	type Reward = {
		id: string;
		title: string;
		cost: number;
		image: string;
		description: string;
		link: string;
	};

	type PointTransaction = {
		id: string;
		label: string;
		amount: number;
		sourceType: 'habit' | 'reward' | 'adjustment';
		createdAt: Date;
	};

	let { data, form } = $props();
	let activeSection = $state<'habits' | 'rewards'>('habits');

	$effect(() => {
		if (form?.section === 'habits' || form?.section === 'rewards') {
			activeSection = form.section;
		}
	});

	const columns: { id: ColumnId; title: string; icon: string; tone: string }[] = [
		{ id: 'morning', title: 'Morning', icon: 'sun', tone: 'bg-[#e8d8a8]' },
		{ id: 'focus', title: 'Focus', icon: 'spark', tone: 'bg-[#c8d5b1]' },
		{ id: 'wellness', title: 'Wellness', icon: 'heart', tone: 'bg-[#d9c6b0]' },
		{ id: 'home', title: 'Home', icon: 'home', tone: 'bg-[#c7d4cf]' }
	];

	let habits = $derived((data.habits ?? []) as Habit[]);
	let rewards = $derived((data.rewards ?? []) as Reward[]);
	let transactions = $derived((data.transactions ?? []) as PointTransaction[]);
	let overdueCount = $derived(habits.filter((habit) => !habit.done && isOverdue(habit.dueAt)).length);
	let availableRewards = $derived(rewards.filter((reward) => data.points >= reward.cost).length);
	let possibleToday = $derived(
		habits
			.filter((habit) => !habit.done && sameDayOrEarlier(habit.dueAt))
			.reduce((sum, habit) => sum + habit.points, 0)
	);
	let nextHabit = $derived(
		habits
			.filter((habit) => !habit.done)
			.sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))[0]
	);

	function iconPath(icon: string) {
		if (icon === 'sun') return 'M12 2v2m0 16v2m10-10h-2M4 12H2m17.07-7.07-1.41 1.41M6.34 17.66l-1.41 1.41m14.14 0-1.41-1.41M6.34 6.34 4.93 4.93M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z';
		if (icon === 'heart') return 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z';
		if (icon === 'home') return 'M3 10.5 12 3l9 7.5M5 10v10h14V10M9 20v-6h6v6';
		return 'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Zm7 13 .9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15Z';
	}

	function formatDue(date: Date) {
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(date));
	}

	function formatShortDate(date: Date) {
		return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
	}

	function formatTime(date: Date) {
		return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(date));
	}

	function dateInputValue(date: Date) {
		const value = new Date(date);
		const pad = (part: number) => String(part).padStart(2, '0');
		return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
	}

	function localInputDefault() {
		const date = new Date();
		date.setHours(date.getHours() + 1);
		date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
		return dateInputValue(date);
	}

	function isOverdue(date: Date) {
		return +new Date(date) < Date.now();
	}

	function sameDayOrEarlier(date: Date) {
		const due = new Date(date);
		const today = new Date();
		today.setHours(23, 59, 59, 999);
		return due <= today;
	}
</script>

<svelte:head>
	<title>Earnest</title>
	<meta name="description" content="Habit tracking and reward spending backed by SQLite." />
</svelte:head>

<main class="min-h-screen bg-[#e7dfcf] text-[#28241e]">
	<header class="sticky top-0 z-30 border-b border-[#cdbf9f] bg-[#e7dfcf]/90 backdrop-blur-xl">
		<div class="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<div class="flex min-w-0 items-center gap-3">
				<div class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#43553b] text-[#fffaf0] shadow-sm">
					<svg aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
						<path d="M12 3c3 3 6 5 6 9a6 6 0 0 1-12 0c0-4 3-6 6-9Z" />
						<path d="M12 21c0-4 1.5-7 4.5-9" />
					</svg>
				</div>
				<div class="min-w-0">
					<p class="text-xs font-black uppercase tracking-[0.2em] text-[#7a6b56]">Earnest</p>
					<h1 class="truncate text-xl font-black sm:text-2xl">Habit ledger</h1>
				</div>
			</div>

			<div class="flex items-center gap-2 sm:gap-4">
				{#if data.user}
					<form method="POST" action="?/resetDemo" class="hidden sm:block">
						<button class="soft-button" type="submit">Reset</button>
					</form>
				{/if}
				<section aria-label="Point balance" class="balance-card">
					<span class="text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#766850]">Balance</span>
					<strong class="text-3xl font-black tabular-nums leading-none text-[#43553b] sm:text-4xl">{data.points}</strong>
				</section>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:py-7">
		{#if !data.user}
			<section class="grid min-h-[calc(100vh-8rem)] gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
				<div class="max-w-4xl">
					<div class="mb-8 grid max-w-2xl grid-cols-3 gap-3">
						<div class="metric-tile"><strong>SQLite</strong><span>Private data</span></div>
						<div class="metric-tile"><strong>-100/+100</strong><span>Habit values</span></div>
						<div class="metric-tile"><strong>Rewards</strong><span>Spend points</span></div>
					</div>
					<p class="eyebrow">Habits with a reason to finish</p>
					<h2 class="mt-3 max-w-3xl text-5xl font-black leading-[0.98] tracking-normal text-[#29241d] sm:text-7xl">
						Build the day, then cash it in.
					</h2>
					<p class="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[#665b49]">
						Track recurring tasks, keep a visible point balance, and turn consistent effort into rewards you actually want.
					</p>
				</div>

				<aside class="panel p-5">
					{#if form?.authError}
						<p class="message error">{form.authError}</p>
					{:else if form?.authMessage}
						<p class="message">{form.authMessage}</p>
					{/if}

					<form class="grid gap-3" method="POST" action="?/requestMagicLink">
						<div>
							<p class="eyebrow">Passwordless</p>
							<h2 class="mt-1 text-2xl font-black">Email magic link</h2>
						</div>
						<input class="field" name="name" placeholder="Name for new accounts" />
						<input class="field" name="email" placeholder="Email" type="email" required />
						<button class="primary-button" type="submit">Send magic link</button>
					</form>

					{#if form?.devMagicLink}
						<a class="mt-3 block rounded-lg border border-[#b98b73] bg-[#f7e0d4] px-3 py-3 text-sm font-black text-[#7a3f31]" href={form.devMagicLink}>
							Open development magic link
						</a>
					{/if}

					<form class="mt-3" method="POST" action="?/google">
						<button class="secondary-button w-full" type="submit">Continue with Google</button>
					</form>

					<details class="mt-5 border-t border-[#d4c7ad] pt-4">
						<summary class="cursor-pointer text-sm font-black text-[#5d523f]">Use email and password</summary>
						<div class="mt-4 grid gap-5">
							<form class="grid gap-3" method="POST" action="?/signIn">
								<input class="field" name="email" placeholder="Email" type="email" required />
								<input class="field" name="password" placeholder="Password" type="password" required />
								<button class="secondary-button" type="submit">Sign in</button>
							</form>
							<form class="grid gap-3" method="POST" action="?/signUp">
								<input class="field" name="name" placeholder="Name" required />
								<input class="field" name="email" placeholder="Email" type="email" required />
								<input class="field" minlength="8" name="password" placeholder="Password" type="password" required />
								<button class="secondary-button" type="submit">Create account</button>
							</form>
						</div>
					</details>
				</aside>
			</section>
		{:else}
			<div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
				<aside class="space-y-4">
					<section class="panel p-4">
						<p class="eyebrow">Today</p>
						<div class="mt-4 grid gap-3">
							<div class="stat-row"><span>Completed</span><strong>{data.completedToday}</strong></div>
							<div class="stat-row"><span>Earned</span><strong>{data.earnedToday > 0 ? '+' : ''}{data.earnedToday}</strong></div>
							<div class="stat-row"><span>Overdue</span><strong class:text-[#9a4938]={overdueCount > 0}>{overdueCount}</strong></div>
							<div class="stat-row"><span>On deck</span><strong>{possibleToday > 0 ? '+' : ''}{possibleToday}</strong></div>
						</div>
					</section>

					<section class="panel p-4">
						<p class="eyebrow">Navigation</p>
						<div class="mt-4 grid gap-2">
							<button class:active-tab={activeSection === 'habits'} class="nav-button" type="button" onclick={() => (activeSection = 'habits')}>
								<span>Habits</span><strong>{habits.length}</strong>
							</button>
							<button class:active-tab={activeSection === 'rewards'} class="nav-button" type="button" onclick={() => (activeSection = 'rewards')}>
								<span>Rewards</span><strong>{availableRewards}/{rewards.length}</strong>
							</button>
						</div>
					</section>

					<section class="panel p-4">
						<div class="flex items-center justify-between gap-3">
							<p class="eyebrow">Activity</p>
							<form method="POST" action="?/signOut">
								<button class="text-sm font-black text-[#8a4838]" type="submit">Sign out</button>
							</form>
						</div>
						<div class="mt-4 grid gap-2">
							{#each transactions as tx}
								<div class="activity-row">
									<div class="min-w-0">
										<p class="truncate text-sm font-black">{tx.label}</p>
										<p class="text-xs font-bold text-[#776b56]">{formatShortDate(tx.createdAt)} · {tx.sourceType}</p>
									</div>
									<strong class:negative={tx.amount < 0}>{tx.amount > 0 ? '+' : ''}{tx.amount}</strong>
								</div>
							{:else}
								<p class="empty-note">No point activity yet.</p>
							{/each}
						</div>
					</section>
				</aside>

				<section class="min-w-0">
					{#if form?.appError || form?.appMessage}
						<p class:error={form?.appError} class="message mb-4">{form.appError ?? form.appMessage}</p>
					{/if}

					{#if activeSection === 'habits'}
						<div class="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
							<div class="panel overflow-hidden p-5">
								<p class="eyebrow">Next task</p>
								{#if nextHabit}
									<div class="mt-4 flex flex-wrap items-end justify-between gap-4">
										<div>
											<h2 class="text-3xl font-black">{nextHabit.title}</h2>
											<p class="mt-2 font-bold text-[#665b49]">{formatDue(nextHabit.dueAt)} · {nextHabit.repeat}</p>
										</div>
										<form method="POST" action="?/completeHabit">
											<input type="hidden" name="id" value={nextHabit.id} />
											<button class="primary-button" type="submit">Complete +{nextHabit.points}</button>
										</form>
									</div>
								{:else}
									<p class="mt-4 text-lg font-bold text-[#665b49]">No open habits.</p>
								{/if}
							</div>

							<form class="panel grid gap-3 p-5" method="POST" action="?/addHabit">
								<p class="eyebrow">New habit</p>
								<input class="field" name="title" placeholder="Task title" required />
								<div class="grid grid-cols-2 gap-3">
									<input class="field" max="100" min="-100" name="points" type="number" value="15" />
									<select class="field" name="repeat">
										<option value="once">Once</option>
										<option value="daily">Daily</option>
										<option value="weekly">Weekly</option>
										<option value="monthly">Monthly</option>
									</select>
								</div>
								<input class="field" name="dueAt" type="datetime-local" value={localInputDefault()} required />
								<select class="field" name="column">
									{#each columns as column}
										<option value={column.id}>{column.title}</option>
									{/each}
								</select>
								<button class="primary-button" type="submit">Add habit</button>
							</form>
						</div>

						<div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
							{#each columns as column}
								<section class="board-column">
									<div class="mb-3 flex items-center justify-between gap-3">
										<div class="flex min-w-0 items-center gap-2">
											<span class={`icon-badge ${column.tone}`}>
												<svg aria-hidden="true" class="h-4 w-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24">
													<path d={iconPath(column.icon)} />
												</svg>
											</span>
											<h3 class="truncate text-lg font-black">{column.title}</h3>
										</div>
										<span class="count-pill">{habits.filter((habit) => habit.column === column.id).length}</span>
									</div>

									<div class="grid gap-3">
										{#each habits.filter((habit) => habit.column === column.id) as habit (habit.id)}
											<article class:done={habit.done} class:overdue={isOverdue(habit.dueAt) && !habit.done} class="task-card">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<h4 class="break-words text-base font-black leading-snug">{habit.title}</h4>
														<p class="mt-1 text-sm font-bold text-[#776b56]">{formatDue(habit.dueAt)}</p>
													</div>
													<span class:negative={habit.points < 0} class="point-chip">{habit.points > 0 ? '+' : ''}{habit.points}</span>
												</div>

												<div class="mt-3 flex flex-wrap items-center gap-2">
													<form method="POST" action="?/completeHabit">
														<input type="hidden" name="id" value={habit.id} />
														<button class="small-primary" disabled={habit.done} type="submit">{habit.done ? 'Done' : 'Complete'}</button>
													</form>
													<span class="meta-pill">{habit.repeat}</span>
													<span class="meta-pill">{formatTime(habit.dueAt)}</span>
												</div>

												<details class="mt-3">
													<summary class="cursor-pointer text-sm font-black text-[#675842]">Edit</summary>
													<form class="mt-3 grid gap-2" method="POST" action="?/updateHabit">
														<input type="hidden" name="id" value={habit.id} />
														<input class="field compact" name="title" value={habit.title} required />
														<div class="grid grid-cols-2 gap-2">
															<input class="field compact" max="100" min="-100" name="points" type="number" value={habit.points} />
															<select class="field compact" name="repeat">
																<option selected={habit.repeat === 'once'} value="once">Once</option>
																<option selected={habit.repeat === 'daily'} value="daily">Daily</option>
																<option selected={habit.repeat === 'weekly'} value="weekly">Weekly</option>
																<option selected={habit.repeat === 'monthly'} value="monthly">Monthly</option>
															</select>
														</div>
														<input class="field compact" name="dueAt" type="datetime-local" value={dateInputValue(habit.dueAt)} required />
														<select class="field compact" name="column">
															{#each columns as moveColumn}
																<option selected={habit.column === moveColumn.id} value={moveColumn.id}>{moveColumn.title}</option>
															{/each}
														</select>
														<div class="flex gap-2">
															<button class="small-secondary" type="submit">Save</button>
															<button class="small-danger" formaction="?/deleteHabit" type="submit">Delete</button>
														</div>
													</form>
												</details>
											</article>
										{:else}
											<p class="empty-note">No tasks here.</p>
										{/each}
									</div>
								</section>
							{/each}
						</div>
					{:else}
						<div class="mb-5 grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
							<form class="panel grid gap-3 p-5" method="POST" action="?/addReward">
								<p class="eyebrow">New reward</p>
								<input class="field" name="title" placeholder="Reward title" required />
								<input class="field" min="1" name="cost" type="number" value="100" />
								<input class="field" name="image" placeholder="Photo URL" />
								<textarea class="field min-h-24" name="description" placeholder="Description"></textarea>
								<input class="field" name="link" placeholder="Website link" />
								<button class="primary-button" type="submit">Add reward</button>
							</form>

							<section class="panel p-5">
								<div class="flex flex-wrap items-start justify-between gap-4">
									<div>
										<p class="eyebrow">Reward shop</p>
										<h2 class="mt-1 text-3xl font-black">Spend the balance carefully</h2>
									</div>
									<div class="rounded-lg bg-[#d9e0cc] px-4 py-3 text-right">
										<p class="text-xs font-black uppercase tracking-[0.14em] text-[#677158]">Affordable</p>
										<strong class="text-3xl font-black text-[#43553b]">{availableRewards}</strong>
									</div>
								</div>
								<div class="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
									{#each data.purchases ?? [] as purchase}
										<div class="purchase-row">
											<span>{purchase.title}</span>
											<strong>-{purchase.cost}</strong>
										</div>
									{:else}
										<p class="empty-note">No purchases yet.</p>
									{/each}
								</div>
							</section>
						</div>

						<section class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
							{#each rewards as reward (reward.id)}
								<article class="reward-card">
									<img class="h-52 w-full object-cover" src={reward.image} alt="" />
									<div class="grid gap-4 p-4">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<h3 class="break-words text-xl font-black">{reward.title}</h3>
												<p class="mt-2 text-sm font-semibold leading-6 text-[#665b49]">{reward.description}</p>
											</div>
											<span class="cost-chip">{reward.cost}</span>
										</div>

										<div class="flex flex-wrap items-center gap-2">
											<form method="POST" action="?/buyReward">
												<input type="hidden" name="id" value={reward.id} />
												<button class="small-primary" disabled={data.points < reward.cost} type="submit">Buy</button>
											</form>
											{#if reward.link}
												<a class="small-secondary" href={reward.link} rel="noreferrer" target="_blank">Open</a>
											{/if}
											{#if data.points < reward.cost}
												<span class="text-sm font-black text-[#9a4938]">{reward.cost - data.points} short</span>
											{/if}
										</div>

										<details>
											<summary class="cursor-pointer text-sm font-black text-[#675842]">Edit reward</summary>
											<form class="mt-3 grid gap-2" method="POST" action="?/updateReward">
												<input type="hidden" name="id" value={reward.id} />
												<input class="field compact" name="title" value={reward.title} required />
												<input class="field compact" min="1" name="cost" type="number" value={reward.cost} />
												<input class="field compact" name="image" value={reward.image} />
												<textarea class="field compact min-h-20" name="description">{reward.description}</textarea>
												<input class="field compact" name="link" value={reward.link} />
												<div class="flex gap-2">
													<button class="small-secondary" type="submit">Save</button>
													<button class="small-danger" formaction="?/deleteReward" type="submit">Delete</button>
												</div>
											</form>
										</details>
									</div>
								</article>
							{/each}
						</section>
					{/if}
				</section>
			</div>
		{/if}
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family:
			Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		background: #e7dfcf;
	}

	button,
	input,
	select,
	textarea {
		font: inherit;
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
	}

	.panel,
	.board-column,
	.task-card,
	.reward-card {
		border: 1px solid #cbbd9e;
		background: #f8f1e4;
		box-shadow: 0 14px 28px rgb(54 44 30 / 0.07);
	}

	.panel,
	.board-column,
	.reward-card {
		border-radius: 8px;
	}

	.balance-card {
		display: grid;
		min-width: 108px;
		gap: 0.2rem;
		border-radius: 8px;
		border: 1px solid #cbbd9e;
		background: #fbf5e9;
		padding: 0.55rem 0.85rem;
		text-align: right;
		box-shadow: 0 10px 20px rgb(54 44 30 / 0.08);
	}

	.eyebrow {
		font-size: 0.72rem;
		font-weight: 900;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #786951;
	}

	.field {
		width: 100%;
		border-radius: 7px;
		border: 1px solid #bdae8e;
		background: rgb(255 252 245 / 0.86);
		padding: 0.78rem 0.9rem;
		font-weight: 750;
		color: #2d281f;
	}

	.field.compact {
		padding: 0.55rem 0.65rem;
		font-size: 0.9rem;
	}

	.primary-button,
	.secondary-button,
	.soft-button,
	.small-primary,
	.small-secondary,
	.small-danger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 7px;
		font-weight: 900;
		transition:
			background-color 140ms ease,
			transform 140ms ease,
			opacity 140ms ease;
	}

	.primary-button,
	.secondary-button,
	.soft-button {
		padding: 0.82rem 1rem;
	}

	.primary-button,
	.small-primary {
		background: #43553b;
		color: #fffaf0;
	}

	.primary-button:hover,
	.small-primary:hover {
		background: #35452f;
	}

	.secondary-button,
	.soft-button,
	.small-secondary {
		border: 1px solid #bdae8e;
		background: #fff8eb;
		color: #3a3227;
	}

	.secondary-button:hover,
	.soft-button:hover,
	.small-secondary:hover {
		background: #efe3cf;
	}

	.small-primary,
	.small-secondary,
	.small-danger {
		min-height: 2.1rem;
		padding: 0.45rem 0.7rem;
		font-size: 0.86rem;
	}

	.small-danger {
		background: #f0d5c9;
		color: #8a3f31;
	}

	.small-primary:disabled {
		background: #a8ad9c;
		opacity: 0.85;
	}

	.metric-tile,
	.stat-row,
	.activity-row,
	.purchase-row {
		border-radius: 8px;
		background: rgb(255 250 240 / 0.68);
		border: 1px solid #d5c7aa;
	}

	.metric-tile {
		display: grid;
		gap: 0.25rem;
		padding: 0.85rem;
	}

	.metric-tile strong,
	.stat-row strong {
		font-weight: 950;
	}

	.metric-tile span,
	.stat-row span {
		font-size: 0.82rem;
		font-weight: 800;
		color: #746752;
	}

	.stat-row,
	.activity-row,
	.purchase-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.8rem;
	}

	.activity-row strong,
	.purchase-row strong {
		color: #43553b;
	}

	.activity-row strong.negative {
		color: #9a4938;
	}

	.nav-button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-radius: 7px;
		padding: 0.8rem 0.9rem;
		font-weight: 950;
		color: #4a4133;
	}

	.nav-button.active-tab {
		background: #43553b;
		color: #fffaf0;
	}

	.board-column {
		min-height: 26rem;
		background: #eee4d2;
		padding: 0.85rem;
	}

	.icon-badge {
		display: grid;
		height: 2rem;
		width: 2rem;
		place-items: center;
		border-radius: 7px;
		color: #312b22;
	}

	.count-pill,
	.meta-pill,
	.point-chip,
	.cost-chip {
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 950;
		white-space: nowrap;
	}

	.count-pill,
	.meta-pill {
		background: #fbf5e9;
		color: #6a5d49;
		padding: 0.32rem 0.58rem;
	}

	.task-card {
		border-radius: 8px;
		background: #fffaf0;
		padding: 0.9rem;
	}

	.task-card.overdue {
		border-color: #c9856f;
		background: #fff1e9;
	}

	.task-card.done {
		opacity: 0.68;
	}

	.point-chip,
	.cost-chip {
		background: #d8e0cc;
		color: #43553b;
		padding: 0.35rem 0.65rem;
	}

	.point-chip.negative {
		background: #edd1c6;
		color: #9a4938;
	}

	.cost-chip {
		background: #e3d3b7;
		color: #4a3c2a;
	}

	.reward-card {
		overflow: hidden;
		background: #fffaf0;
	}

	.message {
		border-radius: 8px;
		border: 1px solid #b9c49e;
		background: #dfe8cf;
		padding: 0.8rem 0.9rem;
		font-weight: 900;
		color: #405335;
	}

	.message.error,
	.message:error {
		border-color: #d0a28e;
		background: #f0d5c9;
		color: #8a3f31;
	}

	.empty-note {
		border-radius: 8px;
		border: 1px dashed #c4b596;
		padding: 1rem;
		text-align: center;
		font-size: 0.9rem;
		font-weight: 850;
		color: #796c56;
	}
</style>
