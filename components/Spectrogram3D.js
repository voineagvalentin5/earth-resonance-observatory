import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * 3D waterfall surface. x = frequency (0..fMax Hz), z = time (oldest at the
 * back, newest at the front), y = relative intensity (0..1, unitless).
 * Colours follow the source image's own colour bar, clipped at red so the
 * white/pink top of that bar never washes the surface out.
 */
const RAINBOW = [[0, 0, 110], [0, 30, 255], [0, 170, 255], [0, 250, 220], [60, 255, 60], [200, 255, 0], [255, 220, 0], [255, 130, 0], [250, 30, 10]];

function colorAt(v, ramp) {
  const x = Math.max(0, Math.min(1, v)) * (ramp.length - 1);
  const i = Math.floor(x); const t = x - i;
  const a = ramp[i]; const b = ramp[Math.min(ramp.length - 1, i + 1)];
  return [(a[0] + (b[0] - a[0]) * t) / 255, (a[1] + (b[1] - a[1]) * t) / 255, (a[2] + (b[2] - a[2]) * t) / 255];
}

/** Colour-bar entries from dark blue up to the first pure red (drops the white/pink top). */
function rampFromLut(lut) {
  if (!lut || lut.length < 40) return RAINBOW;
  const low2high = lut.slice().reverse();
  let end = low2high.length - 1;
  for (let i = Math.floor(low2high.length * 0.5); i < low2high.length; i += 1) {
    const [r, g, b] = low2high[i];
    if (r > 230 && g < 40 && b < 40) { end = i; break; }
  }
  const out = [];
  const step = Math.max(1, Math.floor(end / 32));
  for (let i = 0; i <= end; i += step) out.push(low2high[i]);
  out.push(low2high[end]);
  return out;
}

export default function Spectrogram3D({ data, refs = [], timeLabels }) {
  const hostRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !data) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) {
      host.dataset.webgl = 'off';
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 2, 0.1, 200);
    const aspect0 = (host.clientWidth || 2) / (host.clientHeight || 1);
    const W = aspect0 > 3 ? 14 : aspect0 > 2 ? 12 : 10; const D = 7.5; const Hh = 3.3; // D: time depth (was 5)
    const { nf, nt, grid } = data;
    const ramp = data.model ? RAINBOW : rampFromLut(data.lut);

    // light smoothing so JPEG noise does not read as structure
    const sm = new Float32Array(nf * nt);
    for (let f = 0; f < nf; f += 1) {
      for (let t = 0; t < nt; t += 1) {
        let s = 0; let n = 0;
        for (let df = -1; df <= 1; df += 1) for (let dt = -1; dt <= 1; dt += 1) {
          const ff = f + df; const tt = t + dt;
          if (ff >= 0 && ff < nf && tt >= 0 && tt < nt) { const wgt = df === 0 && dt === 0 ? 2 : 1; s += grid[ff * nt + tt] * wgt; n += wgt; }
        }
        sm[f * nt + t] = s / n;
      }
    }
    // Contrast stretch between the 5th and 99.8th percentile (order-preserving; still relative).
    const sorted = Array.from(sm).sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.05)];
    const hi = sorted[Math.floor(sorted.length * 0.998)] || 1;
    for (let i = 0; i < sm.length; i += 1) sm[i] = Math.max(0, Math.min(1, (sm[i] - lo) / ((hi - lo) || 1)));
    const heightOf = (v) => (v ** 1.25) * Hh;

    const geo = new THREE.PlaneGeometry(W, D, nf - 1, nt - 1);
    geo.rotateX(-Math.PI / 2); // row 0 -> back (oldest), last row -> front (newest)
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let row = 0; row < nt; row += 1) {
      for (let col = 0; col < nf; col += 1) {
        const idx = row * nf + col;
        const v = sm[col * nt + row];
        pos.setY(idx, heightOf(v));
        const c = colorAt(v, ramp);
        colors[idx * 3] = c[0]; colors[idx * 3 + 1] = c[1]; colors[idx * 3 + 2] = c[2];
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // Surface = thin glowing wire mesh + one translucent rainbow sheet (20%).
    // An invisible depth mask hides wires behind front peaks so the shape reads.
    const surf = new THREE.Group();
    // Depth-only mask (writes no colour): keeps wires behind front peaks hidden.
    const mask = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    mask.renderOrder = 0;
    surf.add(mask);
    // The single visible sheet: true 20% opacity (normal alpha blending), same rainbow,
    // smooth shading, no depth write. It is drawn BEFORE the wires; the wires are additive,
    // so they land on top at full brightness and are never dimmed or hidden by the sheet.
    const sheet = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    sheet.renderOrder = 0.5;
    // Line density: dense enough to read as a mesh, sparse enough to avoid moiré.
    const wide = (host.clientWidth || 0) >= 600;
    const colStep = wide ? 1 : 2;   // frequency columns (lines running back through time)
    const rowStep = wide ? 3 : 4;   // time rows (lines running across frequency)
    // Line pattern rotated +20° about the vertical axis (counter-clockwise seen
    // from above). Only the pattern turns: every line point is draped on the same
    // height field (bilinear in height and value), so the surface shape is unchanged.
    const ANGLE = (20 * Math.PI) / 180;
    const P = pos.array;
    const hAt = (col, row) => P[(row * nf + col) * 3 + 1];
    const vAt = (col, row) => sm[col * nt + row];
    const sample = (x, z) => {
      const fc = Math.max(0, Math.min(nf - 1, ((x + W / 2) / W) * (nf - 1)));
      const fr = Math.max(0, Math.min(nt - 1, ((z + D / 2) / D) * (nt - 1)));
      const c0 = Math.min(nf - 2, Math.floor(fc)); const r0 = Math.min(nt - 2, Math.floor(fr));
      const tx = fc - c0; const tz = fr - r0;
      const bl = (f) => (f(c0, r0) * (1 - tx) + f(c0 + 1, r0) * tx) * (1 - tz) + (f(c0, r0 + 1) * (1 - tx) + f(c0 + 1, r0 + 1) * tx) * tz;
      return { y: bl(hAt), v: bl(vAt) };
    };
    const lp = []; const lc = [];
    const STEP = 0.05; // sample spacing along each line (world units; grid cells are ~0.05 x 0.18)
    const family = (dir, spacing) => {
      const nrm = { x: -dir.z, z: dir.x }; // in-plane normal
      const corners2 = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
      const offs = corners2.map(([x, z]) => x * nrm.x + z * nrm.z);
      const oMin = Math.min(...offs); const oMax = Math.max(...offs);
      for (let o = Math.ceil(oMin / spacing) * spacing; o <= oMax; o += spacing) {
        const px = nrm.x * o; const pz = nrm.z * o;
        // clip the infinite line p + s*dir to the footprint rectangle (slab method)
        let s0 = -Infinity; let s1 = Infinity;
        [[px, dir.x, W / 2], [pz, dir.z, D / 2]].forEach(([p0, d, half]) => {
          if (Math.abs(d) < 1e-9) { if (Math.abs(p0) > half) { s0 = 1; s1 = 0; } return; }
          const a1 = (-half - p0) / d; const a2 = (half - p0) / d;
          s0 = Math.max(s0, Math.min(a1, a2)); s1 = Math.min(s1, Math.max(a1, a2));
        });
        if (!(s1 - s0 > STEP)) continue;
        const n = Math.ceil((s1 - s0) / STEP);
        let prev = null;
        for (let k = 0; k <= n; k += 1) {
          const sv = s0 + ((s1 - s0) * k) / n;
          const x = px + dir.x * sv; const z = pz + dir.z * sv;
          const q = sample(x, z);
          const c = colorAt(q.v, ramp);
          const cur = [x, q.y, z, c[0], c[1], c[2]];
          if (prev) { lp.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]); lc.push(prev[3], prev[4], prev[5], cur[3], cur[4], cur[5]); }
          prev = cur;
        }
      }
    };
    // same spacing as the unrotated mesh: rows every rowStep time steps, columns every colStep frequency steps
    const rowSpacing = (D / (nt - 1)) * rowStep;
    const colSpacing = (W / (nf - 1)) * colStep;
    family({ x: Math.cos(ANGLE), z: -Math.sin(ANGLE) }, rowSpacing); // was: along frequency
    family({ x: Math.sin(ANGLE), z: Math.cos(ANGLE) }, colSpacing);  // was: along time
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    const wire = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    wire.renderOrder = 1;
    surf.add(wire);
    // soft glow: the same lines again, dimmer, nudged up a hair (cheap halo instead of a bloom pass)
    const halo = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.position.y = 0.02; halo.renderOrder = 2;
    surf.add(halo);
    surf.add(sheet);
    surf.scale.y = 0.001;
    scene.add(surf);
    scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x0b1a33, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-6, 7, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb8ff, 0.6); rim.position.set(6, 3, -8); scene.add(rim);

    // floor grid, back wall grid (no amplitude numbers: intensity is relative)
    const floorPts = [];
    for (let k = 0; k <= 8; k += 1) { const x = -W / 2 + (W * k) / 8; floorPts.push(new THREE.Vector3(x, -0.01, -D / 2), new THREE.Vector3(x, -0.01, D / 2)); }
    for (let k = 0; k <= 12; k += 1) { const z = -D / 2 + (D * k) / 12; floorPts.push(new THREE.Vector3(-W / 2, -0.01, z), new THREE.Vector3(W / 2, -0.01, z)); }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(floorPts), new THREE.LineBasicMaterial({ color: 0x24587a, transparent: true, opacity: 0.7 })));
    // depth cue: back rows fade toward the panel background
    scene.fog = new THREE.Fog(0x08121f, 10, 40);
    const wallMat = new THREE.LineBasicMaterial({ color: 0x2a5f80, transparent: true, opacity: 0.55 });
    const wallPts = [];
    for (let k = 0; k <= 4; k += 1) { const y = (Hh * k) / 4; wallPts.push(new THREE.Vector3(-W / 2, y, -D / 2), new THREE.Vector3(W / 2, y, -D / 2)); }
    for (let k = 0; k <= 8; k += 1) { const x = -W / 2 + (W * k) / 8; wallPts.push(new THREE.Vector3(x, 0, -D / 2), new THREE.Vector3(x, Hh, -D / 2)); }
    for (let k = 0; k <= 4; k += 1) { const y = (Hh * k) / 4; wallPts.push(new THREE.Vector3(-W / 2, y, -D / 2), new THREE.Vector3(-W / 2, y, D / 2)); }
    wallPts.push(new THREE.Vector3(-W / 2, 0, D / 2), new THREE.Vector3(-W / 2, Hh, D / 2));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wallPts), wallMat));

    // reference harmonic guides on the floor (textbook values, not measurements)
    const fMax = data.fMaxHz || 40;
    const dashMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.5 });
    refs.forEach((hz) => {
      if (hz > fMax) return;
      const x = (hz / fMax - 0.5) * W;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.01, D / 2 + 0.15), new THREE.Vector3(x, 0.01, -D / 2)]), dashMat);
      l.computeLineDistances();
      scene.add(l);
    });

    // label anchors (projected each frame)
    const anchors = [];
    [0, 10, 20, 30, 40].filter((f) => f <= fMax).forEach((f) => anchors.push({ p: new THREE.Vector3((f / fMax - 0.5) * W, 0, D / 2 + 0.35), cls: 'ax', text: f === 40 ? '40 Hz' : `${f}` }));
    refs.forEach((hz, i) => {
      if (hz > fMax) return;
      const col = Math.min(nf - 1, Math.round((hz / fMax) * nf - 0.5));
      let peak = 0; let at = nt - 1;
      for (let t = 0; t < nt; t += 1) if (sm[col * nt + t] > peak) { peak = sm[col * nt + t]; at = t; }
      const z = -D / 2 + (D * at) / (nt - 1);
      anchors.push({ p: new THREE.Vector3((hz / fMax - 0.5) * W, heightOf(peak) + 0.3, z), cls: `ref r${i}`, text: `${hz.toFixed(2)}` });
    });
    anchors.push({ p: new THREE.Vector3(-W / 2 - 0.15, Hh, -D / 2), cls: 'amp', text: 'high' });
    anchors.push({ p: new THREE.Vector3(-W / 2 - 0.15, 0.1, -D / 2), cls: 'amp', text: 'low' });
    if (timeLabels) {
      anchors.push({ p: new THREE.Vector3(W / 2 + 0.3, 0, -D / 2), cls: 'tm', text: `↑ ${timeLabels[0]}` });
      anchors.push({ p: new THREE.Vector3(W / 2 + 0.3, 0, D / 2 - 0.3), cls: 'tm', text: `↓ ${timeLabels[1]}` });
    }
    const layer = labelRef.current;
    layer.innerHTML = '';
    const els = anchors.map((a) => { const el = document.createElement('span'); el.className = a.cls; el.textContent = a.text; layer.appendChild(el); return el; });

    // --- camera: orbit around the surface ---
    const BASE_AZ = aspect0 > 2 ? 0.2 : 0.42; const BASE_EL = aspect0 > 2 ? 0.21 : 0.29;
    let az = BASE_AZ; let el = BASE_EL;
    const target = new THREE.Vector3(0, Hh * 0.3, 0);
    const corners = [];
    [-W / 2 - 0.6, W / 2 + 1.2].forEach((x) => [0, Hh + 0.35].forEach((y) => [-D / 2, D / 2 + 0.6].forEach((z) => corners.push(new THREE.Vector3(x, y, z)))));
    const place = (a, e, dist) => {
      camera.position.set(target.x + Math.sin(a) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z + Math.cos(a) * Math.cos(e) * dist);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    const tmp = new THREE.Vector3();
    let w = 0; let h = 0; let fitDist = 16;
    function fit() {
      camera.clearViewOffset();
      let d = 5; let box = null;
      for (let k = 0; k < 100; k += 1) {
        place(BASE_AZ, BASE_EL, d);
        let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity; let behind = false;
        corners.forEach((c) => {
          tmp.copy(c).project(camera);
          if (tmp.z > 1) behind = true;
          x0 = Math.min(x0, tmp.x); x1 = Math.max(x1, tmp.x); y0 = Math.min(y0, tmp.y); y1 = Math.max(y1, tmp.y);
        });
        box = { x0, x1, y0, y1 };
        if (!behind && (x1 - x0) / 2 < 0.97 && (y1 - y0) / 2 < 0.93) break;
        d *= 1.03;
      }
      camera.setViewOffset(w, h, (((box.x0 + box.x1) / 2) * w) / 2, (-((box.y0 + box.y1) / 2) * h) / 2, w, h);
      return d;
    }
    const resize = () => {
      w = host.clientWidth; h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`; renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitDist = fit();
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    // drag to orbit (mouse/pen: both axes; touch: horizontal only so the page still scrolls)
    let drag = null; let lastInteract = -1e9; let idlePhase = 0;
    const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, az, el, touch: e.pointerType === 'touch' }; host.setPointerCapture?.(e.pointerId); host.classList.add('dragging'); };
    const onMove = (e) => {
      if (!drag) return;
      az = Math.max(-1.3, Math.min(1.5, drag.az - (e.clientX - drag.x) * 0.008));
      if (!drag.touch) el = Math.max(0.06, Math.min(1.1, drag.el + (e.clientY - drag.y) * 0.005));
      lastInteract = performance.now();
    };
    const onUp = () => { drag = null; host.classList.remove('dragging'); lastInteract = performance.now(); };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    const onDbl = () => { az = BASE_AZ; el = BASE_EL; lastInteract = -1e9; };
    host.addEventListener('dblclick', onDbl);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t0 = null;
    let raf = 0; let last = 0; let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(host);
    const v = new THREE.Vector3();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || now - last < 33) return;
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      if (t0 === null) t0 = now; // start the rise when the panel is first on screen
      const t = (now - t0) / 1000;
      const grow = reduce ? 1 : Math.min(1, t / 1.6);
      surf.scale.y = 1 - (1 - grow) ** 3;
      // idle: drift gently back toward the base view, then sway
      if (!drag && !reduce && now - lastInteract > 4000) {
        idlePhase += dt;
        const goalAz = BASE_AZ + Math.sin(idlePhase * 0.15) * 0.14;
        const goalEl = BASE_EL + Math.sin(idlePhase * 0.11) * 0.03;
        az += (goalAz - az) * Math.min(1, dt * 0.8);
        el += (goalEl - el) * Math.min(1, dt * 0.8);
      }
      place(az, el, fitDist * 1.02);
      scene.fog.near = fitDist - D * 0.15;
      scene.fog.far = fitDist + D * 2.6;
      renderer.render(scene, camera);
      const placed = [];
      anchors.forEach((a, i) => {
        v.copy(a.p);
        const isRef = a.cls.startsWith('ref');
        if (isRef || a.cls === 'amp') v.y *= surf.scale.y;
        v.project(camera);
        const hide = v.z > 1;
        const px = ((v.x + 1) / 2) * w;
        let py = Math.max(isRef ? 20 : 8, ((1 - v.y) / 2) * h);
        if (isRef) {
          const lw = els[i].offsetWidth || 40;
          for (let k = 0; k < 6; k += 1) {
            const hit = placed.find((q) => Math.abs(q.x - px) < (q.w + lw) / 2 + 3 && Math.abs(q.y - py) < 16);
            if (!hit) break;
            py = py - 17 >= 18 ? py - 17 : py + 17;
          }
          placed.push({ x: px, y: py, w: lw });
        }
        els[i].style.visibility = hide ? 'hidden' : 'visible';
        els[i].style.transform = `translate(${px}px, ${py}px)`;
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('dblclick', onDbl);
      geo.dispose(); lineGeo.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [data, refs, timeLabels]);

  return (
    <div className="spec3d" ref={hostRef} title="Drag to orbit · double-click to reset">
      <div className="spec3d-labels" ref={labelRef} aria-hidden="true" />
    </div>
  );
}
