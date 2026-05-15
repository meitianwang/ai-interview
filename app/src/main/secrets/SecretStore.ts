import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import keytar from "keytar";

const SERVICE = "ai-interview";
const SECRET_KEYS = ["anthropicKey", "openaiKey", "huoshanToken"] as const;

type SecretKey = (typeof SECRET_KEYS)[number];
type NonSecretKey = Exclude<keyof Settings, SecretKey>;

export interface Settings {
  resume: string;
  jd: string;
  anthropicKey: string;
  openaiKey: string;
  huoshanAppId: string;
  huoshanToken: string;
}

const DEFAULT_SETTINGS: Settings = {
  resume: "",
  jd: "",
  anthropicKey: "",
  openaiKey: "",
  huoshanAppId: "",
  huoshanToken: "",
};

export class SecretStore {
  private readonly service: string;

  constructor(private readonly opts: { configPath: string; service?: string }) {
    this.service = opts.service ?? SERVICE;
  }

  async loadAll(): Promise<Settings> {
    const nonSecret = await this.loadNonSecret();
    const secrets: Partial<Record<SecretKey, string>> = {};
    for (const key of SECRET_KEYS) {
      secrets[key] = (await keytar.getPassword(this.service, key)) ?? "";
    }

    return { ...DEFAULT_SETTINGS, ...nonSecret, ...secrets };
  }

  async saveAll(settings: Partial<Settings>): Promise<Settings> {
    const normalized = normalizeSettings(settings);
    await mkdir(dirname(this.opts.configPath), { recursive: true });
    await writeFile(this.opts.configPath, JSON.stringify(toNonSecret(normalized), null, 2), "utf8");

    for (const key of SECRET_KEYS) {
      const value = normalized[key];
      if (value) {
        await keytar.setPassword(this.service, key, value);
      } else {
        await keytar.deletePassword(this.service, key);
      }
    }

    return normalized;
  }

  private async loadNonSecret(): Promise<Partial<Pick<Settings, NonSecretKey>>> {
    try {
      const content = await readFile(this.opts.configPath, "utf8");
      const parsed: unknown = JSON.parse(content);
      if (!isRecord(parsed)) {
        console.warn(`[settings] Ignoring non-object config at ${this.opts.configPath}`);
        return {};
      }

      return {
        resume: readString(parsed, "resume"),
        jd: readString(parsed, "jd"),
        huoshanAppId: readString(parsed, "huoshanAppId"),
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return {};
      }

      console.warn(`[settings] Failed to load ${this.opts.configPath}`, error);
      return {};
    }
  }
}

function normalizeSettings(settings: Partial<Settings>): Settings {
  return {
    resume: settings.resume ?? "",
    jd: settings.jd ?? "",
    anthropicKey: settings.anthropicKey ?? "",
    openaiKey: settings.openaiKey ?? "",
    huoshanAppId: settings.huoshanAppId ?? "",
    huoshanToken: settings.huoshanToken ?? "",
  };
}

function toNonSecret(settings: Settings): Pick<Settings, NonSecretKey> {
  return {
    resume: settings.resume,
    jd: settings.jd,
    huoshanAppId: settings.huoshanAppId,
  };
}

function readString(record: Record<string, unknown>, key: NonSecretKey): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
