/**
 * ArchArchitecture: 生成三维几何体预设（阶梯错落拱券、高脚杯、双曲沙漏、罗马廊柱等）
 */
import * as THREE from 'three';

export class ArchArchitecture {
  /**
   * 阶梯错落拱券配置（三叠阶梯错落）
   */
  static getClassicArchesConfig() {
    return {
      type: 'arches',
      arches: [
        { cx: 0,   cy: 85,   cz: 0,   outerR: 52, innerR: 44, depth: 65, pillarHeight: 380 },
        { cx: 36,  cy: -25,  cz: 18,  outerR: 44, innerR: 36, depth: 55, pillarHeight: 270 },
        { cx: -36, cy: -135, cz: -16, outerR: 42, innerR: 34, depth: 50, pillarHeight: 160 }
      ]
    };
  }

  /**
   * 高脚杯预设（独酌孤杯：杯口弧线、杯腹凹面集流、纤细杯梗、扁平底盘）
   */
  static getWineGlassConfig() {
    return {
      type: 'wineglass',
      bowlTopY: 80,
      bowlBottomY: -40,
      bowlTopR: 55,
      bowlWaistR: 38,
      stemTopY: -40,
      stemBottomY: -160,
      stemR: 7,
      baseCenterY: -170,
      baseR: 50,
      baseHeight: 14
    };
  }

  /**
   * 罗马拱门长廊预设
   */
  static getColonnadeConfig() {
    return {
      type: 'arches',
      arches: [
        { cx: 0,   cy: 80, cz: 0, outerR: 46, innerR: 38, depth: 65, pillarHeight: 380 },
        { cx: -78, cy: 15, cz: 0, outerR: 32, innerR: 26, depth: 55, pillarHeight: 310 },
        { cx: 78,  cy: 15, cz: 0, outerR: 32, innerR: 26, depth: 55, pillarHeight: 310 }
      ]
    };
  }

  /**
   * 双曲沙漏预设
   */
  static getHourglassConfig() {
    return {
      type: 'hourglass',
      topY: 90,
      neckY: 0,
      bottomY: -120,
      topR: 50,
      neckR: 12,
      bottomR: 52
    };
  }

  /**
   * 统一生成用于场景遮挡与实体渲染的 3D 网格对象
   */
  static buildMeshGroup(config, isVisible = true, isLightMode = false) {
    const group = new THREE.Group();
    const matColor = isLightMode ? 0xdddddd : 0x060606;
    const material = new THREE.MeshStandardMaterial({
      color: matColor,
      roughness: 0.9,
      metalness: 0.1,
      depthWrite: true
    });

    if (config.type === 'arches') {
      config.arches.forEach(cfg => {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, cfg.outerR, 0, Math.PI, false);
        shape.lineTo(-cfg.outerR, -cfg.pillarHeight);
        shape.lineTo(-cfg.innerR, -cfg.pillarHeight);
        shape.absarc(0, 0, cfg.innerR, Math.PI, 0, true);
        shape.lineTo(cfg.innerR, -cfg.pillarHeight);
        shape.lineTo(cfg.outerR, -cfg.pillarHeight);

        const extrudeSettings = {
          depth: cfg.depth,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 1.5,
          bevelThickness: 1.5
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // 关键修复：绝不能调用 geometry.center() 破坏原点与物理碰撞网格对齐！
        // 仅沿 Z 轴居中拉伸厚度，确保 (cx, cy) 严格为半圆拱心坐标
        geometry.translate(0, 0, -cfg.depth * 0.5);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(cfg.cx, cfg.cy, cfg.cz);
        mesh.visible = isVisible;
        group.add(mesh);
      });
    } else if (config.type === 'wineglass') {
      // 旋转曲面高脚杯几何体
      const points = [];
      // 杯口到杯底轮廓曲线
      points.push(new THREE.Vector2(config.bowlTopR, config.bowlTopY));
      points.push(new THREE.Vector2(config.bowlTopR - 2, config.bowlTopY - 20));
      points.push(new THREE.Vector2(config.bowlWaistR, (config.bowlTopY + config.bowlBottomY) * 0.5));
      points.push(new THREE.Vector2(config.stemR + 3, config.bowlBottomY + 8));
      points.push(new THREE.Vector2(config.stemR, config.bowlBottomY));
      // 杯梗
      points.push(new THREE.Vector2(config.stemR, config.stemBottomY));
      // 杯座渐变过渡
      points.push(new THREE.Vector2(config.baseR * 0.4, config.stemBottomY - 4));
      points.push(new THREE.Vector2(config.baseR, config.baseCenterY));
      points.push(new THREE.Vector2(config.baseR, config.baseCenterY - config.baseHeight));
      points.push(new THREE.Vector2(0, config.baseCenterY - config.baseHeight));

      const latheGeom = new THREE.LatheGeometry(points, 36);
      const mesh = new THREE.Mesh(latheGeom, material);
      mesh.visible = isVisible;
      group.add(mesh);
    } else if (config.type === 'hourglass') {
      const points = [];
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = THREE.MathUtils.lerp(config.topY, config.bottomY, t);
        // 双曲颈部
        const midT = Math.abs(y - config.neckY) / (config.topY - config.neckY);
        const r = THREE.MathUtils.lerp(config.neckR, config.topR, Math.pow(midT, 0.7));
        points.push(new THREE.Vector2(r, y));
      }
      const latheGeom = new THREE.LatheGeometry(points, 36);
      const mesh = new THREE.Mesh(latheGeom, material);
      mesh.visible = isVisible;
      group.add(mesh);
    }

    return group;
  }
}
