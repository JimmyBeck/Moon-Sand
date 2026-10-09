/**
 * 月亮流沙V2：蒙尘之罪 统一引擎控制器
 * 类别: Processing / Three.js 物理生成艺术
 * 作者: 崽崽
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GoldFallSystem } from './physics/GoldFallSystem.js';

// --- 全局场景对象 ---
let container, renderer, scene, camera, controls;
let goldFallSystem;

// --- 预设方案字典 (一键模版推荐) ---
const PRESETS = {
  goldfall: {
    name: '👑 蒙尘之罪',
    emitter: 'sky',
    moonColor: '#ffcb1e',
    streamWidth: 90,
    spawnRate: 2.5,
    sandEnabled: true,
    colorA: '#ffcb1e',
    colorB: '#ffffff',
    ratioA: 0.70,
    particleCount: 4200,
    jewelsEnabled: true,
    coinScale: 1.0,
    coinRatio: 50,
    pearlRatio: 30,
    gemRatio: 20,
    obstacleType: 'glass',
    glassEnabled: true,
    meshVisible: true,
    obsScale: 1.0,
    posX: 0,
    posY: -95,
    pitch: 24,
    yaw: 0,
    rotSpeed: 0.007,
    autoRotate: false,
    cushion: 0.04,
    timeScale: 1.0,
    fallSpeed: 1.0,
    gravity: 0.12,
    dissolveY: -80,
    theme: 'dark'
  },
  moon_classic: {
    name: '🏛️ 月下阶梯拱券',
    emitter: 'moon',
    moonColor: '#ffcb1e',
    streamWidth: 90,
    spawnRate: 2.5,
    sandEnabled: true,
    colorA: '#ffcb1e',
    colorB: '#ffffff',
    ratioA: 0.70,
    particleCount: 4200,
    jewelsEnabled: false,
    coinScale: 1.0,
    coinRatio: 50,
    pearlRatio: 30,
    gemRatio: 20,
    obstacleType: 'classic',
    glassEnabled: true,
    meshVisible: false,
    obsScale: 1.0,
    posX: 0,
    posY: 0,
    pitch: 0,
    yaw: 0,
    rotSpeed: 0.007,
    autoRotate: true,
    cushion: 0.04,
    timeScale: 1.0,
    fallSpeed: 1.0,
    gravity: 0.12,
    dissolveY: -150,
    theme: 'dark'
  },
  moon_hand: {
    name: '🫴 月下捧金',
    emitter: 'moon',
    moonColor: '#ffcb1e',
    streamWidth: 90,
    spawnRate: 2.5,
    sandEnabled: true,
    colorA: '#ffcb1e',
    colorB: '#ffffff',
    ratioA: 0.70,
    particleCount: 4200,
    jewelsEnabled: true,
    coinScale: 1.0,
    coinRatio: 50,
    pearlRatio: 30,
    gemRatio: 20,
    obstacleType: 'hand',
    glassEnabled: true,
    meshVisible: true,
    obsScale: 1.0,
    posX: 0,
    posY: -95,
    pitch: 24,
    yaw: 0,
    rotSpeed: 0.007,
    autoRotate: false,
    cushion: 0.04,
    timeScale: 1.0,
    fallSpeed: 1.0,
    gravity: 0.12,
    dissolveY: -150,
    theme: 'dark'
  },
  sky_reaching: {
    name: '🌸 探云落玉',
    emitter: 'sky',
    moonColor: '#ffcb1e',
    streamWidth: 90,
    spawnRate: 2.5,
    sandEnabled: true,
    colorA: '#ffcb1e',
    colorB: '#ffffff',
    ratioA: 0.70,
    particleCount: 3800,
    jewelsEnabled: true,
    coinScale: 1.0,
    coinRatio: 20,
    pearlRatio: 50,
    gemRatio: 30,
    obstacleType: 'reaching',
    glassEnabled: true,
    meshVisible: true,
    obsScale: 1.0,
    posX: 0,
    posY: -95,
    pitch: 24,
    yaw: 0,
    rotSpeed: 0.007,
    autoRotate: false,
    cushion: 0.04,
    timeScale: 1.0,
    fallSpeed: 1.0,
    gravity: 0.12,
    dissolveY: -150,
    theme: 'dark'
  },
  colonnade: {
    name: '🏛️ 罗马长廊',
    emitter: 'moon',
    moonColor: '#ffcb1e',
    streamWidth: 90,
    spawnRate: 2.5,
    sandEnabled: true,
    colorA: '#ffcb1e',
    colorB: '#ffffff',
    ratioA: 0.70,
    particleCount: 4200,
    jewelsEnabled: false,
    coinScale: 1.0,
    coinRatio: 50,
    pearlRatio: 30,
    gemRatio: 20,
    obstacleType: 'colonnade',
    glassEnabled: true,
    meshVisible: false,
    obsScale: 1.0,
    posX: 0,
    posY: 0,
    pitch: 0,
    yaw: 0,
    rotSpeed: 0.007,
    autoRotate: true,
    cushion: 0.04,
    timeScale: 1.0,
    fallSpeed: 1.0,
    gravity: 0.12,
    dissolveY: -150,
    theme: 'dark'
  },
  hourglass: {
    name: '⏳ 双曲沙漏',
    emitter: 'moon',
    moonColor: '#ffcb1e',
    streamWidth: 90,
    spawnRate: 2.5,
    sandEnabled: true,
    colorA: '#ffcb1e',
    colorB: '#ffffff',
    ratioA: 0.70,
    particleCount: 4200,
    jewelsEnabled: false,
    coinScale: 1.0,
    coinRatio: 50,
    pearlRatio: 30,
    gemRatio: 20,
    obstacleType: 'hourglass',
    glassEnabled: true,
    meshVisible: false,
    obsScale: 1.0,
    posX: 0,
    posY: 0,
    pitch: 0,
    yaw: 0,
    rotSpeed: 0.007,
    autoRotate: true,
    cushion: 0.04,
    timeScale: 1.0,
    fallSpeed: 1.0,
    gravity: 0.12,
    dissolveY: -150,
    theme: 'dark'
  },
  wineglass: {
    name: '🍷 独酌孤杯',
    emitter: 'moon',
    moonColor: '#ffcb1e',
    streamWidth: 90,
    spawnRate: 2.5,
    sandEnabled: true,
    colorA: '#ffcb1e',
    colorB: '#ffffff',
    ratioA: 0.70,
    particleCount: 4200,
    jewelsEnabled: false,
    coinScale: 1.0,
    coinRatio: 50,
    pearlRatio: 30,
    gemRatio: 20,
    obstacleType: 'wineglass',
    glassEnabled: true,
    meshVisible: false,
    obsScale: 1.0,
    posX: 0,
    posY: 0,
    pitch: 0,
    yaw: 0,
    rotSpeed: 0.007,
    autoRotate: true,
    cushion: 0.04,
    timeScale: 1.0,
    fallSpeed: 1.0,
    gravity: 0.12,
    dissolveY: -150,
    theme: 'dark'
  }
};

let currentPresetKey = 'goldfall';

function init() {
  container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
  camera.position.set(0, -15, 620);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, -45, 0);
  controls.maxDistance = 1500;
  controls.minDistance = 180;

  // 核心统一物理系统
  goldFallSystem = new GoldFallSystem(scene);
  window.goldFallSystem = goldFallSystem;

  // 读取 URL 参数
  const urlParams = new URLSearchParams(window.location.search);
  const initialPreset = urlParams.get('preset') || 'goldfall';

  // 绑定界面与预设
  setupUI();
  setupDragAndDrop();

  // 应用初始预设
  applyPreset(PRESETS[initialPreset] ? initialPreset : 'goldfall');

  if (urlParams.get('theme') === 'light') {
    setTheme('light');
  }
  if (urlParams.get('panel') === 'open') {
    const p = document.getElementById('control-panel');
    if (p) p.classList.remove('collapsed');
  }

  // 窗口与画布自适应
  const resizeObserver = new ResizeObserver(() => onWindowResize());
  resizeObserver.observe(container);
  window.addEventListener('resize', onWindowResize);

  animate();
}

function onWindowResize() {
  if (!container) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (goldFallSystem) {
    goldFallSystem.update(dt);
  }

  controls.update();
  renderer.render(scene, camera);
}

// --- 预设方案一键应用与 UI 状态同步 ---
function applyPreset(presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return;
  currentPresetKey = presetKey;

  // 1. 同步引擎状态
  goldFallSystem.setEmitterType(p.emitter);
  goldFallSystem.setMoonColor(p.moonColor);
  goldFallSystem.setStreamWidth(p.streamWidth);
  goldFallSystem.spawnRate = p.spawnRate;

  goldFallSystem.setSandEnabled(p.sandEnabled);
  goldFallSystem.setDualColors(p.colorA, p.colorB, p.ratioA);
  goldFallSystem.setParticleCount(p.particleCount);

  goldFallSystem.setJewelsEnabled(p.jewelsEnabled);
  goldFallSystem.setCoinScale(p.coinScale);
  goldFallSystem.setRatios(p.coinRatio, p.pearlRatio, p.gemRatio);

  goldFallSystem.setObstacleType(p.obstacleType);
  goldFallSystem.setGlassEnabled(p.glassEnabled);
  goldFallSystem.setObstacleMeshVisible(p.meshVisible);
  goldFallSystem.setObstacleScale(p.obsScale);
  goldFallSystem.setGlassPosX(p.posX);
  goldFallSystem.setGlassPosY(p.posY);
  goldFallSystem.setGlassPitch(p.pitch);
  goldFallSystem.setGlassYaw(p.yaw);
  goldFallSystem.setGlassCushion(p.cushion);
  goldFallSystem.setAutoRotate(p.autoRotate, p.rotSpeed);

  goldFallSystem.setTimeScale(p.timeScale);
  goldFallSystem.setFallSpeedFactor(p.fallSpeed);
  goldFallSystem.setGravity(p.gravity);
  goldFallSystem.dissolveY = p.dissolveY;
  setTheme(p.theme);

  // 2. 同步全部 DOM 界面控件
  syncUI(p, presetKey);
}

function syncUI(p, presetKey) {
  // 卡片 1: 预设选择框
  const presetSelect = document.getElementById('preset-select');
  if (presetSelect) presetSelect.value = presetKey;

  // 卡片 2: 发射源
  const btnMoon = document.getElementById('btn-emitter-moon');
  const btnSky = document.getElementById('btn-emitter-sky');
  const moonColorWrap = document.getElementById('moon-color-wrap');
  const moonColorPicker = document.getElementById('moon-color-picker');
  const streamWidthSlider = document.getElementById('stream-width-slider');
  const streamWidthVal = document.getElementById('stream-width-val');
  const spawnRateSlider = document.getElementById('spawn-rate-slider');
  const spawnRateVal = document.getElementById('spawn-rate-val');

  if (btnMoon) btnMoon.classList.toggle('active', p.emitter === 'moon');
  if (btnSky) btnSky.classList.toggle('active', p.emitter === 'sky');
  if (moonColorWrap) moonColorWrap.style.display = (p.emitter === 'moon') ? 'flex' : 'none';
  if (moonColorPicker) moonColorPicker.value = p.moonColor;
  if (streamWidthSlider) streamWidthSlider.value = p.streamWidth;
  if (streamWidthVal) streamWidthVal.innerText = `${p.streamWidth} px`;
  if (spawnRateSlider) spawnRateSlider.value = p.spawnRate;
  if (spawnRateVal) spawnRateVal.innerText = `${p.spawnRate.toFixed(1)} /s`;

  // 卡片 3: 掉落物料
  const sandBtn = document.getElementById('sand-toggle-btn');
  const colorPickerA = document.getElementById('color-picker-a');
  const colorPickerB = document.getElementById('color-picker-b');
  const ratioSlider = document.getElementById('ratio-slider');
  const ratioVal = document.getElementById('ratio-val');
  const countSlider = document.getElementById('count-slider');
  const countVal = document.getElementById('count-val');

  if (sandBtn) {
    sandBtn.classList.toggle('active', p.sandEnabled);
    sandBtn.innerText = p.sandEnabled ? '已启用' : '已关闭';
  }
  if (colorPickerA) colorPickerA.value = p.colorA;
  if (colorPickerB) colorPickerB.value = p.colorB;
  if (ratioSlider) ratioSlider.value = p.ratioA;
  if (ratioVal) ratioVal.innerText = `${Math.round(p.ratioA * 100)}% : ${Math.round((1 - p.ratioA) * 100)}%`;
  if (countSlider) countSlider.value = p.particleCount;
  if (countVal) countVal.innerText = p.particleCount;

  const jewelsBtn = document.getElementById('jewels-toggle-btn');
  const coinScaleSlider = document.getElementById('gold-coin-scale-slider');
  const coinScaleVal = document.getElementById('gold-coin-scale-val');
  const ratioCoin = document.getElementById('gold-ratio-coin');
  const ratioPearl = document.getElementById('gold-ratio-pearl');
  const ratioGem = document.getElementById('gold-ratio-gem');
  const ratioCoinVal = document.getElementById('ratio-coin-val');
  const ratioPearlVal = document.getElementById('ratio-pearl-val');
  const ratioGemVal = document.getElementById('ratio-gem-val');
  const ratioSummary = document.getElementById('gold-ratio-summary');

  if (jewelsBtn) {
    jewelsBtn.classList.toggle('active', p.jewelsEnabled);
    jewelsBtn.innerText = p.jewelsEnabled ? '已启用' : '已关闭';
  }
  if (coinScaleSlider) coinScaleSlider.value = Math.round(p.coinScale * 100);
  if (coinScaleVal) coinScaleVal.innerText = `${Math.round(p.coinScale * 100)}%`;
  if (ratioCoin) ratioCoin.value = p.coinRatio;
  if (ratioPearl) ratioPearl.value = p.pearlRatio;
  if (ratioGem) ratioGem.value = p.gemRatio;

  const total = p.coinRatio + p.pearlRatio + p.gemRatio;
  const pctC = total > 0 ? Math.round((p.coinRatio / total) * 100) : 0;
  const pctP = total > 0 ? Math.round((p.pearlRatio / total) * 100) : 0;
  const pctG = 100 - pctC - pctP;
  if (ratioCoinVal) ratioCoinVal.innerText = `${pctC}%`;
  if (ratioPearlVal) ratioPearlVal.innerText = `${pctP}%`;
  if (ratioGemVal) ratioGemVal.innerText = `${pctG}%`;
  if (ratioSummary) ratioSummary.innerText = `${pctC}% : ${pctP}% : ${pctG}%`;

  // 卡片 4: 承接物与空间姿态
  const obsSelect = document.getElementById('obstacle-type-select');
  const glassBtn = document.getElementById('glass-toggle-btn');
  const obsMeshBtn = document.getElementById('obs-mesh-toggle-btn');
  const obsScaleSlider = document.getElementById('obs-scale-slider');
  const obsScaleVal = document.getElementById('obs-scale-val');
  const posXSlider = document.getElementById('pos-x-slider');
  const posXVal = document.getElementById('pos-x-val');
  const posYSlider = document.getElementById('pos-y-slider');
  const posYVal = document.getElementById('pos-y-val');
  const tiltPitchSlider = document.getElementById('tilt-pitch-slider');
  const tiltPitchVal = document.getElementById('tilt-pitch-val');
  const facingYawSlider = document.getElementById('facing-yaw-slider');
  const facingYawVal = document.getElementById('facing-yaw-val');
  const speedSlider = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  const cushionSlider = document.getElementById('glass-cushion-slider');
  const cushionVal = document.getElementById('glass-cushion-val');
  const toggleRotateBtn = document.getElementById('toggle-rotate');

  if (obsSelect) obsSelect.value = p.obstacleType;
  if (glassBtn) {
    glassBtn.classList.toggle('active', p.glassEnabled);
    glassBtn.innerText = p.glassEnabled ? '碰撞: 已启用' : '碰撞: 已关闭';
  }
  if (obsMeshBtn) {
    obsMeshBtn.classList.toggle('active', p.meshVisible);
    obsMeshBtn.innerText = p.meshVisible ? '实体轮廓: 显示' : '实体轮廓: 隐形';
  }
  if (obsScaleSlider) obsScaleSlider.value = Math.round(p.obsScale * 100);
  if (obsScaleVal) obsScaleVal.innerText = `${Math.round(p.obsScale * 100)}%`;
  if (posXSlider) posXSlider.value = p.posX;
  if (posXVal) posXVal.innerText = p.posX;
  if (posYSlider) posYSlider.value = p.posY;
  if (posYVal) posYVal.innerText = p.posY;
  if (tiltPitchSlider) tiltPitchSlider.value = p.pitch;
  if (tiltPitchVal) tiltPitchVal.innerText = `${p.pitch}°`;
  if (facingYawSlider) facingYawSlider.value = p.yaw;
  if (facingYawVal) facingYawVal.innerText = `${p.yaw}°`;
  if (speedSlider) speedSlider.value = p.rotSpeed;
  if (speedVal) speedVal.innerText = p.rotSpeed.toFixed(3);
  if (cushionSlider) cushionSlider.value = p.cushion;
  if (cushionVal) cushionVal.innerText = p.cushion.toFixed(2);
  if (toggleRotateBtn) {
    toggleRotateBtn.classList.toggle('active', p.autoRotate);
    toggleRotateBtn.innerText = p.autoRotate ? '自转: 运行中' : '自转: 已暂停';
  }

  // 卡片 5: 动力学
  const timeScaleSlider = document.getElementById('timescale-slider');
  const timeScaleVal = document.getElementById('timescale-val');
  const fallSpeedSlider = document.getElementById('fallspeed-slider');
  const fallSpeedVal = document.getElementById('fallspeed-val');
  const gravitySlider = document.getElementById('gravity-slider');
  const gravityVal = document.getElementById('gravity-val');
  const dissolveSlider = document.getElementById('dissolve-slider');
  const dissolveVal = document.getElementById('dissolve-val');

  if (timeScaleSlider) timeScaleSlider.value = p.timeScale;
  if (timeScaleVal) timeScaleVal.innerText = `${p.timeScale.toFixed(2)}x`;
  if (fallSpeedSlider) fallSpeedSlider.value = p.fallSpeed;
  if (fallSpeedVal) fallSpeedVal.innerText = `${p.fallSpeed.toFixed(1)}x`;
  if (gravitySlider) gravitySlider.value = p.gravity;
  if (gravityVal) gravityVal.innerText = p.gravity.toFixed(2);
  if (dissolveSlider) dissolveSlider.value = p.dissolveY;
  if (dissolveVal) dissolveVal.innerText = p.dissolveY;
}

function setTheme(theme) {
  const isLight = (theme === 'light');
  if (scene) scene.background.set(isLight ? 0xffffff : 0x000000);
  document.body.classList.toggle('theme-light', isLight);
  if (goldFallSystem) goldFallSystem.setTheme(theme);

  const btnDark = document.getElementById('theme-dark');
  const btnLight = document.getElementById('theme-light');
  if (btnDark) btnDark.classList.toggle('active', !isLight);
  if (btnLight) btnLight.classList.toggle('active', isLight);
}

// --- 事件监听系统 ---
function setupUI() {
  // 折叠开关
  const panel = document.getElementById('control-panel');
  const togglePanelBtn = document.getElementById('toggle-panel');
  if (togglePanelBtn && panel) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('panel') === 'open' || (window.innerWidth >= 1100 && urlParams.get('panel') !== 'closed')) {
      panel.classList.remove('collapsed');
    } else if (urlParams.get('panel') === 'closed') {
      panel.classList.add('collapsed');
    }

    togglePanelBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  }

  // 时停/暂停
  const btnTimePause = document.getElementById('btn-time-pause');
  const topBtnPause = document.getElementById('top-btn-pause');

  function updatePauseUI(isPaused) {
    const text = isPaused ? '▶ 继续下落 (Space)' : '⏸ 暂停 / 时间停止 (Space)';
    const topText = isPaused ? '▶ 继续 (Space)' : '⏸ 暂停 (Space)';
    if (btnTimePause) {
      btnTimePause.innerText = text;
      btnTimePause.style.background = isPaused ? 'rgba(255, 75, 75, 0.22)' : 'rgba(255, 203, 30, 0.18)';
      btnTimePause.style.color = isPaused ? '#ff6b6b' : 'var(--accent-gold)';
      btnTimePause.style.borderColor = isPaused ? '#ff6b6b' : 'var(--accent-gold)';
    }
    if (topBtnPause) {
      topBtnPause.innerText = topText;
      topBtnPause.style.color = isPaused ? '#ff6b6b' : 'var(--accent-gold)';
      topBtnPause.style.borderColor = isPaused ? '#ff6b6b' : 'var(--accent-gold)';
    }
  }

  function toggleGlobalPause() {
    if (goldFallSystem) {
      const isPaused = goldFallSystem.togglePause();
      updatePauseUI(isPaused);
    }
  }

  if (btnTimePause) btnTimePause.addEventListener('click', toggleGlobalPause);
  if (topBtnPause) topBtnPause.addEventListener('click', toggleGlobalPause);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      toggleGlobalPause();
    }
  });

  // 卡片 1: 预设下拉
  const presetSelect = document.getElementById('preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      applyPreset(e.target.value);
    });
  }

  // 卡片 2: 发射源
  const btnMoon = document.getElementById('btn-emitter-moon');
  const btnSky = document.getElementById('btn-emitter-sky');
  const moonColorWrap = document.getElementById('moon-color-wrap');
  const moonColorPicker = document.getElementById('moon-color-picker');

  if (btnMoon && btnSky) {
    btnMoon.addEventListener('click', () => {
      btnMoon.classList.add('active');
      btnSky.classList.remove('active');
      if (moonColorWrap) moonColorWrap.style.display = 'flex';
      goldFallSystem.setEmitterType('moon');
    });
    btnSky.addEventListener('click', () => {
      btnSky.classList.add('active');
      btnMoon.classList.remove('active');
      if (moonColorWrap) moonColorWrap.style.display = 'none';
      goldFallSystem.setEmitterType('sky');
    });
  }

  if (moonColorPicker) {
    moonColorPicker.addEventListener('input', (e) => {
      goldFallSystem.setMoonColor(e.target.value);
    });
  }

  const streamWidthSlider = document.getElementById('stream-width-slider');
  const streamWidthVal = document.getElementById('stream-width-val');
  if (streamWidthSlider) {
    streamWidthSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setStreamWidth(v);
      if (streamWidthVal) streamWidthVal.innerText = `${v} px`;
    });
  }

  const spawnRateSlider = document.getElementById('spawn-rate-slider');
  const spawnRateVal = document.getElementById('spawn-rate-val');
  if (spawnRateSlider) {
    spawnRateSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.spawnRate = v;
      if (spawnRateVal) spawnRateVal.innerText = `${v.toFixed(1)} /s`;
    });
  }

  // 卡片 3: 掉落物料
  const sandBtn = document.getElementById('sand-toggle-btn');
  if (sandBtn) {
    sandBtn.addEventListener('click', () => {
      const next = !goldFallSystem.sandEnabled;
      goldFallSystem.setSandEnabled(next);
      sandBtn.classList.toggle('active', next);
      sandBtn.innerText = next ? '已启用' : '已关闭';
    });
  }

  const colorPickerA = document.getElementById('color-picker-a');
  const colorPickerB = document.getElementById('color-picker-b');
  const ratioSlider = document.getElementById('ratio-slider');
  const ratioVal = document.getElementById('ratio-val');

  function updateSandColors() {
    const colA = colorPickerA ? colorPickerA.value : '#ffcb1e';
    const colB = colorPickerB ? colorPickerB.value : '#ffffff';
    const rA = ratioSlider ? parseFloat(ratioSlider.value) : 0.7;
    goldFallSystem.setDualColors(colA, colB, rA);
    if (ratioVal) ratioVal.innerText = `${Math.round(rA * 100)}% : ${Math.round((1 - rA) * 100)}%`;
  }
  if (colorPickerA) colorPickerA.addEventListener('input', updateSandColors);
  if (colorPickerB) colorPickerB.addEventListener('input', updateSandColors);
  if (ratioSlider) ratioSlider.addEventListener('input', updateSandColors);

  const countSlider = document.getElementById('count-slider');
  const countVal = document.getElementById('count-val');
  if (countSlider) {
    countSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      goldFallSystem.setParticleCount(v);
      if (countVal) countVal.innerText = v;
    });
  }

  const jewelsBtn = document.getElementById('jewels-toggle-btn');
  if (jewelsBtn) {
    jewelsBtn.addEventListener('click', () => {
      const next = !goldFallSystem.jewelsEnabled;
      goldFallSystem.setJewelsEnabled(next);
      jewelsBtn.classList.toggle('active', next);
      jewelsBtn.innerText = next ? '已启用' : '已关闭';
    });
  }

  const coinScaleSlider = document.getElementById('gold-coin-scale-slider');
  const coinScaleVal = document.getElementById('gold-coin-scale-val');
  if (coinScaleSlider) {
    coinScaleSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setCoinScale(v / 100);
      if (coinScaleVal) coinScaleVal.innerText = `${v}%`;
    });
  }

  const ratioCoin = document.getElementById('gold-ratio-coin');
  const ratioPearl = document.getElementById('gold-ratio-pearl');
  const ratioGem = document.getElementById('gold-ratio-gem');
  const ratioCoinVal = document.getElementById('ratio-coin-val');
  const ratioPearlVal = document.getElementById('ratio-pearl-val');
  const ratioGemVal = document.getElementById('ratio-gem-val');
  const ratioSummary = document.getElementById('gold-ratio-summary');

  function updateJewelRatios() {
    const c = parseFloat(ratioCoin?.value || 50);
    const p = parseFloat(ratioPearl?.value || 30);
    const g = parseFloat(ratioGem?.value || 20);
    const total = c + p + g;
    let pctC = 0, pctP = 0, pctG = 0;
    if (total > 0) {
      pctC = Math.round((c / total) * 100);
      pctP = Math.round((p / total) * 100);
      pctG = 100 - pctC - pctP;
    }
    if (ratioCoinVal) ratioCoinVal.innerText = `${pctC}%`;
    if (ratioPearlVal) ratioPearlVal.innerText = `${pctP}%`;
    if (ratioGemVal) ratioGemVal.innerText = `${pctG}%`;
    if (ratioSummary) ratioSummary.innerText = `${pctC}% : ${pctP}% : ${pctG}%`;
    goldFallSystem.setRatios(c, p, g);
  }
  if (ratioCoin) ratioCoin.addEventListener('input', updateJewelRatios);
  if (ratioPearl) ratioPearl.addEventListener('input', updateJewelRatios);
  if (ratioGem) ratioGem.addEventListener('input', updateJewelRatios);

  // 卡片 4: 承接物与空间姿态
  const obsSelect = document.getElementById('obstacle-type-select');
  if (obsSelect) {
    obsSelect.addEventListener('change', (e) => {
      goldFallSystem.setObstacleType(e.target.value);
    });
  }

  const glassBtn = document.getElementById('glass-toggle-btn');
  if (glassBtn) {
    glassBtn.addEventListener('click', () => {
      const next = !goldFallSystem.glassEnabled;
      goldFallSystem.setGlassEnabled(next);
      glassBtn.classList.toggle('active', next);
      glassBtn.innerText = next ? '碰撞: 已启用' : '碰撞: 已关闭';
    });
  }

  const obsMeshBtn = document.getElementById('obs-mesh-toggle-btn');
  if (obsMeshBtn) {
    obsMeshBtn.addEventListener('click', () => {
      const next = !goldFallSystem.obstacleMeshVisible;
      goldFallSystem.setObstacleMeshVisible(next);
      obsMeshBtn.classList.toggle('active', next);
      obsMeshBtn.innerText = next ? '实体轮廓: 显示' : '实体轮廓: 隐形';
    });
  }

  const obsScaleSlider = document.getElementById('obs-scale-slider');
  const obsScaleVal = document.getElementById('obs-scale-val');
  if (obsScaleSlider) {
    obsScaleSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setObstacleScale(v / 100);
      if (obsScaleVal) obsScaleVal.innerText = `${v}%`;
    });
  }

  const posXSlider = document.getElementById('pos-x-slider');
  const posXVal = document.getElementById('pos-x-val');
  if (posXSlider) {
    posXSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setGlassPosX(v);
      if (posXVal) posXVal.innerText = v;
    });
  }

  const posYSlider = document.getElementById('pos-y-slider');
  const posYVal = document.getElementById('pos-y-val');
  if (posYSlider) {
    posYSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setGlassPosY(v);
      if (posYVal) posYVal.innerText = v;
    });
  }

  const tiltPitchSlider = document.getElementById('tilt-pitch-slider');
  const tiltPitchVal = document.getElementById('tilt-pitch-val');
  if (tiltPitchSlider) {
    tiltPitchSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setGlassPitch(v);
      if (tiltPitchVal) tiltPitchVal.innerText = `${v}°`;
    });
  }

  const facingYawSlider = document.getElementById('facing-yaw-slider');
  const facingYawVal = document.getElementById('facing-yaw-val');
  if (facingYawSlider) {
    facingYawSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setGlassYaw(v);
      if (facingYawVal) facingYawVal.innerText = `${v}°`;
    });
  }

  const speedSlider = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.rotSpeed = v;
      if (speedVal) speedVal.innerText = v.toFixed(3);
    });
  }

  const cushionSlider = document.getElementById('glass-cushion-slider');
  const cushionVal = document.getElementById('glass-cushion-val');
  if (cushionSlider) {
    cushionSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setGlassCushion(v);
      if (cushionVal) cushionVal.innerText = v.toFixed(2);
    });
  }

  const toggleRotateBtn = document.getElementById('toggle-rotate');
  if (toggleRotateBtn) {
    toggleRotateBtn.addEventListener('click', () => {
      const next = !goldFallSystem.autoRotate;
      goldFallSystem.setAutoRotate(next);
      toggleRotateBtn.classList.toggle('active', next);
      toggleRotateBtn.innerText = next ? '自转: 运行中' : '自转: 已暂停';
    });
  }

  const resetTransformBtn = document.getElementById('reset-transform');
  if (resetTransformBtn) {
    resetTransformBtn.addEventListener('click', () => {
      goldFallSystem.resetObstaclePose();
      if (obsScaleSlider) { obsScaleSlider.value = 100; if (obsScaleVal) obsScaleVal.innerText = '100%'; }
      if (posXSlider) { posXSlider.value = 0; if (posXVal) posXVal.innerText = 0; }
      if (posYSlider) { posYSlider.value = -95; if (posYVal) posYVal.innerText = -95; }
      if (tiltPitchSlider) { tiltPitchSlider.value = 24; if (tiltPitchVal) tiltPitchVal.innerText = '24°'; }
      if (facingYawSlider) { facingYawSlider.value = 0; if (facingYawVal) facingYawVal.innerText = '0°'; }
    });
  }

  // 卡片 5: 动力学与终点
  const timeScaleSlider = document.getElementById('timescale-slider');
  const timeScaleVal = document.getElementById('timescale-val');
  if (timeScaleSlider) {
    timeScaleSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setTimeScale(v);
      if (timeScaleVal) timeScaleVal.innerText = `${v.toFixed(2)}x`;
    });
  }

  const fallSpeedSlider = document.getElementById('fallspeed-slider');
  const fallSpeedVal = document.getElementById('fallspeed-val');
  if (fallSpeedSlider) {
    fallSpeedSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setFallSpeedFactor(v);
      if (fallSpeedVal) fallSpeedVal.innerText = `${v.toFixed(1)}x`;
    });
  }

  const gravitySlider = document.getElementById('gravity-slider');
  const gravityVal = document.getElementById('gravity-val');
  if (gravitySlider) {
    gravitySlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.setGravity(v);
      if (gravityVal) gravityVal.innerText = v.toFixed(2);
    });
  }

  const dissolveSlider = document.getElementById('dissolve-slider');
  const dissolveVal = document.getElementById('dissolve-val');
  if (dissolveSlider) {
    dissolveSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      goldFallSystem.dissolveY = v;
      if (dissolveVal) dissolveVal.innerText = v;
    });
  }

  const btnDark = document.getElementById('theme-dark');
  const btnLight = document.getElementById('theme-light');
  if (btnDark) btnDark.addEventListener('click', () => setTheme('dark'));
  if (btnLight) btnLight.addEventListener('click', () => setTheme('light'));

  const resetCamBtn = document.getElementById('reset-camera');
  if (resetCamBtn) {
    resetCamBtn.addEventListener('click', () => {
      camera.position.set(0, -15, 620);
      controls.target.set(0, -45, 0);
      controls.update();
    });
  }
}

// --- 外部 3D 模型 (.obj) 拖拽导入 ---
function setupDragAndDrop() {
  const dropZone = container;
  const loader = new OBJLoader();

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.toLowerCase().endsWith('.obj')) {
      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const contents = event.target.result;
          const obj = loader.parse(contents);

          const box = new THREE.Box3().setFromObject(obj);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 260.0 / (maxDim || 1);
          obj.scale.set(scale, scale, scale);

          const center = new THREE.Vector3();
          box.getCenter(center);
          obj.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

          const mat = new THREE.MeshStandardMaterial({
            color: 0xddc075,
            roughness: 0.35,
            metalness: 0.65
          });

          obj.traverse((child) => {
            if (child.isMesh) {
              child.material = mat;
              child.geometry.computeVertexNormals();
            }
          });

          goldFallSystem.setCustomMesh(obj);
          goldFallSystem.setObstacleType('custom');

          const obsSelect = document.getElementById('obstacle-type-select');
          if (obsSelect) {
            const customOpt = obsSelect.querySelector('option[value="custom"]');
            if (customOpt) customOpt.disabled = false;
            obsSelect.value = 'custom';
          }
          const presetSelect = document.getElementById('preset-select');
          if (presetSelect) {
            const customPresetOpt = presetSelect.querySelector('option[value="custom"]');
            if (customPresetOpt) customPresetOpt.disabled = false;
            presetSelect.value = 'custom';
          }
        } catch (err) {
          console.error('加载 OBJ 模型失败:', err);
        }
      };
      reader.readAsText(files[0]);
    }
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
