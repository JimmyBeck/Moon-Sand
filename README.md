# 月亮流沙 (Moon Sand)

> 基于 Three.js / WebGL 与 Processing 的 3D 重力粒子曲面流动仿真作品。  
> **作者**：崽崽  
> **类别**：Processing 作品  
> **仓库地址**：https://github.com/JimmyBeck/Moon-Sand

---

## 核心特性

- **三维曲面切向导流力学**：粒子自月轮散落，与 3D 几何体发生碰撞，沿曲面切线滑移，并在曲率边缘脱离。
- **纯黑 / 纯白双环境自适应**：
  - 纯黑背景：发光叠加混合，粒子呈金色光晕。
  - 纯白背景：透明对比混合，字体反色，粒子呈现水墨与金沙交融质感。
- **双色粒子混色系统**：支持主色与副色独立取色，支持比例微调。
- **丰富几何形状库**：
  - 阶梯错落拱券
  - 独酌高脚杯（杯腹、细梗、底盘曲面）
  - 双曲沙漏
  - 罗马拱门长廊
  - 支持直接将外部 `.obj` 格式 3D 模型拖入画布。
- **空间姿态与尺寸调节**：支持几何体尺寸缩放（60% ~ 110%），以及水平偏移、落差高度、俯仰角与朝向角调节。
- **PC 分栏防遮挡布局**：控制面板位于右侧独立分栏，展开时完全不遮挡主画框；移动端小屏自动切换为自适应抽屉。
- **双模态交付**：提供 WebGL 交互版与原生 Processing 4 (Java) 源码。

---

## 执行步骤与多平台操作指南

### 方式一：Web 交互版 (Three.js + Vite)

#### 1. 前置环境要求
需要安装 Node.js（推荐 LTS 版本，>= 18）：
- **Mac 用户**：
  - 方式 A：访问 [Node.js 官网](https://nodejs.org) 下载 macOS 安装包（.pkg）完成安装。
  - 方式 B：使用 Homebrew，打开终端执行 `brew install node`。
- **Windows 用户**：
  - 访问 [Node.js 官网](https://nodejs.org) 下载 Windows 安装包（.msi）安装（安装时勾选自动配置 PATH 环境变量）。
- **验证环境**：在终端（Mac）或命令提示符 / PowerShell（Windows）中执行：
  ```bash
  node -v
  npm -v
  ```

#### 2. 克隆项目与进入目录
- **Mac (Terminal / iTerm)**：
  ```bash
  git clone https://github.com/JimmyBeck/Moon-Sand.git
  cd Moon-Sand
  ```
- **Windows (PowerShell / 命令提示符 CMD)**：
  ```cmd
  git clone https://github.com/JimmyBeck/Moon-Sand.git
  cd Moon-Sand
  ```

#### 3. 安装依赖与启动服务
在项目根目录下执行：
```bash
# 1. 安装项目依赖
npm install

# 2. 启动本地开发服务
npm run dev
```
启动后终端会输出本地访问链接（如 `http://localhost:5173/`）。使用现代浏览器（Chrome、Safari、Edge 等）打开该地址即可。

#### 4. 界面交互指南
- **3D 视角控制**：
  - 鼠标左键拖拽：360° 旋转视角。
  - 滚轮：放大 / 缩小视角。
  - 鼠标右键拖拽：平移视角。
- **参数控制面板**：
  - 点击右上角「参数面板」按钮展开或收起侧栏。
  - **色彩与环境**：一键切换纯黑 / 纯白背景，自选月亮颜色。
  - **双色流沙**：自选主色与副色，滑动调整混色比例与粒子密度。
  - **形状与姿态**：下拉切换「阶梯错落拱券」、「独酌高脚杯」、「双曲沙漏」、「罗马拱门长廊」，滑动「形状大小」调节尺寸（60% ~ 110%），支持位置与俯仰朝向微调。
  - **自定义模型**：直接将外部 `.obj` 格式 3D 模型拖入网页画布，流沙自动与导入模型进行曲面交互。
- **构建与预览**：
  ```bash
  npm run build    # 编译打包生产版本
  npm run preview  # 本地预览构建产物
  ```

---

### 方式二：Processing 4 原生版 (Java)

#### 1. 软件安装
访问 [Processing 官方下载页](https://processing.org/download) 获取 Processing 4：
- **Mac 用户**：
  1. 根据芯片架构选择下载：Apple Silicon 芯片选择 `macOS (Apple Silicon)`，Intel 芯片选择 `macOS (Intel)`。
  2. 解压下载的压缩包，将 `Processing.app` 拖入系统的「应用程序（Applications）」目录。
  3. 首次打开若遇系统安全提示，可在「系统设置 -> 隐私与安全性」中点击「仍要打开」。
- **Windows 用户**：
  1. 下载 Windows 64-bit 压缩包（.zip）。
  2. 解压至指定目录（如 `C:\Processing` 或 `D:\Processing`）。
  3. 双击解压目录中的 `processing.exe` 启动程序。

#### 2. 打开与运行工程
1. 启动 Processing 4 客户端。
2. 点击顶部菜单 **File（文件）-> Open...（打开）**，选择本项目目录下的 `processing/MoonSand.pde` 文件。
3. 点击窗口左上角播放按钮 ▶（**Run**）运行作品：
   - **Mac 快捷键**：`Cmd + R`
   - **Windows 快捷键**：`Ctrl + R`
4. 系统将弹出独立的 3D 渲染窗口呈现作品。

#### 3. 运行中键盘操作指南
- `b`：切换纯黑 / 纯白背景。
- `s`：切换阶梯错落拱券 / 独酌高脚杯形状。
- `[` / `]`：缩小 / 放大几何体尺寸（60% ~ 110%）。
- `空格键`：暂停 / 恢复自转。

---

## 项目结构

```text
├── index.html                   # Web 版展示页面（PC 端分栏防遮挡与移动端抽屉）
├── package.json                 # 项目依赖与脚本定义
├── package-lock.json            # 依赖版本锁定
├── src/
│   ├── main.js                  # 场景编排、渲染循环与交互绑定
│   ├── physics/
│   │   ├── ParticleSystem.js    # 粒子生命周期、双色管理与材质混合
│   │   └── CollisionSolver.js   # 空间变换矩阵与三维曲面切向滑移力学求解器
│   └── geometry/
│       └── ArchArchitecture.js # 阶梯错落拱券、高脚杯、沙漏与罗马长廊几何生成
├── processing/
│   └── MoonSand.pde             # Processing 4 原生源码
├── .gitignore                   # Git 忽略规则
└── README.md                    # 项目说明文档
```
