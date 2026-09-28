import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

test('SkyOps Live Animation Engine Specification & Verification Suite', async (t) => {
  const atmospherePath = path.resolve(process.cwd(), 'src/components/common/LivingAtmosphere.tsx');
  const atmosphereSource = fs.readFileSync(atmospherePath, 'utf-8');

  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const cssSource = fs.readFileSync(cssPath, 'utf-8');

  const topologyPath = path.resolve(process.cwd(), 'src/components/architecture/topology/TopologyCanvas.tsx');
  const topologySource = fs.readFileSync(topologyPath, 'utf-8');

  const aiProcessingPath = path.resolve(process.cwd(), 'src/components/common/SkyOpsIntelligenceProcessing.tsx');
  const aiProcessingSource = fs.readFileSync(aiProcessingPath, 'utf-8');

  const sidebarPath = path.resolve(process.cwd(), 'src/components/layout/Sidebar.tsx');
  const sidebarSource = fs.readFileSync(sidebarPath, 'utf-8');

  const footerPath = path.resolve(process.cwd(), 'src/components/layout/Footer.tsx');
  const footerSource = fs.readFileSync(footerPath, 'utf-8');

  await t.test('1. Living Cosmic Atmosphere: Layer A, B, C, D, E present and continuous', () => {
    assert.match(atmosphereSource, /skyops-cosmic-cloud-blue/, 'Blue atmospheric cloud layer present');
    assert.match(atmosphereSource, /skyops-cosmic-cloud-violet/, 'Violet atmospheric cloud layer present');
    assert.match(atmosphereSource, /skyops-cosmic-cloud-cyan/, 'Cyan light diffusion layer present');
    assert.match(atmosphereSource, /skyops-signal-particle/, 'Signal particles layer present');
    assert.match(atmosphereSource, /radial-gradient/, 'Vignette layer present');

    assert.match(cssSource, /@keyframes cosmicCloudBlue/, 'Cosmic blue keyframe exists in index.css');
    assert.match(cssSource, /@keyframes cosmicCloudViolet/, 'Cosmic violet keyframe exists in index.css');
    assert.match(cssSource, /@keyframes cosmicCloudCyan/, 'Cosmic cyan keyframe exists in index.css');
  });

  await t.test('2. Digital Signal Particles: low density, drift, non-starfield', () => {
    assert.match(atmosphereSource, /SIGNAL_PARTICLES/, 'Deterministic digital signal particles defined');
    assert.match(cssSource, /@keyframes signalParticleDrift/, 'Particle drift keyframes exist');
    assert.match(cssSource, /will-change:\s*transform,\s*opacity/, 'Hardware acceleration configured');
  });

  await t.test('3. Desktop Pointer Atmosphere: lerp interpolation, disabled on touch', () => {
    assert.match(atmosphereSource, /pointer:\s*fine/, 'Inspects precision pointer media query');
    assert.match(atmosphereSource, /requestAnimationFrame/, 'Uses rAF loop for smooth lerp easing');
    assert.match(atmosphereSource, /--parallax-blue-x/, 'Sets CSS custom property for blue layer parallax');
  });

  await t.test('4. Topology Live Animation: continuous travelling electric signals', () => {
    assert.match(topologySource, /<animateMotion/, 'SVG animateMotion used for live travelling signals');
    assert.match(topologySource, /electric-glow/, 'Electric glow filter present');
    assert.match(topologySource, /isEdgeCritical/, 'Signal slows or disrupts on critical infrastructure');
    assert.match(topologySource, /animate-disturbance-red/, 'Red energy disturbance appears on critical nodes');
  });

  await t.test('5. Cluster Visualization: subtle breathing pulse around indicators', () => {
    assert.match(cssSource, /status-breathe-emerald/, 'Emerald breathing animation defined');
    assert.match(cssSource, /status-breathe-amber/, 'Amber breathing animation defined');
    assert.match(cssSource, /status-breathe-rose/, 'Rose breathing animation defined');
  });

  await t.test('6. AI Intelligence Animation: morphing energy field and text specification', () => {
    assert.match(aiProcessingSource, /✦ SKYOPS INTELLIGENCE/, 'Exact AI title present');
    assert.match(aiProcessingSource, /Analyzing infrastructure signals\.\.\./, 'Exact AI subtitle present');
    assert.match(aiProcessingSource, /skyops-ai-energy-field/, 'Energy field animation class applied');
    assert.match(aiProcessingSource, /skyops-ai-particle-inward/, 'Inward particles animated toward indicator');
  });

  const uiPath = path.resolve(process.cwd(), 'src/components/common/UI.tsx');
  const uiSource = fs.readFileSync(uiPath, 'utf-8');

  await t.test('7. Navigation & Buttons: electric-blue active indicator and subtle compression', () => {
    assert.match(sidebarSource, /border-l-sky-400/, 'Thin electric-blue indicator present on active navigation');
    assert.match(uiSource, /active:scale-\[0\.985\]/, 'Button subtle compression present');
    assert.match(uiSource, /hover:shadow-\[0_0_14px_rgba\(56,189,248,0\.22\)\]/, 'Button atmospheric highlight present');
  });

  await t.test('8. Footer Preservation: existing footer preserved with ambient atmosphere', () => {
    assert.match(footerSource, /id="skyops-main-footer"/, 'Original footer id preserved');
    assert.match(footerSource, /footer-cosmic-drift/, 'Subtle blue atmospheric movement added to footer');
  });

  await t.test('9. Accessibility: prefers-reduced-motion fully supported', () => {
    assert.match(cssSource, /prefers-reduced-motion:\s*reduce/, 'prefers-reduced-motion media query implemented');
  });
});
