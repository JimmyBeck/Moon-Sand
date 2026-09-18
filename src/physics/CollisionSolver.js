/**
 * CollisionSolver: 三维几何碰撞与曲面切向滑移力学求解器
 * 支持物体的任意 X/Y/Z 位移、自转角及空间倾角姿态
 */
import * as THREE from 'three';

export class CollisionSolver {
  constructor() {
    this._matWorldToLocal = new THREE.Matrix4();
    this._matLocalToWorld = new THREE.Matrix4();
    this._rotMatrix = new THREE.Matrix4();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  /**
   * 更新障碍物的空间变换矩阵（位移 + 旋转姿态 + 几何缩放）
   */
  updateTransform(posOffset, rotAngles, scale = 1.0) {
    this._euler.set(rotAngles.x, rotAngles.y, rotAngles.z, 'YXZ');
    this._matLocalToWorld.makeRotationFromEuler(this._euler);
    this._matLocalToWorld.scale(new THREE.Vector3(scale, scale, scale));
    this._matLocalToWorld.setPosition(posOffset.x, posOffset.y, posOffset.z);

    this._matWorldToLocal.copy(this._matLocalToWorld).invert();
    this._rotMatrix.makeRotationFromEuler(this._euler);
  }

  /**
   * 统一碰撞入口
   */
  solveCollision(worldPos, worldVel, config, gravity = 0.12) {
    if (!config) return false;

    // 将粒子世界坐标转到障碍物局部空间
    const localPos = worldPos.clone().applyMatrix4(this._matWorldToLocal);
    let hit = false;
    let localNormal = null;
    let projLocalPos = null;
    let isApex = false;
    let shedDir = 0;

    if (config.type === 'arches') {
      const res = this._solveArches(localPos, config.arches);
      if (res) {
        hit = true;
        localNormal = res.normal;
        projLocalPos = res.proj;
        isApex = res.isApex;
        shedDir = res.shedDir;
      }
    } else if (config.type === 'wineglass') {
      const res = this._solveWineGlass(localPos, config);
      if (res) {
        hit = true;
        localNormal = res.normal;
        projLocalPos = res.proj;
      }
    } else if (config.type === 'hourglass') {
      const res = this._solveHourglass(localPos, config);
      if (res) {
        hit = true;
        localNormal = res.normal;
        projLocalPos = res.proj;
      }
    }

    if (hit && localNormal && projLocalPos) {
      // 将局部法线转换到世界空间
      const worldNormal = localNormal.clone().applyMatrix4(this._rotMatrix).normalize();

      // 切向重力驱动: G = (0, -gravity, 0)
      const dotGN = -gravity * worldNormal.y;
      const gt = new THREE.Vector3(
        -dotGN * worldNormal.x,
        -gravity - dotGN * worldNormal.y,
        -dotGN * worldNormal.z
      );

      // 贴附与沿切向滑移
      worldVel.x = worldVel.x * 0.88 + gt.x * 2.2;
      worldVel.y = worldVel.y * 0.88 + gt.y * 2.2;
      worldVel.z = worldVel.z * 0.88 + gt.z * 2.2;

      // 顶点分水岭效应推力：将沙粒顺畅推向左右两肩
      if (isApex) {
        const shedWorld = new THREE.Vector3(shedDir * (0.85 + Math.random() * 0.35), 0, 0).applyMatrix4(this._rotMatrix);
        worldVel.x += shedWorld.x;
        worldVel.z += shedWorld.z;
      }

      // 纠正世界位置
      const correctedWorldPos = projLocalPos.applyMatrix4(this._matLocalToWorld);
      worldPos.copy(correctedWorldPos);

      // 脱离检测：法线朝下或非常陡峭
      if (worldNormal.y < 0.05) {
        worldVel.y = Math.min(worldVel.y, -1.8);
      }
      return true;
    }

    return false;
  }

  _solveArches(localPos, arches) {
    const lx = localPos.x;
    const ly = localPos.y;
    const lz = localPos.z;

    for (let i = 0; i < arches.length; i++) {
      const arch = arches[i];
      const rx = lx - arch.cx;
      const ry = ly - arch.cy;
      const rz = lz - arch.cz;

      if (Math.abs(rz) > arch.depth * 0.5 + 2.0) continue;

      // 仅在拱门上半圆弧顶受流沙冲刷区域判定碰撞 (ry >= -2.0)
      // 拱门下方的空阔门洞 (ry < -2.0) 为完全开敞的通畅空间，绝无阻挡
      if (ry >= -2.0) {
        const dist2D = Math.hypot(rx, ry);

        // 凡从上方冲刷至拱顶曲面的粒子，均承托于外弧面并沿切向滑落，绝不穿透拱顶漏入拱洞
        if (dist2D <= arch.outerR + 3.5) {
          const nx = rx / (dist2D || 1);
          const ny = Math.max(0.01, ry / (dist2D || 1));

          // 顶点分流分水岭效应：避免沙粒在顶峰死点停滞
          let isApex = false;
          let shedDir = 0;
          if (ry > arch.outerR - 8.0 && Math.abs(rx) < 12.0) {
            isApex = true;
            shedDir = rx >= 0 ? 1 : -1;
          }

          return {
            normal: new THREE.Vector3(nx, ny, 0).normalize(),
            proj: new THREE.Vector3(nx * arch.outerR + arch.cx, ny * arch.outerR + arch.cy, lz),
            isApex,
            shedDir
          };
        }
      }
    }
    return null;
  }

  _solveWineGlass(localPos, cfg) {
    const x = localPos.x;
    const y = localPos.y;
    const z = localPos.z;
    const r = Math.hypot(x, z);

    // 1. 杯腹区域 (bowlBottomY ~ bowlTopY)
    if (y >= cfg.bowlBottomY && y <= cfg.bowlTopY + 5) {
      const t = (y - cfg.bowlBottomY) / (cfg.bowlTopY - cfg.bowlBottomY);
      // 杯身外轮廓半径曲线（带收腰与微外撇杯沿）
      const expectedR = THREE.MathUtils.lerp(cfg.bowlWaistR, cfg.bowlTopR, Math.pow(t, 0.8));

      if (Math.abs(r - expectedR) < 4.5 || (r <= expectedR && y >= cfg.bowlTopY - 8)) {
        const nrX = x / (r || 1);
        const nrZ = z / (r || 1);
        // 法线斜率
        const slopeY = THREE.MathUtils.clamp((cfg.bowlTopR - cfg.bowlWaistR) / (cfg.bowlTopY - cfg.bowlBottomY), 0.2, 0.8);
        return {
          normal: new THREE.Vector3(nrX, slopeY, nrZ).normalize(),
          proj: new THREE.Vector3(nrX * expectedR, y, nrZ * expectedR)
        };
      }
    }

    // 2. 杯梗区域 (stemBottomY ~ stemTopY)
    if (y >= cfg.stemBottomY && y < cfg.stemTopY) {
      if (Math.abs(r - cfg.stemR) < 3.5) {
        const nrX = x / (r || 1);
        const nrZ = z / (r || 1);
        return {
          normal: new THREE.Vector3(nrX, 0.1, nrZ).normalize(),
          proj: new THREE.Vector3(nrX * cfg.stemR, y, nrZ * cfg.stemR)
        };
      }
    }

    // 3. 底座区域 (baseCenterY - baseHeight ~ baseCenterY)
    if (y >= cfg.baseCenterY - cfg.baseHeight && y <= cfg.baseCenterY + 4) {
      if (r <= cfg.baseR + 4.0 && r >= cfg.stemR) {
        const nrX = x / (r || 1);
        const nrZ = z / (r || 1);
        return {
          normal: new THREE.Vector3(nrX * 0.3, 0.95, nrZ * 0.3).normalize(),
          proj: new THREE.Vector3(x, cfg.baseCenterY, z)
        };
      }
    }

    return null;
  }

  _solveHourglass(localPos, cfg) {
    const x = localPos.x;
    const y = localPos.y;
    const z = localPos.z;
    const r = Math.hypot(x, z);

    if (y <= cfg.topY + 5 && y >= cfg.bottomY - 5) {
      const midT = Math.abs(y - cfg.neckY) / (cfg.topY - cfg.neckY);
      const expectedR = THREE.MathUtils.lerp(cfg.neckR, cfg.topR, Math.pow(midT, 0.75));

      if (Math.abs(r - expectedR) < 4.0 || (r <= expectedR && y >= cfg.topY - 6)) {
        const nrX = x / (r || 1);
        const nrZ = z / (r || 1);
        const ny = (y > cfg.neckY ? 1 : -0.5) * 0.6;
        return {
          normal: new THREE.Vector3(nrX, ny, nrZ).normalize(),
          proj: new THREE.Vector3(nrX * expectedR, y, nrZ * expectedR)
        };
      }
    }
    return null;
  }

  /**
   * 求解通用三维模型 (.obj) 碰撞
   */
  solveMeshCollision(worldPos, worldVel, raycaster, mesh, gravity = 0.12) {
    if (!mesh) return false;

    raycaster.set(worldPos, new THREE.Vector3(0, -1, 0));
    raycaster.far = Math.max(9.0, Math.abs(worldVel.y) * 1.6);
    const intersects = raycaster.intersectObject(mesh, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const norm = hit.face ? hit.face.normal.clone().applyQuaternion(mesh.quaternion).normalize() : new THREE.Vector3(0, 1, 0);

      const dotGN = -gravity * norm.y;
      const gt = new THREE.Vector3(
        -dotGN * norm.x,
        -gravity - dotGN * norm.y,
        -dotGN * norm.z
      );

      worldVel.copy(worldVel.multiplyScalar(0.85).add(gt.multiplyScalar(2.2)));
      worldPos.copy(hit.point);
      return true;
    }
    return false;
  }
}
