import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readApps, validateApp, pluginFor, collectionFor, outputs, sha256 } from '../scripts/build.mjs';
const apps = await readApps(), iqiyi = apps.find(app => app.id === 'iqiyi');
const selection = JSON.parse(await readFile(new URL('./iqiyi-selection.json', import.meta.url), 'utf8'));
test('爱奇艺保留已确认的全部 16 个选择身份：3 域名、13 脚本', () => {
  assert.equal(iqiyi.bundleName, 'com.qiyi.video.hmy');
  assert.deepEqual(iqiyi.rules.map(rule => rule.key).sort(), selection.toSorted());
  assert.equal(iqiyi.rules.filter(rule => rule.section === 'rule').length, 3);
  assert.equal(iqiyi.rules.filter(rule => rule.section === 'script').length, 13);
  assert.equal(iqiyi.dependencies.length, 1);
});
test('拒绝重复身份、未记录脚本依赖、规则注入和全局 MITM', () => {
  for (const mutate of [
    app => app.rules.push(app.rules[0]),
    app => app.dependencies = [],
    app => app.rules[0].text += '\nDOMAIN,unrelated.example,REJECT',
    app => app.rules[0].key = 'silently-changed',
    app => app.mitmHosts.push('*'),
    app => app.bundleName = ''
  ]) { const app = structuredClone(iqiyi); mutate(app); assert.throws(() => validateApp(app)); }
});
test('生成物可重复构建；目录哈希和连接 URL 与订阅一致', async () => {
  const a = await outputs(), b = await outputs(); assert.deepEqual(a, b);
  const catalog = JSON.parse(a.get('catalog/index.json')), config = JSON.parse(a.get('config/quietstart.json'));
  assert.equal(catalog.apps[0].sha256, sha256(a.get('plugins/iqiyi.plugin')));
  assert.equal(config.subscriptions[0].url, catalog.apps[0].subscription);
  assert.equal(config.collection.subscription, catalog.collection.subscription);
  assert.equal(config.collection.sha256, sha256(a.get('QuietStart.plugin')));
  assert.equal(a.get('config/subscriptions.txt').trim(), config.collection.subscription);
  assert.match(pluginFor(iqiyi), /^#!name=爱奇艺\n/);
  const actions = pluginFor(iqiyi).split('\n').filter(line => /^(DOMAIN|http-response)/.test(line)); assert.equal(actions.length, 16);
});
test('合集加入第二个应用时保留两个应用的规则、成员和 MITM 范围', () => {
  const second = { schema: 1, id: 'second', name: 'Second App', bundleName: 'com.example.second', version: '2026.11.01.1',
    description: 'Test only', mitmHosts: ['api.second.example', iqiyi.mitmHosts[0]], dependencies: [],
    rules: [{ id: 'second-domain', section: 'rule', text: 'DOMAIN,ads.second.example,REJECT', key: 'rule\ndomain,ads.second.example,reject',
      origins: [{ url: 'https://rules.example/second', line: 1 }] }] };
  const result = collectionFor([iqiyi, second]);
  assert.equal(result.actionCount, 17);
  assert.match(result.text, /#!name=轻启规则合集/);
  assert.match(result.text, /# > 爱奇艺 \| iqiyi \| com\.qiyi\.video\.hmy/);
  assert.match(result.text, /# > Second App \| second \| com\.example\.second/);
  assert.match(result.text, /DOMAIN,ads.second.example,REJECT/);
  assert.equal(result.text.split('\n').filter(line => /^(DOMAIN|http-response)/.test(line)).length, 17);
  const hosts = result.text.match(/^hostname = (.+)$/m)[1].split(', ');
  assert.equal(hosts.filter(host => host === iqiyi.mitmHosts[0]).length, 1);
  assert.ok(hosts.includes('api.second.example'));
  assert.deepEqual(result, collectionFor([second, iqiyi]));
});
test('合集批量配置只含应用插件链接，成员记录保留全部选择身份', async () => {
  const files = await outputs(), config = files.get('collection/QuietStart.conf');
  assert.match(config, /\[Remote Plugin\]/);
  assert.ok(config.includes('plugins/iqiyi.plugin,enabled=true,tag=爱奇艺'));
  const manifest = JSON.parse(files.get('collection/manifest.json'));
  assert.equal(manifest.appCount, apps.length);
  assert.equal(manifest.ruleCount, 16);
  assert.deepEqual(manifest.apps.find(app => app.id === 'iqiyi').ruleKeys.toSorted(), selection.toSorted());
});
test('跨应用的同一脚本依赖不能声明不同的执行字节', () => {
  const other = structuredClone(iqiyi); other.id = 'other'; other.bundleName = 'com.example.other'; other.dependencies[0].sha256 = '0'.repeat(64);
  assert.throws(() => collectionFor([iqiyi, other]), /Conflicting dependency/);
});
