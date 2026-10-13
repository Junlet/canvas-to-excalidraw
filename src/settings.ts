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
import {
	isLanguageSetting,
	setLanguage,
	t,
	type LanguageSetting,
	type MessageKey,
} from "./i18n";
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

/**
 * The language dropdown rows, in display order.
 *
 * Written out rather than derived from the setting values so the keys stay
 * checked: a typo here is a compile error, not a missing string at runtime.
 */
const LANGUAGE_ROWS: ReadonlyArray<{
	value: LanguageSetting;
	key: MessageKey;
}> = [
	{ value: "auto", key: "settings.language.auto" },
	{ value: "zh", key: "settings.language.zh" },
	{ value: "en", key: "settings.language.en" },
];

/** A selectable Excalidraw font. */
export interface FontOption {
	/** Numeric `fontFamily` value Excalidraw stores on the element. */
	value: number;
	/** Font name shown in the settings dropdown. A proper noun, untranslated. */
	label: string;
	/**
	 * Message key for the note appended to {@link label}, when the font needs
	 * one.
	 *
	 * Kept as a key rather than a string so it is resolved while the settings
	 * pane is being drawn, not when this module is imported.
	 */
	noteKey?: MessageKey;
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
	{ value: 1, label: "Virgil", noteKey: "font.virgilNote", cjk: false },
	{ value: 2, label: "Helvetica", cjk: false },
	{ value: 3, label: "Cascadia", noteKey: "font.cascadiaNote", cjk: false },
	{ value: 4, label: "Local Font", noteKey: "font.localNote", cjk: false },
	{ value: 5, label: "Excalifont", cjk: false },
	{ value: 6, label: "Nunito", cjk: false },
	{ value: 7, label: "Lilita One", cjk: false },
	{ value: 8, label: "Comic Shanns", cjk: false },
	{ value: 9, label: "Liberation Sans", cjk: false },
];

/**
 * Builds the label shown for a font in the dropdown.
 *
 * @param option - The font.
 * @returns The font's name, plus its translated note when it has one.
 */
function formatFontLabel(option: FontOption): string {
	return option.noteKey
		? option.label + t(option.noteKey)
		: option.label;
}

/** Persisted plugin settings. */
export interface CanvasToExcalidrawSettings {
	/** Interface language: follow Obsidian, or pin Chinese / English. */
	language: LanguageSetting;
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

/**
 * Settings used on first install and for any missing key.
 *
 * `language` defaults to `"zh"` rather than `"auto"` on purpose: it keeps the
 * wording of an existing install byte-for-byte what it was before the language
 * setting existed.
 */
export const DEFAULT_SETTINGS: CanvasToExcalidrawSettings = {
	language: "zh",
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
	if (!isLanguageSetting(merged.language)) {
		merged.language = DEFAULT_SETTINGS.language;
	}
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
				return t("settings.folder.inherited");
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
				t("settings.folder.desc", { path: preview() })
			);
			monthSetting.setDesc(
				t("settings.folder.monthDesc", { path: preview() })
			);
		};

		folderSetting = new Setting(containerEl)
			.setName(t("settings.folder.name"))
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
			.setName(t("settings.folder.monthName"))
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

		// The language row comes first so it is reachable even when the rest of
		// the pane is in a language the user cannot read.
		new Setting(containerEl)
			.setName(t("settings.language.name"))
			.setDesc(t("settings.language.desc"))
			.addDropdown((dropdown) => {
				for (const row of LANGUAGE_ROWS) {
					dropdown.addOption(row.value, t(row.key));
				}
				dropdown
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = isLanguageSetting(value)
							? value
							: DEFAULT_SETTINGS.language;
						await this.plugin.saveSettings();
						setLanguage(this.plugin.settings.language);
						// Re-render so the rest of the pane follows immediately.
						this.display();
					});
			});

		this.renderFolderSettings(containerEl);

		new Setting(containerEl)
			.setName(t("settings.font.name"))
			.setDesc(t("settings.font.desc"))
			.addDropdown((dropdown) => {
				for (const option of FONT_OPTIONS) {
					dropdown.addOption(
						String(option.value),
						formatFontLabel(option)
					);
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
			.setName(t("settings.nonImage.name"))
			.setDesc(t("settings.nonImage.desc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("skip", t("settings.nonImage.skip"));
				dropdown.addOption(
					"markdown",
					t("settings.nonImage.markdown")
				);
				dropdown.addOption(
					"markdown-and-pdf",
					t("settings.nonImage.markdownAndPdf")
				);
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
			.setName(t("settings.textColor.name"))
			.setDesc(t("settings.textColor.desc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("text", t("settings.textColor.text"));
				dropdown.addOption(
					"background",
					t("settings.textColor.background")
				);
				dropdown.addOption("ignore", t("settings.textColor.ignore"));
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
			.setName(t("settings.naming.name"))
			.setDesc(t("settings.naming.desc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("topmost", t("settings.naming.topmost"));
				dropdown.addOption("leftmost", t("settings.naming.leftmost"));
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
			.setName(t("settings.moveEdges.name"))
			.setDesc(t("settings.moveEdges.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.moveEdgesIntoDrawing)
					.onChange(async (value) => {
						this.plugin.settings.moveEdgesIntoDrawing = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.edgePolicy.name"))
			.setDesc(t("settings.edgePolicy.desc"))
			.addDropdown((dropdown) => {
				dropdown.addOption(
					"reconnect",
					t("settings.edgePolicy.reconnect")
				);
				dropdown.addOption("delete", t("settings.edgePolicy.delete"));
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
			.setName(t("settings.cjk.name"))
			.setDesc(t("settings.cjk.desc"));
	}
}
