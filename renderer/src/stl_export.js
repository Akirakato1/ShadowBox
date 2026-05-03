/**
 * Per-wall STL export.
 * Trace mask -> polygons -> Shape with holes -> ExtrudeGeometry -> ASCII STL.
 * Uses ImageTracer (loaded globally) for tracing and THREE.js core for geometry.
 */
(function (global) {
  'use strict';

  function tracePathSVG(mask) {
    if (typeof ImageTracer === 'undefined') return '';
    const w = mask.w, h = mask.h;
    const imgData = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = mask.grid[i] ? 255 : 0;
      const j = i * 4;
      imgData.data[j] = v;
      imgData.data[j + 1] = v;
      imgData.data[j + 2] = v;
      imgData.data[j + 3] = 255;
    }
    return ImageTracer.imagedataToSVG(imgData, {
      numberofcolors: 2,
      ltres: 0.5,
      qtres: 1000, // very high so curves degrade to polylines
      pathomit: 4,
      strokewidth: 0,
      linefilter: false,
    });
  }

  function parseTracedPolygons(svgString) {
    if (!svgString) return [];
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const out = [];
    doc.querySelectorAll('path').forEach((p) => {
      const fill = p.getAttribute('fill') || '';
      const m = fill.match(/(\d+)/g);
      const r = m ? +m[0] : 0;
      const g = m ? +m[1] : 0;
      const b = m ? +m[2] : 0;
      if ((r + g + b) / 3 < 128) return;
      const d = p.getAttribute('d') || '';
      pathDataToPolygons(d).forEach((poly) => out.push(poly));
    });
    return out;
  }

  // Use the browser's native SVG path engine — handles every command
  // (M, L, H, V, C, S, Q, T, A, Z) without a hand-rolled parser.
  // Multi-subpath strings are split on M/m so we don't get phantom connectors
  // between independent contours.
  function pathDataToPolygons(d) {
    if (!d) return [];
    const NS = 'http://www.w3.org/2000/svg';
    const subPaths = d.split(/(?=[Mm])/).map((s) => s.trim()).filter(Boolean);
    if (!subPaths.length) return [];

    const host = document.createElementNS(NS, 'svg');
    host.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;';
    document.body.appendChild(host);

    const polys = [];
    try {
      for (const sub of subPaths) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', sub);
        host.appendChild(p);
        let total = 0;
        try { total = p.getTotalLength(); } catch (_) { total = 0; }
        if (total < 1) continue;
        const step = 0.75; // pixels between samples
        const n = Math.max(8, Math.ceil(total / step));
        const poly = [];
        for (let i = 0; i < n; i++) {
          const t = (i / n) * total;
          const pt = p.getPointAtLength(t);
          poly.push({ x: pt.x, y: pt.y });
        }
        if (poly.length > 2) polys.push(poly);
      }
    } finally {
      document.body.removeChild(host);
    }
    return polys;
  }

  // Shoelace test in standard math (Y up). Returns true if polygon is CW.
  function isClockWise(pts) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      sum += (b.x - a.x) * (b.y + a.y);
    }
    return sum > 0;
  }

  function buildWallShape(mask, wallLenMM, dMM) {
    // Outer rectangle in standard math (Y up). CCW: (0,0) → (W,0) → (W,d) → (0,d).
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(wallLenMM, 0);
    shape.lineTo(wallLenMM, dMM);
    shape.lineTo(0, dMM);
    shape.lineTo(0, 0);

    const polys = parseTracedPolygons(tracePathSVG(mask));
    const sx = wallLenMM / mask.w;
    const sy = dMM / mask.h;
    // Inset so holes that touch (or slightly overshoot) the wall edge stay inside.
    // Tracers can emit half-pixel or sub-pixel offsets at the boundary; without an
    // inset, the hole crosses the outer rectangle and ExtrudeGeometry produces
    // malformed geometry (the "missing chunks + curved edge artifacts" symptom).
    const EPS = 0.3; // mm
    const minX = EPS, maxX = wallLenMM - EPS;
    const minY = EPS, maxY = dMM - EPS;

    polys.forEach((poly) => {
      if (poly.length < 3) return;
      // Flip Y from canvas-down to Y-up, clamp into the wall.
      const raw = poly.map((p) => ({
        x: Math.max(minX, Math.min(maxX, p.x * sx)),
        y: Math.max(minY, Math.min(maxY, dMM - p.y * sy)),
      }));
      // Drop consecutive duplicates (clamping can collapse a run of edge points).
      const pts = [];
      for (let i = 0; i < raw.length; i++) {
        const a = raw[i], b = raw[(i - 1 + raw.length) % raw.length];
        if (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6) pts.push(a);
      }
      if (pts.length < 3) return;
      // Three.js Shape holes must be CW in Y-up math; reverse if not.
      if (!isClockWise(pts)) pts.reverse();
      const path = new THREE.Path();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
      path.closePath();
      shape.holes.push(path);
    });

    return shape;
  }

  function geometryToSTL(geometry, name) {
    const pos = geometry.attributes.position;
    const idx = geometry.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const out = [`solid ${name}\n`];
    function v(i) { return [pos.getX(i), pos.getY(i), pos.getZ(i)]; }
    function nrm(a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      return [nx / len, ny / len, nz / len];
    }
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3)     : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      const a = v(i0), b = v(i1), c = v(i2);
      const n = nrm(a, b, c);
      out.push(
        `  facet normal ${n[0].toExponential(6)} ${n[1].toExponential(6)} ${n[2].toExponential(6)}\n`,
        `    outer loop\n`,
        `      vertex ${a[0].toExponential(6)} ${a[1].toExponential(6)} ${a[2].toExponential(6)}\n`,
        `      vertex ${b[0].toExponential(6)} ${b[1].toExponential(6)} ${b[2].toExponential(6)}\n`,
        `      vertex ${c[0].toExponential(6)} ${c[1].toExponential(6)} ${c[2].toExponential(6)}\n`,
        `    endloop\n`,
        `  endfacet\n`,
      );
    }
    out.push(`endsolid ${name}\n`);
    return out.join('');
  }

  function extrudedWall(mask, wallLenMM, dMM, thicknessMM) {
    const shape = buildWallShape(mask, wallLenMM, dMM);
    return new THREE.ExtrudeGeometry(shape, {
      depth: thicknessMM,
      bevelEnabled: false,
      curveSegments: 1,
    });
  }

  function extrudedSolidPlate(wMM, hMM, thicknessMM) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(wMM, 0);
    shape.lineTo(wMM, hMM);
    shape.lineTo(0, hMM);
    shape.lineTo(0, 0);
    return new THREE.ExtrudeGeometry(shape, {
      depth: thicknessMM,
      bevelEnabled: false,
      curveSegments: 1,
    });
  }

  // Bundle all 5 pieces into one ASCII STL with separate `solid` blocks.
  // Slicers (PrusaSlicer, Cura, etc.) treat each block as an independent part.
  function buildBoxSTL(masks, W, H, d, thicknessMM) {
    if (!masks || !masks.top || !masks.bot || !masks.left || !masks.right) {
      throw new Error('missing wall masks');
    }
    const Wmm = W * 10, Hmm = H * 10, Dmm = d * 10;
    const SPACING = 10; // mm between pieces in the laid-out layout

    const pieces = [
      { name: 'wall-top',   geo: extrudedWall(masks.top,   Wmm, Dmm, thicknessMM), w: Wmm },
      { name: 'wall-bot',   geo: extrudedWall(masks.bot,   Wmm, Dmm, thicknessMM), w: Wmm },
      { name: 'wall-left',  geo: extrudedWall(masks.left,  Hmm, Dmm, thicknessMM), w: Hmm },
      { name: 'wall-right', geo: extrudedWall(masks.right, Hmm, Dmm, thicknessMM), w: Hmm },
      { name: 'base-plate', geo: extrudedSolidPlate(Wmm, Hmm, thicknessMM),        w: Wmm },
    ];

    let xOffset = 0;
    const parts = [];
    pieces.forEach((p) => {
      p.geo.translate(xOffset, 0, 0);
      parts.push(geometryToSTL(p.geo, p.name));
      xOffset += p.w + SPACING;
    });
    return parts.join('');
  }

  global.STLExport = { buildBoxSTL };
})(window);
