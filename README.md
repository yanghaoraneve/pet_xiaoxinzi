# 萌宠小欣子

一个使用 Tauri 2 制作的精简跨平台高清桌宠，支持 Windows 和 macOS。人物动作直接使用项目中的 724 × 724 透明 PNG 帧，资源文件没有降低分辨率。

## 功能

- 透明、无边框、始终置顶的桌宠窗口
- 高清逐帧待机和八种动作
- 自动在桌面左右移动，到屏幕边缘自动转身
- 按住人物拖拽窗口，拖拽方向会切换左右跑动作
- 单击循环播放动作
- 右键选择动作、暂停自动移动、切换大小、复位或退出
- 系统托盘显示/隐藏、复位和退出

## 开发运行

需要 Node.js 18+、pnpm、Rust stable。macOS 还需要 Xcode Command Line Tools；Windows 需要 WebView2 Runtime。

```bash
pnpm install
pnpm tauri:dev
```

## 构建

```bash
pnpm tauri:build
```

- macOS 产物：`src-tauri/target/release/bundle/dmg/`
- Windows 产物：`src-tauri/target/release/bundle/msi/` 或 `src-tauri/target/release/bundle/nsis/`

GitHub Actions 工作流也会分别在 macOS 与 Windows 环境构建安装包。

完整的 Intel Mac、Apple Silicon Mac 与 Windows 构建目标见 `BUILD.md`。

## 资源

正式运行只打包 `public/assets/frames/` 下的 57 张透明帧以及 `metadata.json`。`codex-pet/` 另行归档当前 Codex 使用的低像素版本及其 QA 资源；应用不会修改本机 Codex 桌宠。
