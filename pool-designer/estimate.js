// Pool Estimator — internal, data-driven.
// Line items, rates, markup all editable. Formulas reference design + input vars.

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Defaults ----------
  const DEFAULT_INPUTS = {
    plumbLines: 6,
    plumbDist: 30,
    rebarSp: 12,   // o.c. inches
    rebarSz: 4,    // bar number
    plasterTier: 1,
    deckSf: 400,
    numLights: 2,
    autoCover: 0,
  };

  const DEFAULT_MARKUP = {
    overhead: 15,
    contingency: 5,
    margin: 25,
    markup: 33.33,   // = 25/(100-25)*100
    tax: 0,
    mode: 'margin',  // 'margin' or 'markup' drives the other
  };

  // SoCal 2025-ish defaults. Mat = materials landed, Lab = labor (inc crew burden).
  // qtyExpr may reference any var in VARS_LIST.
  const DEFAULT_ITEMS = [
    { group:'earth',  desc:'Excavation + spoil haul',             qtyExpr:'excCuft',                                  unit:'ft³', mat:2.00,  lab:6.50 },
    { group:'plumb',  desc:'Pool plumbing lines',                 qtyExpr:'plumbLines',                               unit:'ea',  mat:150,   lab:475  },
    { group:'plumb',  desc:'Trench + pipe to equipment',          qtyExpr:'plumbDist',                                unit:'ft',  mat:7,     lab:11   },
    { group:'steel',  desc:'Rebar tied (size × spacing adj.)',    qtyExpr:'poolSf * rebarSpMult * rebarSzMult',       unit:'ft²', mat:1.50,  lab:2.00 },
    { group:'shell',  desc:'Gunite / shotcrete',                  qtyExpr:'plasterSf * 1.15',                         unit:'ft²', mat:12,    lab:10   },
    { group:'finish', desc:'Waterline tile',                      qtyExpr:'tileLf',                                   unit:'lf',  mat:18,    lab:24   },
    { group:'finish', desc:'Plaster (tier-adjusted)',             qtyExpr:'plasterSf * plasterTierMult',              unit:'ft²', mat:3.50,  lab:3.00 },
    { group:'finish', desc:'Coping',                              qtyExpr:'copingLf',                                 unit:'lf',  mat:24,    lab:24   },
    { group:'deck',   desc:'Concrete deck (broomed)',             qtyExpr:'deckSf',                                   unit:'ft²', mat:6,     lab:9    },
    { group:'elec',   desc:'Electrical base (bond/panel/timer)',  qtyExpr:'1',                                        unit:'ls',  mat:0,     lab:4500 },
    { group:'elec',   desc:'Pool lights',                         qtyExpr:'numLights',                                unit:'ea',  mat:250,   lab:300  },
    { group:'equip',  desc:'Variable-speed pump',                 qtyExpr:'1',                                        unit:'ea',  mat:1500,  lab:150  },
    { group:'equip',  desc:'Cartridge filter',                    qtyExpr:'1',                                        unit:'ea',  mat:950,   lab:150  },
    { group:'equip',  desc:'Gas heater 400k BTU',                 qtyExpr:'1',                                        unit:'ea',  mat:3800,  lab:250  },
    { group:'equip',  desc:'Salt chlorinator',                    qtyExpr:'1',                                        unit:'ea',  mat:1400,  lab:150  },
    { group:'equip',  desc:'Automation panel',                    qtyExpr:'1',                                        unit:'ea',  mat:2800,  lab:400  },
    { group:'cover',  desc:'Auto-cover base (if enabled)',        qtyExpr:'autoCover',                                unit:'ls',  mat:10500, lab:0    },
    { group:'cover',  desc:'Auto-cover per ft²',                  qtyExpr:'autoCover * poolSf',                       unit:'ft²', mat:10,    lab:4    },
    { group:'fees',   desc:'Permit & engineering',                qtyExpr:'1',                                        unit:'ls',  mat:3500,  lab:0    },
    { group:'fees',   desc:'Start-up / water / chemicals',        qtyExpr:'1',                                        unit:'ls',  mat:300,   lab:500  },
  ];

  const GROUPS_ORDER = ['earth','plumb','steel','shell','finish','deck','elec','equip','cover','fees','misc'];
  const COMMON_UNITS = ['ft³','ft²','lf','ea','ls','ft','yd³','hr'];
  const VARS_LIST = [
    'poolSf','perimeterFt','waterVolumeGal','excCuft','avgDepthFt','maxDepthFt',
    'widthFt','lengthFt','tileLf','copingLf','plasterSf',
    'plumbLines','plumbDist','rebarSp','rebarSz','plasterTier','deckSf','numLights','autoCover',
    'rebarSpMult','rebarSzMult','plasterTierMult',
  ];

  // ---------- Formatters ----------
  const money = (n) => {
    const v = Math.round((+n || 0) * 100) / 100;
    const s = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-$' + s.replace('-','') : '$' + s);
  };
  const money0 = (n) => '$' + Math.round(+n || 0).toLocaleString();
  const fmt0 = (n) => Math.round(+n || 0).toLocaleString();
  const fmt1 = (n) => (+n || 0).toFixed(1);
  const fmt2 = (n) => (+n || 0).toFixed(2);
  const fmtFt = (ft) => {
    const f = Math.abs(+ft || 0);
    const whole = Math.floor(f);
    const inches = Math.round((f - whole) * 12);
    if (inches === 12) return `${whole + 1}′ 0″`;
    return `${whole}′ ${inches}″`;
  };

  // ---------- Persistence ----------
  const STATE_KEY = 'poolEstimatorState_v2';

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.items)) return null;
      return s;
    } catch { return null; }
  }
  function saveState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
  }
  // Demo pool used as starting point when there is no designer spec.
  const DEFAULT_DESIGN = {
    widthFt: 16, lengthFt: 32,
    avgDepthFt: 4.2, maxDepthFt: 8,
    poolSf: 512, perimeterFt: 96,
    waterVolumeGal: 16000,
    excCuft: 2745, tileLf: 96, copingLf: 96, plasterSf: 915,
  };

  // Primaries are always user-entered. Derived default to auto-computed from
  // primaries; each can be locked to manual override (from the designer spec
  // or direct user entry for non-rectangular pools).
  const DESIGN_PRIMARIES = ['widthFt','lengthFt','avgDepthFt','maxDepthFt'];
  const DESIGN_DERIVED   = ['poolSf','perimeterFt','tileLf','copingLf','waterVolumeGal','plasterSf','excCuft'];

  function defaultState() {
    return {
      items: DEFAULT_ITEMS.map(it => ({ ...it })),
      inputs: { ...DEFAULT_INPUTS },
      design: { ...DEFAULT_DESIGN },
      designManual: {},  // {fieldName: true} means locked/manual; absent => auto-computed
      markup: { ...DEFAULT_MARKUP },
    };
  }

  // Compute derived design quantities from primaries + any locked (manual)
  // upstream values. Mutates state.design in-place, only overwriting derived
  // fields that are not marked manual.
  function recomputeDesign(state) {
    const d = state.design;
    const m = state.designManual || {};
    const W = +d.widthFt || 0;
    const L = +d.lengthFt || 0;
    const avgD = +d.avgDepthFt || 0;

    if (!m.poolSf)         d.poolSf = W * L;
    if (!m.perimeterFt)    d.perimeterFt = 2 * (W + L);
    if (!m.tileLf)         d.tileLf = d.perimeterFt;
    if (!m.copingLf)       d.copingLf = d.perimeterFt;
    if (!m.waterVolumeGal) d.waterVolumeGal = d.poolSf * avgD * 7.4805;
    if (!m.plasterSf)      d.plasterSf = d.poolSf + d.perimeterFt * avgD;
    if (!m.excCuft)        d.excCuft = (W + 2) * (L + 2) * (avgD + 1);
  }

  // Pull design quantities from a loaded spec into the flat shape used by state.design.
  function designFromSpec(spec) {
    const d = spec.derived || {};
    const dims = spec.dims || {};
    return {
      widthFt: +dims.widthFt || 0,
      lengthFt: +dims.lengthFt || 0,
      avgDepthFt: +d.avgDepthFt || 0,
      maxDepthFt: +d.maxDepthFt || 0,
      poolSf: +d.surfaceAreaFt2 || 0,
      perimeterFt: +d.perimeterFt || 0,
      waterVolumeGal: +d.waterVolumeGal || 0,
      excCuft: +d.excavationCuft || 0,
      tileLf: +d.tileLf || 0,
      copingLf: +d.copingLf || 0,
      plasterSf: +d.plasterSf || 0,
    };
  }

  // ---------- Formula evaluator ----------
  // Safe-ish: compiles a function with a whitelisted set of var names.
  // Not a sandbox, but fine for an internal tool.
  const _exprCache = new Map();
  function compileExpr(expr) {
    if (_exprCache.has(expr)) return _exprCache.get(expr);
    let fn;
    try {
      fn = new Function(...VARS_LIST, `"use strict"; return (${expr});`);
    } catch (e) {
      fn = () => { throw e; };
    }
    _exprCache.set(expr, fn);
    return fn;
  }
  function evalExpr(expr, ctx) {
    if (expr == null || expr === '') return { ok: true, value: 0 };
    try {
      const fn = compileExpr(String(expr));
      const args = VARS_LIST.map(n => +ctx[n] || 0);
      const v = fn(...args);
      if (!isFinite(v)) return { ok: false, value: 0, err: 'non-finite' };
      return { ok: true, value: +v };
    } catch (e) {
      return { ok: false, value: 0, err: e.message || String(e) };
    }
  }

  // ---------- Spec (from designer) ----------
  function loadSpec() {
    try {
      const raw = localStorage.getItem('poolDesignerSpec');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }
  function demoSpec() {
    return {
      projectName: 'Demo pool',
      timestamp: Date.now(),
      dims: { widthFt: 16, lengthFt: 32 },
      derived: {
        surfaceAreaFt2: 512, perimeterFt: 96, waterVolumeGal: 16000,
        avgDepthFt: 4.2, maxDepthFt: 8,
        excavationCuft: 2745, tileLf: 96, copingLf: 96, plasterSf: 915,
      },
      sections: [],
    };
  }

  // ---------- Derived context for formulas ----------
  // Reads everything from state (design quantities + user inputs).
  function buildCtx(state) {
    const d = state.design || {};
    const inputs = state.inputs || {};
    const rebarSpMult = ({ 6: 2.0, 8: 1.5, 12: 1.0 }[inputs.rebarSp]) || 1.0;
    const rebarSzMult = ({ 3: 0.85, 4: 1.0, 5: 1.25 }[inputs.rebarSz]) || 1.0;
    const plasterTierMult = inputs.plasterTier === 2 ? 1.20 : inputs.plasterTier === 3 ? 1.44 : 1.00;
    return {
      poolSf: +d.poolSf || 0,
      perimeterFt: +d.perimeterFt || 0,
      waterVolumeGal: +d.waterVolumeGal || 0,
      excCuft: +d.excCuft || 0,
      avgDepthFt: +d.avgDepthFt || 0,
      maxDepthFt: +d.maxDepthFt || 0,
      widthFt: +d.widthFt || 0,
      lengthFt: +d.lengthFt || 0,
      tileLf: +d.tileLf || 0,
      copingLf: +d.copingLf || 0,
      plasterSf: +d.plasterSf || 0,
      plumbLines: +inputs.plumbLines || 0,
      plumbDist: +inputs.plumbDist || 0,
      rebarSp: +inputs.rebarSp || 0,
      rebarSz: +inputs.rebarSz || 0,
      plasterTier: +inputs.plasterTier || 1,
      deckSf: +inputs.deckSf || 0,
      numLights: +inputs.numLights || 0,
      autoCover: inputs.autoCover ? 1 : 0,
      rebarSpMult, rebarSzMult, plasterTierMult,
    };
  }

  // Expose for the next chunk.
  window.__est = { $, DEFAULT_INPUTS, DEFAULT_MARKUP, DEFAULT_ITEMS, DEFAULT_DESIGN,
    DESIGN_PRIMARIES, DESIGN_DERIVED,
    GROUPS_ORDER, COMMON_UNITS, VARS_LIST,
    money, money0, fmt0, fmt1, fmt2, fmtFt,
    loadState, saveState, defaultState, evalExpr, loadSpec, demoSpec,
    buildCtx, designFromSpec, recomputeDesign };
})();

// ==================== Render chunk ====================
(() => {
  const E = window.__est;
  const { $, money, money0, fmt0, fmt1, fmtFt, GROUPS_ORDER, COMMON_UNITS, VARS_LIST, evalExpr, buildCtx } = E;

  // Render the editable design-quantities grid.
  // Primaries (W, L, avg/max depth) are always editable.
  // Derived (area, perimeter, volume, etc.) default to auto-computed from
  // primaries; clicking their "auto" pill switches to manual override.
  E.renderDesignInputs = function(state, onChange, onLockToggle) {
    const host = $('design_inputs');
    host.innerHTML = '';
    const primaries = [
      ['widthFt',    'width ft',     0.5],
      ['lengthFt',   'length ft',    0.5],
      ['avgDepthFt', 'avg depth ft', 0.1],
      ['maxDepthFt', 'max depth ft', 0.1],
    ];
    const derived = [
      ['poolSf',         'area ft²',       1],
      ['perimeterFt',    'perimeter lf',   1],
      ['waterVolumeGal', 'volume gal',     100],
      ['excCuft',        'excavation ft³', 10],
      ['tileLf',         'tile lf',        1],
      ['copingLf',       'coping lf',      1],
      ['plasterSf',      'plaster ft²',    1],
    ];
    const m = state.designManual || {};

    primaries.forEach(([key, lbl, step]) => {
      const w = document.createElement('label');
      w.innerHTML = `<span class="lbl">${lbl}</span>
        <input type="number" data-dkey="${key}" min="0" step="${step}" value="${+(state.design[key] || 0)}"/>`;
      host.appendChild(w);
    });
    derived.forEach(([key, lbl, step]) => {
      const manual = !!m[key];
      const w = document.createElement('label');
      w.className = 'derived';
      w.innerHTML = `<span class="lbl">${lbl}</span>
        <input type="number" data-dkey="${key}" data-derived="1" ${manual?'':'readonly tabindex="-1"'} min="0" step="${step}" value="${fmt(+(state.design[key] || 0))}"/>
        <span class="lock ${manual?'manual':'auto'}" data-lock-for="${key}" title="click to ${manual?'auto-compute from dims':'lock as manual override'}">${manual?'manual':'auto'}</span>`;
      host.appendChild(w);
    });

    host.oninput = onChange;
    host.onchange = onChange;

    // Lock toggles (click handler delegated on host).
    host.querySelectorAll('.lock').forEach(el => {
      el.addEventListener('click', () => onLockToggle(el.dataset.lockFor));
    });
  };

  // Format numbers for the design inputs. Use integer for big values,
  // one decimal for depths + small dims (avoids "16000.00000..." noise).
  function fmt(n) {
    const v = +n || 0;
    if (Math.abs(v) >= 100) return Math.round(v).toString();
    return (Math.round(v * 10) / 10).toString();
  }

  // Read current design input values back from DOM, then recompute any
  // auto-derived fields from the primaries. Mutates state.design.
  E.readDesign = function(state) {
    const m = state.designManual || {};
    const inputs = $('design_inputs').querySelectorAll('input[data-dkey]');
    inputs.forEach(i => {
      const k = i.dataset.dkey;
      const isDerived = i.dataset.derived === '1';
      // Skip readonly auto-derived fields; they get recomputed below.
      if (isDerived && !m[k]) return;
      state.design[k] = +i.value || 0;
    });
    E.recomputeDesign(state);
  };

  // Write auto-derived design values back to their DOM inputs (so you see
  // area/perimeter/etc. update live when you type a primary).
  E.updateDesignDOM = function(state) {
    const m = state.designManual || {};
    E.DESIGN_DERIVED.forEach(k => {
      if (m[k]) return;  // manual override: leave the user's value alone
      const el = $('design_inputs').querySelector(`input[data-dkey="${k}"]`);
      if (!el) return;
      if (document.activeElement === el) return;  // don't clobber while user is focused
      el.value = fmt(+state.design[k] || 0);
    });
  };

  // Render the project-input controls (plumb, rebar, plaster tier, deck, lights, autocover).
  E.renderInputs = function(state, onChange) {
    const host = $('proj_inputs');
    host.innerHTML = '';
    const mk = (html) => { const w = document.createElement('div'); w.innerHTML = html; return w.firstElementChild; };
    const row = (inner) => mk(`<label>${inner}</label>`);
    const num = (id, lbl, val, min=0, step=1) =>
      row(`<span class="lbl">${lbl}</span><input type="number" id="${id}" min="${min}" step="${step}" value="${val}"/>`);
    const sel = (id, lbl, val, opts) =>
      row(`<span class="lbl">${lbl}</span><select id="${id}">${opts.map(o =>
        `<option value="${o.v}"${String(o.v)===String(val)?' selected':''}>${o.t}</option>`
      ).join('')}</select>`);
    const chk = (id, lbl, val) =>
      row(`<input type="checkbox" id="${id}"${val?' checked':''}/><span class="lbl" style="min-width:0">${lbl}</span>`);

    const i = state.inputs;
    host.appendChild(num('in_plumbLines', 'plumb lines', i.plumbLines));
    host.appendChild(num('in_plumbDist',  'plumb dist ft', i.plumbDist));
    host.appendChild(sel('in_rebarSp',    'rebar o.c.', i.rebarSp, [{v:6,t:'6″'},{v:8,t:'8″'},{v:12,t:'12″'}]));
    host.appendChild(sel('in_rebarSz',    'rebar size', i.rebarSz, [{v:3,t:'#3'},{v:4,t:'#4'},{v:5,t:'#5'}]));
    host.appendChild(sel('in_plasterTier','plaster tier', i.plasterTier, [{v:1,t:'T1 base'},{v:2,t:'T2 +20%'},{v:3,t:'T3 +44%'}]));
    host.appendChild(num('in_deckSf',     'deck ft²', i.deckSf));
    host.appendChild(num('in_numLights',  'lights', i.numLights));
    host.appendChild(chk('in_autoCover',  'auto-cover', i.autoCover));

    host.oninput = onChange;
    host.onchange = onChange;
  };

  // Read current input values back from the DOM into state.inputs.
  E.readInputs = function(state) {
    const i = state.inputs;
    i.plumbLines  = +$('in_plumbLines').value || 0;
    i.plumbDist   = +$('in_plumbDist').value || 0;
    i.rebarSp     = +$('in_rebarSp').value || 12;
    i.rebarSz     = +$('in_rebarSz').value || 4;
    i.plasterTier = +$('in_plasterTier').value || 1;
    i.deckSf      = +$('in_deckSf').value || 0;
    i.numLights   = +$('in_numLights').value || 0;
    i.autoCover   = $('in_autoCover').checked ? 1 : 0;
  };

  // Render the full editable line-items table.
  E.renderItems = function(state, ctx, onChange) {
    const body = $('items_body');
    body.innerHTML = '';

    // Sort groups so same-group items sit together but user order within a group is preserved.
    const grouped = new Map();
    state.items.forEach((it, idx) => {
      const g = it.group || 'misc';
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(idx);
    });
    const orderedGroups = [...grouped.keys()].sort((a,b) => {
      const ia = GROUPS_ORDER.indexOf(a), ib = GROUPS_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    let currentGroup = null;
    orderedGroups.forEach(g => {
      grouped.get(g).forEach((idx, k) => {
        if (k === 0) {
          const hd = document.createElement('tr');
          hd.className = 'group-hd';
          hd.innerHTML = `<td colspan="9">${g}</td>`;
          body.appendChild(hd);
        }
        body.appendChild(buildItemRow(state, idx, ctx, onChange));
      });
    });

    $('vars_hint').textContent = VARS_LIST.join(', ');
  };

  function buildItemRow(state, idx, ctx, onChange) {
    const it = state.items[idx];
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    const q = evalExpr(it.qtyExpr, ctx);
    const qty = q.value;
    const ext = qty * ((+it.mat || 0) + (+it.lab || 0));

    const unitOpts = COMMON_UNITS.map(u =>
      `<option value="${u}"${u===it.unit?' selected':''}>${u}</option>`
    ).join('');

    tr.innerHTML = `
      <td data-label="group"><input class="f-group" value="${esc(it.group||'')}" list="groups-dl" /></td>
      <td data-label="description"><input class="f-desc" value="${esc(it.desc||'')}" /></td>
      <td data-label="qty formula" class="${q.ok ? '' : 'err'}"><input class="qexpr f-qexpr" value="${esc(it.qtyExpr||'')}" title="${q.ok?'':'error: '+(q.err||'invalid')}"/></td>
      <td data-label="qty" class="num calc">${q.ok ? fmt2(qty) : '—'}</td>
      <td data-label="unit"><select class="f-unit">${unitOpts}</select></td>
      <td data-label="$ mat/u" class="num"><input type="number" class="f-mat" step="0.01" value="${it.mat ?? 0}"/></td>
      <td data-label="$ lab/u" class="num"><input type="number" class="f-lab" step="0.01" value="${it.lab ?? 0}"/></td>
      <td data-label="ext $" class="num calc ext">${money0(ext)}</td>
      <td class="del"><button title="Remove" data-act="del">✕</button></td>
    `;

    tr.querySelectorAll('input,select').forEach(el => {
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    });
    tr.querySelector('button[data-act=del]').addEventListener('click', () => {
      state.items.splice(idx, 1);
      onChange();
    });
    return tr;
  }

  function fmt2(n){ return (+n || 0).toFixed(2); }
  function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  // Read all table rows back into state.items.
  E.readItems = function(state) {
    const rows = [...$('items_body').querySelectorAll('tr[data-idx]')];
    // Rebuild in DOM order so reordering (future) is preserved.
    const next = rows.map(tr => ({
      group:  tr.querySelector('.f-group').value.trim() || 'misc',
      desc:   tr.querySelector('.f-desc').value,
      qtyExpr: tr.querySelector('.f-qexpr').value,
      unit:   tr.querySelector('.f-unit').value,
      mat:    +tr.querySelector('.f-mat').value || 0,
      lab:    +tr.querySelector('.f-lab').value || 0,
    }));
    state.items = next;
  };

  // Render the markup/overhead inputs (syncs margin <-> markup).
  E.renderMarkup = function(state) {
    const m = state.markup;
    $('m_overhead').value = m.overhead;
    $('m_contingency').value = m.contingency;
    $('m_tax').value = m.tax;
    $('m_margin').value = m.margin;
    $('m_markup').value = m.markup;
    document.querySelectorAll('input[name=mode]').forEach(r => { r.checked = r.value === m.mode; });
  };
})();

// ==================== Compute + boot chunk ====================
(() => {
  const E = window.__est;
  const { $, money, money0, fmt0, fmt1, evalExpr, buildCtx,
          loadState, saveState, defaultState, loadSpec, demoSpec } = E;

  // Compute the full cost cascade.
  function computeTotals(state, ctx) {
    let direct = 0, matCost = 0, labCost = 0;
    state.items.forEach(it => {
      const q = evalExpr(it.qtyExpr, ctx);
      if (!q.ok) return;
      const qty = q.value;
      matCost += qty * (+it.mat || 0);
      labCost += qty * (+it.lab || 0);
    });
    direct = matCost + labCost;

    const m = state.markup;
    const overhead = direct * (+m.overhead || 0) / 100;
    const contingency = direct * (+m.contingency || 0) / 100;
    const tax = matCost * (+m.tax || 0) / 100;
    const subtotal = direct + overhead + contingency + tax;

    // Profit: margin is of sell price, markup is on cost.
    let margin, price;
    if (m.mode === 'markup') {
      const mk = (+m.markup || 0) / 100;
      margin = subtotal * mk;
      price = subtotal + margin;
    } else {
      const mg = Math.min(Math.max(+m.margin || 0, 0), 99) / 100;
      price = subtotal / (1 - mg);
      margin = price - subtotal;
    }

    const poolSf = ctx.poolSf || 1;
    return {
      matCost, labCost, direct, overhead, contingency, tax,
      subtotal, margin, price,
      costPerSf: price / Math.max(poolSf, 1),
      profitPct: price > 0 ? (margin / price) * 100 : 0,
    };
  }
  E.computeTotals = computeTotals;

  // Render the totals card.
  E.renderTotals = function(t) {
    const rows = [
      ['materials',       money(t.matCost)],
      ['labor',           money(t.labCost)],
      ['direct cost',     money(t.direct), 'sub'],
      ['overhead',        money(t.overhead)],
      ['contingency',     money(t.contingency)],
      ['tax on materials',money(t.tax)],
      ['subtotal',        money(t.subtotal), 'sub'],
      ['margin / profit', money(t.margin)],
    ];
    let html = rows.map(([k,v,cls]) =>
      `<div class="row${cls?' '+cls:''}"><span class="k">${k}</span><span class="v">${v}</span></div>`
    ).join('');
    html += `<div class="row price"><span class="k">customer price</span><span class="v">${money(t.price)}</span></div>`;
    html += `<div class="meta">
      <span>cost / ft² pool <b>${money0(t.costPerSf)}</b></span>
      <span>profit <b>${t.profitPct.toFixed(1)}%</b></span>
      <span>mat share <b>${t.direct>0?((t.matCost/t.direct)*100).toFixed(0):0}%</b></span>
    </div>`;
    $('totals').innerHTML = html;
  };

  // Render the sticky top summary strip.
  E.renderSummary = function(t) {
    $('summary').innerHTML = `
      <span>direct <b>${money0(t.direct)}</b></span>
      <span>+ oh <b>${money0(t.overhead)}</b></span>
      <span>+ cont <b>${money0(t.contingency)}</b></span>
      <span>+ margin <b>${money0(t.margin)}</b></span>
      <span class="price">price <b>${money0(t.price)}</b></span>
      <span>·</span>
      <span>$/ft² <b>${money0(t.costPerSf)}</b></span>
    `;
  };

  // Markup <-> margin sync.
  function syncMarginMarkup(state) {
    const m = state.markup;
    if (m.mode === 'markup') {
      const mk = (+m.markup || 0) / 100;
      const mg = mk / (1 + mk);
      m.margin = +(mg * 100).toFixed(2);
    } else {
      const mg = Math.min(Math.max(+m.margin || 0, 0), 99) / 100;
      const mk = mg / (1 - mg);
      m.markup = +(mk * 100).toFixed(2);
    }
  }

  // ---------- Boot ----------
  // Load persisted state if any. If none and a designer spec is present, seed
  // state.design from the spec. Otherwise fall back to demo defaults.
  // Convenience: mark all derived design fields as manual. Used when loading
  // from a designer spec (where the authoritative values come from a real
  // pool shape — not a rectangle — so auto-recompute would overwrite them).
  const allDerivedManual = () =>
    Object.fromEntries(E.DESIGN_DERIVED.map(k => [k, true]));

  const STATE_VERSION = 2;

  let state = loadState();
  let spec = loadSpec();
  if (!state) {
    state = defaultState();
    state.v = STATE_VERSION;
    if (spec) {
      state.design = E.designFromSpec(spec);
      state.designManual = allDerivedManual();
    }
  }
  // Migrate older persisted states that predate state.design / designManual.
  if (!state.design) {
    state.design = spec ? E.designFromSpec(spec) : { ...E.DEFAULT_DESIGN };
  }
  if (!state.designManual) state.designManual = {};
  // v2 migration: earlier builds defaulted legacy state to "all manual",
  // which blocked auto-compute when entering width/length/depth. Flip to auto.
  if ((state.v || 1) < 2) {
    state.designManual = {};
    state.v = 2;
  }
  if (!spec) $('warn_spec').style.display = '';

  function setProjectLabel() {
    const name = spec && spec.projectName ? spec.projectName : 'Pool Estimate';
    $('proj_name').textContent = name;
    const d = state.design || {};
    $('proj_dims').textContent =
      (d.widthFt > 0 && d.lengthFt > 0)
        ? `${fmt1(d.widthFt)}′ × ${fmt1(d.lengthFt)}′`
        : '';
  }
  setProjectLabel();

  function recalc() {
    E.readDesign(state);
    E.readInputs(state);
    E.readItems(state);
    readMarkup();
    syncMarginMarkup(state);
    saveState(state);
    setProjectLabel();
    E.updateDesignDOM(state);
    const ctx = buildCtx(state);
    // Re-render items so qty/ext cells update live; preserves input focus via DOM reuse? No, full rebuild.
    // To keep focus during typing, only recompute qty/ext cells instead of full rebuild.
    softUpdateItems(ctx);
    const t = E.computeTotals(state, ctx);
    E.renderTotals(t);
    E.renderSummary(t);
    // Update only the MIRRORED markup field so typing in margin/markup doesn't
    // clobber its own trailing dot.
    if (state.markup.mode === 'margin') $('m_markup').value = state.markup.markup;
    else $('m_margin').value = state.markup.margin;
  }

  function softUpdateItems(ctx) {
    const rows = [...$('items_body').querySelectorAll('tr[data-idx]')];
    rows.forEach((tr) => {
      const qexprEl = tr.querySelector('.f-qexpr');
      const qCell = tr.querySelector('td.calc:not(.ext)');
      const extCell = tr.querySelector('td.ext');
      const matEl = tr.querySelector('.f-mat');
      const labEl = tr.querySelector('.f-lab');
      const q = evalExpr(qexprEl.value, ctx);
      if (q.ok) {
        qCell.textContent = (+q.value).toFixed(2);
        qexprEl.parentElement.classList.remove('err');
      } else {
        qCell.textContent = '—';
        qexprEl.parentElement.classList.add('err');
      }
      const ext = (q.ok ? q.value : 0) * ((+matEl.value || 0) + (+labEl.value || 0));
      extCell.textContent = money0(ext);
    });
  }

  function readMarkup() {
    const m = state.markup;
    m.overhead    = +$('m_overhead').value || 0;
    m.contingency = +$('m_contingency').value || 0;
    m.tax         = +$('m_tax').value || 0;
    m.margin      = +$('m_margin').value || 0;
    m.markup      = +$('m_markup').value || 0;
    const modeEl = document.querySelector('input[name=mode]:checked');
    if (modeEl) m.mode = modeEl.value;
  }

  function toggleLock(key) {
    state.designManual = state.designManual || {};
    // Capture any in-flight edits in other fields first.
    E.readDesign(state);
    E.readInputs(state);
    E.readItems(state);
    readMarkup();
    syncMarginMarkup(state);
    // Flip the lock. If flipping to auto, recomputeDesign overwrites the value
    // with the computed one. If flipping to manual, keep the current value.
    if (state.designManual[key]) delete state.designManual[key];
    else state.designManual[key] = true;
    E.recomputeDesign(state);
    saveState(state);
    fullRender();
  }

  function fullRender() {
    setProjectLabel();
    // Make sure derived values are fresh before rendering inputs.
    E.recomputeDesign(state);
    const ctx0 = buildCtx(state);
    E.renderDesignInputs(state, recalc, toggleLock);
    E.renderInputs(state, recalc);
    E.renderItems(state, ctx0, recalc);
    E.renderMarkup(state);
    const t = E.computeTotals(state, ctx0);
    E.renderTotals(t);
    E.renderSummary(t);
  }

  // Initial render
  fullRender();

  // ---------- Event wiring ----------
  // Markup field typing auto-flips mode to the field being edited.
  $('m_margin').addEventListener('input', () => { state.markup.mode = 'margin'; recalc(); });
  $('m_markup').addEventListener('input', () => { state.markup.mode = 'markup'; recalc(); });
  $('m_overhead').addEventListener('input', recalc);
  $('m_contingency').addEventListener('input', recalc);
  $('m_tax').addEventListener('input', recalc);
  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', recalc));

  $('btn_add_row').addEventListener('click', () => {
    E.readDesign(state); E.readInputs(state); E.readItems(state);
    state.items.push({ group:'misc', desc:'New item', qtyExpr:'1', unit:'ea', mat:0, lab:0 });
    saveState(state);
    fullRender();
  });

  $('btn_sort_group').addEventListener('click', () => {
    E.readDesign(state); E.readInputs(state); E.readItems(state);
    state.items.sort((a,b) => {
      const ia = E.GROUPS_ORDER.indexOf(a.group), ib = E.GROUPS_ORDER.indexOf(b.group);
      return (ia<0?99:ia) - (ib<0?99:ib);
    });
    saveState(state);
    fullRender();
  });

  $('btn_reload').addEventListener('click', () => {
    const s = loadSpec();
    if (!s) { alert('No designer spec found. Open the designer and click → Open estimator.'); return; }
    spec = s;
    state.design = E.designFromSpec(s);
    state.designManual = allDerivedManual();
    saveState(state);
    $('warn_spec').style.display = 'none';
    fullRender();
  });

  $('btn_reset').addEventListener('click', () => {
    if (!confirm('Reset line items, inputs, and markup to defaults? Current edits will be lost.')) return;
    state = defaultState();
    saveState(state);
    fullRender();
  });

  $('btn_print').addEventListener('click', () => window.print());

  // Export / import JSON
  const dlg = $('json_dialog');
  $('btn_export').addEventListener('click', () => {
    E.readDesign(state); E.readInputs(state); E.readItems(state); readMarkup();
    saveState(state);
    $('json_title').textContent = 'Export JSON';
    $('json_text').value = JSON.stringify(state, null, 2);
    $('json_apply').style.display = 'none';
    dlg.showModal();
  });
  $('btn_import').addEventListener('click', () => {
    $('json_title').textContent = 'Import JSON (paste + apply)';
    $('json_text').value = '';
    $('json_apply').style.display = '';
    dlg.showModal();
  });
  $('json_close').addEventListener('click', () => dlg.close());
  $('json_copy').addEventListener('click', () => {
    const t = $('json_text');
    t.select();
    try { navigator.clipboard.writeText(t.value); } catch {}
  });
  $('json_apply').addEventListener('click', () => {
    try {
      const next = JSON.parse($('json_text').value);
      if (!next || !Array.isArray(next.items)) throw new Error('missing items[]');
      state = {
        items: next.items,
        inputs: { ...E.DEFAULT_INPUTS, ...(next.inputs || {}) },
        design: { ...E.DEFAULT_DESIGN, ...(next.design || {}) },
        designManual: next.designManual || allDerivedManual(),
        markup: { ...E.DEFAULT_MARKUP, ...(next.markup || {}) },
      };
      saveState(state);
      dlg.close();
      fullRender();
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  });
})();

