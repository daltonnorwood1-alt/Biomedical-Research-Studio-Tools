const listeners = new Map();
const pending = new Map();
let requestId = 0;

const host = () => globalThis.openai ?? null;
const isEmbedded = () => window.parent !== window;

function emit(type, value) {
  (listeners.get(type) ?? []).forEach((listener) => listener(value));
}

function subscribe(type, listener) {
  const group = listeners.get(type) ?? [];
  group.push(listener);
  listeners.set(type, group);
  return () => listeners.set(type, group.filter((item) => item !== listener));
}

function postRequest(method, params = {}) {
  if (!isEmbedded()) return Promise.reject(new Error("No MCP Apps host is available."));
  const id = `brs-${Date.now()}-${++requestId}`;
  window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Host did not answer ${method}.`));
    }, 12000);
    pending.set(id, { resolve, reject, timeout });
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !event.data || event.data.jsonrpc !== "2.0") return;
  const message = event.data;
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    window.clearTimeout(item.timeout);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message ?? "Host request failed."));
    else item.resolve(message.result);
    return;
  }
  const eventNames = {
    "ui/notifications/tool-input": "toolinput",
    "ui/notifications/tool-input-partial": "toolinputpartial",
    "ui/notifications/tool-result": "toolresult",
    "ui/notifications/host-context-changed": "hostcontextchanged"
  };
  if (eventNames[message.method]) emit(eventNames[message.method], message.params);
});

async function firstAvailable(candidates, fallback) {
  for (const candidate of candidates) {
    if (typeof candidate === "function") return candidate();
  }
  return fallback?.();
}

function readInitialData() {
  const api = host();
  return {
    input: api?.toolInput ?? null,
    output: api?.toolOutput ?? api?.toolResult ?? null,
    metadata: api?.toolResponseMetadata ?? null,
    widgetState: api?.widgetState ?? null,
    context: {
      theme: api?.theme,
      displayMode: api?.displayMode,
      locale: api?.locale,
      maxHeight: api?.maxHeight,
      safeArea: api?.safeAreaInsets,
      userAgent: api?.userAgent,
      platform: api?.platform
    }
  };
}

export const bridge = {
  available: () => Boolean(host() || isEmbedded()),
  initial: readInitialData,
  on: subscribe,

  callTool(name, args = {}) {
    const api = host();
    return firstAvailable([
      typeof api?.callTool === "function" ? () => api.callTool(name, args) : null,
      isEmbedded() ? () => postRequest("tools/call", { name, arguments: args }) : null
    ], () => Promise.resolve({ localPreview: true, name, structuredContent: args }));
  },

  sendMessage(prompt, title = "Continue in chat") {
    const api = host();
    return firstAvailable([
      typeof api?.sendFollowUpMessage === "function" ? () => api.sendFollowUpMessage({ prompt, title }) : null,
      typeof api?.sendMessage === "function" ? () => api.sendMessage({ role: "user", content: [{ type: "text", text: prompt }] }) : null,
      isEmbedded() ? () => postRequest("ui/message", { role: "user", content: [{ type: "text", text: prompt }] }) : null
    ], () => Promise.resolve({ localPreview: true }));
  },

  requestDisplayMode(mode) {
    const api = host();
    return firstAvailable([
      typeof api?.requestDisplayMode === "function" ? () => api.requestDisplayMode({ mode }) : null,
      isEmbedded() ? () => postRequest("ui/request-display-mode", { mode }) : null
    ], () => Promise.resolve({ mode, localPreview: true }));
  },

  updateModelContext(structuredContent, text) {
    const api = host();
    const content = text ? [{ type: "text", text }] : undefined;
    return firstAvailable([
      typeof api?.updateModelContext === "function" ? () => api.updateModelContext({ structuredContent, content }) : null,
      isEmbedded() ? () => postRequest("ui/update-model-context", { structuredContent, content }) : null
    ], () => Promise.resolve({ localPreview: true }));
  },

  setWidgetState(state) {
    const api = host();
    if (typeof api?.setWidgetState === "function") return api.setWidgetState(state);
    try { localStorage.setItem("brs-widget-state", JSON.stringify(state)); } catch {}
    return Promise.resolve(state);
  },

  getWidgetState() {
    const api = host();
    if (api?.widgetState) return api.widgetState;
    try { return JSON.parse(localStorage.getItem("brs-widget-state") ?? "null"); } catch { return null; }
  },

  async selectFiles({ accept = [], multiple = true } = {}) {
    const api = host();
    if (typeof api?.selectFiles === "function") return api.selectFiles({ accept, multiple });
    if (typeof api?.uploadFile === "function") {
      const files = await pickLocalFiles(accept, multiple);
      return Promise.all(files.map((file) => api.uploadFile(file)));
    }
    return pickLocalFiles(accept, multiple);
  },

  downloadFile(file) {
    const api = host();
    return firstAvailable([
      typeof api?.downloadFile === "function" ? () => api.downloadFile(file) : null,
      file?.fileId && typeof api?.getFileDownloadUrl === "function" ? async () => {
        const result = await api.getFileDownloadUrl({ fileId: file.fileId });
        window.open(result.downloadUrl ?? result.url, "_blank", "noopener,noreferrer");
        return result;
      } : null,
      isEmbedded() ? () => postRequest("ui/download-file", file) : null
    ], () => Promise.resolve({ localPreview: true }));
  },

  openModal(options) {
    const api = host();
    if (typeof api?.requestModal === "function") return api.requestModal(options);
    if (typeof api?.openModal === "function") return api.openModal(options);
    if (typeof api?.showModal === "function") return api.showModal(options);
    return Promise.reject(new Error("Host modal extension is unavailable."));
  }
};

function pickLocalFiles(accept, multiple) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.accept = Array.isArray(accept) ? accept.join(",") : accept;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
    input.click();
  });
}
