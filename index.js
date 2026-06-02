import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "bot", ".env") });
process.env.BOT_PANEL_PORT = process.env.BOT_PANEL_PORT || process.env.PORT || "10001";

console.log("Loaded bot environment:", {
  DISCORD_TOKEN: Boolean(process.env.DISCORD_TOKEN),
  CLIENT_ID: Boolean(process.env.CLIENT_ID),
  BOT_PANEL_PORT: process.env.BOT_PANEL_PORT
});

try {
  await import("./bot/src/index.js");
} catch (error) {
  console.error("Failed to start bot:", error);
  process.exit(1);
}
