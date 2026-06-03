const DEFAULT_SETTINGS = globalThis.X_REPLY_CLEANER_DEFAULT_SETTINGS;

const fields = {
  threshold: document.getElementById("threshold"),
  emojiLimit: document.getElementById("emojiLimit"),
  keywords: document.getElementById("keywords"),
  blockedHandles: document.getElementById("blockedHandles"),
  trustedHandles: document.getElementById("trustedHandles"),
  save: document.getElementById("save"),
  resetDefaults: document.getElementById("resetDefaults"),
  status: document.getElementById("status")
};

let settings = { ...DEFAULT_SETTINGS };
let statusTimer;

load();

fields.save.addEventListener("click", saveFromForm);
fields.resetDefaults.addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
  render();
  save();
});

function load() {
  chrome.storage.local.get("xReplyCleanerSettings", (data) => {
    settings = normalizeSettings(data.xReplyCleanerSettings);
    render();
  });
}

function render() {
  fields.threshold.value = settings.threshold;
  fields.emojiLimit.value = settings.emojiLimit;
  fields.keywords.value = settings.keywords.join("\n");
  fields.blockedHandles.value = settings.blockedHandles.join("\n");
  fields.trustedHandles.value = settings.trustedHandles.join("\n");
}

function saveFromForm() {
  settings = {
    ...settings,
    threshold: clamp(Number(fields.threshold.value), 1, 30, DEFAULT_SETTINGS.threshold),
    emojiLimit: clamp(Number(fields.emojiLimit.value), 0, 50, DEFAULT_SETTINGS.emojiLimit),
    keywords: parseLines(fields.keywords.value),
    blockedHandles: parseHandles(fields.blockedHandles.value),
    trustedHandles: parseHandles(fields.trustedHandles.value)
  };
  save();
}

function save() {
  chrome.storage.local.set({ xReplyCleanerSettings: settings }, () => {
    window.clearTimeout(statusTimer);
    const error = chrome.runtime.lastError;
    fields.status.textContent = error ? `保存失败：${error.message}` : "已保存";
    statusTimer = window.setTimeout(() => {
      fields.status.textContent = "";
    }, error ? 2800 : 1400);
  });
}

function normalizeSettings(value) {
  return {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    threshold: clamp(Number(value?.threshold), 1, 30, DEFAULT_SETTINGS.threshold),
    emojiLimit: clamp(Number(value?.emojiLimit), 0, 50, DEFAULT_SETTINGS.emojiLimit),
    keywords: parseLines(Array.isArray(value?.keywords) ? value.keywords.join("\n") : DEFAULT_SETTINGS.keywords.join("\n")),
    blockedHandles: parseHandles(Array.isArray(value?.blockedHandles) ? value.blockedHandles.join("\n") : ""),
    trustedHandles: parseHandles(Array.isArray(value?.trustedHandles) ? value.trustedHandles.join("\n") : "")
  };
}

function parseLines(value) {
  return [...new Set(value.split(/\n|,/).map((item) => item.trim()).filter(Boolean))];
}

function parseHandles(value) {
  return parseLines(value).map((handle) => handle.replace(/^@/, "").toLowerCase());
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
