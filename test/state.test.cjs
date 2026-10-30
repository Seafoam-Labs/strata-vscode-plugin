const {test} = require('node:test');
const assert = require('node:assert/strict');
const {StateService, ActivityBuffer} = require('../dist/services/state');
const {Cli} = require('../dist/strata/cli');
const {join} = require('node:path');
const fixture = require('./fixtures/telemetry.json');
const config = async () => ({endpoint:'',interval:2,hiddenInterval:30});

test('activity buffer deduplicates, bounds retention, and marks gaps and instance changes', () => {
  const buffer = new ActivityBuffer();
  buffer.add(fixture.snapshot); buffer.add(fixture.snapshot); assert.equal(buffer.items.length,2);
  buffer.add({...fixture.snapshot,activity:{available:true,last_seq:5,events:[{seq:5,type:'completed'}]}});
  assert.equal(buffer.items[2].type,'gap');
  buffer.add({...fixture.snapshot,instance:{id:'new'},activity:{available:true,last_seq:1,events:[{seq:1}]}});
  assert.equal(buffer.items.at(-2).type,'instance_change');
  for(let i=2;i<400;i++) buffer.add({instance:{id:'new'},activity:{available:true,last_seq:i,events:[{seq:i}]}});
  assert.equal(buffer.items.length,300);
});
test('state refresh shows profiles, endpoint, metrics and deduplicated logs', async t => {
  const cli = new Cli(join(__dirname,'fixtures/fake-strata.cjs'));
  const service = new StateService(cli,'demo',config); t.after(() => { service.dispose(); cli.dispose(); });
  await service.detect(cli); await service.refresh(true);
  assert.equal(service.state.error,''); assert.equal(service.state.endpoint,'http://127.0.0.1:8080');
  assert.equal(service.state.snapshot.rates.answer_tok_s,42.5);
  await service.refresh(); assert.equal(service.state.logs.length,2);
  assert.equal(service.state.runtime.state,'stopped'); // Reachable telemetry never establishes ownership.
});
test('profile switch discards late snapshots and overlapping refreshes coalesce', async t => {
  let release, delayed = true, count = 0;
  const runner = {json: async args => {
    if(args[0] === 'profile' && args[1] === 'list') return {profiles:[{id:'old'},{id:'new'}]};
    if(args[0] === 'models') return {models:[]};
    if(args[0] === 'profile') return {profile:{id:args[2]},revision:'c'.repeat(16),plan:{effective:{host:'127.0.0.1',port:8080}}};
    if(args[0] === 'runtime') return {ok:true,state:'stopped'};
    count++;
    if(delayed) { delayed=false; await new Promise(r => release=r); }
    return fixture;
  }};
  const service = new StateService(runner,'old',config); service.state.supported=true; t.after(()=>service.dispose());
  const first=service.refresh(true), same=service.refresh(); assert.equal(first,same);
  while(!release) await new Promise(r=>setImmediate(r));
  const select=service.select('new'); release(); await first; await select;
  assert.equal(service.state.selected,'new'); assert.equal(service.state.profile.profile.id,'new'); assert.equal(count,2);
});
test('unreachable engine clears stale metrics and recovers on next refresh', async t => {
  let fail = false;
  const runner = {json: async args => {
    if(args[0]==='profile') return {profiles:[]};
    if(args[0]==='models') return {models:[]};
    if(fail) throw new Error('Cannot reach engine');
    return fixture;
  }};
  const service=new StateService(runner,'',async()=>({...await config(),endpoint:'http://localhost:8080'}));
  t.after(()=>service.dispose()); service.state.supported=true;
  await service.refresh(); assert.equal(service.state.connected,true);
  fail=true; await service.refresh(); assert.equal(service.state.connected,false); assert.deepEqual(service.state.snapshot,{});
  fail=false; await service.refresh(); assert.equal(service.state.error,'');
});
