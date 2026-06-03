const DEFAULT_SETTINGS = globalThis.X_REPLY_CLEANER_DEFAULT_SETTINGS;

const elements = {
  enabled: document.getElementById("enabled"),
  repliesOnly: document.getElementById("repliesOnly"),
  showPlaceholder: document.getElementById("showPlaceholder"),
  hidePromoted: document.getElementById("hidePromoted"),
  threshold: document.getElementById("threshold"),
  thresholdValue: document.getElementById("thresholdValue"),
  status: document.getElementById("status"),
  openOptions: document.getElementById("openOptions")
};

let settings = { ...DEFAULT_SETTINGS };
let statusTimer;

load();

elements.openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

["enabled", "repliesOnly", "showPlaceholder", "hidePromoted"].forEach((key) => {
  elements[key].addEventListener("change", () => {
    settings[key] = elements[key].checked;
    save();
  });
});

elements.threshold.addEventListener("input", () => {
  settings.threshold = Number(elements.threshold.value);
  elements.thresholdValue.value = settings.threshold;
  save();
});

function load() {
  chrome.storage.local.get("xReplyCleanerSettings", (data) => {
    settings = normalizeSettings(data.xReplyCleanerSettings);
    render();
  });
}

function render() {
  elements.enabled.checked = settings.enabled;
  elements.repliesOnly.checked = settings.repliesOnly;
  elements.showPlaceholder.checked = settings.showPlaceholder;
  elements.hidePromoted.checked = settings.hidePromoted;
  elements.threshold.value = settings.threshold;
  elements.thresholdValue.value = settings.threshold;
}

function save() {
  chrome.storage.local.set({ xReplyCleanerSettings: settings }, () => {
    window.clearTimeout(statusTimer);
    const error = chrome.runtime.lastError;
    elements.status.textContent = error ? `保存失败：${error.message}` : "已保存";
    statusTimer = window.setTimeout(() => {
      elements.status.textContent = "";
    }, error ? 2600 : 1200);
  });
}

function normalizeSettings(value) {
  return {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    threshold: clampNumber(value?.threshold, DEFAULT_SETTINGS.threshold, 1, 30),
    emojiLimit: clampNumber(value?.emojiLimit, DEFAULT_SETTINGS.emojiLimit, 0, 50)
  };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
