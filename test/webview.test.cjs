const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {emptyState} = require('../dist/services/state');
const profile = require('./fixtures/profile.json');
const telemetry = require('./fixtures/telemetry.json');

test('sidebar renders telemetry safely, preserves edited fields, and sends typed requests', t => {
  const dom = new JSDOM('<main id="app"></main>', {runScripts:'outside-only'}); t.after(()=>dom.window.close());
  const sent = []; let persisted = {};
  dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m),getState:()=>persisted,setState:s=>persisted=s});
  dom.window.eval(fs.readFileSync('media/main.js','utf8'));
  const state={...emptyState('demo'),supported:true,profiles:[{id:'demo'}],profile,runtime:{state:'stopped'},snapshot:telemetry.snapshot,connected:true,logs:[{seq:1,type:'<img src=x onerror=alert(1)>'}],logAvailable:true};
  const post=()=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'state',state}}));
  const $=id=>dom.window.document.getElementById(id);
  post(); assert.equal($('decode').textContent,'42.5'); assert.equal($('start').disabled,false);
  assert.equal($('logs').querySelector('img'),null);
  $('field-parallel').value='2'; post(); assert.equal($('field-parallel').value,'2');
  $('settingsForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1).value)),{parallel:'2'});
  $('start').click(); assert.equal(sent.at(-1).action,'start');
  $('pause').click(); state.logs.push({seq:2,type:'new'}); post(); assert.equal($('logs').children.length,1);
  $('pause').click(); assert.equal($('logs').children.length,2);
  state.snapshot={}; state.connected=false; post(); assert.equal($('decode').textContent,'Unavailable');
  $('logSearch').value='new'; $('logSearch').dispatchEvent(new dom.window.Event('input')); assert.equal(persisted.filter,'new');
});
