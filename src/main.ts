import { parseFeed } from 'https://deno.land/x/rss/mod.ts';
import config from '../config.json' with { type: 'json' };
import { retry } from '@std/async';

if (config.feeds.length == 0) {
    throw new Error('No feeds given in config');
}

if (config.webhooks.length == 0) {
    throw new Error('No webhooks given in config');
}

const kv = await Deno.openKv();

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

    // for (const entry of feed.entries) {

    // }
}

for (const url of config.feeds) {
    try {
        const feed = await fetch_feed(url);
        const ttl = Math.min(feed.ttl ?? 60, 60);

        console.log(`Found feed "${feed.title.value || url}", checking every ${ttl} minutes`);
        await check_feed(url);
        setInterval(() => check_feed(url), ttl * 60 * 1000);
    } catch (error) {
        console.log(`Failed to init feed "${url}"`, error);
    }
}
