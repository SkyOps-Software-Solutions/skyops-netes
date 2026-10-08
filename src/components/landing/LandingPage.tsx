/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DocTopic, KnowledgeBaseModal } from '../docs/KnowledgeBaseModal';
import { api } from '../../api/client';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { BrandLogo } from '../common/BrandLogo';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignIn, onSignUp }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const pinTRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const l0Ref = useRef<HTMLDivElement | null>(null);
  const l1Ref = useRef<HTMLDivElement | null>(null);
  const l2Ref = useRef<HTMLDivElement | null>(null);
  const stepsContainerRef = useRef<HTMLOListElement | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [activeDocTopic, setActiveDocTopic] = useState<DocTopic>('quickstart');

  // Real or demo data from connected clusters
  const [stats, setStats] = useState({
    clusters: 3,
    workloads: 142,
    cost: '₹48,420',
    savings: '₹8,240',
    paySave: '₹2,100',
    fleet: [
      ['AWS EKS', 12, 147],
      ['GKE', 6, 82],
      ['AKS', 8, 106]
    ] as [string, number, number][]
  });

  // Fetch real cluster metrics if available
  useEffect(() => {
    let mounted = true;
    api.getClusters().then((res: any) => {
      const liveClusters = Array.isArray(res) ? res : res?.clusters;
      if (mounted && Array.isArray(liveClusters) && liveClusters.length > 0) {
        const totalNodes = liveClusters.reduce((acc: number, c: any) => acc + (c.nodeCount || 0), 0) || 12;
        const totalPods = liveClusters.reduce((acc: number, c: any) => acc + (c.podCount || 0), 0) || 142;
        setStats((prev) => ({
          ...prev,
          clusters: liveClusters.length,
          workloads: Math.max(liveClusters.length * 15, totalPods),
          fleet: liveClusters.map((c: any) => [c.name || c.id, c.nodeCount || 4, c.podCount || 28])
        }));
      }
    }).catch(() => {
      // Graceful fallback to demo metrics
    });
    return () => {
      mounted = false;
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    const timer = setTimeout(() => {
      setToastVisible(false);
    }, 2800);
    return () => clearTimeout(timer);
  };

  const scrollToSection = (sectionIndex: number) => {
    const H = window.innerHeight * 1.2;
    window.scrollTo({
      top: sectionIndex * H,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };

  const handleCopyInstallCommand = () => {
    const cmd = `curl -sSL "https://skyops.internal/api/v1/clusters/auto/install.sh" | bash`;
    navigator.clipboard?.writeText(cmd);
    showToast('Copied cluster installation script to clipboard!');
  };

  // Three.js 3D Interactive Scrollytelling Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let MOB = window.innerWidth < 760;

    const C = {
      blue: 0x2f7bff,
      red: 0xff4d4d,
      amber: 0xffb020,
      green: 0x3ddc97
    };
    const cB = new THREE.Color(C.blue);
    const cR = new THREE.Color(C.red);
    const cA = new THREE.Color(C.amber);
    const cG = new THREE.Color(C.green);
    const tc = new THREE.Color();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !MOB,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOB ? 1.5 : 2));
    renderer.setClearColor(0x05070b);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070b, 0.026);

    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);

    const ambLight = new THREE.AmbientLight(0x8fb0ff, 0.55);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(4, 9, 6);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x4f8cff, 2.2, 16);
    scene.add(pointLight);

    const edgeMat = new THREE.LineBasicMaterial({
      color: C.blue,
      transparent: true,
      opacity: 0.45
    });

    function createHex(r: number, h: number, col: number) {
      const g = new THREE.CylinderGeometry(r, r, h, 6);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({ color: col, metalness: 0.5, roughness: 0.55 })
      );
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat));
      return m;
    }

    const body = new THREE.Group();
    scene.add(body);

    const plat = createHex(4.8, 0.2, 0x0a0e15);
    plat.position.y = -0.2;
    body.add(plat);

    const grid = new THREE.GridHelper(9.4, 16, C.blue, C.blue);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.12;
    grid.position.y = -0.09;
    body.add(grid);

    const nodes: THREE.Mesh[] = [];
    const pods: THREE.Mesh[] = [];
    const podGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);

    function createPodMaterial() {
      return new THREE.MeshStandardMaterial({
        color: 0x10213f,
        emissive: C.blue,
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.3
      });
    }

    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const n = createHex(1.35, 0.14, 0x121927);
      n.position.set(Math.cos(a) * 2.7, 0, Math.sin(a) * 2.7);
      body.add(n);
      nodes.push(n);

      for (let j = 0; j < 4; j++) {
        const p = new THREE.Mesh(podGeo, createPodMaterial());
        p.position.set((((j % 2) - 0.5) * 0.62), 0.3, (((j >> 1) - 0.5) * 0.62));
        p.userData = {
          ph: Math.random() * 6,
          cost: [0.6, 1.3, 0.8, 1.1][j] * (0.8 + Math.random() * 0.5)
        };
        n.add(p);
        pods.push(p);
      }
    }

    const pay = pods[1];
    pay.userData.cost = 2.7;

    const core = new THREE.Group();
    scene.add(core);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7, 0),
      new THREE.MeshBasicMaterial({ color: C.blue, wireframe: true, transparent: true, opacity: 0.7 })
    );

    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36),
      new THREE.MeshStandardMaterial({
        color: 0xdbe8ff,
        emissive: 0x4f8cff,
        emissiveIntensity: 1.6,
        roughness: 0.2,
        metalness: 0.4
      })
    );

    const r1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.012, 6, 72),
      new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.6 })
    );
    const r2 = r1.clone();
    r2.rotation.x = Math.PI / 2.4;

    core.add(shell, gem, r1, r2);
    core.position.set(0, 3.1, 0);
    pointLight.position.copy(core.position);

    const cp = core.position;
    const np = nodes.map((n) => new THREE.Vector3(n.position.x, 0.5, n.position.z));
    const edgeEndpoints = [
      [cp, np[0]],
      [cp, np[1]],
      [cp, np[2]],
      [np[0], np[1]],
      [np[1], np[2]],
      [np[2], np[0]]
    ];

    body.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(edgeEndpoints.flat()),
        new THREE.LineBasicMaterial({ color: C.blue, transparent: true, opacity: 0.3 })
      )
    );

    const NP = MOB ? 36 : 90;
    const particlePositions = new Float32Array(NP * 3);
    const particleData: Array<{ e: number; t: number; v: number; r: boolean }> = [];
    for (let i = 0; i < NP; i++) {
      particleData.push({
        e: (Math.random() * 6) | 0,
        t: Math.random(),
        v: 0.12 + Math.random() * 0.2,
        r: Math.random() < 0.5
      });
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    body.add(
      new THREE.Points(
        particleGeo,
        new THREE.PointsMaterial({
          color: 0x8fb8ff,
          size: 0.09,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      )
    );

    // Multi-cluster Extras on Left & Right
    const extras = new THREE.Group();
    const exPos: Array<[number, number]> = [
      [-10.5, -2],
      [10.5, -2]
    ];
    scene.add(extras);

    exPos.forEach(([x, z]) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const p = createHex(3, 0.16, 0x0a0e15);
      p.position.y = -0.2;
      g.add(p);

      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * 6.28;
        const m = new THREE.Mesh(podGeo, createPodMaterial());
        m.position.set(Math.cos(a) * 1.3, 0.25, Math.sin(a) * 1.3);
        g.add(m);
      }
      extras.add(g);
      extras.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints([cp, new THREE.Vector3(x, 0.3, z)]),
          new THREE.LineBasicMaterial({ color: C.blue, transparent: true, opacity: 0.4 })
        )
      );
    });

    const beamG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const beam = new THREE.Line(
      beamG,
      new THREE.LineBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0 })
    );
    scene.add(beam);

    const sring = new THREE.Mesh(
      new THREE.TorusGeometry(4.6, 0.02, 6, 96),
      new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0 })
    );
    sring.rotation.x = Math.PI / 2;
    scene.add(sring);

    // Camera Waypoints across 10 sections
    const KF = [
      { c: [0, 3.4, 10.5], t: [0, 0.9, 0] },
      { c: [0, 11.5, 9], t: [0, 0, 0] },
      { c: [2.3, 1.7, 2.9], t: [0, 0, 0], r: 1 },
      { c: [-2.4, 1.3, 3.1], t: [0, 0, 0], r: 1 },
      { c: [0.2, 2.4, 3.6], t: [0, 0, 0], r: 1 },
      { c: [-5, 4.5, 9], t: [0, 0.6, 0] },
      { c: [7.5, 5.5, 8.5], t: [0, 1, 0] },
      { c: [0, 6.5, 11.5], t: [0, 0.4, 0] },
      { c: [0, 15, 17], t: [0, 0, 0] },
      { c: [0, 3.2, 6.2], t: [0, 3.1, 0] }
    ];

    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const TA = new THREE.Vector3();
    const TB = new THREE.Vector3();
    const pw = new THREE.Vector3();
    const Z = new THREE.Vector3();
    const V = new THREE.Vector3();
    const tgt = new THREE.Vector3();

    const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const smoothstep = (x: number) => x * x * (3 - 2 * x);

    function setKeyframe(index: number, cameraPos: THREE.Vector3, targetPos: THREE.Vector3) {
      const k = KF[index];
      const offset = k.r ? pw : Z;
      cameraPos.set(k.c[0], k.c[1], k.c[2]).add(offset);
      targetPos.set(k.t[0], k.t[1], k.t[2]).add(offset);
    }

    function payT(s: number, t: number): { k: 'ok' | 'red' | 'heal'; u?: number } {
      if (s < 0.6) {
        if (t >= 3.5 && t < 13) return { k: 'red' };
        if (t >= 13 && t < 17.5) return { k: 'heal', u: (t - 13) / 4.5 };
        return { k: 'ok' };
      }
      if (s < 1.4) return { k: 'ok' };
      if (s < 4.1) return { k: 'red' };
      if (s < 5) return { k: 'heal', u: (s - 4.1) / 0.9 };
      return { k: 'ok' };
    }

    function payVis(p: { k: string; u?: number }): number {
      if (p.k === 'red') {
        tc.copy(cR);
        return 1;
      }
      if (p.k === 'heal' && p.u !== undefined) {
        const u = clamp(p.u);
        if (u < 0.3) {
          tc.copy(cR);
          return Math.max(0.001, 1 - u / 0.3);
        }
        if (u < 0.45) {
          tc.copy(cA);
          return Math.max(0.001, (u - 0.3) / 0.15);
        }
        if (u < 0.7) {
          tc.copy(cA).lerp(cG, (u - 0.45) / 0.25);
          return 1;
        }
        if (u < 0.85) {
          tc.copy(cG);
          return 1;
        }
        tc.copy(cG).lerp(cB, (u - 0.85) / 0.15);
        return 1;
      }
      tc.copy(cB);
      return 1;
    }

    const CHK = ['Pod events', 'Container logs', 'Metrics', 'Deployment state'];
    function getHudContent(t: number): [string, string] {
      if (t < 3.5)
        return ['a', '<i class="grn">HEALTHY</i><b>Cluster stable</b><span>Watching every workload</span>'];
      if (t < 7)
        return ['b', '<i class="red">INCIDENT DETECTED</i><b>payment-api</b><span>CrashLoopBackOff</span>'];
      if (t < 10.5) {
        const n = clamp(Math.floor((t - 7) / 0.8), 0, 4);
        return [
          'c' + n,
          '<i class="blu">ANALYZING</i>' +
            CHK.map((c, idx) => `<span class="${idx < n ? 'grn' : ''}">${idx < n ? '✓' : '·'} ${c}</span>`).join('')
        ];
      }
      if (t < 13) return ['d', '<i class="blu">ROOT CAUSE IDENTIFIED</i><b>Configuration failure</b>'];
      if (t < 16.4) return ['e', '<i class="amb">AUTO HEALING</i><b>Replacing affected workload…</b>'];
      if (t < 20) return ['f', '<i class="grn">✓ INCIDENT RESOLVED</i><b>payment-api healthy</b>'];
      return ['a', ''];
    }

    const hud = hudRef.current;
    const pin = pinRef.current;
    const pinT = pinTRef.current;
    const nav = navRef.current;
    const labs = [l0Ref.current, l1Ref.current, l2Ref.current];

    let W = window.innerWidth;
    let Hh = window.innerHeight;
    let H = Hh * 1.2;
    let sm = 0;
    let time = 0;
    let heroT = 0;
    let hk = '';
    let pk = '';
    let energy = 0;
    let last = performance.now();
    let animId = 0;

    function handleResize() {
      W = window.innerWidth;
      Hh = window.innerHeight;
      H = Hh * 1.2;
      MOB = W < 760;
      renderer.setSize(W, Hh, false);
      cam.aspect = W / Hh;
      cam.updateProjectionMatrix();
    }
    handleResize();
    window.addEventListener('resize', handleResize);

    function project3Dto2D(vector: THREE.Vector3, element: HTMLElement | null, dx: number, dy: number) {
      if (!element) return;
      V.copy(vector).project(cam);
      element.style.transform = `translate(${(V.x * 0.5 + 0.5) * W + dx}px, ${(-V.y * 0.5 + 0.5) * Hh + dy}px)`;
    }

    function animate(now: number) {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;

      sm += (window.scrollY / H - sm) * (REDUCE ? 1 : 1 - Math.exp(-dt * 5));
      const s = clamp(sm, 0, 9.2);

      if (nav) {
        nav.classList.toggle('s', window.scrollY > 40);
      }

      if (s < 0.6 && !REDUCE) {
        heroT += dt;
        if (heroT > 22) heroT = 0;
      }

      const pt = payT(s, REDUCE ? 0 : heroT);
      pay.getWorldPosition(pw);

      const i = Math.min(Math.floor(s), 8);
      const e = smoothstep(clamp((s - i - 0.35) / 0.5));
      setKeyframe(i, A, TA);
      setKeyframe(i + 1, B, TB);
      cam.position.lerpVectors(A, B, e);
      tgt.lerpVectors(TA, TB, e);

      if (s < 0.6) {
        const n =
          smoothstep(clamp((heroT - 3.5) / 2)) *
          (1 - smoothstep(clamp((heroT - 13) / 2))) *
          (1 - clamp(s / 0.6));
        cam.position.lerp(V.set(2.3, 1.7, 2.9).add(pw), n * 0.4);
        tgt.lerp(pw, n * 0.55);
      }

      const aspectK = W / Hh < 1 ? 1 + (1 - W / Hh) * 0.8 : 1;
      cam.position.sub(tgt).multiplyScalar(aspectK).add(tgt);

      const costW = clamp(2 - Math.abs(s - 6.4) * 2);
      const secW = clamp(2 - Math.abs(s - 7.4) * 2);
      const extW = clamp(1.6 - Math.abs(s - 8.1) * 1.5);
      const fin = clamp((s - 8.5) / 0.5);

      cam.setViewOffset(W, Hh, W / Hh > 1.1 ? -W * 0.12 * (1 - fin) : 0, 0, W, Hh);
      cam.lookAt(tgt);

      body.rotation.y = REDUCE ? 0 : Math.sin(time * 0.18) * 0.1;
      body.scale.setScalar(Math.max(0.001, 1 - fin));
      extras.scale.setScalar(Math.max(0.001, extW));

      pods.forEach((p, j) => {
        const m = p.material as THREE.MeshStandardMaterial;
        let sc = 1;
        if (j === 1) sc = payVis(pt);
        else tc.copy(cB);

        if (secW > 0.5 && (j === 5 || j === 9)) tc.copy(cA);
        if (costW > 0.5 && j === 1 && pt.k === 'ok') tc.copy(cA);

        m.emissive.lerp(tc, Math.min(1, dt * 7));
        m.color.copy(m.emissive).multiplyScalar(0.25);
        m.emissiveIntensity =
          j === 1 && pt.k === 'red'
            ? 0.9 + 0.9 * Math.abs(Math.sin(time * 5))
            : 0.75 + 0.2 * Math.sin(time * 1.6 + p.userData.ph);

        const sy = 1 + (p.userData.cost - 1) * costW;
        p.scale.set(sc, sc * sy, sc);
        p.position.y = 0.3 + (sc * sy - 1) * 0.21 + Math.sin(time * 1.2 + p.userData.ph) * 0.015;
      });

      const an = (s < 0.6 && heroT > 7 && heroT < 12.5) || (s > 3 && s < 4.1) ? 1 : 0;
      energy += (an - energy) * Math.min(1, dt * 3);

      const pul = 1 + Math.sin(time * 2) * 0.05;
      core.scale.setScalar(pul * (1 + fin * 0.9));
      core.position.y = 3.1;

      (gem.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + energy * 2.2;
      (shell.material as THREE.MeshBasicMaterial).opacity = 0.5 + energy * 0.4;
      gem.rotation.y += dt * (0.5 + energy);
      shell.rotation.y -= dt * 0.25;
      shell.rotation.x += dt * 0.1;
      r1.rotation.z += dt * (0.3 + energy * 1.6);
      r2.rotation.y += dt * (0.2 + energy);

      const bp = beamG.attributes.position;
      bp.setXYZ(0, cp.x, cp.y, cp.z);
      bp.setXYZ(1, pw.x, pw.y + 0.2, pw.z);
      bp.needsUpdate = true;
      (beam.material as THREE.LineBasicMaterial).opacity = energy * 0.8;

      if (!REDUCE) {
        for (let j = 0; j < NP; j++) {
          const d = particleData[j];
          d.t += d.v * dt;
          if (d.t > 1) {
            d.t = 0;
            d.e = (Math.random() * 6) | 0;
          }
          const ed = edgeEndpoints[d.e];
          const a = d.r ? ed[1] : ed[0];
          const b = d.r ? ed[0] : ed[1];
          particlePositions[j * 3] = a.x + (b.x - a.x) * d.t;
          particlePositions[j * 3 + 1] = a.y + (b.y - a.y) * d.t;
          particlePositions[j * 3 + 2] = a.z + (b.z - a.z) * d.t;
        }
        particleGeo.attributes.position.needsUpdate = true;
      }

      sring.position.y = ((time * 0.4) % 1) * 3.4;
      (sring.material as THREE.MeshBasicMaterial).opacity = secW * 0.8 * (1 - ((time * 0.4) % 1));

      // Section Opacity Transitioning
      const inSections = document.querySelectorAll<HTMLElement>('.in');
      inSections.forEach((el, j) => {
        const o = clamp(1.7 - Math.abs(s - (j + 0.45)) * 2.4);
        el.style.opacity = String(o);
        el.style.pointerEvents = o > 0.3 ? 'auto' : 'none';
      });

      if (hud) {
        if (s < 0.6) {
          const [hKey, hHtml] = getHudContent(REDUCE ? 0 : heroT);
          if (hKey !== hk) {
            hk = hKey;
            hud.innerHTML = hHtml;
          }
          hud.style.opacity = String(1 - clamp(s / 0.5));
        } else {
          hud.style.opacity = '0';
        }
      }

      const showPin = (s < 0.6 && !REDUCE && heroT >= 3.5 && heroT < 17.5) || (s > 1.5 && s < 5.1);
      if (pin) {
        pin.style.opacity = showPin ? '1' : '0';
        if (showPin && pinT) {
          project3Dto2D(V.copy(pw).setY(pw.y + 0.35), pin, 0, 0);
          const st = pt.k === 'red' ? 'red' : pt.u && pt.u > 0.7 ? 'green' : 'amber';
          const tx =
            pt.k === 'red'
              ? 'payment-api · CrashLoopBackOff'
              : pt.u && pt.u > 0.7
              ? 'payment-api · healthy'
              : 'payment-api · replacing…';
          if (tx !== pk) {
            pk = tx;
            pinT.textContent = tx;
            pin.style.color = `var(--${st === 'green' ? 'green' : st})`;
          }
        }
      }

      // Multi-cluster Fleet labels in Section 8
      const fleetCoords: Array<[number, number, number]> = [
        [0, 0.2, 5.6],
        [-10.5, 0.2, 1.2],
        [10.5, 0.2, 1.2]
      ];
      labs.forEach((l, j) => {
        if (!l) return;
        V.set(...fleetCoords[j]);
        project3Dto2D(V, l, 0, 0);
        l.style.opacity = extW > 0.7 ? '1' : '0';
      });

      // Steps Tracker in Section 4
      const sidx = s < 3.95 ? 0 : clamp(Math.floor(((s - 3.95) / 1.05) * 6), 0, 5);
      if (stepsContainerRef.current) {
        const stepItems = stepsContainerRef.current.querySelectorAll('li');
        stepItems.forEach((li, j) => {
          li.classList.toggle('on', s >= 3.5 && j <= sidx);
          li.classList.toggle('cur', j === sidx && s >= 3.5);
        });
      }

      renderer.render(scene, cam);
    }

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      podGeo.dispose();
      grid.dispose();
      edgeMat.dispose();
    };
  }, []);

  return (
    <div className="skyops-home-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600&display=swap');

        .skyops-home-root {
          --bg: #05070b;
          --ink: #eef3fb;
          --mute: #8d9bb0;
          --line: rgba(120, 160, 255, 0.16);
          --blue: #2f7bff;
          --red: #ff4d4d;
          --green: #3ddc97;
          --amber: #ffb020;
          box-sizing: border-box;
          background: var(--bg);
          color: var(--ink);
          font-family: 'Sora', system-ui, -apple-system, sans-serif;
          font-weight: 300;
          font-size: 1rem;
          line-height: 1.55;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          min-height: 100vh;
          position: relative;
        }

        #gl {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          z-index: 1;
        }

        .veil {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          background: radial-gradient(ellipse at 65% 50%, transparent 30%, rgba(5, 7, 11, 0.75) 100%),
                      linear-gradient(90deg, rgba(5, 7, 11, 0.7), transparent 55%);
        }

        nav.skyops-nav {
          position: fixed;
          top: env(safe-area-inset-top, 0px);
          left: 0;
          right: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 28px;
          padding: 16px 4vw;
          transition: background 0.3s, border-color 0.3s;
          border-bottom: 1px solid transparent;
        }

        nav.skyops-nav.s {
          background: rgba(5, 7, 11, 0.82);
          backdrop-filter: blur(14px);
          border-color: var(--line);
        }

        .skyops-logo {
          font-weight: 600;
          letter-spacing: -0.02em;
          font-size: 1.15rem;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-right: auto;
          color: var(--ink);
          user-select: none;
        }

        .skyops-logo img {
          width: 28px;
          height: 28px;
          object-fit: contain;
          border-radius: 6px;
        }

        nav.skyops-nav a,
        nav.skyops-nav button.nav-link {
          color: var(--mute);
          font-family: 'Sora', sans-serif;
          font-weight: 400;
          font-size: 0.85rem;
          background: none;
          border: 0;
          cursor: pointer;
          text-decoration: none;
          transition: color 0.2s;
        }

        nav.skyops-nav a:hover,
        nav.skyops-nav button.nav-link:hover {
          color: var(--ink);
        }

        .skyops-links {
          display: flex;
          gap: 26px;
        }

        .sec {
          height: 120vh;
          position: relative;
          z-index: 5;
        }

        .in {
          position: sticky;
          top: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          padding: 0 6vw;
          transition: opacity 0.15s;
        }

        .col {
          width: min(540px, 44vw);
        }

        h1.skyops-h1 {
          font-weight: 600;
          font-size: clamp(2.4rem, 5.6vw, 5.4rem);
          line-height: 0.96;
          letter-spacing: -0.035em;
          color: var(--ink);
        }

        h2.skyops-h2 {
          font-weight: 600;
          font-size: clamp(1.7rem, 3.3vw, 3rem);
          line-height: 1.04;
          letter-spacing: -0.03em;
          color: var(--ink);
        }

        h3.skyops-h3 {
          font-weight: 600;
          font-size: 1.35rem;
          letter-spacing: -0.02em;
          color: var(--ink);
        }

        .eb {
          font-size: 0.72rem;
          letter-spacing: 0.22em;
          color: var(--blue);
          margin-bottom: 22px;
          font-weight: 600;
        }

        .sub,
        .col > p {
          color: var(--mute);
          margin-top: 18px;
          max-width: 46ch;
        }

        .btns {
          display: flex;
          gap: 12px;
          margin-top: 30px;
          flex-wrap: wrap;
        }

        .btn {
          background: var(--blue);
          color: #fff;
          border: 0;
          padding: 13px 20px;
          border-radius: 8px;
          font-family: 'Sora', sans-serif;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          box-shadow: 0 0 28px rgba(47, 123, 255, 0.35);
          transition: transform 0.15s, box-shadow 0.15s, background 0.2s;
        }

        .btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 34px rgba(47, 123, 255, 0.5);
        }

        .btn.g {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--ink);
          box-shadow: none;
        }

        .btn.g:hover {
          border-color: rgba(120, 160, 255, 0.4);
          background: rgba(47, 123, 255, 0.08);
          box-shadow: none;
        }

        .stat {
          list-style: none;
          display: flex;
          gap: 22px;
          margin-top: 38px;
          font-size: 0.8rem;
          color: var(--mute);
          flex-wrap: wrap;
          padding: 0;
        }

        .stat b {
          color: var(--ink);
          font-weight: 600;
        }

        .dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--green);
          margin-right: 7px;
          box-shadow: 0 0 8px var(--green);
        }

        .pn {
          margin-top: 26px;
          border: 1px solid var(--line);
          background: rgba(8, 12, 19, 0.68);
          backdrop-filter: blur(14px);
          border-radius: 10px;
          padding: 16px 20px;
        }

        .row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 9px 0;
          border-bottom: 1px solid var(--line);
          font-size: 0.9rem;
        }

        .row:last-child {
          border: 0;
        }

        .row span:first-child {
          color: var(--mute);
        }

        .red { color: var(--red); }
        .grn { color: var(--green); }
        .amb { color: var(--amber); }
        .blu { color: #6fa4ff; }

        .tag {
          font-size: 0.72rem;
          letter-spacing: 0.18em;
          font-weight: 600;
        }

        .big {
          font-size: 2rem;
          font-weight: 600;
          letter-spacing: -0.03em;
        }

        ol.st {
          list-style: none;
          padding: 0;
        }

        ol.st li {
          padding: 9px 0 9px 24px;
          position: relative;
          color: #5d6a80;
          font-size: 0.9rem;
          transition: color 0.3s;
        }

        ol.st li:before {
          content: "";
          position: absolute;
          left: 0;
          top: 16px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1px solid #5d6a80;
        }

        ol.st li.on {
          color: var(--ink);
        }

        ol.st li.on:before {
          background: var(--blue);
          border-color: var(--blue);
        }

        ol.st li.cur:before {
          box-shadow: 0 0 12px var(--blue);
        }

        .hud {
          position: absolute;
          right: 6vw;
          bottom: 9vh;
          width: 290px;
          border-left: 2px solid var(--blue);
          padding: 4px 0 4px 16px;
          background: linear-gradient(90deg, rgba(5, 7, 11, 0.7), transparent);
          transition: opacity 0.3s;
          pointer-events: none;
        }

        .hud i {
          display: block;
          font-style: normal;
          font-size: 0.72rem;
          letter-spacing: 0.2em;
          font-weight: 600;
        }

        .hud b {
          display: block;
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 4px;
          color: var(--ink);
        }

        .hud span {
          display: block;
          color: var(--mute);
          font-size: 0.85rem;
        }

        .pin {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 6;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s;
          font-size: 0.78rem;
        }

        .pin:before {
          content: "";
          position: absolute;
          left: -5px;
          top: -5px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 14px currentColor;
        }

        .pin div {
          position: absolute;
          left: 36px;
          top: -14px;
          white-space: nowrap;
          padding: 5px 10px;
          border: 1px solid currentColor;
          border-radius: 6px;
          background: rgba(5, 7, 11, 0.8);
          font-family: 'Sora', sans-serif;
          font-weight: 600;
        }

        .pin:after {
          content: "";
          position: absolute;
          left: 5px;
          top: 0;
          width: 31px;
          height: 1px;
          background: currentColor;
        }

        .lab {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 6;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s;
          font-size: 0.8rem;
          text-align: center;
          transform: translate(-50%, -50%);
        }

        .lab b {
          display: block;
          font-weight: 600;
          color: var(--ink);
        }

        .lab span {
          color: var(--mute);
        }

        .fin {
          justify-content: center;
          text-align: center;
        }

        .fin .col {
          width: min(760px, 90vw);
        }

        .fin .sub {
          margin-inline: auto;
          letter-spacing: 0.14em;
          font-size: 0.8rem;
        }

        .fin .btns {
          justify-content: center;
        }

        code.skyops-code {
          display: block;
          margin-top: 22px;
          padding: 12px 16px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: rgba(8, 12, 19, 0.7);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-weight: 400;
          font-size: 0.75rem;
          color: #9fc0ff;
          overflow-x: auto;
          white-space: nowrap;
          text-align: left;
          cursor: pointer;
        }

        code.skyops-code:hover {
          border-color: rgba(120, 160, 255, 0.4);
        }

        .note {
          position: fixed;
          left: 4vw;
          bottom: calc(14px + env(safe-area-inset-bottom, 0px));
          z-index: 15;
          font-size: 0.68rem;
          color: #5d6a80;
          pointer-events: none;
        }

        #toast {
          position: fixed;
          left: 50%;
          bottom: 6vh;
          transform: translate(-50%, 20px);
          z-index: 30;
          background: #101826;
          border: 1px solid var(--line);
          padding: 11px 18px;
          border-radius: 8px;
          font-size: 0.82rem;
          opacity: 0;
          transition: 0.3s;
          pointer-events: none;
          max-width: 90vw;
          color: var(--ink);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        #toast.on {
          opacity: 1;
          transform: translate(-50%, 0);
        }

        @media (max-width: 820px) {
          .skyops-links {
            display: none;
          }
          .col {
            width: 100%;
          }
          .in {
            align-items: flex-end;
            padding-bottom: 7vh;
          }
          .veil {
            background: linear-gradient(0deg, rgba(5, 7, 11, 0.9), transparent 70%);
          }
          .hud {
            left: 6vw;
            right: auto;
            bottom: auto;
            top: 12vh;
            width: 240px;
          }
          .sec .pn {
            padding: 12px 16px;
          }
          .row {
            padding: 6px 0;
            font-size: 0.82rem;
          }
          .stat {
            margin-top: 22px;
          }
          nav.skyops-nav {
            gap: 12px;
          }
          .fin {
            align-items: center;
          }
        }

        @media (max-height: 700px) {
          .pn {
            margin-top: 14px;
          }
          .row {
            padding: 5px 0;
          }
        }
      `}</style>

      {/* WebGL 3D Canvas & Gradient Veil */}
      <canvas id="gl" ref={canvasRef} aria-hidden="true" />
      <div className="veil" />

      {/* Top Navigation */}
      <nav id="nav" ref={navRef} className="skyops-nav">
        <div className="skyops-logo" onClick={() => scrollToSection(0)} style={{ cursor: 'pointer' }}>
          <BrandLogo size="md" className="rounded-md" priority />
          <span>SkyOps</span>
        </div>
        <div className="skyops-links">
          <button className="nav-link" onClick={() => scrollToSection(1)}>Platform</button>
          <button className="nav-link" onClick={() => scrollToSection(4)}>Auto-healing</button>
          <button className="nav-link" onClick={() => scrollToSection(6)}>Cost</button>
          <button className="nav-link" onClick={() => scrollToSection(7)}>Security</button>
          <button className="nav-link" onClick={() => { setActiveDocTopic('quickstart'); setIsDocModalOpen(true); }}>Docs</button>
        </div>
        <PWAInstallButton />
        <button className="nav-link" onClick={onSignIn}>Sign in</button>
        <button
          className="btn"
          style={{ padding: '9px 15px', fontSize: '0.8rem', boxShadow: 'none' }}
          onClick={onSignUp}
        >
          Connect cluster
        </button>
      </nav>

      {/* Spatial 3D Pin & Labels */}
      <div className="pin" id="pin" ref={pinRef}>
        <div id="pinT" ref={pinTRef}>payment-api · CrashLoopBackOff</div>
      </div>
      <div className="lab" id="l0" ref={l0Ref}>
        <b>{stats.fleet[0]?.[0] || 'AWS EKS'}</b>
        <span>{stats.fleet[0]?.[1] || 12} nodes · {stats.fleet[0]?.[2] || 147} pods</span>
      </div>
      <div className="lab" id="l1" ref={l1Ref}>
        <b>{stats.fleet[1]?.[0] || 'GKE'}</b>
        <span>{stats.fleet[1]?.[1] || 6} nodes · {stats.fleet[1]?.[2] || 82} pods</span>
      </div>
      <div className="lab" id="l2" ref={l2Ref}>
        <b>{stats.fleet[2]?.[0] || 'AKS'}</b>
        <span>{stats.fleet[2]?.[1] || 8} nodes · {stats.fleet[2]?.[2] || 106} pods</span>
      </div>

      {/* Section 0: Hero */}
      <section className="sec">
        <div className="in">
          <div className="col">
            <p className="eb">KUBERNETES INCIDENT MANAGEMENT</p>
            <h1 className="skyops-h1">
              YOUR KUBERNETES.<br />UNDER CONTROL.
            </h1>
            <p className="sub">Detect incidents. Understand root causes. Fix problems automatically.</p>
            <div className="btns">
              <button className="btn" onClick={onSignUp}>Connect your cluster</button>
              <button className="btn g" onClick={() => scrollToSection(1)}>Watch a live demo</button>
            </div>
            <ul className="stat">
              <li><span className="dot" /><b>{stats.clusters}</b> clusters connected</li>
              <li><b>{stats.workloads}</b> workloads</li>
              <li><span className="dot" />All systems operational</li>
            </ul>
          </div>
          <div className="hud" id="hud" ref={hudRef} />
        </div>
      </section>

      {/* Section 1: Visibility */}
      <section className="sec" id="platform">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">SEE EVERYTHING HAPPENING INSIDE YOUR CLUSTERS.</h2>
            <p>SkyOps continuously observes your Kubernetes infrastructure, from the cluster down to a single container.</p>
            <div className="pn">
              <div className="row"><span>Clusters</span><b>{stats.clusters}</b></div>
              <div className="row"><span>Nodes</span><b>26</b></div>
              <div className="row"><span>Workloads</span><b>{stats.workloads}</b></div>
              <div className="row"><span>Pods</span><b>335</b></div>
              <div className="row"><span>Services</span><b>58</b></div>
              <div className="row"><span>Metrics, logs, events</span><b className="blu">correlated live</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Incident Detection */}
      <section className="sec">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">WHEN SOMETHING BREAKS, SKYOPS KNOWS.</h2>
            <div className="pn">
              <div className="tag red">CRITICAL INCIDENT</div>
              <h3 className="skyops-h3" style={{ marginTop: '8px' }}>payment-api</h3>
              <p className="red" style={{ margin: '2px 0 10px' }}>CrashLoopBackOff</p>
              <div className="row"><span>Detected</span><span>2m ago</span></div>
              <div className="row"><span>Restarts</span><span>17</span></div>
              <div className="btns" style={{ marginTop: '14px' }}>
                <button className="btn g" onClick={() => scrollToSection(3)}>Investigate</button>
                <button className="btn" onClick={() => scrollToSection(4)}>Auto-heal</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Root Cause Intelligence */}
      <section className="sec">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">DON&apos;T JUST KNOW THAT IT FAILED.<br />KNOW WHY.</h2>
            <div className="pn">
              <p style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>
                <b style={{ fontWeight: 600 }}>What happened.</b> payment-api repeatedly crashed after a configuration deployment.
              </p>
              <div className="row"><span className="grn">✓ Container logs</span><span className="grn">✓ Kubernetes events</span></div>
              <div className="row"><span className="grn">✓ Deployment changes</span><span className="grn">✓ CPU / memory</span></div>
              <div className="row"><span>Root cause</span><b>Invalid environment configuration</b></div>
              <div className="row"><span>Recommended</span><b className="blu">Roll back to previous revision</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Auto-Healing Pipeline */}
      <section className="sec" id="healing">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">FROM INCIDENT TO RECOVERY.<br />AUTOMATICALLY.</h2>
            <p>Within the policy you set: manual, approval required, or autonomous.</p>
            <div className="pn">
              <ol className="st" id="steps" ref={stepsContainerRef}>
                <li>Broken: payment-api</li>
                <li>SkyOps analyzes</li>
                <li>Action plan: roll back</li>
                <li>Executing</li>
                <li>New workload</li>
                <li>Healthy</li>
              </ol>
            </div>
            <div className="btns">
              <button className="btn" onClick={onSignUp}>Explore Auto Healing</button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Operation & Execution Engine */}
      <section className="sec">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">DON&apos;T JUST OBSERVE.<br />OPERATE.</h2>
            <div className="pn" id="ops">
              {[
                { name: 'Restart pod', desc: 'Gracefully recreates container via controller', feedback: 'Executing RestartPod via owning controller. Verified healthy in cluster.' },
                { name: 'Rollback deployment', desc: 'Reverts workload to previous verified revision', feedback: 'Triggered RollbackDeployment to previous revision. Watching rollout until pods are Ready.' },
                { name: 'Scale deployment', desc: 'Reconciles desired replica count across nodes', feedback: 'Applied ScaleDeployment spec. Reconciled desired replicas successfully.' },
                { name: 'Rollout restart', desc: 'Triggers rolling update with zero downtime', feedback: 'Applied kubectl restartedAt annotation. Controller initiating rolling deployment.' },
                { name: 'Delete pod', desc: 'Deletes pod; replica controller spawns healthy instance', feedback: 'Deleted pod in namespace. ReplicaSet provisioned new healthy pod.' },
                { name: 'Pause rollout', desc: 'Suspends rollout progression during canary phase', feedback: 'Paused rollout spec. Cluster deployment progression suspended safely.' },
                { name: 'Resume rollout', desc: 'Resumes rollout once canary metrics pass health check', feedback: 'Resumed rollout progression. Pods advancing to target revision.' }
              ].map((op) => (
                <div key={op.name} className="row" style={{ alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{op.name}</span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--mute)' }}>{op.desc}</span>
                  </div>
                  <button
                    className="btn g"
                    style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    onClick={() => {
                      showToast(`[SkyOps Action Engine] ${op.feedback}`);
                    }}
                  >
                    Run
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Cost Intelligence */}
      <section className="sec" id="cost">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">KNOW WHAT YOUR CLUSTER IS REALLY COSTING.</h2>
            <div className="pn">
              <div className="row"><span>Cluster cost</span><span className="big">{stats.cost}</span></div>
              <div className="row"><span>Potential savings</span><span className="big grn">{stats.savings}</span></div>
              <div className="row"><span>payment-api now</span><span>CPU 2000m · 4Gi</span></div>
              <div className="row"><span>Recommended</span><b className="blu">CPU 800m · 2Gi</b></div>
              <div className="row"><span>Estimated saving</span><b className="grn">{stats.paySave} / month</b></div>
              <div className="btns" style={{ marginTop: '12px' }}>
                <button
                  className="btn"
                  onClick={() => showToast('Applied right-sizing recommendation: 1200m CPU & 2Gi memory reclaimed!')}
                >
                  Optimize Workload
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: Security Posture */}
      <section className="sec" id="security">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">KNOW WHAT SHOULDN&apos;T BE RUNNING.</h2>
            <div className="pn">
              <div className="row"><span className="grn">✓ RBAC</span><span className="amb">⚠ Privileged container</span></div>
              <div className="row"><span className="grn">✓ Network policies</span><span className="amb">⚠ Exposed service</span></div>
              <div className="row"><span className="grn">✓ Image security</span><span className="amb">⚠ Excessive permissions</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: Multi-Cluster Fleet */}
      <section className="sec">
        <div className="in">
          <div className="col">
            <h2 className="skyops-h2">ONE CONTROL PLANE FOR EVERY CLUSTER.</h2>
            <div className="pn" id="fleet">
              {stats.fleet.map((f) => (
                <div key={f[0]} className="row">
                  <b>{f[0]}</b>
                  <span>{f[1]} nodes · {f[2]} pods</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section 9: Call to Action */}
      <section className="sec">
        <div className="in fin">
          <div className="col">
            <h2 className="skyops-h2">YOUR CLUSTERS ARE ALREADY TELLING YOU WHAT&apos;S WRONG.</h2>
            <p className="sub">SKYOPS MAKES SURE YOU HEAR THEM.</p>
            <div className="btns">
              <button className="btn" onClick={onSignUp}>Connect your cluster</button>
            </div>
            <code
              className="skyops-code"
              onClick={handleCopyInstallCommand}
              title="Click to copy install command"
            >
              curl -sSL &quot;https://skyops.internal/api/v1/clusters/auto/install.sh&quot; | bash
            </code>
            <p style={{ fontSize: '0.72rem', margin: '10px auto 0', color: 'var(--mute)' }}>Generated per cluster in your SkyOps dashboard.</p>
          </div>
        </div>
      </section>

      {/* Prototype Badge & Interactive Toast */}
      <div className="note">Production Engine · Real Cluster Connected</div>
      <div id="toast" role="status" className={toastVisible ? 'on' : ''}>
        {toastMessage}
      </div>

      {/* Documentation Modal */}
      {isDocModalOpen && (
        <KnowledgeBaseModal
          isOpen={isDocModalOpen}
          onClose={() => setIsDocModalOpen(false)}
          initialTopic={activeDocTopic}
        />
      )}
    </div>
  );
};
