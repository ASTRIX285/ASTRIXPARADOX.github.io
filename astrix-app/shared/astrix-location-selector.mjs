// astrix-location-selector.mjs
// Journey location selector + reactive art-backdrop atmosphere.
// Builds on ForgeDestinations (astrix-destination-theme.js) for the roster,
// data-location state, persistence and the `forge:destination-changed` event.
// Visual data comes from FORGE_LOCATION_VISUALS (astrix-location-visuals.js).
//
// No invented data: the selector renders the roster; the checklist shows an honest
// empty state until a verified data provider is supplied via opts.getChecklist.
//
//   import { initLocationSelector } from '../../shared/astrix-location-selector.mjs';
//   initLocationSelector({
//     mount: document.getElementById('journeyLocationSelector'),
//     detail: document.getElementById('journeyLocationDetail'),
//     // getChecklist: async (key) => ({done,total,groups}) | null   // wired with the mechanics later
//   });

// Focus roster for Journey — patrol destinations only (Tower is a social space and
// never a focusable destination / never drives the tint).
const FOCUS = ['pale-heart','dreaming-city','neomuna','europa','throne-world','nessus','edz','moon','cosmodrome'];

export function initLocationSelector(opts = {}) {
  const AD = globalThis.ForgeDestinations;
  const VIS = globalThis.FORGE_LOCATION_VISUALS || {};
  if (!AD) { console.warn('[Forge] ForgeDestinations not loaded; location selector skipped'); return null; }

  const html = document.documentElement;
  const labelOf = (k) => AD.labelOf(k) || k;
  const keys = FOCUS.filter((k) => AD.keyOf(k) === k);

  // ---- atmosphere layer (once) ----
  let atmo = document.querySelector('.apx-atmo');
  if (!atmo) {
    atmo = document.createElement('div');
    atmo.className = 'apx-atmo';
    atmo.setAttribute('aria-hidden', 'true');
    atmo.innerHTML = '<div class="apx-atmo-base"></div><div class="apx-atmo-colour"></div><div class="apx-atmo-photos"></div><div class="apx-atmo-veil"></div>';
    document.body.insertBefore(atmo, document.body.firstChild);
  }
  const photos = atmo.querySelector('.apx-atmo-photos');
  keys.forEach((key) => {
    if (photos.querySelector(`[data-loc="${key}"]`)) return;
    const ph = document.createElement('div');
    ph.className = 'apx-atmo-photo';
    ph.dataset.loc = key;
    photos.appendChild(ph);
    const src = VIS[key] && VIS[key].image;
    if (src) {
      const probe = new Image();
      probe.onload = () => {
        ph.style.backgroundImage = `url('${src}')`;
        ph.dataset.loaded = '1';
        if (AD.current() === key) ph.classList.add('is-on');
      };
      probe.onerror = () => { /* no art yet — colour atmosphere carries this destination */ };
      probe.src = src;
    }
  });

  // ---- selector blocks ----
  const mount = opts.mount;
  let list = null;
  if (mount) {
    list = document.createElement('div');
    list.className = 'apx-loc-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Destinations');
    keys.forEach((key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'apx-loc';
      b.dataset.loc = key;
      b.setAttribute('role', 'option');
      const accent = (VIS[key] && VIS[key].accent) || '201,168,76';
      b.style.setProperty('--c', accent);   // used only when this block is selected
      const name = document.createElement('span');
      name.className = 'apx-loc-name';
      name.textContent = labelOf(key);
      const meta = document.createElement('span');
      meta.className = 'apx-loc-meta';
      meta.textContent = 'Awaiting data';
      b.append(name, meta);
      b.addEventListener('click', () => AD.set(key));
      list.appendChild(b);
    });
    mount.replaceChildren(list);
  }

  // ---- detail (band + honest-empty checklist) ----
  const detail = opts.detail || null;

  function reflectSelection(key) {
    // photos
    [...photos.children].forEach((p) =>
      p.classList.toggle('is-on', p.dataset.loc === key && p.dataset.loaded === '1'));
    // blocks
    if (list) [...list.children].forEach((b) =>
      b.setAttribute('aria-current', String(b.dataset.loc === key)));
  }

  async function renderDetail(key) {
    if (!detail) return;
    const vis = VIS[key] || {};
    const band = labelOf(key);
    let html = '';
    html += `<p class="apx-loc-band" style="color:rgba(${vis.accent || '244,239,228'},.4)">${escapeHtml(band)}</p>`;
    if (vis.lore) html += `<p class="apx-loc-desc">${escapeHtml(vis.lore)}</p>`;

    let data = null;
    if (typeof opts.getChecklist === 'function') {
      try { data = await opts.getChecklist(key); } catch { data = null; }
    }
    if (data && Array.isArray(data.groups)) {
      const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
      html += `<div class="apx-loc-prog"><span class="apx-loc-prog-bar"><i style="width:${pct}%"></i></span><span>${data.done} / ${data.total}</span></div>`;
      html += data.groups.map((g) =>
        `<p class="apx-loc-group">${escapeHtml(g.g)}</p>` + g.items.map((it) => {
          const done = it.done === true || it[0] === 'x';
          const nm = it.name || it[1] || '';
          const where = it.where || it[2] || '';
          return `<div class="apx-loc-item ${done ? 'is-done' : ''}"><span class="tick">${done ? '✓' : ''}</span><strong>${escapeHtml(nm)}</strong><span class="where">${escapeHtml(where)}</span></div>`;
        }).join('')).join('');
    } else {
      html += `<span class="apx-empty-state">Awaiting verified progression for ${escapeHtml(band)}. Connect the activity-history route to populate this checklist.</span>`;
    }
    detail.innerHTML = html;
  }

  function onChanged(ev) {
    const key = ev?.detail?.key || AD.current();
    if (!key || keys.indexOf(key) < 0) return;
    reflectSelection(key);
    renderDetail(key);
  }
  document.addEventListener('forge:destination-changed', onChanged);

  // initial selection: restored/last, else first focus destination
  const initial = keys.indexOf(AD.current()) >= 0 ? AD.current() : keys[0];
  AD.set(initial);           // fires forge:destination-changed -> onChanged
  reflectSelection(initial); // in case the event fired before listener wiring on some engines
  renderDetail(initial);

  return { destroy() { document.removeEventListener('forge:destination-changed', onChanged); } };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
