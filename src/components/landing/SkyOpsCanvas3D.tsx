/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SkyOps 3D WebGL Background Scene & Interactive Cluster Mesh
 * High-performance Three.js topology with dynamic nodes, energy beams, particle packet streams, and projected 3D pins.
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface SkyOpsCanvas3DProps {
  scrollProgress?: number; // 0 to 1 scroll position
  incidentState?: 'crashed' | 'remediating' | 'healthy';
  activeClusterId?: string;
}

export const SkyOpsCanvas3D: React.FC<SkyOpsCanvas3DProps> = ({
  scrollProgress = 0,
  incidentState = 'crashed',
  activeClusterId
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const pinTextRef = useRef<HTMLSpanElement>(null);
  const clusterLabelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animationFrameId: number;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070b, 0.04);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    camera.position.set(0, 1.8, 9.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.4);
    scene.add(ambientLight);

    const coreLight = new THREE.PointLight(0x2f7bff, 3.5, 18);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);

    const spotLight = new THREE.DirectionalLight(0xa5b4fc, 0.8);
    spotLight.position.set(5, 10, 7);
    scene.add(spotLight);

    // 3. SkyOps Core Gem & Rotating Rings
    const gemGeo = new THREE.OctahedronGeometry(0.7, 1);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      emissive: 0x2f7bff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.8
    });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    scene.add(gem);

    const shellGeo = new THREE.IcosahedronGeometry(1.15, 1);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shell);

    const ring1Geo = new THREE.TorusGeometry(1.6, 0.018, 16, 64);
    const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x2f7bff, transparent: true, opacity: 0.5 });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    scene.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.1, 0.015, 16, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.35 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.y = Math.PI / 4;
    scene.add(ring2);

    // Subtle horizontal grid plane
    const gridHelper = new THREE.GridHelper(30, 30, 0x1e3a8a, 0x0f172a);
    gridHelper.position.y = -1.8;
    scene.add(gridHelper);

    // 4. Cluster Nodes Positions
    // 0: Production-EKS, 1: Staging-EKS, 2: Development-GKE, 3: Workload Pod (Target payment-api)
    const clusterPositions = [
      new THREE.Vector3(-4.2, 0.3, 1.2),  // Prod-EKS
      new THREE.Vector3(4.5, 0.8, -0.8),   // Staging-EKS
      new THREE.Vector3(0.0, -1.1, 3.2),   // Dev-GKE
      new THREE.Vector3(-2.4, 1.4, 2.5)    // Crashing Workload: payment-api
    ];

    // Node spheres
    const nodeGroup = new THREE.Group();
    const nodeGeo = new THREE.SphereGeometry(0.24, 24, 24);

    const clusterColors = [0x38bdf8, 0xf59e0b, 0x10b981, 0xef4444];
    const nodeMeshes: THREE.Mesh[] = [];

    clusterPositions.forEach((pos, idx) => {
      const mat = new THREE.MeshStandardMaterial({
        color: clusterColors[idx],
        emissive: clusterColors[idx],
        emissiveIntensity: idx === 3 ? 2.2 : 0.9,
        roughness: 0.3
      });
      const nodeMesh = new THREE.Mesh(nodeGeo, mat);
      nodeMesh.position.copy(pos);
      nodeGroup.add(nodeMesh);
      nodeMeshes.push(nodeMesh);

      // Satellite rings around clusters
      if (idx < 3) {
        const satRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.48, 0.012, 12, 32),
          new THREE.MeshBasicMaterial({ color: clusterColors[idx], transparent: true, opacity: 0.4 })
        );
        satRing.position.copy(pos);
        satRing.rotation.x = Math.PI / 2.5;
        nodeGroup.add(satRing);
      }
    });
    scene.add(nodeGroup);

    // 5. Network Topology Edges
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.28
    });

    const edgePairs = [
      [new THREE.Vector3(0, 0, 0), clusterPositions[0]],
      [new THREE.Vector3(0, 0, 0), clusterPositions[1]],
      [new THREE.Vector3(0, 0, 0), clusterPositions[2]],
      [clusterPositions[0], clusterPositions[3]],
      [clusterPositions[0], clusterPositions[1]],
      [clusterPositions[1], clusterPositions[2]]
    ];

    edgePairs.forEach(([p1, p2]) => {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
    });

    // 6. Healing Energy Beam (From SkyOps Core to Target Workload)
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      clusterPositions[3]
    ]);
    const beamMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      linewidth: 3
    });
    const energyBeam = new THREE.Line(beamGeo, beamMat);
    scene.add(energyBeam);

    // 7. Data Flow Particles
    const particleCount = 45;
    const particleData: Array<{ t: number; speed: number; edgeIdx: number }> = [];
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      particleData.push({
        t: Math.random(),
        speed: 0.25 + Math.random() * 0.4,
        edgeIdx: Math.floor(Math.random() * edgePairs.length)
      });
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.08,
      transparent: true,
      opacity: 0.85
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 0.8;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 0.5;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Window Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Helper: Project 3D vector to DOM pixel coordinate
    const project3D = (vec: THREE.Vector3, element: HTMLElement | null, offsetX = 0, offsetY = 0) => {
      if (!element) return;
      const v = vec.clone();
      v.project(camera);
      // Behind camera check
      if (v.z > 1) {
        element.style.opacity = '0';
        return;
      }
      const x = (v.x * 0.5 + 0.5) * width + offsetX;
      const y = (-(v.y * 0.5) + 0.5) * height + offsetY;
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      element.style.opacity = '1';
    };

    // 8. Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const time = clock.getElapsedTime();

      // Core rotation & pulsing
      gem.rotation.y += dt * 0.6;
      shell.rotation.y -= dt * 0.3;
      shell.rotation.x += dt * 0.15;
      ring1.rotation.z += dt * 0.4;
      ring2.rotation.y += dt * 0.25;

      const energyPulse = Math.sin(time * 3) * 0.3 + 0.7;
      (gem.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + energyPulse * 0.8;

      // Incident Workload Node Color & State
      const targetMesh = nodeMeshes[3];
      if (targetMesh) {
        const mat = targetMesh.material as THREE.MeshStandardMaterial;
        if (incidentState === 'crashed') {
          mat.color.setHex(0xef4444);
          mat.emissive.setHex(0xef4444);
          mat.emissiveIntensity = 1.8 + Math.sin(time * 6) * 1.2;
          beamMat.opacity = Math.sin(time * 4) * 0.4 + 0.4;
          beamMat.color.setHex(0x38bdf8);
        } else if (incidentState === 'remediating') {
          mat.color.setHex(0xf59e0b);
          mat.emissive.setHex(0xf59e0b);
          mat.emissiveIntensity = 2.0;
          beamMat.opacity = 0.9;
          beamMat.color.setHex(0x10b981);
        } else {
          mat.color.setHex(0x10b981);
          mat.emissive.setHex(0x10b981);
          mat.emissiveIntensity = 1.2;
          beamMat.opacity = 0.15;
          beamMat.color.setHex(0x10b981);
        }
      }

      // Flowing particle data packets
      const positions = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const p = particleData[i];
        p.t += p.speed * dt;
        if (p.t > 1) {
          p.t = 0;
          p.edgeIdx = Math.floor(Math.random() * edgePairs.length);
        }
        const edge = edgePairs[p.edgeIdx];
        const a = edge[0];
        const b = edge[1];
        positions[i * 3] = a.x + (b.x - a.x) * p.t;
        positions[i * 3 + 1] = a.y + (b.y - a.y) * p.t;
        positions[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
      }
      particleGeo.attributes.position.needsUpdate = true;

      // Camera motion interpolation with mouse parallax & scroll progress
      const targetCamX = mouseX * 2.5 + Math.sin(scrollProgress * Math.PI) * 1.5;
      const targetCamY = 1.8 - mouseY * 1.5 - scrollProgress * 1.2;
      const targetCamZ = 9.5 - scrollProgress * 2.5;

      camera.position.x += (targetCamX - camera.position.x) * 0.05;
      camera.position.y += (targetCamY - camera.position.y) * 0.05;
      camera.position.z += (targetCamZ - camera.position.z) * 0.05;
      camera.lookAt(0, 0, 0);

      // DOM Pins 3D Projection
      if (pinRef.current) {
        const pinPos = clusterPositions[3].clone();
        pinPos.y += 0.35;
        project3D(pinPos, pinRef.current, -80, -30);
      }

      // Cluster Label Overlay Projections
      clusterPositions.slice(0, 3).forEach((pos, idx) => {
        const labelEl = clusterLabelRefs.current[idx];
        if (labelEl) {
          const lPos = pos.clone();
          lPos.y += 0.35;
          project3D(lPos, labelEl, -60, -20);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      gemGeo.dispose();
      gemMat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      nodeGeo.dispose();
      lineMat.dispose();
      beamGeo.dispose();
      beamMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
    };
  }, [incidentState, scrollProgress]);

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden select-none">
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Atmospheric Veil & Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_65%_45%,transparent_35%,rgba(5,7,11,0.85)_100%),linear-gradient(90deg,rgba(5,7,11,0.85),transparent_55%)]" />

      {/* Dynamic Projected 3D Pin: Target Workload pod */}
      <div
        ref={pinRef}
        className="absolute top-0 left-0 transition-opacity duration-300 pointer-events-none z-20"
        style={{ willChange: 'transform, opacity' }}
      >
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md border text-[11px] font-mono font-bold shadow-xl ${
            incidentState === 'crashed'
              ? 'bg-rose-950/80 text-rose-300 border-rose-600/80 shadow-rose-950/50 animate-pulse'
              : incidentState === 'remediating'
              ? 'bg-amber-950/80 text-amber-300 border-amber-600/80 shadow-amber-950/50'
              : 'bg-emerald-950/80 text-emerald-300 border-emerald-600/80 shadow-emerald-950/50'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              incidentState === 'crashed'
                ? 'bg-rose-500'
                : incidentState === 'remediating'
                ? 'bg-amber-400'
                : 'bg-emerald-400'
            }`}
          />
          <span ref={pinTextRef}>
            {incidentState === 'crashed'
              ? 'payment-api · CrashLoopBackOff'
              : incidentState === 'remediating'
              ? 'payment-api · Patching Limits…'
              : 'payment-api · 12/12 Healthy'}
          </span>
        </div>
      </div>

      {/* Dynamic Projected Cluster Labels */}
      {[
        { name: 'Production-EKS', meta: '12 nodes · 492 pods' },
        { name: 'Staging-EKS', meta: '4 nodes · 118 pods' },
        { name: 'Development-GKE', meta: '3 nodes · 64 pods' }
      ].map((cl, i) => (
        <div
          key={i}
          ref={(el) => {
            clusterLabelRefs.current[i] = el;
          }}
          className="absolute top-0 left-0 transition-opacity duration-300 pointer-events-none z-10 hidden sm:block"
          style={{ willChange: 'transform, opacity' }}
        >
          <div className="px-2.5 py-1 rounded-lg bg-zinc-950/70 backdrop-blur-sm border border-zinc-800/80 text-[10px] font-mono text-zinc-300 shadow-lg">
            <div className="font-bold text-sky-400">{cl.name}</div>
            <div className="text-zinc-500">{cl.meta}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
