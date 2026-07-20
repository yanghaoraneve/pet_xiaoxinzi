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

Tauri 默认构建当前操作系统和 CPU 架构。启用更新包后，发布构建必须提供签名私钥：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(<"$HOME/.tauri/pet-xiaoxinzi.key")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password -a "$USER" -s pet-xiaoxinzi-updater -w)"
pnpm tauri:build
```

私钥与密码不能提交到仓库。仓库中的 `tauri.conf.json` 只保存可公开的验证公钥。

## Windows 与两种 macOS 架构

`.github/workflows/build.yml` 配置了三个独立构建目标：

- `aarch64-apple-darwin`：Apple Silicon macOS
- `x86_64-apple-darwin`：Intel macOS
- `x86_64-pc-windows-msvc`：64 位 Windows

在 GitHub Actions 中手动运行 `Build and publish desktop updates`，或推送 `v*` 标签，会自动：

1. 构建三个平台安装包。
2. 使用 Tauri 私钥签署更新包。
3. 创建 `v<应用版本>` GitHub Release。
4. 上传安装包、更新包、`.sig` 签名和 `latest.json`。

仓库需要配置以下 Actions Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`：`~/.tauri/pet-xiaoxinzi.key` 的完整内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成私钥时使用的密码。

## 发布后续版本

每次发布前，将以下三个文件中的版本号同步更新为相同的 SemVer：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

提交后推送相同版本标签，例如：

```bash
git tag v0.3.0
git push origin main v0.3.0
```

App 固定从 `https://github.com/yanghaoraneve/pet_xiaoxinzi/releases/latest/download/latest.json` 检查更新，因此最新的正式 Release 必须包含由工作流生成的 `latest.json`。
