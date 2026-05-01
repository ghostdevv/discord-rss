import { join, resolve } from '@std/path';
import * as v from 'valibot';

const feedSchema = v.object({
	url: v.pipe(v.string(), v.url(), v.description('The RSS/Atom feed URL to check')),
	imageMode: v.pipe(
		v.optional(v.picklist(['none', 'html']), 'none'),
		v.description(
			'The HTML mode will attempt to parse and attach the first image tag found in the RSS feed to the webhook, if available. The none mode will do nothing.',
		),
	),
});

export type Feed = v.InferOutput<typeof feedSchema>;

const rawConfigSchema = v.object({
	feeds: v.pipe(
		v.array(v.union([v.pipe(v.string(), v.url()), feedSchema])),
		v.minLength(1),
		v.description(
			'The RSS/Atom feed(s) to check, can be a URL directory or an object for per-feed configuration.',
		),
	),
	webhooks: v.pipe(
		v.array(v.pipe(v.string(), v.url())),
		v.minLength(1),
		v.description('The webhook(s) to send the feed(s) to'),
	),
	healthCheck: v.pipe(
		v.optional(
			v.object({
				endpoint: v.pipe(v.string(), v.url(), v.description('The heartbeat URL to call')),
				interval: v.pipe(
					v.number(),
					v.minValue(1),
					v.description('How often (in seconds) to call the heartbeat URL'),
				),
				method: v.pipe(v.string(), v.description('The HTTP method to use (GET/POST/etc)')),
				headers: v.pipe(
					v.optional(v.record(v.string(), v.string())),
					v.description('A map of the headers to send with the heartbeat request'),
				),
			}),
		),
		v.description(
			'Optional health check endpoint to call every N seconds, so you can monitor the script',
		),
	),
});

type RawConfig = v.InferOutput<typeof rawConfigSchema>;
export type Config = Omit<RawConfig, 'feeds'> & { feeds: Feed[] };

export async function initConfig(): Promise<Config> {
	const rawConfigData = await Deno.readTextFile(resolve('./config.json'));
	const rawConfig = await v.parseAsync(rawConfigSchema, JSON.parse(rawConfigData));

	return {
		feeds: rawConfig.feeds.map((feed) =>
			typeof feed === 'string' ? { url: feed, imageMode: 'none' } : feed
		),
		webhooks: rawConfig.webhooks,
		healthCheck: rawConfig.healthCheck,
	};
}

export const config = await initConfig();

if (import.meta.main) {
	const { toJsonSchema } = await import('@valibot/to-json-schema');

	const schema = toJsonSchema(rawConfigSchema, { target: 'draft-2020-12' });

	await Deno.writeTextFile(
		join(import.meta.dirname!, '../config.schema.json'),
		JSON.stringify(schema, null, 2),
	);
}
