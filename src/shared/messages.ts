import { object } from '../strata/contracts';
export const actions = ['ready', 'refresh', 'select', 'start', 'stop', 'restart', 'verify', 'monitor', 'launch', 'dashboard', 'settings', 'credential', 'doctor', 'createProfile', 'editProfile', 'useModel', 'validateProfile', 'history', 'browse', 'inspectModel'] as const;
export interface Message { id: string; action: typeof actions[number]; value?: unknown }
export function message(value: unknown): Message {
  const m = object(value);
  if (typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(m.id) || !actions.includes(m.action as Message['action'])) throw new Error('Invalid panel message.');
  if (JSON.stringify(m).length > 16384) throw new Error('Panel message is too large.');
  return m as unknown as Message;
}
