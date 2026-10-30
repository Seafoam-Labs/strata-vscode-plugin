import { spawn, ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { envelope, errorMessage, JsonObject } from './contracts';

export interface RunOptions { signal?: AbortSignal; timeout?: number; env?: NodeJS.ProcessEnv; allowFailure?: boolean }
export interface Runner { json(args: string[], options?: RunOptions): Promise<JsonObject> }
export class CliError extends Error {
  constructor(message: string, readonly data?: JsonObject) { super(message); }
}
export async function discoverExecutable(configured: string): Promise<string> {
  const names = process.platform === 'win32' ? ['strata.exe'] : ['strata'];
  const candidates = configured ? [configured] : (process.env.PATH || '').split(delimiter).filter(isAbsolute).flatMap(p => names.map(n => join(p, n)));
  if (configured && !isAbsolute(configured)) throw new Error('Strata executablePath must be an absolute path.');
  for (const path of candidates) {
    try { await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return path; } catch { /* Try next system PATH entry. */ }
  }
  throw new Error('Strata was not found. Install Strata, then set Strata: Executable Path in Settings.');
}
export class Cli implements Runner {
  private children = new Set<ChildProcess>();
  private closed = false;
  constructor(readonly executable: string, private readonly log: (s: string) => void = () => {}) {}
  async raw(args: string[], options: RunOptions = {}): Promise<{ stdout: string; code: number }> {
    if (this.closed) throw new Error('Strata adapter is closed.');
    if (options.signal?.aborted) throw new Error('Command cancelled; reconcile engine state before retrying.');
    const env: NodeJS.ProcessEnv = { ...process.env, ...options.env, PYTHONUNBUFFERED: '1' };
    // Do not inherit interpreter injection settings from a workspace or a development shell.
    delete env.PYTHONPATH;
    delete env.PYTHONHOME;
    const redact = (s: string) => Object.entries(options.env || {}).reduce((out, [key, value]) => /KEY|TOKEN|SECRET|CREDENTIAL/.test(key) && value ? out.split(value).join('[redacted]') : out, s);
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, { shell: false, cwd: homedir(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.children.add(child);
      let stdout = '', stderr = '', settled = false, size = 0;
      const finish = (error?: Error, code = 0) => {
        if (settled) return;
        settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
        this.children.delete(child);
        if (error) { child.kill(); reject(error); }
        else {
          this.log(`strata ${args.slice(0, 2).join(' ')} · exit ${code}`);
          if (code !== 0 && !options.allowFailure) reject(new CliError(redact(stderr.trim()).slice(0, 1500) || `Strata exited with code ${code}.`));
          else resolve({ stdout: redact(stdout), code });
        }
      };
      const abort = () => finish(new Error('Command cancelled; the engine may still be working. State will be refreshed.'));
      const timer = setTimeout(() => finish(new Error('Strata timed out; the engine may still be working. State will be refreshed.')), options.timeout ?? 12000);
      options.signal?.addEventListener('abort', abort, { once: true });
      child.stdout!.setEncoding('utf8');
      child.stderr!.setEncoding('utf8');
      child.stdout!.on('data', (chunk: string) => {
        size += Buffer.byteLength(chunk);
        if (size > 4 * 1024 * 1024) finish(new Error('Strata output exceeded the 4 MiB limit.'));
        else stdout += chunk.toString();
      });
      child.stderr!.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8192); });
      child.on('error', e => finish(new Error(`Cannot execute Strata: ${e.message}`)));
      child.on('close', code => finish(undefined, code ?? 1));
    });
  }
  async json(args: string[], options: RunOptions = {}): Promise<JsonObject> {
    const result = await this.raw(args, { ...options, allowFailure: true });
    const data = envelope(result.stdout);
    if ((!data.ok || result.code !== 0) && !options.allowFailure) throw new CliError(errorMessage(data), data);
    return data;
  }
  dispose(): void { this.closed = true; for (const child of this.children) child.kill(); this.children.clear(); }
}
