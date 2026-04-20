// Customer-facing proposal — reads estimator state, hides rates/margin,
// shows feature-grouped specs + grand total + editable inclusions/exclusions.
(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Load estimator state ----------
  let estState = null;
  try { estState = JSON.parse(localStorage.getItem('poolEstimatorState_v2') || 'null'); } catch {}
  if (!estState || !estState.items) {
    document.body.innerHTML =
      '<div style="padding:60px 20px;text-align:center;font-family:Inter,sans-serif;color:#3b4048">' +
      '<h2 style="font-family:Cormorant Garamond,serif;font-size:28px;font-weight:600">No estimate loaded</h2>' +
      '<p>Open the <a href="/estimate.html" style="color:#2ea3d8">estimator</a>, configure the pool and rates, then return here to preview the proposal.</p>' +
      '</div>';
    return;
  }

  // ---------- Proposal-specific state ----------
  const PROPOSAL_KEY = 'poolProposalState_v1';
  const DEFAULT_INCLUSIONS = [
    'Design and construction of a residential swimming pool and spa in accordance with the agreed specifications and plans.',
    'Excavation, structural shell (steel + gunite), waterline tile, coping, and interior plaster finish per the plans.',
    'Installation and commissioning of necessary pool equipment: circulation pump, filtration, heater, sanitizer, and smart controls.',
    'Electrical work to the equipment pad (up to 50 ft run) and junction box for light fixtures (18″ above waterline).',
    'Deck and decking finish of the size and type specified in the plans.',
    'All necessary permits and inspections (up to $500 in fees; anything above passed through at cost).',
    'Pool start-up, chemical balancing, and initial water fill.',
  ];
  const DEFAULT_EXCLUSIONS = [
    'Import / export of soil beyond standard excavation haul-off.',
    'Permit fees exceeding $500 (passed through at cost).',
    'Temporary or permanent fencing during or after construction.',
    'Additional water features or pumps beyond those specified above.',
    'Utilities (gas, electrical, water) to the equipment pad — owner provides within 5 ft.',
    'Coping or decking beyond the scope specified above.',
    'Additional framing required due to soil conditions.',
    'Core drilling through existing structures.',
    'Colored plaster or finish upgrades beyond the standard allowance.',
    'Venting for heater beyond standard configuration.',
    'Equipment located more than 80 ft from the pool.',
    'Existing landscaping — contractor makes best efforts to preserve but is not responsible for incidental damage.',
  ];

  function defaultProposal() {
    const today = new Date();
    const exp = new Date(); exp.setDate(exp.getDate() + 30);
    const fmtDate = (d) => d.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    return {
      estNum: '',
      estDate: fmtDate(today),
      estExpires: fmtDate(exp),
      custName: '',
      custAddr: '',
      custContact: '',
      heroDataUrl: '',
      inclusions: [...DEFAULT_INCLUSIONS],
      exclusions: [...DEFAULT_EXCLUSIONS],
    };
  }
  function loadProposal() {
    try {
      const s = JSON.parse(localStorage.getItem(PROPOSAL_KEY) || 'null');
      if (s) return { ...defaultProposal(), ...s };
    } catch {}
    return defaultProposal();
  }
  const saveProposal = () => localStorage.setItem(PROPOSAL_KEY, JSON.stringify(proposal));
  let proposal = loadProposal();

  // ---------- Pricing (mirrors estimator's computeTotals) ----------
  const VARS_LIST = [
    'poolSf','perimeterFt','waterVolumeGal','excCuft','avgDepthFt','maxDepthFt',
    'widthFt','lengthFt','tileLf','copingLf','plasterSf',
    'plumbLines','plumbDist','rebarSp','rebarSz','plasterTier','deckSf','numLights','autoCover','spa',
    'rebarSpMult','rebarSzMult','plasterTierMult',
  ];
  function buildCtx(s) {
    const d = s.design || {};
    const i = s.inputs || {};
    const rebarSpMult = ({6:2.0,8:1.5,12:1.0}[i.rebarSp]) || 1.0;
    const rebarSzMult = ({3:0.85,4:1.0,5:1.25}[i.rebarSz]) || 1.0;
    const plasterTierMult = i.plasterTier===2 ? 1.20 : i.plasterTier===3 ? 1.44 : 1.00;
    return {
      poolSf:+d.poolSf||0, perimeterFt:+d.perimeterFt||0,
      waterVolumeGal:+d.waterVolumeGal||0, excCuft:+d.excCuft||0,
      avgDepthFt:+d.avgDepthFt||0, maxDepthFt:+d.maxDepthFt||0,
      widthFt:+d.widthFt||0, lengthFt:+d.lengthFt||0,
      tileLf:+d.tileLf||0, copingLf:+d.copingLf||0, plasterSf:+d.plasterSf||0,
      plumbLines:+i.plumbLines||0, plumbDist:+i.plumbDist||0,
      rebarSp:+i.rebarSp||12, rebarSz:+i.rebarSz||4,
      plasterTier:+i.plasterTier||1,
      deckSf:+i.deckSf||0, numLights:+i.numLights||0,
      autoCover: i.autoCover?1:0, spa: i.spa?1:0,
      rebarSpMult, rebarSzMult, plasterTierMult,
    };
  }
  function evalExpr(expr, ctx) {
    try {
      const fn = new Function(...VARS_LIST, `"use strict"; return (${expr});`);
      const v = fn(...VARS_LIST.map(n => +ctx[n] || 0));
      return isFinite(v) ? +v : 0;
    } catch { return 0; }
  }
  function computePrice(s) {
    const ctx = buildCtx(s);
    let matCost = 0, labCost = 0;
    (s.items || []).forEach(it => {
      const qty = evalExpr(it.qtyExpr, ctx);
      matCost += qty * (+it.mat || 0);
      labCost += qty * (+it.lab || 0);
    });
    const direct = matCost + labCost;
    const m = s.markup || {};
    const overhead = direct * (+m.overhead || 0) / 100;
    const contingency = direct * (+m.contingency || 0) / 100;
    const tax = matCost * (+m.tax || 0) / 100;
    const subtotal = direct + overhead + contingency + tax;
    if (m.mode === 'markup') return subtotal * (1 + (+m.markup || 0) / 100);
    const mg = Math.min(Math.max(+m.margin || 0, 0), 99) / 100;
    return subtotal / (1 - mg);
  }

  // ---------- Format ----------
  const fmtFt = (ft) => {
    const f = Math.abs(+ft || 0);
    const whole = Math.floor(f);
    const inches = Math.round((f - whole) * 12);
    if (inches === 12) return `${whole + 1}′ 0″`;
    return `${whole}′ ${inches}″`;
  };
  const int = (n) => Math.round(+n || 0).toLocaleString();
  const money = (n) => '$' + int(n);

  // ---------- Feature rendering ----------
  function featureSpec(title, sub, rows) {
    const sec = document.createElement('section');
    sec.className = 'feature';
    sec.innerHTML = `
      <div class="sub">${sub}</div>
      <h2>${title}</h2>
      <table class="specs">
        ${rows.map(([k,v]) => `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`).join('')}
      </table>`;
    return sec;
  }
  function featureBullets(title, sub, bullets) {
    const sec = document.createElement('section');
    sec.className = 'feature';
    sec.innerHTML = `
      <div class="sub">${sub}</div>
      <h2>${title}</h2>
      <ul class="bullets">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
    return sec;
  }
  function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function renderFeatures(s) {
    const host = $('features_host');
    host.innerHTML = '';
    const d = s.design || {};
    const i = s.inputs || {};

    const plasterLabel = { 1:'Standard white plaster', 2:'Quartz finish', 3:'Pebble finish' }[+i.plasterTier || 1] || 'Standard plaster';

    const poolRows = [
      ['Dimensions', `${fmtFt(d.widthFt)} × ${fmtFt(d.lengthFt)}`],
      ['Surface area', `${int(d.poolSf)} ft²`],
      ['Perimeter', `${int(d.perimeterFt)} ft`],
      ['Water volume', `${int(d.waterVolumeGal)} gallons`],
      ['Average depth', fmtFt(d.avgDepthFt)],
      ['Maximum depth', fmtFt(d.maxDepthFt)],
      ['Interior finish', plasterLabel],
      ['Waterline tile', `${int(d.tileLf)} lf`],
      ['Coping', `${int(d.copingLf)} lf`],
      ['Pool lights', `${+i.numLights || 0}`],
    ];
    host.appendChild(featureSpec('The Pool', 'Shape, finish, and dimensions', poolRows));

    if (i.spa) {
      host.appendChild(featureBullets('The Spa', 'Attached spa with its own equipment', [
        'Dedicated pump, filter, and heater bundle',
        'Dedicated jet pump for spa therapy jets',
        'Shared smart automation controls for pool + spa modes',
      ]));
    }

    const deckSf = +i.deckSf || 0;
    if (deckSf > 0) {
      host.appendChild(featureSpec('Decking', 'Finished deck around the pool', [
        ['Broomed concrete deck', `${int(deckSf)} ft²`],
      ]));
    }

    const equipment = [
      'Variable-speed circulation pump',
      'Cartridge filtration system',
      'Natural-gas heater (400,000 BTU)',
      'Salt chlorine generator',
      'Smart automation panel',
      `${+i.numLights || 0} LED pool lights`,
    ];
    if (i.spa) equipment.push('Dedicated spa jet pump');
    host.appendChild(featureBullets('Equipment included', 'Premium equipment, professionally commissioned', equipment));

    const options = [];
    if (i.autoCover) options.push('Automatic pool cover');
    if (options.length) host.appendChild(featureBullets('Upgrades', 'Optional upgrades included in this proposal', options));

    host.appendChild(featureBullets('Construction scope', 'Everything needed to turn the pool on', [
      'Full site excavation, grading, and spoil haul-off',
      'Structural steel reinforcement and gunite shell',
      'Pool circulation plumbing plus trenching to the equipment pad',
      'Waterline tile, coping, and interior finish installation',
      'Electrical bonding, sub-panel tie-in, light fixtures, and automation wiring',
      'Permits, engineering, inspections, start-up service, and first water fill',
    ]));
  }

  // ---------- Inclusions / Exclusions lists ----------
  function renderList(ulId, items) {
    const ul = $(ulId);
    ul.innerHTML = '';
    items.forEach((txt, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<textarea class="txt" rows="1"></textarea><button class="rm" title="Remove" aria-label="Remove">✕</button>`;
      const ta = li.querySelector('.txt');
      ta.value = txt;
      const autosize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.addEventListener('input', () => { autosize(); items[idx] = ta.value; saveProposal(); });
      requestAnimationFrame(autosize);
      li.querySelector('.rm').addEventListener('click', () => {
        items.splice(idx, 1); renderList(ulId, items); saveProposal();
      });
      ul.appendChild(li);
    });
  }

  // ---------- Customer info + meta ----------
  function hydrateMeta() {
    const set = (id, v) => { const el = $(id); if (el) el.value = v || ''; };
    set('est_num', proposal.estNum);
    set('est_date', proposal.estDate);
    set('est_expires', proposal.estExpires);
    set('cust_name', proposal.custName);
    set('cust_addr', proposal.custAddr);
    set('cust_contact', proposal.custContact);
  }
  function wireMeta() {
    const bind = (id, key) => {
      $(id).addEventListener('input', () => { proposal[key] = $(id).value; saveProposal(); });
    };
    bind('est_num',     'estNum');
    bind('est_date',    'estDate');
    bind('est_expires', 'estExpires');
    bind('cust_name',   'custName');
    bind('cust_addr',   'custAddr');
    bind('cust_contact','custContact');
  }

  // ---------- Hero image ----------
  function renderHero() {
    const img = $('hero_img'), empty = $('hero_empty'), clear = $('hero_clear');
    if (proposal.heroDataUrl) {
      img.src = proposal.heroDataUrl;
      img.style.display = 'block';
      empty.style.display = 'none';
      clear.style.display = '';
    } else {
      img.style.display = 'none';
      empty.style.display = '';
      clear.style.display = 'none';
    }
  }
  function wireHero() {
    $('hero_input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      // Warn if the image is huge — base64 in localStorage bloats to ~1.3x file size,
      // and localStorage typically caps at 5-10 MB per origin.
      if (file.size > 2 * 1024 * 1024) {
        if (!confirm(`Image is ${(file.size/1024/1024).toFixed(1)} MB — large images can exceed browser storage. Continue?`)) return;
      }
      const r = new FileReader();
      r.onload = () => {
        proposal.heroDataUrl = r.result;
        try {
          saveProposal();
          renderHero();
        } catch (err) {
          alert('Image too large to save in browser storage. Try a smaller image (< 2 MB).');
          proposal.heroDataUrl = '';
        }
      };
      r.readAsDataURL(file);
    });
    $('hero_clear').addEventListener('click', () => {
      proposal.heroDataUrl = '';
      saveProposal();
      renderHero();
    });
  }

  // ---------- Boot ----------
  hydrateMeta();
  wireMeta();
  renderHero();
  wireHero();
  renderFeatures(estState);

  $('total_amt').textContent = money(computePrice(estState));

  renderList('incl_list', proposal.inclusions);
  renderList('excl_list', proposal.exclusions);

  $('incl_add').addEventListener('click', () => {
    proposal.inclusions.push('');
    renderList('incl_list', proposal.inclusions);
    saveProposal();
  });
  $('excl_add').addEventListener('click', () => {
    proposal.exclusions.push('');
    renderList('excl_list', proposal.exclusions);
    saveProposal();
  });

  $('btn_print').addEventListener('click', () => window.print());
  $('btn_reset').addEventListener('click', () => {
    if (!confirm('Reset customer info, inclusions, and exclusions to the defaults? The estimate itself is not affected.')) return;
    proposal = defaultProposal();
    saveProposal();
    location.reload();
  });
})();
