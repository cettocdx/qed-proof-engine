"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Animated point-cloud "terrain" inside a wireframe bounding box.
 * Mirrors the reference mood: a dotted wave field undulating in a 3D crate,
 * monochrome with a cyan/green tint, slow auto-rotation.
 */

const GRID = 80; // points per side -> 6400 points
const SPAN = 9; // world units across
const STEP = SPAN / GRID;

function PointField() {
  const ref = useRef<THREE.Points>(null);

  // base XZ grid; Y is animated per-frame
  const { positions, count } = useMemo(() => {
    const count = GRID * GRID;
    const positions = new Float32Array(count * 3);
    let i = 0;
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        positions[i * 3] = x * STEP - SPAN / 2;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = z * STEP - SPAN / 2;
        i++;
      }
    }
    return { positions, count };
  }, []);

  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    const t = clock.elapsedTime;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    for (let idx = 0; idx < count; idx++) {
      const px = arr[idx * 3];
      const pz = arr[idx * 3 + 2];
      const d = Math.sqrt(px * px + pz * pz);
      // layered sine waves -> organic rolling surface
      const y =
        Math.sin(px * 0.6 + t * 0.7) * 0.5 +
        Math.cos(pz * 0.5 - t * 0.5) * 0.5 +
        Math.sin(d * 1.1 - t * 1.2) * 0.6;
      arr[idx * 3 + 1] = y;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.rotation.y = t * 0.06;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        sizeAttenuation
        color="#a9f1ff"
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}

function BoundingCrate() {
  // wireframe box + faint floor grid, matching the "data crate" references
  return (
    <group rotation={[0, Math.PI / 9, 0]}>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(SPAN, SPAN * 0.55, SPAN)]} />
        <lineBasicMaterial color="#1f3a4d" transparent opacity={0.6} />
      </lineSegments>
      <gridHelper
        args={[SPAN, 16, "#16384a", "#0e2535"]}
        position={[0, -SPAN * 0.275, 0]}
      />
    </group>
  );
}

function Scene() {
  return (
    <group rotation={[0.38, 0, 0]}>
      <PointField />
      <BoundingCrate />
    </group>
  );
}

export default function PointCloudHero() {
  return (
    <Canvas
      camera={{ position: [0, 3.4, 11], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <Scene />
    </Canvas>
  );
}
