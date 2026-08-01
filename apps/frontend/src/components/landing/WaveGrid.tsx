"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Contained 3D wave grid — edit-bay signal field under the hero.
 * Pauses offscreen, caps DPR, falls back to null when reduced-motion.
 */
export function WaveGrid({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Skip WebGL on very small / low-end signals
    if (window.innerWidth < 720) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 9.5, 14);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);

    const COLS = 28;
    const ROWS = 18;
    const COUNT = COLS * ROWS;
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2de2c5 });
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const amber = new THREE.Color(0xff9f1c);
    const cyan = new THREE.Color(0x2de2c5);
    const bases: { x: number; z: number }[] = [];

    let i = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c - (COLS - 1) / 2) * 0.55;
        const z = (r - (ROWS - 1) / 2) * 0.55;
        bases.push({ x, z });
        dummy.position.set(x, 0, z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, cyan);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const pointer = { x: 0, z: 0, active: false };
    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      if (
        e.clientY < rect.top ||
        e.clientY > rect.bottom ||
        e.clientX < rect.left ||
        e.clientX > rect.right
      ) {
        pointer.active = false;
        return;
      }
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.x = nx * ((COLS - 1) / 2) * 0.55;
      pointer.z = ny * ((ROWS - 1) / 2) * 0.55;
      pointer.active = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.05 },
    );
    io.observe(wrap);

    const setSize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(w, h, false);
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(wrap);

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = (now - t0) / 1000;

      for (let idx = 0; idx < COUNT; idx++) {
        const { x, z } = bases[idx];
        let wave = Math.sin(x * 0.55 + t * 1.4) * Math.cos(z * 0.55 + t * 1.1) * 0.35;
        if (pointer.active) {
          const dx = x - pointer.x;
          const dz = z - pointer.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          wave += Math.exp(-dist * 0.55) * Math.sin(t * 6 - dist * 1.8) * 1.1;
        }
        dummy.position.set(x, wave, z);
        const s = 0.85 + Math.min(1.2, Math.abs(wave)) * 0.35;
        dummy.scale.set(s, s + Math.abs(wave) * 0.8, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        color.copy(cyan).lerp(amber, Math.min(1, Math.abs(wave) * 0.65));
        mesh.setColorAt(idx, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      <canvas ref={canvasRef} className="h-full w-full opacity-55" />
      {/* Static fallback tint when canvas empty / reduced motion */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_60%,rgba(45,226,197,0.12),transparent_65%)]" />
    </div>
  );
}
