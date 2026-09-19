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


  function pieWhy(r) {
    if (!r) return '';
    if (Array.isArray(r.why) && r.why.length) return r.why.join(' · ');
    if (r.explanation) return typeof r.explanation === 'string' ? r.explanation : JSON.stringify(r.explanation);
    return '';
  }

  function renderPieAssist(data) {
    var badge = $('pie-decision');
    var box = $('pie-recs');
    if (!badge || !box) return;

    if (!data || data.error === 'pie_unavailable') {
      badge.hidden = false;
      badge.className = 'pie-badge warn';
      badge.textContent = 'PIE unavailable — Floor still works; start PIE runtime or check PIE_URL.';
      box.hidden = false;
      box.innerHTML = '<p class="pie-meta">' + (data && data.detail ? data.detail : 'pie_unavailable') + '</p>';
      return;
    }
    if (data.error === 'pie_unauthorized') {
      badge.hidden = false;
      badge.className = 'pie-badge escalate';
      badge.textContent = 'PIE unauthorized — set PIE_STAFF_PIN on concierge server to match PIE.';
      box.hidden = true;
      box.innerHTML = '';
      return;
    }

    var action = data.action || data.decision || '';
    var silence = !!data.silence;
    badge.hidden = false;
    if (action === 'escalate') {
      badge.className = 'pie-badge escalate';
      badge.textContent = 'ESCALATE / SILENCE — human support; do not run a protocol from this result.';
    } else if (silence || action === 'silence') {
      badge.className = 'pie-badge silence';
      badge.textContent = 'SILENCE — prefer no protocol; coach manually if needed.';
    } else {
      badge.className = 'pie-badge ok';
      badge.textContent = 'TOP-3' + (data.confidence != null ? ' · confidence ' + data.confidence : '');
    }

    var list = data.recommendations || [];
    var html = '';
    if (data.inferred_need) {
      html += '<p class="pie-meta">inferred_need: ' + data.inferred_need + '</p>';
    }
    if (data.why_selected) {
      var ws = Array.isArray(data.why_selected) ? data.why_selected.join(' · ') : data.why_selected;
      html += '<p class="pie-meta">why_selected: ' + ws + '</p>';
    }
    if (!list.length) {
      html += '<p class="pie-meta">No protocol recommendations.</p>';
    } else {
      list.slice(0, 3).forEach(function (r, i) {
        var id = r.protocol_id || '';
        var name = r.name || id;
        var conf = r.confidence != null ? r.confidence : '—';
        var why = pieWhy(r);
        html += '<div class="pie-card">' +
          '<div class="pie-card-top"><span class="pie-rank">#' + (i + 1) + '</span> ' +
          '<strong>' + name + '</strong></div>' +
          '<div class="pie-meta">' + id +
          (r.score != null ? ' · score ' + r.score : '') +
          ' · conf ' + conf +
          (r.evidence_class ? ' · ' + r.evidence_class : '') +
          '</div>' +
          (why ? '<div class="pie-why">' + why + '</div>' : '') +
          '<button type="button" class="btn pie-use" data-protocol-id="' + id + '">Use ID</button>' +
          '</div>';
      });
    }
    box.hidden = false;
    box.innerHTML = html;
    box.querySelectorAll('.pie-use').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-protocol-id') || '';
        if ($('floor-protocol')) $('floor-protocol').value = id;
      });
    });
  }

  if ($('btn-pie-top3')) {
    $('btn-pie-top3').addEventListener('click', async function () {
      var btn = $('btn-pie-top3');
      setBusy(btn, true);
      try {
        var client = ($('pie-client').value || '').trim() || getAlias();
        var sleepRaw = ($('pie-sleep').value || '').trim();
        var result = await postApi('/api/pie/recommend', {
          client_id: client,
          alias: getAlias(),
          available_minutes: Number($('pie-minutes').value),
          place_class: $('pie-place').value,
          event_tag: $('pie-event').value,
          stress: Number($('pie-stress').value),
          energy: Number($('pie-energy').value),
          sleep_h: sleepRaw === '' ? null : Number(sleepRaw),
          prefers_breath: $('pie-breath').value,
        });
        renderPieAssist(result.body || { error: 'pie_unavailable' });
        showResult('floor', result.body, result.body && result.body.error === 'pie_unavailable' ? true : !result.ok && !result.body);
      } catch (e) {
        renderPieAssist({ error: 'pie_unavailable', detail: e.message || String(e) });
        showResult('floor', { ok: false, error: e.message || String(e) }, true);
      } finally {
        setBusy(btn, false);
      }
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
