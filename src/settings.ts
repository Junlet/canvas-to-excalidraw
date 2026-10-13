/**
 * Plugin settings.
 *
 * Only one thing is configurable so far: which Excalidraw font the moved text
 * cards are written in.
 *
 * The font list and the numeric ids are taken verbatim from the Excalidraw
 * plugin's own `EXCALIDRAW_AUTOMATE_INFO` entry for `style.fontFamily`:
 *
 *   1: Virgil, 2: Helvetica, 3: Cascadia, 4: Local Font, 5: Excalifont,
 *   6: Nunito, 7: Lilita One, 8: Comic Shanns, 9: Liberation Sans
 *
 * These are *built-in* Excalidraw fonts -- picking one needs no font files in
 * the vault. "Local Font" (4) is the escape hatch for a font the user installed
 * into the vault themselves.
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type CanvasToExcalidrawPlugin from "./main";
import { isEdgePolicy, type EdgePolicy } from "./edges";
import { isNamingAnchor, type NamingAnchor } from "./canvas";
import { isTextColorMode, type TextColorMode } from "./colors";
import { isNonImageMode, type NonImageMode } from "./attachments";
import {
	DEFAULT_DRAWING_FOLDER,
	isFolderSetting,
	normalizeVaultFolder,
	resolveDrawingFolder,
} from "./folders";

/** A selectable Excalidraw font. */
export interface FontOption {
	/** Numeric `fontFamily` value Excalidraw stores on the element. */
	value: number;
	/** Name shown in the settings dropdown. */
	label: string;
	/**
	 * Whether the font ships with glyphs for CJK text.
	 *
	 * All of Excalidraw's built-in fonts are Latin-only, so Chinese text always
	 * falls back to whatever the platform provides. This flag exists so the
	 * settings UI can say so plainly instead of letting the user discover it in
	 * a rendered drawing.
	 */
	cjk: boolean;
}

/**
 * Built-in Excalidraw fonts, in the plugin's own documented order.
 *
 * No built-in font covers CJK, hence `cjk: false` throughout.
 */
export const FONT_OPTIONS: FontOption[] = [
	{ value: 1, label: "Virgil（手绘）", cjk: false },
	{ value: 2, label: "Helvetica", cjk: false },
	{ value: 3, label: "Cascadia（代码）", cjk: false },
	{ value: 4, label: "Local Font（仓库内自定义字体）", cjk: false },
	{ value: 5, label: "Excalifont", cjk: false },
	{ value: 6, label: "Nunito", cjk: false },
	{ value: 7, label: "Lilita One", cjk: false },
	{ value: 8, label: "Comic Shanns", cjk: false },
	{ value: 9, label: "Liberation Sans", cjk: false },
];

/** Persisted plugin settings. */
export interface CanvasToExcalidrawSettings {
	/** `fontFamily` applied to text cards moved into a drawing. */
	textFontFamily: number;
	/** What happens to arrows that touched a moved node. */
	edgePolicy: EdgePolicy;
	/** Whether the topmost or the leftmost selected node names the drawing. */
	namingAnchor: NamingAnchor;
	/** Whether arrows between moved nodes are recreated inside the drawing. */
	moveEdgesIntoDrawing: boolean;
	/** How a Canvas card colour is carried into the drawing. */
	textColorMode: TextColorMode;
	/** Whether non-image files are embedded as rendered images. */
	nonImageMode: NonImageMode;
	/**
	 * Vault folder new drawings are written into.
	 *
	 * Empty string means the vault root.
	 */
	drawingFolder: string;
	/** Whether a `YYYY-MM` sub-folder is appended to {@link drawingFolder}. */
	monthSubfolders: boolean;
}

/** Excalidraw's own default when no font is specified. */
const DEFAULT_FONT_FAMILY = 7;

/**
 * Default edge policy.
 *
 * `reconnect` is the default because it is lossless: a diagram's flow survives
 * the move instead of being cut wherever the selection boundary fell.
 */
const DEFAULT_EDGE_POLICY: EdgePolicy = "reconnect";

/** Matches the long-standing behaviour: topmost wins, `x` breaks ties. */
const DEFAULT_NAMING_ANCHOR: NamingAnchor = "topmost";

/**
 * Arrows between moved nodes are recreated inside the drawing by default:
 * a flow drawn on the Canvas should still read as the same flow after the move.
 */
const DEFAULT_MOVE_EDGES_INTO_DRAWING = true;

/**
 * Canvas card colours become Excalidraw text colours by default.
 *
 * A Canvas card's preset tints the whole card, whereas an Excalidraw text
 * element has separate foreground and background; colouring the glyphs is the
 * plainer reading of "the text's colour", and `background` is available for
 * users who want the card-like fill instead.
 */
const DEFAULT_TEXT_COLOR_MODE: TextColorMode = "text";

/**
 * Markdown notes referenced from a Canvas become pictures in the drawing.
 *
 * Canvas file nodes regularly point at notes rather than images, and dropping
 * them silently would lose content the user can plainly see on the Canvas.
 */
const DEFAULT_NON_IMAGE_MODE: NonImageMode = "markdown";

/**
 * Monthly sub-folders are on by default.
 *
 * A drawing per drag adds up quickly, and grouping by month keeps one folder
 * from growing without bound.
 */
const DEFAULT_MONTH_SUBFOLDERS = true;

/** Settings used on first install and for any missing key. */
export const DEFAULT_SETTINGS: CanvasToExcalidrawSettings = {
	textFontFamily: DEFAULT_FONT_FAMILY,
	edgePolicy: DEFAULT_EDGE_POLICY,
	namingAnchor: DEFAULT_NAMING_ANCHOR,
	moveEdgesIntoDrawing: DEFAULT_MOVE_EDGES_INTO_DRAWING,
	textColorMode: DEFAULT_TEXT_COLOR_MODE,
	nonImageMode: DEFAULT_NON_IMAGE_MODE,
	drawingFolder: DEFAULT_DRAWING_FOLDER,
	monthSubfolders: DEFAULT_MONTH_SUBFOLDERS,
};

/**
 * Reports whether a value is one of the known built-in font ids.
 *
 * @param value - Candidate font id.
 * @returns True when the id appears in {@link FONT_OPTIONS}.
 */
export function isKnownFontFamily(value: unknown): value is number {
	return (
		typeof value === "number" &&
		FONT_OPTIONS.some((option) => option.value === value)
	);
}

/**
 * Merges stored data over the defaults, rejecting unusable font ids.
 *
 * @param stored - Raw value from `loadData()`.
 * @returns Valid settings.
 */
export function normalizeSettings(
	stored: Partial<CanvasToExcalidrawSettings> | null
): CanvasToExcalidrawSettings {
	const merged = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	if (!isKnownFontFamily(merged.textFontFamily)) {
		merged.textFontFamily = DEFAULT_SETTINGS.textFontFamily;
	}
	if (!isEdgePolicy(merged.edgePolicy)) {
		merged.edgePolicy = DEFAULT_SETTINGS.edgePolicy;
	}
	if (!isNamingAnchor(merged.namingAnchor)) {
		merged.namingAnchor = DEFAULT_SETTINGS.namingAnchor;
	}
	if (typeof merged.moveEdgesIntoDrawing !== "boolean") {
		merged.moveEdgesIntoDrawing = DEFAULT_SETTINGS.moveEdgesIntoDrawing;
	}
	if (!isTextColorMode(merged.textColorMode)) {
		merged.textColorMode = DEFAULT_SETTINGS.textColorMode;
	}
	if (!isNonImageMode(merged.nonImageMode)) {
		merged.nonImageMode = DEFAULT_SETTINGS.nonImageMode;
	}
	if (!isFolderSetting(merged.drawingFolder)) {
		merged.drawingFolder = DEFAULT_SETTINGS.drawingFolder;
	}
	if (typeof merged.monthSubfolders !== "boolean") {
		merged.monthSubfolders = DEFAULT_SETTINGS.monthSubfolders;
	}
	return merged;
}

/** Settings tab shown under Settings -> Community plugins -> this plugin. */
export class CanvasToExcalidrawSettingTab extends PluginSettingTab {
	private readonly plugin: CanvasToExcalidrawPlugin;

	constructor(app: App, plugin: CanvasToExcalidrawPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Renders the two folder settings, keeping the example path live.
	 *
	 * A typed folder path is easy to get subtly wrong, so both descriptions show
	 * exactly where the next drawing would land and update as the controls
	 * change.
	 */
	private renderFolderSettings(containerEl: HTMLElement): void {
		const preview = (): string => {
			if (normalizeVaultFolder(this.plugin.settings.drawingFolder).length === 0) {
				return "（沿用 Excalidraw 插件设置里的目录）";
			}
			const resolved = resolveDrawingFolder(
				this.plugin.settings.drawingFolder,
				this.plugin.settings.monthSubfolders
			);
			return `${resolved}/`;
		};

		let folderSetting: Setting;
		let monthSetting: Setting;

		const refresh = (): void => {
			folderSetting.setDesc(
				`新图纸会保存到这里：${preview()}。` +
					"留空表示沿用 Excalidraw 插件设置里的目录；" +
					"文件夹不存在时会自动创建。"
			);
			monthSetting.setDesc(
				"开启后，会在上面的路径下再建一个 `YYYY-MM` 文件夹，" +
					"让每个月的图纸归到一起。" +
					`当前将会保存到：${preview()}`
			);
		};

		folderSetting = new Setting(containerEl)
			.setName("新建图纸的保存路径")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_DRAWING_FOLDER)
					.setValue(this.plugin.settings.drawingFolder)
					.onChange(async (value) => {
						this.plugin.settings.drawingFolder = value;
						await this.plugin.saveSettings();
						refresh();
					})
			);

		monthSetting = new Setting(containerEl)
			.setName("按月分文件夹")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.monthSubfolders)
					.onChange(async (value) => {
						this.plugin.settings.monthSubfolders = value;
						await this.plugin.saveSettings();
						refresh();
					})
			);

		refresh();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderFolderSettings(containerEl);

		new Setting(containerEl)
			.setName("文本卡片字体")
			.setDesc(
				"移入 Excalidraw 的文本卡片使用的字体。这些都是 Excalidraw 内置字体，无需在仓库里放字体文件。" +
					"注意：内置字体只覆盖拉丁字母，中文会回退到系统字体。"
			)
			.addDropdown((dropdown) => {
				for (const option of FONT_OPTIONS) {
					dropdown.addOption(String(option.value), option.label);
				}
				dropdown
					.setValue(String(this.plugin.settings.textFontFamily))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						this.plugin.settings.textFontFamily = isKnownFontFamily(
							parsed
						)
							? parsed
							: DEFAULT_SETTINGS.textFontFamily;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("非图片文件（笔记 / PDF）")
			.setDesc(
				"画布上的文件节点如果指向的是 Markdown 笔记而不是图片，怎么处理。" +
					"选「笔记以图像形式嵌入」会调用 Excalidraw 插件自己的渲染（就是它「嵌入文件 → 以图像形式」那条路径），" +
					"把笔记渲染成图片放进图纸——不需要先打开一个 Excalidraw 视图。" +
					"整篇笔记会被渲染（相当于「显示全部」），暂不支持只嵌入某个章节。"
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("skip", "跳过（只移入图片）");
				dropdown.addOption("markdown", "笔记以图像形式嵌入");
				dropdown.addOption("markdown-and-pdf", "笔记 + PDF 都以图像形式嵌入");
				dropdown
					.setValue(this.plugin.settings.nonImageMode)
					.onChange(async (value) => {
						this.plugin.settings.nonImageMode = isNonImageMode(value)
							? value
							: DEFAULT_SETTINGS.nonImageMode;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("文本卡片颜色")
			.setDesc(
				"画布上的文字卡片如果有颜色，怎么带进 Excalidraw。" +
					"颜色取自 Obsidian 自己的 --canvas-color-1~6 变量（1 红 2 橙 3 黄 4 绿 5 青 6 紫），所以会跟随你当前的主题。" +
					"没有设过颜色的卡片保持 Excalidraw 默认。"
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("text", "跟随画布颜色 → 作为文字颜色");
				dropdown.addOption("background", "跟随画布颜色 → 作为文字背景色");
				dropdown.addOption("ignore", "不处理，用 Excalidraw 默认");
				dropdown
					.setValue(this.plugin.settings.textColorMode)
					.onChange(async (value) => {
						this.plugin.settings.textColorMode = isTextColorMode(value)
							? value
							: DEFAULT_SETTINGS.textColorMode;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("命名依据")
			.setDesc(
				"选中多个对象时，用哪个对象的名字给新图纸命名。" +
					"「最上面的」按纵坐标最小选，「最左边的」按横坐标最小选；" +
					"两者都会用另一个轴做平局判定。文字卡片取前 10 个字。"
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("topmost", "最上面的对象");
				dropdown.addOption("leftmost", "最左边的对象");
				dropdown
					.setValue(this.plugin.settings.namingAnchor)
					.onChange(async (value) => {
						this.plugin.settings.namingAnchor = isNamingAnchor(value)
							? value
							: DEFAULT_SETTINGS.namingAnchor;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("把箭头也移进图纸")
			.setDesc(
				"选中范围内的箭头（两端都被选中的）会在 Excalidraw 里重建成真正的绑定箭头，" +
					"方向与连接边（上/下/左/右）都按画布上的原样保留。" +
					"关闭后图纸里只有图片和文字，不会有箭头。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.moveEdgesIntoDrawing)
					.onChange(async (value) => {
						this.plugin.settings.moveEdgesIntoDrawing = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("箭头（边）处理")
			.setDesc(
				"被移走的节点上连着的箭头怎么办。" +
					"「改接到新文件」无损：外部箭头会重新指向新建的图纸节点，流程图不会断。" +
					"「直接删除」更干净：但会让经过这些节点的连线消失。" +
					"两端都在选区里的箭头无论选哪个都会被删除（它已经变成图纸内部的关系）。"
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("reconnect", "改接到新文件（无损）");
				dropdown.addOption("delete", "直接删除");
				dropdown
					.setValue(this.plugin.settings.edgePolicy)
					.onChange(async (value) => {
						this.plugin.settings.edgePolicy = isEdgePolicy(value)
							? value
							: DEFAULT_SETTINGS.edgePolicy;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("中文显示说明")
			.setDesc(
				"Lilita One 等内置字体没有中文字形，中文会由系统字体回退渲染。" +
					"若要让中文也用统一字体，可在 Excalidraw 插件设置里开启本地 CJK 字体。"
			);
	}
}
