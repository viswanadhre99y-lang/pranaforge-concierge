(function () {
  'use strict';

  const ALIAS_KEY = 'pf_concierge_alias';
  const ROLES = ['today', 'kitchen', 'floor'];

  const $ = (id) => document.getElementById(id);

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getAlias() {
    return ($('alias').value || '').trim();
  }

  function setAlias(v) {
    $('alias').value = v || '';
  }

  function loadAlias() {
    try {
      const v = localStorage.getItem(ALIAS_KEY);
      if (v) setAlias(v);
    } catch (_) { /* ignore */ }
  }

  function saveAlias() {
    try {
      localStorage.setItem(ALIAS_KEY, getAlias());
    } catch (_) { /* ignore */ }
  }

  function currentRole() {
    const h = (location.hash || '#today').replace(/^#/, '').toLowerCase();
    return ROLES.includes(h) ? h : 'today';
  }

  function showRole(role) {
    ROLES.forEach((r) => {
      const panel = $(`panel-${r}`);
      if (panel) panel.hidden = r !== role;
    });
    document.querySelectorAll('.roles a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-role') === role);
    });
  }

  function route() {
    const role = currentRole();
    if (location.hash.replace(/^#/, '').toLowerCase() !== role) {
      history.replaceState(null, '', `#${role}`);
    }
    showRole(role);
  }

  function showResult(role, data, isError) {
    const el = $(`result-${role}`);
    if (!el) return;
    el.classList.remove('empty', 'err', 'ok');
    if (data == null || data === '') {
      el.textContent = '';
      el.classList.add('empty');
      return;
    }
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    el.textContent = text;
    el.classList.add(isError ? 'err' : 'ok');
  }

  async function postApi(path, payload) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let json = null;
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, ok: res.ok, body: json };
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
  }

  async function runAction(role, btn, payload) {
    setBusy(btn, true);
    try {
      const result = await postApi(`/api/${role}`, payload);
      showResult(role, result.body, !result.ok);
    } catch (e) {
      showResult(role, { ok: false, error: e.message || String(e) }, true);
    } finally {
      setBusy(btn, false);
    }
  }

  // —— Today ——
  $('btn-get-today').addEventListener('click', () => {
    runAction('today', $('btn-get-today'), {
      action: 'get_today',
      alias: getAlias(),
      date: $('today-date').value,
      tz: $('today-tz').value.trim() || 'Asia/Kolkata',
    });
  });

  $('btn-log-score').addEventListener('click', () => {
    runAction('today', $('btn-log-score'), {
      action: 'log_score',
      alias: getAlias(),
      date: $('today-date').value,
      tz: $('today-tz').value.trim() || 'Asia/Kolkata',
      energy: Number($('score-energy').value),
      sleep_rest: Number($('score-sleep').value),
      clarity: Number($('score-clarity').value),
    });
  });

  $('btn-patch-pref').addEventListener('click', () => {
    runAction('today', $('btn-patch-pref'), {
      action: 'patch_preference',
      alias: getAlias(),
      path: $('pref-path').value.trim(),
      value: $('pref-value').value,
    });
  });

  // —— Kitchen ——
  $('btn-diet-card').addEventListener('click', () => {
    runAction('kitchen', $('btn-diet-card'), {
      action: 'issue_diet_card',
      alias: getAlias(),
      day_type: $('kitchen-day-type').value,
      date: $('kitchen-date').value,
      tz: $('kitchen-tz').value.trim() || 'Asia/Kolkata',
      physician_constraints: $('kitchen-physician').value.trim(),
      pattern: $('kitchen-pattern').value.trim(),
      allergens: $('kitchen-allergens').value.trim(),
    });
  });

  // —— Floor ——
  $('btn-ros').addEventListener('click', () => {
    runAction('floor', $('btn-ros'), {
      action: 'get_run_of_show',
      alias: getAlias(),
      protocol_id: $('floor-protocol').value.trim(),
      session_id: $('floor-session').value.trim(),
    });
  });

  $('btn-log-qa').addEventListener('click', () => {
    runAction('floor', $('btn-log-qa'), {
      action: 'log_qa',
      alias: getAlias(),
      protocol_id: $('floor-protocol').value.trim(),
      session_id: $('floor-session').value.trim(),
      consent: $('qa-consent').value.trim(),
      checklist: $('qa-checklist').value.trim(),
      incident: $('qa-incident').value.trim(),
    });
  });

  // —— Ping ——
  $('btn-ping').addEventListener('click', async () => {
    const btn = $('btn-ping');
    setBusy(btn, true);
    try {
      const result = await postApi('/api/ping', {});
      const role = currentRole();
      showResult(role, result.body, !result.ok);
    } catch (e) {
      showResult(currentRole(), { ok: false, error: e.message || String(e) }, true);
    } finally {
      setBusy(btn, false);
    }
  });

  $('alias').addEventListener('change', saveAlias);
  $('alias').addEventListener('blur', saveAlias);

  // Defaults
  const iso = todayISO();
  $('today-date').value = iso;
  $('kitchen-date').value = iso;
  ['result-today', 'result-kitchen', 'result-floor'].forEach((id) => {
    const el = $(id);
    if (el) {
      el.textContent = '';
      el.classList.add('empty');
    }
  });

  loadAlias();
  window.addEventListener('hashchange', route);
  route();
})();
