/**
 * 月亮流沙 (Moon Sand)
 * 类别: Processing 作品
 * 作者: 崽崽
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ArchArchitecture } from './geometry/ArchArchitecture.js';
import { ParticleSystem } from './physics/ParticleSystem.js';
import { GoldFallSystem } from './physics/GoldFallSystem.js';

// --- 全局状态 ---
const state = {
  moonColor: '#ffcb1e',
  bgTheme: 'dark',        // 'dark' | 'light'
  colorA: '#ffcb1e',       // 粒子主色（金色）
  colorB: '#ffffff',       // 粒子副色（纯白）
  ratioA: 0.70,           // 主色比例 70%
  preset: 'goldfall',     // 'goldfall' | 'classic' | 'wineglass' | 'hourglass' | 'colonnade' | 'custom'

  // 形状空间位置与姿态（相对月亮）
  offset: { x: 0, y: 0, z: 0 },
  tilt: { pitch: 0, yaw: 0, roll: 0 },
  scale: 1.0,

  rotSpeed: 0.007,
  autoRotate: true,
  gravity: 0.12,
  maxFallSpeed: 4.5,
  particleCount: 4200,
  sparkleIntensity: 0.85,
  showGeometry: false
};

let container, renderer, scene, camera, controls;
let moonMesh, moonHalo;
let obstacleGroup;
let currentConfig = ArchArchitecture.getClassicArchesConfig();
let customMesh = null;
let particleSystem;
let goldFallSystem;
let rotY = 0;
const raycaster = new THREE.Raycaster();

function init() {
  container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
  camera.position.set(0, -15, 620); // 推进视距至中近景，让金币与宝石细节清晰直观

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

  const ambLight = new THREE.AmbientLight(0x444444);
  scene.add(ambLight);
  const dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
  dirLight.position.set(120, 300, 200);
  scene.add(dirLight);

  // 支持 URL 参数快速配置预设 (e.g. ?theme=light&preset=wineglass&panel=open)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('theme') === 'light') {
    state.bgTheme = 'light';
    scene.background.set(0xffffff);
    document.body.classList.add('theme-light');
  }
  if (urlParams.get('preset')) {
    state.preset = urlParams.get('preset');
  }
  if (urlParams.get('moon')) {
    state.moonColor = '#' + urlParams.get('moon').replace('#', '');
  }
  if (urlParams.get('colorA')) {
    state.colorA = '#' + urlParams.get('colorA').replace('#', '');
  }
  if (urlParams.get('colorB')) {
    state.colorB = '#' + urlParams.get('colorB').replace('#', '');
  }
  if (urlParams.get('showMesh') === 'true') {
    state.showGeometry = true;
  }
  if (urlParams.get('rotate') === 'false') {
    state.autoRotate = false;
  }
  if (urlParams.get('scale')) {
    const s = parseFloat(urlParams.get('scale'));
    if (!isNaN(s) && s >= 0.5 && s <= 1.5) {
      state.scale = s;
    }
  }

  // 1. 顶端月轮与月晕
  const moonGeo = new THREE.CircleGeometry(42, 64);
  const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(state.moonColor) });
  moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.position.set(0, 200, 0);
  scene.add(moonMesh);

  const haloGeo = new THREE.CircleGeometry(48, 64);
  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(state.moonColor),
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending
  });
  moonHalo = new THREE.Mesh(haloGeo, haloMat);
  moonHalo.position.set(0, 200, -1);
  scene.add(moonHalo);

  // 2. 粒子系统与金沙下落系统
  particleSystem = new ParticleSystem(6500);
  particleSystem.activeCount = state.particleCount;
  particleSystem.setDualColors(state.colorA, state.colorB, state.ratioA);
  if (state.bgTheme === 'light') particleSystem.setTheme('light');
  scene.add(particleSystem.group);

  // 3. 蒙尘之罪·金币珍珠宝石流沙系统
  goldFallSystem = new GoldFallSystem(scene);

  // 4. 障碍物容器
  obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);
  rebuildObstacle();

  // 监听画布尺寸变化（面板打开/收起、窗口缩放时无缝适配）
  const resizeObserver = new ResizeObserver(() => {
    onWindowResize();
  });
  resizeObserver.observe(container);

  window.addEventListener('resize', onWindowResize);
  setupUI();
  setupDragAndDrop();

  if (urlParams.get('panel') === 'open') {
    const p = document.getElementById('control-panel');
    if (p) p.classList.remove('collapsed');
  }

  animate();
}

function updateMoonColor(hex) {
  state.moonColor = hex;
  const col = new THREE.Color(hex);
  if (moonMesh) moonMesh.material.color.copy(col);
  if (moonHalo) moonHalo.material.color.copy(col);
}

function setBgTheme(theme) {
  state.bgTheme = theme;
  const isLight = theme === 'light';
  scene.background.set(isLight ? 0xffffff : 0x000000);
  particleSystem.setTheme(theme);
  document.body.classList.toggle('theme-light', isLight);
  rebuildObstacle();
}

function rebuildObstacle() {
  while (obstacleGroup.children.length > 0) {
    const child = obstacleGroup.children[0];
    obstacleGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }

  customMesh = null;
  const isLight = state.bgTheme === 'light';

  const isGoldFall = state.preset === 'goldfall';

  // 面板各功能区块显隐联动（蒙尘之罪专属面板聚焦）
  const secGoldFall = document.getElementById('goldfall-section');
  const wrapMoonColor = document.getElementById('moon-color-wrap');
  const secClassicParticle = document.getElementById('classic-particle-section');
  const wrapClassicTransform = document.getElementById('classic-transform-wrap');
  const wrapClassicDynamics = document.getElementById('classic-dynamics-wrap');

  if (secGoldFall) secGoldFall.style.display = isGoldFall ? 'block' : 'none';
  if (wrapMoonColor) wrapMoonColor.style.display = isGoldFall ? 'none' : 'block';
  if (secClassicParticle) secClassicParticle.style.display = isGoldFall ? 'none' : 'block';
  if (wrapClassicTransform) wrapClassicTransform.style.display = isGoldFall ? 'none' : 'block';
  if (wrapClassicDynamics) wrapClassicDynamics.style.display = isGoldFall ? 'none' : 'block';

  if (isGoldFall) {
    if (goldFallSystem) {
      goldFallSystem.enabled = true;
      goldFallSystem.group.visible = true;
    }
    if (moonMesh) moonMesh.visible = false;
    if (moonHalo) moonHalo.visible = false;
    if (particleSystem) particleSystem.group.visible = false;
    if (controls) {
      controls.target.set(0, -60, 0);
    }
    return;
  } else {
    if (goldFallSystem) {
      goldFallSystem.enabled = false;
      goldFallSystem.group.visible = false;
    }
    if (moonMesh) moonMesh.visible = true;
    if (moonHalo) moonHalo.visible = true;
    if (particleSystem) particleSystem.group.visible = true;
  }

  if (state.preset === 'classic') {
    currentConfig = ArchArchitecture.getClassicArchesConfig();
    const mesh = ArchArchitecture.buildMeshGroup(currentConfig, state.showGeometry, isLight);
    obstacleGroup.add(mesh);
  } else if (state.preset === 'wineglass') {
    currentConfig = ArchArchitecture.getWineGlassConfig();
    const mesh = ArchArchitecture.buildMeshGroup(currentConfig, state.showGeometry, isLight);
    obstacleGroup.add(mesh);
  } else if (state.preset === 'hourglass') {
    currentConfig = ArchArchitecture.getHourglassConfig();
    const mesh = ArchArchitecture.buildMeshGroup(currentConfig, state.showGeometry, isLight);
    obstacleGroup.add(mesh);
  } else if (state.preset === 'colonnade') {
    currentConfig = ArchArchitecture.getColonnadeConfig();
    const mesh = ArchArchitecture.buildMeshGroup(currentConfig, state.showGeometry, isLight);
    obstacleGroup.add(mesh);
  }
}

function onWindowResize() {
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

  // 自转更新
  if (state.autoRotate) {
    rotY += state.rotSpeed;
  }

  const currentYaw = (state.autoRotate ? rotY : 0) + state.tilt.yaw;
  const rotAngles = new THREE.Vector3(state.tilt.pitch, currentYaw, state.tilt.roll);
  const posOffset = new THREE.Vector3(state.offset.x, state.offset.y, state.offset.z);

  // 同步三维实体位移、姿态与几何大小
  obstacleGroup.position.copy(posOffset);
  obstacleGroup.rotation.set(rotAngles.x, rotAngles.y, rotAngles.z, 'YXZ');
  obstacleGroup.scale.setScalar(state.scale);

  // 月晕轻微呼吸动效
  if (moonHalo) {
    const s = 1.0 + Math.sin(now * 0.002) * 0.04;
    moonHalo.scale.set(s, s, 1);
  }

  // 粒子物理更新与渲染
  if (goldFallSystem && goldFallSystem.enabled) {
    goldFallSystem.update(dt);
  } else {
    particleSystem.update(dt, currentConfig, customMesh, {
      gravity: state.gravity,
      maxFallSpeed: state.maxFallSpeed,
      sparkleIntensity: state.sparkleIntensity,
      posOffset: posOffset,
      rotAngles: rotAngles,
      scale: state.scale,
      raycaster: raycaster
    });
  }

  controls.update();
  renderer.render(scene, camera);
}

// --- 用户交互与界面绑定 ---
function setupUI() {
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

  // 0. 蒙尘之罪专属时间与物理控制绑定
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

  // 全局空格键快捷时停
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      toggleGlobalPause();
    }
  });

  const goldTimeScaleSlider = document.getElementById('gold-timescale-slider');
  const goldTimeScaleVal = document.getElementById('gold-timescale-val');
  if (goldTimeScaleSlider) {
    goldTimeScaleSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (goldFallSystem) goldFallSystem.setTimeScale(v);
      if (goldTimeScaleVal) goldTimeScaleVal.innerText = `${v.toFixed(2)}x`;
    });
  }

  const goldWidthSlider = document.getElementById('gold-width-slider');
  const goldWidthVal = document.getElementById('gold-width-val');
  if (goldWidthSlider) {
    goldWidthSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (goldFallSystem) goldFallSystem.setStreamWidth(v);
      if (goldWidthVal) goldWidthVal.innerText = `${v} px`;
    });
  }

  const goldRateSlider = document.getElementById('gold-rate-slider');
  const goldRateVal = document.getElementById('gold-rate-val');
  if (goldRateSlider) {
    goldRateSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (goldFallSystem) goldFallSystem.spawnRate = v;
      if (goldRateVal) goldRateVal.innerText = `${v.toFixed(1)} /s`;
    });
  }

  const goldDissolveSlider = document.getElementById('gold-dissolve-slider');
  const goldDissolveVal = document.getElementById('gold-dissolve-val');
  if (goldDissolveSlider) {
    goldDissolveSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (goldFallSystem) goldFallSystem.dissolveY = v;
      if (goldDissolveVal) goldDissolveVal.innerText = v;
    });
  }

  // 珠宝品类配比联动 (实时百分比换算与物理分流)
  const ratioCoin = document.getElementById('gold-ratio-coin');
  const ratioPearl = document.getElementById('gold-ratio-pearl');
  const ratioGem = document.getElementById('gold-ratio-gem');
  const ratioCoinVal = document.getElementById('ratio-coin-val');
  const ratioPearlVal = document.getElementById('ratio-pearl-val');
  const ratioGemVal = document.getElementById('ratio-gem-val');
  const ratioSummary = document.getElementById('gold-ratio-summary');

  function updateRatioUI() {
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

    if (goldFallSystem) {
      goldFallSystem.setRatios(c, p, g);
    }
  }

  if (ratioCoin) ratioCoin.addEventListener('input', updateRatioUI);
  if (ratioPearl) ratioPearl.addEventListener('input', updateRatioUI);
  if (ratioGem) ratioGem.addEventListener('input', updateRatioUI);

  // 3D 金樽导流体控制绑定 (开关、高度、倾角、减震缓冲)
  const glassToggleBtn = document.getElementById('gold-glass-toggle-btn');
  const glassYSlider = document.getElementById('gold-glass-y-slider');
  const glassYVal = document.getElementById('gold-glass-y-val');
  const glassPitchSlider = document.getElementById('gold-glass-pitch-slider');
  const glassPitchVal = document.getElementById('gold-glass-pitch-val');
  const glassCushionSlider = document.getElementById('gold-glass-cushion-slider');
  const glassCushionVal = document.getElementById('gold-glass-cushion-val');

  let glassEnabled = true;
  if (glassToggleBtn) {
    glassToggleBtn.addEventListener('click', () => {
      glassEnabled = !glassEnabled;
      if (goldFallSystem) goldFallSystem.setGlassEnabled(glassEnabled);
      if (glassEnabled) {
        glassToggleBtn.classList.add('active');
        glassToggleBtn.innerText = '已启用';
      } else {
        glassToggleBtn.classList.remove('active');
        glassToggleBtn.innerText = '已关闭';
      }
    });
  }

  // 3D 阻挡物形态切换（高脚金樽 vs 捧金之手 🫴）
  const btnObsGlass = document.getElementById('gold-obs-glass');
  const btnObsHand = document.getElementById('gold-obs-hand');
  if (btnObsGlass && btnObsHand) {
    btnObsGlass.addEventListener('click', () => {
      btnObsGlass.classList.add('active');
      btnObsHand.classList.remove('active');
      if (goldFallSystem) goldFallSystem.setObstacleType('glass');
    });
    btnObsHand.addEventListener('click', () => {
      btnObsHand.classList.add('active');
      btnObsGlass.classList.remove('active');
      if (goldFallSystem) goldFallSystem.setObstacleType('hand');
    });
  }

  if (glassYSlider) {
    glassYSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (goldFallSystem) goldFallSystem.setGlassPosY(v);
      if (glassYVal) glassYVal.innerText = v;
    });
  }

  if (glassPitchSlider) {
    glassPitchSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (goldFallSystem) goldFallSystem.setGlassPitch(v);
      if (glassPitchVal) glassPitchVal.innerText = `${v}°`;
    });
  }

  if (glassCushionSlider) {
    glassCushionSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (goldFallSystem) goldFallSystem.setGlassCushion(v);
      if (glassCushionVal) glassCushionVal.innerText = v.toFixed(2);
    });
  }

  // 1. 月亮颜色
  const moonColorPicker = document.getElementById('moon-color-picker');
  if (moonColorPicker) {
    moonColorPicker.addEventListener('input', (e) => {
      updateMoonColor(e.target.value);
    });
  }

  // 2. 背景主题切换
  const btnDark = document.getElementById('theme-dark');
  const btnLight = document.getElementById('theme-light');
  if (btnDark && btnLight) {
    btnDark.addEventListener('click', () => {
      btnDark.classList.add('active');
      btnLight.classList.remove('active');
      setBgTheme('dark');
    });
    btnLight.addEventListener('click', () => {
      btnLight.classList.add('active');
      btnDark.classList.remove('active');
      setBgTheme('light');
    });
    if (state.bgTheme === 'light') {
      btnLight.classList.add('active');
      btnDark.classList.remove('active');
    }
  }

  // 3. 粒子双色系统
  const colorPickerA = document.getElementById('color-picker-a');
  const colorPickerB = document.getElementById('color-picker-b');
  const ratioSlider = document.getElementById('ratio-slider');
  const ratioVal = document.getElementById('ratio-val');

  function updateParticleColors() {
    state.colorA = colorPickerA.value;
    state.colorB = colorPickerB.value;
    state.ratioA = parseFloat(ratioSlider.value);
    particleSystem.setDualColors(state.colorA, state.colorB, state.ratioA);
    if (ratioVal) ratioVal.innerText = `${Math.round(state.ratioA * 100)}% : ${Math.round((1 - state.ratioA) * 100)}%`;
  }

  if (colorPickerA) {
    colorPickerA.value = state.colorA;
    colorPickerA.addEventListener('input', updateParticleColors);
  }
  if (colorPickerB) {
    colorPickerB.value = state.colorB;
    colorPickerB.addEventListener('input', updateParticleColors);
  }
  if (ratioSlider) {
    ratioSlider.value = state.ratioA;
    ratioSlider.addEventListener('input', updateParticleColors);
  }

  // 4. 几何形状预设
  const presetSelect = document.getElementById('preset-select');
  if (presetSelect) {
    presetSelect.value = state.preset;
    presetSelect.addEventListener('change', (e) => {
      state.preset = e.target.value;
      rebuildObstacle();
    });
  }

  // 4.1 几何形状大小缩放
  const scaleSlider = document.getElementById('scale-slider');
  const scaleVal = document.getElementById('scale-val');
  if (scaleSlider) {
    scaleSlider.value = state.scale;
    if (scaleVal) scaleVal.innerText = `${Math.round(state.scale * 100)}%`;
    scaleSlider.addEventListener('input', (e) => {
      state.scale = parseFloat(e.target.value);
      if (scaleVal) scaleVal.innerText = `${Math.round(state.scale * 100)}%`;
    });
  }

  // 5. 空间位置与朝向微调
  const posXSlider = document.getElementById('pos-x-slider');
  const posXVal = document.getElementById('pos-x-val');
  if (posXSlider) {
    posXSlider.addEventListener('input', (e) => {
      state.offset.x = parseFloat(e.target.value);
      if (posXVal) posXVal.innerText = state.offset.x;
    });
  }

  const posYSlider = document.getElementById('pos-y-slider');
  const posYVal = document.getElementById('pos-y-val');
  if (posYSlider) {
    posYSlider.addEventListener('input', (e) => {
      state.offset.y = parseFloat(e.target.value);
      if (posYVal) posYVal.innerText = state.offset.y;
    });
  }

  const tiltPitchSlider = document.getElementById('tilt-pitch-slider');
  const tiltPitchVal = document.getElementById('tilt-pitch-val');
  if (tiltPitchSlider) {
    tiltPitchSlider.addEventListener('input', (e) => {
      state.tilt.pitch = parseFloat(e.target.value) * (Math.PI / 180);
      if (tiltPitchVal) tiltPitchVal.innerText = `${e.target.value}°`;
    });
  }

  const facingYawSlider = document.getElementById('facing-yaw-slider');
  const facingYawVal = document.getElementById('facing-yaw-val');
  if (facingYawSlider) {
    facingYawSlider.addEventListener('input', (e) => {
      state.tilt.yaw = parseFloat(e.target.value) * (Math.PI / 180);
      if (facingYawVal) facingYawVal.innerText = `${e.target.value}°`;
    });
  }

  // 6. 基础力学与控制参数
  const countSlider = document.getElementById('count-slider');
  const countVal = document.getElementById('count-val');
  if (countSlider) {
    countSlider.addEventListener('input', (e) => {
      state.particleCount = parseInt(e.target.value, 10);
      particleSystem.activeCount = state.particleCount;
      if (countVal) countVal.innerText = state.particleCount;
    });
  }

  const speedSlider = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      state.rotSpeed = parseFloat(e.target.value);
      if (speedVal) speedVal.innerText = state.rotSpeed.toFixed(3);
    });
  }

  const gravitySlider = document.getElementById('gravity-slider');
  const gravityVal = document.getElementById('gravity-val');
  if (gravitySlider) {
    gravitySlider.addEventListener('input', (e) => {
      state.gravity = parseFloat(e.target.value);
      if (gravityVal) gravityVal.innerText = state.gravity.toFixed(2);
    });
  }

  const autoRotateBtn = document.getElementById('toggle-rotate');
  if (autoRotateBtn) {
    autoRotateBtn.addEventListener('click', () => {
      state.autoRotate = !state.autoRotate;
      autoRotateBtn.innerText = state.autoRotate ? '自转: 运行中' : '自转: 已暂停';
      autoRotateBtn.classList.toggle('active', state.autoRotate);
    });
  }

  const toggleGeomBtn = document.getElementById('toggle-geom');
  if (toggleGeomBtn) {
    toggleGeomBtn.addEventListener('click', () => {
      state.showGeometry = !state.showGeometry;
      toggleGeomBtn.innerText = state.showGeometry ? '实体轮廓: 显示' : '实体轮廓: 隐形';
      toggleGeomBtn.classList.toggle('active', state.showGeometry);
      rebuildObstacle();
    });
  }

  const resetCamBtn = document.getElementById('reset-camera');
  if (resetCamBtn) {
    resetCamBtn.addEventListener('click', () => {
      camera.position.set(0, 0, 860);
      controls.target.set(0, -30, 0);
      controls.update();
    });
  }

  const resetTransformBtn = document.getElementById('reset-transform');
  if (resetTransformBtn) {
    resetTransformBtn.addEventListener('click', () => {
      state.offset.x = 0;
      state.offset.y = 0;
      state.offset.z = 0;
      state.tilt.pitch = 0;
      state.tilt.yaw = 0;
      state.tilt.roll = 0;
      state.scale = 1.0;

      if (scaleSlider) { scaleSlider.value = 1.0; if (scaleVal) scaleVal.innerText = '100%'; }
      if (posXSlider) { posXSlider.value = 0; if (posXVal) posXVal.innerText = 0; }
      if (posYSlider) { posYSlider.value = 0; if (posYVal) posYVal.innerText = 0; }
      if (tiltPitchSlider) { tiltPitchSlider.value = 0; if (tiltPitchVal) tiltPitchVal.innerText = '0°'; }
      if (facingYawSlider) { facingYawSlider.value = 0; if (facingYawVal) facingYawVal.innerText = '0°'; }
    });
  }
}

// --- 外部 3D 模型 (.obj) 拖入 ---
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
          const scale = 300.0 / maxDim;
          obj.scale.set(scale, scale, scale);

          const center = new THREE.Vector3();
          box.getCenter(center);
          obj.position.set(-center.x * scale, -center.y * scale - 30, -center.z * scale);

          while (obstacleGroup.children.length > 0) {
            obstacleGroup.remove(obstacleGroup.children[0]);
          }

          const isLight = state.bgTheme === 'light';
          const mat = new THREE.MeshStandardMaterial({
            color: isLight ? 0xdddddd : 0x060606,
            roughness: 0.9,
            metalness: 0.1
          });

          obj.traverse((child) => {
            if (child.isMesh) {
              child.material = mat;
              child.geometry.computeVertexNormals();
              customMesh = child;
            }
          });

          obstacleGroup.add(obj);
          currentConfig = null;
          state.preset = 'custom';

          const presetSelect = document.getElementById('preset-select');
          if (presetSelect) presetSelect.value = 'custom';
        } catch (err) {
          console.error('加载 OBJ 模型失败:', err);
        }
      };
      reader.readAsText(files[0]);
    }
  });
}

window.addEventListener('DOMContentLoaded', init);
