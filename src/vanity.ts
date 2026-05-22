import { styleText } from 'node:util';
import { DEV } from './config.ts';

function getVersion(): 'dev' | 'unknown' | string {
	const gitHash = Deno.env.get('GIT_HASH');
	if (gitHash) return `v${gitHash}`;
	if (DEV) return 'dev';
	return 'unknown';
}

export function printVanity() {
	// deno-fmt-ignore
	console.log(`
    _ _                   _
  _| |_|___ ___ ___ ___ _| |   ___ ___ ___
 | . | |_ -|  _| . |  _| . |  |  _|_ -|_ -|
 |___|_|___|___|___|_| |___|  |_| |___|___|

 ${styleText('blue', 'ghostdevv/discord-rss')} ${styleText('dim', '~')} ${styleText('green', getVersion())}
`);
}
