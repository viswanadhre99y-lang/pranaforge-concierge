(function () {
  'use strict';

  var ALIAS_KEY = 'pf_concierge_alias';
  var PIN_KEY = 'pf_concierge_pin';
  var ROLES = ['today', 'kitchen', 'floor', 'claims'];
  var $ = function (id) { return document.getElementById(id); };

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getAlias() { return ($('alias').value || '').trim(); }
  function getPin() { return ($('staff-pin').value || '').trim(); }

  function loadAlias() {
    try {
      var v = localStorage.getItem(ALIAS_KEY);
      if (v) $('alias').value = v;
      var p = sessionStorage.getItem(PIN_KEY);
      if (p && $('staff-pin')) $('staff-pin').value = p;
    } catch (e) {}
  }

  function saveAlias() {
    try { localStorage.setItem(ALIAS_KEY, getAlias()); } catch (e) {}
  }
  function savePin() {
    try { sessionStorage.setItem(PIN_KEY, getPin()); } catch (e) {}
  }

  function currentRole() {
    var h = (location.hash || '#today').replace(/^#/, '').toLowerCase();
    return ROLES.indexOf(h) >= 0 ? h : 'today';
  }

  function showRole(role) {
    ROLES.forEach(function (r) {
      var panel = $('panel-' + r);
      if (panel) panel.hidden = r !== role;
    });
    document.querySelectorAll('.roles a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-role') === role);
    });
  }

  function route() {
    var role = currentRole();
    if (location.hash.replace(/^#/, '').toLowerCase() !== role) {
      history.replaceState(null, '', '#' + role);
    }
    showRole(role);
  }

  function displayPayload(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data;
    if (data.text) return data.text + '\n\n---\n' + JSON.stringify(data, null, 2);
    if (data.card) return data.card + '\n\n---\n' + JSON.stringify(data, null, 2);
    if (data.scrubbed && data.flags) {
      return 'Flags: ' + (data.flags.join(', ') || '(none)') + '\nClean: ' + !!data.clean + '\n\nScrubbed:\n' + data.scrubbed;
    }
    return JSON.stringify(data, null, 2);
  }

  function showResult(role, data, isError) {
    var el = $('result-' + role);
    if (!el) return;
    el.classList.remove('empty', 'err', 'ok');
    if (data == null || data === '') {
      el.textContent = '';
      el.classList.add('empty');
      return;
    }
    el.textContent = displayPayload(data);
    el.classList.add(isError ? 'err' : 'ok');
  }

  function headers() {
    var h = { 'Content-Type': 'application/json' };
    var pin = getPin();
    if (pin) h['X-PF-Staff-Pin'] = pin;
    return h;
  }

  async function postApi(path, payload) {
    var res = await fetch(path, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; }
    catch (e) { json = { raw: text }; }
    return { status: res.status, ok: res.ok, body: json };
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
  }

  async function runAction(role, btn, payload) {
    setBusy(btn, true);
    try {
      var result = await postApi('/api/' + role, payload);
      showResult(role, result.body, !result.ok);
    } catch (e) {
      showResult(role, { ok: false, error: e.message || String(e) }, true);
    } finally {
      setBusy(btn, false);
    }
  }

  $('btn-get-today').addEventListener('click', function () {
    runAction('today', $('btn-get-today'), {
      action: 'get_today',
      alias: getAlias(),
      date: $('today-date').value,
      tz: ($('today-tz').value || '').trim() || 'Asia/Kolkata',
    });
  });

  $('btn-log-score').addEventListener('click', function () {
    runAction('today', $('btn-log-score'), {
      action: 'log_score',
      alias: getAlias(),
      date: $('today-date').value,
      tz: ($('today-tz').value || '').trim() || 'Asia/Kolkata',
      energy: Number($('score-energy').value),
      sleep_rest: Number($('score-sleep').value),
      clarity: Number($('score-clarity').value),
    });
  });

  $('btn-patch-pref').addEventListener('click', function () {
    runAction('today', $('btn-patch-pref'), {
      action: 'patch_preference',
      alias: getAlias(),
      path: ($('pref-path').value || '').trim(),
      value: $('pref-value').value,
    });
  });

  $('btn-diet-card').addEventListener('click', function () {
    runAction('kitchen', $('btn-diet-card'), {
      action: 'issue_diet_card',
      alias: getAlias(),
      day_type: $('kitchen-day-type').value,
      date: $('kitchen-date').value,
      tz: ($('kitchen-tz').value || '').trim() || 'Asia/Kolkata',
      physician_constraints: ($('kitchen-physician').value || '').trim(),
      pattern: ($('kitchen-pattern').value || '').trim(),
      allergens: ($('kitchen-allergens').value || '').trim(),
    });
  });

  $('btn-ros').addEventListener('click', function () {
    runAction('floor', $('btn-ros'), {
      action: 'get_run_of_show',
      alias: getAlias(),
      protocol_id: ($('floor-protocol').value || '').trim(),
      session_id: ($('floor-session').value || '').trim(),
    });
  });

  $('btn-log-qa').addEventListener('click', function () {
    runAction('floor', $('btn-log-qa'), {
      action: 'log_qa',
      alias: getAlias(),
      protocol_id: ($('floor-protocol').value || '').trim(),
      session_id: ($('floor-session').value || '').trim(),
      consent: ($('qa-consent').value || '').trim(),
      checklist: ($('qa-checklist').value || '').trim(),
      incident: ($('qa-incident').value || '').trim(),
    });
  });

  if ($('btn-claims-audit')) {
    $('btn-claims-audit').addEventListener('click', function () {
      runAction('claims', $('btn-claims-audit'), {
        text: $('claims-text').value || '',
      });
    });
  }

  $('btn-ping').addEventListener('click', async function () {
    var btn = $('btn-ping');
    setBusy(btn, true);
    try {
      var result = await postApi('/api/ping', {});
      showResult(currentRole(), result.body, !result.ok);
    } catch (e) {
      showResult(currentRole(), { ok: false, error: e.message || String(e) }, true);
    } finally {
      setBusy(btn, false);
    }
  });

  $('alias').addEventListener('change', saveAlias);
  $('alias').addEventListener('blur', saveAlias);
  if ($('staff-pin')) {
    $('staff-pin').addEventListener('change', savePin);
    $('staff-pin').addEventListener('blur', savePin);
  }

  var iso = todayISO();
  $('today-date').value = iso;
  $('kitchen-date').value = iso;
  ['result-today', 'result-kitchen', 'result-floor', 'result-claims'].forEach(function (id) {
    var el = $(id);
    if (el) {
      el.textContent = '';
      el.classList.add('empty');
    }
  });

  loadAlias();
  window.addEventListener('hashchange', route);
  route();
})();
