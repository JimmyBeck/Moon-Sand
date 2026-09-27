/**
 * GoldFallSystem: 复刻《蒙尘之罪》金币、珍珠、宝石下落翻滚并消融过渡为流沙系统
 * 顶级工艺版：
 * 1. 埃及/古典精制金币（Proof Cameo 工艺）：高光镜面底板 + 霜化磨砂浮雕（神像桂冠徽章、罗马文字、120齿防滑边）
 * 2. 丰富且正统的双全立体 3D 宝石切工：立体长方八角倒脊阶梯切（祖母绿） + 伞形倒棱锥尖底钻石切（红宝石）
 * 3. 澳白珍珠薄膜干涉伴彩（Iridescence）与多级尺寸
 * 4. 时间控制系统：时间流速（Time Scale）+ 一键时间停止（Bullet Time Freeze）
 */
import * as THREE from 'three';

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
    this.gravity = 340;      // 基础重力加速度 (最佳自然落体物理常数)

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

    // 3D 碰撞金樽（实心导流障碍物 Solid Deflector Spillway）
    this.glassGroup = new THREE.Group();
    this.glassGroup.name = 'WineGlassObstacle';
    this.group.add(this.glassGroup);

    this.glassEnabled = true;
    this.glassPosY = -95;
    this.glassPitch = 0.42;       // 约 24 度前倾，构成顺畅自排水导流斜坡
    this.glassRoll = -0.04;
    this.glassCushion = 0.04;     // 柔性减震吸能系数（0.04 = 水/流沙质感，微弱缓冲着陆，杜绝刚性弹跳）
    this.dissolveY = -150;        // 允许倾泻出杯口后在下方消融

    this.glassPos = new THREE.Vector3(0, this.glassPosY, 0);
    this.glassEuler = new THREE.Euler(this.glassPitch, 0, this.glassRoll, 'YXZ');
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
    this._initWineGlass();
    this._initParticleSystem();
    this._initLighting();
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

  _updateGlassTransform() {
    this.glassPos.set(0, this.glassPosY, 0);
    this.glassEuler.set(this.glassPitch, 0, this.glassRoll, 'YXZ');
    this.glassQuat.setFromEuler(this.glassEuler);
    this.glassInvQuat.copy(this.glassQuat).invert();
    this.glassRotMat.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.glassQuat));

    this.glassGroup.position.copy(this.glassPos);
    this.glassGroup.rotation.copy(this.glassEuler);
  }

  /* ----------------------------------------------------
   * 4.6 局部解析碰撞检测求解器
   * ---------------------------------------------------- */
  _solveGlassCollision(worldPos, radius) {
    if (!this.glassEnabled) return null;

    // 转换至金樽本地坐标
    const lpX = worldPos.x - this.glassPos.x;
    const lpY = worldPos.y - this.glassPos.y;
    const lpZ = worldPos.z - this.glassPos.z;

    const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
    const ix =  qw * lpX + qy * lpZ - qz * lpY;
    const iy =  qw * lpY + qz * lpX - qx * lpZ;
    const iz =  qw * lpZ + qx * lpY - qy * lpX;
    const iw = -qx * lpX - qy * lpY - qz * lpZ;

    const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    const r = Math.hypot(lx, lz);

    if (ly < -100 - radius || ly > 58 + radius) return null;
    if (r > 48 + radius) return null;

    const urx = r > 1e-4 ? lx / r : 1;
    const urz = r > 1e-4 ? lz / r : 0;

    let bestHit = null;

    // 1. 实心穹顶与杯唇导流表面 (Solid Deflector Crown & Lip Crest)
    // 覆盖整个杯顶区域 (r <= 43.5 + radius)，消除内凹陷阱，全部赋予外向导流梯度
    if (r <= 43.5 + radius && ly >= 35.0) {
      const normR = Math.min(1.0, r / 41.25);
      const expectedY = 51.5 + 1.3 * (1.0 - normR * normR);
      const topSurfaceY = expectedY + radius;

      if (ly <= topSurfaceY && ly >= 40.0 - radius) {
        const pen = topSurfaceY - ly;
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
          ly: ly,
          r: r
        };
      }
    }

    // 2. 外碗侧壁、杯挺与底座 (Outer Flank, Stem & Base)
    if (!bestHit && ly >= -98 - radius && r >= 3.5 - radius) {
      let maxPen = 0;
      for (let i = 0; i < this._outerSegments.length; i++) {
        const seg = this._outerSegments[i];
        let t = ((r - seg.ax) * seg.dx + (ly - seg.ay) * seg.dy) * seg.invLenSq;
        t = Math.max(0, Math.min(1, t));

        const cx = seg.ax + t * seg.dx;
        const cy = seg.ay + t * seg.dy;

        const sDist = (r - cx) * seg.nx + (ly - cy) * seg.ny;
        if (sDist < radius && sDist > -radius * 1.8) {
          const pen = radius - sDist;
          if (pen > maxPen) {
            maxPen = pen;
            bestHit = {
              pen: pen,
              nLocX: seg.nx * urx,
              nLocY: seg.ny,
              nLocZ: seg.nx * urz,
              isLip: false,
              isOuter: true,
              ly: ly,
              r: r
            };
          }
        }
      }
    }

    if (bestHit) {
      const m = this.glassRotMat.elements;
      const nx = bestHit.nLocX, ny = bestHit.nLocY, nz = bestHit.nLocZ;
      const nwx = m[0] * nx + m[3] * ny + m[6] * nz;
      const nwy = m[1] * nx + m[4] * ny + m[7] * nz;
      const nwz = m[2] * nx + m[5] * ny + m[8] * nz;

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
   * 5. 纯金沙色阶生成器
   * ---------------------------------------------------- */
  _getGoldSandColor() {
    const r = Math.random();
    if (r < 0.70) {
      return { r: 1.0, g: 0.82, b: 0.22 };
    } else if (r < 0.88) {
      return { r: 1.0, g: 0.90, b: 0.45 };
    } else {
      return { r: 1.0, g: 0.98, b: 0.85 };
    }
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

  _respawnBaseParticle(p, spreadVertical = false) {
    const halfW = this.streamWidth * 0.52;
    const r = Math.sqrt(Math.random()) * halfW;
    const theta = Math.random() * Math.PI * 2;
    p.x = Math.cos(theta) * r;
    p.y = 225 + (Math.random() - 0.5) * 15;
    p.z = Math.sin(theta) * (r * 0.45);

    if (spreadVertical) {
      p.y -= Math.random() * 660; // 启动瞬间全垂直高度均匀铺满瀑布
    }

    p.prevX = p.x;
    p.prevY = p.y + 3.5;
    p.prevZ = p.z;

    p.vx = (Math.random() - 0.5) * 2;
    p.vy = -(110 + Math.random() * 110);
    p.vz = (Math.random() - 0.5) * 2;

    const col = this._getGoldSandColor();
    p.r = col.r; p.g = col.g; p.b = col.b;
    p.active = true;
    p.life = 0;
    p.maxLife = 3.8;
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
      baseScale = 0.96 + Math.random() * 0.12;
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
    const halfW = this.streamWidth * 0.5;
    const r = Math.sqrt(Math.random()) * halfW;
    const theta = Math.random() * Math.PI * 2;
    const spawnX = Math.cos(theta) * r;
    const spawnZ = Math.sin(theta) * (r * 0.42);
    const spawnY = 240 + Math.random() * 20;

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
      vy: -(45 + Math.random() * 35),
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

    // 假体积圣光呼吸动效
    if (this.beamMat) {
      this.beamTime = (this.beamTime || 0) + dt;
      this.beamMat.opacity = 0.040 + 0.016 * Math.sin(this.beamTime * 1.6);
    }

    // 1. 定期注生宏观实体
    this.spawnTimer += dt;
    if (this.spawnTimer >= 1 / this.spawnRate) {
      this.spawnTimer = 0;
      this.spawnEntity();
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
      const colRadius = e.type === 'coin' ? 13.5 : (e.type === 'pearl' ? 5.0 * e.baseScale : 11.5 * e.baseScale);
      if (this.glassEnabled) {
        const hit = this._solveGlassCollision(curPos, colRadius);
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
                const sSpeed = 16 + Math.random() * 22;
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
          if (hit.isLip || (hit.ly >= 38 && hit.ly <= 52)) {
            surgeY = 38;       // 乘浪掀起弧度
            surgeOut = 55;     // 向外翻卷散开
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

      // 伴生金沙尾迹（彻底外移至实体上方气流尾流区，杜绝穿模）
      const trailCount = e.type === 'coin' ? 3 : 2;
      for (let t = 0; t < trailCount; t++) {
        let tx, ty, tz;
        let pvy;

        if (e.type === 'coin') {
          // 金币半径 15.2，尾流发射点严格置于金币上方 16.5 ~ 22.5 处
          ty = curPos.y + 16.5 + Math.random() * 6;
          tx = curPos.x + (Math.random() - 0.5) * 8;
          tz = curPos.z + (Math.random() - 0.5) * 8;
          // 初速度相对疾速下坠的金币呈现向上被气流甩脱的拖尾感
          pvy = e.vy * 0.12 - (5 + Math.random() * 12);
        } else {
          // 宝石与珍珠上方尾流区
          const objH = e.type === 'pearl' ? 7 : 11;
          ty = curPos.y + objH + Math.random() * 5;
          tx = curPos.x + (Math.random() - 0.5) * 5;
          tz = curPos.z + (Math.random() - 0.5) * 5;
          pvy = e.vy * 0.15 - (6 + Math.random() * 14);
        }

        const sandCol = this._getGoldSandColor();
        this.emitParticle(
          tx, ty, tz,
          e.vx * 0.15 + (Math.random() - 0.5) * 4,
          pvy,
          e.vz * 0.15 + (Math.random() - 0.5) * 4,
          sandCol,
          3.0 + Math.random() * 1.8,
          1.5
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

        const burstCount = 6;
        const burstSpread = (1 - factor) * (this.streamWidth * 0.16 + 5);
        for (let b = 0; b < burstCount; b++) {
          const sandCol = this._getGoldSandColor();
          this.emitParticle(
            curPos.x + (Math.random() - 0.5) * burstSpread,
            curPos.y + (Math.random() - 0.5) * burstSpread,
            curPos.z + (Math.random() - 0.5) * burstSpread,
            e.vx * 0.4 + (Math.random() - 0.5) * 15,
            e.vy * 0.85 - (25 + Math.random() * 35),
            e.vz * 0.4 + (Math.random() - 0.5) * 15,
            sandCol,
            3.6 + Math.random() * 2.8,
            2.2
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

      // 寿命与下边界检测：常驻流沙循环复活，消融迸发粒子消亡回收
      if (p.life >= p.maxLife || p.y <= this.bottomY) {
        if (p.isBase) {
          this._respawnBaseParticle(p, false);
        } else {
          p.active = false;
          continue;
        }
      }

      // 记录前一帧位置（用于 LineSegments 绘制速度流线光线）
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;

      // 重力加速度积分
      p.vy -= (this.gravity * 0.85) * dt;

      // 3D 阻挡物曲面切向导流与杯唇掀浪碰撞
      if (this.glassEnabled && p.y >= this.glassPosY - 110 && p.y <= this.glassPosY + 70) {
        const hit = this._solveGlassCollision(p, 1.8);
        if (hit) {
          // 推出穿模深度
          p.x += hit.normWorldX * hit.pen;
          p.y += hit.normWorldY * hit.pen;
          p.z += hit.normWorldZ * hit.pen;

          // 曲面切向重力驱动
          const dotGN = -(this.gravity * 0.85) * hit.normWorldY;
          const gtX = -dotGN * hit.normWorldX;
          const gtY = -(this.gravity * 0.85) - dotGN * hit.normWorldY;
          const gtZ = -dotGN * hit.normWorldZ;

          // 杯沿掀起水幕涌浪（还原第一版标志性涌起与外翻水幕散开）
          let surgeY = 0;
          let surgeOut = 0;
          if (hit.isLip || (hit.ly >= 36 && hit.ly <= 53)) {
            surgeY = 52;
            surgeOut = 75;
          }

          p.vx = p.vx * 0.86 + (gtX * 0.85 + hit.scatX * (36 + surgeOut)) * dt;
          p.vy = p.vy * 0.86 + (gtY * 0.85 + hit.scatY * 36 + surgeY) * dt;
          p.vz = p.vz * 0.86 + (gtZ * 0.85 + hit.scatZ * (36 + surgeOut)) * dt;
        }
      }

      // 位移积分与速度阻尼
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.985;
      p.vz *= 0.985;

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

  setStreamWidth(w) {
    this.streamWidth = Math.max(30, Math.min(300, w));
  }

  setRatios(coin, pearl, gem) {
    this.ratios.coin = Math.max(0, coin);
    this.ratios.pearl = Math.max(0, pearl);
    this.ratios.gem = Math.max(0, gem);
  }

  setGlassEnabled(enabled) {
    this.glassEnabled = !!enabled;
    this.glassGroup.visible = this.glassEnabled;
    this.dissolveY = this.glassEnabled ? -150 : -80;
  }

  setGlassPosY(y) {
    this.glassPosY = y;
    this._updateGlassTransform();
  }

  setGlassPitch(pitchDeg) {
    this.glassPitch = pitchDeg * (Math.PI / 180);
    this._updateGlassTransform();
  }

  setGlassCushion(cushion) {
    this.glassCushion = Math.max(0.0, Math.min(0.5, cushion));
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
