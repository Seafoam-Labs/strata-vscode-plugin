// Exercise the real installed CLI with profiles isolated in a temporary directory.
// This never starts/stops an engine, downloads a model, or changes a saved user profile.
const {Cli,discoverExecutable} = require('../dist/strata/cli');
const {mkdtemp,rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const dir=await mkdtemp(join(tmpdir(),'strata-contract-'));
  const cli=new Cli(await discoverExecutable(process.env.STRATA_EXECUTABLE || ''));
  const env={STRATA_PROFILE_DIR:dir};
  const run=args=>cli.json([...args,'--json'],{env});
  try {
    const models=await run(['models','list','--installed']);
    assert.ok(models.models.length,'Install a model first to run local contract checks.');
    const source=models.models[0].source_config;
    const name='vscode-contract-test';
    const created=await run(['profile','create',name,'--from-config',source]);
    assert.equal(created.profile.id,name);
    await run(['profile','validate',name]);
    const preview=await run(['profile','set',name,'parallel=2','--plan']);
    assert.equal(preview.changes.parallel.after,2);
    const edited=await run(['profile','set',name,'parallel=2']);
    assert.notEqual(created.revision,edited.revision);
    const history=await run(['profile','history',name]);
    assert.ok(history.history.some(x=>x.revision===created.revision));
    await run(['profile','rollback',name,'--to',created.revision]);
    const restored=await run(['profile','show',name,'--effective']);
    assert.equal(restored.revision,created.revision);
    const plan=await run(['runtime','start','--profile',name,'--plan']);
    assert.equal(plan.plan.profile,name);
    assert.equal(plan.plan.would_start,false);
    console.log('STRATA_INSTALLED_CONTRACT_OK: create, validate, preview, edit, history, rollback, and start preview. No engine started.');
  } finally { cli.dispose(); await rm(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
