(function () {
  'use strict';

  var ALIAS_KEY = 'pf_concierge_alias';
  var PIN_KEY = 'pf_concierge_pin';
  var ROLES = ['library', 'today', 'review', 'kitchen', 'floor', 'claims'];
  var lastKitchenCard = '';
  var lastReview = null;
  var $ = function (id) { return document.getElementById(id); };

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getAlias() { return ($('alias').value || '').trim() || 'r'; }
  function getPin() { return ($('staff-pin').value || '').trim(); }

  function loadAlias() {
    try {
      var v = localStorage.getItem(ALIAS_KEY);
      if (v) $('alias').value = v;
      else if (!$('alias').value) $('alias').value = 'r';
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

  async function getApi(path) {
    var res = await fetch(path, { method: 'GET', headers: headers() });
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
      return result;
    } catch (e) {
      showResult(role, { ok: false, error: e.message || String(e) }, true);
      return null;
    } finally {
      setBusy(btn, false);
    }
  }

  function applySituationToForm(brief) {
    if (!brief) return;
    if (brief.day_type && $('sit-day-type')) $('sit-day-type').value = brief.day_type;
    if (brief.minutes_available != null && $('sit-minutes')) $('sit-minutes').value = brief.minutes_available;
    if (typeof brief.privacy_closed_room === 'boolean' && $('sit-privacy')) {
      $('sit-privacy').value = brief.privacy_closed_room ? 'yes' : 'no';
    }
    if (typeof brief.travel_72h === 'boolean' && $('sit-travel')) {
      $('sit-travel').value = brief.travel_72h ? 'yes' : 'no';
    }
    if (brief.dislikes_hard && $('sit-dislikes')) {
      $('sit-dislikes').value = (brief.dislikes_hard || []).join(', ');
    }
    var banner = $('physician-banner');
    if (banner) {
      var phys = brief.physician_constraints || 'none on file';
      banner.hidden = false;
      banner.textContent = 'Physician lock: ' + phys + ' — never overwritten from this panel.';
    }
    if ($('kitchen-physician') && brief.physician_constraints != null) {
      $('kitchen-physician').value = brief.physician_constraints;
    }
    if ($('kitchen-day-type') && brief.day_type) $('kitchen-day-type').value = brief.day_type;
  }

  function formatReview(body) {
    if (!body) return '';
    var lines = [];
    lines.push('WHY: ' + (body.why || '-'));
    lines.push('SOURCE: ' + (body.source || '-'));
    lines.push('');
    lines.push('OPTIONS');
    (body.options || []).forEach(function (o, i) {
      lines.push('  ' + (i + 1) + '. ' + o.id + ' — ' + (o.label || '') +
        (o.duration_min ? ' [' + o.duration_min + ']' : ''));
    });
    lines.push('');
    lines.push('RECOMMEND: ' + ((body.recommend && body.recommend.id) || '-'));
    if (body.public_rail) {
      lines.push('PUBLIC RAIL (default off): ' + body.public_rail.id + ' — ' + body.public_rail.label);
    }
    lines.push('');
    lines.push('REFUSE');
    (body.refuse || []).forEach(function (r) { lines.push('  - ' + r); });
    if (body.draft) {
      lines.push('');
      lines.push('DRAFT — Floor live sheet');
      lines.push(body.draft.floor_live_sheet || '');
      lines.push('');
      lines.push('DRAFT — Kitchen card');
      lines.push(body.draft.kitchen_card_md || '');
      lines.push('');
      lines.push('DRAFT — Guest text');
      lines.push(body.draft.guest_text || '');
    }
    return lines.join('\n');
  }

  if ($('btn-library-load')) {
    $('btn-library-load').addEventListener('click', async function () {
      var btn = $('btn-library-load');
      setBusy(btn, true);
      try {
        var result = await getApi('/api/library');
        showResult('library', result.body, !result.ok);
      } catch (e) {
        showResult('library', { ok: false, error: e.message || String(e) }, true);
      } finally {
        setBusy(btn, false);
      }
    });
  }

  $('btn-get-today').addEventListener('click', async function () {
    var result = await runAction('today', $('btn-get-today'), {
      action: 'get_today',
      alias: getAlias(),
      date: $('today-date').value,
      tz: ($('today-tz').value || '').trim() || 'Asia/Kolkata',
    });
    if (result && result.body) applySituationToForm(result.body);
  });

  if ($('btn-save-situation')) {
    $('btn-save-situation').addEventListener('click', async function () {
      var dislikes = ($('sit-dislikes').value || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
      var result = await runAction('today', $('btn-save-situation'), {
        action: 'patch_situation',
        alias: getAlias(),
        date: $('today-date').value,
        tz: ($('today-tz').value || '').trim() || 'Asia/Kolkata',
        day_type: $('sit-day-type').value,
        minutes_available: Number($('sit-minutes').value),
        privacy_closed_room: $('sit-privacy').value === 'yes',
        travel_72h: $('sit-travel').value === 'yes',
        dislikes_hard: dislikes,
      });
      if (result && result.body && result.body.brief) applySituationToForm(result.body.brief);
    });
  }

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

  async function loadReviewOptions() {
    var btn = $('btn-review-options');
    setBusy(btn, true);
    try {
      var result = await postApi('/api/review', {
        action: 'options',
        alias: getAlias(),
        session_time: ($('review-session-time').value || '').trim() || 'TBD',
      });
      lastReview = result.body;
      if (result.body && result.body.recommend && result.body.recommend.id) {
        $('review-edit-id').value = result.body.recommend.id;
      }
      var why = $('review-why');
      if (why && result.body) {
        why.hidden = false;
        why.textContent = (result.body.why || '') + ' [' + (result.body.source || '') + ']';
      }
      var el = $('result-review');
      if (el) {
        el.classList.remove('empty', 'err', 'ok');
        el.textContent = formatReview(result.body);
        el.classList.add(result.ok ? 'ok' : 'err');
      }
      if (result.body && result.body.draft && result.body.draft.kitchen_card_md) {
        lastKitchenCard = result.body.draft.kitchen_card_md;
      }
      return result;
    } catch (e) {
      showResult('review', { ok: false, error: e.message || String(e) }, true);
      return null;
    } finally {
      setBusy(btn, false);
    }
  }

  if ($('btn-review-options')) {
    $('btn-review-options').addEventListener('click', function () { loadReviewOptions(); });
  }

  if ($('btn-review-draft')) {
    $('btn-review-draft').addEventListener('click', async function () {
      var btn = $('btn-review-draft');
      setBusy(btn, true);
      try {
        var result = await postApi('/api/review', {
          action: 'draft',
          alias: getAlias(),
          recommend_id: ($('review-edit-id').value || '').trim() || 'TR-01',
          include_rail: !!($('review-include-rail') && $('review-include-rail').checked),
          session_time: ($('review-session-time').value || '').trim() || 'TBD',
        });
        if (lastReview) {
          lastReview.draft = result.body && result.body.draft;
          lastReview.recommend = { id: ($('review-edit-id').value || '').trim() };
        }
        if (result.body && result.body.draft && result.body.draft.kitchen_card_md) {
          lastKitchenCard = result.body.draft.kitchen_card_md;
        }
        var el = $('result-review');
        if (el) {
          el.classList.remove('empty', 'err', 'ok');
          el.textContent = formatReview(Object.assign({}, lastReview || {}, result.body));
          el.classList.add(result.ok ? 'ok' : 'err');
        }
      } catch (e) {
        showResult('review', { ok: false, error: e.message || String(e) }, true);
      } finally {
        setBusy(btn, false);
      }
    });
  }

  if ($('btn-review-approve')) {
    $('btn-review-approve').addEventListener('click', async function () {
      var btn = $('btn-review-approve');
      setBusy(btn, true);
      try {
        var recommendId = ($('review-edit-id').value || '').trim();
        if (!recommendId && lastReview && lastReview.recommend) {
          recommendId = lastReview.recommend.id;
        }
        var result = await postApi('/api/review', {
          action: 'approve',
          alias: getAlias(),
          recommend_id: recommendId,
          options: lastReview && lastReview.options,
          include_rail: !!($('review-include-rail') && $('review-include-rail').checked),
          refuse: lastReview && lastReview.refuse,
          why: lastReview && lastReview.why,
          approver: 'founder',
          session_time: ($('review-session-time').value || '').trim() || 'TBD',
        });
        if (result.body && result.body.ok) {
          if ($('floor-protocol')) $('floor-protocol').value = recommendId;
          if (result.body.draft && result.body.draft.kitchen_card_md) {
            lastKitchenCard = result.body.draft.kitchen_card_md;
          } else if (result.body.record && result.body.record.draft) {
            lastKitchenCard = result.body.record.draft.kitchen_card_md || lastKitchenCard;
          }
          if ($('result-kitchen') && lastKitchenCard) {
            $('result-kitchen').textContent = lastKitchenCard;
            $('result-kitchen').classList.remove('empty', 'err');
            $('result-kitchen').classList.add('ok');
          }
          if (result.body.guest_text && $('guest-text-out')) {
            $('guest-text-box').hidden = false;
            $('guest-text-out').textContent = result.body.guest_text;
          }
          if (result.body.floor && result.body.floor.floor_live_sheet && $('result-floor')) {
            $('result-floor').textContent = result.body.floor.floor_live_sheet;
            $('result-floor').classList.remove('empty', 'err');
            $('result-floor').classList.add('ok');
          }
        }
        var el = $('result-review');
        if (el) {
          el.classList.remove('empty', 'err', 'ok');
          el.textContent = displayPayload(result.body);
          el.classList.add(result.ok && result.body && result.body.ok ? 'ok' : 'err');
        }
      } catch (e) {
        showResult('review', { ok: false, error: e.message || String(e) }, true);
      } finally {
        setBusy(btn, false);
      }
    });
  }

  if ($('btn-review-silence')) {
    $('btn-review-silence').addEventListener('click', async function () {
      var result = await postApi('/api/review', {
        action: 'silence',
        alias: getAlias(),
        why: 'SILENCE — no protocol this window',
        approver: 'founder',
      });
      showResult('review', result.body, !result.ok);
    });
  }

  $('btn-diet-card').addEventListener('click', async function () {
    var result = await runAction('kitchen', $('btn-diet-card'), {
      action: 'issue_diet_card',
      alias: getAlias(),
      day_type: $('kitchen-day-type').value,
      date: $('kitchen-date').value,
      tz: ($('kitchen-tz').value || '').trim() || 'Asia/Kolkata',
      physician_constraints: ($('kitchen-physician').value || '').trim(),
      pattern: ($('kitchen-pattern').value || '').trim(),
      allergens: ($('kitchen-allergens').value || '').trim(),
      protocol_id: ($('floor-protocol') && $('floor-protocol').value) || ($('review-edit-id') && $('review-edit-id').value) || '',
    });
    if (result && result.body) {
      lastKitchenCard = result.body.text || result.body.card || lastKitchenCard;
    }
  });

  if ($('btn-kitchen-save')) {
    $('btn-kitchen-save').addEventListener('click', async function () {
      var btn = $('btn-kitchen-save');
      setBusy(btn, true);
      try {
        var result = await postApi('/api/kitchen', {
          action: 'save_outbox',
          alias: getAlias(),
          date: $('kitchen-date').value,
          markdown: lastKitchenCard || ($('result-kitchen') && $('result-kitchen').textContent) || '',
          day_type: $('kitchen-day-type').value,
          physician_constraints: ($('kitchen-physician').value || '').trim(),
          pattern: ($('kitchen-pattern').value || '').trim(),
          allergens: ($('kitchen-allergens').value || '').trim(),
        });
        showResult('kitchen', result.body, !result.ok);
      } catch (e) {
        showResult('kitchen', { ok: false, error: e.message || String(e) }, true);
      } finally {
        setBusy(btn, false);
      }
    });
  }

  $('btn-ros').addEventListener('click', function () {
    runAction('floor', $('btn-ros'), {
      action: 'get_run_of_show',
      alias: getAlias(),
      protocol_id: ($('floor-protocol').value || '').trim(),
      session_id: ($('floor-session').value || '').trim(),
      session_time: ($('floor-session').value || '').trim() || 'TBD',
    });
  });

  if ($('btn-guest-text')) {
    $('btn-guest-text').addEventListener('click', async function () {
      var btn = $('btn-guest-text');
      setBusy(btn, true);
      try {
        var result = await postApi('/api/floor', {
          action: 'guest_text',
          session_time: ($('floor-session').value || '').trim() || 'TBD',
        });
        if (result.body && result.body.guest_text) {
          $('guest-text-box').hidden = false;
          $('guest-text-out').textContent = result.body.guest_text;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(result.body.guest_text);
            }
          } catch (e) {}
        }
        showResult('floor', result.body, !result.ok);
      } catch (e) {
        showResult('floor', { ok: false, error: e.message || String(e) }, true);
      } finally {
        setBusy(btn, false);
      }
    });
  }

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
      badge.textContent = 'PIE unavailable — use Review OPTIONS (deterministic day-type fallback).';
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
        if ($('review-edit-id')) $('review-edit-id').value = id;
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
      showResult(currentRole() === 'library' ? 'library' : currentRole() === 'review' ? 'review' : currentRole(), result.body, !result.ok);
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
  ['result-today', 'result-kitchen', 'result-floor', 'result-claims', 'result-library', 'result-review'].forEach(function (id) {
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
