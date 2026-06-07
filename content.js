(function () {
  const DEFAULT_SETTINGS = globalThis.X_REPLY_CLEANER_DEFAULT_SETTINGS;

  const PROCESSED_ATTR = "data-x-reply-cleaner-processed";
  const HIDDEN_ATTR = "data-x-reply-cleaner-hidden";
  const PLACEHOLDER_CLASS = "x-reply-cleaner-placeholder";
  let settings = { ...DEFAULT_SETTINGS };
  let observer;
  let scanTimer;
  const processedTweets = new WeakMap();
  const manuallyShownTweets = new WeakSet();

  const BUILT_IN_SPAM_TERMS = [
    "固炮",
    "寻固炮",
    "找固炮",
    "约见",
    "约p",
    "约P",
    "约Ｐ",
    "同城约",
    "真实约见",
    "真实对接",
    "看我置顶",
    "看我",
    "点我",
    "入口",
    "1-5线",
    "一到五线",
    "点击主页",
    "点主页",
    "看主页",
    "主页可约",
    "主页有惊喜",
    "哥哥主页",
    "妹妹主页",
    "互fo私",
    "互关私",
    "线下可",
    "可空降"
  ];

  const ADULT_BAIT_TERMS = [
    "骚",
    "sao",
    "sao货",
    "更骚",
    "没人比她更骚",
    "没人比她sao",
    "没人比她更sao",
    "线下sao",
    "saohuo",
    "尤物",
    "嫩妹",
    "嫩模",
    "大尺度",
    "私房",
    "露脸",
    "不露脸",
    "福利视频",
    "激情",
    "劲爆",
    "涩图",
    "色图",
    "写真资源",
    "成人资源"
  ];

  const OBFUSCATED_BAIT_TERMS = [
    "返差",
    "探路",
    "花样多",
    "能打✈",
    "打✈",
    "体制内老师",
    "主页能打",
    "dp就她",
    "on体",
    "xm体"
  ];

  const DISPLAY_NAME_AD_TERMS = [
    "1-5线",
    "一到五线",
    "全国1-5线",
    "线覆盖",
    "真实可靠",
    "真实约见",
    "真实对接",
    "约见入口",
    "同城约",
    "同城约p",
    "同城约P",
    "同城约Ｐ",
    "约p",
    "约P",
    "约Ｐ",
    "看我置顶",
    "看我",
    "点我",
    "入口"
  ];

  const PINYIN_SPAM_PATTERNS = [
    /\bsao\b/i,
    /\bsao\s*huo\b/i,
    /\bsaohuo\b/i,
    /\byue\s*pao\b/i,
    /\byuepao\b/i,
    /\bgu\s*pao\b/i,
    /\bgupao\b/i,
    /\bluo\s*liao\b/i,
    /\bluoliao\b/i,
    /\bfu\s*li\b/i,
    /\bfuli\b/i,
    /\bsi\s*fang\b/i,
    /\bsifang\b/i,
    /\bwai\s*wei\b/i,
    /\bwaiwei\b/i,
    /\btong\s*cheng\b/i,
    /\btongcheng\b/i,
    /\bxian\s*xia\b/i,
    /\bxianxia\b/i
  ];

  init();

  function init() {
    injectStyles();
    loadSettings().then(() => {
      scanPage();
      startObserver();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (!changes.xReplyCleanerSettings) return;
      settings = normalizeSettings(changes.xReplyCleanerSettings.newValue);
      resetPage();
      scanPage();
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get("xReplyCleanerSettings", (data) => {
        settings = normalizeSettings(data.xReplyCleanerSettings);
        resolve();
      });
    });
  }

  function normalizeSettings(value) {
    return {
      ...DEFAULT_SETTINGS,
      ...(value || {}),
      threshold: clampNumber(value?.threshold, DEFAULT_SETTINGS.threshold, 1, 30),
      emojiLimit: clampNumber(value?.emojiLimit, DEFAULT_SETTINGS.emojiLimit, 0, 50),
      keywords: normalizeList(value?.keywords, DEFAULT_SETTINGS.keywords),
      trustedHandles: normalizeHandleList(value?.trustedHandles || []),
      blockedHandles: normalizeHandleList(value?.blockedHandles || [])
    };
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function normalizeList(value, fallback) {
    const source = Array.isArray(value) ? value : fallback;
    return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
  }

  function normalizeHandleList(value) {
    return normalizeList(value, []).map((handle) => handle.replace(/^@/, "").toLowerCase());
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanPage, 160);
  }

  function scanPage() {
    if (!settings.enabled) {
      restoreHiddenTweets();
      return;
    }

    const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    tweets.forEach((tweet, index) => processTweet(tweet, index));
  }

  function processTweet(tweet, index) {
    const signature = settingsSignature();
    if (processedTweets.get(tweet) === signature) return;
    processedTweets.set(tweet, signature);
    tweet.setAttribute(PROCESSED_ATTR, "true");

    if (manuallyShownTweets.has(tweet)) {
      showTweet(tweet);
      return;
    }

    const text = getVisibleText(tweet);
    const handle = extractHandle(tweet);
    const displayName = extractDisplayName(tweet);
    const hasExternalLink = tweetHasExternalLink(tweet, text);
    const result = scoreTweet(text, handle, displayName, hasExternalLink);
    const shouldSkipMainTweet = settings.repliesOnly && isLikelyMainStatusTweet(tweet, index);
    const shouldHide = !shouldSkipMainTweet && result.score >= settings.threshold;

    if (shouldHide) {
      hideTweet(tweet, result);
    } else {
      showTweet(tweet);
    }
  }

  function settingsSignature() {
    return [
      settings.enabled,
      settings.repliesOnly,
      settings.hidePromoted,
      settings.showPlaceholder,
      settings.threshold,
      settings.emojiLimit,
      settings.keywords.length,
      settings.trustedHandles.length,
      settings.blockedHandles.length
    ].join("::");
  }

  function getVisibleText(node) {
    return node.innerText || "";
  }

  function extractHandle(tweet) {
    const handleLink = Array.from(tweet.querySelectorAll('a[href^="/"]')).find((link) => {
      const href = link.getAttribute("href") || "";
      return /^\/[A-Za-z0-9_]{1,15}$/.test(href);
    });
    return handleLink ? handleLink.getAttribute("href").slice(1).toLowerCase() : "";
  }

  function extractDisplayName(tweet) {
    const userNameBlock = tweet.querySelector('[data-testid="User-Name"]');
    if (!userNameBlock) return "";
    const text = userNameBlock.innerText || "";
    return text.split("\n").find((line) => line.trim() && !line.trim().startsWith("@")) || "";
  }

  function isLikelyMainStatusTweet(tweet, index) {
    if (!/\/status\/\d+/.test(location.pathname)) return false;
    const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const firstVisibleTweet = tweets.find((item) => item.offsetParent !== null) || tweets[0];
    if (tweet !== firstVisibleTweet && index !== 0) return false;

    const rect = tweet.getBoundingClientRect();
    return rect.top <= 220 && rect.height > 260;
  }

  function scoreTweet(rawText, handle, displayName = "", hasExternalLink = false) {
    const text = rawText.toLowerCase();
    const normalizedDisplayName = displayName.toLowerCase();
    const reasons = [];
    let score = 0;

    if (settings.trustedHandles.includes(handle)) {
      return { score: 0, reasons: ["trusted handle"] };
    }

    if (settings.blockedHandles.includes(handle)) {
      score += 10;
      reasons.push(`blocked @${handle}`);
    }

    if (settings.hidePromoted && /推广|promoted/i.test(rawText)) {
      score += 8;
      reasons.push("promoted");
    }

    const keywordHits = settings.keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
    if (keywordHits.length) {
      score += Math.min(12, keywordHits.length * 3);
      reasons.push(`keywords: ${keywordHits.slice(0, 4).join(", ")}`);
    }

    const emojiCount = countEmoji(rawText);
    const builtInHits = BUILT_IN_SPAM_TERMS.filter((term) => text.includes(term.toLowerCase()));
    if (builtInHits.length) {
      score += Math.min(10, builtInHits.length * 4);
      reasons.push(`built-in terms: ${builtInHits.slice(0, 4).join(", ")}`);
    }

    const displayNameHits = BUILT_IN_SPAM_TERMS.filter((term) => normalizedDisplayName.includes(term.toLowerCase()));
    if (displayNameHits.length) {
      score += Math.min(8, displayNameHits.length * 4);
      reasons.push(`display name: ${displayNameHits.slice(0, 3).join(", ")}`);
    }

    const displayNameAdHits = DISPLAY_NAME_AD_TERMS.filter((term) => normalizedDisplayName.includes(term.toLowerCase()));
    if (displayNameAdHits.length) {
      score += Math.min(10, displayNameAdHits.length * 3);
      reasons.push(`display ad terms: ${displayNameAdHits.slice(0, 4).join(", ")}`);
    }

    const adultBaitHits = ADULT_BAIT_TERMS.filter((term) => text.includes(term.toLowerCase()));
    if (adultBaitHits.length) {
      score += Math.min(6, adultBaitHits.length * 3);
      reasons.push(`adult bait: ${adultBaitHits.slice(0, 3).join(", ")}`);
    }

    const pinyinSpamHits = PINYIN_SPAM_PATTERNS.filter((pattern) => pattern.test(rawText));
    if (pinyinSpamHits.length) {
      score += Math.min(6, pinyinSpamHits.length * 3);
      reasons.push("pinyin bait");
    }

    const obfuscatedBaitHits = OBFUSCATED_BAIT_TERMS.filter((term) => text.includes(term.toLowerCase()));
    if (obfuscatedBaitHits.length) {
      score += Math.min(6, obfuscatedBaitHits.length * 3);
      reasons.push(`obfuscated bait: ${obfuscatedBaitHits.slice(0, 3).join(", ")}`);
    }

    if (emojiCount > settings.emojiLimit) {
      score += Math.min(8, Math.ceil((emojiCount - settings.emojiLimit) / 2) + 2);
      reasons.push(`${emojiCount} emoji`);
    }

    if (emojiCount >= 3 && hasProfileBait(text)) {
      score += 4;
      reasons.push("profile bait with emoji");
    }

    if (hasEmojiWall(rawText, emojiCount)) {
      score += 6;
      reasons.push("emoji wall");
    }

    if (emojiCount >= 6 && displayNameAdHits.length) {
      score += 6;
      reasons.push("display ad with emoji wall");
    }

    if (displayNameAdHits.length && hasPinnedOrEntryBait(rawText)) {
      score += 4;
      reasons.push("pinned entry bait");
    }

    if (hasExternalLink) {
      score += 3;
      reasons.push("external link");
    }

    if (hasExternalLink && adultBaitHits.length) {
      score += 4;
      reasons.push("adult bait link");
    }

    if (hasExternalLink && emojiCount >= 2 && hasArrowBait(rawText)) {
      score += 3;
      reasons.push("arrow link bait");
    }

    if (emojiCount >= 2 && hasMentionBait(rawText) && (adultBaitHits.length || pinyinSpamHits.length)) {
      score += 4;
      reasons.push("mention bait");
    }

    if (hasMentionBait(rawText) && hasCrypticTailCode(rawText) && hasObfuscatedAdultBait(rawText)) {
      score += 6;
      reasons.push("cryptic mention bait");
    }

    if (hasMentionBait(rawText) && obfuscatedBaitHits.length && hasObfuscatedAdultBait(rawText)) {
      score += 4;
      reasons.push("obfuscated mention bait");
    }

    if (hasMixedChinesePinyinAdultBait(rawText)) {
      score += 4;
      reasons.push("mixed pinyin bait");
    }

    const contactScore = scoreContactHints(rawText);
    if (contactScore > 0) {
      score += contactScore;
      reasons.push("contact hints");
    }

    if (/(.)\1{4,}/.test(rawText) || /[!！?？~～。,.，、]{5,}/.test(rawText)) {
      score += 2;
      reasons.push("repeated symbols");
    }

    if (hasSparseSpamShape(rawText, emojiCount)) {
      score += 2;
      reasons.push("spam-like shape");
    }

    return { score, reasons };
  }

  function countEmoji(text) {
    const matches = text.match(/\p{Extended_Pictographic}/gu);
    return matches ? matches.length : 0;
  }

  function scoreContactHints(text) {
    const patterns = [
      /v[x信]?[:：\s]?[a-z0-9_-]{4,}/i,
      /微[信]?[:：\s]?[a-z0-9_-]{4,}/i,
      /q[q群]?[:：\s]?\d{5,}/i,
      /t(?:elegram|g)[:：\s@]?[a-z0-9_]{4,}/i,
      /电报[:：\s]?[a-z0-9_]{4,}/i,
      /(?:加|私|看|约).{0,4}(?:v|微|微信|qq|电报|飞机|tg)/i
    ];
    const hits = patterns.filter((pattern) => pattern.test(text)).length;
    return hits ? Math.min(8, hits * 4) : 0;
  }

  function tweetHasExternalLink(tweet, text) {
    const links = Array.from(tweet.querySelectorAll("a[href]"));
    const hasLinkElement = links.some((link) => {
      const href = link.href || "";
      if (!href) return false;
      if (href.includes("x.com") || href.includes("twitter.com")) return false;
      return /^https?:\/\//i.test(href);
    });

    return hasLinkElement || /https?:\/\/|www\.|t\.co\/|[\w-]+\.(?:com|net|org|xyz|cc|top|vip|ink|link|site|icu|me|app)\b/i.test(text);
  }

  function hasArrowBait(text) {
    return /(?:->|→|➡|👉|👇|☞|戳|点|点击|看).{0,24}(?:https?:\/\/|www\.|t\.co\/|[\w-]+\.(?:com|net|org|xyz|cc|top|vip|ink|link|site|icu|me|app)\b)/i.test(text);
  }

  function hasMentionBait(text) {
    return /@[A-Za-z0-9_]{3,15}/.test(text);
  }

  function hasCrypticTailCode(text) {
    return /@[A-Za-z0-9_]{3,15}\s*[,，、]?\s*[0-9][a-z]\b/i.test(text);
  }

  function hasObfuscatedAdultBait(text) {
    const patterns = [
      /(?:主页|主頁).{0,10}(?:能打|可打|打).{0,3}(?:✈|飞机|飛機)/i,
      /(?:刷了半天|找了半天|看了半天).{0,18}(?:主页|主頁)/i,
      /(?:dp|on|xm)\s*(?:就她|体|體|体制|體制|老师|老師)/i,
      /(?:线下|同城|30\+|熟).{0,10}(?:体制内老师|體制內老師|老师|老師)/i,
      /(?:玩[的得]?就是|主打|专门).{0,8}(?:返差|反差|探路|花样多)/i,
      /(?:探路|花样多).{0,12}@[A-Za-z0-9_]{3,15}/i
    ];
    return patterns.some((pattern) => pattern.test(text));
  }

  function hasMixedChinesePinyinAdultBait(text) {
    return /(?:线下|同城|没人比她|比她|她|货).{0,12}(?:sao|yuepao|gupao|luoliao|fuli|sifang|waiwei)|(?:sao|yuepao|gupao|luoliao|fuli|sifang|waiwei).{0,12}(?:货|她|线下|同城|主页|账号|@)/i.test(text);
  }

  function hasProfileBait(text) {
    return /(?:点|点击|看|进|戳|主页|置顶|入口).{0,8}(?:主页|资料|简介|置顶|入口|我)|(?:主页|资料|简介|置顶|入口).{0,8}(?:约|炮|福利|资源|加|私|点|看)/i.test(text);
  }

  function hasSparseSpamShape(text, emojiCount) {
    const compact = text.replace(/\s/g, "");
    if (compact.length < 12) return false;
    const cjkCount = (compact.match(/[\u4e00-\u9fff]/g) || []).length;
    const symbolCount = (compact.match(/[^\u4e00-\u9fffA-Za-z0-9]/g) || []).length;
    return emojiCount >= 4 && symbolCount > cjkCount * 0.45;
  }

  function hasEmojiWall(text, emojiCount) {
    if (emojiCount < 8) return false;
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const emojiHeavyLines = lines.filter((line) => {
      const lineEmojiCount = countEmoji(line);
      const compactLength = Array.from(line.replace(/\s/g, "")).length || 1;
      return lineEmojiCount >= 2 && lineEmojiCount / compactLength >= 0.55;
    });

    const repeatedEmoji = findRepeatedEmojiCount(text) >= 4;
    return emojiHeavyLines.length >= 3 || repeatedEmoji;
  }

  function findRepeatedEmojiCount(text) {
    const emoji = text.match(/\p{Extended_Pictographic}/gu) || [];
    const counts = new Map();
    emoji.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
    return Math.max(0, ...counts.values());
  }

  function hasPinnedOrEntryBait(text) {
    return /(?:看我|点我|点击|看).{0,10}(?:置顶|入口|主页|我)|(?:置顶|入口).{0,10}(?:约见|约p|约P|同城|真实|对接)/i.test(text);
  }

  function hideTweet(tweet, result) {
    tweet.setAttribute(HIDDEN_ATTR, "true");

    if (settings.showPlaceholder) {
      tweet.style.display = "";
      ensurePlaceholder(tweet, result);
      Array.from(tweet.children).forEach((child) => {
        if (!child.classList.contains(PLACEHOLDER_CLASS)) child.style.display = "none";
      });
    } else {
      tweet.style.display = "none";
      removePlaceholder(tweet);
    }
  }

  function showTweet(tweet) {
    tweet.removeAttribute(HIDDEN_ATTR);
    tweet.style.display = "";
    Array.from(tweet.children).forEach((child) => {
      child.style.display = "";
    });
    removePlaceholder(tweet);
  }

  function ensurePlaceholder(tweet, result) {
    let placeholder = tweet.querySelector(`:scope > .${PLACEHOLDER_CLASS}`);
    if (!placeholder) {
      placeholder = document.createElement("button");
      placeholder.type = "button";
      placeholder.className = PLACEHOLDER_CLASS;
      placeholder.addEventListener("click", () => {
        manuallyShownTweets.add(tweet);
        showTweet(tweet);
      });
      tweet.prepend(placeholder);
    }
    placeholder.textContent = `已隐藏疑似广告回复，评分 ${result.score}。点击查看。`;
    placeholder.title = "点击查看这条回复";
  }

  function removePlaceholder(tweet) {
    tweet.querySelector(`:scope > .${PLACEHOLDER_CLASS}`)?.remove();
  }

  function restoreHiddenTweets() {
    document.querySelectorAll(`article[${HIDDEN_ATTR}="true"]`).forEach(showTweet);
  }

  function resetPage() {
    document.querySelectorAll(`article[${PROCESSED_ATTR}]`).forEach((tweet) => {
      tweet.removeAttribute(PROCESSED_ATTR);
      processedTweets.delete(tweet);
      manuallyShownTweets.delete(tweet);
      showTweet(tweet);
    });
  }

  function injectStyles() {
    if (document.getElementById("x-reply-cleaner-styles")) return;
    const style = document.createElement("style");
    style.id = "x-reply-cleaner-styles";
    style.textContent = `
      .${PLACEHOLDER_CLASS} {
        width: 100%;
        min-height: 44px;
        border: 0;
        border-top: 1px solid rgba(83, 100, 113, 0.25);
        border-bottom: 1px solid rgba(83, 100, 113, 0.25);
        background: rgba(239, 243, 244, 0.75);
        color: rgb(83, 100, 113);
        cursor: pointer;
        font: inherit;
        padding: 12px 16px;
        text-align: left;
      }
      .${PLACEHOLDER_CLASS}:hover {
        background: rgba(207, 217, 222, 0.55);
      }
    `;
    document.documentElement.appendChild(style);
  }
})();
