/**
 * Two-language string table.
 *
 * The plugin ships Chinese and English. The setting has three values:
 *
 *   - `"auto"` follows whatever language Obsidian itself is using;
 *   - `"zh"` / `"en"` pin it.
 *
 * The factory default is `"zh"`, so an existing install keeps the exact wording
 * it had before this module existed.
 *
 * HOW THE APP LANGUAGE IS DETECTED
 * --------------------------------
 * Both signals below were verified against Obsidian's own bundle rather than
 * guessed:
 *
 *   1. `localStorage.getItem("language")` -- Obsidian stores the UI language
 *      under that key (its bundle literally has `ta = "language"` feeding
 *      `localStorage.getItem(ta)` / `setItem(ta, ...)`).
 *   2. `window.moment.locale()` -- Obsidian calls `window.moment.locale(<app
 *      language>)` right after loading a language pack, so moment's locale
 *      mirrors the app language.
 *
 * Anything that is not Chinese resolves to English, which is the sensible
 * fallback for a German or Japanese Obsidian.
 */

/** What the user picked in settings. */
export type LanguageSetting = "auto" | "zh" | "en";

/** What that resolves to at runtime. */
export type ResolvedLanguage = "zh" | "en";

/**
 * Chinese strings.
 *
 * This table is the source of truth for the key set: `MessageKey` is derived
 * from it, and the English table is typed as `Record<MessageKey, string>`, so a
 * key added here and forgotten there is a compile error.
 *
 * Strings that are identical in both languages on purpose -- an acronym, a
 * proper noun, or the language row itself -- are called out where they appear.
 */
const zh = {
	// -- console ----------------------------------------------------------
	"log.moveFailed": "移入失败",
	"log.isExcalidrawFileFailed":
		"isExcalidrawFile() 抛错，回退到元数据判定",
	"log.readMetadataFailed": "读取元数据失败",
	"log.createFolderFailed": "创建文件夹时出错（可能已存在）：",

	// -- notices ----------------------------------------------------------
	"notice.readonly": "这个画布是只读的，无法修改。",
	"notice.nothingSelected": "请先在画布中选中至少一个对象。",
	"notice.editing": "有节点正在编辑中，请先点一下画布空白处结束编辑。",
	"notice.excalidrawMissing":
		"未找到已启用的 Excalidraw 插件，请先安装并启用它。",
	"notice.moveFailed": "移入失败：{reason}",

	// -- command palette / canvas context menu ----------------------------
	"command.moveSelection": "把选中的内容移入新的 Excalidraw 文件",

	// -- success summary --------------------------------------------------
	// Counted parts are joined with " + "; `summary.none` stands in when the
	// drawing somehow holds nothing countable.
	"summary.image": "{count} 张图片",
	"summary.drawing": "{count} 个图纸",
	"summary.note": "{count} 篇笔记",
	"summary.textCard": "{count} 个文本卡片",
	"summary.arrow": "{count} 条箭头",
	"summary.none": "内容",
	"summary.moved": "已把 {moved} 移入「{name}.excalidraw.md」",
	/**
	 * Names the folder the drawing landed in. Without it a "按月分文件夹" user
	 * has no way to tell whether the setting took effect, since the notice
	 * otherwise shows the file name only.
	 */
	"summary.savedTo": "，存到 {folder}/",
	"summary.reconnected": "；{count} 条箭头已改接到新节点",
	"summary.dropped": "；移除了 {count} 条箭头",
	"summary.skipped": "；跳过 {count} 项（{reasons}）",

	// -- shared fragments -------------------------------------------------
	"common.empty": "(空)",
	/** Joins the reasons inside `summary.skipped`. */
	"common.listSeparator": "，",

	// -- skip reasons -----------------------------------------------------
	"skip.emptyTextCard": "空白文本卡片",
	"skip.fileNotFound": "找不到文件：{path}",
	"skip.notEmbedded": "{kind}未嵌入（已在设置里关闭）：{name}",
	"skip.unsupportedType": "不支持的文件类型，已跳过：{name}",
	"skip.renderFailed": "渲染失败，已跳过：{name}",
	"skip.embedNotAPicture": "卡片里嵌入的不是图片，已跳过：{path}",
	"skip.linkCard": "链接卡片",
	"skip.unsupportedNode": "不支持的节点类型：{type}",
	"skip.arrowEndpointMissing": "一条箭头因端点未移入而省略",
	"skip.arrowCreateFailed": "一条箭头创建失败",

	// -- embed kinds ------------------------------------------------------
	// "PDF" is an acronym that reads the same in both languages, so it is a
	// literal in `attachments.ts` rather than a key here.
	"kind.image": "图片",
	"kind.drawing": "图纸",
	"kind.markdown": "笔记",

	// -- errors -----------------------------------------------------------
	"error.canvasSetDataMissing":
		"当前 Obsidian 版本的 Canvas 缺少 setData()，无法写回画布。",
	"error.canvasGetDataMissing":
		"当前 Obsidian 版本的 Canvas 缺少 getData()，无法读取画布。",
	"error.canvasDataUnrecognized": "Canvas 返回的数据结构无法识别。",
	"error.nodeIdUnavailable": "无法为画布节点生成唯一 id。",
	"error.nothingToMove":
		"选中的内容里没有可移动的图片、图纸、笔记或文本卡片。",
	"error.drawingNotCreated": "Excalidraw 未能在预期时间内创建文件：{path}",

	// -- settings: language -----------------------------------------------
	// Deliberately identical in both tables: someone who switched to a
	// language they cannot read must still be able to find this one row. The
	// two language names stay in their own language for the same reason.
	"settings.language.name": "界面语言 / Interface language",
	"settings.language.desc":
		"本插件的命令、提示与设置界面使用的语言。「自动」跟随 Obsidian " +
		"自身的语言设置。",
	"settings.language.auto": "自动（跟随 Obsidian）",
	"settings.language.zh": "中文",
	"settings.language.en": "English",

	// -- settings: destination folder -------------------------------------
	"settings.folder.name": "新建图纸的保存路径",
	"settings.folder.desc":
		"新图纸会保存到这里：{path}。留空表示沿用 Excalidraw 插件设置里" +
		"的目录；文件夹不存在时会自动创建。",
	"settings.folder.inherited": "（沿用 Excalidraw 插件设置里的目录）",
	"settings.folder.monthName": "按月分文件夹",
	"settings.folder.monthDesc":
		"开启后，会在上面的路径下再建一个 `YYYY-MM` 文件夹，让每个月的" +
		"图纸归到一起。当前将会保存到：{path}",

	// -- settings: insertion size -----------------------------------------
	"settings.imageScale.name": "图片插入尺寸（%）",
	"settings.imageScale.desc":
		"100% = 与图片在画布上占用的大小一致。只作用于图片：笔记 / PDF 是" +
		"一次性渲染的位图，拉伸只会变糊，所以不受这一项影响。" +
		"图片以左上角为基准放大，调大后可能与旁边的元素重叠。" +
		"另外：如果一张图纸里只有这一张图，放大后看不出区别 ——" +
		"Excalidraw 打开时会自动缩放到适应内容。",

	// -- settings: sticky notes -------------------------------------------
	"settings.sticky.name": "文本卡片转成便签（sticky note）",
	"settings.sticky.desc":
		"打开后，移入的文本卡片会变成 Excalidraw 的便签：「一个带底色的" +
		"卡片 + 自动适配大小的文字」。关闭则保持原来的普通文字元素。" +
		"便签文字使用下面「文本卡片字体」。",
	"settings.sticky.sizeMode.name": "便签尺寸",
	"settings.sticky.sizeMode.desc":
		"「跟随画布卡片」= 与它在画布上占用的大小一致；「固定尺寸」= 所有" +
		"便签同样大小。便签是定宽容器，文字放不下时 Excalidraw 会自动" +
		"缩小字号。",
	"settings.sticky.sizeMode.card": "跟随画布卡片尺寸",
	"settings.sticky.sizeMode.fixed": "固定尺寸",
	"settings.sticky.width.name": "便签宽度（px）",
	"settings.sticky.width.desc": "仅在「固定尺寸」时生效。",
	"settings.sticky.height.name": "便签高度（px）",
	"settings.sticky.height.desc": "仅在「固定尺寸」时生效。",
	"settings.sticky.fontSize.name": "便签字号",
	"settings.sticky.fontSize.desc":
		"便签文字的最大字号。文字放不下时 Excalidraw 会自动缩小它。",
	"settings.sticky.align.name": "便签文字对齐",
	"settings.sticky.align.left": "左对齐",
	"settings.sticky.align.center": "居中",
	"settings.sticky.align.right": "右对齐",
	"settings.sticky.background.name": "便签底色",
	"settings.sticky.background.desc":
		"「跟随卡片颜色」取卡片预设色并调淡，避免饱和色压住文字；" +
		"没设过颜色的卡片保持 Excalidraw 默认底色。",
	"settings.sticky.background.follow": "跟随卡片颜色（淡色）",
	"settings.sticky.background.custom": "自定义颜色",
	"settings.sticky.background.keep": "保持默认（不改）",
	"settings.sticky.color.name": "自定义便签底色",

	// -- settings: embeds inside a text card ------------------------------
	"settings.cardEmbed.name": "文本卡片里的图片",
	"settings.cardEmbed.desc":
		"文本卡片是 Markdown，可以内嵌图片（![[图片.png]]）。" +
		"但 Excalidraw 的文字元素不解析 Markdown —— 不处理的话图纸里会直接" +
		"出现「![[图片.png]]」这串字符。",
	"settings.cardEmbed.image": "把图片放到卡片下方（推荐）",
	"settings.cardEmbed.text": "只留文件名，不插图片",
	"settings.cardEmbed.keep": "原样保留（会出现 Markdown 标记）",

	// -- settings: font ---------------------------------------------------
	"settings.font.name": "文本卡片字体",
	"settings.font.desc":
		"移入 Excalidraw 的文本卡片使用的字体。这些都是 Excalidraw 内置" +
		"字体，无需在仓库里放字体文件。注意：内置字体只覆盖拉丁字母，中文" +
		"会回退到系统字体。",

	// Font proper nouns are not translated (see `font.*Note` for the
	// parenthesised note that follows them).
	"font.virgilNote": "（手绘）",
	"font.cascadiaNote": "（代码）",
	"font.localNote": "（仓库内自定义字体）",

	// -- settings: non-image files ----------------------------------------
	"settings.nonImage.name": "非图片文件（笔记 / PDF）",
	"settings.nonImage.desc":
		"画布上的文件节点如果指向的是 Markdown 笔记而不是图片，怎么处理。" +
		"选「笔记以图像形式嵌入」会调用 Excalidraw 插件自己的渲染（就是它" +
		"「嵌入文件 → 以图像形式」那条路径），把笔记渲染成图片放进图纸" +
		"——不需要先打开一个 Excalidraw 视图。整篇笔记会被渲染（相当于" +
		"「显示全部」），暂不支持只嵌入某个章节。",
	"settings.nonImage.skip": "跳过（只移入图片）",
	"settings.nonImage.markdown": "笔记以图像形式嵌入",
	"settings.nonImage.markdownAndPdf": "笔记 + PDF 都以图像形式嵌入",

	// -- settings: text colour --------------------------------------------
	"settings.textColor.name": "文本卡片颜色",
	"settings.textColor.desc":
		"画布上的文字卡片如果有颜色，怎么带进 Excalidraw。颜色取自 " +
		"Obsidian 自己的 --canvas-color-1~6 变量（1 红 2 橙 3 黄 4 绿 5 青 " +
		"6 紫），所以会跟随你当前的主题。没有设过颜色的卡片保持 " +
		"Excalidraw 默认。",
	"settings.textColor.text": "跟随画布颜色 → 作为文字颜色",
	"settings.textColor.background": "跟随画布颜色 → 作为文字背景色",
	"settings.textColor.ignore": "不处理，用 Excalidraw 默认",

	// -- settings: naming -------------------------------------------------
	"settings.naming.name": "命名依据",
	"settings.naming.desc":
		"选中多个对象时，用哪个对象的名字给新图纸命名。「最上面的」按纵" +
		"坐标最小选，「最左边的」按横坐标最小选；两者都会用另一个轴做平局" +
		"判定。文字卡片取前 10 个字。",
	"settings.naming.topmost": "最上面的对象",
	"settings.naming.leftmost": "最左边的对象",

	// -- settings: arrows -------------------------------------------------
	"settings.moveEdges.name": "把箭头也移进图纸",
	"settings.moveEdges.desc":
		"选中范围内的箭头（两端都被选中的）会在 Excalidraw 里重建成真正" +
		"的绑定箭头，方向与连接边（上/下/左/右）都按画布上的原样保留。" +
		"关闭后图纸里只有图片和文字，不会有箭头。",
	"settings.edgePolicy.name": "箭头（边）处理",
	"settings.edgePolicy.desc":
		"被移走的节点上连着的箭头怎么办。「改接到新文件」无损：外部箭头会" +
		"重新指向新建的图纸节点，流程图不会断。「直接删除」更干净：但会让" +
		"经过这些节点的连线消失。两端都在选区里的箭头无论选哪个都会被删除" +
		"（它已经变成图纸内部的关系）。",
	"settings.edgePolicy.reconnect": "改接到新文件（无损）",
	"settings.edgePolicy.delete": "直接删除",

	// -- settings: CJK note -----------------------------------------------
	"settings.cjk.name": "中文显示说明",
	"settings.cjk.desc":
		"Lilita One 等内置字体没有中文字形，中文会由系统字体回退渲染。" +
		"若要让中文也用统一字体，可在 Excalidraw 插件设置里开启本地 CJK " +
		"字体。",
} as const;

/** Every valid key. Derived from the Chinese table. */
export type MessageKey = keyof typeof zh;

/** English strings. Must cover every key in `zh`. */
const en: Record<MessageKey, string> = {
	// -- console ----------------------------------------------------------
	"log.moveFailed": "move failed",
	"log.isExcalidrawFileFailed":
		"isExcalidrawFile() threw; falling back to the metadata check",
	"log.readMetadataFailed": "could not read the file metadata",
	"log.createFolderFailed":
		"could not create the folder (it may already exist):",

	// -- notices ----------------------------------------------------------
	"notice.readonly": "This canvas is read-only and cannot be modified.",
	"notice.nothingSelected": "Select at least one object on the canvas first.",
	"notice.editing":
		"A node is still being edited. Click an empty part of the canvas to " +
		"finish editing first.",
	"notice.excalidrawMissing":
		"No enabled Excalidraw plugin was found. Install and enable it first.",
	"notice.moveFailed": "Move failed: {reason}",

	// -- command palette / canvas context menu ----------------------------
	"command.moveSelection": "Move the selection into a new Excalidraw file",

	// -- success summary --------------------------------------------------
	"summary.image": "{count} image(s)",
	"summary.drawing": "{count} drawing(s)",
	"summary.note": "{count} note(s)",
	"summary.textCard": "{count} text card(s)",
	"summary.arrow": "{count} arrow(s)",
	"summary.none": "content",
	"summary.moved": 'Moved {moved} into "{name}.excalidraw.md"',
	/** Names the folder the drawing landed in; see the Chinese table. */
	"summary.savedTo": ", saved to {folder}/",
	"summary.reconnected": "; {count} arrow(s) reconnected to the new node",
	"summary.dropped": "; {count} arrow(s) removed",
	"summary.skipped": "; {count} item(s) skipped ({reasons})",

	// -- shared fragments -------------------------------------------------
	"common.empty": "(empty)",
	"common.listSeparator": ", ",

	// -- skip reasons -----------------------------------------------------
	"skip.emptyTextCard": "empty text card",
	"skip.fileNotFound": "file not found: {path}",
	"skip.notEmbedded": "{kind} was not embedded (turned off in settings): {name}",
	"skip.unsupportedType": "unsupported file type, skipped: {name}",
	"skip.renderFailed": "rendering failed, skipped: {name}",
	"skip.embedNotAPicture": "the embed inside the card is not a picture, skipped: {path}",
	"skip.linkCard": "link card",
	"skip.unsupportedNode": "unsupported node type: {type}",
	"skip.arrowEndpointMissing":
		"an arrow was omitted because one of its endpoints was not moved",
	"skip.arrowCreateFailed": "an arrow could not be created",

	// -- embed kinds ------------------------------------------------------
	"kind.image": "image",
	"kind.drawing": "drawing",
	"kind.markdown": "note",

	// -- errors -----------------------------------------------------------
	"error.canvasSetDataMissing":
		"This Obsidian build's Canvas has no setData(), so the canvas cannot " +
		"be written back.",
	"error.canvasGetDataMissing":
		"This Obsidian build's Canvas has no getData(), so the canvas cannot " +
		"be read.",
	"error.canvasDataUnrecognized":
		"The data structure returned by the Canvas is not recognised.",
	"error.nodeIdUnavailable":
		"Could not generate a unique id for a canvas node.",
	"error.nothingToMove":
		"The selection holds no movable images, drawings, notes or text cards.",
	"error.drawingNotCreated":
		"Excalidraw did not create the file in time: {path}",

	// -- settings: language -----------------------------------------------
	"settings.language.name": "界面语言 / Interface language",
	"settings.language.desc":
		"Language used by this plugin's commands, notices and settings pane. " +
		'"Automatic" follows Obsidian\'s own language.',
	"settings.language.auto": "Automatic (follow Obsidian)",
	"settings.language.zh": "中文",
	"settings.language.en": "English",

	// -- settings: destination folder -------------------------------------
	"settings.folder.name": "Where new drawings are saved",
	"settings.folder.desc":
		"New drawings are saved here: {path}. Leave it empty to use the " +
		"folder configured in the Excalidraw plugin; the folder is created " +
		"automatically when it does not exist.",
	"settings.folder.inherited":
		"(using the folder configured in the Excalidraw plugin)",
	"settings.folder.monthName": "Monthly sub-folders",
	"settings.folder.monthDesc":
		"When on, a `YYYY-MM` folder is created under the path above so each " +
		"month's drawings stay together. Currently saving to: {path}",

	// -- settings: insertion size -----------------------------------------
	"settings.imageScale.name": "Picture insertion size (%)",
	"settings.imageScale.desc":
		"100% = the size the picture took up on the Canvas. Images only: a " +
		"note or PDF is rasterised once, so stretching it would just blur it. " +
		"Pictures grow from their top-left corner, so a larger size can overlap " +
		"neighbouring elements. And if a drawing holds only that one picture, " +
		"enlarging it makes no visible difference -- Excalidraw zooms to fit " +
		"when the drawing is opened.",

	// -- settings: sticky notes -------------------------------------------
	"settings.sticky.name": "Turn text cards into sticky notes",
	"settings.sticky.desc":
		"When on, a moved text card becomes an Excalidraw sticky note: a " +
		"coloured card with text that fits itself. When off, the plugin keeps " +
		"producing a plain text element. Note text uses the text card font " +
		"below.",
	"settings.sticky.sizeMode.name": "Note size",
	"settings.sticky.sizeMode.desc":
		"\"Follow the Canvas card\" keeps the size it had on the Canvas; " +
		"\"Fixed size\" gives every note the same box. A note is a fixed-width " +
		"container, so Excalidraw shrinks the text when it does not fit.",
	"settings.sticky.sizeMode.card": "Follow the Canvas card",
	"settings.sticky.sizeMode.fixed": "Fixed size",
	"settings.sticky.width.name": "Note width (px)",
	"settings.sticky.width.desc": "Only used with \"Fixed size\".",
	"settings.sticky.height.name": "Note height (px)",
	"settings.sticky.height.desc": "Only used with \"Fixed size\".",
	"settings.sticky.fontSize.name": "Note font size",
	"settings.sticky.fontSize.desc":
		"Maximum label size; Excalidraw shrinks it further when the text does " +
		"not fit.",
	"settings.sticky.align.name": "Note text alignment",
	"settings.sticky.align.left": "Left",
	"settings.sticky.align.center": "Center",
	"settings.sticky.align.right": "Right",
	"settings.sticky.background.name": "Note colour",
	"settings.sticky.background.desc":
		"\"Follow the card colour\" takes the card's preset colour and " +
		"lightens it, so a saturated colour cannot swallow the text. A card " +
		"with no colour keeps Excalidraw's default fill.",
	"settings.sticky.background.follow": "Follow the card colour (lightened)",
	"settings.sticky.background.custom": "Custom colour",
	"settings.sticky.background.keep": "Leave as default",
	"settings.sticky.color.name": "Custom note colour",

	// -- settings: embeds inside a text card ------------------------------
	"settings.cardEmbed.name": "Pictures inside text cards",
	"settings.cardEmbed.desc":
		"A text card is Markdown, so it can embed pictures " +
		"(![[picture.png]]). An Excalidraw text element does not render " +
		"Markdown -- left alone, the drawing would literally show " +
		"\"![[picture.png]]\".",
	"settings.cardEmbed.image": "Place the picture below the card (recommended)",
	"settings.cardEmbed.text": "Keep only the file name",
	"settings.cardEmbed.keep": "Leave it as written (markers will show)",

	// -- settings: font ---------------------------------------------------
	"settings.font.name": "Text card font",
	"settings.font.desc":
		"Font used by text cards moved into Excalidraw. These are all " +
		"built-in Excalidraw fonts, so no font files are needed in the vault. " +
		"Note: the built-in fonts cover Latin letters only, so Chinese falls " +
		"back to a system font.",

	// Appended to the font's own (untranslated) name.
	"font.virgilNote": " (hand-drawn)",
	"font.cascadiaNote": " (code)",
	"font.localNote": " (a custom font in the vault)",

	// -- settings: non-image files ----------------------------------------
	"settings.nonImage.name": "Non-image files (notes / PDF)",
	"settings.nonImage.desc":
		"What to do when a file node on the canvas points at a Markdown note " +
		"rather than an image. Choosing \"Embed notes as images\" goes through " +
		"the Excalidraw plugin's own rendering (the same path as its \"embed " +
		"file -> as image\" dialog) to put the note into the drawing as a " +
		"picture -- no Excalidraw view needs to be open first. The whole note " +
		"is rendered (equivalent to \"show all\"); embedding a single section " +
		"is not supported yet.",
	"settings.nonImage.skip": "Skip (images only)",
	"settings.nonImage.markdown": "Embed notes as images",
	"settings.nonImage.markdownAndPdf": "Embed both notes and PDFs as images",

	// -- settings: text colour --------------------------------------------
	"settings.textColor.name": "Text card colour",
	"settings.textColor.desc":
		"How a colour on a canvas text card is carried into Excalidraw. The " +
		"colour comes from Obsidian's own --canvas-color-1~6 variables (1 red, " +
		"2 orange, 3 yellow, 4 green, 5 cyan, 6 purple), so it follows your " +
		"current theme. A card with no colour set keeps the Excalidraw " +
		"default.",
	"settings.textColor.text": "Follow the canvas colour -> as the text colour",
	"settings.textColor.background":
		"Follow the canvas colour -> as the text background colour",
	"settings.textColor.ignore": "Leave it alone, use the Excalidraw default",

	// -- settings: naming -------------------------------------------------
	"settings.naming.name": "Naming basis",
	"settings.naming.desc":
		"Which object names the new drawing when several are selected. " +
		"\"Topmost\" takes the smallest y, \"leftmost\" the smallest x; both " +
		"break ties on the other axis. A text card contributes its first 10 " +
		"characters.",
	"settings.naming.topmost": "The topmost object",
	"settings.naming.leftmost": "The leftmost object",

	// -- settings: arrows -------------------------------------------------
	"settings.moveEdges.name": "Move arrows into the drawing too",
	"settings.moveEdges.desc":
		"Arrows inside the selection (both ends selected) are rebuilt in " +
		"Excalidraw as real bound arrows, keeping their direction and their " +
		"connection sides (top/bottom/left/right) exactly as they are on the " +
		"canvas. Turn it off and the drawing holds images and text only, with " +
		"no arrows.",
	"settings.edgePolicy.name": "Arrow (edge) handling",
	"settings.edgePolicy.desc":
		"What happens to arrows attached to the nodes being moved. " +
		"\"Reconnect to the new file\" is lossless: outside arrows are " +
		"repointed at the new drawing node, so a flow is not cut. \"Delete\" " +
		"is tidier, but any connection passing through those nodes " +
		"disappears. Arrows with both ends inside the selection are removed " +
		"under either choice (that relationship is now inside the drawing).",
	"settings.edgePolicy.reconnect": "Reconnect to the new file (lossless)",
	"settings.edgePolicy.delete": "Delete",

	// -- settings: CJK note -----------------------------------------------
	"settings.cjk.name": "About Chinese text",
	"settings.cjk.desc":
		"Built-in fonts such as Lilita One carry no Chinese glyphs, so " +
		"Chinese is drawn with a system font fallback. To give Chinese a " +
		"consistent font as well, enable a local CJK font in the Excalidraw " +
		"plugin's settings.",
};

/** All tables, keyed by resolved language. */
const TABLES: Record<ResolvedLanguage, Record<MessageKey, string>> = { zh, en };

/** The language currently in effect. Starts at the factory default. */
let resolved: ResolvedLanguage = "zh";

/** The shape of `window` we actually rely on. */
interface WindowWithMoment {
	moment?: { locale?: () => string };
}

/**
 * Reads the language Obsidian itself is running in.
 *
 * @returns `"zh"` for any Chinese locale, otherwise `"en"`.
 */
function detectObsidianLanguage(): ResolvedLanguage {
	// 1. Obsidian's own key for the UI language.
	try {
		const stored = window.localStorage.getItem("language");
		if (stored) return stored.toLowerCase().startsWith("zh") ? "zh" : "en";
	} catch {
		// localStorage can throw when storage is disabled; fall through.
	}

	// 2. Obsidian keeps moment's locale in step with the app language.
	try {
		const locale = (window as unknown as WindowWithMoment).moment?.locale?.();
		if (typeof locale === "string" && locale.length > 0) {
			return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
		}
	} catch {
		// Moment is not guaranteed to be loaded; fall through.
	}

	// 3. Last resort. In Electron this is usually the OS locale.
	const nav = typeof navigator === "undefined" ? "" : navigator.language;
	return nav && nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * Turns the stored setting into a concrete language.
 *
 * @param setting - The value from settings.
 * @returns The language to render in.
 */
export function resolveLanguage(setting: LanguageSetting): ResolvedLanguage {
	if (setting === "zh" || setting === "en") return setting;
	return detectObsidianLanguage();
}

/**
 * Applies a setting and remembers the result.
 *
 * @param setting - The value from settings.
 * @returns The language now in effect.
 */
export function setLanguage(setting: LanguageSetting): ResolvedLanguage {
	resolved = resolveLanguage(setting);
	return resolved;
}

/**
 * @returns The language now in effect.
 */
export function currentLanguage(): ResolvedLanguage {
	return resolved;
}

/**
 * Looks up a string, substituting `{name}` placeholders.
 *
 * @param key - Which string to fetch.
 * @param params - Values for any `{...}` placeholders in it.
 * @returns The string in the current language.
 */
export function t(
	key: MessageKey,
	params?: Record<string, string | number>
): string {
	const text = TABLES[resolved][key] ?? zh[key] ?? key;
	if (!params) return text;
	let out = text;
	for (const name of Object.keys(params)) {
		out = out.split(`{${name}}`).join(String(params[name]));
	}
	return out;
}

/**
 * Checks whether a stored value is a usable language setting.
 *
 * @param value - Raw value from `loadData()`.
 * @returns True when it is `"auto"`, `"zh"` or `"en"`.
 */
export function isLanguageSetting(value: unknown): value is LanguageSetting {
	return value === "auto" || value === "zh" || value === "en";
}
