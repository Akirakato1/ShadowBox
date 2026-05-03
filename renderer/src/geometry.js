/**
 * 3D geometry visualization using Three.js.
 * Renders the box, light source, lid, and traces light rays.
 */

(function (global) {
  'use strict';

  function init(wrapEl) {
    const W0 = wrapEl.clientWidth;
    const H0 = wrapEl.clientHeight;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(45, W0 / H0, 0.1, 2000);
    const initialCamPos = new THREE.Vector3(70, 50, 90);
    camera.position.copy(initialCamPos);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W0, H0);
    renderer.setPixelRatio(window.devicePixelRatio);
    wrapEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(50, 80, 60);
    scene.add(dir);

    let target = new THREE.Vector3(0, 0, 12);
    let radius = camera.position.distanceTo(target);
    let theta = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
    let phi = Math.acos((camera.position.y - target.y) / radius);
    let dragging = false;
    let lastX = 0, lastY = 0;

    function updateCam() {
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);
    }
    updateCam();

    renderer.domElement.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      theta -= dx * 0.01;
      phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.01));
      updateCam();
    });
    renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      radius = Math.max(30, Math.min(300, radius * (1 + e.deltaY * 0.001)));
      updateCam();
    }, { passive: false });

    const sceneRoot = new THREE.Group();
    scene.add(sceneRoot);

    let showCutouts = true;
    let showLid = true;

    const sampleCutouts = [
      { u: 0.25, v: 0.55, w: 0.12, h: 0.18 },
      { u: 0.55, v: 0.30, w: 0.18, h: 0.10 },
      { u: 0.40, v: 0.75, w: 0.10, h: 0.10 },
      { u: 0.70, v: 0.60, w: 0.14, h: 0.14 },
    ];

    function clearGroup(g) {
      while (g.children.length) {
        const c = g.children[0];
        g.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      }
    }

    function maskToFaceCanvas(mask, face) {
      const w = mask.w, h = mask.h;
      const transposed = (face === 'left' || face === 'right');
      const cvW = transposed ? h : w;
      const cvH = transposed ? w : h;
      const cv = document.createElement('canvas');
      cv.width = cvW;
      cv.height = cvH;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#7f77dd';
      ctx.fillRect(0, 0, cvW, cvH);
      const img = ctx.getImageData(0, 0, cvW, cvH);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          if (!mask.grid[py * w + px]) continue;
          let cx, cy;
          if (transposed) { cx = py; cy = (w - 1) - px; }
          else            { cx = px; cy = py; }
          const i = (cy * cvW + cx) * 4;
          img.data[i + 3] = 0;
        }
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    }

    function buildCutoutWall(face, mask, W, H, d) {
      const tex = new THREE.CanvasTexture(maskToFaceCanvas(mask, face));
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.5,
      });
      let geo, mesh;
      if (face === 'top' || face === 'bot') {
        geo = new THREE.PlaneGeometry(W, d);
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(0, face === 'top' ? H / 2 : -H / 2, d / 2);
      } else {
        geo = new THREE.PlaneGeometry(d, H);
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(face === 'right' ? W / 2 : -W / 2, 0, d / 2);
      }
      return mesh;
    }

    function maskHitsCutout(mask, exitFace, ex, ey, ez, W, H, d) {
      let pxNorm, pyNorm;
      if (exitFace === 'right' || exitFace === 'left') {
        pxNorm = (ey + H / 2) / H;
      } else {
        pxNorm = (ex + W / 2) / W;
      }
      pyNorm = (d - ez) / d;
      if (pxNorm < 0 || pxNorm >= 1 || pyNorm < 0 || pyNorm >= 1) return false;
      const px = Math.floor(pxNorm * mask.w);
      const py = Math.floor(pyNorm * mask.h);
      return !!mask.grid[py * mask.w + px];
    }

    function buildScene(W, H, d, h, rlid, rayCount, lightFrac, wallMasks) {
      clearGroup(sceneRoot);
      const cz = (lightFrac != null ? lightFrac : 0.5) * d;

      const wallSize = 200;
      const wallGeo = new THREE.PlaneGeometry(wallSize, wallSize);
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xb4b2a9, side: THREE.DoubleSide });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      sceneRoot.add(wall);

      const grid = new THREE.GridHelper(wallSize, 20, 0x888780, 0xd3d1c7);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = 0.05;
      sceneRoot.add(grid);

      const boxMat = new THREE.MeshLambertMaterial({
        color: 0x7f77dd,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      });

      const useMasks = showCutouts && wallMasks
        && wallMasks.top && wallMasks.bot && wallMasks.left && wallMasks.right;

      if (useMasks) {
        ['top', 'bot', 'left', 'right'].forEach((face) => {
          sceneRoot.add(buildCutoutWall(face, wallMasks[face], W, H, d));
        });
      } else {
        const top = new THREE.Mesh(new THREE.PlaneGeometry(W, d), boxMat);
        top.rotation.x = Math.PI / 2;
        top.position.set(0, H / 2, d / 2);
        sceneRoot.add(top);

        const bot = new THREE.Mesh(new THREE.PlaneGeometry(W, d), boxMat);
        bot.rotation.x = Math.PI / 2;
        bot.position.set(0, -H / 2, d / 2);
        sceneRoot.add(bot);

        const left = new THREE.Mesh(new THREE.PlaneGeometry(d, H), boxMat);
        left.rotation.y = Math.PI / 2;
        left.position.set(-W / 2, 0, d / 2);
        sceneRoot.add(left);

        const right = new THREE.Mesh(new THREE.PlaneGeometry(d, H), boxMat);
        right.rotation.y = Math.PI / 2;
        right.position.set(W / 2, 0, d / 2);
        sceneRoot.add(right);
      }

      const front = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshLambertMaterial({
          color: 0x534ab7,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        })
      );
      front.position.set(0, 0, d);
      sceneRoot.add(front);

      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, d));
      const edges = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: 0x3c3489 })
      );
      edges.position.set(0, 0, d / 2);
      sceneRoot.add(edges);

      if (showCutouts && !useMasks) {
        const cutMat = new THREE.MeshBasicMaterial({ color: 0xfaeeda, side: THREE.DoubleSide });
        const cutEdgeMat = new THREE.LineBasicMaterial({ color: 0xba7517 });

        sampleCutouts.forEach((c) => {
          const cw = c.w * W;
          const ch = c.h * d;
          const x = -W / 2 + c.u * W;
          const z = c.v * d;

          const topGeo = new THREE.PlaneGeometry(cw, ch);
          const topMesh = new THREE.Mesh(topGeo, cutMat);
          topMesh.rotation.x = Math.PI / 2;
          topMesh.position.set(x, H / 2 + 0.05, z);
          sceneRoot.add(topMesh);
          sceneRoot.add(new THREE.LineSegments(new THREE.EdgesGeometry(topGeo), cutEdgeMat).copy(topMesh));

          const botGeo = new THREE.PlaneGeometry(cw, ch);
          const botMesh = new THREE.Mesh(botGeo, cutMat);
          botMesh.rotation.x = Math.PI / 2;
          botMesh.position.set(x, -H / 2 - 0.05, z);
          sceneRoot.add(botMesh);
        });

        sampleCutouts.forEach((c) => {
          const cw = c.w * H;
          const ch = c.h * d;
          const y = -H / 2 + c.u * H;
          const z = c.v * d;

          const rightGeo = new THREE.PlaneGeometry(cw, ch);
          const rightMesh = new THREE.Mesh(rightGeo, cutMat);
          rightMesh.rotation.set(0, Math.PI / 2, 0);
          rightMesh.position.set(W / 2 + 0.05, y, z);
          sceneRoot.add(rightMesh);

          const leftMesh = new THREE.Mesh(rightGeo.clone(), cutMat);
          leftMesh.rotation.set(0, Math.PI / 2, 0);
          leftMesh.position.set(-W / 2 - 0.05, y, z);
          sceneRoot.add(leftMesh);
        });
      }

      const lightPos = new THREE.Vector3(0, 0, cz);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xef9f27 })
      );
      bulb.position.copy(lightPos);
      sceneRoot.add(bulb);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xfac775, transparent: true, opacity: 0.35 })
      );
      halo.position.copy(lightPos);
      sceneRoot.add(halo);

      if (showLid) {
        const lidGeo = new THREE.CircleGeometry(rlid, 32);
        const lidMat = new THREE.MeshLambertMaterial({
          color: 0xe24b4a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.set(0, 0, lightPos.z + h);
        sceneRoot.add(lid);

        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, h, 8),
          new THREE.MeshLambertMaterial({ color: 0x444441 })
        );
        post.rotation.x = Math.PI / 2;
        post.position.set(0, 0, lightPos.z + h / 2);
        sceneRoot.add(post);
      }

      if (rayCount > 0) {
        const rayPts = [];
        const blockedPts = [];

        for (let i = 0; i < rayCount; i++) {
          for (let j = 0; j < rayCount / 2; j++) {
            const az = (i / rayCount) * Math.PI * 2;
            const el = (j / (rayCount / 2)) * Math.PI - Math.PI / 2;
            const dx = Math.cos(el) * Math.cos(az);
            const dy = Math.sin(el);
            const dz = Math.cos(el) * Math.sin(az);
            const dirV = new THREE.Vector3(dx, dy, dz).normalize();

            let blockedByLid = false;
            if (showLid && Math.abs(dirV.z) > 1e-6) {
              const tLid = h / dirV.z;
              if (tLid > 0) {
                const hx = lightPos.x + tLid * dirV.x;
                const hy = lightPos.y + tLid * dirV.y;
                if (Math.sqrt(hx * hx + hy * hy) <= rlid) blockedByLid = true;
              }
            }

            if (Math.abs(dirV.z) < 1e-6) continue;
            const tWall = -lightPos.z / dirV.z;
            if (tWall <= 0) continue;
            const wx = lightPos.x + tWall * dirV.x;
            const wy = lightPos.y + tWall * dirV.y;
            if (Math.abs(wx) > 100 || Math.abs(wy) > 100) continue;

            let tExit = Infinity, exitFace = null;
            if (dirV.x > 0) { const t = ( W / 2 - lightPos.x) / dirV.x; if (t > 0 && t < tExit) { tExit = t; exitFace = 'right'; } }
            if (dirV.x < 0) { const t = (-W / 2 - lightPos.x) / dirV.x; if (t > 0 && t < tExit) { tExit = t; exitFace = 'left'; } }
            if (dirV.y > 0) { const t = ( H / 2 - lightPos.y) / dirV.y; if (t > 0 && t < tExit) { tExit = t; exitFace = 'top'; } }
            if (dirV.y < 0) { const t = (-H / 2 - lightPos.y) / dirV.y; if (t > 0 && t < tExit) { tExit = t; exitFace = 'bot'; } }
            if (dirV.z > 0) { const t = ( d - lightPos.z) / dirV.z; if (t > 0 && t < tExit) { tExit = t; exitFace = 'front'; } }
            if (dirV.z < 0) { const t = ( 0 - lightPos.z) / dirV.z; if (t > 0 && t < tExit) { tExit = t; exitFace = 'back'; } }

            let throughCutout = false;
            if (showCutouts && exitFace && exitFace !== 'back' && exitFace !== 'front') {
              const ex = lightPos.x + tExit * dirV.x;
              const ey = lightPos.y + tExit * dirV.y;
              const ez = lightPos.z + tExit * dirV.z;
              if (useMasks) {
                throughCutout = maskHitsCutout(wallMasks[exitFace], exitFace, ex, ey, ez, W, H, d);
              } else {
                let u, v;
                if (exitFace === 'right' || exitFace === 'left') { u = (ey + H / 2) / H; v = ez / d; }
                else if (exitFace === 'top' || exitFace === 'bot') { u = (ex + W / 2) / W; v = ez / d; }
                for (const c of sampleCutouts) {
                  if (u >= c.u - c.w / 2 && u <= c.u + c.w / 2 && v >= c.v - c.h / 2 && v <= c.v + c.h / 2) {
                    throughCutout = true;
                    break;
                  }
                }
              }
            }

            let reaches = false;
            if (!blockedByLid) {
              if (['right','left','top','bot'].includes(exitFace) && throughCutout) reaches = true;
            }

            if (reaches) {
              rayPts.push(lightPos.x, lightPos.y, lightPos.z, wx, wy, 0.1);
            } else if (blockedByLid) {
              const tLid = h / dirV.z;
              const lx = lightPos.x + tLid * dirV.x;
              const ly = lightPos.y + tLid * dirV.y;
              const lz = lightPos.z + tLid * dirV.z;
              blockedPts.push(lightPos.x, lightPos.y, lightPos.z, lx, ly, lz);
            }
          }
        }

        if (rayPts.length) {
          const rayGeo = new THREE.BufferGeometry();
          rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(rayPts, 3));
          sceneRoot.add(new THREE.LineSegments(
            rayGeo,
            new THREE.LineBasicMaterial({ color: 0xef9f27, transparent: true, opacity: 0.6 })
          ));
        }
        if (blockedPts.length) {
          const blockedGeo = new THREE.BufferGeometry();
          blockedGeo.setAttribute('position', new THREE.Float32BufferAttribute(blockedPts, 3));
          sceneRoot.add(new THREE.LineSegments(
            blockedGeo,
            new THREE.LineBasicMaterial({ color: 0xe24b4a, transparent: true, opacity: 0.4 })
          ));
        }
      }

      const axes = new THREE.AxesHelper(8);
      axes.position.set(-W / 2 - 6, -H / 2 - 6, 0);
      sceneRoot.add(axes);
    }

    function setShowCutouts(v) { showCutouts = v; }
    function setShowLid(v) { showLid = v; }
    function resetView() {
      radius = initialCamPos.length();
      theta = Math.atan2(initialCamPos.x, initialCamPos.z);
      phi = Math.acos(initialCamPos.y / radius);
      updateCam();
    }
    function setTarget(x, y, z) { target.set(x, y, z); updateCam(); }

    function loop() {
      requestAnimationFrame(loop);
      renderer.render(scene, camera);
    }
    loop();

    const ro = new ResizeObserver(() => {
      const w = wrapEl.clientWidth;
      const h = wrapEl.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(wrapEl);

    return {
      buildScene,
      setShowCutouts,
      setShowLid,
      resetView,
      setTarget,
      isCutoutsVisible: () => showCutouts,
      isLidVisible: () => showLid,
    };
  }

  global.Geometry = { init };
})(window);
