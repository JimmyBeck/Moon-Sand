/**
 * ParticleSystem: 双色混色与自适应黑白主题流体粒子系统
 */
import * as THREE from 'three';
import { CollisionSolver } from './CollisionSolver.js';

export class ParticleSystem {
  constructor(maxParticles = 6500) {
    this.maxParticles = maxParticles;
    this.activeCount = 4200;
    this.solver = new CollisionSolver();

    // 粒子状态缓冲
    this.pos = new Float32Array(maxParticles * 3);
    this.prevPos = new Float32Array(maxParticles * 3);
    this.vel = new Float32Array(maxParticles * 3);
    this.baseColor = new Float32Array(maxParticles * 3);
    this.particleType = new Uint8Array(maxParticles); // 0: 主色, 1: 副色
    this.sparklePhase = new Float32Array(maxParticles);
    this.sparkleSpeed = new Float32Array(maxParticles);

    // 双色系统配置
    this.colorA = new THREE.Color(0xffcb1e); // 主色（金黄）
    this.colorB = new THREE.Color(0xffffff); // 副色（星白）
    this.ratioA = 0.70; // 70% 主色 : 30% 副色
    this.theme = 'dark'; // 'dark' | 'light'

    this.time = 0;
    this.moonPos = new THREE.Vector3(0, 200, 0);
    this.moonRadius = 42;

    this._initGeometries();
    this._initAllParticles();
  }

  _initGeometries() {
    // 1. 光珠拖影短线
    this.lineGeom = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(this.maxParticles * 6);
    this.lineColors = new Float32Array(this.maxParticles * 6);
    this.lineGeom.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.lineGeom.setAttribute('color', new THREE.BufferAttribute(this.lineColors, 3));

    this.lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.lineMesh = new THREE.LineSegments(this.lineGeom, this.lineMat);

    // 2. 头部闪烁高光点
    this.ptGeom = new THREE.BufferGeometry();
    this.ptPositions = new Float32Array(this.maxParticles * 3);
    this.ptColors = new Float32Array(this.maxParticles * 3);
    this.ptGeom.setAttribute('position', new THREE.BufferAttribute(this.ptPositions, 3));
    this.ptGeom.setAttribute('color', new THREE.BufferAttribute(this.ptColors, 3));

    this.ptMat = new THREE.PointsMaterial({
      size: 3.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.pointMesh = new THREE.Points(this.ptGeom, this.ptMat);

    this.group = new THREE.Group();
    this.group.add(this.lineMesh);
    this.group.add(this.pointMesh);
  }

  _initAllParticles() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.respawnParticle(i);
      this.pos[i * 3 + 1] -= Math.random() * 650;
      this.prevPos[i * 3 + 1] = this.pos[i * 3 + 1] + 2.5;
    }
  }

  respawnParticle(i) {
    const spanX = (Math.random() - 0.5) * (this.moonRadius * 1.55);
    const spanY = this.moonPos.y - Math.sqrt(Math.max(0, this.moonRadius * this.moonRadius - spanX * spanX)) + (Math.random() - 0.5) * 5;
    const spanZ = (Math.random() - 0.5) * 24;

    this.pos[i * 3] = spanX;
    this.pos[i * 3 + 1] = spanY;
    this.pos[i * 3 + 2] = spanZ;

    this.prevPos[i * 3] = spanX;
    this.prevPos[i * 3 + 1] = spanY + 2;
    this.prevPos[i * 3 + 2] = spanZ;

    this.vel[i * 3] = (Math.random() - 0.5) * 0.08;
    this.vel[i * 3 + 1] = -(1.5 + Math.random() * 1.8);
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.08;

    this.sparklePhase[i] = Math.random() * Math.PI * 2;
    this.sparkleSpeed[i] = 4.5 + Math.random() * 6;

    // 随机指派为主色还是副色
    this.particleType[i] = Math.random() < this.ratioA ? 0 : 1;
    this._applyParticleColor(i);
  }

  _applyParticleColor(i) {
    const isTypeA = this.particleType[i] === 0;
    const baseC = isTypeA ? this.colorA : this.colorB;

    let cr = baseC.r;
    let cg = baseC.g;
    let cb = baseC.b;

    // 若处于纯白背景下且该颜色过浅，自适应强化对比度（如白粒子转为墨银沙）
    if (this.theme === 'light') {
      const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
      if (lum > 0.85) {
        // 浅灰银/深青黑对比色
        cr = 0.25; cg = 0.30; cb = 0.38;
      }
    } else {
      // 暗夜模式下的微小色相自然抖动
      const jitter = (Math.random() - 0.5) * 0.08;
      cr = THREE.MathUtils.clamp(cr + jitter, 0, 1);
      cg = THREE.MathUtils.clamp(cg + jitter, 0, 1);
      cb = THREE.MathUtils.clamp(cb + jitter, 0, 1);
    }

    this.baseColor[i * 3] = cr;
    this.baseColor[i * 3 + 1] = cg;
    this.baseColor[i * 3 + 2] = cb;
  }

  setDualColors(hexA, hexB, ratio = 0.7) {
    this.colorA.set(hexA);
    this.colorB.set(hexB);
    this.ratioA = ratio;
    for (let i = 0; i < this.maxParticles; i++) {
      this._applyParticleColor(i);
    }
  }

  setTheme(theme) {
    this.theme = theme;
    if (theme === 'light') {
      this.lineMat.blending = THREE.NormalBlending;
      this.pointMesh.material.blending = THREE.NormalBlending;
      this.lineMat.opacity = 0.88;
      this.ptMat.opacity = 0.95;
    } else {
      this.lineMat.blending = THREE.AdditiveBlending;
      this.pointMesh.material.blending = THREE.AdditiveBlending;
      this.lineMat.opacity = 1.0;
      this.ptMat.opacity = 0.92;
    }
    for (let i = 0; i < this.maxParticles; i++) {
      this._applyParticleColor(i);
    }
  }

  update(dt, obstacleConfig, customMesh = null, params = {}) {
    this.time += dt;
    const count = Math.min(this.activeCount, this.maxParticles);

    const gravity = params.gravity !== undefined ? params.gravity : 0.12;
    const maxFallSpeed = params.maxFallSpeed !== undefined ? params.maxFallSpeed : 4.5;
    const sparkleIntensity = params.sparkleIntensity !== undefined ? params.sparkleIntensity : 0.85;

    // 更新空间变换
    const posOffset = params.posOffset || new THREE.Vector3(0, 0, 0);
    const rotAngles = params.rotAngles || new THREE.Vector3(0, 0, 0);
    const scale = params.scale !== undefined ? params.scale : 1.0;
    this.solver.updateTransform(posOffset, rotAngles, scale);

    const linePos = this.lineGeom.attributes.position.array;
    const lineCol = this.lineGeom.attributes.color.array;
    const ptPos = this.ptGeom.attributes.position.array;
    const ptCol = this.ptGeom.attributes.color.array;

    const tempPos = new THREE.Vector3();
    const tempVel = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      let px = this.pos[i * 3];
      let py = this.pos[i * 3 + 1];
      let pz = this.pos[i * 3 + 2];

      this.prevPos[i * 3] = px;
      this.prevPos[i * 3 + 1] = py;
      this.prevPos[i * 3 + 2] = pz;

      this.vel[i * 3 + 1] = Math.max(-maxFallSpeed, this.vel[i * 3 + 1] - gravity);

      tempPos.set(px, py, pz);
      tempVel.set(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]);

      let collided = false;
      if (customMesh) {
        collided = this.solver.solveMeshCollision(tempPos, tempVel, params.raycaster, customMesh, gravity);
      } else if (obstacleConfig) {
        collided = this.solver.solveCollision(tempPos, tempVel, obstacleConfig, gravity);
      }

      if (collided) {
        px = tempPos.x;
        py = tempPos.y;
        pz = tempPos.z;
        this.vel[i * 3] = tempVel.x;
        this.vel[i * 3 + 1] = tempVel.y;
        this.vel[i * 3 + 2] = tempVel.z;
      }

      px += this.vel[i * 3];
      py += this.vel[i * 3 + 1];
      pz += this.vel[i * 3 + 2];

      if (py < -440) {
        this.respawnParticle(i);
        px = this.pos[i * 3];
        py = this.pos[i * 3 + 1];
        pz = this.pos[i * 3 + 2];
      }

      this.pos[i * 3] = px;
      this.pos[i * 3 + 1] = py;
      this.pos[i * 3 + 2] = pz;

      ptPos[i * 3] = px;
      ptPos[i * 3 + 1] = py;
      ptPos[i * 3 + 2] = pz;

      const lIdx = i * 6;
      linePos[lIdx] = this.prevPos[i * 3];
      linePos[lIdx + 1] = this.prevPos[i * 3 + 1];
      linePos[lIdx + 2] = this.prevPos[i * 3 + 2];

      linePos[lIdx + 3] = px;
      linePos[lIdx + 4] = py;
      linePos[lIdx + 5] = pz;

      // 景深衰减与闪烁计算
      const zDepthFactor = THREE.MathUtils.clamp((pz + 110) / 220, 0.28, 1.0);
      const wave = Math.sin(this.time * this.sparkleSpeed[i] + this.sparklePhase[i]);
      const sparkle = THREE.MathUtils.lerp(1.0, 0.65 + 0.35 * wave, sparkleIntensity);
      const b = zDepthFactor * sparkle;

      const cr = this.baseColor[i * 3] * b;
      const cg = this.baseColor[i * 3 + 1] * b;
      const cb = this.baseColor[i * 3 + 2] * b;

      lineCol[lIdx] = cr * 0.35;
      lineCol[lIdx + 1] = cg * 0.35;
      lineCol[lIdx + 2] = cb * 0.35;

      lineCol[lIdx + 3] = cr;
      lineCol[lIdx + 4] = cg;
      lineCol[lIdx + 5] = cb;

      ptCol[i * 3] = cr * 1.1;
      ptCol[i * 3 + 1] = cg * 1.1;
      ptCol[i * 3 + 2] = cb * 1.1;
    }

    // 隐藏多余粒子
    for (let i = count; i < this.maxParticles; i++) {
      const lIdx = i * 6;
      linePos[lIdx + 1] = -9999;
      linePos[lIdx + 4] = -9999;
      ptPos[i * 3 + 1] = -9999;
    }

    this.lineGeom.attributes.position.needsUpdate = true;
    this.lineGeom.attributes.color.needsUpdate = true;
    this.ptGeom.attributes.position.needsUpdate = true;
    this.ptGeom.attributes.color.needsUpdate = true;
  }
}
