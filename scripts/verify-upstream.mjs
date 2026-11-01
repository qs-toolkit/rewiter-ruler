import { readApps, sha256 } from './build.mjs';
import { execFileSync } from 'node:child_process';
const dependencies = new Map((await readApps()).flatMap(app => app.dependencies.map(item => [item.url, item])));
for (const dependency of dependencies.values()) {
  let bytes;
  if (process.argv.includes('--github-api')) {
    const source = new URL(dependency.url);
    if (source.hostname !== 'raw.githubusercontent.com') throw new Error('GitHub API transport requires a GitHub raw URL');
    const [owner, repository, ref, ...parts] = source.pathname.slice(1).split('/');
    const endpoint = 'repos/' + owner + '/' + repository + '/contents/' + parts.join('/') + '?ref=' + encodeURIComponent(ref);
    const content = execFileSync('gh', ['api', endpoint, '--jq', '.content'], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    bytes = Buffer.from(content, 'base64');
  } else {
    const response = await fetch(dependency.url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'QuietStart-Rules/1.0' } });
    if (!response.ok) throw new Error('Dependency HTTP ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length > 256 * 1024 || sha256(bytes) !== dependency.sha256) throw new Error('Upstream bytes changed; review before updating: ' + dependency.url);
  console.log('SHA-256 verified: ' + dependency.url);
}
