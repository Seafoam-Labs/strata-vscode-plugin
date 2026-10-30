delete process.env.ELECTRON_RUN_AS_NODE;
const {runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath} = require('@vscode/test-electron');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname,'..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'strata-package-test-'));
  const user = path.join(temp,'user'), extensions = path.join(temp,'extensions');
  fs.mkdirSync(path.join(user,'User'),{recursive:true});
  fs.writeFileSync(path.join(user,'User','settings.json'),JSON.stringify({
    'strata.executablePath':path.join(root,'test/fixtures/fake-strata.cjs'), 'telemetry.telemetryLevel':'off',
    'update.mode':'none', 'extensions.autoUpdate':false, 'workbench.startupEditor':'none', 'chat.disableAIFeatures':true
  }));
  const exe = process.env.VSCODE_EXECUTABLE_PATH || await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || 'stable');
  const [defaultCli,...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(exe);
  const cli = process.env.VSCODE_CLI_PATH || (path.basename(exe).startsWith('codium') ? path.join(path.dirname(exe),'bin','codium') : defaultCli);
  const result = spawnSync(cli,[...cliArgs,'--user-data-dir',user,'--extensions-dir',extensions,'--install-extension',path.join(root,'strata-control.vsix'),'--force'],{encoding:'utf8',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:60000});
  console.log(result.stdout); if(result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  const installed = fs.readdirSync(extensions).find(name=>name.startsWith('strata-local.strata-control-'));
  if(!installed) throw new Error('Packaged extension was not installed');
  await runTests({vscodeExecutablePath:exe,extensionDevelopmentPath:path.join(extensions,installed),extensionTestsPath:path.join(root,'test/integration/editor.cjs'),launchArgs:['--user-data-dir',user,'--extensions-dir',extensions,'--disable-workspace-trust','--disable-gpu','--no-sandbox','--skip-welcome','--skip-release-notes']});
})().catch(e=>{console.error(e);process.exitCode=1;});
