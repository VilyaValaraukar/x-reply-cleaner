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
  chrome.storage.sync.get("xReplyCleanerSettings", (data) => {
    settings = { ...DEFAULT_SETTINGS, ...(data.xReplyCleanerSettings || {}) };
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
  chrome.storage.sync.set({ xReplyCleanerSettings: settings }, () => {
    window.clearTimeout(statusTimer);
    elements.status.textContent = "已保存";
    statusTimer = window.setTimeout(() => {
      elements.status.textContent = "";
    }, 1200);
  });
}
