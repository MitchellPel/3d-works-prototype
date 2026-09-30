"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { modelXml } from "@/lib/read-3mf.mjs";

const tint: Record<string, number> = {
  Graphite: 0x5c6560,
  Black: 0x4a4a4a,
  "Warm white": 0xf4efe6,
  "Forest green": 0x1f6b3a,
  Sand: 0xd9c7a3,
  Terracotta: 0xc4654a,
};

function paintColour(name: string) {
  const color = new THREE.Color(tint[name] ?? 0x3ddc6a);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.l < 0.28) color.setHSL(hsl.h, hsl.s, 0.42);
  return color;
}

function positionsFrom3mf(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const verts = [...doc.getElementsByTagNameNS("*", "vertex")];
  const tris = [...doc.getElementsByTagNameNS("*", "triangle")];
  if (!verts.length || !tris.length) throw new Error("empty");
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((tri, index) => {
    [tri.getAttribute("v1"), tri.getAttribute("v2"), tri.getAttribute("v3")].forEach((id, corner) => {
      const vert = verts[Number(id)];
      const at = index * 9 + corner * 3;
      pos[at] = Number(vert?.getAttribute("x"));
      pos[at + 1] = Number(vert?.getAttribute("y"));
      pos[at + 2] = Number(vert?.getAttribute("z"));
    });
  });
  return pos;
}

export function MeshCanvas({
  buffer,
  name,
  wire = false,
  colour = "Forest green",
  onSize,
  onError,
}: {
  buffer: ArrayBuffer;
  name: string;
  wire?: boolean;
  colour?: string;
  onSize?: (text: string) => void;
  onError?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onSizeRef = useRef(onSize);
  const onErrorRef = useRef(onError);
  onSizeRef.current = onSize;
  onErrorRef.current = onError;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let cleanup = () => {};

    (async () => {
      const bytes = buffer.slice(0);
      const color = paintColour(colour);
      const material = () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.4,
          metalness: 0.05,
          side: THREE.DoubleSide,
          wireframe: wire,
        });
      let root: THREE.Object3D;
      const size = new THREE.Vector3();
      try {
        if (/\.3mf$/i.test(name)) {
          const xml = await modelXml(bytes);
          if (!xml) throw new Error("empty");
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(positionsFrom3mf(xml), 3));
          geo.computeVertexNormals();
          geo.computeBoundingBox();
          geo.boundingBox?.getSize(size);
          root = new THREE.Mesh(geo, material());
        } else if (/\.obj$/i.test(name)) {
          root = new OBJLoader().parse(new TextDecoder().decode(bytes));
          root.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) mesh.material = material();
          });
          new THREE.Box3().setFromObject(root).getSize(size);
        } else {
          const geo = new STLLoader().parse(bytes);
          if (!geo.getAttribute("position")?.count) throw new Error("empty");
          geo.computeVertexNormals();
          geo.computeBoundingBox();
          geo.boundingBox?.getSize(size);
          root = new THREE.Mesh(geo, material());
        }
        if (Math.max(size.x, size.y, size.z) === 0) throw new Error("empty");
      } catch {
        if (!dead) onErrorRef.current?.();
        return;
      }
      if (dead) return;

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
      cleanup = () => {
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
      if (dead) cleanup();
    })();

    return () => {
      dead = true;
      cleanup();
    };
  }, [buffer, colour, name, wire]);

  return <div className="mesh-host" ref={host} />;
}
