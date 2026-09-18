/**
 * 月亮流沙 (Moon Sand) - Processing 4 (Java)
 * 作品: 月亮流沙
 * 类别: Processing 作品
 * 作者: 崽崽
 * 技术架构: 3D 旋转阶梯拱券 / 高脚杯 + 重力粒子流 + 曲面法向切向滑移与脱离仿真
 */

int NUM_PARTICLES = 4000;
Particle[] particles;

// 1. 视觉与环境配置
color moonColor = color(255, 203, 30);  // 月亮颜色
color bgColor = color(0);               // 背景色：color(0) 纯黑 或 color(255) 纯白
boolean isLightMode = false;

// 2. 双色粒子系统配置
color colorA = color(255, 203, 30);     // 主色：金黄
color colorB = color(255, 255, 255);   // 副色：纯白高光
float ratioA = 0.70;                    // 主色占比 70%

// 3. 空间姿态控制
float offsetX = 0;
float offsetY = 0;
float tiltPitch = 0;                    // 俯仰倾角
float rotY = 0;
float ROT_SPEED = 0.007;                // 自转速度
boolean autoRotate = true;
float GRAVITY = 0.15;
float MAX_SPEED = 5.0;
float shapeScale = 1.0;                  // 形状缩放比例 (0.60 ~ 1.10)

// 4. 形状模式: 0: 经典拱券, 1: 高脚杯
int shapeMode = 0;

float moonX, moonY, moonR;

class Arch {
  float cx, cy, cz;
  float outerR, innerR;
  float depth;
  float pillarHeight;

  Arch(float cx, float cy, float cz, float outerR, float innerR, float depth, float pillarHeight) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.outerR = outerR;
    this.innerR = innerR;
    this.depth = depth;
    this.pillarHeight = pillarHeight;
  }
}

Arch[] arches;

void setup() {
  size(720, 960, P3D);
  pixelDensity(displayDensity());
  frameRate(60);

  moonX = width / 2.0;
  moonY = 150;
  moonR = 45;

  arches = new Arch[3];
  arches[0] = new Arch(0, -90, 0, 52, 44, 38, 360);
  arches[1] = new Arch(38, 20, 22, 44, 36, 34, 250);
  arches[2] = new Arch(-38, 130, -18, 42, 34, 30, 160);

  particles = new Particle[NUM_PARTICLES];
  for (int i = 0; i < NUM_PARTICLES; i++) {
    particles[i] = new Particle();
    particles[i].pos.y = random(moonY, height + 100);
    particles[i].prevPos.set(particles[i].pos);
  }
}

void draw() {
  background(bgColor);

  // 绘制顶端月轮
  drawMoon();

  if (autoRotate) {
    rotY += ROT_SPEED;
  }

  // 纯黑背景开启叠加辉光，纯白背景开启正常透明混合
  if (!isLightMode) {
    blendMode(ADD);
  } else {
    blendMode(BLEND);
  }

  for (int i = 0; i < NUM_PARTICLES; i++) {
    particles[i].update();
    particles[i].display();
  }

  blendMode(BLEND);
}

void drawMoon() {
  pushMatrix();
  translate(moonX, moonY, 0);
  noStroke();

  fill(red(moonColor), green(moonColor), blue(moonColor), isLightMode ? 60 : 40);
  ellipse(0, 0, moonR * 2.3, moonR * 2.3);

  fill(moonColor);
  ellipse(0, 0, moonR * 2, moonR * 2);
  popMatrix();
}

class Particle {
  PVector pos = new PVector();
  PVector prevPos = new PVector();
  PVector vel = new PVector();
  color col;
  float sparkleOffset;
  float baseAlpha;
  boolean isTypeA;

  Particle() {
    respawn();
  }

  void respawn() {
    float spanX = random(-moonR * 0.75, moonR * 0.75);
    float spanY = moonY + sqrt(max(0, moonR * moonR - spanX * spanX)) + random(-4, 4);
    float spanZ = random(-18, 18);

    pos.set(moonX + spanX, spanY, spanZ);
    prevPos.set(pos);
    vel.set(random(-0.05, 0.05), random(1.5, 2.8), random(-0.05, 0.05));

    isTypeA = random(1) < ratioA;
    if (isTypeA) {
      col = colorA;
    } else {
      if (isLightMode) {
        col = color(60, 70, 85);
      } else {
        col = colorB;
      }
    }

    sparkleOffset = random(100);
    baseAlpha = random(160, 240);
  }

  void update() {
    prevPos.set(pos);
    vel.y = min(MAX_SPEED, vel.y + GRAVITY);

    float worldX = pos.x - (width / 2.0 + offsetX);
    float worldY = pos.y - (height / 2.0 + offsetY);
    float worldZ = pos.z;

    float cosR = cos(-rotY);
    float sinR = sin(-rotY);
    float locX = (worldX * cosR - worldZ * sinR) / shapeScale;
    float locZ = (worldX * sinR + worldZ * cosR) / shapeScale;
    float locY = worldY / shapeScale;

    boolean collided = false;

    if (shapeMode == 0) {
      // 1. 经典拱券
      for (int a = 0; a < arches.length; a++) {
        Arch arch = arches[a];
        float relX = locX - arch.cx;
        float relY = locY - arch.cy;
        float relZ = locZ - arch.cz;

        if (abs(relZ) > arch.depth / 2.0) continue;
        float dist2D = sqrt(relX * relX + relY * relY);

        if (relY <= 15 && dist2D <= arch.outerR + 3.0 && dist2D >= arch.innerR - 3.5) {
          float nlx = relX / (dist2D == 0 ? 1 : dist2D);
          float nly = relY / (dist2D == 0 ? 1 : dist2D);

          float wnx = nlx * cos(rotY);
          float wnz = nlx * sin(rotY);
          float wny = nly;

          float dotGN = GRAVITY * wny;
          float gx = -dotGN * wnx;
          float gy = GRAVITY - dotGN * wny;
          float gz = -dotGN * wnz;

          vel.x = vel.x * 0.90 + gx * 2.2;
          vel.y = vel.y * 0.90 + gy * 2.2;
          vel.z = vel.z * 0.90 + gz * 2.2;

          float projLx = nlx * arch.outerR + arch.cx;
          float projLy = nly * arch.outerR + arch.cy;
          worldX = (projLx * cos(rotY) - (relZ + arch.cz) * sin(rotY)) * shapeScale;
          worldZ = (projLx * sin(rotY) + (relZ + arch.cz) * cos(rotY)) * shapeScale;
          worldY = projLy * shapeScale;

          pos.x = worldX + (width / 2.0 + offsetX);
          pos.y = worldY + (height / 2.0 + offsetY);
          pos.z = worldZ;
          collided = true;
          break;
        }
      }
    } else if (shapeMode == 1) {
      // 2. 高脚杯
      float r = sqrt(locX * locX + locZ * locZ);
      if (locY >= -40 && locY <= 85) {
        float t = (locY + 40) / 125.0;
        float expectedR = lerp(38, 55, pow(t, 0.8));
        if (abs(r - expectedR) < 4.0 || (r <= expectedR && locY >= 75)) {
          float nrX = locX / (r == 0 ? 1 : r);
          float nrZ = locZ / (r == 0 ? 1 : r);
          vel.x = vel.x * 0.88 + nrX * 0.5;
          vel.z = vel.z * 0.88 + nrZ * 0.5;
          vel.y = max(vel.y, 1.8);
          collided = true;
        }
      } else if (locY >= -160 && locY < -40) {
        if (abs(r - 7) < 3.0) {
          vel.x *= 0.5; vel.z *= 0.5;
          vel.y = max(vel.y, 2.0);
          collided = true;
        }
      }
    }

    pos.add(vel);

    if (pos.y > height + 60) {
      respawn();
    }
  }

  void display() {
    float zFactor = map(pos.z, -80, 80, 0.35, 1.0);
    zFactor = constrain(zFactor, 0.25, 1.0);
    float flicker = 0.75 + 0.25 * sin(frameCount * 0.15 + sparkleOffset);
    float a = baseAlpha * zFactor * flicker;

    stroke(col, a);
    strokeWeight(1.8);
    line(prevPos.x, prevPos.y, prevPos.z, pos.x, pos.y, pos.z);

    strokeWeight(2.8);
    point(pos.x, pos.y, pos.z);
  }
}

// 键盘交互：
// 'b': 切换纯黑/纯白背景
// 's': 切换拱券/高脚杯
// '[' / ']': 缩放形状大小 (60% ~ 110%)
// 空格: 暂停/恢复自转
void keyPressed() {
  if (key == 'b' || key == 'B') {
    isLightMode = !isLightMode;
    bgColor = isLightMode ? color(255) : color(0);
  } else if (key == 's' || key == 'S') {
    shapeMode = (shapeMode + 1) % 2;
  } else if (key == '[' || key == '{') {
    shapeScale = max(0.60, shapeScale - 0.05);
  } else if (key == ']' || key == '}') {
    shapeScale = min(1.10, shapeScale + 0.05);
  } else if (key == ' ') {
    autoRotate = !autoRotate;
  }
}
