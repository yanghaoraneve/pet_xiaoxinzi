# Codex 低像素桌宠资源

这里归档的是当前 Codex 实际使用的 192 × 208 单元格版本，保持安装文件原样，不受桌面 App 改名影响。

## 安装资源

- `installed/pet.json`：Codex 桌宠清单。
- `installed/spritesheet.webp`：1536 × 1872、8 列 × 9 行的透明动画图集。

将 `installed/` 中的两个文件复制到 `~/.codex/pets/xiaoxinzi/`，即可作为 `xiaoxinzi` 桌宠使用。

## QA 与生成记录

- `pet_request.json`：生成请求记录。
- `qa/contact-sheet.png`：九状态总览。
- `qa/previews/`：九个状态的 GIF 动画预览。
- `qa/review.json`：逐帧检查结果。
- `qa/validation.json`：图集结构验证结果。
- `qa/run-summary.json`：最终运行摘要。

桌面 App 使用的是 `public/assets/frames/` 中的 724 × 724 高清帧；这里的 Codex 图集是独立的低像素兼容版本。
