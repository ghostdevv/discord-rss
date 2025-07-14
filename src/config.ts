import { join } from '@std/path';
import { z } from 'zod';

const feedSchema = z.object({
	url: z
		.url()
		.describe('The RSS/Atom feed URL to check'),
	imageMode: z
		.enum(['none', 'html'])
		.default('none')
		.describe(
			'The HTML mode will attempt to parse and attach the first image tag found in the RSS feed to the webhook, if available. The none mode will do nothing.',
		),
});

export type Feed = z.infer<typeof feedSchema>;

const rawConfigSchema = z.object({
	feeds: z
		.union([z.url().describe('The RSS/Atom feed URL to check'), feedSchema])
		.array()
		.min(1)
		.describe(
			'The RSS/Atom feed(s) to check, can be a URL directory or an object for per-feed configuration.',
		),
	webhooks: z
		.url()
		.array()
		.min(1)
		.describe('The webhook(s) to send the feed(s) to'),
	healthCheck: z
		.object({
			endpoint: z
				.url()
				.describe('The heartbeat URL to call'),
			interval: z
				.number()
				.min(1)
				.describe('How often (in seconds) to call the heartbeat URL'),
			method: z
				.string()
				.describe('The HTTP method to use (GET/POST/etc)'),
		})
		.optional()
		.describe(
			'Optional health check endpoint to call every N seconds, so you can monitor the script',
		),
});

type RawConfig = z.infer<typeof rawConfigSchema>;
export type Config = Omit<RawConfig, 'feeds'> & { feeds: Feed[] };

export async function initConfig(): Promise<Config> {
	const rawConfigData = await import('../config.json', { with: { type: 'json' } });
	const rawConfig = await rawConfigSchema.parseAsync(rawConfigData.default);

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
	const schema = z.toJSONSchema(rawConfigSchema.extend({ $schema: z.string().optional() }));

	await Deno.writeTextFile(
		join(import.meta.dirname!, '../config.schema.json'),
		JSON.stringify(schema, null, 2),
	);
}
