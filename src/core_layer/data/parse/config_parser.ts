import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";
import type { AppConfig } from "../model/app_config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.resolve(__dirname, "../../../../config");

export function parse_config(env: string): AppConfig {
  const file_path = path.join(CONFIG_DIR, `${env}.yaml`);
  const content = fs.readFileSync(file_path, "utf8");
  return yaml.parse(content) as AppConfig;
}
