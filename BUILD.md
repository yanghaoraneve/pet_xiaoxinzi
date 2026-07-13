# 构建说明

## 环境要求

- Node.js 18+
- pnpm 10+
- Rust stable
- macOS：Xcode Command Line Tools
- Windows：Microsoft C++ Build Tools 与 WebView2 Runtime

## 本机开发

```bash
pnpm install
pnpm tauri:dev
```

## 本机发布构建

```bash
pnpm tauri:build
```

Tauri 默认构建当前操作系统和 CPU 架构。当前已验证的本机产物是 macOS Apple Silicon `.app` 与 `.dmg`。

## Windows 与两种 macOS 架构

`.github/workflows/build.yml` 配置了三个独立构建目标：

- `aarch64-apple-darwin`：Apple Silicon macOS
- `x86_64-apple-darwin`：Intel macOS
- `x86_64-pc-windows-msvc`：64 位 Windows

在 GitHub Actions 中手动运行 `Build desktop apps`，或推送 `v*` 标签，即可获得对应安装包 Artifact。Windows 安装包会输出到 `bundle/msi/` 或 `bundle/nsis/`。
