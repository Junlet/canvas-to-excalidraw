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
| 界面语言 | 中文 | 「自动（跟随 Obsidian）」/ 中文 / English |
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

### 一个细节：图纸的名字

图纸的名字从选中的对象派生（文本卡片取前 10 个字符，多行会先折成一行）。派生时会做两件事，都为了**让这个名字以后还能被链接到**：

**一、开头的标题标记算格式，不算内容**

Markdown 里 `#` 到 `######` 后面跟空格才是标题。卡片内容若是 `# 项目计划`，图纸名就是 `项目计划` —— 标记在**截取前 10 个字符之前**去掉，所以 `# 一二三四五六七八九十` 正好取满十个字。

**二、`# ^ [ ]` 出现在任何位置都换成 `_`**

Obsidian 源码里的原话：

> Links will not work with file names containing any of these characters: # ^ [ ] |

这五个字符**能建进文件名**，但会让链接失效：`[[# 标题.excalidraw]]` 会被解析成「当前文件里的一个标题」而不是文件链接；名字中间的 `#` 还会把路径切断（`C# 教程` → `C`）。插件在磁盘非法字符（`\ / : * ? " < > |`）之外一并挡掉它们：

| 卡片内容 | 图纸名 |
|---|---|
| `# 项目计划` | `项目计划` |
| `C# 教程` | `C_ 教程` |
| `数组 [0]` | `数组 _0_` |
| `a^2` | `a_2` |
| `#标签` | `_标签` |

最后一行是因为 `#` 后面没有空格，它是**标签**不是标题，所以只换字符、不整段去掉。

**三、末尾的图纸 / Markdown 扩展名会剥掉**

Excalidraw 的 `create()` **只在名字不以 `.md` 结尾时**才追加 `.excalidraw.md`。这一条规则会往两个相反的方向出错，所以收口处会把末尾的 `.excalidraw.md`、`.excalidraw`、`.md` **反复剥掉**（已重复的名字也会被纠正）：

| 派生出的名字 | 修复前生成 | 修复后生成 |
|---|---|---|
| `图.excalidraw` | `图.excalidraw.excalidraw.md` | `图.excalidraw.md` |
| `readme.md` | 普通笔记 `readme.md`，不是图纸 | `readme.excalidraw.md` |

> **图纸里画出来的文字仍是原样**：Excalidraw 的文本元素是纯文本，不解析 Markdown，画布上那张卡片本来也显示 `# 项目计划`。转换保持忠实，只修不该坏的文件名。

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

### Language

The interface is available in Chinese and English. The setting has three values — **Automatic** (follow Obsidian's own language), **中文**, and **English** — and ships defaulting to Chinese.

Detection reads `localStorage["language"]` (the key Obsidian itself uses) and falls back to `window.moment.locale()`, then to the OS locale. Any non-Chinese language resolves to English.

### Install

1. Put the `canvas-to-excalidraw` folder into `<vault>/.obsidian/plugins/`
2. Reload Obsidian and enable it under **Settings → Community plugins**

The folder name must match the `id` in `manifest.json` exactly.

### Settings

Folder (with optional monthly sub-folders), text font, text colour source, naming anchor (topmost / leftmost), whether internal arrows are recreated, how external arrows are handled, and how non-image files are embedded.

### Notes

- Canvas has **no public API**; every Canvas call goes through undocumented internals and may need adapting after an Obsidian update.
- Drawings are recognised by extension **or** by the marker Excalidraw writes into the file, so a renamed drawing is still detected.

### How a drawing gets its name

The name is derived from the selected object (a text card contributes its first 10 characters, collapsed to a single line first). Two rules exist purely so the name can still be **linked to** afterwards:

1. **A leading heading marker is formatting, not content.** If a card reads `# 项目计划`, the drawing is named `项目计划`. The marker is dropped *before* the 10-character cut, so `# 一二三四五六七八九十` still gets ten characters of real content.
2. **`# ^ [ ]` become `_` anywhere in the name.** Obsidian's own source says: "Links will not work with file names containing any of these characters: # ^ [ ] |". All five are legal on disk, which is why they need handling — `[[# 标题.excalidraw]]` parses as a heading link into the *current* file, and a mid-name `#` splits the path (`C# 教程` → `C`). So `C# 教程` → `C_ 教程`, `数组 [0]` → `数组 _0_`, `a^2` → `a_2`. A tag such as `#标签` has no space after the `#` and is therefore not a heading — only its character is replaced.
3. **A trailing drawing/Markdown extension is stripped.** Excalidraw's `create()` appends `.excalidraw.md` *only when the name does not already end in `.md`*, and that one rule fails in two opposite directions. Name preparation therefore strips `.excalidraw.md`, `.excalidraw` and `.md` repeatedly, so `图.excalidraw` no longer becomes `图.excalidraw.excalidraw.md`, and `readme.md` still becomes `readme` (otherwise you would get a plain Markdown note instead of a drawing).

**The text drawn into the drawing is unchanged**: Excalidraw text elements are plain text and never parsed Markdown, and the Canvas card displayed the `#` too. The conversion stays faithful; only the unusable file name is fixed.

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
