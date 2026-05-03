/**
 * Shadow box projection math.
 *
 * Coordinate system:
 *   - Wall (projection plane) is at z = 0.
 *   - Box occupies x ∈ [-W/2, W/2], y ∈ [-H/2, H/2], z ∈ [0, d].
 *   - Light source at L = (0, 0, cz). Default cz = d/2 (geometric center).
 *   - Lid is parallel to the wall at z = cz + h (forward of light).
 *
 * Box has no back face — the wall itself seals the back. Light reaches
 * the wall ONLY through cutouts in the four side walls (top/bot/left/right).
 *
 * For a target wall point (X, Y) outside the box footprint, we choose
 * the side wall through which the ray from L exits, then back-solve for
 * the cutout coordinate (u, z_cut) on that wall.
 *
 * `dim` is { W, H, d, cz }. `cz` defaults to d/2 if omitted.
 */

(function (global) {
  'use strict';

  function lightZ(dim) {
    return dim.cz != null ? dim.cz : dim.d / 2;
  }

  function primaryFace(X, Y, W, H) {
    if (Math.abs(X) <= W / 2 && Math.abs(Y) <= H / 2) return null;
    const ax = Math.abs(X) - W / 2;
    const ay = Math.abs(Y) - H / 2;
    if (ax > ay) return X > 0 ? 'right' : 'left';
    return Y > 0 ? 'top' : 'bot';
  }

  function forwardMap(face, u, z, dim) {
    const cz = lightZ(dim);
    if (z >= cz) return null;
    const t = cz / (cz - z);
    let X, Y;
    switch (face) {
      case 'top':   X = u * t;            Y = ( dim.H / 2) * t; break;
      case 'bot':   X = u * t;            Y = (-dim.H / 2) * t; break;
      case 'left':  X = (-dim.W / 2) * t; Y = u * t;            break;
      case 'right': X = ( dim.W / 2) * t; Y = u * t;            break;
      default: return null;
    }
    return { X, Y };
  }

  function inverseMap(X, Y, dim, marginZ) {
    const face = primaryFace(X, Y, dim.W, dim.H);
    if (!face) return null;

    const cz = lightZ(dim);
    let t, u;

    if (face === 'top' || face === 'bot') {
      const Hf = face === 'top' ? dim.H / 2 : -dim.H / 2;
      t = Hf / Y;
      if (t <= 0 || t > 1) return null;
      u = X * t;
      if (Math.abs(u) > dim.W / 2) return null;
    } else {
      const Wf = face === 'right' ? dim.W / 2 : -dim.W / 2;
      t = Wf / X;
      if (t <= 0 || t > 1) return null;
      u = Y * t;
      if (Math.abs(u) > dim.H / 2) return null;
    }

    const z = cz * (1 - t);
    if (z < 0 || z > cz - marginZ) return null;
    return { face, u, z };
  }

  function penumbraBlur(zCut, dim, bulbDiameter) {
    const cz = lightZ(dim);
    if (zCut >= cz) return Infinity;
    return bulbDiameter * zCut / (cz - zCut);
  }

  function relativeBrightness(X, Y, dim) {
    const cz = lightZ(dim);
    const r = Math.sqrt(X * X + Y * Y + cz * cz);
    const cosTheta = cz / r;
    return cosTheta / (r * r);
  }

  global.Projection = {
    lightZ,
    primaryFace,
    forwardMap,
    inverseMap,
    penumbraBlur,
    relativeBrightness,
  };
})(window);
