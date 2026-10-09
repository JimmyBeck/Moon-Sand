/**
 * GoldFallSystem: 复刻《蒙尘之罪》金币、珍珠、宝石下落翻滚并消融过渡为流沙系统
 * 顶级工艺版：
 * 1. 埃及/古典精制金币（Proof Cameo 工艺）：高光镜面底板 + 霜化磨砂浮雕（神像桂冠徽章、罗马文字、120齿防滑边）
 * 2. 丰富且正统的双全立体 3D 宝石切工：立体长方八角倒脊阶梯切（祖母绿） + 伞形倒棱锥尖底钻石切（红宝石）
 * 3. 澳白珍珠薄膜干涉伴彩（Iridescence）与多级尺寸
 * 4. 时间控制系统：时间流速（Time Scale）+ 一键时间停止（Bullet Time Freeze）
 */
import * as THREE from 'three';
import { ArchArchitecture } from '../geometry/ArchArchitecture.js';

// 零 GC 预分配力学计算矢量
const _rollAxis = new THREE.Vector3();
const _tempVel = new THREE.Vector3();
const _tempNorm = new THREE.Vector3();

export class GoldFallSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'GoldFallSystem';
    this.scene.add(this.group);

    // 系统运行状态与时间控制
    this.enabled = true;
    this.isPaused = false;   // 一键时间停止
    this.timeScale = 1.0;    // 时间流速倍率 (0.1x ~ 2.0x)

    this.spawnRate = 2.5;    // 每秒生成的实体组频度
    this.spawnTimer = 0;
    this.dissolveY = -80;    // 触发消融过渡的纵向高度
    this.bottomY = -420;     // 粒子最底层回收高度
    this.baseGravity = 340;  // 基础重力加速度常数
    this.fallSpeedFactor = 1.0; // 独立物理下落速度系数 (0.3x ~ 2.5x)
    this.gravity = this.baseGravity * this.fallSpeedFactor;

    // 流沙形态与品类配比控制
    this.streamWidth = 90;   // 流沙整体宽度 (40 ~ 240)
    this.ratios = {
      coin: 50,              // 金币比重
      pearl: 30,             // 珍珠比重
      gem: 20                // 宝石比重 (红宝石与祖母绿各 50%)
    };

    // 活跃的宏观下落实体列表
    this.entities = [];
    this.maxEntities = 80;

    // 伴生与消融流沙粒子系统（4200 高密常驻闭环流沙瀑布 + 1800 动态迸发池，LineSegments 流线拖影 + Points 双通道渲染）
    this.baseStreamCount = 4200;
    this.totalParticles = 6000;
    this.activeParticleCount = 4200;
    this.particles = [];

    // 发射源控制 (月亮 / 虚空 / 圣光)
    this.emitterType = 'moon';   // 'moon' | 'sky' | 'beam'
    this.moonColor = '#ffcb1e';
    this.moonTime = 0;

    // 物料开关与粒子双色混色系统
    this.sandEnabled = true;
    this.jewelsEnabled = true;
    this.colorA = new THREE.Color(0xffcb1e); // 主色（金黄）
    this.colorB = new THREE.Color(0xffffff); // 副色（星白）
    this.ratioA = 0.70;                     // 70% 主色 : 30% 副色
    this.theme = 'dark';                    // 'dark' | 'light'

    // 3D 碰撞阻挡物（支持高脚金樽、捧金之手 🫴、探云散掌 🌸、阶梯拱券 🏛️、罗马长廊 🏛️、双曲沙漏 ⏳、独酌孤杯 🍷、自定义 OBJ 📦）
    this.obstacleType = 'glass';  // 'glass' | 'hand' | 'reaching' | 'arches' | 'colonnade' | 'hourglass' | 'wineglass' | 'custom'
    this.obstacleScale = 1.0;     // 阻挡物等比缩放因子 (0.5x ~ 1.8x)
    this.obstacleMeshVisible = true; // 实体轮廓可视性开关（隐形时物理碰撞与切向导流仍 100% 运行）
    this.coinScaleFactor = 1.0;   // 金币尺寸缩放因子 (0.6x ~ 1.8x)
    this.glassGroup = new THREE.Group();
    this.glassGroup.name = 'WineGlassObstacle';
    this.group.add(this.glassGroup);

    this.reachingGroup = new THREE.Group();
    this.reachingGroup.name = 'ReachingHandObstacle';
    this.reachingGroup.visible = false;
    this.group.add(this.reachingGroup);

    this.glassEnabled = true;
    this.glassPosX = 0;
    this.glassPosY = -95;
    this.glassPitch = 0.42;       // 约 24 度前倾，构成顺畅自排水导流斜坡
    this.glassYaw = 0;
    this.glassRoll = -0.04;
    this.glassCushion = 0.04;     // 柔性减震吸能系数（0.04 = 水/流沙质感，微弱缓冲着陆，杜绝刚性弹跳）
    this.autoRotate = false;
    this.rotSpeed = 0.007;
    this.dissolveY = -150;        // 允许倾泻出杯口后在下方消融

    this.customMesh = null;
    this._raycaster = new THREE.Raycaster();

    this.glassPos = new THREE.Vector3(this.glassPosX, this.glassPosY, 0);
    this.glassEuler = new THREE.Euler(this.glassPitch, this.glassYaw, this.glassRoll, 'YXZ');
    this.glassQuat = new THREE.Quaternion().setFromEuler(this.glassEuler);
    this.glassInvQuat = this.glassQuat.clone().invert();
    this.glassRotMat = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.glassQuat));

    this._outerSegments = [];

    // 零 GC 预分配碰撞结果缓存（支撑数千粒子与珠宝高频物理查询）
    this._hitResult = {
      pen: 0,
      normWorldX: 0, normWorldY: 0, normWorldZ: 0,
      scatX: 0, scatY: 0, scatZ: 0,
      isInner: false, isLip: false, isOuter: false,
      ly: 0, r: 0
    };

    this._initStudioEnvironment();
    this._initCoinTextures();
    this._initMaterials();
    this._initMoon();
    this._initWineGlass();
    this._initPalmHand();
    this._initReachingHand();
    this._initArchitecturalObstacles();
    this._initParticleSystem();
    this._initLighting();
    this._updateObstacleMeshVisibility();
  }

  /* ----------------------------------------------------
   * 1. 360° 全向 Studio 环境贴图
   * ---------------------------------------------------- */
  _initStudioEnvironment() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, 256);
    bgGrad.addColorStop(0, '#583f1a');
    bgGrad.addColorStop(0.5, '#2e1f0e');
    bgGrad.addColorStop(1, '#150f06');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 256);

    // 顶部全光谱纯白天幕柔光箱（提供纯净白光，激发珍珠冷白高光与青粉薄膜干涉）
    ctx.fillStyle = 'rgba(250, 252, 255, 1.0)';
    ctx.beginPath();
    ctx.ellipse(256, 45, 150, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // 核心高亮反射点（锐利白色小高光）
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.beginPath();
    ctx.ellipse(256, 45, 60, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // 侧翼主反射柔光箱 A（暖金，塑造金币侧影）
    ctx.fillStyle = 'rgba(255, 214, 90, 0.85)';
    ctx.beginPath();
    ctx.ellipse(90, 130, 65, 55, 0, 0, Math.PI * 2);
    ctx.fill();

    // 侧翼主反射柔光箱 B（暖金）
    ctx.fillStyle = 'rgba(255, 195, 60, 0.8)';
    ctx.beginPath();
    ctx.ellipse(420, 130, 65, 55, 0, 0, Math.PI * 2);
    ctx.fill();

    // 侧上方冷调极光反射柔光带（专供珍珠游弋青蓝紫粉彩光）
    ctx.fillStyle = 'rgba(220, 245, 255, 0.70)';
    ctx.beginPath();
    ctx.ellipse(350, 85, 55, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // 全周水平倒影暖金光带
    ctx.strokeStyle = 'rgba(255, 238, 180, 0.7)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(512, 48);
    ctx.stroke();

    this.envTexture = new THREE.CanvasTexture(canvas);
    this.envTexture.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = this.envTexture;
  }

  /* ----------------------------------------------------
   * 2. 金币精制币工艺贴图系统（Proof / Cameo Contrast）
   * 包含：颜色深度自遮挡图、镜面 vs 磨砂粗糙度图、高精度法线图
   * ---------------------------------------------------- */
  _initCoinTextures() {
    const size = 1024;
    const center = size / 2;
    const outerR = 476;

    // A. 高度灰度图 Canvas (Height / Displacement)
    const hCanvas = document.createElement('canvas');
    hCanvas.width = size;
    hCanvas.height = size;
    const hCtx = hCanvas.getContext('2d');
    hCtx.fillStyle = '#555555';
    hCtx.fillRect(0, 0, size, size);

    // B. 颜色与雕刻自遮挡图 Canvas (Albedo / AO)
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = size;
    colorCanvas.height = size;
    const cCtx = colorCanvas.getContext('2d');
    // 底板基准色：深暖黄金
    cCtx.fillStyle = '#ca9016';
    cCtx.fillRect(0, 0, size, size);

    // C. 粗糙度图 Canvas (Roughness: 黑=极镜面，灰/白=磨砂霜化)
    const rCanvas = document.createElement('canvas');
    rCanvas.width = size;
    rCanvas.height = size;
    const rCtx = rCanvas.getContext('2d');
    // 底盘极致镜面 (RGB ~ 15 / 255 ≈ 0.06 粗糙度，如同精制币的高光反光镜底)
    rCtx.fillStyle = '#0f0f0f';
    rCtx.fillRect(0, 0, size, size);

    // 1. 最外圈 140 齿精密防滑铣齿（Milled Reeded Edge）
    const notches = 140;
    for (let i = 0; i < notches; i++) {
      const ang = (i / notches) * Math.PI * 2;
      const x1 = center + Math.cos(ang) * (outerR - 32);
      const y1 = center + Math.sin(ang) * (outerR - 32);
      const x2 = center + Math.cos(ang) * outerR;
      const y2 = center + Math.sin(ang) * outerR;

      hCtx.strokeStyle = i % 2 === 0 ? '#ffffff' : '#222222';
      hCtx.lineWidth = 6.2;
      hCtx.beginPath(); hCtx.moveTo(x1, y1); hCtx.lineTo(x2, y2); hCtx.stroke();

      cCtx.strokeStyle = i % 2 === 0 ? '#ffea7e' : '#4a2c06';
      cCtx.lineWidth = 6.2;
      cCtx.beginPath(); cCtx.moveTo(x1, y1); cCtx.lineTo(x2, y2); cCtx.stroke();

      rCtx.strokeStyle = '#606060';
      rCtx.lineWidth = 6.2;
      rCtx.beginPath(); rCtx.moveTo(x1, y1); rCtx.lineTo(x2, y2); rCtx.stroke();
    }

    // 2. 双层加厚阶梯外凸防护圈（Raised Rim）
    hCtx.strokeStyle = '#ffffff'; hCtx.lineWidth = 16;
    hCtx.beginPath(); hCtx.arc(center, center, outerR - 40, 0, Math.PI * 2); hCtx.stroke();
    cCtx.strokeStyle = '#ffe778'; cCtx.lineWidth = 16;
    cCtx.beginPath(); cCtx.arc(center, center, outerR - 40, 0, Math.PI * 2); cCtx.stroke();

    // 内凹阴影深沟槽（Recessed Border Shadow）
    hCtx.strokeStyle = '#181818'; hCtx.lineWidth = 10;
    hCtx.beginPath(); hCtx.arc(center, center, outerR - 56, 0, Math.PI * 2); hCtx.stroke();
    cCtx.strokeStyle = '#382004'; cCtx.lineWidth = 10;
    cCtx.beginPath(); cCtx.arc(center, center, outerR - 56, 0, Math.PI * 2); cCtx.stroke();

    // 次层内环凸线
    hCtx.strokeStyle = '#e0e0e0'; hCtx.lineWidth = 4;
    hCtx.beginPath(); hCtx.arc(center, center, outerR - 68, 0, Math.PI * 2); hCtx.stroke();
    cCtx.strokeStyle = '#fed968'; cCtx.lineWidth = 4;
    cCtx.beginPath(); cCtx.arc(center, center, outerR - 68, 0, Math.PI * 2); cCtx.stroke();

    // 3. 珠状点阵圈（Beaded Pearl Denticles，84 颗规整凸珠）
    const dotCount = 84;
    for (let i = 0; i < dotCount; i++) {
      const ang = (i / dotCount) * Math.PI * 2;
      const dx = center + Math.cos(ang) * (outerR - 86);
      const dy = center + Math.sin(ang) * (outerR - 86);

      hCtx.fillStyle = '#ffffff';
      hCtx.beginPath(); hCtx.arc(dx, dy, 7.0, 0, Math.PI * 2); hCtx.fill();

      cCtx.fillStyle = '#fff492';
      cCtx.beginPath(); cCtx.arc(dx, dy, 7.0, 0, Math.PI * 2); cCtx.fill();

      rCtx.fillStyle = '#707070'; // 霜化磨砂珠
      rCtx.beginPath(); rCtx.arc(dx, dy, 7.0, 0, Math.PI * 2); rCtx.fill();
    }

    // 4. 环形古典货币弧形铭文（Upper & Lower Arcs）
    // 阴影与主体分层绘制产生深雕质感
    const upperText = '✦ AUREUS IMPERIALIS · MMXXVI ✦';
    const lowerText = '✦ NOBILE REGNUM · LUX AETERNA ✦';

    function drawArcText(text, radius, startAngle, endAngle, isClockwise = true) {
      const len = text.length;
      const angleStep = (endAngle - startAngle) / (len - 1);
      for (let i = 0; i < len; i++) {
        const char = text[i];
        const ang = startAngle + i * angleStep;
        const tx = center + Math.cos(ang) * radius;
        const ty = center + Math.sin(ang) * radius;
        const rot = ang + (isClockwise ? Math.PI / 2 : -Math.PI / 2);

        // 阴刻阴影
        cCtx.save();
        cCtx.translate(tx + 1.5, ty + 2.0);
        cCtx.rotate(rot);
        cCtx.fillStyle = '#221402';
        cCtx.font = 'bold 30px "Times New Roman", "Cinzel", serif';
        cCtx.textAlign = 'center';
        cCtx.textBaseline = 'middle';
        cCtx.fillText(char, 0, 0);
        cCtx.restore();

        // 浮雕凸面
        cCtx.save();
        cCtx.translate(tx, ty);
        cCtx.rotate(rot);
        cCtx.fillStyle = '#fff498';
        cCtx.font = 'bold 30px "Times New Roman", "Cinzel", serif';
        cCtx.textAlign = 'center';
        cCtx.textBaseline = 'middle';
        cCtx.fillText(char, 0, 0);
        cCtx.restore();

        // 高度与法线层
        hCtx.save();
        hCtx.translate(tx, ty);
        hCtx.rotate(rot);
        hCtx.fillStyle = '#f8f8f8';
        hCtx.font = 'bold 30px "Times New Roman", "Cinzel", serif';
        hCtx.textAlign = 'center';
        hCtx.textBaseline = 'middle';
        hCtx.fillText(char, 0, 0);
        hCtx.restore();

        // 粗糙度层（磨砂文字）
        rCtx.save();
        rCtx.translate(tx, ty);
        rCtx.rotate(rot);
        rCtx.fillStyle = '#7a7a7a';
        rCtx.font = 'bold 30px "Times New Roman", "Cinzel", serif';
        rCtx.textAlign = 'center';
        rCtx.textBaseline = 'middle';
        rCtx.fillText(char, 0, 0);
        rCtx.restore();
      }
    }

    drawArcText(upperText, outerR - 128, -Math.PI * 0.82, -Math.PI * 0.18, true);
    drawArcText(lowerText, outerR - 128, Math.PI * 0.82, Math.PI * 0.18, false);

    // 5. 核心太阳神圣芒刺（32道深浮雕放射光芒）
    const rays = 32;
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2;
      const isLong = i % 2 === 0;
      const rInner = 110;
      const rOuter = isLong ? outerR - 165 : outerR - 185;

      hCtx.strokeStyle = isLong ? '#ffffff' : '#909090';
      hCtx.lineWidth = isLong ? 5.5 : 3.5;
      hCtx.beginPath();
      hCtx.moveTo(center + Math.cos(ang) * rInner, center + Math.sin(ang) * rInner);
      hCtx.lineTo(center + Math.cos(ang) * rOuter, center + Math.sin(ang) * rOuter);
      hCtx.stroke();

      cCtx.strokeStyle = isLong ? '#fff396' : '#5a3808';
      cCtx.lineWidth = isLong ? 5.5 : 3.5;
      cCtx.beginPath();
      cCtx.moveTo(center + Math.cos(ang) * rInner, center + Math.sin(ang) * rInner);
      cCtx.lineTo(center + Math.cos(ang) * rOuter, center + Math.sin(ang) * rOuter);
      cCtx.stroke();
    }

    // 6. 核心皇家徽章与雄狮/圣翼浮雕（Frosted Cameo Relief）
    // 勋章外圈
    hCtx.strokeStyle = '#ffffff'; hCtx.lineWidth = 7;
    hCtx.beginPath(); hCtx.arc(center, center, 105, 0, Math.PI * 2); hCtx.stroke();
    cCtx.strokeStyle = '#ffec7e'; cCtx.lineWidth = 7;
    cCtx.beginPath(); cCtx.arc(center, center, 105, 0, Math.PI * 2); cCtx.stroke();

    // 阴刻装饰槽
    hCtx.strokeStyle = '#181818'; hCtx.lineWidth = 5;
    hCtx.beginPath(); hCtx.arc(center, center, 96, 0, Math.PI * 2); hCtx.stroke();
    cCtx.strokeStyle = '#321d03'; cCtx.lineWidth = 5;
    cCtx.beginPath(); cCtx.arc(center, center, 96, 0, Math.PI * 2); cCtx.stroke();

    // 浮雕实心底座（高磨砂霜化材质）
    hCtx.fillStyle = '#eeeeee';
    hCtx.beginPath(); hCtx.arc(center, center, 90, 0, Math.PI * 2); hCtx.fill();
    cCtx.fillStyle = '#fee46c';
    cCtx.beginPath(); cCtx.arc(center, center, 90, 0, Math.PI * 2); cCtx.fill();
    rCtx.fillStyle = '#828282';
    rCtx.beginPath(); rCtx.arc(center, center, 90, 0, Math.PI * 2); rCtx.fill();

    // 核心皇家圣冠与徽记轮廓
    // 皇冠五重锯齿与星芒
    const crownY = center - 16;
    hCtx.fillStyle = '#ffffff';
    hCtx.beginPath();
    hCtx.moveTo(center - 50, crownY + 28);
    hCtx.lineTo(center - 58, crownY - 32);
    hCtx.lineTo(center - 25, crownY - 10);
    hCtx.lineTo(center,      crownY - 45);
    hCtx.lineTo(center + 25, crownY - 10);
    hCtx.lineTo(center + 58, crownY - 32);
    hCtx.lineTo(center + 50, crownY + 28);
    hCtx.closePath();
    hCtx.fill();

    cCtx.fillStyle = '#fff4a0';
    cCtx.beginPath();
    cCtx.moveTo(center - 50, crownY + 28);
    cCtx.lineTo(center - 58, crownY - 32);
    cCtx.lineTo(center - 25, crownY - 10);
    cCtx.lineTo(center,      crownY - 45);
    cCtx.lineTo(center + 25, crownY - 10);
    cCtx.lineTo(center + 58, crownY - 32);
    cCtx.lineTo(center + 50, crownY + 28);
    cCtx.closePath();
    cCtx.fill();

    // 皇冠底座内嵌阴刻宝石槽
    hCtx.fillStyle = '#222222';
    hCtx.beginPath(); hCtx.ellipse(center, crownY + 16, 32, 10, 0, 0, Math.PI * 2); hCtx.fill();
    cCtx.fillStyle = '#3a2003';
    cCtx.beginPath(); hCtx.ellipse(center, crownY + 16, 32, 10, 0, 0, Math.PI * 2); cCtx.fill();

    // 核心主星芒宝石高凸起
    hCtx.fillStyle = '#ffffff';
    hCtx.beginPath(); hCtx.arc(center, crownY + 16, 7.5, 0, Math.PI * 2); hCtx.fill();
    cCtx.fillStyle = '#fffcda';
    cCtx.beginPath(); cCtx.arc(center, crownY + 16, 7.5, 0, Math.PI * 2); cCtx.fill();

    // 下方展开的双翼卷草纹
    hCtx.strokeStyle = '#ffffff'; hCtx.lineWidth = 6;
    hCtx.beginPath();
    hCtx.arc(center - 24, crownY + 45, 22, 0, Math.PI * 1.3);
    hCtx.stroke();
    hCtx.beginPath();
    hCtx.arc(center + 24, crownY + 45, 22, -Math.PI * 0.3, Math.PI);
    hCtx.stroke();

    cCtx.strokeStyle = '#fff290'; cCtx.lineWidth = 6;
    cCtx.beginPath();
    cCtx.arc(center - 24, crownY + 45, 22, 0, Math.PI * 1.3);
    cCtx.stroke();
    cCtx.beginPath();
    cCtx.arc(center + 24, crownY + 45, 22, -Math.PI * 0.3, Math.PI);
    cCtx.stroke();

    // 7. 高速 3x3 Sobel 烘焙法线贴图
    const hData = hCtx.getImageData(0, 0, size, size).data;
    const nCanvas = document.createElement('canvas');
    nCanvas.width = size;
    nCanvas.height = size;
    const nCtx = nCanvas.getContext('2d');
    const nImg = nCtx.createImageData(size, size);
    const nData = nImg.data;

    const strength = 5.2;
    for (let y = 1; y < size - 1; y++) {
      const rowOffset = y * size;
      for (let x = 1; x < size - 1; x++) {
        const idx = (rowOffset + x) << 2;
        const hL = hData[(rowOffset + (x - 1)) << 2];
        const hR = hData[(rowOffset + (x + 1)) << 2];
        const hU = hData[((y - 1) * size + x) << 2];
        const hD = hData[((y + 1) * size + x) << 2];

        let dx = (hR - hL) / 255 * strength;
        let dy = (hD - hU) / 255 * strength;
        let dz = 1.0;

        const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= invLen; dy *= invLen; dz *= invLen;

        nData[idx]     = ((dx * 0.5 + 0.5) * 255) | 0;
        nData[idx + 1] = ((dy * 0.5 + 0.5) * 255) | 0;
        nData[idx + 2] = ((dz * 0.5 + 0.5) * 255) | 0;
        nData[idx + 3] = 255;
      }
    }
    nCtx.putImageData(nImg, 0, 0);

    this.coinMap = new THREE.CanvasTexture(colorCanvas);
    this.coinRoughnessMap = new THREE.CanvasTexture(rCanvas);
    this.coinNormalMap = new THREE.CanvasTexture(nCanvas);

    this.coinMap.generateMipmaps = true;
    this.coinRoughnessMap.generateMipmaps = true;
    this.coinNormalMap.generateMipmaps = true;
  }

  /* ----------------------------------------------------
   * 3. 几何体与材质定义（3D 正统双切工 + 澳白伴彩）
   * ---------------------------------------------------- */
  _initMaterials() {
    // 1. 金币材质（精制币 Proof Cameo 工艺：颜色图 + 粗糙度对比图 + 高精度法线图）
    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.coinMap,
      roughnessMap: this.coinRoughnessMap,
      normalMap: this.coinNormalMap,
      normalScale: new THREE.Vector2(2.8, 2.8),
      metalness: 0.94,
      roughness: 0.18,
      emissive: 0x362204,
      emissiveIntensity: 0.38,
      envMapIntensity: 2.8
    });

    // 2. 珍珠材质：顶级南洋澳白（纯净皎洁银白底色 + 极光青粉流动伴彩 + 珠光内蕴冷荧光）
    this.pearlMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,            // 高反射洁净纯白，剔除吸黑透光
      emissive: 0xebf4ff,         // 内蕴冷白珠光荧光，暗部温润通透不发灰
      emissiveIntensity: 0.16,
      roughness: 0.12,            // 文石层细腻微散射底基
      metalness: 0.02,            // 有机宝石非金属质感
      clearcoat: 1.0,             // 顶级清漆水光高光层
      clearcoatRoughness: 0.02,   // 极度锐利的镜面光斑
      sheen: 1.0,                 // 边缘天鹅绒光晕
      sheenColor: new THREE.Color(0xdcf2ff), // 边缘泛出清冽明亮的冷调青白光
      sheenRoughness: 0.20,
      iridescence: 1.0,           // 伴彩强度拉满
      iridescenceIOR: 1.68,       // 高折射率大幅提升色散对比度
      iridescenceThicknessRange: [320, 640], // 精确激发 480nm 青蓝与 560nm 玫瑰紫粉双色干涉
      envMapIntensity: 3.2
    });

    // 3. 祖母绿：立体长方八角倒棱阶梯切工（3D Emerald Cut + 物理透光火彩 + 棱镜色散）
    this.emeraldMat = new THREE.MeshPhysicalMaterial({
      color: 0x00e676,
      transmission: 0.88,
      opacity: 1.0,
      transparent: false,
      ior: 1.58,
      thickness: 6.5,
      attenuationColor: new THREE.Color(0x003d16),
      attenuationDistance: 11.0,
      roughness: 0.04,
      metalness: 0.04,
      dispersion: 0.08,           // PBR 物理折射火彩色散
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      flatShading: true,
      envMapIntensity: 3.2
    });

    // 4. 红宝石：立体明亮式圆锥钻石切工（3D Round Brilliant Diamond Cut + 高折射鸽血红 + 强色散）
    this.rubyMat = new THREE.MeshPhysicalMaterial({
      color: 0xff1744,
      transmission: 0.86,
      opacity: 1.0,
      transparent: false,
      ior: 1.76,
      thickness: 6.0,
      attenuationColor: new THREE.Color(0x5a000e),
      attenuationDistance: 9.5,
      roughness: 0.04,
      metalness: 0.04,
      dispersion: 0.10,           // PBR 物理折射火彩色散
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      flatShading: true,
      envMapIntensity: 3.2
    });

    // 几何体 1：加厚立体倒角金币（带精细 UV 归一化映射）
    const coinShape = new THREE.Shape();
    coinShape.absarc(0, 0, 14.2, 0, Math.PI * 2, false);
    const extrudeSettings = {
      depth: 3.4,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 1.0,
      bevelThickness: 0.95
    };
    this.coinGeom = new THREE.ExtrudeGeometry(coinShape, extrudeSettings);
    this.coinGeom.center();
    this.coinGeom.computeVertexNormals();

    // 核心修复：归一化重映射金币 UV 到 [0, 1]，确保浮雕、铭文、齿边 100% 精准贴合盘面
    const pos = this.coinGeom.attributes.position;
    const uv = this.coinGeom.attributes.uv;
    const maxR = 15.2; // 14.2 + bevelSize
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // 背面 (z < 0) 翻转 X 轴，使得两面铭文与浮雕朝向一致正向
      const u = (z < 0 ? -x : x) / (maxR * 2) + 0.5;
      const v = y / (maxR * 2) + 0.5;
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;

    // 几何体 2：南洋珍珠（细腻比例光滑球体 48×48，基础半径由 8.0 收敛至 5.0）
    this.pearlGeom = new THREE.SphereGeometry(5.0, 48, 48);

    // 几何体 3：全三维立体八角阶梯祖母绿切工（3D Emerald Step Cut：上台面、下倒棱脊）
    this.emeraldGeom = this._create3DEmeraldCutGeometry(11.5, 16.5, 9.0, 3.4);

    // 几何体 4：全三维立体明亮式倒圆锥切工（3D Brilliant Diamond Cut：上大台面、下倒锥尖底）
    this.rubyGeom = this._create3DBrilliantCutGeometry(8.8, 12.0, 0.55, 0.35);
  }

  /* ----------------------------------------------------
   * 3.1 全三维立体八角阶梯祖母绿切工几何构建 (3D Emerald Step Cut)
   * 具有真正的冠部平整台面、八面斜切斜坡与聚光倒脊亭部（绝非扁平片）
   * ---------------------------------------------------- */
  _create3DEmeraldCutGeometry(w = 11.5, l = 16.5, totalDepth = 9.0, cut = 3.4) {
    const positions = [];
    function addTri(p1, p2, p3) {
      positions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
    }

    function getOctagon(width, length, chamfer, y) {
      const hw = width / 2;
      const hl = length / 2;
      const c = chamfer;
      return [
        [-hw + c, y, -hl],
        [ hw - c, y, -hl],
        [ hw,     y, -hl + c],
        [ hw,     y,  hl - c],
        [ hw - c, y,  hl],
        [-hw + c, y,  hl],
        [-hw,     y,  hl - c],
        [-hw,     y, -hl + c]
      ];
    }

    const crownH = totalDepth * 0.35;
    const pavilionD = totalDepth * 0.65;

    const girdle = getOctagon(w, l, cut, 0);
    const table = getOctagon(w * 0.65, l * 0.65, cut * 0.65, crownH);

    // 冠部台面
    const tableCenter = [0, crownH, 0];
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      addTri(tableCenter, table[next], table[i]);
    }

    // 冠部阶梯倾斜切面 (Table to Girdle)
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      addTri(table[i], table[next], girdle[i]);
      addTri(table[next], girdle[next], girdle[i]);
    }

    // 亭部聚光倒脊 (Pavilion Keel Line at Bottom)
    const keel1 = [0, -pavilionD, -l * 0.32];
    const keel2 = [0, -pavilionD,  l * 0.32];

    // 连接腰棱与亭部脊线
    addTri(girdle[0], girdle[1], keel1);
    addTri(girdle[1], girdle[2], keel1);
    addTri(girdle[7], girdle[0], keel1);

    addTri(girdle[3], girdle[4], keel2);
    addTri(girdle[4], girdle[5], keel2);
    addTri(girdle[5], girdle[6], keel2);

    addTri(girdle[2], girdle[3], keel2);
    addTri(girdle[2], keel2, keel1);

    addTri(girdle[6], girdle[7], keel1);
    addTri(girdle[6], keel1, keel2);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }

  /* ----------------------------------------------------
   * 3.2 全三维立体明亮式倒锥切工几何构建 (3D Brilliant Diamond Cut)
   * 经典的经典钻石形态：上方大平台、中间腰棱、下方收拢为聚光尖底倒棱锥
   * ---------------------------------------------------- */
  _create3DBrilliantCutGeometry(radius = 8.8, totalHeight = 12.0, tableRatio = 0.55, crownRatio = 0.32) {
    const segments = 12; // 12边对称，产生多面切火彩
    const crownH = totalHeight * crownRatio;
    const pavilionD = totalHeight * (1 - crownRatio);
    const tableR = radius * tableRatio;

    const positions = [];
    const tableCenter = [0, crownH, 0];
    const culetPoint = [0, -pavilionD, 0];

    const tableVerts = [];
    const girdleVerts = [];

    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      tableVerts.push([Math.cos(theta) * tableR, crownH, Math.sin(theta) * tableR]);
      girdleVerts.push([Math.cos(theta) * radius, 0, Math.sin(theta) * radius]);
    }

    function addTri(p1, p2, p3) {
      positions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
    }

    // 台面
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      addTri(tableCenter, tableVerts[next], tableVerts[i]);
    }

    // 冠部切面 (Table to Girdle)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      addTri(tableVerts[i], tableVerts[next], girdleVerts[i]);
      addTri(tableVerts[next], girdleVerts[next], girdleVerts[i]);
    }

    // 亭部倒棱锥切面 (Girdle to Culet Sharp Point)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      addTri(girdleVerts[i], girdleVerts[next], culetPoint);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }

  /* ----------------------------------------------------
   * 4. 光照强化
   * ---------------------------------------------------- */
  _initLighting() {
    this.lightGroup = new THREE.Group();

    // 暖金半球光
    const hemiLight = new THREE.HemisphereLight(0xfffaed, 0x483210, 2.0);
    this.lightGroup.add(hemiLight);

    // 纯白顶光（全光谱白光，打出珍珠纯白水光点并激发青粉伴彩）
    const topLight = new THREE.DirectionalLight(0xffffff, 3.0);
    topLight.position.set(30, 380, 180);
    this.lightGroup.add(topLight);

    // 侧前辅助主打光
    const fillLight = new THREE.DirectionalLight(0xffe290, 2.0);
    fillLight.position.set(-160, 140, 150);
    this.lightGroup.add(fillLight);

    // 背面侧逆光
    const rimBackLight = new THREE.DirectionalLight(0xfffae8, 1.8);
    rimBackLight.position.set(130, -80, -180);
    this.lightGroup.add(rimBackLight);

    // 顶部假体积圣光锥（微弱半透 + Additive 柔和加色，烘托天降财宝氛围）
    const beamGeom = new THREE.CylinderGeometry(10, 80, 420, 32, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xffefb8,
      transparent: true,
      opacity: 0.042,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.beamMesh = new THREE.Mesh(beamGeom, this.beamMat);
    this.beamMesh.position.set(0, 40, 0);
    this.lightGroup.add(this.beamMesh);

    this.group.add(this.lightGroup);
  }

  /* ----------------------------------------------------
   * 4.1 发射源月轮天体构建
   * ---------------------------------------------------- */
  _initMoon() {
    this.moonGroup = new THREE.Group();
    this.moonGroup.name = 'MoonEmitter';

    const moonGeo = new THREE.CircleGeometry(42, 64);
    this.moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.moonColor) });
    this.moonMesh = new THREE.Mesh(moonGeo, this.moonMat);
    this.moonMesh.position.set(0, 200, 0);
    this.moonGroup.add(this.moonMesh);

    const haloGeo = new THREE.CircleGeometry(48, 64);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.moonColor),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending
    });
    this.moonHalo = new THREE.Mesh(haloGeo, this.haloMat);
    this.moonHalo.position.set(0, 200, -1);
    this.moonGroup.add(this.moonHalo);

    this.group.add(this.moonGroup);
    this.moonGroup.visible = (this.emitterType === 'moon');
  }

  /* ----------------------------------------------------
   * 4.5 3D 高脚金樽/酒杯（Wine Glass Obstacle）构建
   * 采用高透黑曜石微晶体材质 + 24K 黄金嵌边装饰圈
   * 并预烘焙高精度内壁、外壁与杯唇截面碰撞几何
   * ---------------------------------------------------- */
  _initWineGlass() {
    // 1. 杯身旋转体轮廓截面（24段优雅弧线）
    const profilePoints = [
      new THREE.Vector2(0, -96),       // 底座底部中心
      new THREE.Vector2(38, -96),      // 底盘外缘
      new THREE.Vector2(38, -94),      // 底座厚度
      new THREE.Vector2(34, -91),      // 底座斜坡过渡
      new THREE.Vector2(8, -80),       // 底座过渡到杯挺
      new THREE.Vector2(5.5, -70),     // 杯挺下段
      new THREE.Vector2(5.2, -40),     // 杯挺中段收腰
      new THREE.Vector2(6.5, -24),     // 杯挺上段
      new THREE.Vector2(8.5, -22),     // 杯挺装饰金环凸脊
      new THREE.Vector2(6.5, -20),     // 杯挺连接碗底
      new THREE.Vector2(12, -16),      // 外碗底起弧
      new THREE.Vector2(26, -5),       // 外碗下腹
      new THREE.Vector2(40, 10),       // 外碗腹部最大盛装弧
      new THREE.Vector2(45, 25),       // 外碗腰身
      new THREE.Vector2(43, 40),       // 外碗微收
      new THREE.Vector2(42.5, 50.5),   // 外杯唇
      new THREE.Vector2(41.25, 51.5),  // 杯唇圆弧顶点
      new THREE.Vector2(32.0, 52.0),   // 实心导流微拱过渡
      new THREE.Vector2(16.0, 52.5),   // 实心导流穹顶
      new THREE.Vector2(0, 52.8)       // 实心导流中心顶点
    ];

    this.glassGeom = new THREE.LatheGeometry(profilePoints, 48);
    this.glassGeom.computeVertexNormals();

    // 2. 奢华黑曜石透光微晶体 PBR 材质
    this.glassBodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x141820,
      roughness: 0.05,
      metalness: 0.08,
      transmission: 0.80,
      ior: 1.54,
      thickness: 4.2,
      attenuationColor: new THREE.Color(0x0a1018),
      attenuationDistance: 16.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      envMapIntensity: 3.5,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    this.glassMesh = new THREE.Mesh(this.glassGeom, this.glassBodyMat);
    this.glassMesh.castShadow = true;
    this.glassMesh.receiveShadow = true;
    this.glassGroup.add(this.glassMesh);

    // 3. 24K 黄金嵌边装饰金圈 (Gold Trim Inlays)
    this.glassGoldMat = new THREE.MeshStandardMaterial({
      color: 0xffcb1e,
      metalness: 0.95,
      roughness: 0.16,
      emissive: 0x402a05,
      emissiveIntensity: 0.35,
      envMapIntensity: 3.0,
      depthWrite: true
    });

    // 唇部金边环
    const lipRingGeom = new THREE.TorusGeometry(41.25, 1.25, 16, 48);
    const lipRingMesh = new THREE.Mesh(lipRingGeom, this.glassGoldMat);
    lipRingMesh.position.set(0, 50.5, 0);
    lipRingMesh.rotation.x = Math.PI / 2;
    this.glassGroup.add(lipRingMesh);

    // 杯挺腰节金环
    const stemRingGeom = new THREE.TorusGeometry(8.0, 1.3, 16, 36);
    const stemRingMesh = new THREE.Mesh(stemRingGeom, this.glassGoldMat);
    stemRingMesh.position.set(0, -22, 0);
    stemRingMesh.rotation.x = Math.PI / 2;
    this.glassGroup.add(stemRingMesh);

    // 底座外沿金环
    const baseRingGeom = new THREE.TorusGeometry(37.5, 1.3, 16, 48);
    const baseRingMesh = new THREE.Mesh(baseRingGeom, this.glassGoldMat);
    baseRingMesh.position.set(0, -94, 0);
    baseRingMesh.rotation.x = Math.PI / 2;
    this.glassGroup.add(baseRingMesh);

    // 4. 预计算解析碰撞截面外壁线段 (Solid Deflector Outer Segments)

    const rawOuter = [
      [42.5, 50.5],
      [43.0, 40],
      [45.0, 25],
      [40.0, 10],
      [26.0, -5],
      [12.0, -16],
      [6.5, -20],
      [8.5, -22],
      [6.5, -24],
      [5.2, -40],
      [5.5, -70],
      [8.0, -80],
      [34.0, -91],
      [38.0, -94],
      [38.0, -96]
    ];
    this._outerSegments = [];
    for (let i = 0; i < rawOuter.length - 1; i++) {
      const ax = rawOuter[i][0], ay = rawOuter[i][1];
      const bx = rawOuter[i + 1][0], by = rawOuter[i + 1][1];
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const nlen = Math.hypot(-dy, dx);
      this._outerSegments.push({
        ax, ay, bx, by, dx, dy,
        invLenSq: 1.0 / lenSq,
        nx: -dy / nlen,
        ny: dx / nlen
      });
    }

    this._updateGlassTransform();
  }

  /* ----------------------------------------------------
   * 4.5b 3D 捧金之手（Palm-Up Hand 🫴）构建
   * 采用高透黑曜石微晶体材质 + 24K 黄金腕带与指节环
   * ---------------------------------------------------- */
  _initPalmHand() {
    this.handGroup = new THREE.Group();
    this.handGroup.name = 'PalmHandObstacle';
    this.handGroup.visible = (this.obstacleType === 'hand');
    this.group.add(this.handGroup);

    const bodyMat = this.glassBodyMat;
    const goldMat = this.glassGoldMat;

    // 1. 前臂与手腕 (Forearm & Wrist: 自 -Z 方平滑伸入，倾斜上接手腕)
    const armGeom = new THREE.CylinderGeometry(13.5, 17.5, 46, 32);
    armGeom.rotateX(Math.PI * 0.5); // 圆柱高度对齐至 Z 轴
    armGeom.rotateX(0.12);          // 向上倾斜接手腕
    armGeom.translate(0, -9.0, -42);
    const armMesh = new THREE.Mesh(armGeom, bodyMat);
    armMesh.castShadow = true;
    this.handGroup.add(armMesh);

    // 腕部 24K 黄金嵌饰金镯 (Gold Wrist Cuff)
    const cuffGeom = new THREE.TorusGeometry(15.2, 2.0, 16, 40);
    const cuffMesh = new THREE.Mesh(cuffGeom, goldMat);
    cuffMesh.position.set(0, -6.5, -21);
    cuffMesh.rotation.x = 0.12;
    this.handGroup.add(cuffMesh);

    // 2. 掌心基座与肌肉群 (Palm Bed & Eminences)
    // 2D 轮廓：Y 对应 3D 中的 Z 轴（-20 为腕根，+15 为指根横弓）
    const palmShape = new THREE.Shape();
    palmShape.moveTo(-19, -20);
    palmShape.quadraticCurveTo(-23, -2, -18, 14);  // 小指外侧缘
    palmShape.quadraticCurveTo(0, 17, 16, 14);     // 远端掌骨横弓（指根）
    palmShape.quadraticCurveTo(24, 2, 20, -12);    // 虎口至大鱼际
    palmShape.quadraticCurveTo(10, -22, -19, -20); // 腕关节线

    const palmExtrude = {
      depth: 8.5,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 2.8,
      bevelThickness: 2.5
    };
    const palmGeom = new THREE.ExtrudeGeometry(palmShape, palmExtrude);
    // 正向绕 X 轴旋转 90 度：2D Y 轴转为 3D +Z 轴（-20在后方，+15在前方），拉伸深度转为 3D -Y 轴
    palmGeom.rotateX(Math.PI * 0.5);
    palmGeom.translate(0, 0, 0);
    const palmMesh = new THREE.Mesh(palmGeom, bodyMat);
    palmMesh.castShadow = true;
    this.handGroup.add(palmMesh);

    // 大鱼际厚肌 (Thenar Eminence) - 饱满承托
    const thenarGeom = new THREE.SphereGeometry(9.0, 24, 24);
    thenarGeom.scale(1.2, 0.65, 1.35);
    const thenarMesh = new THREE.Mesh(thenarGeom, bodyMat);
    thenarMesh.position.set(12, 1.2, -4);
    this.handGroup.add(thenarMesh);

    // 小鱼际厚肌 (Hypothenar Eminence)
    const hypoGeom = new THREE.SphereGeometry(7.8, 24, 24);
    hypoGeom.scale(1.0, 0.60, 1.45);
    const hypoMesh = new THREE.Mesh(hypoGeom, bodyMat);
    hypoMesh.position.set(-13, 0.8, -6);
    this.handGroup.add(hypoMesh);

    // 3. 构建五指 (Five Digits 🫴 自然向前平展、指尖微屈托捧姿态)
    const makeFinger = (rootX, rootY, rootZ, length, baseRadius, spreadAngleY = 0) => {
      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(rootX, rootY, rootZ);
      fingerGroup.rotation.y = spreadAngleY;

      const l1 = length * 0.38; // 近节
      const l2 = length * 0.32; // 中节
      const l3 = length * 0.30; // 远节

      // 近节指骨 (Proximal): 圆柱平卧至 +Z，微翘 5 度 (-0.09 rad)
      const pGeom = new THREE.CylinderGeometry(baseRadius * 0.88, baseRadius, l1, 16);
      pGeom.rotateX(Math.PI * 0.5);
      pGeom.translate(0, 0, l1 * 0.5);
      pGeom.rotateX(-0.09);
      const pMesh = new THREE.Mesh(pGeom, bodyMat);
      fingerGroup.add(pMesh);

      // 指关节金环 1 (Knuckle Ring 1)
      const r1Geom = new THREE.TorusGeometry(baseRadius * 0.94, 0.52, 12, 24);
      const r1Mesh = new THREE.Mesh(r1Geom, goldMat);
      r1Mesh.position.set(0, l1 * 0.09, l1 * 0.98);
      r1Mesh.rotation.x = -0.09;
      fingerGroup.add(r1Mesh);

      // 中节指骨 (Intermediate): 上扬 16 度 (-0.28 rad)
      const mGeom = new THREE.CylinderGeometry(baseRadius * 0.75, baseRadius * 0.88, l2, 16);
      mGeom.rotateX(Math.PI * 0.5);
      mGeom.translate(0, 0, l2 * 0.5);
      mGeom.rotateX(-0.28);
      const mMesh = new THREE.Mesh(mGeom, bodyMat);
      mMesh.position.set(0, l1 * 0.09, l1 * 0.98);
      fingerGroup.add(mMesh);

      // 指关节金环 2 (Knuckle Ring 2)
      const r2Geom = new THREE.TorusGeometry(baseRadius * 0.80, 0.46, 12, 24);
      const r2Mesh = new THREE.Mesh(r2Geom, goldMat);
      const mEndZ = l1 * 0.98 + l2 * Math.cos(0.28);
      const mEndY = l1 * 0.09 + l2 * Math.sin(0.28);
      r2Mesh.position.set(0, mEndY, mEndZ);
      r2Mesh.rotation.x = -0.28;
      fingerGroup.add(r2Mesh);

      // 远节指骨与圆润指腹 (Distal & Tip): 上扬 26 度 (-0.45 rad)
      const dGeom = new THREE.CylinderGeometry(baseRadius * 0.60, baseRadius * 0.75, l3, 16);
      dGeom.rotateX(Math.PI * 0.5);
      dGeom.translate(0, 0, l3 * 0.5);
      dGeom.rotateX(-0.45);
      const dMesh = new THREE.Mesh(dGeom, bodyMat);
      dMesh.position.set(0, mEndY, mEndZ);
      fingerGroup.add(dMesh);

      // 指尖柔润圆球 (Finger Tip Pad)
      const tipGeom = new THREE.SphereGeometry(baseRadius * 0.68, 16, 16);
      tipGeom.scale(1.0, 0.9, 1.15);
      const tipMesh = new THREE.Mesh(tipGeom, bodyMat);
      const tipZ = mEndZ + l3 * Math.cos(0.45);
      const tipY = mEndY + l3 * Math.sin(0.45);
      tipMesh.position.set(0, tipY, tipZ);
      fingerGroup.add(tipMesh);

      this.handGroup.add(fingerGroup);
    };

    // 食指 (Index Finger)
    makeFinger(11.2, 0.5, 14.0, 31, 4.1, -0.06);
    // 中指 (Middle Finger - 最长主承托脊)
    makeFinger(3.6, 0.8, 15.5, 35, 4.4, 0.0);
    // 无名指 (Ring Finger)
    makeFinger(-4.6, 0.5, 14.5, 32, 4.1, 0.05);
    // 小指 (Pinky Finger)
    makeFinger(-12.5, 0.0, 12.5, 25, 3.5, 0.12);

    // 拇指 (Thumb 🫴 虎口微内收托举，自然向掌心环抱)
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(16.0, 0.6, -4.0);
    thumbGroup.rotation.set(-0.25, -0.42, 0.15); // 内旋环抱

    const t1Geom = new THREE.CylinderGeometry(4.2, 5.0, 14, 16);
    t1Geom.rotateX(Math.PI * 0.5);
    t1Geom.translate(0, 0, 7.0);
    t1Geom.rotateX(-0.20);
    const t1Mesh = new THREE.Mesh(t1Geom, bodyMat);
    thumbGroup.add(t1Mesh);

    const tRingGeom = new THREE.TorusGeometry(4.4, 0.58, 12, 24);
    const tRingMesh = new THREE.Mesh(tRingGeom, goldMat);
    tRingMesh.position.set(0, 14 * Math.sin(0.20), 14 * Math.cos(0.20));
    tRingMesh.rotation.x = -0.20;
    thumbGroup.add(tRingMesh);

    const t2Geom = new THREE.SphereGeometry(4.0, 16, 16);
    t2Geom.scale(1.0, 1.15, 1.25);
    t2Geom.translate(0, 14 * Math.sin(0.20) + 4.5, 14 * Math.cos(0.20) + 4.5);
    const t2Mesh = new THREE.Mesh(t2Geom, bodyMat);
    thumbGroup.add(t2Mesh);

    this.handGroup.add(thumbGroup);

    // 关键修正：手掌创建完毕后，立即执行全局空间与旋转同步
    this._updateGlassTransform();
  }

  /* ----------------------------------------------------
   * 4.5c 3D 探云散掌（Reaching Hand 🌸 现代舞戏剧化变体散掌）
   * 采用高定丝绢手套材质 + 堆叠褶皱长袖 + 24K 金环 + 五指放射花瓣造型
   * ---------------------------------------------------- */
  _initReachingHand() {
    this.reachingGroup = new THREE.Group();
    this.reachingGroup.name = 'ReachingHandObstacle';
    this.reachingGroup.visible = (this.obstacleType === 'reaching');
    this.group.add(this.reachingGroup);

    // 歌剧丝绸高定手套 PBR 材质（微带珠光丝绢高光，与落金珠宝形成明暗映衬）
    this.reachingGloveMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f4f8,
      roughness: 0.28,
      metalness: 0.06,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      sheen: 0.90,
      sheenColor: new THREE.Color(0xffffff),
      sheenRoughness: 0.22,
      side: THREE.DoubleSide
    });

    const gloveMat = this.reachingGloveMat;
    const goldMat = this.glassGoldMat;

    // 1. 前臂与手套长袖 (Forearm & Ruched Sleeve: 自 -Z 方倾斜伸入)
    const armGeom = new THREE.CylinderGeometry(14.0, 18.0, 52, 32);
    armGeom.rotateX(Math.PI * 0.5);
    armGeom.rotateX(0.14);
    armGeom.translate(0, -9.5, -45);
    const armMesh = new THREE.Mesh(armGeom, gloveMat);
    armMesh.castShadow = true;
    this.reachingGroup.add(armMesh);

    // 堆叠褶皱环 (Ruched Silk Folds: 5 道立体起伏堆叠波浪)
    const foldZs = [-55, -46, -38, -30, -23];
    const foldRadii = [17.5, 16.8, 16.0, 15.2, 14.8];
    const foldTubes = [1.8, 1.9, 1.7, 1.8, 1.6];
    for (let i = 0; i < foldZs.length; i++) {
      const foldGeom = new THREE.TorusGeometry(foldRadii[i], foldTubes[i], 12, 32);
      const foldMesh = new THREE.Mesh(foldGeom, gloveMat);
      const yOffset = -9.5 + (foldZs[i] + 45) * 0.14;
      foldMesh.position.set(0, yOffset, foldZs[i]);
      foldMesh.rotation.x = 0.14 + (i % 2 === 0 ? 0.08 : -0.06);
      foldMesh.rotation.z = (i % 2 === 0 ? 0.05 : -0.05);
      this.reachingGroup.add(foldMesh);
    }

    // 腕部 24K 黄金嵌饰金镯 (Gold Wrist Cuff)
    const cuffGeom = new THREE.TorusGeometry(15.4, 2.0, 16, 40);
    const cuffMesh = new THREE.Mesh(cuffGeom, goldMat);
    cuffMesh.position.set(0, -6.0, -20);
    cuffMesh.rotation.x = 0.14;
    this.reachingGroup.add(cuffMesh);

    // 2. 掌心基座与肌肉群 (Palm Bed & Eminences)
    const palmShape = new THREE.Shape();
    palmShape.moveTo(-18, -19);
    palmShape.quadraticCurveTo(-22, -2, -16, 12);  // 小指外侧缘
    palmShape.quadraticCurveTo(0, 15, 14, 12);     // 远端掌骨横弓（指根）
    palmShape.quadraticCurveTo(22, 1, 18, -11);    // 虎口至大鱼际
    palmShape.quadraticCurveTo(10, -20, -18, -19); // 腕关节线

    const palmExtrude = {
      depth: 7.5,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 2.6,
      bevelThickness: 2.2
    };
    const palmGeom = new THREE.ExtrudeGeometry(palmShape, palmExtrude);
    palmGeom.rotateX(Math.PI * 0.5);
    const palmMesh = new THREE.Mesh(palmGeom, gloveMat);
    palmMesh.castShadow = true;
    this.reachingGroup.add(palmMesh);

    // 大鱼际厚肌 (Thenar)
    const thenarGeom = new THREE.SphereGeometry(8.5, 20, 20);
    thenarGeom.scale(1.15, 0.60, 1.30);
    const thenarMesh = new THREE.Mesh(thenarGeom, gloveMat);
    thenarMesh.position.set(11, 0.8, -4);
    this.reachingGroup.add(thenarMesh);

    // 小鱼际厚肌 (Hypothenar)
    const hypoGeom = new THREE.SphereGeometry(7.5, 20, 20);
    hypoGeom.scale(0.95, 0.55, 1.40);
    const hypoMesh = new THREE.Mesh(hypoGeom, gloveMat);
    hypoMesh.position.set(-12, 0.6, -5);
    this.reachingGroup.add(hypoMesh);

    // 3. 构建五指独立花瓣造型 (Five Reaching Digits: 放射伸展，立体错落)
    const makeFingerChain = (rootPos, rotEuler, segLengths, baseR, hasRing = false, ringPos = null) => {
      const fGroup = new THREE.Group();
      fGroup.position.copy(rootPos);
      fGroup.rotation.copy(rotEuler);

      let curZ = 0;
      let curR = baseR;
      for (let s = 0; s < segLengths.length; s++) {
        const segLen = segLengths[s];
        const nextR = curR * 0.86;
        const sGeom = new THREE.CylinderGeometry(nextR, curR, segLen, 16);
        sGeom.rotateX(Math.PI * 0.5);
        sGeom.translate(0, 0, segLen * 0.5);
        const sMesh = new THREE.Mesh(sGeom, gloveMat);
        sMesh.position.set(0, 0, curZ);
        fGroup.add(sMesh);

        curZ += segLen;
        curR = nextR;

        // 关节微球
        const jGeom = new THREE.SphereGeometry(curR * 1.05, 14, 14);
        const jMesh = new THREE.Mesh(jGeom, gloveMat);
        jMesh.position.set(0, 0, curZ);
        fGroup.add(jMesh);
      }

      // 指尖柔润圆球 (Finger Tip Pad)
      const tipGeom = new THREE.SphereGeometry(curR * 1.10, 16, 16);
      tipGeom.scale(1.0, 0.85, 1.25);
      const tipMesh = new THREE.Mesh(tipGeom, gloveMat);
      tipMesh.position.set(0, 0, curZ);
      fGroup.add(tipMesh);

      // 关节金环
      if (hasRing && ringPos) {
        const rGeom = new THREE.TorusGeometry(baseR * 0.96, 0.48, 12, 24);
        const rMesh = new THREE.Mesh(rGeom, goldMat);
        rMesh.position.set(0, 0, ringPos);
        fGroup.add(rMesh);
      }

      this.reachingGroup.add(fGroup);
    };

    // 0: 拇指 (Thumb - 向右强力平张外展，形成平展花瓣侧翼)
    makeFingerChain(
      new THREE.Vector3(15.0, 0.6, -3.0),
      new THREE.Euler(-0.06, 1.18, 0.0, 'YXZ'),
      [13, 12],
      4.2,
      true,
      13
    );

    // 1: 食指 (Index - 关键特征：一根手指向下探出，前倾跌水滑槽，下倾 22 度)
    makeFingerChain(
      new THREE.Vector3(9.2, 0.8, 13.5),
      new THREE.Euler(0.38, 0.02, 0.0, 'YXZ'),
      [14, 12, 11],
      4.0,
      true,
      14
    );

    // 2: 中指 (Middle - 水平向前，花心平托，末节微扬)
    makeFingerChain(
      new THREE.Vector3(1.6, 1.0, 15.0),
      new THREE.Euler(-0.04, -0.05, 0.0, 'YXZ'),
      [15, 13, 12],
      4.2
    );

    // 3: 无名指 (Ring - 向左前上扬，花瓣中层)
    makeFingerChain(
      new THREE.Vector3(-6.2, 0.8, 14.0),
      new THREE.Euler(-0.28, -0.42, 0.0, 'YXZ'),
      [14, 12, 11],
      4.0
    );

    // 4: 小指 (Pinky - 大角度左展，花瓣上翻翘尖，上扬 32 度)
    makeFingerChain(
      new THREE.Vector3(-13.5, 0.2, 11.5),
      new THREE.Euler(-0.55, -0.84, 0.0, 'YXZ'),
      [12, 10, 10],
      3.6,
      true,
      12
    );

    this._updateGlassTransform();
  }

  /* ----------------------------------------------------
   * 4.5c 经典建筑几何体 (拱券 / 长廊 / 沙漏 / 独酌孤杯) 构建
   * ---------------------------------------------------- */
  _initArchitecturalObstacles() {
    this.archesCfg = ArchArchitecture.getClassicArchesConfig();
    this.colonnadeCfg = ArchArchitecture.getColonnadeConfig();
    this.hourglassCfg = ArchArchitecture.getHourglassConfig();
    this.wineglassCfg = ArchArchitecture.getWineGlassConfig();

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.15,
      envMapIntensity: 1.2
    });

    this.archesGroup = ArchArchitecture.buildMeshGroup(this.archesCfg, true, false);
    this.colonnadeGroup = ArchArchitecture.buildMeshGroup(this.colonnadeCfg, true, false);
    this.hourglassGroup = ArchArchitecture.buildMeshGroup(this.hourglassCfg, true, false);
    this.classicGlassGroup = ArchArchitecture.buildMeshGroup(this.wineglassCfg, true, false);

    [this.archesGroup, this.colonnadeGroup, this.hourglassGroup, this.classicGlassGroup].forEach(grp => {
      grp.traverse(child => { if (child.isMesh) child.material = stoneMat; });
      grp.visible = false;
      this.group.add(grp);
    });
  }

  _updateGlassTransform() {
    this.glassPos.set(this.glassPosX, this.glassPosY, 0);
    this.glassEuler.set(this.glassPitch, this.glassYaw, this.glassRoll, 'YXZ');
    this.glassQuat.setFromEuler(this.glassEuler);
    this.glassInvQuat.copy(this.glassQuat).invert();
    this.glassRotMat.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.glassQuat));

    const s = this.obstacleScale || 1.0;
    const allGroups = [
      this.glassGroup, this.handGroup, this.reachingGroup,
      this.archesGroup, this.colonnadeGroup, this.hourglassGroup, this.classicGlassGroup
    ];
    if (this.customMesh) allGroups.push(this.customMesh);

    allGroups.forEach(g => {
      if (g) {
        g.position.copy(this.glassPos);
        g.quaternion.copy(this.glassQuat);
        g.scale.set(s, s, s);
      }
    });
  }

  /* ----------------------------------------------------
   * 4.6 统一阻挡物碰撞入口与求解器
   * ---------------------------------------------------- */
  _solveObstacleCollision(worldPos, radius) {
    if (!this.glassEnabled) return null;
    if (this.obstacleType === 'arches') {
      return this._solveArchesCollision(worldPos, radius, this.archesCfg.arches);
    } else if (this.obstacleType === 'colonnade') {
      return this._solveArchesCollision(worldPos, radius, this.colonnadeCfg.arches);
    } else if (this.obstacleType === 'hourglass') {
      return this._solveHourglassCollision(worldPos, radius, this.hourglassCfg);
    } else if (this.obstacleType === 'wineglass') {
      return this._solveClassicGlassCollision(worldPos, radius, this.wineglassCfg);
    } else if (this.obstacleType === 'custom' && this.customMesh) {
      return this._solveMeshCollision(worldPos, radius);
    } else if (this.obstacleType === 'reaching') {
      return this._solveReachingHandCollision(worldPos, radius);
    } else if (this.obstacleType === 'hand') {
      return this._solveHandCollision(worldPos, radius);
    } else {
      return this._solveGlassCollision(worldPos, radius);
    }
  }

  _solveArchesCollision(worldPos, radius, archesData) {
    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const invS = 1.0 / (this.obstacleScale || 1.0);
    const lx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * invS;
    const ly = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * invS;
    const lz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * invS;
    const scaledR = radius * invS;

    let bestHit = null;
    let maxPen = 0;

    for (let i = 0; i < archesData.length; i++) {
      const arch = archesData[i];
      const rx = lx - arch.cx;
      const ry = ly - arch.cy;
      const rz = lz - arch.cz;

      if (Math.abs(rz) > arch.depth * 0.5 + scaledR + 4.0) continue;

      if (ry >= -8.0 - scaledR) {
        const dist2D = Math.hypot(rx, ry);
        const targetR = arch.outerR + scaledR;

        // 只要落入拱门上半圆弧顶区域，100% 承托在外弧面，绝不穿透进拱洞
        if (dist2D <= targetR) {
          const pen = (targetR - dist2D) * this.obstacleScale;
          if (pen > maxPen) {
            maxPen = pen;
            let nx = dist2D > 1e-4 ? rx / dist2D : 0;
            let ny = dist2D > 1e-4 ? Math.max(0.04, ry / dist2D) : 1.0;
            const nLen = Math.hypot(nx, ny);
            nx /= nLen; ny /= nLen;

            const shedDir = rx >= 0 ? 1 : -1;
            bestHit = {
              pen: pen,
              nLocX: nx,
              nLocY: ny,
              nLocZ: 0,
              isLip: Math.abs(rx) > arch.outerR * 0.75,
              scatX: nx * 0.85 + shedDir * 0.35,
              scatY: -0.2,
              scatZ: shedDir * 0.4
            };
          }
        }
      }
    }

    if (bestHit) {
      return this._transformHitResult(bestHit, ly, Math.hypot(lx, lz));
    }
    return null;
  }

  _solveHourglassCollision(worldPos, radius, cfg) {
    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const invS = 1.0 / (this.obstacleScale || 1.0);
    const lx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * invS;
    const ly = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * invS;
    const lz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * invS;
    const scaledR = radius * invS;
    const r = Math.hypot(lx, lz);

    if (ly <= cfg.topY + scaledR && ly >= cfg.bottomY - scaledR) {
      const midT = Math.abs(ly - cfg.neckY) / (cfg.topY - cfg.neckY);
      const expectedR = THREE.MathUtils.lerp(cfg.neckR, cfg.topR, Math.pow(midT, 0.75));
      const targetR = expectedR + scaledR;

      if (r <= targetR) {
        const pen = (targetR - r) * this.obstacleScale;
        const nrX = lx / (r || 1);
        const nrZ = lz / (r || 1);
        const ny = (ly > cfg.neckY ? 0.6 : -0.3);
        const bestHit = {
          pen: pen,
          nLocX: nrX * 0.8,
          nLocY: ny,
          nLocZ: nrZ * 0.8,
          isLip: Math.abs(ly - cfg.neckY) < 10,
          scatX: nrX,
          scatY: -0.4,
          scatZ: nrZ
        };
        return this._transformHitResult(bestHit, ly, r);
      }
    }
    return null;
  }

  _solveClassicGlassCollision(worldPos, radius, cfg) {
    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const invS = 1.0 / (this.obstacleScale || 1.0);
    const lx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * invS;
    const ly = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * invS;
    const lz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * invS;
    const scaledR = radius * invS;
    const r = Math.hypot(lx, lz);

    if (ly >= cfg.bowlBottomY - scaledR && ly <= cfg.bowlTopY + scaledR + 5) {
      const t = Math.max(0, Math.min(1, (ly - cfg.bowlBottomY) / (cfg.bowlTopY - cfg.bowlBottomY)));
      const expectedR = THREE.MathUtils.lerp(cfg.bowlWaistR, cfg.bowlTopR, Math.pow(t, 0.8));
      const targetR = expectedR + scaledR;

      if (r <= targetR) {
        const pen = (targetR - r) * this.obstacleScale;
        const nrX = lx / (r || 1);
        const nrZ = lz / (r || 1);
        const slopeY = THREE.MathUtils.clamp((cfg.bowlTopR - cfg.bowlWaistR) / (cfg.bowlTopY - cfg.bowlBottomY), 0.2, 0.8);
        const bestHit = {
          pen: pen,
          nLocX: nrX,
          nLocY: slopeY,
          nLocZ: nrZ,
          isLip: ly >= cfg.bowlTopY - 6,
          scatX: nrX,
          scatY: 0.1,
          scatZ: nrZ
        };
        return this._transformHitResult(bestHit, ly, r);
      }
    }
    return null;
  }

  _bakeMeshHeightfield(mesh) {
    if (!mesh) {
      this.meshHeightfield = null;
      return;
    }

    const box = new THREE.Box3();
    mesh.traverse(child => {
      if (child.isMesh && child.geometry) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        box.union(child.geometry.boundingBox);
      }
    });

    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
    }

    const minX = box.min.x - 3.0;
    const maxX = box.max.x + 3.0;
    const minZ = box.min.z - 3.0;
    const maxZ = box.max.z + 3.0;
    const minY = box.min.y;
    const maxY = box.max.y;

    const sizeX = maxX - minX;
    const sizeZ = maxZ - minZ;
    const sizeY = maxY - minY;

    const res = 64;
    const stepX = sizeX / (res - 1);
    const stepZ = sizeZ / (res - 1);

    const heights = new Float32Array(res * res).fill(-99999);
    const normals = new Float32Array(res * res * 3);

    const originY = maxY + 15.0;
    const rayDir = new THREE.Vector3(0, -1, 0);
    const raycaster = new THREE.Raycaster();
    raycaster.far = sizeY + 30.0;

    const origPos = mesh.position.clone();
    const origQuat = mesh.quaternion.clone();
    const origScale = mesh.scale.clone();
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);

    const rayOrigin = new THREE.Vector3();
    for (let iz = 0; iz < res; iz++) {
      const lz = minZ + iz * stepZ;
      for (let ix = 0; ix < res; ix++) {
        const lx = minX + ix * stepX;
        rayOrigin.set(lx, originY, lz);
        raycaster.set(rayOrigin, rayDir);

        const hits = raycaster.intersectObject(mesh, true);
        const idx = iz * res + ix;
        const idx3 = idx * 3;

        if (hits.length > 0) {
          const hit = hits[0];
          heights[idx] = hit.point.y;
          const fn = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);
          normals[idx3]     = fn.x;
          normals[idx3 + 1] = fn.y;
          normals[idx3 + 2] = fn.z;
        } else {
          heights[idx] = -99999;
          normals[idx3]     = 0;
          normals[idx3 + 1] = 1;
          normals[idx3 + 2] = 0;
        }
      }
    }

    mesh.position.copy(origPos);
    mesh.quaternion.copy(origQuat);
    mesh.scale.copy(origScale);
    mesh.updateMatrixWorld(true);

    // 缝隙修补
    for (let iz = 1; iz < res - 1; iz++) {
      for (let ix = 1; ix < res - 1; ix++) {
        const idx = iz * res + ix;
        if (heights[idx] <= -99990) {
          let sumH = 0, countH = 0;
          const neighbors = [
            (iz - 1) * res + ix,
            (iz + 1) * res + ix,
            iz * res + (ix - 1),
            iz * res + (ix + 1)
          ];
          for (const nIdx of neighbors) {
            if (heights[nIdx] > -99990) {
              sumH += heights[nIdx];
              countH++;
            }
          }
          if (countH >= 3) {
            heights[idx] = sumH / countH;
            normals[idx * 3 + 1] = 1.0;
          }
        }
      }
    }

    this.meshHeightfield = {
      minX, maxX, minZ, maxZ, minY, maxY,
      sizeX, sizeZ,
      res, stepX, stepZ,
      heights, normals
    };
  }

  _solveMeshCollision(worldPos, radius) {
    if (!this.customMesh || !this.meshHeightfield) return null;
    const hf = this.meshHeightfield;

    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const invS = 1.0 / (this.obstacleScale || 1.0);
    const lx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * invS;
    const ly = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * invS;
    const lz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * invS;
    const scaledR = radius * invS;

    if (lx < hf.minX - scaledR || lx > hf.maxX + scaledR ||
        lz < hf.minZ - scaledR || lz > hf.maxZ + scaledR ||
        ly < hf.minY - scaledR || ly > hf.maxY + scaledR + 30.0) {
      return null;
    }

    const u = (lx - hf.minX) / hf.stepX;
    const v = (lz - hf.minZ) / hf.stepZ;
    if (u < 0 || u > hf.res - 1 || v < 0 || v > hf.res - 1) return null;

    const u0 = Math.floor(u);
    const v0 = Math.floor(v);
    const u1 = Math.min(hf.res - 1, u0 + 1);
    const v1 = Math.min(hf.res - 1, v0 + 1);
    const fu = u - u0;
    const fv = v - v0;

    const res = hf.res;
    const h00 = hf.heights[v0 * res + u0];
    const h10 = hf.heights[v0 * res + u1];
    const h01 = hf.heights[v1 * res + u0];
    const h11 = hf.heights[v1 * res + u1];

    if (h00 <= -99990 && h10 <= -99990 && h01 <= -99990 && h11 <= -99990) return null;

    let validH00 = h00 > -99990 ? h00 : (h10 > -99990 ? h10 : (h01 > -99990 ? h01 : h11));
    let validH10 = h10 > -99990 ? h10 : validH00;
    let validH01 = h01 > -99990 ? h01 : validH00;
    let validH11 = h11 > -99990 ? h11 : validH10;

    const surfY = (1 - fu) * (1 - fv) * validH00 +
                  fu * (1 - fv) * validH10 +
                  (1 - fu) * fv * validH01 +
                  fu * fv * validH11;

    const targetY = surfY + scaledR;
    if (ly <= targetY && ly >= surfY - 80.0) {
      const pen = (targetY - ly) * (this.obstacleScale || 1.0);

      const idx00 = (v0 * res + u0) * 3;
      const idx10 = (v0 * res + u1) * 3;
      const idx01 = (v1 * res + u0) * 3;
      const idx11 = (v1 * res + u1) * 3;

      let locNx = (1 - fu) * (1 - fv) * hf.normals[idx00]     + fu * (1 - fv) * hf.normals[idx10]     + (1 - fu) * fv * hf.normals[idx01]     + fu * fv * hf.normals[idx11];
      let locNy = (1 - fu) * (1 - fv) * hf.normals[idx00 + 1] + fu * (1 - fv) * hf.normals[idx10 + 1] + (1 - fu) * fv * hf.normals[idx01 + 1] + fu * fv * hf.normals[idx11 + 1];
      let locNz = (1 - fu) * (1 - fv) * hf.normals[idx00 + 2] + fu * (1 - fv) * hf.normals[idx10 + 2] + (1 - fu) * fv * hf.normals[idx01 + 2] + fu * fv * hf.normals[idx11 + 2];

      const locLen = Math.hypot(locNx, locNy, locNz);
      if (locLen > 1e-4) {
        locNx /= locLen;
        locNy /= locLen;
        locNz /= locLen;
      } else {
        locNx = 0; locNy = 1; locNz = 0;
      }
      if (locNy < 0.2) locNy = 0.2;

      const bestHit = {
        pen: pen,
        nLocX: locNx,
        nLocY: locNy,
        nLocZ: locNz,
        isLip: false,
        scatX: locNx * 0.85,
        scatY: -0.25,
        scatZ: locNz * 0.85
      };

      return this._transformHitResult(bestHit, ly, Math.hypot(lx, lz));
    }
    return null;
  }

  _transformHitResult(bestHit, ly, r) {
    const m = this.glassRotMat.elements;
    const nx = bestHit.nLocX, ny = bestHit.nLocY, nz = bestHit.nLocZ;
    let nwx = m[0] * nx + m[3] * ny + m[6] * nz;
    let nwy = m[1] * nx + m[4] * ny + m[7] * nz;
    let nwz = m[2] * nx + m[5] * ny + m[8] * nz;
    const nwLen = Math.hypot(nwx, nwy, nwz);
    if (nwLen > 1e-4) { nwx /= nwLen; nwy /= nwLen; nwz /= nwLen; }

    const sx0 = bestHit.scatX, sy0 = bestHit.scatY, sz0 = bestHit.scatZ;
    const rx = m[0] * sx0 + m[3] * sy0 + m[6] * sz0;
    const ry = m[1] * sx0 + m[4] * sy0 + m[7] * sz0;
    const rz = m[2] * sx0 + m[5] * sy0 + m[8] * sz0;

    const dotRN = rx * nwx + ry * nwy + rz * nwz;
    let sx = rx - dotRN * nwx, sy = ry - dotRN * nwy, sz = rz - dotRN * nwz;
    const sLen = Math.hypot(sx, sy, sz);
    if (sLen > 1e-4) { sx /= sLen; sy /= sLen; sz /= sLen; }

    const res = this._hitResult;
    res.pen = bestHit.pen;
    res.normWorldX = nwx;
    res.normWorldY = nwy;
    res.normWorldZ = nwz;
    res.scatX = sx;
    res.scatY = sy;
    res.scatZ = sz;
    res.isInner = false;
    res.isLip = bestHit.isLip;
    res.isOuter = true;
    res.ly = ly;
    res.r = r;
    return res;
  }

  _solveHandCollision(worldPos, radius) {
    if (!this.glassEnabled || this.obstacleType !== 'hand') return null;

    // 转换至阻挡物本地坐标并按物体缩放归一化到基准尺度
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const invS = 1.0 / (this.obstacleScale || 1.0);
    const lx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * invS;
    const ly = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * invS;
    const lz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * invS;
    const scaledR = radius * invS;

    // 手部包围盒快速裁剪 (lx: -30 ~ 30, lz: -55 ~ 52, ly: -35 ~ 35)
    if (ly < -35 - scaledR || ly > 35 + scaledR) return null;
    if (lx < -30 - scaledR || lx > 30 + scaledR) return null;
    if (lz < -55 - scaledR || lz > 52 + scaledR) return null;

    // 1. 掌心与指腹曲面函数 (Palm & Finger Surface Equation)
    let expectedY = 0;
    let nLocX = 0, nLocY = 1.0, nLocZ = 0;
    let isLip = false;

    // 横向有效半宽
    const halfW = lz > 14 ? 26 : 23;
    const normX = Math.abs(lx) / halfW;
    if (normX > 1.35) return null;

    if (lz >= 13) {
      // 指群区 (lz: 13 ~ 50)：微翘向前托捧，指尖自然上扬
      const tf = Math.min(1.0, (lz - 13) / 35);
      expectedY = 1.2 + tf * 10.5 - (lx * lx) * 0.007;
      isLip = (lz >= 39) || (normX >= 0.86); // 指尖与指侧边缘为浪涌溢流口

      nLocX = (lx / halfW) * 0.55;
      nLocY = 1.0;
      nLocZ = -0.28; // 指向上倾斜，法线反向翘起，世界坐标产生充沛垂直向上托力
    } else if (lz >= -22) {
      // 掌心微凹承托区 (lz: -22 ~ 13)：盆状自然接捧聚流
      expectedY = 0.8 - (lx * lx) * 0.005 + (lz * lz) * 0.0025;
      isLip = normX >= 0.88;

      nLocX = (lx / halfW) * 0.65;
      nLocY = 1.0;
      nLocZ = 0.10; // 顺推向前方手指
    } else {
      // 腕根前臂区 (lz: -55 ~ -22)
      const ta = (lz + 55) / 33;
      expectedY = -9.0 + ta * 9.8 - (lx * lx) * 0.010;
      isLip = normX >= 0.85;

      nLocX = (lx / 18) * 0.50;
      nLocY = 1.0;
      nLocZ = -0.30;
    }

    const surfaceY = expectedY + scaledR;
    if (ly > surfaceY || ly < surfaceY - 60 - scaledR) return null;

    const pen = (surfaceY - ly) * this.obstacleScale;
    const nLen = Math.hypot(nLocX, nLocY, nLocZ);
    nLocX /= nLen;
    nLocY /= nLen;
    nLocZ /= nLen;

    // 变换到世界坐标法线
    const m = this.glassRotMat.elements;
    const nwx = m[0] * nLocX + m[3] * nLocY + m[6] * nLocZ;
    const nwy = m[1] * nLocX + m[4] * nLocY + m[7] * nLocZ;
    const nwz = m[2] * nLocX + m[5] * nLocY + m[8] * nLocZ;

    // 计算切向发散矢量（沿指尖与手掌外缘扩散）
    const rx = m[0] * (lx / (halfW || 1)) + m[6] * (lz > 0 ? 0.85 : -0.4);
    const ry = m[1] * (lx / (halfW || 1)) + m[7] * (lz > 0 ? 0.85 : -0.4);
    const rz = m[2] * (lx / (halfW || 1)) + m[8] * (lz > 0 ? 0.85 : -0.4);

    const dotRN = rx * nwx + ry * nwy + rz * nwz;
    let sx = rx - dotRN * nwx;
    let sy = ry - dotRN * nwy;
    let sz = rz - dotRN * nwz;
    const sLen = Math.hypot(sx, sy, sz);
    if (sLen > 1e-4) {
      sx /= sLen; sy /= sLen; sz /= sLen;
    } else {
      sx = m[6]; sy = m[7]; sz = m[8];
    }

    const res = this._hitResult;
    res.pen = pen;
    res.normWorldX = nwx;
    res.normWorldY = nwy;
    res.normWorldZ = nwz;
    res.scatX = sx;
    res.scatY = sy;
    res.scatZ = sz;
    res.isLip = isLip;
    res.isOuter = isLip;
    res.ly = ly * this.obstacleScale;
    res.r = Math.hypot(lx, lz) * this.obstacleScale;
    return res;
  }

  /* ----------------------------------------------------
   * 4.5d 探云散掌独立骨节胶囊碰撞与指缝穿透求解器
   * 关键创新：分立五指胶囊几何体（Disjoint Capsule Bones），
   * 细沙与珠宝落于指间缝隙时完全不受阻挡，顺畅穿透直达下方！
   * ---------------------------------------------------- */
  _solveReachingHandCollision(worldPos, radius) {
    if (!this.glassEnabled || this.obstacleType !== 'reaching') return null;

    // 转换至阻挡物本地坐标并归一化到基准尺度 (支持 50%~180% 任意缩放)
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const invS = 1.0 / (this.obstacleScale || 1.0);
    const lx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * invS;
    const ly = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * invS;
    const lz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * invS;
    const scaledR = radius * invS;

    // 空间快速包围盒粗筛
    if (ly < -30 - scaledR || ly > 30 + scaledR) return null;
    if (lx < -42 - scaledR || lx > 44 + scaledR) return null;
    if (lz < -68 - scaledR || lz > 62 + scaledR) return null;

    let bestHit = null;
    let maxPen = 0;

    // 1. 掌心微凹承托浅盆 (Palm Basin: 覆盖掌心核心区 Z in [-19, 15.0], |X| <= 17.5)
    if (lz >= -19 && lz <= 15.0 && Math.abs(lx) <= 17.5) {
      const expY = 0.6 - (lx * lx) * 0.0035 + (lz * lz) * 0.0018;
      const surfaceY = expY + scaledR;
      if (ly <= surfaceY && ly >= surfaceY - 14.0 - scaledR) {
        let nx = (lx / 17.5) * 0.55;
        let ny = 1.0;
        let nz = (lz > 0 ? 0.20 : -0.22);
        const nLen = Math.hypot(nx, ny, nz);
        const normY = ny / nLen;
        // 关键：推出深度换算为沿法向位移，确保在局部垂直轴上 100% 推出至 surfaceY 外层
        const pen = ((surfaceY - ly) / normY + 0.25) * this.obstacleScale;
        if (pen > maxPen) {
          maxPen = pen;

          // 三路指缝寻流导流：避免沙子直撞中指根部，自然顺应流向三道指缝
          // 缝隙 1 (食指-中指缝 X ≈ 5.4) | 缝隙 2 (中指-无名指缝 X ≈ -2.3) | 缝隙 3 (无名指-小指缝 X ≈ -9.8)
          let gapDirX = 0;
          if (lz > -4.0) {
            if (lx >= 1.6) {
              gapDirX = 0.48;  // 顺流滑向食指-中指缝及食指主跌水槽
            } else if (lx >= -6.2) {
              gapDirX = -0.48; // 顺流滑向中指-无名指缝
            } else {
              gapDirX = -0.52; // 顺流滑向无名指-小指缝
            }
          } else {
            gapDirX = (lx / 17.5) * 0.40; // 掌心后半段保持柔和铺展
          }

          bestHit = {
            pen: pen,
            nLocX: nx / nLen,
            nLocY: ny / nLen,
            nLocZ: nz / nLen,
            isLip: false,
            scatX: gapDirX,
            scatY: -0.25,
            scatZ: 0.88
          };
        }
      }
    }

    // 2. 前臂与手腕长袖 (Forearm & Wrist: Z in [-64, -19])
    if (!bestHit && lz >= -64 && lz < -19) {
      const armY = -9.5 + (lz + 45) * 0.14;
      const armR = 14.2 + (lz + 45) * 0.07;
      const dArm = Math.hypot(lx, ly - armY);
      if (dArm <= armR + scaledR) {
        const pen = (armR + scaledR - dArm) * this.obstacleScale;
        if (pen > maxPen) {
          maxPen = pen;
          const nx = dArm > 1e-4 ? lx / dArm : 0;
          const ny = dArm > 1e-4 ? (ly - armY) / dArm : 1.0;
          bestHit = {
            pen: pen,
            nLocX: nx,
            nLocY: ny,
            nLocZ: -0.15,
            isLip: false,
            scatX: nx,
            scatY: 0.2,
            scatZ: -0.8
          };
        }
      }
    }

    // 3. 五根独立三维手指骨节胶囊体（Disjoint Capsule Bones & Gap Penetration）
    // 关键：若物料位于指缝间，各手指 dist 均大于 (capR + scaledR)，不触发碰撞，物料顺畅从指缝漏下！
    const fingers = [
      // 0: 拇指 (Thumb - 右外展平展横翼)
      { x0: 15.0, y0: 0.6, z0: -3.0, x1: 38.07, y1: 2.10, z1: 6.51, r: 4.2, isChute: false, isWing: true },
      // 1: 食指 (Index - 关键特征：下俯探出跌水主滑槽，向下冲刷倾泻)
      { x0: 9.2,  y0: 0.8, z0: 13.5, x1: 9.89,  y1: -12.92, z1: 47.85, r: 4.0, isChute: true, isWing: false },
      // 2: 中指 (Middle - 水平向前，主承托脊)
      { x0: 1.6,  y0: 1.0, z0: 15.0, x1: -0.40, y1: 2.60, z1: 54.92, r: 4.2, isChute: false, isWing: false },
      // 3: 无名指 (Ring - 左前上扬花瓣层)
      { x0: -6.2, y0: 0.8, z0: 14.0, x1: -20.70, y1: 11.03, z1: 46.47, r: 4.0, isChute: false, isWing: false },
      // 4: 小指 (Pinky - 左展高翘花瓣尖)
      { x0: -13.5, y0: 0.2, z0: 11.5, x1: -33.81, y1: 16.93, z1: 29.71, r: 3.6, isChute: false, isWing: true }
    ];

    for (let k = 0; k < 5; k++) {
      const f = fingers[k];
      const fdx = f.x1 - f.x0, fdy = f.y1 - f.y0, fdz = f.z1 - f.z0;
      const lenSq = fdx * fdx + fdy * fdy + fdz * fdz;
      let t = ((lx - f.x0) * fdx + (ly - f.y0) * fdy + (lz - f.z0) * fdz) / lenSq;
      t = Math.max(0, Math.min(1, t));

      const cx = f.x0 + t * fdx;
      const cy = f.y0 + t * fdy;
      const cz = f.z0 + t * fdz;

      const dist = Math.hypot(lx - cx, ly - cy, lz - cz);
      const capR = f.r * (1.0 - t * 0.20); // 指尖柔化微缩

      if (dist < capR + scaledR) {
        const pen = (capR + scaledR - dist + 0.20) * this.obstacleScale;
        if (pen > maxPen) {
          maxPen = pen;

          let nx = dist > 1e-4 ? (lx - cx) / dist : 0;
          let ny = dist > 1e-4 ? (ly - cy) / dist : 1.0;
          let nz = dist > 1e-4 ? (lz - cz) / dist : 0;

          // 核心机制：消除手指根部迎流面的反向对顶门槛 (Ridge Watershed)
          // 将向后阻挡的法向消除，并在中指根部构建向左右指缝的分水岭
          if (t < 0.22 && nz < 0.15) {
            nz = 0.22;
            if (k === 2) {
              nx = (lx >= f.x0 ? 0.55 : -0.55);
            }
          }

          // 确保指背上表面具有向上托举法向
          if (ny < 0.25 && ly >= cy - capR * 0.3) ny = 0.65;
          const nLen = Math.hypot(nx, ny, nz);
          nx /= nLen; ny /= nLen; nz /= nLen;

          const isLip = (t >= 0.82) || f.isWing;

          // 切向发散方向：食指沿下坡滑槽倾泻，中指根部顺向左右指缝分流，指尖顺畅跌落
          let sDirX = f.isChute ? 0.05 : (fdx / 30);
          let sDirY = f.isChute ? -0.42 : (fdy / 30);
          let sDirZ = f.isChute ? 0.95 : (fdz / 30);
          if (k === 2 && t < 0.25) {
            sDirX = (lx >= f.x0 ? 0.65 : -0.65);
            sDirZ = 0.72;
          }
          const sDirLen = Math.hypot(sDirX, sDirY, sDirZ);

          bestHit = {
            pen: pen,
            nLocX: nx,
            nLocY: ny,
            nLocZ: nz,
            isLip: isLip,
            scatX: sDirX / sDirLen,
            scatY: sDirY / sDirLen,
            scatZ: sDirZ / sDirLen
          };
        }
      }
    }

    if (bestHit) {
      const m = this.glassRotMat.elements;
      const nx = bestHit.nLocX, ny = bestHit.nLocY, nz = bestHit.nLocZ;
      const nwx = m[0] * nx + m[3] * ny + m[6] * nz;
      const nwy = m[1] * nx + m[4] * ny + m[7] * nz;
      const nwz = m[2] * nx + m[5] * ny + m[8] * nz;

      const sx0 = bestHit.scatX, sy0 = bestHit.scatY, sz0 = bestHit.scatZ;
      const rx = m[0] * sx0 + m[3] * sy0 + m[6] * sz0;
      const ry = m[1] * sx0 + m[4] * sy0 + m[7] * sz0;
      const rz = m[2] * sx0 + m[5] * sy0 + m[8] * sz0;

      const dotRN = rx * nwx + ry * nwy + rz * nwz;
      let sx = rx - dotRN * nwx;
      let sy = ry - dotRN * nwy;
      let sz = rz - dotRN * nwz;
      const sLen = Math.hypot(sx, sy, sz);
      if (sLen > 1e-4) {
        sx /= sLen; sy /= sLen; sz /= sLen;
      } else {
        sx = m[6]; sy = m[7]; sz = m[8];
      }

      const res = this._hitResult;
      res.pen = bestHit.pen;
      res.normWorldX = nwx;
      res.normWorldY = nwy;
      res.normWorldZ = nwz;
      res.scatX = sx;
      res.scatY = sy;
      res.scatZ = sz;
      res.isLip = bestHit.isLip;
      res.isOuter = bestHit.isLip;
      res.ly = ly * this.obstacleScale;
      res.r = Math.hypot(lx, lz) * this.obstacleScale;
      return res;
    }

    // 未碰撞任何骨节与掌心（位于指缝开放空间）-> 顺畅下落穿透！
    return null;
  }

  /* ----------------------------------------------------
   * 4.6 局部解析碰撞检测求解器
   * ---------------------------------------------------- */
  _solveGlassCollision(worldPos, radius) {
    if (!this.glassEnabled) return null;

    // 转换至金樽本地坐标并按物体缩放归一化到基准尺度
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const invS = 1.0 / (this.obstacleScale || 1.0);
    const lx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * invS;
    const ly = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * invS;
    const lz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * invS;
    const scaledR = radius * invS;

    const r = Math.hypot(lx, lz);

    if (ly < -100 - scaledR || ly > 58 + scaledR) return null;
    if (r > 48 + scaledR) return null;

    const urx = r > 1e-4 ? lx / r : 1;
    const urz = r > 1e-4 ? lz / r : 0;

    let bestHit = null;

    // 1. 实心穹顶与杯唇导流表面 (Solid Deflector Crown & Lip Crest)
    // 覆盖整个杯顶与杯腹上部 (r <= 43.5 + scaledR, ly >= 15.0)，消除内凹陷阱，全部赋予外向导流梯度
    if (r <= 43.5 + scaledR && ly >= 15.0) {
      const normR = Math.min(1.0, r / 41.25);
      const expectedY = 51.5 + 1.3 * (1.0 - normR * normR);
      const topSurfaceY = expectedY + scaledR;

      if (ly <= topSurfaceY) {
        const pen = (topSurfaceY - ly) * this.obstacleScale;
        const isLip = r >= 34.0;

        let nR = isLip ? 0.82 : (0.42 + 0.40 * normR);
        let nY = isLip ? 0.57 : 0.78;
        const nLen = Math.hypot(nR, nY);
        nR /= nLen;
        nY /= nLen;

        bestHit = {
          pen: pen,
          nLocX: nR * urx,
          nLocY: nY,
          nLocZ: nR * urz,
          isLip: isLip,
          isOuter: false,
          ly: ly * this.obstacleScale,
          r: r * this.obstacleScale
        };
      }
    }

    // 2. 外碗侧壁、杯挺与底座 (Outer Flank, Stem & Base)
    if (!bestHit && ly >= -98 - scaledR && r >= 3.5 - scaledR) {
      let maxPen = 0;
      for (let i = 0; i < this._outerSegments.length; i++) {
        const seg = this._outerSegments[i];
        let t = ((r - seg.ax) * seg.dx + (ly - seg.ay) * seg.dy) * seg.invLenSq;
        t = Math.max(0, Math.min(1, t));

        const cx = seg.ax + t * seg.dx;
        const cy = seg.ay + t * seg.dy;

        const sDist = (r - cx) * seg.nx + (ly - cy) * seg.ny;
        if (sDist < scaledR && sDist > -38.0) {
          const penLocal = scaledR - sDist;
          if (penLocal > maxPen) {
            maxPen = penLocal;
            bestHit = {
              pen: penLocal * this.obstacleScale,
              nLocX: seg.nx * urx,
              nLocY: seg.ny,
              nLocZ: seg.nx * urz,
              isLip: false,
              isOuter: true,
              ly: ly * this.obstacleScale,
              r: r * this.obstacleScale
            };
          }
        }
      }
    }

    if (bestHit) {
      const m = this.glassRotMat.elements;
      const nx = bestHit.nLocX, ny = bestHit.nLocY, nz = bestHit.nLocZ;
      let nwx = m[0] * nx + m[3] * ny + m[6] * nz;
      let nwy = m[1] * nx + m[4] * ny + m[7] * nz;
      let nwz = m[2] * nx + m[5] * ny + m[8] * nz;
      const nwLen = Math.hypot(nwx, nwy, nwz);
      if (nwLen > 1e-4) { nwx /= nwLen; nwy /= nwLen; nwz /= nwLen; }

      // 从中心对称轴向外的水平径向矢量（世界空间）
      const rx = m[0] * urx + m[6] * urz;
      const ry = m[1] * urx + m[7] * urz;
      const rz = m[2] * urx + m[8] * urz;

      // 投影至曲面接触切平面：得到向曲面四周自然发散洒落的切向单位矢量
      const dotRN = rx * nwx + ry * nwy + rz * nwz;
      let sx = rx - dotRN * nwx;
      let sy = ry - dotRN * nwy;
      let sz = rz - dotRN * nwz;
      const sLen = Math.hypot(sx, sy, sz);
      if (sLen > 1e-4) {
        sx /= sLen;
        sy /= sLen;
        sz /= sLen;
      } else {
        sx = m[6];
        sy = m[7];
        sz = m[8];
      }

      const res = this._hitResult;
      res.pen = bestHit.pen;
      res.normWorldX = nwx;
      res.normWorldY = nwy;
      res.normWorldZ = nwz;
      res.scatX = sx;
      res.scatY = sy;
      res.scatZ = sz;
      res.isLip = bestHit.isLip;
      res.isOuter = bestHit.isOuter;
      res.ly = bestHit.ly;
      res.r = bestHit.r;
      return res;
    }

    return null;
  }

  /* ----------------------------------------------------
   * 5. 粒子混色与自适应黑白主题生成器
   * ---------------------------------------------------- */
  _getGoldSandColor() {
    const isA = Math.random() < this.ratioA;
    const baseC = isA ? this.colorA : this.colorB;
    let cr = baseC.r;
    let cg = baseC.g;
    let cb = baseC.b;

    if (this.theme === 'light') {
      const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
      if (lum > 0.85) {
        cr = 0.25; cg = 0.30; cb = 0.38;
      }
    } else {
      const jitter = (Math.random() - 0.5) * 0.08;
      cr = Math.max(0, Math.min(1, cr + jitter));
      cg = Math.max(0, Math.min(1, cg + jitter));
      cb = Math.max(0, Math.min(1, cb + jitter));
    }
    return { r: cr, g: cg, b: cb };
  }

  /* ----------------------------------------------------
   * 6. 高密流线（LineSegments）与闪光金珠（Points）双通道流沙系统
   * ---------------------------------------------------- */
  _initParticleSystem() {
    // 1. 光珠拖影流线系统（LineSegments：还原第一版标志性流线水幕）
    this.lineGeom = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(this.totalParticles * 6);
    this.lineColors = new Float32Array(this.totalParticles * 6);
    this.lineGeom.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.lineGeom.setAttribute('color', new THREE.BufferAttribute(this.lineColors, 3));

    this.lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.lineMesh = new THREE.LineSegments(this.lineGeom, this.lineMat);
    this.group.add(this.lineMesh);

    // 2. 头部闪烁高光点系统（Points）
    this.ptGeom = new THREE.BufferGeometry();
    this.ptPositions = new Float32Array(this.totalParticles * 3);
    this.ptColors = new Float32Array(this.totalParticles * 3);
    this.ptGeom.setAttribute('position', new THREE.BufferAttribute(this.ptPositions, 3));
    this.ptGeom.setAttribute('color', new THREE.BufferAttribute(this.ptColors, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,238,170,0.95)');
    grad.addColorStop(0.5, 'rgba(255,205,70,0.4)');
    grad.addColorStop(1, 'rgba(255,180,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 8); ctx.lineTo(32, 56);
    ctx.moveTo(8, 32); ctx.lineTo(56, 32);
    ctx.stroke();

    const particleTexture = new THREE.CanvasTexture(canvas);
    this.ptMat = new THREE.PointsMaterial({
      size: 4.2,
      vertexColors: true,
      map: particleTexture,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.pointMesh = new THREE.Points(this.ptGeom, this.ptMat);
    this.group.add(this.pointMesh);

    // 3. 构建 4200 常驻闭环粒子 + 1800 动态迸发粒子
    this.particles = [];
    for (let i = 0; i < this.totalParticles; i++) {
      const isBase = i < this.baseStreamCount;
      const p = {
        active: isBase,
        isBase: isBase,
        x: 0, y: 0, z: 0,
        prevX: 0, prevY: 0, prevZ: 0,
        vx: 0, vy: 0, vz: 0,
        r: 1.0, g: 0.85, b: 0.25,
        life: 0,
        maxLife: 3.5,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 5 + Math.random() * 8
      };
      if (isBase) {
        this._respawnBaseParticle(p, true);
      }
      this.particles.push(p);
    }
  }

  _respawnBaseParticle(p, spreadVertical = false, dtExcess = 0) {
    if (this.emitterType === 'moon') {
      const halfW = Math.min(40, this.streamWidth * 0.45);
      const spawnX = (Math.random() - 0.5) * (halfW * 2);
      const dy = Math.sqrt(Math.max(0, 42 * 42 - spawnX * spawnX));
      p.x = spawnX;
      p.y = 200 - dy + (Math.random() - 0.5) * 4;
      p.z = (Math.random() - 0.5) * 10;
    } else {
      const halfW = this.streamWidth * 0.52;
      const r = Math.sqrt(Math.random()) * halfW;
      const theta = Math.random() * Math.PI * 2;
      p.x = Math.cos(theta) * r;
      p.y = 225 + (Math.random() - 0.5) * 15;
      p.z = Math.sin(theta) * (r * 0.45);
    }

    p.vx = (Math.random() - 0.5) * 2;
    p.vy = -(120 + Math.random() * 100) * this.fallSpeedFactor;
    p.vz = (Math.random() - 0.5) * 2;

    if (spreadVertical) {
      p.y -= Math.random() * 660; // 启动瞬间全垂直高度均匀铺满瀑布
    } else if (dtExcess > 0) {
      p.y += p.vy * dtExcess; // 子帧泊松回顶补偿：平滑垂直密度分布
    }

    p.prevX = p.x;
    p.prevY = p.y - p.vy * 0.016;
    p.prevZ = p.z;

    const col = this._getGoldSandColor();
    p.r = col.r; p.g = col.g; p.b = col.b;
    p.active = true;
    p.life = 0;
    p.maxLife = 3.8;
    p.surfaceContactTime = 0;
  }

  emitParticle(x, y, z, vx, vy, vz, color, size = 3.8, maxLife = 2.0) {
    for (let i = this.baseStreamCount; i < this.totalParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.isBase = false;
        p.x = x; p.y = y; p.z = z;
        p.prevX = x - vx * 0.016;
        p.prevY = y - vy * 0.016;
        p.prevZ = z - vz * 0.016;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.r = color.r; p.g = color.g; p.b = color.b;
        p.life = 0;
        p.maxLife = maxLife;
        return;
      }
    }
  }

  /* ----------------------------------------------------
   * 7. 生成下落实体（尺寸分流、立体三维翻滚）
   * ---------------------------------------------------- */
  spawnEntity() {
    if (this.entities.length >= this.maxEntities) {
      // FIFO 回收：寻找存活时间最长且处于最底部的旧实体加速消融，确保上游永不关阀断流
      let oldestIdx = -1;
      let maxScore = -1;
      for (let i = 0; i < this.entities.length; i++) {
        const ent = this.entities[i];
        const score = ent.timeAlive + (200 - ent.mesh.position.y) * 0.1;
        if (score > maxScore) {
          maxScore = score;
          oldestIdx = i;
        }
      }
      if (oldestIdx >= 0) {
        const target = this.entities[oldestIdx];
        target.dissolving = true;
        target.dissolveProgress = Math.max(target.dissolveProgress, 0.7);
      }
    }

    const totalWeight = this.ratios.coin + this.ratios.pearl + this.ratios.gem;
    if (totalWeight <= 0) return;

    const pCoin = this.ratios.coin / totalWeight;
    const pPearl = this.ratios.pearl / totalWeight;

    const rand = Math.random();
    let type = 'coin';
    let mesh;
    let mass = 1.0;
    let drag = 0.992;
    let baseScale = 1.0;

    if (rand < pCoin) {
      type = 'coin';
      mesh = new THREE.Mesh(this.coinGeom, this.coinMat);
      mass = 1.25;
      drag = 0.988;
      baseScale = (0.96 + Math.random() * 0.12) * (this.coinScaleFactor || 1.0);
    } else if (rand < pCoin + pPearl) {
      type = 'pearl';
      mesh = new THREE.Mesh(this.pearlGeom, this.pearlMat);
      mass = 1.6;
      drag = 0.996;
      const pRand = Math.random();
      if (pRand < 0.25) baseScale = 1.15;      // 大主珠: 直径 ~11.5 (约金币 1/3，视觉焦点)
      else if (pRand < 0.80) baseScale = 0.95; // 标准珠: 直径 ~9.5 (主力标准珠)
      else baseScale = 0.72;                   // 伴生小珠: 直径 ~7.2 (轻盈伴生小珠)
    } else {
      // 宝石：红宝石与祖母绿各占一半
      const isEmerald = Math.random() < 0.5;
      if (isEmerald) {
        type = 'emerald';
        mesh = new THREE.Mesh(this.emeraldGeom, this.emeraldMat);
        mass = 1.4;
        drag = 0.990;
        const gRand = Math.random();
        if (gRand < 0.25) baseScale = 1.35;
        else if (gRand < 0.75) baseScale = 1.0;
        else baseScale = 0.72;
      } else {
        type = 'ruby';
        mesh = new THREE.Mesh(this.rubyGeom, this.rubyMat);
        mass = 1.4;
        drag = 0.990;
        const rRand = Math.random();
        if (rRand < 0.25) baseScale = 1.32;
        else if (rRand < 0.75) baseScale = 1.0;
        else baseScale = 0.72;
      }
    }

    mesh.scale.setScalar(baseScale);

    // 宏观实体横向落点受流沙整体宽度联动控制
    let spawnX, spawnY, spawnZ;
    if (this.emitterType === 'moon') {
      const halfW = Math.min(40, this.streamWidth * 0.45);
      spawnX = (Math.random() - 0.5) * (halfW * 2);
      const dy = Math.sqrt(Math.max(0, 42 * 42 - spawnX * spawnX));
      spawnY = 200 - dy - 2;
      spawnZ = (Math.random() - 0.5) * 8;
    } else {
      const halfW = this.streamWidth * 0.5;
      const r = Math.sqrt(Math.random()) * halfW;
      const theta = Math.random() * Math.PI * 2;
      spawnX = Math.cos(theta) * r;
      spawnZ = Math.sin(theta) * (r * 0.42);
      spawnY = 240 + Math.random() * 20;
    }

    mesh.position.set(spawnX, spawnY, spawnZ);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.castShadow = true;

    this.group.add(mesh);

    let rotSpeed;
    if (type === 'coin') {
      const flipRate = (Math.random() > 0.5 ? 1 : -1) * (2.2 + Math.random() * 1.6);
      const flipAngle = Math.random() * Math.PI;
      rotSpeed = {
        x: Math.cos(flipAngle) * flipRate,
        y: (Math.random() - 0.5) * 0.12,
        z: Math.sin(flipAngle) * flipRate
      };
    } else if (type === 'pearl') {
      rotSpeed = {
        x: (Math.random() - 0.5) * 0.6,
        y: 0,
        z: (Math.random() - 0.5) * 0.6
      };
    } else {
      // 宝石三维全向稳健慢翻转，充分折射多面火彩
      rotSpeed = {
        x: (Math.random() - 0.5) * 2.2,
        y: (Math.random() - 0.5) * 1.2,
        z: (Math.random() - 0.5) * 2.2
      };
    }

    this.entities.push({
      mesh,
      type,
      mass,
      drag,
      baseScale,
      vx: (Math.random() - 0.5) * 4,
      vy: -(120 + Math.random() * 50) * this.fallSpeedFactor,
      vz: (Math.random() - 0.5) * 3,
      rotSpeed,
      scale: 1.0,
      dissolving: false,
      dissolveProgress: 0,
      timeAlive: 0
    });
  }

  /* ----------------------------------------------------
   * 8. 核心更新（时间流速与时停控制）
   * ---------------------------------------------------- */
  update(rawDt) {
    if (!this.enabled || this.isPaused) return;

    // 注入时间流速 (Time Scale)
    const dt = rawDt * this.timeScale;
    if (dt <= 0) return;

    // 自转动效
    if (this.autoRotate) {
      this.glassYaw += this.rotSpeed * dt * 45;
      this._updateGlassTransform();
    }

    // 月晕呼吸动效
    if (this.moonHalo && this.moonGroup && this.moonGroup.visible) {
      this.moonTime = (this.moonTime || 0) + dt;
      const s = 1.0 + Math.sin(this.moonTime * 2.0) * 0.04;
      this.moonHalo.scale.set(s, s, 1);
    }

    // 假体积圣光呼吸动效
    if (this.beamMat) {
      this.beamTime = (this.beamTime || 0) + dt;
      this.beamMat.opacity = 0.040 + 0.016 * Math.sin(this.beamTime * 1.6);
    }

    // 1. 定期注生宏观实体
    if (this.jewelsEnabled) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= 1 / this.spawnRate) {
        this.spawnTimer = 0;
        this.spawnEntity();
      }
    }

    // 2. 更新所有下落实体（大件金币、宝石、珍珠）
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.timeAlive += dt;

      e.vy -= this.gravity * e.mass * dt;
      e.vx *= e.drag;
      e.vy *= e.drag;
      e.vz *= e.drag;

      e.mesh.position.x += e.vx * dt;
      e.mesh.position.y += e.vy * dt;
      e.mesh.position.z += e.vz * dt;

      const curPos = e.mesh.position;
      let onSurface = false;

      // 3D 实心导流障碍物碰撞与柔性自然“散开、撒开”动力学
      const colRadius = e.type === 'coin' ? 13.5 * e.baseScale : (e.type === 'pearl' ? 5.0 * e.baseScale : 11.5 * e.baseScale);
      if (this.glassEnabled) {
        const hit = this._solveObstacleCollision(curPos, colRadius);
        if (hit) {
          onSurface = true;

          // 贴壁纯滚动力学：计算切向纯滚动轴 (v × n) 驱动沿曲面物理翻滚
          _tempVel.set(e.vx, e.vy, e.vz);
          _tempNorm.set(hit.normWorldX, hit.normWorldY, hit.normWorldZ);
          _rollAxis.crossVectors(_tempVel, _tempNorm);
          const rollLen = _rollAxis.length();
          if (rollLen > 1e-4) {
            _rollAxis.multiplyScalar(1 / rollLen);
            const rollSpeed = _tempVel.length();
            e.mesh.rotateOnWorldAxis(_rollAxis, rollSpeed * 0.08 * dt);
          }
          // 1. 位置外科修正（沿接触法线推挤出表面，避免穿模）
          curPos.x += hit.normWorldX * hit.pen;
          curPos.y += hit.normWorldY * hit.pen;
          curPos.z += hit.normWorldZ * hit.pen;

          // 2. 速度分解为切向摩擦分量与柔性吸能法向减震
          const vn = e.vx * hit.normWorldX + e.vy * hit.normWorldY + e.vz * hit.normWorldZ;
          if (vn < 0) {
            const vtx = e.vx - hit.normWorldX * vn;
            const vty = e.vy - hit.normWorldY * vn;
            const vtz = e.vz - hit.normWorldZ * vn;

            // 柔性减震着陆：吸收绝大部分法向冲击（零/微弱弹跳）
            const friction = 0.04;
            const bounceVn = -vn * this.glassCushion;

            // 核心力学突破：切向径向发散冲量（触碰后向四周舒展撒开、散开）
            const scatterSpeed = Math.abs(vn) * 0.32;

            e.vx = vtx * (1 - friction) + hit.normWorldX * bounceVn + hit.scatX * scatterSpeed;
            e.vy = vty * (1 - friction) + hit.normWorldY * bounceVn + hit.scatY * scatterSpeed;
            e.vz = vtz * (1 - friction) + hit.normWorldZ * bounceVn + hit.scatZ * scatterSpeed;

            // 沿曲面滚动角阻尼：杜绝刚性乱转，贴合曲面自然滚滑
            e.rotSpeed.x *= 0.982;
            e.rotSpeed.y *= 0.982;
            e.rotSpeed.z *= 0.982;

            // 撞击微观飞溅金沙（Sand Splash Dispersal）：交代撞击能量耗散与水花感
            if (Math.abs(vn) > 14) {
              const sparkCount = e.type === 'coin' ? 4 : (e.type === 'pearl' ? 2 : 3);
              for (let s = 0; s < sparkCount; s++) {
                const sandCol = this._getGoldSandColor();
                const sSpread = (Math.random() - 0.5) * 8;
                const sSpeed = (16 + Math.random() * 22) * Math.sqrt(this.fallSpeedFactor);
                this.emitParticle(
                  curPos.x + (Math.random() - 0.5) * 3,
                  curPos.y + (Math.random() - 0.5) * 3,
                  curPos.z + (Math.random() - 0.5) * 3,
                  hit.scatX * sSpeed + hit.normWorldX * (10 + Math.random() * 15) + sSpread,
                  hit.scatY * sSpeed + hit.normWorldY * (10 + Math.random() * 15) + (Math.random() - 0.5) * 6,
                  hit.scatZ * sSpeed + hit.normWorldZ * (10 + Math.random() * 15) + sSpread,
                  sandCol,
                  2.8 + Math.random() * 1.8,
                  1.2
                );
              }
            }
          }

          // 3. 切向重力驱动 + 杯沿离心掀起涌浪（Surge Crest）
          const dotGN = -this.gravity * hit.normWorldY;
          const gtX = -dotGN * hit.normWorldX;
          const gtY = -this.gravity - dotGN * hit.normWorldY;
          const gtZ = -dotGN * hit.normWorldZ;

          let surgeY = 0;
          let surgeOut = 0;
          const obsScale = this.obstacleScale || 1.0;
          if (hit.isLip || (this.obstacleType === 'glass' && hit.ly >= 38 * obsScale && hit.ly <= 52 * obsScale)) {
            surgeY = 38 * Math.sqrt(this.fallSpeedFactor);
            surgeOut = 55 * Math.sqrt(this.fallSpeedFactor) * Math.sqrt(obsScale);
          }

          e.vx += (gtX * 0.90 + hit.scatX * (36 + surgeOut)) * dt;
          e.vy += (gtY * 0.90 + hit.scatY * 36 + surgeY) * dt;
          e.vz += (gtZ * 0.90 + hit.scatZ * (36 + surgeOut)) * dt;

          // 4. 有限驻留与安全脱离（吞吐守恒，杜绝断流停发与死锁）
          e.dwellTime = (e.dwellTime || 0) + dt;
          if (e.dwellTime > 1.2) {
            e.vx += hit.scatX * 60 * dt;
            e.vz += hit.scatZ * 60 * dt;
            e.vy -= 90 * dt;
          }

          // 5. 防滞留看门狗：防止在任何微观极值点形成极低速停滞
          const curSpeed = Math.hypot(e.vx, e.vy, e.vz);
          if (curSpeed < 14) {
            e.stuckTimer = (e.stuckTimer || 0) + dt;
            if (e.stuckTimer > 0.6) {
              e.vx += hit.scatX * 35 + (Math.random() - 0.5) * 15;
              e.vy -= 45;
              e.vz += hit.scatZ * 35 + (Math.random() - 0.5) * 15;
              e.stuckTimer = 0;
            }
          } else {
            e.stuckTimer = Math.max(0, (e.stuckTimer || 0) - dt * 2);
          }
        } else {
          e.dwellTime = 0;
        }
      }

      // 空中自由翻滚（未接触曲面时维持自然三维自转）
      if (!onSurface) {
        e.rotSpeed.x *= 0.985;
        e.rotSpeed.y *= 0.985;
        e.rotSpeed.z *= 0.985;
        e.mesh.rotation.x += e.rotSpeed.x * dt;
        e.mesh.rotation.y += e.rotSpeed.y * dt;
        e.mesh.rotation.z += e.rotSpeed.z * dt;
      }

      // 伴生金沙尾迹（节流降频 + 速度协同，彻底消除半空滞留大沙团）
      e.trailTick = (e.trailTick || 0) + 1;
      if (e.trailTick % 4 === 0) {
        let tx, ty, tz;
        if (e.type === 'coin') {
          ty = curPos.y + (16.5 + Math.random() * 5) * e.baseScale;
          tx = curPos.x + (Math.random() - 0.5) * 6 * e.baseScale;
          tz = curPos.z + (Math.random() - 0.5) * 6 * e.baseScale;
        } else {
          const objH = e.type === 'pearl' ? 7 : 11;
          ty = curPos.y + objH + Math.random() * 4;
          tx = curPos.x + (Math.random() - 0.5) * 4;
          tz = curPos.z + (Math.random() - 0.5) * 4;
        }

        // 垂直初速度跟随主瀑布下坠，绝不在空中悬浮滞留成团
        const pvy = e.vy * 0.75 - (35 + Math.random() * 35);
        const sandCol = this._getGoldSandColor();
        this.emitParticle(
          tx, ty, tz,
          e.vx * 0.25 + (Math.random() - 0.5) * 3,
          pvy,
          e.vz * 0.25 + (Math.random() - 0.5) * 3,
          sandCol,
          2.6 + Math.random() * 1.4,
          0.6 // 寿命缩短至 0.6 秒，迅速自然融入瀑布淡出
        );
      }

      // 消融过渡
      if (curPos.y <= this.dissolveY && !e.dissolving) {
        e.dissolving = true;
      }

      if (e.dissolving) {
        e.dissolveProgress += dt * 1.6;
        const factor = Math.max(0, 1.0 - e.dissolveProgress);
        e.scale = factor;
        e.mesh.scale.setScalar(factor * e.baseScale);

        const burstCount = 1;
        const burstSpread = (1 - factor) * (this.streamWidth * 0.12 + 4);
        for (let b = 0; b < burstCount; b++) {
          const sandCol = this._getGoldSandColor();
          this.emitParticle(
            curPos.x + (Math.random() - 0.5) * burstSpread,
            curPos.y + (Math.random() - 0.5) * burstSpread,
            curPos.z + (Math.random() - 0.5) * burstSpread,
            e.vx * 0.3 + (Math.random() - 0.5) * 10,
            -Math.abs(e.vy * 0.6) - (20 + Math.random() * 25), // 严格向下定向迸发
            e.vz * 0.3 + (Math.random() - 0.5) * 10,
            sandCol,
            3.2 + Math.random() * 2.0,
            1.2
          );
        }

        if (e.dissolveProgress >= 1.0 || curPos.y <= this.bottomY) {
          this.group.remove(e.mesh);
          this.entities.splice(i, 1);
          continue;
        }
      }

      if (curPos.y <= this.bottomY - 80) {
        this.group.remove(e.mesh);
        this.entities.splice(i, 1);
      }
    }

    // 4. 更新微粒系统（双通道：LineSegments 流线拖影 + Points 闪烁光珠）
    const linePos = this.linePositions;
    const lineCol = this.lineColors;
    const ptPos = this.ptPositions;
    const ptCol = this.ptColors;

    let activeCount = 0;

    for (let i = 0; i < this.totalParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += dt;

      // 寿命与下边界检测：常驻流沙严禁超时早死，仅当穿过下边界时平稳回顶循环
      if (p.isBase) {
        if (p.y <= this.bottomY) {
          const overshoot = Math.max(0, this.bottomY - p.y);
          const dtExcess = Math.min(0.04, overshoot / Math.max(10, Math.abs(p.vy)));
          this._respawnBaseParticle(p, false, dtExcess);
        }
      } else {
        if (p.life >= p.maxLife || p.y <= this.bottomY) {
          p.active = false;
          continue;
        }
      }

      // 记录前一帧位置（用于 LineSegments 绘制速度流线光线）
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;

      // 1. 重力加速度积分与终端速度限制 (消除速度无限发散与稀疏)
      p.vy -= (this.gravity * 0.85) * dt;
      const maxFallSpeed = 280 * this.fallSpeedFactor;
      if (p.vy < -maxFallSpeed) p.vy = -maxFallSpeed;

      // 2. 预测位移步进与空气阻尼
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.985;
      p.vz *= 0.985;

      // 3. 3D 阻挡物自适应碰撞检测与投影约束
      const obsScale = this.obstacleScale || 1.0;
      if (this.glassEnabled && p.y >= this.glassPosY - 240 * obsScale && p.y <= this.glassPosY + 190 * obsScale) {
        const hit = this._solveObstacleCollision(p, 2.0);
        if (hit) {
          p.surfaceContactTime = (p.surfaceContactTime || 0) + dt;

          // 推出穿模深度：直接投影回表面
          p.x += hit.normWorldX * hit.pen;
          p.y += hit.normWorldY * hit.pen;
          p.z += hit.normWorldZ * hit.pen;

          // 核心：严格消除向内部的法向速度分量，杜绝后续帧再次陷入物体
          const vn = p.vx * hit.normWorldX + p.vy * hit.normWorldY + p.vz * hit.normWorldZ;
          if (vn < 0) {
            p.vx -= hit.normWorldX * vn;
            p.vy -= hit.normWorldY * vn;
            p.vz -= hit.normWorldZ * vn;
          }

          // 曲面切向重力驱动
          const dotGN = -(this.gravity * 0.85) * hit.normWorldY;
          const gtX = -dotGN * hit.normWorldX;
          const gtY = -(this.gravity * 0.85) - dotGN * hit.normWorldY;
          const gtZ = -dotGN * hit.normWorldZ;

          // 边缘与指尖掀起水幕涌浪
          let surgeY = 0;
          let surgeOut = 0;
          if (hit.isLip || (this.obstacleType === 'glass' && hit.ly >= 36 * obsScale && hit.ly <= 53 * obsScale)) {
            surgeY = 32 * Math.sqrt(this.fallSpeedFactor);
            surgeOut = 50 * Math.sqrt(this.fallSpeedFactor) * Math.sqrt(obsScale);
          }

          p.vx = p.vx * 0.82 + (gtX * 0.90 + hit.scatX * (42 + surgeOut)) * dt;
          p.vy = p.vy * 0.82 + (gtY * 0.90 + hit.scatY * 42 + surgeY) * dt;
          p.vz = p.vz * 0.82 + (gtZ * 0.90 + hit.scatZ * (42 + surgeOut)) * dt;

          // 核心质感与零穿模防线：维持 24~28 px/s 微观慢速流淌，防死锁断流且绝不暴冲
          const tangSpeedSq = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz;
          const minSlipSpeed = 26.0 * Math.sqrt(this.fallSpeedFactor);
          if (tangSpeedSq < minSlipSpeed * minSlipSpeed) {
            const slipDeficit = Math.max(0.4, 1.0 - Math.sqrt(tangSpeedSq) / minSlipSpeed);
            p.vx += hit.scatX * minSlipSpeed * slipDeficit * 5.0 * dt;
            p.vy += hit.scatY * minSlipSpeed * slipDeficit * 5.0 * dt;
            p.vz += hit.scatZ * minSlipSpeed * slipDeficit * 5.0 * dt;

            // 严守零穿模铁律：向内部法向分量严格二次消除，确保 100% 贴附曲面外层
            const remVn = p.vx * hit.normWorldX + p.vy * hit.normWorldY + p.vz * hit.normWorldZ;
            if (remVn < 0) {
              p.vx -= hit.normWorldX * remVn;
              p.vy -= hit.normWorldY * remVn;
              p.vz -= hit.normWorldZ * remVn;
            }
          }

          // 停留超时溢流与绝对质量守恒兜底闭环 (Sponge Overflow Safeguard)
          if (p.surfaceContactTime > 2.5) {
            p.vx += hit.scatX * 55.0 * dt;
            p.vy += hit.scatY * 55.0 * dt;
            p.vz += hit.scatZ * 55.0 * dt;
            const overVn = p.vx * hit.normWorldX + p.vy * hit.normWorldY + p.vz * hit.normWorldZ;
            if (overVn < 0) {
              p.vx -= hit.normWorldX * overVn;
              p.vy -= hit.normWorldY * overVn;
              p.vz -= hit.normWorldZ * overVn;
            }
          }
          if (p.surfaceContactTime > 4.5 && p.isBase) {
            this._respawnBaseParticle(p, false, 0);
            p.surfaceContactTime = 0;
          }
        } else {
          p.surfaceContactTime = 0;
        }
      } else {
        p.surfaceContactTime = 0;
      }

      // 写入头部闪烁高光点缓冲
      const ptIdx = activeCount * 3;
      ptPos[ptIdx]     = p.x;
      ptPos[ptIdx + 1] = p.y;
      ptPos[ptIdx + 2] = p.z;

      // 写入流线短线缓冲：起点 (prevX, prevY, prevZ) -> 终点 (x, y, z)
      const lIdx = activeCount * 6;
      linePos[lIdx]     = p.prevX;
      linePos[lIdx + 1] = p.prevY;
      linePos[lIdx + 2] = p.prevZ;
      linePos[lIdx + 3] = p.x;
      linePos[lIdx + 4] = p.y;
      linePos[lIdx + 5] = p.z;

      // 闪烁波动与透明度淡出
      const wave = Math.sin(p.life * p.twinkleSpeed + p.twinklePhase);
      const sparkle = 0.75 + 0.25 * wave;
      let alpha = 1.0;
      if (!p.isBase) {
        const progress = p.life / p.maxLife;
        alpha = progress > 0.65 ? (1.0 - progress) / 0.35 : 1.0;
      }

      const cr = p.r * sparkle * alpha;
      const cg = p.g * sparkle * alpha;
      const cb = p.b * sparkle * alpha;

      // 短线尾部 35% 亮度淡入，头部 95% 饱满金光
      lineCol[lIdx]     = cr * 0.35;
      lineCol[lIdx + 1] = cg * 0.35;
      lineCol[lIdx + 2] = cb * 0.35;
      lineCol[lIdx + 3] = cr * 0.95;
      lineCol[lIdx + 4] = cg * 0.95;
      lineCol[lIdx + 5] = cb * 0.95;

      // 头部光珠 125% 炫目光点
      ptCol[ptIdx]     = cr * 1.25;
      ptCol[ptIdx + 1] = cg * 1.25;
      ptCol[ptIdx + 2] = cb * 1.25;

      activeCount++;
    }

    if (!this.sandEnabled) {
      activeCount = 0;
    }

    this.activeParticleCount = activeCount;
    this.lineGeom.setDrawRange(0, activeCount * 2);
    this.ptGeom.setDrawRange(0, activeCount);
    this.lineGeom.attributes.position.needsUpdate = true;
    this.lineGeom.attributes.color.needsUpdate = true;
    this.ptGeom.attributes.position.needsUpdate = true;
    this.ptGeom.attributes.color.needsUpdate = true;
  }

  /* ----------------------------------------------------
   * 9. 状态控制 API
   * ---------------------------------------------------- */
  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  setTimeScale(scale) {
    this.timeScale = Math.max(0.05, Math.min(3.0, scale));
  }

  setFallSpeedFactor(factor) {
    this.fallSpeedFactor = Math.max(0.3, Math.min(2.5, factor));
    this.gravity = this.baseGravity * this.fallSpeedFactor;
  }

  setStreamWidth(w) {
    this.streamWidth = Math.max(30, Math.min(300, w));
  }

  setRatios(coin, pearl, gem) {
    this.ratios.coin = Math.max(0, coin);
    this.ratios.pearl = Math.max(0, pearl);
    this.ratios.gem = Math.max(0, gem);
  }

  setEmitterType(type) {
    this.emitterType = (type === 'sky' || type === 'beam') ? type : 'moon';
    if (this.moonGroup) {
      this.moonGroup.visible = (this.emitterType === 'moon');
    }
  }

  setMoonColor(hex) {
    this.moonColor = hex;
    const col = new THREE.Color(hex);
    if (this.moonMesh) this.moonMesh.material.color.copy(col);
    if (this.moonHalo) this.moonHalo.material.color.copy(col);
  }

  setSandEnabled(enabled) {
    this.sandEnabled = !!enabled;
    if (!this.sandEnabled) {
      this.activeParticleCount = 0;
      this.lineGeom.setDrawRange(0, 0);
      this.ptGeom.setDrawRange(0, 0);
    }
  }

  setJewelsEnabled(enabled) {
    this.jewelsEnabled = !!enabled;
    if (!this.jewelsEnabled) {
      for (const e of this.entities) {
        this.group.remove(e.mesh);
      }
      this.entities = [];
    }
  }

  setDualColors(hexA, hexB, ratio = 0.70) {
    this.colorA.set(hexA);
    this.colorB.set(hexB);
    this.ratioA = ratio;
  }

  setTheme(theme) {
    this.theme = theme;
    const isLight = (theme === 'light');
    if (this.lineMat) {
      this.lineMat.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.lineMat.opacity = isLight ? 0.88 : 0.95;
    }
    if (this.ptMat) {
      this.ptMat.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.ptMat.opacity = isLight ? 0.95 : 0.95;
    }
  }

  setParticleCount(count) {
    const c = Math.max(1000, Math.min(this.totalParticles, count));
    this.baseStreamCount = c;
    this.activeParticleCount = c;
  }

  _updateObstacleMeshVisibility() {
    const show = this.glassEnabled && this.obstacleMeshVisible;
    if (this.glassGroup) this.glassGroup.visible = show && (this.obstacleType === 'glass');
    if (this.handGroup) this.handGroup.visible = show && (this.obstacleType === 'hand');
    if (this.reachingGroup) this.reachingGroup.visible = show && (this.obstacleType === 'reaching');
    if (this.archesGroup) this.archesGroup.visible = show && (this.obstacleType === 'arches');
    if (this.colonnadeGroup) this.colonnadeGroup.visible = show && (this.obstacleType === 'colonnade');
    if (this.hourglassGroup) this.hourglassGroup.visible = show && (this.obstacleType === 'hourglass');
    if (this.classicGlassGroup) this.classicGlassGroup.visible = show && (this.obstacleType === 'wineglass');
    if (this.customMesh) this.customMesh.visible = show && (this.obstacleType === 'custom');
  }

  setObstacleMeshVisible(visible) {
    this.obstacleMeshVisible = !!visible;
    this._updateObstacleMeshVisibility();
  }

  setGlassEnabled(enabled) {
    this.glassEnabled = !!enabled;
    this._updateObstacleMeshVisibility();
    this.dissolveY = this.glassEnabled ? -150 : -80;
  }

  setGravity(g) {
    // 兼容 UI 滑块 0.04 ~ 0.30 映射到真实物理加速度 340 px/s²
    if (g <= 2.0) {
      this.baseGravity = 340 * (g / 0.12);
    } else {
      this.baseGravity = g;
    }
    this.gravity = this.baseGravity * (this.fallSpeedFactor || 1.0);
  }

  setObstacleType(type) {
    if (type === 'classic') type = 'arches';
    this.obstacleType = type;
    this._updateObstacleMeshVisibility();
    this._updateGlassTransform();
  }

  setCoinScale(scaleFactor) {
    const prev = this.coinScaleFactor || 1.0;
    this.coinScaleFactor = Math.max(0.5, Math.min(2.0, scaleFactor));
    const ratio = this.coinScaleFactor / prev;
    for (const e of this.entities) {
      if (e.type === 'coin') {
        e.baseScale *= ratio;
        e.mesh.scale.setScalar((e.scale !== undefined ? e.scale : 1.0) * e.baseScale);
      }
    }
  }

  setObstacleScale(scale) {
    this.obstacleScale = Math.max(0.4, Math.min(2.2, scale));
    this._updateGlassTransform();
  }

  setObstacleTransform(x, y, pitchDeg, yawDeg) {
    if (x !== undefined) this.glassPosX = x;
    if (y !== undefined) this.glassPosY = y;
    if (pitchDeg !== undefined) this.glassPitch = pitchDeg * (Math.PI / 180);
    if (yawDeg !== undefined) this.glassYaw = yawDeg * (Math.PI / 180);
    this._updateGlassTransform();
  }

  setAutoRotate(enabled, speed) {
    this.autoRotate = !!enabled;
    if (speed !== undefined) this.rotSpeed = speed;
  }

  setGlassPosX(x) {
    this.glassPosX = x;
    this._updateGlassTransform();
  }

  setGlassPosY(y) {
    this.glassPosY = y;
    this._updateGlassTransform();
  }

  setGlassPitch(pitchDeg) {
    this.glassPitch = pitchDeg * (Math.PI / 180);
    this._updateGlassTransform();
  }

  setGlassYaw(yawDeg) {
    this.glassYaw = yawDeg * (Math.PI / 180);
    this._updateGlassTransform();
  }

  setGlassCushion(cushion) {
    this.glassCushion = Math.max(0.0, Math.min(0.5, cushion));
  }

  setCustomMesh(mesh) {
    if (this.customMesh) {
      this.group.remove(this.customMesh);
    }
    this.customMesh = mesh;
    if (this.customMesh) {
      this._bakeMeshHeightfield(this.customMesh);
      this.group.add(this.customMesh);
    } else {
      this.meshHeightfield = null;
    }
    this._updateGlassTransform();
    this._updateObstacleMeshVisibility();
  }

  resetObstaclePose() {
    this.glassPosX = 0;
    this.glassPosY = -95;
    this.glassPitch = 0.42;
    this.glassYaw = 0;
    this.glassRoll = -0.04;
    this.obstacleScale = 1.0;
    this._updateGlassTransform();
  }

  // 兼容旧接口
  setGlassMode(mode) {
    if (mode === 'none') {
      this.setGlassEnabled(false);
    } else {
      this.setGlassEnabled(true);
      if (mode === 'schemeA') {
        this.setGlassPitch(24);
      }
    }
  }

  setGlassRestitution(restitution) {
    this.setGlassCushion(restitution);
  }

  reset() {
    for (const e of this.entities) {
      this.group.remove(e.mesh);
    }
    this.entities = [];
    for (let i = 0; i < this.totalParticles; i++) {
      const p = this.particles[i];
      if (i < this.baseStreamCount) {
        this._respawnBaseParticle(p, true);
      } else {
        p.active = false;
      }
    }
    this.activeParticleCount = this.baseStreamCount;
    this.lineGeom.setDrawRange(0, this.baseStreamCount * 2);
    this.ptGeom.setDrawRange(0, this.baseStreamCount);
    this.lineGeom.attributes.position.needsUpdate = true;
    this.ptGeom.attributes.position.needsUpdate = true;
  }

  destroy() {
    this.reset();
    this.scene.remove(this.group);
  }
}
