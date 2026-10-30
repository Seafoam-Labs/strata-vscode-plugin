interface WebviewApi { postMessage(value: unknown): void; getState(): unknown; setState(value: unknown): void }
declare function acquireVsCodeApi(): WebviewApi;
(() => {
  const api = acquireVsCodeApi();
  type Obj = Record<string, unknown>;
  const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
  const arr = (v: unknown): Obj[] => Array.isArray(v) ? v.map(obj) : [];
  const str = (v: unknown) => typeof v === 'string' ? v : '';
  const number = (v: unknown, unit = '') => typeof v === 'number' && Number.isFinite(v) ? `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}` : 'Unavailable';
  const memory = (v: unknown) => typeof v === 'number' ? number(v / 1073741824, ' GiB') : 'Unavailable';
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
  const saved = obj(api.getState());
  let state: Obj = {}, sequence = 0, profileRevision = '', baseline: Record<string, string> = {}, frozen: Obj[] | undefined;
  let pending = new Set<string>();
  const keys = ['host', 'port', 'parallel', 'batch_groups', 'max_queue', 'queue_timeout', 'offline', 'batch_telemetry'];
  const labels = ['Bind address', 'Port', 'Parallel requests', 'Batch groups', 'Maximum queue', 'Queue timeout (seconds)', 'Offline', 'Batch telemetry'];
  const root = $('app');
  root.innerHTML = `
    <header><div class="brand"><span class="mark" aria-hidden="true">≋</span><div><h1>Strata</h1><p>LOCAL ENGINE</p></div></div><button id="refresh" title="Refresh Strata" aria-label="Refresh Strata">↻</button></header>
    <div id="notice" role="status" aria-live="polite" hidden></div>
    <div id="error" role="alert" hidden></div>
    <section class="engine-card" aria-label="Engine controls">
      <div class="line"><span id="engineState" class="badge">Connecting</span><span id="connection" class="muted">Local machine</span></div>
      <label for="profile">Serving profile</label><select id="profile"><option value="">Select a profile…</option></select>
      <h2 id="modelName">Choose a profile</h2><p id="modelLabel" class="muted">Saved model</p>
      <div class="actions"><button id="start" class="primary">Start</button><button id="stop">Stop</button><button id="restart">Restart</button><button id="verify">Verify</button></div>
      <div class="endpoint"><span class="muted">Endpoint</span><code id="endpoint">Unavailable</code></div>
      <p id="revisions" class="muted"></p><p id="updated" class="muted">Waiting for Strata</p>
    </section>
    <section aria-labelledby="performanceHeading"><div class="section-title"><h2 id="performanceHeading">Performance</h2><span id="telemetryStatus" class="muted">No sample</span></div>
      <div class="metrics"><div class="metric"><span>Decode</span><strong id="decode">Unavailable</strong><small>tokens / second</small></div><div class="metric"><span>Prefill</span><strong id="prefill">Unavailable</strong><small>tokens / second</small></div><div class="metric"><span>Active / queued</span><strong id="requests">Unavailable</strong><small>requests</small></div><div class="metric"><span>System RAM</span><strong id="ram">Unavailable</strong><small id="ramTotal">Total unavailable</small></div></div>
      <div id="devices"></div>
    </section>
    <details id="settingsSection" open><summary>Profiles & settings</summary><p class="muted">Saved settings apply on the next start. Preview changes before saving.</p>
      <div class="actions"><button id="createProfile">New profile</button><button id="useModel">Change model</button><button id="validateProfile">Validate</button><button id="history">History</button></div>
      <form id="settingsForm"><div id="fields"></div><button class="primary" id="saveSettings" type="submit">Preview settings</button></form>
    </details>
    <details id="requestsSection"><summary>Serving & requests</summary><div id="serving"></div><pre id="requestDetails">No request data</pre></details>
    <details id="logsSection" open><summary>Live activity</summary><div class="log-toolbar"><input id="logSearch" type="search" aria-label="Filter activity" placeholder="Filter activity…"><button id="pause">Pause</button></div><p id="logStatus" class="muted">Activity unavailable</p><ol id="logs" aria-label="Recent request activity"></ol></details>
    <details id="commandsSection"><summary>Commands & diagnostics</summary><p class="muted">Browse every Strata command, inspect its help, or launch a terminal workflow.</p><div class="actions"><button id="browse">Browse commands</button><button id="doctor">Diagnostics</button><button id="credential">Credential</button><button id="settings">Extension settings</button></div><pre id="engineDetails"></pre></details>
    <footer><div class="actions"><button id="dashboard">Expand dashboard</button><button id="monitor">Open TUI</button><button id="launch">Guided setup</button></div><p id="version" class="muted"></p></footer>
  `;
  for (const [i, key] of keys.entries()) {
    const label = document.createElement('label'); label.htmlFor = `field-${key}`; label.textContent = labels[i];
    let input: HTMLInputElement | HTMLSelectElement;
    if (['offline', 'batch_telemetry'].includes(key)) {
      input = document.createElement('select');
      for (const value of ['', 'true', 'false']) { const option = document.createElement('option'); option.value = value; option.textContent = value || 'Default'; input.append(option); }
    } else { input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Default'; input.maxLength = 255; }
    input.id = `field-${key}`; label.append(input); $('fields').append(label);
  }
  function persist(): void {
    const sections: Obj = {};
    document.querySelectorAll('details').forEach(d => { sections[d.id] = d.open; });
    api.setState({ sections, filter: $<HTMLInputElement>('logSearch').value });
  }
  const sections = obj(saved.sections);
  document.querySelectorAll('details').forEach(d => { if (typeof sections[d.id] === 'boolean') d.open = sections[d.id] as boolean; d.addEventListener('toggle', persist); });
  $<HTMLInputElement>('logSearch').value = str(saved.filter);
  function send(action: string, value?: unknown): void {
    const id = `request-${++sequence}`; pending.add(id);
    $('notice').hidden = false; $('notice').textContent = 'Working…';
    api.postMessage({ id, action, value });
  }
  for (const id of ['refresh', 'start', 'stop', 'restart', 'verify', 'createProfile', 'useModel', 'validateProfile', 'history', 'browse', 'doctor', 'credential', 'settings', 'dashboard', 'monitor', 'launch']) $(id).addEventListener('click', () => send(id));
  $<HTMLSelectElement>('profile').addEventListener('change', e => send('select', (e.target as HTMLSelectElement).value));
  $('settingsForm').addEventListener('submit', e => {
    e.preventDefault();
    const values: Record<string, string> = {};
    for (const key of keys) { const value = $<HTMLInputElement>(`field-${key}`).value; if (value !== baseline[key] && value.trim()) values[key] = value; }
    if (!Object.keys(values).length) { $('notice').textContent = 'Change a setting before previewing.'; $('notice').hidden = false; return; }
    send('editProfile', values);
  });
  $('logSearch').addEventListener('input', () => { persist(); renderLogs(); });
  $('pause').addEventListener('click', () => {
    frozen = frozen ? undefined : arr(state.logs);
    $('pause').textContent = frozen ? 'Resume' : 'Pause'; $('pause').setAttribute('aria-pressed', String(!!frozen)); renderLogs();
  });
  function renderLogs(): void {
    const query = $<HTMLInputElement>('logSearch').value.toLowerCase();
    const logs = (frozen || arr(state.logs)).filter(row => JSON.stringify(row).toLowerCase().includes(query));
    $('logs').replaceChildren(...logs.slice(-100).reverse().map(row => {
      const li = document.createElement('li'); li.textContent = JSON.stringify(row); return li;
    }));
    $('logStatus').textContent = `${frozen ? 'Paused · ' : ''}${state.logAvailable ? `${logs.length} retained events · newest first` : 'Activity unavailable on this endpoint'}`;
  }
  function render(): void {
    const runtime = obj(state.runtime), profile = obj(state.profile), plan = obj(profile.plan), s = obj(state.snapshot);
    const rates = obj(s.rates), work = obj(s.work), model = obj(s.model), ram = obj(s.ram);
    const ready = state.supported === true, hasProfile = !!state.selected, busy = !!state.busy;
    const runtimeState = str(runtime.state);
    $('engineState').textContent = busy ? str(state.busy) : runtimeState === 'ready' ? 'Running' : runtimeState || (state.connected ? 'Monitoring' : ready ? 'No profile selected' : 'Setup required');
    $('engineState').classList.toggle('running', runtimeState === 'ready');
    $('connection').textContent = state.connected ? 'Telemetry connected' : 'Local machine';
    const profiles = arr(state.profiles), select = $<HTMLSelectElement>('profile');
    const optionsKey = JSON.stringify(profiles.map(p => p.id));
    if (select.dataset.options !== optionsKey) {
      select.dataset.options = optionsKey;
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = profiles.length ? 'Select a profile…' : 'No profiles — create one below'; placeholder.disabled = true;
      select.replaceChildren(placeholder, ...profiles.map(p => { const option = document.createElement('option'); option.value = str(p.id); option.textContent = str(p.id); return option; }));
    }
    select.value = str(state.selected); select.disabled = !ready || busy;
    $('modelName').textContent = str(model.id) || str(plan.model_name) || 'Choose a profile';
    $('modelLabel').textContent = model.id ? 'Served model' : 'Saved model';
    $('endpoint').textContent = str(state.endpoint) || 'Unavailable';
    $('version').textContent = str(state.version) || 'Strata CLI not connected';
    $('updated').textContent = state.updated ? `Checked ${new Date(Number(state.updated)).toLocaleTimeString()}` : 'Waiting for Strata';
    $('revisions').textContent = runtime.profile_revision && profile.revision !== runtime.profile_revision ? 'Saved profile differs from running settings. Restart to apply.' : hasProfile ? 'Engine continues running when the editor closes.' : 'Choose or create a serving profile.';
    $('error').textContent = str(state.error); $('error').hidden = !state.error;
    $('telemetryStatus').textContent = state.connected ? 'Live' : 'Unavailable';
    $('decode').textContent = number(rates.answer_tok_s); $('prefill').textContent = number(rates.prefill_tok_s);
    $('requests').textContent = typeof work.active === 'number' || typeof work.queued === 'number' ? `${number(work.active)} / ${number(work.queued)}` : 'Unavailable';
    $('ram').textContent = memory(ram.used); $('ramTotal').textContent = `of ${memory(ram.total)}`;
    $('devices').replaceChildren(...arr(s.devices).map(device => {
      const card = document.createElement('div'); card.className = 'device';
      const title = document.createElement('h3'); title.textContent = str(device.name) || `GPU ${device.index}`;
      const stats = document.createElement('p'); stats.textContent = `${memory(device.mem_used)} / ${memory(device.mem_total)} · ${number(device.util, '%')} utilization`;
      const meter = document.createElement('meter'); meter.setAttribute('aria-label', `${title.textContent} memory usage`); meter.max = Number(device.mem_total) || 1; meter.value = Number(device.mem_used) || 0; meter.hidden = typeof device.mem_used !== 'number' || typeof device.mem_total !== 'number';
      card.append(title, stats, meter); return card;
    }));
    if (!arr(s.devices).length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'GPU readings unavailable'; $('devices').append(p); }
    $('serving').textContent = `Context: ${number(model.context)} · Slots: ${number(work.slots_effective)} · Model loaded: ${typeof model.loaded === 'boolean' ? model.loaded ? 'Yes' : 'No' : 'Unavailable'}`;
    $('requestDetails').textContent = JSON.stringify({ slots: work.slots || [], requests: work.requests || [], recent: s.recent || [] }, null, 2);
    $('engineDetails').textContent = JSON.stringify({ topology: s.topology || {}, quality: s.quality || {}, totals: s.totals || {} }, null, 2);
    const revision = `${state.selected}:${profile.revision}`;
    if (revision !== profileRevision) {
      profileRevision = revision; frozen = undefined; $('pause').textContent = 'Pause';
      const effective = obj(plan.effective); baseline = {};
      for (const key of keys) { const val = effective[key]; baseline[key] = val == null ? '' : String(val); $<HTMLInputElement>(`field-${key}`).value = baseline[key]; }
    }
    for (const id of ['start', 'stop', 'restart', 'verify', 'useModel', 'validateProfile', 'history', 'saveSettings']) $<HTMLButtonElement>(id).disabled = !ready || !hasProfile || busy;
    if (runtimeState !== 'stopped') $<HTMLButtonElement>('start').disabled = true;
    if (!runtime.owner_id || !['ready', 'starting', 'failed'].includes(runtimeState)) $<HTMLButtonElement>('stop').disabled = true;
    if (runtimeState !== 'ready') { $<HTMLButtonElement>('restart').disabled = true; $<HTMLButtonElement>('verify').disabled = true; }
    for (const id of ['createProfile', 'browse', 'doctor', 'launch']) $<HTMLButtonElement>(id).disabled = !ready || busy;
    $<HTMLButtonElement>('monitor').disabled = !ready || !state.endpoint;
    $<HTMLButtonElement>('credential').disabled = !ready || !state.endpoint;
    $<HTMLButtonElement>('refresh').disabled = busy;
    keys.forEach(key => { $<HTMLInputElement>(`field-${key}`).disabled = !ready || !hasProfile || busy; });
    renderLogs();
  }
  window.addEventListener('message', event => {
    const m = obj(event.data);
    if (m.type === 'state') { state = obj(m.state); render(); }
    if (m.type === 'result') {
      pending.delete(str(m.id));
      $('notice').textContent = m.ok ? pending.size ? 'Working…' : 'Ready' : str(m.error);
      $('notice').hidden = m.ok === true && !pending.size;
    }
  });
  send('ready');
})();
