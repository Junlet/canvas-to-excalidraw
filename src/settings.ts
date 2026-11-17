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
import {
	DEFAULT_IMAGE_SCALE,
	IMAGE_SCALE_MAX,
	IMAGE_SCALE_MIN,
	IMAGE_SCALE_STEP,
	normalizeImageScale,
} from "./sizing";
import {
	isStickyBackgroundMode,
	isStickySizeMode,
	isStickyTextAlign,
	MIN_STICKY_HEIGHT,
	MIN_STICKY_WIDTH,
} from "./sticky";
import { isEmbedMode } from "./cardcontent";

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
	/**
	 * Insertion size for pictures placed into a new drawing, in percent.
	 *
	 * `100` keeps each picture at the size of the Canvas node it came from. Only
	 * plain images honour it: a rasterised note or PDF page is a one-off
	 * snapshot rendered at a fixed size, and stretching it would only blur it.
	 */
	imageScale: number;

	/**
	 * Turn Canvas text cards into Excalidraw sticky notes.
	 *
	 * Off by default: a sticky note is a visually different object (a coloured
	 * container with a fitted label) from the plain text element this plugin
	 * has always produced, so switching it on is a deliberate choice.
	 */
	stickyNoteEnabled: boolean;
	/** `card` (follow the Canvas card's box) | `fixed`. */
	stickyNoteSizeMode: string;
	/** Note width, used when {@link stickyNoteSizeMode} is `fixed`. */
	stickyNoteWidth: number;
	/** Note height, used when {@link stickyNoteSizeMode} is `fixed`. */
	stickyNoteHeight: number;
	/** Maximum label font size; Excalidraw shrinks it further to fit the note. */
	stickyNoteFontSize: number;
	/** `left` | `center` | `right`. */
	stickyNoteTextAlign: string;
	/** `follow` (card colour, lightened) | `custom` | `keep`. */
	stickyNoteBackgroundMode: string;
	/** Fill used when {@link stickyNoteBackgroundMode} is `custom`. */
	stickyNoteBackgroundColor: string;

	/**
	 * What to do with Markdown picture embeds inside a text card.
	 *
	 * `keep` copies the marker verbatim, `text` reduces it to the file name,
	 * `image` places the picture below the card.
	 *
	 * Defaults to `image`, because a text element renders no Markdown: the
	 * marker would otherwise appear in the drawing as literal
	 * `![[file.png]]`, which is what this setting exists to fix.
	 */
	textCardEmbedMode: string;
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
	imageScale: DEFAULT_IMAGE_SCALE,

	stickyNoteEnabled: false,
	stickyNoteSizeMode: "card",
	stickyNoteWidth: 240,
	stickyNoteHeight: 160,
	stickyNoteFontSize: 20,
	stickyNoteTextAlign: "left",
	stickyNoteBackgroundMode: "follow",
	stickyNoteBackgroundColor: "#ffec99",
	textCardEmbedMode: "image",
};

/** Highest accepted note dimension, in pixels. */
const STICKY_NOTE_SIZE_MAX = 600;

/** Range accepted for a note width, in pixels. */
const STICKY_NOTE_WIDTH_RANGE: readonly [number, number] = [
	MIN_STICKY_WIDTH,
	STICKY_NOTE_SIZE_MAX,
];

/** Range accepted for a note height, in pixels. */
const STICKY_NOTE_HEIGHT_RANGE: readonly [number, number] = [
	MIN_STICKY_HEIGHT,
	STICKY_NOTE_SIZE_MAX,
];

/** Range accepted for the note's label font size. */
const STICKY_NOTE_FONT_RANGE: readonly [number, number] = [8, 48];

/**
 * Coerces a stored number into a range.
 *
 * @param value - Raw stored value.
 * @param range - Lowest and highest accepted values.
 * @param fallback - Value used when the input is not a number.
 * @returns A whole number inside the range.
 */
function clampNumber(
	value: unknown,
	range: readonly [number, number],
	fallback: number
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(range[1], Math.max(range[0], Math.round(value)));
}

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
	merged.imageScale = normalizeImageScale(merged.imageScale);

	if (typeof merged.stickyNoteEnabled !== "boolean") {
		merged.stickyNoteEnabled = DEFAULT_SETTINGS.stickyNoteEnabled;
	}
	if (!isStickySizeMode(merged.stickyNoteSizeMode)) {
		merged.stickyNoteSizeMode = DEFAULT_SETTINGS.stickyNoteSizeMode;
	}
	if (!isStickyTextAlign(merged.stickyNoteTextAlign)) {
		merged.stickyNoteTextAlign = DEFAULT_SETTINGS.stickyNoteTextAlign;
	}
	if (!isStickyBackgroundMode(merged.stickyNoteBackgroundMode)) {
		merged.stickyNoteBackgroundMode =
			DEFAULT_SETTINGS.stickyNoteBackgroundMode;
	}
	merged.stickyNoteWidth = clampNumber(
		merged.stickyNoteWidth,
		STICKY_NOTE_WIDTH_RANGE,
		DEFAULT_SETTINGS.stickyNoteWidth
	);
	merged.stickyNoteHeight = clampNumber(
		merged.stickyNoteHeight,
		STICKY_NOTE_HEIGHT_RANGE,
		DEFAULT_SETTINGS.stickyNoteHeight
	);
	merged.stickyNoteFontSize = clampNumber(
		merged.stickyNoteFontSize,
		STICKY_NOTE_FONT_RANGE,
		DEFAULT_SETTINGS.stickyNoteFontSize
	);
	if (
		typeof merged.stickyNoteBackgroundColor !== "string" ||
		!/^#[0-9a-f]{6}$/iu.test(merged.stickyNoteBackgroundColor.trim())
	) {
		merged.stickyNoteBackgroundColor =
			DEFAULT_SETTINGS.stickyNoteBackgroundColor;
	}
	if (!isEmbedMode(merged.textCardEmbedMode)) {
		merged.textCardEmbedMode = DEFAULT_SETTINGS.textCardEmbedMode;
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

	/**
	 * Renders the sticky-note rows.
	 *
	 * Only the rows that currently matter are shown: the two size sliders appear
	 * for the "fixed" rule, and the colour picker for the "custom" fill. That
	 * keeps the pane short, and makes the interaction between the rows obvious
	 * instead of leaving three dead controls on screen.
	 *
	 * @param containerEl - The settings pane.
	 */
	private renderStickySettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(t("settings.sticky.sizeMode.name"))
			.setDesc(t("settings.sticky.sizeMode.desc"))
			.addDropdown((dropdown) => {
				dropdown.addOption(
					"card",
					t("settings.sticky.sizeMode.card")
				);
				dropdown.addOption(
					"fixed",
					t("settings.sticky.sizeMode.fixed")
				);
				dropdown
					.setValue(this.plugin.settings.stickyNoteSizeMode)
					.onChange(async (value) => {
						this.plugin.settings.stickyNoteSizeMode =
							isStickySizeMode(value)
								? value
								: DEFAULT_SETTINGS.stickyNoteSizeMode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.stickyNoteSizeMode === "fixed") {
			this.renderStickySizeSlider(
				containerEl,
				t("settings.sticky.width.name"),
				t("settings.sticky.width.desc"),
				MIN_STICKY_WIDTH,
				() => this.plugin.settings.stickyNoteWidth,
				(value) => {
					this.plugin.settings.stickyNoteWidth = value;
				}
			);
			this.renderStickySizeSlider(
				containerEl,
				t("settings.sticky.height.name"),
				t("settings.sticky.height.desc"),
				MIN_STICKY_HEIGHT,
				() => this.plugin.settings.stickyNoteHeight,
				(value) => {
					this.plugin.settings.stickyNoteHeight = value;
				}
			);
		}

		new Setting(containerEl)
			.setName(t("settings.sticky.fontSize.name"))
			.setDesc(t("settings.sticky.fontSize.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(
						STICKY_NOTE_FONT_RANGE[0],
						STICKY_NOTE_FONT_RANGE[1],
						1
					)
					.setValue(this.plugin.settings.stickyNoteFontSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.stickyNoteFontSize = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.sticky.align.name"))
			.addDropdown((dropdown) => {
				dropdown.addOption("left", t("settings.sticky.align.left"));
				dropdown.addOption("center", t("settings.sticky.align.center"));
				dropdown.addOption("right", t("settings.sticky.align.right"));
				dropdown
					.setValue(this.plugin.settings.stickyNoteTextAlign)
					.onChange(async (value) => {
						this.plugin.settings.stickyNoteTextAlign =
							isStickyTextAlign(value)
								? value
								: DEFAULT_SETTINGS.stickyNoteTextAlign;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.sticky.background.name"))
			.setDesc(t("settings.sticky.background.desc"))
			.addDropdown((dropdown) => {
				dropdown.addOption(
					"follow",
					t("settings.sticky.background.follow")
				);
				dropdown.addOption(
					"custom",
					t("settings.sticky.background.custom")
				);
				dropdown.addOption(
					"keep",
					t("settings.sticky.background.keep")
				);
				dropdown
					.setValue(this.plugin.settings.stickyNoteBackgroundMode)
					.onChange(async (value) => {
						this.plugin.settings.stickyNoteBackgroundMode =
							isStickyBackgroundMode(value)
								? value
								: DEFAULT_SETTINGS.stickyNoteBackgroundMode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.stickyNoteBackgroundMode === "custom") {
			new Setting(containerEl)
				.setName(t("settings.sticky.color.name"))
				.addColorPicker((picker) =>
					picker
						.setValue(
							this.plugin.settings.stickyNoteBackgroundColor
						)
						.onChange(async (value) => {
							this.plugin.settings.stickyNoteBackgroundColor =
								value;
							await this.plugin.saveSettings();
						})
				);
		}
	}

	/**
	 * Renders one note-dimension slider.
	 *
	 * @param containerEl - The settings pane.
	 * @param name - Row label.
	 * @param desc - Row description.
	 * @param min - Lowest accepted value; also the slider's lower bound.
	 * @param read - Reads the current value.
	 * @param write - Stores the new value.
	 */
	private renderStickySizeSlider(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		min: number,
		read: () => number,
		write: (value: number) => void
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addSlider((slider) =>
				slider
					.setLimits(min, STICKY_NOTE_SIZE_MAX, 10)
					.setValue(read())
					.setDynamicTooltip()
					.onChange(async (value) => {
						write(value);
						await this.plugin.saveSettings();
					})
			);
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
			.setName(t("settings.imageScale.name"))
			.setDesc(t("settings.imageScale.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(
						IMAGE_SCALE_MIN,
						IMAGE_SCALE_MAX,
						IMAGE_SCALE_STEP
					)
					.setValue(this.plugin.settings.imageScale)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.imageScale =
							normalizeImageScale(value);
						await this.plugin.saveSettings();
					})
			);

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
			.setName(t("settings.sticky.name"))
			.setDesc(t("settings.sticky.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stickyNoteEnabled)
					.onChange(async (value) => {
						this.plugin.settings.stickyNoteEnabled = value;
						await this.plugin.saveSettings();
						// Re-render so the dependent rows below follow immediately.
						this.display();
					})
			);

		// The remaining sticky rows only matter once the feature is on, and
		// hiding them keeps the pane readable when it is off.
		if (this.plugin.settings.stickyNoteEnabled) {
			this.renderStickySettings(containerEl);
		}

		new Setting(containerEl)
			.setName(t("settings.cardEmbed.name"))
			.setDesc(t("settings.cardEmbed.desc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("image", t("settings.cardEmbed.image"));
				dropdown.addOption("text", t("settings.cardEmbed.text"));
				dropdown.addOption("keep", t("settings.cardEmbed.keep"));
				dropdown
					.setValue(this.plugin.settings.textCardEmbedMode)
					.onChange(async (value) => {
						this.plugin.settings.textCardEmbedMode = isEmbedMode(
							value
						)
							? value
							: DEFAULT_SETTINGS.textCardEmbedMode;
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
