delete process.env.ELECTRON_RUN_AS_NODE;
const {runTests} = require('@vscode/test-electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'strata-editor-test-'));
  const user = path.join(temp, 'user');
  fs.mkdirSync(path.join(user, 'User'), {recursive: true});
  fs.writeFileSync(path.join(user, 'User', 'settings.json'), JSON.stringify({
    'strata.executablePath': path.join(root, 'test/fixtures/fake-strata.cjs'),
    'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false,
    'workbench.startupEditor': 'none', 'window.restoreWindows': 'none', 'chat.disableAIFeatures': true
  }));
  const extensionRoot = process.env.STRATA_PACKAGED_EXTENSION || root;
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
    version: process.env.VSCODE_VERSION || 'stable',
    extensionDevelopmentPath: extensionRoot,
    extensionTestsPath: path.join(root, 'test/integration/editor.cjs'),
    launchArgs: ['--user-data-dir', user, '--extensions-dir', path.join(temp,'extensions'), '--disable-workspace-trust', '--disable-gpu', '--skip-welcome', '--skip-release-notes', '--no-sandbox'],
  });
})().catch(e => { console.error(e); process.exitCode = 1; });
