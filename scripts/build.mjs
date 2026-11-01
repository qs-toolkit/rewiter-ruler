import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const rawBase = 'https://raw.githubusercontent.com/qs-toolkit/rewiter-ruler/main/';
export const collectionName = '轻启规则合集';
export const collectionFile = 'QuietStart.plugin';
export const sha256 = text => createHash('sha256').update(text).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
function requireValue(value, message) { if (!value) throw new Error(message); }
function https(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash; }
  catch { return false; }
}
export function canonicalKey(rule) {
  if (rule.section === 'rule') return 'rule\n' + rule.text.toLowerCase();
  if (rule.section === 'rewrite') return 'rewrite\n' + rule.text.trim().split(/\s+/).join(' ');
  const match = rule.text.match(/^(http-response)\s+(\S+)\s+(.+)$/);
  requireValue(match, 'Only response scripts are currently supported');
  const options = match[3].split(/,\s*/).map(value => {
    const at = value.indexOf('=');
    requireValue(at > 0, 'Invalid script option');
    return [value.slice(0, at).trim().toLowerCase(), value.slice(at + 1).trim()];
  });
  const identity = new Map(options);
  identity.delete('tag');
  if (identity.get('max-size') === '-1' || identity.get('max-size') === '0') identity.delete('max-size');
  requireValue(identity.get('requires-body') === 'true', 'Response script must declare requires-body=true');
  return 'script\nhttp-response ' + match[2] + ' ' + [...identity].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => k + '=' + v).join(', ');
}
export function validateApp(app) {
  requireValue(app.schema === 1 && /^[a-z][a-z0-9-]*$/.test(app.id), 'Invalid app schema/id');
  requireValue(typeof app.name === 'string' && app.name && !/[\r\n]/.test(app.name), 'Invalid app name');
  requireValue(/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/.test(app.bundleName), 'Missing application scope');
  requireValue(/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(app.version), 'Invalid version');
  requireValue(Array.isArray(app.rules) && app.rules.length > 0 && app.rules.length <= 2048, 'Invalid rule count');
  requireValue(Array.isArray(app.dependencies) && Array.isArray(app.mitmHosts), 'Missing dependencies/MITM scope');
  const dependencies = new Map();
  for (const item of app.dependencies) {
    requireValue(https(item.url) && /^[a-f0-9]{64}$/.test(item.sha256) && item.policy === 'external-reference', 'Invalid dependency');
    requireValue(!dependencies.has(item.url), 'Duplicate dependency'); dependencies.set(item.url, item);
  }
  for (const host of app.mitmHosts) requireValue(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host), 'MITM hosts must be explicit names');
  requireValue(new Set(app.mitmHosts).size === app.mitmHosts.length, 'Duplicate MITM host');
  const ids = new Set(), keys = new Set(), used = new Set();
  for (const rule of app.rules) {
    requireValue(/^[a-z0-9-]+$/.test(rule.id) && !ids.has(rule.id), 'Invalid/duplicate rule id'); ids.add(rule.id);
    requireValue(['rule', 'script', 'rewrite'].includes(rule.section) && typeof rule.text === 'string' && !/[\r\n]/.test(rule.text), 'Invalid rule text/section');
    requireValue(rule.key === canonicalKey(rule) && !keys.has(rule.key), 'Changed/duplicate canonical selection identity'); keys.add(rule.key);
    requireValue(Array.isArray(rule.origins) && rule.origins.length > 0 && rule.origins.every(origin => https(origin.url) && Number.isInteger(origin.line) && origin.line > 0), 'Missing rule provenance');
    if (rule.section === 'rule') requireValue(/^DOMAIN(?:-SUFFIX)?,[a-z0-9.-]+,REJECT$/.test(rule.text), 'Only explicit domain rejection rules are supported');
    if (rule.section === 'script') {
      const url = rule.text.match(/script-path=([^,\s]+)/)?.[1];
      requireValue(dependencies.has(url), 'Script dependency must have a recorded SHA-256'); used.add(url);
      requireValue(app.mitmHosts.length > 0, 'HTTPS scripts require explicit MITM scope');
    }
  }
  requireValue(used.size === dependencies.size, 'Unused dependency');
  return app;
}
export function pluginFor(app) {
  validateApp(app);
  const lines = ['#!name=' + app.name, '#!desc=' + app.description, '#!author=qs-toolkit', '#!version=' + app.version,
    '# Generated from apps/' + app.id + '/rules.json; edit the manifest, then npm run build.',
    '# Application binding is enforced by QuietStart, not by this plugin format.', ''];
  for (const [section, title] of [['rule', 'Rule'], ['rewrite', 'Rewrite'], ['script', 'Script']]) {
    const rules = app.rules.filter(rule => rule.section === section);
    if (rules.length) lines.push('[' + title + ']', ...rules.map(rule => rule.text), '');
  }
  if (app.mitmHosts.length) lines.push('[MITM]', 'hostname = ' + app.mitmHosts.join(', '), '');
  return lines.join('\n');
}
export function collectionFor(apps) {
  const ordered = [...apps].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  ordered.forEach(validateApp);
  requireValue(ordered.length > 0 && new Set(ordered.map(app => app.bundleName)).size === ordered.length, 'Collection needs distinct application bindings');
  const dependencies = new Map();
  for (const app of ordered) for (const item of app.dependencies) {
    requireValue(!dependencies.has(item.url) || dependencies.get(item.url).sha256 === item.sha256, 'Conflicting dependency bytes across applications');
    dependencies.set(item.url, item);
  }
  const version = sha256(json(ordered)).slice(0, 16);
  const lines = ['#!name=' + collectionName, '#!desc=轻启·分流器的多应用规则合集；各应用规则由 apps/ 统一构建。',
    '#!author=qs-toolkit', '#!version=' + version,
    '# Generated collection. Add apps/<id>/rules.json and rebuild to extend this feed.',
    '# Application membership: collection/manifest.json',
    '# QuietStart application-scoped batch import: collection/QuietStart.conf', ''];
  const emitted = new Set();
  for (const [section, title] of [['rule', 'Rule'], ['rewrite', 'Rewrite'], ['script', 'Script']]) {
    if (!ordered.some(app => app.rules.some(rule => rule.section === section))) continue;
    lines.push('[' + title + ']');
    for (const app of ordered) {
      const rules = app.rules.filter(rule => rule.section === section && !emitted.has(rule.key));
      if (!rules.length) continue;
      lines.push('# > ' + app.name + ' | ' + app.id + ' | ' + app.bundleName);
      for (const rule of rules) { lines.push(rule.text); emitted.add(rule.key); }
    }
    lines.push('');
  }
  const hosts = [...new Set(ordered.flatMap(app => app.mitmHosts))].sort();
  if (hosts.length) lines.push('[MITM]', 'hostname = ' + hosts.join(', '), '');
  return { text: lines.join('\n'), version, actionCount: emitted.size, dependencies: [...dependencies.values()] };
}
export async function readApps() {
  const entries = await readdir(path.join(root, 'apps'), { withFileTypes: true });
  const apps = [];
  for (const entry of entries.filter(value => value.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const app = validateApp(JSON.parse(await readFile(path.join(root, 'apps', entry.name, 'rules.json'), 'utf8')));
    requireValue(entry.name === app.id, 'App folder/id mismatch'); apps.push(app);
  }
  requireValue(new Set(apps.map(app => app.bundleName)).size === apps.length, 'Duplicate application binding');
  return apps;
}
export async function outputs() {
  const apps = await readApps(), files = new Map(), summaries = [];
  for (const app of apps) {
    const file = 'plugins/' + app.id + '.plugin', plugin = pluginFor(app);
    files.set(file, plugin);
    summaries.push({ id: app.id, name: app.name, bundleName: app.bundleName, version: app.version,
      ruleCount: app.rules.length, counts: Object.fromEntries(['rule', 'rewrite', 'script'].map(section => [section, app.rules.filter(rule => rule.section === section).length])),
      manifest: rawBase + 'apps/' + app.id + '/rules.json', subscription: rawBase + file, sha256: sha256(plugin), dependencies: app.dependencies });
  }
  const combined = collectionFor(apps);
  const collection = { name: collectionName, version: combined.version, appCount: apps.length, ruleCount: combined.actionCount,
    subscription: rawBase + collectionFile, sha256: sha256(combined.text),
    manifest: rawBase + 'collection/manifest.json', applicationImportConfig: rawBase + 'collection/QuietStart.conf' };
  files.set(collectionFile, combined.text);
  files.set('collection/manifest.json', json({ schema: 'quietstart-collection/v1', ...collection,
    dependencies: combined.dependencies, apps: summaries.map(app => ({ ...app, ruleKeys: apps.find(item => item.id === app.id).rules.map(rule => rule.key) })) }));
  files.set('collection/QuietStart.conf', '# ' + collectionName + '\n# Paste this configuration into QuietStart rule import; each plugin binds to its application.\n[Remote Plugin]\n' +
    summaries.map(app => app.subscription + ',enabled=true,tag=' + app.name).join('\n') + '\n');
  files.set('catalog/index.json', json({ schema: 'quietstart-rules/v1', repository: 'qs-toolkit/rewiter-ruler', collection, apps: summaries }));
  files.set('config/quietstart.json', json({ schema: 1, repository: 'https://github.com/qs-toolkit/rewiter-ruler', catalogUrl: rawBase + 'catalog/index.json',
    collection,
    importMethod: 'MITM → 规则管理 → 新增 → 粘贴 collection/QuietStart.conf 的完整内容 → 导入',
    applicationBinding: '按 #!name 自动匹配本机应用；导入后核对 bundleName；不作为全局规则使用。',
    updatePolicy: 'manual', subscriptions: summaries.map(app => ({ name: app.name, bundleName: app.bundleName, url: app.subscription })) }));
  files.set('config/subscriptions.txt', rawBase + collectionFile + '\n');
  files.set('config/application-subscriptions.txt', summaries.map(app => app.subscription).join('\n') + '\n');
  return files;
}
export async function build(check = false) {
  const files = await outputs();
  for (const [name, content] of files) {
    const target = path.join(root, name);
    if (check) requireValue(await readFile(target, 'utf8').catch(() => '') === content, 'Generated output is stale: ' + name);
    else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content); }
  }
  console.log((check ? 'Verified ' : 'Built ') + files.size + ' generated files');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build(process.argv.includes('--check'));
