# Canvas to Excalidraw

把 Obsidian 画布（Canvas）中选中的对象移入一个**新建的 Excalidraw 文件**，并用该文件替换原内容。

Move the objects selected on an Obsidian Canvas into a **new Excalidraw drawing**, and replace them on the Canvas with a node pointing at it.

---

## 中文

### 功能

在画布里选中若干对象（图片 / 文本卡片 / md 笔记 / 其它 Excalidraw 图纸），右键或运行命令，插件会：

1. 新建一个 `.excalidraw.md` 文件，把选中内容放进去
2. 从画布上删除这些节点
3. 在原位置插入一个指向该图纸的节点

支持一次选中多个对象、图片与文本混选。

### 依赖

| 依赖 | 说明 |
|---|---|
| Obsidian | ≥ 1.8.7 |
| **画布**核心插件 | 必须启用 |
| **Excalidraw** 社区插件 | 必须安装并启用（id 必须是 `obsidian-excalidraw-plugin`） |

未安装 Excalidraw 时不会崩，只会提示，并且**不做任何改动**。

### 安装

1. 下载 `canvas-to-excalidraw` 文件夹（或 Release 里的 zip）
2. 放进 `<仓库>/.obsidian/plugins/canvas-to-excalidraw/`
3. 重载 Obsidian，在「设置 → 第三方插件」里启用

用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)：命令面板 → **BRAT: Add a beta plugin for testing** → 填 `用户名/仓库名`。

### 使用

选中画布上的对象 → 右键 → **把选中的内容移入新的 Excalidraw 文件**；或命令面板搜「移入」。

### 设置

| 设置 | 默认 | 说明 |
|---|---|---|
| 新建图纸的保存路径 | `Z附件库/Excalidraw` | 留空表示沿用 Excalidraw 插件设置里的目录 |
| 按月分文件夹 | 开 | 在路径下再建 `YYYY-MM` 子目录 |
| 文本卡片字体 | Lilita One | Excalidraw 的 9 个内置字体 |
| 文本卡片颜色 | 跟随画布颜色 → 作为文字颜色 | 读取 Obsidian 的 `--canvas-color-1~6` |
| 命名依据 | 最上面的对象 | 「最上面的」或「最左边的」 |
| 把箭头也移进图纸 | 开 | 选区内部的箭头重建成真正的绑定箭头 |
| 箭头（边）处理 | 改接到新文件 | 外部箭头重指向新节点，或直接删除 |
| 非图片文件（笔记 / PDF） | 笔记以图像形式嵌入 | 图纸（`.excalidraw.md`）即使被改名也能识别 |

### 一个细节：图纸的识别

`.excalidraw.md` **本质是 Markdown 文件**，所以只看扩展名不够。本插件用三层判定：

1. 文件名以 `.excalidraw.md` / `.excalidraw` 结尾
2. 询问 Excalidraw 插件自己的 `isExcalidrawFile()`（权威，且能处理改名）
3. 读 frontmatter 的 `excalidraw-plugin` 键，或 `excalidraw` 标签

这样即使你把图纸改名成 `图.md`，也不会被误当成普通笔记。

### 已知限制

- Canvas **没有公开 API**，所有画布操作走内部接口，Obsidian 升级后可能需要适配
- 只做**实时预览**之外的画布，与阅读视图无关

---

## English

### What it does

Select objects on a Canvas (images, text cards, Markdown notes, other Excalidraw drawings), then right-click or run the command. The plugin will:

1. Create a new `.excalidraw.md` containing the selection
2. Delete those nodes from the Canvas
3. Insert a single node pointing at the new drawing, in their place

### Requirements

- Obsidian ≥ 1.8.7
- The **Canvas** core plugin enabled
- The **Excalidraw** community plugin installed and enabled (id must be `obsidian-excalidraw-plugin`)

Without Excalidraw nothing crashes: the plugin reports the problem and changes nothing.

### Install

1. Put the `canvas-to-excalidraw` folder into `<vault>/.obsidian/plugins/`
2. Reload Obsidian and enable it under **Settings → Community plugins**

The folder name must match the `id` in `manifest.json` exactly.

### Settings

Folder (with optional monthly sub-folders), text font, text colour source, naming anchor (topmost / leftmost), whether internal arrows are recreated, how external arrows are handled, and how non-image files are embedded.

### Notes

- Canvas has **no public API**; every Canvas call goes through undocumented internals and may need adapting after an Obsidian update.
- Drawings are recognised by extension **or** by the marker Excalidraw writes into the file, so a renamed drawing is still detected.

---

## 开发 / Development

```bash
npm install
npm run build     # typecheck + bundle to main.js
npm run dev       # rebuild on change
npm run deploy    # copy the three files into .obsidian/plugins/
npm run ship      # build + deploy
```

源码在 `src/`，产物是 `main.js`（已提交，便于直接分发）。

## 许可 / License

MIT
