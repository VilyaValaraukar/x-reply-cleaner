const DEFAULT_SETTINGS = {
  enabled: true,
  repliesOnly: true,
  hidePromoted: true,
  showPlaceholder: false,
  threshold: 6,
  emojiLimit: 7,
  keywords: [
    "约炮",
    "可约",
    "线下",
    "同城",
    "上门",
    "外围",
    "固炮",
    "寻固炮",
    "找固炮",
    "空降",
    "裸聊",
    "骚",
    "sao",
    "更骚",
    "尤物",
    "嫩",
    "大尺度",
    "私房",
    "福利姬",
    "反差",
    "学生妹",
    "喝茶",
    "接单",
    "包夜",
    "兼职",
    "资源",
    "主页",
    "点击主页",
    "点主页",
    "私信",
    "加我",
    "加v",
    "加微",
    "微信",
    "电报",
    "飞机",
    "telegram",
    "tg"
  ],
  trustedHandles: [],
  blockedHandles: []
};

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
  chrome.storage.sync.get("xReplyCleanerSettings", (data) => {
    settings = { ...DEFAULT_SETTINGS, ...(data.xReplyCleanerSettings || {}) };
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
  chrome.storage.sync.set({ xReplyCleanerSettings: settings }, () => {
    window.clearTimeout(statusTimer);
    fields.status.textContent = "已保存";
    statusTimer = window.setTimeout(() => {
      fields.status.textContent = "";
    }, 1400);
  });
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
