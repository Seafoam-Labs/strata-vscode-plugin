import { Runner } from '../strata/cli';
import { guardedRuntimeArgs, JsonObject, RuntimeAction } from '../strata/contracts';

export class Operations {
  busy = false;
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Another Strata operation is in progress.');
    this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }
  async runtime(cli: Runner, action: RuntimeAction, profile: string, review: (plan: JsonObject, args: string[]) => Promise<boolean>, signal?: AbortSignal): Promise<JsonObject | undefined> {
    const previewArgs = ['runtime', action, '--profile', profile, '--plan', '--json'];
    const plan = await cli.json(previewArgs, { signal });
    const args = guardedRuntimeArgs(action, profile, plan);
    if (!await review(plan, args) || signal?.aborted) return;
    // Start has no public revision flags in 0.2.8: recheck the complete plan.
    // This narrows the race but cannot provide a server-side compare-and-swap.
    if (action === 'start') {
      const fresh = await cli.json(previewArgs, { signal });
      if (JSON.stringify(fresh) !== JSON.stringify(plan)) throw new Error('Start plan changed during review. Preview it again.');
    }
    return cli.json(args, { signal, timeout: 660000 });
  }
}
