# 萌宠小欣子

<p align="center">
  <img src="docs/images/xiaoxinzi-preview.png" width="280" alt="萌宠小欣子人物形象" />
</p>

**萌宠小欣子**是一款使用 Tauri 2 制作的精简跨平台人物桌宠，支持 Windows 和 macOS。桌面 App 直接使用项目中的 724 × 724 透明 PNG 动画帧，保留高清资源的原始分辨率。

## 形象来源

本项目中的人物形象来自抖音创作者 **小欣子** /小红书 **咕咕氧气机✨**，并据此制作为桌宠动画资源。

## 功能

- 透明、无边框、始终置顶的桌宠窗口
- 两套可切换人物皮肤：经典波点、浅蓝礼服
- 每套皮肤均包含高清逐帧待机与八种动作
- 自动在桌面左右移动，到屏幕边缘自动转身
- 按住人物可拖拽窗口
- 单击循环切换动作
- 右键可更换皮肤、选择动作、暂停自动移动、切换大小、复位或退出
- 自动记住上次选择的皮肤，下次启动继续使用
- 启动后每天静默检查一次新版本，也可通过右键菜单手动检查、下载、安装并重启
- 系统托盘支持显示/隐藏、复位和退出

## 下载

可在 [GitHub Releases](https://github.com/yanghaoraneve/pet_xiaoxinzi/releases/latest) 页面下载，也可使用下面的直接链接：

| 系统 | 适用设备 | 安装包 |
| --- | --- | --- |
| Windows x64 | Windows 10/11 64 位 | [下载 `.exe`](https://github.com/yanghaoraneve/pet_xiaoxinzi/releases/download/v0.1.0/MengChong-XiaoXinZi_0.1.0_windows-x64-setup.exe) |
| macOS Apple Silicon | M1/M2/M3/M4 等 Apple 芯片 Mac | [下载 `.dmg`](https://github.com/yanghaoraneve/pet_xiaoxinzi/releases/download/v0.1.0/MengChong-XiaoXinZi_0.1.0_macos-arm64.dmg) |
| macOS Intel | Intel 芯片 Mac | [下载 `.dmg`](https://github.com/yanghaoraneve/pet_xiaoxinzi/releases/download/v0.1.0/MengChong-XiaoXinZi_0.1.0_macos-intel.dmg) |

安装包的完整性校验值见 [SHA256SUMS.txt](https://github.com/yanghaoraneve/pet_xiaoxinzi/releases/download/v0.1.0/SHA256SUMS.txt)。

## 安装与使用

### Windows

1. 下载 `windows-x64-setup.exe`。
2. 双击运行，按安装向导完成安装。
3. 从开始菜单或桌面快捷方式启动“萌宠小欣子”。

### macOS

1. 根据 Mac 芯片选择 `macos-arm64.dmg` 或 `macos-intel.dmg`。
2. 打开 DMG，将“萌宠小欣子”拖入“应用程序”。
3. 在“应用程序”中启动。当系统因未签名应用而阻止打开时，请前往“系统设置 → 隐私与安全性”选择“仍要打开”。

> 当前 Release 安装包尚未配置 Apple/Windows 开发者签名，首次运行时可能出现 Gatekeeper 或 SmartScreen 提示。

## 更换皮肤

在人物上单击鼠标右键，找到“更换皮肤”，即可选择：

- **经典波点**：App 原有的黑色上衣与波点裙形象。
- **浅蓝礼服**：浅蓝色挂脖礼服、金色吊坠、银灰色腕花与黑色细带凉鞋形象。

两套皮肤共用相同的九个动作状态与节奏，切换时不会改变桌宠大小、自动移动设置或当前位置。浅蓝礼服皮肤包含 57 张 724 × 724 RGBA 透明 PNG 动画帧，制作和接入过程中未进行降采样；皮肤选择保存在本机，下次启动会自动恢复。

## 版本检查与更新

从 v0.2.0 开始，App 支持签名验证的在线更新：

1. 在人物上单击鼠标右键。
2. 在“版本更新”区域查看当前版本，选择“检查更新”。
3. 发现新版本后确认下载；App 会显示进度，安装完成后自动重启。

App 每 24 小时还会进行一次静默检查。只有 Tauri 签名验证通过的 GitHub Release 更新包才会被安装；检查失败不会影响桌宠的离线使用。

## Codex 桌宠资源

`codex-pet/` 中完整归档了 Codex 使用的独立低像素兼容版，不会替换桌面 App 中的高清资源：

- `codex-pet/installed/pet.json`：Codex v2 桌宠清单。
- `codex-pet/installed/spritesheet.webp`：1536 × 1872、8 列 × 9 行的透明动画图集，单元格为 192 × 208。
- 九个标准状态：`idle`、`waiting`、`running`、`running-left`、`running-right`、`waving`、`jumping`、`failed`、`review`。
- `codex-pet/qa/`：状态总览、GIF 预览、逐帧检查和图集验证结果。

将 Codex 资源安装到当前用户目录：

```bash
mkdir -p ~/.codex/pets/xiaoxinzi
cp codex-pet/installed/pet.json ~/.codex/pets/xiaoxinzi/
cp codex-pet/installed/spritesheet.webp ~/.codex/pets/xiaoxinzi/
```

完成后重启 Codex，即可使用 `xiaoxinzi` 桌宠。

## 开发与构建

需要 Node.js 18+、pnpm 10+、Rust stable。macOS 还需要 Xcode Command Line Tools；Windows 需要 Microsoft C++ Build Tools 与 WebView2 Runtime。

```bash
pnpm install
pnpm tauri:dev
pnpm tauri:build
```

GitHub Actions 会分别构建 Windows x64、macOS Intel 和 macOS Apple Silicon 安装包，同时生成签名更新包和 `latest.json`。详细说明见 [`BUILD.md`](BUILD.md)。

## 关注

点点关注！！！

- 抖音：[小欣子（抖音号：Kkkkkkkkkkkk.kk）](https://v.douyin.com/Fbn30V0vwHI/) 
- 小红书：[咕咕氧气机✨（小红书号：931795365）](https://xhslink.com/m/6N40fVdbjow)
