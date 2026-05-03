/**
 * Pattern designer: target image -> per-wall cutout patterns + simulated shadow.
 * Includes SVG export for CNC.
 */

(function (global) {
  'use strict';

  const N = 280;
  const SIM_RES = 1120;

  function init(refs) {
    const tctx = refs.target.getContext('2d');
    refs.sim.width = SIM_RES;
    refs.sim.height = SIM_RES;
    const sctx = refs.sim.getContext('2d');
    let currentTargetData = null;

    function fitCanvas(c) {
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      return c.getContext('2d');
    }

    function drawTargetBackground() {
      tctx.fillStyle = '#000';
      tctx.fillRect(0, 0, N, N);
    }

    function presetSunRays() {
      drawTargetBackground();
      tctx.fillStyle = '#fff';
      const cx = N / 2, cy = N / 2;
      const innerR = N * 0.18, outerR = N * 0.45;
      const nRays = 24;
      for (let i = 0; i < nRays; i++) {
        const a0 = (i / nRays) * Math.PI * 2 - 0.04;
        const a1 = (i / nRays) * Math.PI * 2 + 0.04;
        tctx.beginPath();
        tctx.moveTo(cx + innerR * Math.cos(a0), cy + innerR * Math.sin(a0));
        tctx.lineTo(cx + outerR * Math.cos(a0), cy + outerR * Math.sin(a0));
        tctx.lineTo(cx + outerR * Math.cos(a1), cy + outerR * Math.sin(a1));
        tctx.lineTo(cx + innerR * Math.cos(a1), cy + innerR * Math.sin(a1));
        tctx.closePath();
        tctx.fill();
      }
      tctx.beginPath();
      tctx.arc(cx, cy, innerR * 0.95, 0, Math.PI * 2);
      tctx.fill();
    }

    function presetFlower() {
      drawTargetBackground();
      tctx.fillStyle = '#fff';
      const cx = N / 2, cy = N / 2;
      const petals = 8;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        const px = cx + Math.cos(a) * N * 0.28;
        const py = cy + Math.sin(a) * N * 0.28;
        tctx.save();
        tctx.translate(px, py);
        tctx.rotate(a);
        tctx.beginPath();
        tctx.ellipse(0, 0, N * 0.13, N * 0.07, 0, 0, Math.PI * 2);
        tctx.fill();
        tctx.restore();
      }
      tctx.beginPath();
      tctx.arc(cx, cy, N * 0.06, 0, Math.PI * 2);
      tctx.fill();
    }

    function drawStar(cx, cy, spikes, outR, inR) {
      let rot = -Math.PI / 2;
      const step = Math.PI / spikes;
      tctx.beginPath();
      tctx.moveTo(cx + Math.cos(rot) * outR, cy + Math.sin(rot) * outR);
      for (let i = 0; i < spikes; i++) {
        rot += step;
        tctx.lineTo(cx + Math.cos(rot) * inR, cy + Math.sin(rot) * inR);
        rot += step;
        tctx.lineTo(cx + Math.cos(rot) * outR, cy + Math.sin(rot) * outR);
      }
      tctx.closePath();
      tctx.fill();
    }

    function presetStars() {
      drawTargetBackground();
      tctx.fillStyle = '#fff';
      const cx = N / 2, cy = N / 2;
      const ringR = N * 0.32;
      const nStars = 12;
      for (let i = 0; i < nStars; i++) {
        const a = (i / nStars) * Math.PI * 2;
        const sx = cx + Math.cos(a) * ringR;
        const sy = cy + Math.sin(a) * ringR;
        drawStar(sx, sy, 5, N * 0.05, N * 0.02);
      }
    }

    function presetText() {
      drawTargetBackground();
      tctx.fillStyle = '#fff';
      const cx = N / 2, cy = N / 2;
      const r = N * 0.34;
      const text = 'SHADOWBOX SHADOWBOX ';
      tctx.font = '700 18px system-ui, sans-serif';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      for (let i = 0; i < text.length; i++) {
        const a = (i / text.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        tctx.save();
        tctx.translate(x, y);
        tctx.rotate(a + Math.PI / 2);
        tctx.fillText(text[i], 0, 0);
        tctx.restore();
      }
    }

    let drawing = false;
    let drawMode = 'add';
    let editMode = false;
    let loadedImage = null;
    let imgScale = 1, imgOffX = 0, imgOffY = 0;
    let snapshotBeforeEdit = null;
    let panning = false;
    let panLastX = 0, panLastY = 0;
    const targetStack = refs.target.parentElement;
    const targetSvgEl = document.getElementById('target-svg');

    refs.target.addEventListener('pointerdown', (e) => {
      if (editMode) {
        panning = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        refs.target.setPointerCapture(e.pointerId);
        return;
      }
      drawing = true;
      drawMode = e.shiftKey ? 'erase' : 'add';
      targetStack.classList.add('brushing');
      paintAt(e);
    });
    window.addEventListener('pointerup', (e) => {
      if (panning) {
        panning = false;
        try { refs.target.releasePointerCapture(e.pointerId); } catch (_) {}
        return;
      }
      if (drawing) {
        drawing = false;
        targetStack.classList.remove('brushing');
        recompute();
      }
    });
    refs.target.addEventListener('pointermove', (e) => {
      if (panning) {
        const rect = refs.target.getBoundingClientRect();
        const sx = N / rect.width;
        const sy = N / rect.height;
        imgOffX += (e.clientX - panLastX) * sx;
        imgOffY += (e.clientY - panLastY) * sy;
        panLastX = e.clientX;
        panLastY = e.clientY;
        drawEditPreview();
        return;
      }
      if (drawing) paintAt(e);
    });
    refs.target.addEventListener('wheel', (e) => {
      if (!editMode) return;
      e.preventDefault();
      const rect = refs.target.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (N / rect.width);
      const cy = (e.clientY - rect.top) * (N / rect.height);
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.max(0.05, Math.min(20, imgScale * factor));
      const k = newScale / imgScale;
      imgOffX = (imgOffX + N / 2 - cx) * k - N / 2 + cx;
      imgOffY = (imgOffY + N / 2 - cy) * k - N / 2 + cy;
      imgScale = newScale;
      drawEditPreview();
    }, { passive: false });

    function paintAt(e) {
      const rect = refs.target.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (N / rect.width);
      const y = (e.clientY - rect.top) * (N / rect.height);
      tctx.fillStyle = drawMode === 'add' ? '#fff' : '#000';
      tctx.beginPath();
      tctx.arc(x, y, 8, 0, Math.PI * 2);
      tctx.fill();
    }

    function loadImageFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          loadedImage = img;
          const cover = Math.max(N / img.width, N / img.height);
          imgScale = cover;
          imgOffX = 0;
          imgOffY = 0;
          enterEditMode();
        };
        img.onerror = () => alert('Could not load that image.');
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }

    function enterEditMode() {
      snapshotBeforeEdit = tctx.getImageData(0, 0, N, N);
      editMode = true;
      targetStack.classList.add('editing');
      document.getElementById('image-edit-controls').style.display = 'flex';
      document.getElementById('preset-buttons').style.opacity = '0.4';
      document.getElementById('preset-buttons').style.pointerEvents = 'none';
      drawEditPreview();
    }

    function exitEditMode() {
      editMode = false;
      loadedImage = null;
      snapshotBeforeEdit = null;
      targetStack.classList.remove('editing');
      document.getElementById('image-edit-controls').style.display = 'none';
      document.getElementById('preset-buttons').style.opacity = '';
      document.getElementById('preset-buttons').style.pointerEvents = '';
      document.dispatchEvent(new Event('shadowbox:edit-end'));
    }

    function drawEditPreview() {
      if (!loadedImage) return;
      drawTargetBackground();
      const cx = N / 2, cy = N / 2;
      const w = loadedImage.width * imgScale;
      const h = loadedImage.height * imgScale;
      tctx.drawImage(loadedImage, cx - w / 2 + imgOffX, cy - h / 2 + imgOffY, w, h);

      const data = tctx.getImageData(0, 0, N, N);
      for (let i = 0; i < data.data.length; i += 4) {
        const luma = Math.round(0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2]);
        data.data[i] = data.data[i + 1] = data.data[i + 2] = luma;
        data.data[i + 3] = 255;
      }
      tctx.putImageData(data, 0, 0);

      tctx.save();
      tctx.fillStyle = 'rgba(0,0,0,0.55)';
      tctx.beginPath();
      tctx.rect(0, 0, N, N);
      tctx.arc(cx, cy, N / 2 - 1, 0, Math.PI * 2, true);
      tctx.fill('evenodd');
      tctx.strokeStyle = '#fff';
      tctx.lineWidth = 1.5;
      tctx.beginPath();
      tctx.arc(cx, cy, N / 2 - 1, 0, Math.PI * 2);
      tctx.stroke();
      tctx.restore();
    }

    function applyCrop() {
      if (!loadedImage) { exitEditMode(); return; }
      drawTargetBackground();
      const cx = N / 2, cy = N / 2;
      const w = loadedImage.width * imgScale;
      const h = loadedImage.height * imgScale;
      tctx.drawImage(loadedImage, cx - w / 2 + imgOffX, cy - h / 2 + imgOffY, w, h);

      const data = tctx.getImageData(0, 0, N, N);
      const r2 = (N / 2 - 1) ** 2;
      for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
          const i = (py * N + px) * 4;
          const dx = px - cx, dy = py - cy;
          if (dx * dx + dy * dy > r2) {
            data.data[i] = data.data[i + 1] = data.data[i + 2] = 0;
          } else {
            const luma = Math.round(0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2]);
            data.data[i] = data.data[i + 1] = data.data[i + 2] = luma;
          }
          data.data[i + 3] = 255;
        }
      }
      tctx.putImageData(data, 0, 0);

      exitEditMode();
      recompute();
    }

    function cancelCrop() {
      if (snapshotBeforeEdit) tctx.putImageData(snapshotBeforeEdit, 0, 0);
      exitEditMode();
    }

    function loadSVGFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        let serialized;
        try {
          const doc = new DOMParser().parseFromString(ev.target.result, 'image/svg+xml');
          const svg = doc.documentElement;
          if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('not an SVG');
          // Force a known render size for high-res rasterization.
          svg.setAttribute('width', '1024');
          svg.setAttribute('height', '1024');
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          // Insert a white background so transparent SVGs (typical icons) render
          // with a usable contrast — dark content becomes the unlit silhouette.
          const ns = 'http://www.w3.org/2000/svg';
          const bg = doc.createElementNS(ns, 'rect');
          bg.setAttribute('width', '100%');
          bg.setAttribute('height', '100%');
          bg.setAttribute('fill', 'white');
          svg.insertBefore(bg, svg.firstChild);
          serialized = new XMLSerializer().serializeToString(svg);
        } catch (_) {
          alert('Could not parse SVG file.');
          return;
        }
        const blob = new Blob([serialized], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          loadedImage = img;
          const cover = Math.max(N / img.width, N / img.height);
          imgScale = cover;
          imgOffX = 0;
          imgOffY = 0;
          enterEditMode();
          // Hold the URL until edit mode ends so the Image can re-paint on pan/zoom.
          const release = () => { URL.revokeObjectURL(url); document.removeEventListener('shadowbox:edit-end', release); };
          document.addEventListener('shadowbox:edit-end', release);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          alert('Could not render that SVG (it may reference external resources).');
        };
        img.src = url;
      };
      reader.readAsText(file);
    }

    function isLitInTarget(X, Y, R) {
      if (!currentTargetData) return false;
      const u = (X / R) * 0.5 + 0.5;
      const v = 0.5 - (Y / R) * 0.5;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
      const px = Math.floor(u * N);
      const py = Math.floor(v * N);
      const idx = (py * N + px) * 4;
      return currentTargetData[idx] > 128;
    }

    function getParams() {
      return {
        W: +document.getElementById('s-W').value,
        H: +document.getElementById('s-H').value,
        d: +document.getElementById('s-d').value,
        R: +document.getElementById('d-R').value,
        margin: +document.getElementById('d-margin').value,
        lightFrac: +document.getElementById('s-lightz').value / 100,
      };
    }

    function updateOutputs(p) {
      document.getElementById('d-R-out').textContent = p.R;
      document.getElementById('d-margin-out').textContent = p.margin;
    }

    const WALL_RES_W = 320;
    const WALL_RES_H = 160;
    const wallScratch = document.createElement('canvas');
    wallScratch.width = WALL_RES_W;
    wallScratch.height = WALL_RES_H;
    const wallScratchCtx = wallScratch.getContext('2d');

    function computeWallMask(face, dim, R, marginCm) {
      const w = WALL_RES_W, h = WALL_RES_H;
      const cz = Projection.lightZ(dim);
      const wallLen = (face === 'top' || face === 'bot') ? dim.W : dim.H;
      const grid = new Uint8Array(w * h);
      const forbid = new Uint8Array(h);

      for (let py = 0; py < h; py++) {
        const z = (1 - py / h) * dim.d;
        if (z >= cz - marginCm) { forbid[py] = 1; continue; }
        const t = cz / (cz - z);
        for (let px = 0; px < w; px++) {
          const u = (px / w) * wallLen - wallLen / 2;
          let X, Y;
          if (face === 'top')        { X = u * t;          Y = ( dim.H / 2) * t; }
          else if (face === 'bot')   { X = u * t;          Y = (-dim.H / 2) * t; }
          else if (face === 'left')  { X = (-dim.W / 2)*t; Y = u * t; }
          else if (face === 'right') { X = ( dim.W / 2)*t; Y = u * t; }
          if (Projection.primaryFace(X, Y, dim.W, dim.H) !== face) continue;
          if (isLitInTarget(X, Y, R)) grid[py * w + px] = 1;
        }
      }
      return { w, h, grid, forbid };
    }

    function maskToTraceableImageData(mask) {
      const { w, h, grid } = mask;
      wallScratch.width = w;
      wallScratch.height = h;
      const img = wallScratchCtx.createImageData(w, h);
      for (let i = 0, n = w * h; i < n; i++) {
        const v = grid[i] ? 255 : 0;
        const j = i * 4;
        img.data[j + 0] = v;
        img.data[j + 1] = v;
        img.data[j + 2] = v;
        img.data[j + 3] = 255;
      }
      return img;
    }

    async function tracedSVGFromImageData(imgData) {
      // Prefer potrace via Electron IPC when available — sharper curves, better corners.
      if (window.appAPI && typeof window.appAPI.trace === 'function') {
        try {
          const cv = document.createElement('canvas');
          cv.width = imgData.width;
          cv.height = imgData.height;
          cv.getContext('2d').putImageData(imgData, 0, 0);
          const dataUrl = cv.toDataURL('image/png');
          return await window.appAPI.trace(dataUrl, {
            blackOnWhite: false,
            threshold: 128,
            turdSize: 4,
            alphaMax: 1.0,
            optTolerance: 0.4,
            color: '#ffffff',
            background: 'transparent',
          });
        } catch (e) {
          console.warn('potrace failed, falling back to ImageTracer:', e);
        }
      }
      if (typeof ImageTracer === 'undefined') return '';
      try {
        return ImageTracer.imagedataToSVG(imgData, {
          numberofcolors: 2,
          ltres: 1,
          qtres: 1,
          pathomit: 4,
          strokewidth: 0,
          linefilter: false,
        });
      } catch (e) {
        return '';
      }
    }

    function parseFillBrightness(fill) {
      if (!fill) return 0;
      let r = 0, g = 0, b = 0;
      if (fill[0] === '#') {
        const h = fill.slice(1);
        if (h.length === 6) {
          r = parseInt(h.slice(0, 2), 16);
          g = parseInt(h.slice(2, 4), 16);
          b = parseInt(h.slice(4, 6), 16);
        }
      } else if (fill.startsWith('rgb')) {
        const m = fill.match(/(\d+)/g);
        if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }
      } else if (fill === 'white') {
        return 255;
      }
      return (r + g + b) / 3;
    }

    function extractLightPaths(svgString) {
      if (!svgString) return '';
      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      const out = [];
      doc.querySelectorAll('path').forEach((p) => {
        if (parseFillBrightness(p.getAttribute('fill')) > 128) {
          p.setAttribute('fill', '#ffffff');
          p.removeAttribute('stroke');
          out.push(p.outerHTML);
        }
      });
      return out.join('');
    }

    async function buildWallSVGNode(face, mask) {
      const { w, h, forbid } = mask;
      const tracedSVG = await tracedSVGFromImageData(maskToTraceableImageData(mask));
      const onlyWhite = extractLightPaths(tracedSVG);
      let forbidRects = '';
      let runStart = -1;
      for (let py = 0; py <= h; py++) {
        const isForb = py < h && forbid[py];
        if (isForb && runStart < 0) runStart = py;
        if ((!isForb || py === h) && runStart >= 0) {
          forbidRects += `<rect x="0" y="${runStart}" width="${w}" height="${py - runStart}" fill="#7e3e3d"/>`;
          runStart = -1;
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <rect width="${w}" height="${h}" fill="#2c2c2a"/>
        ${forbidRects}
        ${onlyWhite}
        <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#5f5e5a" stroke-width="1"/>
      </svg>`;
    }

    let lastWallMasks = null;
    let recomputeVersion = 0;

    async function drawWallProjections(p, version) {
      currentTargetData = tctx.getImageData(0, 0, N, N).data;
      const dim = { W: p.W, H: p.H, d: p.d, cz: p.lightFrac * p.d };
      const marginCm = p.margin / 10;
      const faces = [
        ['top',   refs.wallTop],
        ['bot',   refs.wallBot],
        ['left',  refs.wallLeft],
        ['right', refs.wallRight],
      ];
      // Synchronous mask computation first — geometry tab and getWallMasks need them immediately.
      const masks = {};
      faces.forEach(([face]) => {
        masks[face] = computeWallMask(face, dim, p.R, marginCm);
      });
      lastWallMasks = masks;
      if (typeof window.onWallMasksUpdated === 'function') {
        window.onWallMasksUpdated(masks);
      }
      // Async traces in parallel; discard if a newer recompute has started.
      const svgs = await Promise.all(faces.map(([face]) => buildWallSVGNode(face, masks[face])));
      if (version !== recomputeVersion) return;
      faces.forEach(([face, host], i) => { host.innerHTML = svgs[i]; });
    }

    async function traceTargetCanvasToSVG(version) {
      const data = tctx.getImageData(0, 0, N, N);
      const bin = new ImageData(N, N);
      for (let i = 0; i < data.data.length; i += 4) {
        const lit = data.data[i] > 128 ? 255 : 0;
        bin.data[i + 0] = lit;
        bin.data[i + 1] = lit;
        bin.data[i + 2] = lit;
        bin.data[i + 3] = 255;
      }
      const svg = await tracedSVGFromImageData(bin);
      if (version !== recomputeVersion) return;
      const onlyWhite = extractLightPaths(svg);
      targetSvgEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" preserveAspectRatio="none">
        <rect width="${N}" height="${N}" fill="#000"/>
        ${onlyWhite}
      </svg>`;
    }

    function simulateShadow(p) {
      const dim = { W: p.W, H: p.H, d: p.d, cz: p.lightFrac * p.d };
      const marginCm = p.margin / 10;

      const w = refs.sim.width;
      const h = refs.sim.height;
      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, w, h);

      const img = sctx.getImageData(0, 0, w, h);
      const litR = 255, litG = 215, litB = 60;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const u = px / w;
          const v = py / h;
          const X = (u - 0.5) * 2 * p.R;
          const Y = (0.5 - v) * 2 * p.R;

          const inv = Projection.inverseMap(X, Y, dim, marginCm);
          if (!inv) continue;

          if (isLitInTarget(X, Y, p.R)) {
            const dist2 = X * X + Y * Y;
            const falloff = Math.min(1, 30 / (dist2 + 30));
            const k = 0.35 + 0.65 * falloff;
            const i = (py * w + px) * 4;
            img.data[i + 0] = litR * k;
            img.data[i + 1] = litG * k;
            img.data[i + 2] = litB * k;
            img.data[i + 3] = 255;
          }
        }
      }
      sctx.putImageData(img, 0, 0);

      sctx.fillStyle = '#000';
      const bx = w / 2 - (p.W / (2 * p.R)) * w / 2;
      const by = h / 2 - (p.H / (2 * p.R)) * h / 2;
      const bw = (p.W / p.R) * w / 2;
      const bh = (p.H / p.R) * h / 2;
      sctx.fillRect(bx, by, bw, bh);
      sctx.strokeStyle = '#534ab7';
      sctx.lineWidth = Math.max(1.5, w / 200);
      sctx.strokeRect(bx, by, bw, bh);

      sctx.fillStyle = '#ef9f27';
      sctx.beginPath();
      sctx.arc(w / 2, h / 2, Math.max(3, w / 120), 0, Math.PI * 2);
      sctx.fill();
    }

    function recompute() {
      const myVersion = ++recomputeVersion;
      const p = getParams();
      updateOutputs(p);
      // The synchronous prefix of drawWallProjections sets currentTargetData and
      // computes the wall masks — both must run before simulateShadow, which reads them.
      drawWallProjections(p, myVersion).catch((e) => console.error('drawWallProjections', e));
      simulateShadow(p);
      traceTargetCanvasToSVG(myVersion).catch((e) => console.error('traceTargetCanvasToSVG', e));
    }

    async function buildWallSVG(face, dim, R, marginCm) {
      const wallLen = (face === 'top' || face === 'bot') ? dim.W : dim.H;
      const totalW = wallLen * 10;
      const totalH = dim.d * 10;

      const mask = computeWallMask(face, dim, R, marginCm);
      const tracedSVG = await tracedSVGFromImageData(maskToTraceableImageData(mask));
      const onlyWhite = extractLightPaths(tracedSVG);
      const sx = totalW / mask.w;
      const sy = totalH / mask.h;

      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">
  <rect x="0" y="0" width="${totalW}" height="${totalH}" fill="black"/>
  <g transform="scale(${sx} ${sy})">${onlyWhite}</g>
  <rect x="0" y="0" width="${totalW}" height="${totalH}" fill="none" stroke="cyan" stroke-width="0.5"/>
</svg>`;
    }

    async function exportSVGs() {
      const p = getParams();
      const dim = { W: p.W, H: p.H, d: p.d, cz: p.lightFrac * p.d };
      const marginCm = p.margin / 10;
      const faces = ['top', 'bot', 'left', 'right'];
      const svgs = await Promise.all(faces.map((face) => buildWallSVG(face, dim, p.R, marginCm)));
      svgs.forEach((svg, i) => {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shadowbox-wall-${faces[i]}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    function exportPNG() {
      refs.target.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'shadowbox-target.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    document.getElementById('preset-rays').onclick   = () => { presetSunRays(); recompute(); };
    document.getElementById('preset-flower').onclick = () => { presetFlower();  recompute(); };
    document.getElementById('preset-stars').onclick  = () => { presetStars();   recompute(); };
    document.getElementById('preset-text').onclick   = () => { presetText();    recompute(); };
    document.getElementById('clear').onclick         = () => { drawTargetBackground(); recompute(); };
    document.getElementById('export-svg').onclick    = exportSVGs;
    document.getElementById('export-png').onclick    = exportPNG;

    const fileInput = document.getElementById('image-file');
    document.getElementById('upload-image').onclick = () => fileInput.click();
    fileInput.onchange = (e) => { loadImageFile(e.target.files[0]); fileInput.value = ''; };

    const svgInput = document.getElementById('svg-file');
    document.getElementById('upload-svg').onclick = () => svgInput.click();
    svgInput.onchange = (e) => { loadSVGFile(e.target.files[0]); svgInput.value = ''; };

    document.getElementById('image-apply').onclick  = applyCrop;
    document.getElementById('image-cancel').onclick = cancelCrop;

    ['d-R','d-margin'].forEach((id) => {
      document.getElementById(id).addEventListener('input', recompute);
    });

    presetSunRays();
    recompute();

    function getTargetImageDataURL() {
      return refs.target.toDataURL('image/png');
    }

    function loadTargetImageDataURL(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          drawTargetBackground();
          tctx.drawImage(img, 0, 0, N, N);
          recompute();
          resolve();
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
    }

    return {
      recompute,
      getTargetImageDataURL,
      loadTargetImageDataURL,
      getWallMasks: () => lastWallMasks,
    };
  }

  global.Designer = { init };
})(window);
