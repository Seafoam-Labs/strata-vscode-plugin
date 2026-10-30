#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const a = 'a'.repeat(32), b = 'b'.repeat(32), r = 'c'.repeat(16);
const send = (data, code = 0) => { process.stdout.write(JSON.stringify({schema_version: 1, ok: true, ...data}) + '\n'); process.exitCode = code; };
const fixture = (name) => JSON.parse(fs.readFileSync(require('node:path').join(__dirname, name + '.json'), 'utf8'));
if (process.env.STRATA_FAKE_TRACE) fs.appendFileSync(process.env.STRATA_FAKE_TRACE, JSON.stringify(args) + '\n');
if (args[0] === '--version') console.log('strata 0.2.8 (build 0.1.54; fake test executable)');
else if (args.includes('--help')) console.log('usage: strata ' + args[0] + ' [--help]\nFixture command help');
else if (args[0] === 'test') {
  if (args[1] === 'delay') setTimeout(() => send({}), 30000);
  else if (args[1] === 'malformed') console.log('{broken');
  else if (args[1] === 'partial') { process.stdout.write('{"schema_'); setTimeout(() => { console.log('version":1,"ok":true}'); }, 15); }
  else if (args[1] === 'bad-schema') send({schema_version: 99});
  else if (args[1] === 'error') send({ok: false, error: {message: 'Profile rejected'}}, 6);
  else if (args[1] === 'oversized') process.stdout.write('x'.repeat(5 * 1024 * 1024));
  else if (args[1] === 'secret') send({echo: process.env.STRATA_VSCODE_CREDENTIAL});
  else send({args: args.slice(1)});
} else if (args[0] === 'profile' && args[1] === 'list') send(fixture('profiles'));
else if (args[0] === 'profile' && ['show','validate'].includes(args[1])) send(fixture('profile'));
else if (args[0] === 'profile' && args[1] === 'history') send({history: [{revision: r, current: true}, {revision: 'd'.repeat(16)}]});
else if (args[0] === 'profile' && args[1] === 'set') send({profile: 'demo', revision: r, changes: {parallel: {before: 1, after: 2}}, would_save: true});
else if (args[0] === 'profile' && args[1] === 'use-config') send({profile:'demo', revision:r, source_config: {before:'/tmp/old.json', after:'/tmp/model.json'}});
else if (args[0] === 'models' && args[1] === 'list') send(fixture('models'));
else if (args[0] === 'models') send({model: {id: 'demo-model', source_config:'/tmp/model.json'}});
else if (args[0] === 'status') send(fixture('telemetry'));
else if (args[0] === 'runtime') {
  const profile = args[args.indexOf('--profile') + 1];
  if (args[1] === 'status') send({profile, state: 'stopped'});
  else if (args.includes('--plan')) {
    if (args[1] === 'restart') send({profile, current_owner_id:a, current_instance_id:b, candidate_profile_revision:r, candidate_source_sha256:'e'.repeat(64)});
    else send({plan: {profile, owner_id:a, instance_id:b, launch:{profile_revision:r}, source_sha256:'e'.repeat(64)}});
  } else if (args[1] !== 'start' && (!args.includes('--if-owner-id') || args[args.indexOf('--if-owner-id') + 1] !== a)) send({ok:false, error:'owner_changed'}, 6);
  else send({profile,state:args[1] === 'stop' ? 'stopped':'ready'});
} else if (args[0] === 'doctor') send({checks:[{name:'fixture',ok:true}]});
else send({});
