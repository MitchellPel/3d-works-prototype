"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const tint: Record<string, number> = {
  Graphite: 0x3a3f3b,
  Black: 0x222222,
  "Warm white": 0xf4efe6,
  "Forest green": 0x1f6b3a,
  Sand: 0xd9c7a3,
  Terracotta: 0xc4654a,
};

export function MeshCanvas({
  buffer,
  name,
  wire = false,
  colour = "Forest green",
  onSize,
}: {
  buffer: ArrayBuffer;
  name: string;
  wire?: boolean;
  colour?: string;
  onSize?: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onSizeRef = useRef(onSize);
  onSizeRef.current = onSize;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x243028, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    scene.add(key);

    const color = tint[colour] ?? 0x3ddc6a;
    const material = () =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, wireframe: wire });
    let root: THREE.Object3D;
    const size = new THREE.Vector3();
    const bytes = buffer.slice(0);
    try {
      if (/\.obj$/i.test(name)) {
        root = new OBJLoader().parse(new TextDecoder().decode(bytes));
        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) mesh.material = material();
        });
        new THREE.Box3().setFromObject(root).getSize(size);
      } else {
        const geo = new STLLoader().parse(bytes);
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        geo.boundingBox?.getSize(size);
        root = new THREE.Mesh(geo, material());
      }
    } catch {
      renderer.dispose();
      return;
    }

    onSizeRef.current?.(`${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(0)}`);
    const max = Math.max(size.x, size.y, size.z) || 1;
    root.rotation.x = -Math.PI / 2;
    root.scale.setScalar(1.6 / max);
    root.updateMatrixWorld(true);
    root.position.sub(new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()));
    scene.add(root);

    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    el.appendChild(canvas);
    const fit = () => {
      const w = el.clientWidth || 300;
      const h = el.clientHeight || 220;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.set(1.8, 1.3, 2.4);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((item) => item.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      canvas.remove();
    };
  }, [buffer, colour, name, wire]);

  return <div className="mesh-host" ref={host} />;
}
