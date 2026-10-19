import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { makeLine, toLineText, GENESIS } from 'dsh-attest-chain/lib/chain.js';
import { saveSnapshot } from 'dsh-mcp-test/lib/store.js';
import { aggregate, DEFAULT_PATHS } from '../lib/aggregate.js';
import { TrustBus } from '../lib/bus.js';
import {
  compactionEvent,
  egressDeniedEvent,
  prGateEvent,
  readFindingEvent,
} from '../lib/translate.js';

let passed = 0;
function ok(name) {
  passed++;
  console.log(`ok - ${name}`);
}

/* ---------- translate layer ---------- */

{
  const ev = readFindingEvent('INSTR_OVERRIDE', 'high', 'IGNORE PREVIOUS INSTRUCTIONS ...', 'read_file');
  assert.ok(ev.title.includes('quarantined'));
  assert.equal(ev.outcome, 'handled');
  assert.equal(ev.channel, 'read');
  ok('readFindingEvent translates to plain language, handled');
}

{
  const ev = prGateEvent({ time: '2026-10-19T00:00:00.000Z', tool: 'write', action: 'denied', path: 'config.ts', matchedBy: 'deny:config/*' });
  assert.ok(ev.title.includes('promised not to touch'));
  assert.ok(ev.detail.includes('config.ts'));
  const none = prGateEvent({ time: 't', tool: 'write', action: 'written', path: 'a.ts', contentSha256: 'ab' });
  assert.equal(none, null);
  const residue = prGateEvent({ time: 't', tool: 'write', action: 'written', path: 'a.ts', residueKinds: ['secrets'] });
  assert.equal(residue.outcome, 'attention');
  ok('prGateEvent: denied + residue surface, routine writes are silent');
}

{
  const ev = compactionEvent({ time: 't', constraints: 3, kept: 1, lost: [{ seq: 7, text: 'never push without review' }] });
  assert.equal(ev.outcome, 'attention');
  assert.ok(ev.title.includes('forgot 2') || ev.title.includes('forgot 1'), ev.title);
  const clean = compactionEvent({ time: 't', constraints: 3, kept: 3, lost: [] });
  assert.equal(clean.outcome, 'handled');
  ok('compactionEvent: loss is attention, survival is handled');
}

{
  const ev = egressDeniedEvent(['https://evil.example.com/x']);
  assert.ok(ev.title.includes('not on your allow list'));
  ok('egressDeniedEvent plain language');
}

/* ---------- bus ---------- */

{
  const dir = await mkdtemp(join(tmpdir(), 'trust-bus-'));
  const bus = new TrustBus(join(dir, 'events.jsonl'), 3);
  bus.report(readFindingEvent('CREDS_EXFIL', 'high', 'x', 'read_file'));
  bus.report(egressDeniedEvent(['https://a.example/']));
  bus.report(compactionEvent({ time: 't', constraints: 1, kept: 1, lost: [] }));
  bus.report(egressDeniedEvent(['https://b.example/'])); // over max: 3
  const list = bus.list();
  assert.equal(list.length, 3);
  const bus2 = new TrustBus(join(dir, 'events.jsonl'), 3);
  await new Promise((r) => setTimeout(r, 200)); // persistence is fire-and-forget
  await bus2.load();
  assert.equal(bus2.list().length, 3);
  await rm(dir, { recursive: true, force: true });
  ok('bus: ring buffer trims and persists across reload');
}

/* ---------- aggregate over a real sandbox ---------- */

{
  const dir = await mkdtemp(join(tmpdir(), 'trust-agg-'));

  // pr-gate ledger: one denied, one routine write
  await mkdir(join(dir, '.dsh-pr-gate'), { recursive: true });
  await writeFile(
    join(dir, '.dsh-pr-gate/session.jsonl'),
    JSON.stringify({ time: '2026-10-19T01:00:00.000Z', tool: 'write', action: 'denied', path: 'cfg.ts', matchedBy: 'deny:cfg/*' }) + '\n' +
      JSON.stringify({ time: '2026-10-19T02:00:00.000Z', tool: 'write', action: 'written', path: 'ok.ts', contentSha256: 'aa' }) + '\n'
  );

  // attest chain: 2 valid signed lines
  const keysDir = join(dir, '.dsh-attest-chain', 'keys');
  await mkdir(keysDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  await writeFile(join(keysDir, 'session_ed25519.pem'), privPem);
  await writeFile(join(keysDir, 'session_ed25519.pub.pem'), pubPem);
  const rec1 = { time: '2026-10-19T01:00:00.000Z', tool: 'bash', callId: 'c1', isError: false, contentSha256: 'a'.repeat(64) };
  const rec2 = { time: '2026-10-19T02:00:00.000Z', tool: 'write', callId: 'c2', isError: false, contentSha256: 'b'.repeat(64) };
  const l1 = makeLine(0, GENESIS, rec1, privPem);
  const l2 = makeLine(1, l1.digest, rec2, privPem);
  await mkdir(join(dir, '.dsh-attest-chain'), { recursive: true });
  await writeFile(join(dir, '.dsh-attest-chain/session.jsonl'), toLineText(l1) + '\n' + toLineText(l2) + '\n');

  // compaction ledger: one loss
  await mkdir(join(dir, '.dsh-compaction-guard'), { recursive: true });
  await writeFile(
    join(dir, '.dsh-compaction-guard/ledger.jsonl'),
    JSON.stringify({ time: '2026-10-19T03:00:00.000Z', sessionId: 's', compactionId: 'c', constraints: 2, kept: 1, lost: [{ seq: 4, text: 'do not modify config' }] }) + '\n'
  );

  // mcp baseline with one tool; current snapshot has an extra tool
  await mkdir(join(dir, '.dsh-mcp-test'), { recursive: true });
  await saveSnapshot(join(dir, '.dsh-mcp-test/baseline.json'), [{ name: 'read', description: 'read', parameters: {} }], '2026-10-19T00:00:00.000Z');
  const current = {
    time: '2026-10-19T04:00:00.000Z',
    tools: [
      { name: 'read', description: 'read', parameters: {} },
      { name: 'sneaky', description: 'new', parameters: {} },
    ],
  };

  const live = [readFindingEvent('HIDDEN_UNICODE', 'medium', 'zero width blob', 'web_fetch')];
  const summary = await aggregate({ cwd: dir, ...DEFAULT_PATHS }, live, current);

  // status: attention (compaction loss, tool surface drift)
  assert.equal(summary.status, 'attention');
  const byChannel = Object.fromEntries(summary.channels.map((c) => [c.channel, c]));
  assert.equal(byChannel.write.present, true);
  assert.equal(byChannel.write.count, 1); // denied only
  assert.equal(byChannel.custody.count, 1); // verified event
  assert.equal(byChannel.memory.count, 1);
  assert.equal(byChannel.toolsurface.count, 1);
  assert.equal(byChannel.read.count, 1);
  // events ordered newest first
  assert.ok(summary.events[0].time >= summary.events[summary.events.length - 1].time);
  // custody verified text mentions intact
  const custody = summary.events.find((e) => e.channel === 'custody');
  assert.ok(custody && custody.title.includes('intact'));
  // toolsurface names the added tool
  const ts = summary.events.find((e) => e.channel === 'toolsurface');
  assert.ok(ts && ts.detail.includes('sneaky'));

  // tamper: corrupt the ledger -> custody broken becomes attention
  await writeFile(join(dir, '.dsh-attest-chain/session.jsonl'), toLineText(l1) + '\n' + JSON.stringify({ ...JSON.parse(toLineText(l2)), digest: 'f'.repeat(64) }) + '\n');
  const s2 = await aggregate({ cwd: dir, ...DEFAULT_PATHS }, [], current);
  const custody2 = s2.events.find((e) => e.channel === 'custody');
  assert.ok(custody2 && custody2.outcome === 'attention' && custody2.title.includes('does not add up'));

  // empty workspace: everything ok
  const empty = await mkdtemp(join(tmpdir(), 'trust-empty-'));
  const s3 = await aggregate({ cwd: empty, ...DEFAULT_PATHS }, [], null);
  assert.equal(s3.status, 'ok');
  assert.ok(s3.channels.every((c) => c.present === false || ['read', 'egress', 'leave'].includes(c.channel)));

  await rm(dir, { recursive: true, force: true });
  await rm(empty, { recursive: true, force: true });
  ok('aggregate: ledgers + chain verify + drift + tamper detection + empty case');
}

/* ---------- i18n: every host titleKey must exist in both client dicts ---------- */

{
  const loaded = {};
  globalThis.window = { __ModuleLoader__: { load: (def) => { loaded.factory = def.factory; } } };
  const mod = {};
  const require = (name) => {
    if (name === 'react') {
      return { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {} };
    }
    throw new Error(`unexpected require: ${name}`);
  };
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../client/index.js', import.meta.url), 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  const clientExports = loaded.factory(require);
  const hasKey = clientExports._i18n.hasKey;

  // exercise every translate.ts factory and collect its title/detail keys
  const events = [
    readFindingEvent('INSTR_OVERRIDE', 'high', 'x', 'read'),
    readFindingEvent('system_prompt_exfil', 'high', 'x', 'read'),
    readFindingEvent('CREDS_EXFIL', 'high', 'x', 'read'),
    readFindingEvent('ENV_PROBE', 'high', 'x', 'read'),
    readFindingEvent('HIDDEN_UNICODE', 'medium', 'x', 'read'),
    readFindingEvent('AGENT_DIRECTIVE', 'high', 'x', 'read'),
    readFindingEvent('RULES_BACKDOOR', 'high', 'x', 'read'),
    readFindingEvent('RESOURCE_LURE', 'medium', 'x', 'read'),
    readFindingEvent('TOTALLY_UNKNOWN_RULE', 'high', 'x', 'read'),
    prGateEvent({ time: 't', tool: 'write', action: 'denied', path: 'a', matchedBy: 'r' }),
    prGateEvent({ time: 't', tool: 'write', action: 'written', path: 'a', residueKinds: ['secrets'] }),
    compactionEvent({ time: 't', constraints: 2, kept: 2, lost: [] }),
    compactionEvent({ time: 't', constraints: 2, kept: 0, lost: [{ seq: 1, text: 'x' }] }),
    egressDeniedEvent(['https://a.example/']),
  ];
  const keys = new Set(['status.ok', 'status.activity', 'status.attention', 'loading', 'noEvents', 'tabTitle', 'off']);
  for (const ev of events) {
    keys.add(ev.titleKey);
    if (ev.detailKey !== undefined) keys.add(ev.detailKey);
  }
  const missing = [...keys].filter((k) => !hasKey(k));
  assert.deepStrictEqual(missing, [], `missing i18n keys: ${missing.join(', ')}`);

  // zh rendering through the module's own t()
  const t = clientExports._i18n.t;
  clientExports._i18n.attachLocale({ getSnapshot: () => ({ active: 'zh-CN' }) });
  const zhTitle = t(events[0].titleKey, events[0].titleParams, events[0].title);
  assert.ok(zhTitle.includes('隔离'), zhTitle);
  clientExports._i18n.attachLocale({ getSnapshot: () => ({ active: 'en-US' }) });
  const enTitle = t(events[0].titleKey, events[0].titleParams, events[0].title);
  assert.ok(enTitle.includes('quarantined'), enTitle);

  ok('i18n: all host keys present in zh+en dicts; zh/en rendering live-switches');
}

console.log(`\n${passed} passed`);
