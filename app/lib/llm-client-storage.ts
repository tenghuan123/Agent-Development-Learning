import { useSyncExternalStore } from "react";

export const STORAGE_KEY_API_KEY = "MINI_CLAUDE_API_KEY";
export const STORAGE_KEY_BASE_URL = "MINI_CLAUDE_BASE_URL";
export const STORAGE_KEY_MODEL = "MINI_CLAUDE_MODEL";

export const CONFIG_CHANGE_EVENT = "mini-claude:config-change";

export interface ClientLLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  badge: string;
  tagColor: string;
  baseURL: string;
  recommendedModel: string;
  description: string;
  websiteUrl: string;
  keyPlaceholder: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "zhipu",
    name: "智谱 GLM",
    badge: "免费/高稳定",
    tagColor: "border-blue-500/30 text-blue-300 bg-blue-500/10",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    recommendedModel: "glm-4-flash",
    description: "国内直接连通，官方提供 GLM-4-Flash 免费高并发调用",
    websiteUrl: "https://open.bigmodel.cn",
    keyPlaceholder: "输入智谱 API Key (例如：d89b...)",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "极高性价比",
    tagColor: "border-cyan-500/30 text-cyan-300 bg-cyan-500/10",
    baseURL: "https://api.deepseek.com/v1",
    recommendedModel: "deepseek-chat",
    description: "百万 Token 仅 1~2 元人民币，代码理解与推理能力卓越",
    websiteUrl: "https://platform.deepseek.com",
    keyPlaceholder: "输入 DeepSeek API Key (例如：sk-...)",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    badge: "顶级全模型",
    tagColor: "border-purple-500/30 text-purple-300 bg-purple-500/10",
    baseURL: "https://openrouter.ai/api/v1",
    recommendedModel: "anthropic/claude-3.5-sonnet",
    description: "聚合 Claude 3.5 Sonnet, GPT-4o, Gemini 2.5 等全球顶级大模型",
    websiteUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "输入 OpenRouter API Key (例如：sk-or-v1-...)",
  },
  {
    id: "custom",
    name: "自定义网关",
    badge: "OpenAI 兼容",
    tagColor: "border-slate-500/30 text-slate-300 bg-slate-500/10",
    baseURL: "",
    recommendedModel: "",
    description: "支持 OneAPI, NewAPI, 本地 Ollama 或私有中转反代",
    websiteUrl: "",
    keyPlaceholder: "自定义 API Key",
  },
];

/**
 * 安全脱敏显示 API Key
 */
export function maskApiKey(key?: string): string {
  if (!key || !key.trim()) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return trimmed.slice(0, 2) + "..." + trimmed.slice(-2);
  }
  return trimmed.slice(0, 4) + "..." + trimmed.slice(-4);
}

/**
 * 读取当前浏览器 LocalStorage 配置
 */
export function getClientLLMConfig(defaults?: {
  baseURL?: string;
  model?: string;
}): ClientLLMConfig {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      apiKey: "",
      baseURL: defaults?.baseURL || "https://open.bigmodel.cn/api/paas/v4",
      model: defaults?.model || "glm-4-flash",
    };
  }

  const storedKey = window.localStorage.getItem(STORAGE_KEY_API_KEY) || "";
  const storedURL =
    window.localStorage.getItem(STORAGE_KEY_BASE_URL) ||
    defaults?.baseURL ||
    "https://open.bigmodel.cn/api/paas/v4";
  const storedModel =
    window.localStorage.getItem(STORAGE_KEY_MODEL) ||
    defaults?.model ||
    "glm-4-flash";

  return {
    apiKey: storedKey.trim(),
    baseURL: storedURL.trim(),
    model: storedModel.trim(),
  };
}

/**
 * 写入配置并广播事件，通知所有组件和跨 Tab 同步
 */
export function saveClientLLMConfig(config: {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  if (config.apiKey !== undefined) {
    const key = config.apiKey.trim();
    if (key) {
      window.localStorage.setItem(STORAGE_KEY_API_KEY, key);
    } else {
      window.localStorage.removeItem(STORAGE_KEY_API_KEY);
    }
  }

  if (config.baseURL !== undefined) {
    const url = config.baseURL.trim();
    if (url) {
      window.localStorage.setItem(STORAGE_KEY_BASE_URL, url);
    } else {
      window.localStorage.removeItem(STORAGE_KEY_BASE_URL);
    }
  }

  if (config.model !== undefined) {
    const model = config.model.trim();
    if (model) {
      window.localStorage.setItem(STORAGE_KEY_MODEL, model);
    } else {
      window.localStorage.removeItem(STORAGE_KEY_MODEL);
    }
  }

  // 派发同一标签页内的自定义事件
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT));
}

/**
 * 一键清除本地所有的凭证与自定义配置
 */
export function clearClientLLMConfig(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY_API_KEY);
  window.localStorage.removeItem(STORAGE_KEY_BASE_URL);
  window.localStorage.removeItem(STORAGE_KEY_MODEL);
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT));
}

let cachedSnapshot: ClientLLMConfig = {
  apiKey: "",
  baseURL: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-4-flash",
};

/**
 * React 响应式 Hook：基于 useSyncExternalStore 订阅本地存储变更
 * 杜绝 useEffect 重复渲染与状态同步竞态
 */
export function useLLMClientConfig(defaults?: {
  baseURL?: string;
  model?: string;
}): {
  config: ClientLLMConfig;
  saveConfig: (settings: { apiKey?: string; baseURL?: string; model?: string }) => void;
  clearConfig: () => void;
} {
  const subscribe = (callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", callback);
    window.addEventListener(CONFIG_CHANGE_EVENT, callback);
    return () => {
      window.removeEventListener("storage", callback);
      window.removeEventListener(CONFIG_CHANGE_EVENT, callback);
    };
  };

  const getSnapshot = (): ClientLLMConfig => {
    const next = getClientLLMConfig(defaults);
    if (
      cachedSnapshot.apiKey !== next.apiKey ||
      cachedSnapshot.baseURL !== next.baseURL ||
      cachedSnapshot.model !== next.model
    ) {
      cachedSnapshot = next;
    }
    return cachedSnapshot;
  };

  const getServerSnapshot = (): ClientLLMConfig => ({
    apiKey: "",
    baseURL: defaults?.baseURL || "https://open.bigmodel.cn/api/paas/v4",
    model: defaults?.model || "glm-4-flash",
  });

  const config = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    config,
    saveConfig: saveClientLLMConfig,
    clearConfig: clearClientLLMConfig,
  };
}
