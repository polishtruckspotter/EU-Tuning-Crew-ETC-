import fs from "node:fs";
import path from "node:path";



function escapeForText(s) {
  return String(s ?? "");
}

function resolveConfigPath() {
  // Use ESM-safe path resolution.
  const configPath = path.join(process.cwd(), "bot", "data", "config.json");
  return configPath;
}


export default async function handler(req, res) {
  let cfg = {};
  try {
    const configPath = resolveConfigPath();
    const raw = fs.readFileSync(configPath, "utf8");
    cfg = JSON.parse(raw || "{}");
  } catch {
    cfg = {};
  }

  const serverEmbed = {
    title: escapeForText(cfg.welcomeEmbedTitle),
    description: escapeForText(cfg.welcomeEmbedDescription),
    color: escapeForText(cfg.welcomeEmbedColor),
    imageUrl: escapeForText(cfg.welcomeEmbedImageUrl)
  };

  const dmEmbed = {
    title: escapeForText(cfg.welcomeDmEmbedTitle ?? cfg.welcomeEmbedTitle),
    description: escapeForText(cfg.welcomeDmEmbedDescription ?? cfg.welcomeEmbedDescription),
    color: escapeForText(cfg.welcomeDmEmbedColor ?? cfg.welcomeEmbedColor),
    imageUrl: escapeForText(cfg.welcomeDmEmbedImageUrl ?? cfg.welcomeEmbedImageUrl)
  };

  res.json({ serverEmbed, dmEmbed });
};



