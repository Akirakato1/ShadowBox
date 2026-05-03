/**
 * Main entry: wires up tabs, initializes the geometry and designer modules.
 */

(function () {
  'use strict';

  let designer = null;

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('active', p.id === `tab-${name}`);
      });
      window.dispatchEvent(new Event('resize'));
      if (name === 'designer' && designer) designer.recompute();
    });
  });

  const geo = Geometry.init(document.getElementById('three-wrap'));

  const SLIDER_IDS = ['s-W','s-H','s-d','s-lightz','g-h','g-rlid','g-rays','d-R','d-margin'];

  function readState() {
    const v = {};
    SLIDER_IDS.forEach((id) => { v[id] = +document.getElementById(id).value; });
    return v;
  }

  function getGeoParams() {
    return {
      W: +document.getElementById('s-W').value,
      H: +document.getElementById('s-H').value,
      d: +document.getElementById('s-d').value,
      h: +document.getElementById('g-h').value,
      rlid: +document.getElementById('g-rlid').value,
      rays: +document.getElementById('g-rays').value,
      lightFrac: +document.getElementById('s-lightz').value / 100,
    };
  }

  function updateOutputs() {
    document.getElementById('s-W-out').textContent      = +document.getElementById('s-W').value;
    document.getElementById('s-H-out').textContent      = +document.getElementById('s-H').value;
    document.getElementById('s-d-out').textContent      = +document.getElementById('s-d').value;
    document.getElementById('s-lightz-out').textContent = +document.getElementById('s-lightz').value;
    document.getElementById('g-h-out').textContent      = +document.getElementById('g-h').value;
    document.getElementById('g-rlid-out').textContent   = +document.getElementById('g-rlid').value;
    document.getElementById('g-rays-out').textContent   = +document.getElementById('g-rays').value;
  }

  function rebuildGeo() {
    const p = getGeoParams();
    updateOutputs();
    geo.setTarget(0, 0, p.lightFrac * p.d);
    const masks = designer ? designer.getWallMasks() : null;
    geo.buildScene(p.W, p.H, p.d, p.h, p.rlid, p.rays, p.lightFrac, masks);
  }

  function rebuildAll() {
    if (designer) designer.recompute(); // updates masks, then notifies us via onWallMasksUpdated
    else rebuildGeo();
  }

  window.onWallMasksUpdated = () => rebuildGeo();

  ['g-h','g-rlid','g-rays'].forEach((id) => {
    document.getElementById(id).addEventListener('input', rebuildGeo);
  });
  ['s-W','s-H','s-d','s-lightz'].forEach((id) => {
    document.getElementById(id).addEventListener('input', rebuildAll);
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById('g-download-stl').addEventListener('click', () => {
    const masks = designer ? designer.getWallMasks() : null;
    if (!masks || !masks.top) {
      alert('No cutout pattern yet — open the Pattern Designer tab once so the masks compute.');
      return;
    }
    const p = getGeoParams();
    const t = +document.getElementById('g-thickness').value;
    if (!isFinite(t) || t <= 0) { alert('Thickness must be a positive number (mm).'); return; }
    let stl;
    try {
      stl = STLExport.buildBoxSTL(masks, p.W, p.H, p.d, t);
    } catch (err) {
      alert('STL build failed: ' + err.message);
      return;
    }
    downloadBlob(new Blob([stl], { type: 'model/stl' }), 'shadowbox-box.stl');
  });

  document.getElementById('g-toggle-cutouts').addEventListener('click', () => {
    geo.setShowCutouts(!geo.isCutoutsVisible());
    rebuildGeo();
  });
  document.getElementById('g-toggle-lid').addEventListener('click', () => {
    geo.setShowLid(!geo.isLidVisible());
    rebuildGeo();
  });
  document.getElementById('g-reset-view').addEventListener('click', () => geo.resetView());

  rebuildGeo();

  designer = Designer.init({
    target:    document.getElementById('target'),
    sim:       document.getElementById('sim'),
    wallTop:   document.getElementById('wall-top'),
    wallBot:   document.getElementById('wall-bot'),
    wallLeft:  document.getElementById('wall-left'),
    wallRight: document.getElementById('wall-right'),
  });

  // Now that designer exists, refresh 3D so the initial scene picks up the masks.
  rebuildGeo();

  let currentDesignName = null;
  const currentNameEl = document.getElementById('current-design-name');
  function setCurrentName(name) {
    currentDesignName = name;
    currentNameEl.textContent = name || 'untitled';
  }

  function buildPayload() {
    return {
      version: 1,
      sliders: readState(),
      targetImage: designer.getTargetImageDataURL(),
    };
  }

  async function applyPayload(payload) {
    if (payload && payload.sliders) {
      Object.entries(payload.sliders).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
      });
    }
    if (payload && payload.targetImage) {
      try { await designer.loadTargetImageDataURL(payload.targetImage); }
      catch (_) { alert('Could not load target image from this design file.'); }
    }
    rebuildAll();
  }

  // ----- modal helpers -----

  const saveasModal  = document.getElementById('modal-saveas');
  const openModal    = document.getElementById('modal-open');
  const saveasName   = document.getElementById('saveas-name');
  const saveasError  = document.getElementById('saveas-error');
  const designListEl = document.getElementById('design-list');
  const designEmpty  = document.getElementById('design-list-empty');
  const openDataDir  = document.getElementById('open-data-dir');

  function showSaveAs(initial) {
    saveasName.value = initial || currentDesignName || '';
    saveasError.hidden = true;
    saveasModal.hidden = false;
    setTimeout(() => saveasName.focus(), 0);
  }
  function hideSaveAs() { saveasModal.hidden = true; }

  async function showOpen() {
    openDataDir.textContent = `Folder: ${await DesignStorage.dataDir()}`;
    const items = await DesignStorage.list();
    designListEl.innerHTML = '';
    designEmpty.hidden = items.length > 0;
    items.forEach((it) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      const dt = it.mtimeMs ? new Date(it.mtimeMs) : null;
      meta.textContent = dt ? dt.toLocaleString() : '';
      const del = document.createElement('button');
      del.className = 'delete';
      del.title = 'Delete';
      del.textContent = '×';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${it.name}"?`)) return;
        await DesignStorage.remove(it.name);
        if (currentDesignName === it.name) setCurrentName(null);
        showOpen();
      });
      li.appendChild(name);
      li.appendChild(meta);
      li.appendChild(del);
      li.addEventListener('click', async () => {
        try {
          const text = await DesignStorage.read(it.name);
          const payload = JSON.parse(text);
          await applyPayload(payload);
          setCurrentName(it.name);
          hideOpen();
        } catch (err) {
          alert('Could not open: ' + err.message);
        }
      });
      designListEl.appendChild(li);
    });
    openModal.hidden = false;
  }
  function hideOpen() { openModal.hidden = true; }

  // ----- button wiring -----

  const saveToastEl = document.getElementById('save-toast');
  let saveToastTimer = null;
  function showSavedToast(msg) {
    if (!saveToastEl) return;
    saveToastEl.textContent = msg || 'Saved';
    saveToastEl.hidden = false;
    if (saveToastTimer) clearTimeout(saveToastTimer);
    saveToastTimer = setTimeout(() => { saveToastEl.hidden = true; }, 5000);
  }

  document.getElementById('state-save').addEventListener('click', async () => {
    if (!currentDesignName) { showSaveAs(''); return; }
    const json = JSON.stringify(buildPayload(), null, 2);
    try {
      await DesignStorage.write(currentDesignName, json);
      showSavedToast(`Saved "${currentDesignName}"`);
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  document.getElementById('state-saveas').addEventListener('click', () => showSaveAs());
  document.getElementById('state-open').addEventListener('click', () => showOpen());
  document.getElementById('state-reveal').addEventListener('click', () => DesignStorage.reveal());

  document.getElementById('saveas-cancel').addEventListener('click', hideSaveAs);
  document.getElementById('open-cancel').addEventListener('click', hideOpen);

  async function confirmSaveAs() {
    const raw = saveasName.value.trim();
    if (!raw) {
      saveasError.textContent = 'Please enter a name.';
      saveasError.hidden = false;
      return;
    }
    const name = raw.endsWith('.json') ? raw : raw + '.json';
    try {
      if (await DesignStorage.exists(name) && name !== currentDesignName) {
        if (!confirm(`"${name}" already exists. Overwrite?`)) return;
      }
      const json = JSON.stringify(buildPayload(), null, 2);
      const result = await DesignStorage.write(name, json);
      setCurrentName(result.name || name);
      hideSaveAs();
      showSavedToast(`Saved "${result.name || name}"`);
    } catch (err) {
      saveasError.textContent = err.message;
      saveasError.hidden = false;
    }
  }

  document.getElementById('saveas-confirm').addEventListener('click', confirmSaveAs);
  saveasName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmSaveAs(); }
    if (e.key === 'Escape') { e.preventDefault(); hideSaveAs(); }
  });
  [saveasModal, openModal].forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { saveasModal.hidden = true; openModal.hidden = true; }
  });

  setCurrentName(null);
})();
