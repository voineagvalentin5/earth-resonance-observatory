import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { subsolarPoint } from '../lib/sun';

// Equirectangular texture on THREE.SphereGeometry: lon 0 faces +X, lon +90 faces -Z.
function lonLatToVec(lat, lon) {
  const r = Math.PI / 180;
  return new THREE.Vector3(Math.cos(lat * r) * Math.cos(lon * r), Math.sin(lat * r), -Math.cos(lat * r) * Math.sin(lon * r));
}

const earthVert = `
varying vec2 vUv; varying vec3 vObjN; varying vec3 vViewN;
void main(){ vUv = uv; vObjN = normalize(normal); vViewN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const earthFrag = `
uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vObjN; varying vec3 vViewN;
void main(){
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  float c = dot(normalize(vObjN), normalize(sunDir));
  float dayMix = smoothstep(-0.08, 0.18, c);
  vec3 lit = day * (0.18 + 1.05 * clamp(c, 0.0, 1.0));
  vec3 dark = night * vec3(1.15, 1.05, 0.95) * 0.95;
  vec3 col = mix(dark, lit, dayMix);
  float rim = pow(1.0 - max(dot(vViewN, vec3(0.0,0.0,1.0)), 0.0), 2.6);
  col += vec3(0.30, 0.55, 1.0) * rim * (0.12 + 0.45 * dayMix);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const atmoVert = `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `;
const atmoFrag = `varying vec3 vN; void main(){ float i = pow(0.68 - dot(vN, vec3(0.0,0.0,1.0)), 3.2); gl_FragColor = vec4(0.32, 0.62, 1.0, 1.0) * i * 1.25; }`;

export default function Globe({ onReady }) {
  const hostRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) { host.dataset.webgl = 'off'; return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    const loader = new THREE.TextureLoader();
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const tex = (url) => { const t = loader.load(url, () => { loaded += 1; if (loaded === 2 && onReady) onReady(); }); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, aniso); return t; };
    let loaded = 0;
    const uniforms = {
      dayMap: { value: tex('/textures/earth-day-2048.jpg') },
      nightMap: { value: tex('/textures/earth-night-2048.jpg') },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
    };
    const tilt = new THREE.Group();
    tilt.rotation.z = 23.4 * Math.PI / 180 * 0.6;
    tilt.rotation.x = 0.28;
    scene.add(tilt);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms, vertexShader: earthVert, fragmentShader: earthFrag }));
    tilt.add(earth);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 48), new THREE.ShaderMaterial({ vertexShader: atmoVert, fragmentShader: atmoFrag, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    scene.add(atmo);

    const setSun = () => { const s = subsolarPoint(new Date()); uniforms.sunDir.value.copy(lonLatToVec(s.lat, s.lon)); };
    setSun();
    const sunTimer = setInterval(setSun, 60000);
    // Start with North America (Michigan ~ -85°) facing the viewer.
    const baseRot = -Math.PI / 2 - (-85 * Math.PI / 180);
    earth.rotation.y = baseRot;

    const resize = () => {
      const w = host.clientWidth; const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`; renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      // keep the globe filling ~78% of the smaller side
      const fit = 1.32 / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.z = w >= h ? fit : fit * (h / w) * 0.98;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0; let last = 0; let visible = true; const t0 = performance.now();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(host);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || now - last < 33) return;
      last = now;
      if (!reduce) earth.rotation.y = baseRot + ((now - t0) / 1000) * 0.035;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); clearInterval(sunTimer); ro.disconnect(); io.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);
  return <div className="globe-canvas" ref={hostRef} />;
}
