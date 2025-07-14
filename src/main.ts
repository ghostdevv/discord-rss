import { parseFeed } from '@mikaelporttila/rss';
import { unescape } from '@std/html';
import { ensureDir } from '@std/fs';
import { retry } from '@std/async';
import * as cheerio from 'cheerio';
import { join } from '@std/path';

enum ImageMode {
	none,
	html,
}

interface Feed {
	url: string;
	imageMode: ImageMode;
}

interface Config {
	feeds: Feed[];
	webhooks: string[];
	healthCheck?: {
		endpoint: string;
		interval: number;
		method: string;
	};
}

const DEV = Deno.args.includes('--dev');

const config: Config = await import('../config.json', { with: { type: 'json' } }).then((mod) => {
	return {
		feeds: mod.default.feeds.map((feed) => {
			return (typeof feed == 'string')
				? {
					url: feed,
					imageMode: ImageMode.none,
				}
				: {
					url: feed.url,
					imageMode: { 'none': ImageMode.none, 'tag': ImageMode.html }[feed.imageMode] ||
						ImageMode.none,
				} as Feed;
		}),
		webhooks: mod.default.webhooks,
		healthCheck: mod.default.healthCheck || null,
	} as Config;
});

if (config.feeds.length == 0) {
	throw new Error('No feeds given in config');
}

if (config.webhooks.length == 0) {
	throw new Error('No webhooks given in config');
}

async function create_db() {
	const dir = join(import.meta.dirname!, '../.data');
	await ensureDir(dir);

	const kv = await Deno.openKv(join(dir, './db'));
	return kv;
}

const kv = await create_db();

async function fetch_feed(url: string) {
	return await retry(async () => {
		const res = await fetch(url);
		const data = await res.text();
		const feed = await parseFeed(data);

		return feed;
	}, {
		maxTimeout: 10000,
		minTimeout: 1000,
		maxAttempts: 3,
	});
}

async function check_feed(config_feed: Feed) {
	const feed = await fetch_feed(config_feed.url);

	for (const entry of feed.entries) {
		const kv_key = [config_feed.url, `${entry.id}`];
		if ((await kv.get(kv_key)).value) continue;

		console.log(`New entry (${entry.id}): ${entry.links[0]?.href}`);

		let image: null | string = null;
		if (config_feed.imageMode == ImageMode.html && entry.description?.value) {
			const $ = cheerio.load(unescape(entry.description.value));
			const image_src = $('img').first().prop('src');

			if (image_src && URL.parse(image_src)) {
				image = image_src;
			}
		}

		const webhook_body = {
			embeds: [{
				title: entry.title?.value || '¯\\_(ツ)_/¯',
				description: `${entry.description?.value || ''}\n\n${
					entry.links
						.filter((link) =>
							link.href && URL.parse(link.href)?.protocol.includes('http')
						)
						.map((link, index) =>
							`[${link.title || `Link ${index + 1}`}](${link.href})`
						)
				}`,
				image: image ? { url: image } : undefined,
				author: {
					name: feed.title.value ?? 'Someones RSS Feed',
					url: feed.links[0],
				},
				timestamp: typeof feed.published != 'undefined'
					? new Date(feed.published).toISOString()
					: undefined,
			}],
		};

		if (DEV) {
			console.log('Skipping sending webhooks in dev, here is the body', webhook_body);
		} else {
			for (const webhook of config.webhooks) {
				// todo send 10 at once
				const res = await fetch(webhook, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(webhook_body),
				});

				if (res.ok) {
					await kv.set(kv_key, true);
				} else {
					console.warn('Error processing feed item', await res.json());
				}
			}
		}
	}
}

for (const config_feed of config.feeds) {
	try {
		const cfg = await kv.get([config_feed.url, 'config']);
		const feed = await fetch_feed(config_feed.url);

		const ttl = Math.min(feed.ttl ?? 60, 60);
		const title = feed.title.value || config_feed.url;

		console.log(`Found feed "${title}", checking every ${ttl} minutes`);

		if (!cfg.value) {
			console.log(`  ^ Feed has not been used before, updating store...`);

			for (const entry of feed.entries) {
				await kv.set([config_feed.url, `${entry.id}`], true);
			}

			await kv.set([config_feed.url, 'config'], { init_ts: Date.now() });

			console.log('  Done');
		}

		await check_feed(config_feed);
		setInterval(() => check_feed(config_feed), ttl * 60 * 1000);
	} catch (error) {
		console.log(`Failed to init feed "${config_feed.url}"`, error);
	}
}

if (config.healthCheck) {
	const { endpoint, interval, method } = config.healthCheck;
	console.log(`Setup health check, calling every ${interval} seconds`);

	// deno-lint-ignore no-inner-declarations
	async function check() {
		try {
			await retry(() => fetch(endpoint, { method }), {
				maxTimeout: 2500,
				minTimeout: 1000,
				maxAttempts: 2,
			});
		} catch (error) {
			console.error(`Failed to ${method} the health check endpoint`, error);
		}
	}

	await check();
	setInterval(check, interval * 1000);
}
