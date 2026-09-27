/**
 * GoldFallSystem: 复刻《蒙尘之罪》金币、珍珠、宝石下落翻滚并消融过渡为流沙系统
 * 顶级工艺版：
 * 1. 埃及/古典精制金币（Proof Cameo 工艺）：高光镜面底板 + 霜化磨砂浮雕（神像桂冠徽章、罗马文字、120齿防滑边）
 * 2. 丰富且正统的双全立体 3D 宝石切工：立体长方八角倒脊阶梯切（祖母绿） + 伞形倒棱锥尖底钻石切（红宝石）
 * 3. 澳白珍珠薄膜干涉伴彩（Iridescence）与多级尺寸
 * 4. 时间控制系统：时间流速（Time Scale）+ 一键时间停止（Bullet Time Freeze）
 */
import * as THREE from 'three';

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

    // 伴生与消融流沙粒子系统
    this.maxParticles = 12000;
    this.activeParticleCount = 0;
    this.particlePool = [];

    // 3D 碰撞金樽（Wine Glass Obstacle）
    this.glassGroup = new THREE.Group();
    this.glassGroup.name = 'WineGlassObstacle';
    this.group.add(this.glassGroup);

    this.glassMode = 'schemeA'; // 'schemeA' (倾斜漫溢) | 'schemeB' (端正盛装) | 'none' (关闭)
    this.glassPosY = -95;
    this.glassPitch = 0.52;      // Scheme A: 约 30 度前倾，迎接下落流沙并倾泻
    this.glassRoll = -0.06;
    this.glassRestitution = 0.65; // 碰撞弹性系数
    this.dissolveY = -150;       // Scheme A/B 允许跌落至杯口下方消融

    this.glassPos = new THREE.Vector3(0, this.glassPosY, 0);
    this.glassEuler = new THREE.Euler(this.glassPitch, 0, this.glassRoll, 'YXZ');
    this.glassQuat = new THREE.Quaternion().setFromEuler(this.glassEuler);
    this.glassInvQuat = this.glassQuat.clone().invert();
    this.glassRotMat = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.glassQuat));

    this._innerSegments = [];
    this._outerSegments = [];

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

    // 3. 祖母绿：立体长方八角倒棱阶梯切工（3D Emerald Cut + 物理透光火彩）
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
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      flatShading: true,
      envMapIntensity: 3.2
    });

    // 4. 红宝石：立体明亮式圆锥钻石切工（3D Round Brilliant Diamond Cut + 高折射鸽血红）
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
      new THREE.Vector2(40.0, 50.5),   // 内杯唇
      new THREE.Vector2(40.5, 40),     // 内壁上部
      new THREE.Vector2(42.5, 25),     // 内壁腰部
      new THREE.Vector2(37.5, 10),     // 内壁腹部
      new THREE.Vector2(23.5, -5),     // 内壁下收
      new THREE.Vector2(9.5, -14),     // 内壁底部过渡
      new THREE.Vector2(0, -15)        // 内碗底中心
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

    // 4. 预计算解析碰撞截面线段
    const rawInner = [
      [0, -15],
      [9.5, -14],
      [23.5, -5],
      [37.5, 10],
      [42.5, 25],
      [40.5, 40],
      [40.0, 50.5]
    ];
    this._innerSegments = [];
    for (let i = 0; i < rawInner.length - 1; i++) {
      const ax = rawInner[i][0], ay = rawInner[i][1];
      const bx = rawInner[i + 1][0], by = rawInner[i + 1][1];
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const nlen = Math.hypot(-dy, dx);
      this._innerSegments.push({
        ax, ay, bx, by, dx, dy,
        invLenSq: 1.0 / lenSq,
        nx: -dy / nlen,
        ny: dx / nlen
      });
    }

    const rawOuter = [
      [42.5, 50.5],
      [43.0, 40],
      [45.0, 25],
      [40.0, 10],
      [26.0, -5],
      [12.0, -16]
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
    if (this.glassMode === 'none') return null;

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

    if (ly < -100 - radius || ly > 55 + radius) return null;
    if (r > 48 + radius) return null;

    const urx = r > 1e-4 ? lx / r : 1;
    const urz = r > 1e-4 ? lz / r : 0;

    let bestHit = null;
    let maxPen = 0;

    // A. 检测内碗凹腔
    if (ly >= -16 - radius && r <= 44 + radius) {
      for (let i = 0; i < this._innerSegments.length; i++) {
        const seg = this._innerSegments[i];
        let t = ((r - seg.ax) * seg.dx + (ly - seg.ay) * seg.dy) * seg.invLenSq;
        t = Math.max(0, Math.min(1, t));

        const cx = seg.ax + t * seg.dx;
        const cy = seg.ay + t * seg.dy;

        const sDist = (r - cx) * seg.nx + (ly - cy) * seg.ny;
        if (sDist < radius && sDist > -radius * 1.6) {
          const pen = radius - sDist;
          if (pen > maxPen) {
            maxPen = pen;
            bestHit = {
              pen: pen,
              nLocX: seg.nx * urx,
              nLocY: seg.ny,
              nLocZ: seg.nx * urz,
              isInner: true,
              ly: ly,
              r: r
            };
          }
        }
      }
    }

    // B. 检测杯唇圆环 (r=41.25, ly=50.5)
    const lipDist = Math.hypot(r - 41.25, ly - 50.5);
    const lipColRadius = radius + 1.25;
    if (lipDist < lipColRadius) {
      const pen = lipColRadius - lipDist;
      if (pen > maxPen) {
        maxPen = pen;
        let nR = lipDist > 1e-4 ? (r - 41.25) / lipDist : 0;
        let nY = lipDist > 1e-4 ? (ly - 50.5) / lipDist : 1;
        // 关键物理修正：当物体落在唇部正上方或外侧时，赋予明确的外向滚脱切向梯度，防止在鞍点死锁
        if (nR < 0.35) {
          nR = 0.55;
        }
        bestHit = {
          pen: pen,
          nLocX: nR * urx,
          nLocY: nY,
          nLocZ: nR * urz,
          isLip: true,
          ly: ly,
          r: r
        };
      }
    }

    // C. 检测外碗（漫溢倾泻滑行与外侧反弹）
    if (ly >= -25 - radius && r >= 32 - radius) {
      for (let i = 0; i < this._outerSegments.length; i++) {
        const seg = this._outerSegments[i];
        let t = ((r - seg.ax) * seg.dx + (ly - seg.ay) * seg.dy) * seg.invLenSq;
        t = Math.max(0, Math.min(1, t));

        const cx = seg.ax + t * seg.dx;
        const cy = seg.ay + t * seg.dy;

        const sDist = (r - cx) * seg.nx + (ly - cy) * seg.ny;
        if (sDist < radius && sDist > -radius * 1.5) {
          const pen = radius - sDist;
          if (pen > maxPen) {
            maxPen = pen;
            bestHit = {
              pen: pen,
              nLocX: seg.nx * urx,
              nLocY: seg.ny,
              nLocZ: seg.nx * urz,
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
      bestHit.normWorldX = m[0] * nx + m[3] * ny + m[6] * nz;
      bestHit.normWorldY = m[1] * nx + m[4] * ny + m[7] * nz;
      bestHit.normWorldZ = m[2] * nx + m[5] * ny + m[8] * nz;
      return bestHit;
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
   * 6. 伴生与消融流沙粒子系统
   * ---------------------------------------------------- */
  _initParticleSystem() {
    this.pGeom = new THREE.BufferGeometry();
    this.pPositions = new Float32Array(this.maxParticles * 3);
    this.pColors = new Float32Array(this.maxParticles * 3);
    this.pSizes = new Float32Array(this.maxParticles);

    this.pGeom.setAttribute('position', new THREE.BufferAttribute(this.pPositions, 3));
    this.pGeom.setAttribute('color', new THREE.BufferAttribute(this.pColors, 3));
    this.pGeom.setAttribute('size', new THREE.BufferAttribute(this.pSizes, 1));

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

    this.pMat = new THREE.PointsMaterial({
      size: 4.8,
      vertexColors: true,
      map: particleTexture,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particleMesh = new THREE.Points(this.pGeom, this.pMat);
    this.group.add(this.particleMesh);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePool.push({
        active: false,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        r: 1, g: 0.8, b: 0.2,
        size: 3.5,
        baseSize: 3.5,
        life: 0,
        maxLife: 2.5,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 6 + Math.random() * 8
      });
    }
  }

  emitParticle(x, y, z, vx, vy, vz, color, size = 3.8, maxLife = 2.0) {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particlePool[i];
      if (!p.active) {
        p.active = true;
        p.x = x; p.y = y; p.z = z;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.r = color.r; p.g = color.g; p.b = color.b;
        p.baseSize = size;
        p.size = size;
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

    // 1. 定期注生宏观实体
    this.spawnTimer += dt;
    if (this.spawnTimer >= 1 / this.spawnRate) {
      this.spawnTimer = 0;
      this.spawnEntity();
    }

    // 2. 注入背景细微金沙瀑布（受流沙整体宽度联动控制）
    const bgHalfW = this.streamWidth * 0.58;
    for (let k = 0; k < 6; k++) {
      const bgR = Math.sqrt(Math.random()) * bgHalfW;
      const bgTheta = Math.random() * Math.PI * 2;
      const bgX = Math.cos(bgTheta) * bgR;
      const bgY = 230 + Math.random() * 20;
      const bgZ = Math.sin(bgTheta) * (bgR * 0.45);
      const col = this._getGoldSandColor();
      this.emitParticle(
        bgX, bgY, bgZ,
        (Math.random() - 0.5) * 3,
        -(75 + Math.random() * 75),
        (Math.random() - 0.5) * 3,
        col,
        2.2 + Math.random() * 1.8,
        2.8
      );
    }

    // 3. 更新所有下落实体
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

      // 角速度空气与滚动阻尼：每帧自然平息自转，杜绝永恒空转
      e.rotSpeed.x *= 0.982;
      e.rotSpeed.y *= 0.982;
      e.rotSpeed.z *= 0.982;

      e.mesh.rotation.x += e.rotSpeed.x * dt;
      e.mesh.rotation.y += e.rotSpeed.y * dt;
      e.mesh.rotation.z += e.rotSpeed.z * dt;

      const curPos = e.mesh.position;

      // 3D 金樽物理碰撞检测与动力学响应（宝石外接碰撞半径提升至 11.5，杜绝陷入微隙）
      const colRadius = e.type === 'coin' ? 13.5 : (e.type === 'pearl' ? 5.0 * e.baseScale : 11.5 * e.baseScale);
      if (this.glassMode !== 'none') {
        const hit = this._solveGlassCollision(curPos, colRadius);
        if (hit) {
          // 1. 位置外科修正（沿接触法线推挤出表面，避免穿模）
          curPos.x += hit.normWorldX * hit.pen;
          curPos.y += hit.normWorldY * hit.pen;
          curPos.z += hit.normWorldZ * hit.pen;

          // 2. 速度分解为切向摩擦分量与法向恢复分量
          const vn = e.vx * hit.normWorldX + e.vy * hit.normWorldY + e.vz * hit.normWorldZ;
          if (vn < 0) {
            const vtx = e.vx - hit.normWorldX * vn;
            const vty = e.vy - hit.normWorldY * vn;
            const vtz = e.vz - hit.normWorldZ * vn;

            let matRestitution = this.glassRestitution;
            if (e.type === 'pearl') matRestitution *= 0.95;
            else if (e.type === 'gem' || e.type === 'emerald' || e.type === 'ruby') matRestitution *= 0.82;
            else matRestitution *= 0.60;

            // 动摩擦与切向滑移：微小切向阻尼 (0.04)，保留真实的固体滑移惯性，杜绝切向动能被压死
            const friction = 0.04;
            const bounceVn = -vn * matRestitution;

            e.vx = vtx * (1 - friction) + hit.normWorldX * bounceVn;
            e.vy = vty * (1 - friction) + hit.normWorldY * bounceVn;
            e.vz = vtz * (1 - friction) + hit.normWorldZ * bounceVn;

            // 只有明显撞击 (|vn| > 25) 才激发一次旋转角冲量，微小接触绝不叠加
            if (Math.abs(vn) > 25) {
              e.rotSpeed.x += (Math.random() - 0.5) * 2.5;
              e.rotSpeed.y += (Math.random() - 0.5) * 2.5;
              e.rotSpeed.z += (Math.random() - 0.5) * 2.5;
            }

            // 撞击迸发金沙星芒
            if (Math.abs(vn) > 28) {
              const sparkCount = e.type === 'coin' ? 3 : 2;
              for (let s = 0; s < sparkCount; s++) {
                const sandCol = this._getGoldSandColor();
                this.emitParticle(
                  curPos.x + (Math.random() - 0.5) * 4,
                  curPos.y + (Math.random() - 0.5) * 4,
                  curPos.z + (Math.random() - 0.5) * 4,
                  hit.normWorldX * (15 + Math.random() * 25) + (Math.random() - 0.5) * 15,
                  hit.normWorldY * (15 + Math.random() * 25) + (Math.random() - 0.5) * 15,
                  hit.normWorldZ * (15 + Math.random() * 25) + (Math.random() - 0.5) * 15,
                  sandCol,
                  3.0 + Math.random() * 2.0,
                  1.2
                );
              }
            }
          }

          // 3. 动力学导流与自然滚脱力
          if (this.glassMode === 'schemeA') {
            if (hit.isInner) {
              // 倾斜碗底：加速沿倾角向低口前沿（+Z）汇聚滑泻
              const m = this.glassRotMat.elements;
              const fwdX = m[6], fwdY = m[7], fwdZ = m[8];
              const slideAccel = 45;
              e.vx += fwdX * slideAccel * dt;
              e.vy += fwdY * slideAccel * dt;
              e.vz += fwdZ * slideAccel * dt;
            } else {
              // 杯唇 (isLip) 或外壁 (isOuter)：施加曲面滚脱加速度，向外、向下顺势跌出杯子
              const rollOffAccel = 60;
              e.vx += hit.normWorldX * rollOffAccel * dt;
              e.vy -= (rollOffAccel * 0.7) * dt;
              e.vz += hit.normWorldZ * rollOffAccel * dt;
            }
          } else if (this.glassMode === 'schemeB') {
            if (!hit.isInner) {
              // Scheme B 外壁或杯沿外侧：向外滚脱
              const rollOffAccel = 50;
              e.vx += hit.normWorldX * rollOffAccel * dt;
              e.vy -= (rollOffAccel * 0.7) * dt;
              e.vz += hit.normWorldZ * rollOffAccel * dt;
            }
          }

          // 4. 防滞留看门狗：若非正常堆积区且速度极低，施加脱困微冲量
          const curSpeed = Math.hypot(e.vx, e.vy, e.vz);
          if (curSpeed < 14 && (!hit.isInner || this.glassMode === 'schemeA')) {
            e.stuckTimer = (e.stuckTimer || 0) + dt;
            if (e.stuckTimer > 0.8) {
              e.vx += (Math.random() - 0.5) * 20 + hit.normWorldX * 35;
              e.vy -= 45;
              e.vz += (Math.random() - 0.5) * 20 + hit.normWorldZ * 35;
              e.stuckTimer = 0;
            }
          } else {
            e.stuckTimer = Math.max(0, (e.stuckTimer || 0) - dt * 2);
          }
        }
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

    // 方案 B：端正盛装盛满的实体堆叠排斥与漫溢管理
    if (this.glassMode === 'schemeB') {
      const inCupEntities = [];
      for (let i = 0; i < this.entities.length; i++) {
        const ent = this.entities[i];
        const lpY = ent.mesh.position.y - this.glassPos.y;
        const lpR = Math.hypot(ent.mesh.position.x - this.glassPos.x, ent.mesh.position.z - this.glassPos.z);
        if (lpY >= -16 && lpY <= 52 && lpR <= 42) {
          ent.inCup = true;
          ent.cupTime = (ent.cupTime || 0) + dt;
          inCupEntities.push(ent);
        } else {
          ent.inCup = false;
        }
      }

      // 杯内实体间接触排斥，形成真实的珠宝堆叠山体
      for (let a = 0; a < inCupEntities.length; a++) {
        const ea = inCupEntities[a];
        const rA = ea.type === 'coin' ? 12.0 : (ea.type === 'pearl' ? 5.0 * ea.baseScale : 7.5 * ea.baseScale);
        for (let b = a + 1; b < inCupEntities.length; b++) {
          const eb = inCupEntities[b];
          const rB = eb.type === 'coin' ? 12.0 : (eb.type === 'pearl' ? 5.0 * eb.baseScale : 7.5 * eb.baseScale);
          const minD = rA + rB;
          const dx = ea.mesh.position.x - eb.mesh.position.x;
          const dy = ea.mesh.position.y - eb.mesh.position.y;
          const dz = ea.mesh.position.z - eb.mesh.position.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < minD * minD && distSq > 0.001) {
            const d = Math.sqrt(distSq);
            const overlap = (minD - d) * 0.5;
            const nx = dx / d, ny = dy / d, nz = dz / d;

            ea.mesh.position.x += nx * overlap;
            ea.mesh.position.y += ny * overlap;
            ea.mesh.position.z += nz * overlap;

            eb.mesh.position.x -= nx * overlap;
            eb.mesh.position.y -= ny * overlap;
            eb.mesh.position.z -= nz * overlap;

            ea.vx += nx * overlap * 10;
            ea.vy += ny * overlap * 10;
            ea.vz += nz * overlap * 10;

            eb.vx -= nx * overlap * 10;
            eb.vy -= ny * overlap * 10;
            eb.vz -= nz * overlap * 10;
          }
        }

        // 杯满漫溢：若杯中实体超出 9 颗，推动上层实体朝唇边推挤漫出
        if (inCupEntities.length > 9) {
          const lpY = ea.mesh.position.y - this.glassPos.y;
          if (lpY > 30) {
            const dx = ea.mesh.position.x - this.glassPos.x;
            const dz = ea.mesh.position.z - this.glassPos.z;
            const rHoriz = Math.hypot(dx, dz);
            if (rHoriz > 1e-3) {
              const push = 22 * dt;
              ea.vx += (dx / rHoriz) * push;
              ea.vz += (dz / rHoriz) * push;
              ea.vy += 10 * dt;
            }
          }
        }

        // 杯底深层沉淀消融：在杯底停留超过 5.5 秒的珠宝化为细沙向下消散，维系生生不息
        const lpY = ea.mesh.position.y - this.glassPos.y;
        if (ea.cupTime > 5.5 && lpY < 8) {
          ea.dissolving = true;
        }
      }
    }

    // 4. 更新微粒系统
    let activeIdx = 0;
    const pPos = this.pPositions;
    const pCol = this.pColors;
    const pSize = this.pSizes;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife || p.y <= this.bottomY) {
        p.active = false;
        continue;
      }

      p.vy -= (this.gravity * 0.8) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.985;
      p.vz *= 0.985;

      // 粒子与 3D 金樽物理导流与避障（杜绝直穿杯心穿模，并在杯口汇聚倾泻）
      if (this.glassMode !== 'none') {
        const lpX = p.x - this.glassPos.x;
        const lpY = p.y - this.glassPos.y;
        const lpZ = p.z - this.glassPos.z;

        const dSq = lpX * lpX + lpY * lpY + lpZ * lpZ;
        if (dSq < 13000) {
          const qx = this.glassInvQuat.x, qy = this.glassInvQuat.y, qz = this.glassInvQuat.z, qw = this.glassInvQuat.w;
          const ix =  qw * lpX + qy * lpZ - qz * lpY;
          const iy =  qw * lpY + qz * lpX - qx * lpZ;
          const iz =  qw * lpZ + qx * lpY - qy * lpX;
          const iw = -qx * lpX - qy * lpY - qz * lpZ;

          const lx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
          const ly = iy * qw + iw * -qy + iz * -qx - ix * -qz;
          const lz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
          const r = Math.hypot(lx, lz);

          if (ly >= -98 && ly <= 54) {
            // A. 碗腔内部 (ly >= -16, r <= 42.5)
            if (ly >= -16 && r <= 42.5) {
              const bowlInnerR = 10 + 31 * Math.pow(Math.max(0, (ly + 16) / 67), 0.65);
              if (r >= bowlInnerR - 2.5) {
                p.vy *= 0.55;
                if (this.glassMode === 'schemeA') {
                  const m = this.glassRotMat.elements;
                  p.vx += m[6] * 32 * dt;
                  p.vy += m[7] * 32 * dt;
                  p.vz += m[8] * 32 * dt;
                }
              }
            } else {
              // B. 杯身外壁、实心杯挺与底盘 (物理径向推离避障，杜绝穿心穿透)
              let solidR = 7.2;
              if (ly > -20) {
                solidR = 12 + 32 * Math.pow(Math.max(0, (ly + 20) / 71), 0.65);
              } else if (ly < -78) {
                solidR = 38.0;
              }

              if (r < solidR + 2.0) {
                const targetR = solidR + 2.5;
                const urx = r > 1e-4 ? lx / r : 1;
                const urz = r > 1e-4 ? lz / r : 0;
                const newLx = targetR * urx;
                const newLz = targetR * urz;

                const m = this.glassRotMat.elements;
                const dX = newLx - lx;
                const dZ = newLz - lz;
                p.x += m[0] * dX + m[6] * dZ;
                p.y += m[1] * dX + m[7] * dZ;
                p.z += m[2] * dX + m[8] * dZ;
                p.vy *= 0.70;
              }
            }
          }
        }
      }

      const progress = p.life / p.maxLife;
      const alphaFade = progress > 0.7 ? (1.0 - progress) / 0.3 : 1.0;
      const twinkle = 0.75 + Math.sin(p.life * p.twinkleSpeed + p.twinklePhase) * 0.25;

      pPos[activeIdx * 3]     = p.x;
      pPos[activeIdx * 3 + 1] = p.y;
      pPos[activeIdx * 3 + 2] = p.z;

      pCol[activeIdx * 3]     = p.r * twinkle * alphaFade;
      pCol[activeIdx * 3 + 1] = p.g * twinkle * alphaFade;
      pCol[activeIdx * 3 + 2] = p.b * twinkle * alphaFade;

      pSize[activeIdx] = p.baseSize * alphaFade * twinkle;

      activeIdx++;
    }

    this.activeParticleCount = activeIdx;
    this.pGeom.setDrawRange(0, activeIdx);
    this.pGeom.attributes.position.needsUpdate = true;
    this.pGeom.attributes.color.needsUpdate = true;
    this.pGeom.attributes.size.needsUpdate = true;
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

  setGlassMode(mode) {
    this.glassMode = mode;
    if (mode === 'none') {
      this.glassGroup.visible = false;
      this.dissolveY = -80;
    } else if (mode === 'schemeA') {
      this.glassGroup.visible = true;
      this.glassPitch = 0.52;
      this.glassRoll = -0.06;
      this.glassPosY = -95;
      this.dissolveY = -150;
      this._updateGlassTransform();
    } else if (mode === 'schemeB') {
      this.glassGroup.visible = true;
      this.glassPitch = 0.0;
      this.glassRoll = 0.0;
      this.glassPosY = -110;
      this.dissolveY = -160;
      this._updateGlassTransform();
    }
  }

  setGlassPosY(y) {
    this.glassPosY = y;
    this._updateGlassTransform();
  }

  setGlassRestitution(restitution) {
    this.glassRestitution = Math.max(0.1, Math.min(1.0, restitution));
  }

  reset() {
    for (const e of this.entities) {
      this.group.remove(e.mesh);
    }
    this.entities = [];
    for (const p of this.particlePool) {
      p.active = false;
    }
    this.activeParticleCount = 0;
    this.pGeom.setDrawRange(0, 0);
  }

  destroy() {
    this.reset();
    this.scene.remove(this.group);
  }
}
