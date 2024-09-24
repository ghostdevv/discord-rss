import { parseFeed } from '@mikaelporttila/rss';
import { ensureDir } from '@std/fs';
import { retry } from '@std/async';
import { join } from '@std/path';

interface Config {
    feeds: string[];
    webhooks: string[];
    healthCheck?: {
        endpoint: string;
        interval: number;
        method: string;
    };
}

const config = await import('../config.json', { with: { type: 'json' } }).then((mod) =>
    mod.default as Config
);

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

async function check_feed(url: string) {
    const feed = await fetch_feed(url);

    for (const entry of feed.entries) {
        const kv_key = [url, entry.id];
        if ((await kv.get(kv_key)).value) continue;

        console.log(`New entry (${entry.id}): ${entry.links[0]?.href}`);

        for (const webhook of config.webhooks) {
            // todo send 10 at once
            const res = await fetch(webhook, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [{
                        title: entry.title?.value || '¯\\_(ツ)_/¯',
                        description: `${entry.description?.value || ''}\n\n${
                            entry.links.map((link, index) =>
                                `[${link.title || `Link ${index + 1}`}](${link.href})`
                            )
                        }`,
                        author: {
                            name: feed.title.value ?? 'Someones RSS Feed',
                            url: feed.links[0],
                        },
                        timestamp: typeof feed.published != 'undefined'
                            ? new Date(feed.published).getTime()
                            : undefined,
                    }],
                }),
            });

            if (res.ok) {
                await kv.set(kv_key, true);
            } else {
                console.warn('Error processing feed item', await res.json());
            }
        }
    }
}

for (const url of config.feeds) {
    try {
        const cfg = await kv.get([url, 'config']);
        const feed = await fetch_feed(url);

        const ttl = Math.min(feed.ttl ?? 60, 60);
        const title = feed.title.value || url;

        console.log(`Found feed "${title}", checking every ${ttl} minutes`);

        if (!cfg.value) {
            console.log(`  ^ Feed has not been used before, updating store...`);

            for (const entry of feed.entries) {
                await kv.set([url, entry.id], true);
            }

            await kv.set([url, 'config'], { init_ts: Date.now() });

            console.log('  Done');
        }

        await check_feed(url);
        setInterval(() => check_feed(url), ttl * 60 * 1000);
    } catch (error) {
        console.log(`Failed to init feed "${url}"`, error);
    }
}

if (config.healthCheck) {
    const { endpoint, interval, method } = config.healthCheck;
    console.log(`Setup health check, calling every ${interval} seconds`);

    // deno-lint-ignore no-inner-declarations
    async function check() {
        console.log('Posting health check request');
        await fetch(endpoint, { method });
    }

    await check();
    setInterval(check, interval * 1000);
}
