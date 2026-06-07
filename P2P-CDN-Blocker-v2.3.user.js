// ==UserScript==
// @name         Iframe API block light
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  仅阻断 WebTransport，保留 Worker 与播放链路；增强 iframe 处理鲁棒性
// @author       Septuagint
// @match        *://*.bilibili.com/*
// @match        *://*.huya.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const blockedError = () => new DOMException('Blocked by userscript', 'SecurityError');
  const seenWindows = new WeakSet();

  function safeDefineGetter(obj, key, getter) {
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      if (desc && desc.configurable === false) return false;
      Object.defineProperty(obj, key, {
        configurable: false,
        enumerable: false,
        get: getter
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function patchWebTransport(win) {
    if (!win || seenWindows.has(win)) return;
    seenWindows.add(win);

    // 1) 仅把 WebTransport 伪装成“不存在”
    safeDefineGetter(win, 'WebTransport', () => undefined);

    // 2) 如果页面先缓存了构造器，这里尽量把 prototype 入口也封住
    try {
      const WT = win.WebTransport;
      if (WT && WT.prototype) {
        for (const method of ['close', 'createBidirectionalStream', 'createUnidirectionalStream', 'getStats']) {
          try {
            if (typeof WT.prototype[method] === 'function') {
              Object.defineProperty(WT.prototype, method, {
                configurable: false,
                enumerable: false,
                writable: false,
                value: function () {
                  throw blockedError();
                }
              });
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  function patchIframe(el) {
    try {
      if (el && el.tagName === 'IFRAME' && el.contentWindow) {
        patchWebTransport(el.contentWindow);
      }
    } catch (_) {}
  }

  // 先处理当前主 realm
  patchWebTransport(window);

  // 新 iframe
  try {
    const mo = new MutationObserver(records => {
      for (const rec of records) {
        for (const node of rec.addedNodes || []) {
          if (node && node.tagName === 'IFRAME') {
            patchIframe(node);
            try {
              node.addEventListener('load', () => patchIframe(node), { once: true });
            } catch (_) {}
          }
        }
      }
    });

    mo.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  } catch (_) {}

  // 已存在 iframe + 后续导航
  try {
    const applyAllIframes = () => {
      document.querySelectorAll('iframe').forEach(patchIframe);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyAllIframes, { once: true });
    } else {
      applyAllIframes();
    }

    window.addEventListener('load', applyAllIframes, true);
  } catch (_) {}
})();
