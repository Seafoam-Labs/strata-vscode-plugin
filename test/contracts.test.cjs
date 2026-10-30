const {test} = require('node:test');
const assert = require('node:assert/strict');
const {join} = require('node:path');
const {Cli, discoverExecutable} = require('../dist/strata/cli');
const {envelope, guardedRuntimeArgs, assignments, localEndpoint, endpointFor, supportedVersion} = require('../dist/strata/contracts');
const {terminalArguments} = require('../dist/strata/commands');
const {Operations} = require('../dist/services/operations');
const {message} = require('../dist/shared/messages');
const fake = join(__dirname, 'fixtures/fake-strata.cjs');

test('CLI handles JSON, argument boundaries, Unicode, and bounded output', async t => {
  const cli = new Cli(fake); t.after(() => cli.dispose());
  const args = ['path with spaces', '$(touch /tmp/strata-should-not-exist)', 'quote";echo no', '日本語'];
  assert.deepEqual((await cli.json(['test', ...args])).args, args);
  assert.equal((await cli.json(['test','partial'])).ok, true);
  await assert.rejects(cli.json(['test','malformed']), /malformed JSON/);
  await assert.rejects(cli.json(['test','bad-schema']), /Unsupported/);
  await assert.rejects(cli.json(['test','error']), /Profile rejected/);
  await assert.rejects(cli.json(['test','oversized']), /4 MiB/);
  assert.equal((await cli.json(['test','secret'], {env: {STRATA_VSCODE_CREDENTIAL:'test-secret'}})).echo, '[redacted]');
});
test('CLI timeout, cancellation, and missing binary are actionable', async t => {
  const cli = new Cli(fake); t.after(() => cli.dispose());
  await assert.rejects(cli.json(['test','delay'], {timeout:30}), /timed out/);
  const abort = new AbortController(); setTimeout(() => abort.abort(), 30);
  await assert.rejects(cli.json(['test','delay'], {signal:abort.signal}), /cancelled/);
  await assert.rejects(new Cli('/missing/strata').json(['status']), /Cannot execute/);
  await assert.rejects(discoverExecutable('./strata'), /absolute/);
});
test('schemas, arguments, endpoint selection and settings reject ambiguous input', () => {
  assert.throws(() => envelope('{"schema_version":2,"ok":true}'), /schema/);
  assert.deepEqual(assignments({parallel:'2',offline:'true'}), ['parallel=2','offline=true']);
  for (const value of [{parallel:'0'}, {parallel:'2.5'}, {queue_timeout:'Infinity'}, {evil:'--update'}, {offline:'yes'}]) assert.throws(() => assignments(value));
  assert.equal(localEndpoint('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080');
  for (const url of ['https://example.com', 'http://a:b@localhost', 'http://localhost/?key=x', 'file:///tmp', 'http://localhost/prefix']) assert.throws(() => localEndpoint(url));
  assert.equal(endpointFor({state:'ready'}, {plan:{effective:{host:'127.0.0.1',port:8080}}}, ''), '');
  assert.equal(endpointFor({state:'ready',api_url:'http://localhost:9999/v1'}, {}, ''), 'http://localhost:9999');
  assert.equal(supportedVersion('strata 9.0.0'), false);
  assert.throws(() => message({action:'deleteEverything',id:'x'}), /Invalid/);
  assert.throws(() => terminalArguments('rm -rf *', 'runtime'), /JSON/);
  assert.deepEqual(terminalArguments('["--profile","a b"]','runtime'), ['runtime','--profile','a b']);
});
test('runtime mutations require target and identity guards', () => {
  const owner = 'a'.repeat(32), instance = 'b'.repeat(32), revision = 'c'.repeat(16), sha = 'd'.repeat(64);
  const stop = guardedRuntimeArgs('stop','demo',{plan:{profile:'demo',owner_id:owner,instance_id:instance}});
  assert.equal(stop[stop.indexOf('--if-owner-id')+1], owner);
  assert.equal(stop[stop.indexOf('--if-instance-id')+1], instance);
  assert.throws(() => guardedRuntimeArgs('stop','demo',{plan:{profile:'other',owner_id:owner}}), /target/);
  assert.throws(() => guardedRuntimeArgs('restart','demo',{profile:'demo',current_owner_id:owner}), /instance/);
  const restart = guardedRuntimeArgs('restart','demo',{profile:'demo',current_owner_id:owner,current_instance_id:instance,candidate_profile_revision:revision,candidate_source_sha256:sha});
  assert.equal(restart[restart.indexOf('--if-source-sha256')+1],sha);
  assert.equal(restart.includes('--allow-source-switch'),false);
});
test('operation previews, cancellation, concurrency and changed start plans', async () => {
  const ops = new Operations(), calls = [];
  let n = 0;
  const runner = {json: async args => { calls.push(args); return {schema_version:1,ok:true,plan:{profile:'demo',launch:{revision:++n}}}; }};
  await assert.rejects(ops.runtime(runner,'start','demo',async () => true), /changed/);
  assert.equal(calls.every(x => x.includes('--plan')),true);
  calls.length = 0;
  await ops.runtime(runner,'start','demo',async () => false);
  assert.equal(calls.length,1);
  let release; const active = ops.exclusive(() => new Promise(r => release = r));
  await assert.rejects(ops.exclusive(async () => {}), /in progress/);
  release(); await active; assert.equal(ops.busy,false);
});
test('guarded lifecycle executes against fake CLI and stale owner fails', async t => {
  const cli = new Cli(fake); t.after(() => cli.dispose()); const ops = new Operations();
  for (const action of ['start','stop','restart','verify']) {
    const result = await ops.exclusive(() => ops.runtime(cli,action,'demo',async () => true));
    assert.equal(result.ok,true);
  }
  await assert.rejects(cli.json(['runtime','stop','--profile','demo','--if-owner-id','f'.repeat(32),'--json']), /owner_changed/);
});
