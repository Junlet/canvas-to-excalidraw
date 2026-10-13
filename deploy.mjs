import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const pluginId = "canvas-to-excalidraw";

// Default target: the vault this project lives in (<vault>/插件开发/canvas-to-excalidraw).
// Override with OBSIDIAN_PLUGIN_DIR when the source is kept outside the vault.
const vaultDir = resolve(projectDir, "..", "..");
const targetDir =
	process.env.OBSIDIAN_PLUGIN_DIR || join(vaultDir, ".obsidian", "plugins", pluginId);

const SHIPPED_FILES = ["main.js", "manifest.json", "styles.css"];

if (!existsSync(join(projectDir, "main.js"))) {
	console.error("[deploy] main.js not found. Run `npm run build` first.");
	process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

for (const file of SHIPPED_FILES) {
	const src = join(projectDir, file);
	if (!existsSync(src)) continue;
	copyFileSync(src, join(targetDir, file));
	console.log("[deploy] ->", file);
}

console.log("[deploy] target:", targetDir);
console.log("[deploy] done. Reload the plugin in Obsidian to see changes.");
