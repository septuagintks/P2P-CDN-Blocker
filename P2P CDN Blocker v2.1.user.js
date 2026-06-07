// ==UserScript==
// @name         Iframe & Worker P2P CDN blocker
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  锁死 WebRTC / WebTransport / Worker / Blob Worker / ServiceWorker，尽量阻断直播站点 P2P 上行
// @author       Septuagint[URL:https://Candy-spt.com]
// @match        *://*.bilibili.com/*
// @match        *://*.huya.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const BLOCK_MSG = 'Blocked by userscript';
  const blockedError = () => new DOMException(BLOCK_MSG, 'SecurityError');

  const blockedCallable = new Proxy(function () {}, {
    apply() {
      throw blockedError();
    },
    construct() {
      throw blockedError();
    }
  });

  const BLOCKED_SCHEMES = new Set(['blob:', 'data:', 'filesystem:']);

  function toStr(v) {
    try {
      return String(v);
    } catch (_) {
      return '';
    }
  }

  function isBlockedUrl(url) {
    const s = toStr(url).trim().toLowerCase();
    return [...BLOCKED_SCHEMES].some(prefix => s.startsWith(prefix));
  }

  function defineBlockedGetter(obj, key) {
    try {
      Object.defineProperty(obj, key, {
        configurable: false,
        enumerable: false,
        get() {
          return blockedCallable;
        },
        set() {
          throw blockedError();
        }
      });
    } catch (_) {}
  }

  function defineBlockedValue(obj, key, value) {
    try {
      Object.defineProperty(obj, key, {
        configurable: false,
        enumerable: false,
        writable: false,
        value
      });
    } catch (_) {}
  }

  function patchUrlApi(win) {
    try {
      const origCreateObjectURL = win.URL && win.URL.createObjectURL;
      if (typeof origCreateObjectURL === 'function') {
        defineBlockedValue(win.URL, 'createObjectURL', new Proxy(origCreateObjectURL, {
          apply(target, thisArg, args) {
            const obj = args && args[0];
            // 激进策略：直接封掉所有 Blob/MediaSource/ObjectURL
            if (obj instanceof Blob || (typeof MediaSource !== 'undefined' && obj instanceof MediaSource)) {
              throw blockedError();
            }
            return Reflect.apply(target, thisArg, args);
          }
        }));
      }
    } catch (_) {}

    try {
      const origRevokeObjectURL = win.URL && win.URL.revokeObjectURL;
      if (typeof origRevokeObjectURL === 'function') {
        defineBlockedValue(win.URL, 'revokeObjectURL', new Proxy(origRevokeObjectURL, {
          apply(target, thisArg, args) {
            return Reflect.apply(target, thisArg, args);
          }
        }));
      }
    } catch (_) {}
  }

  function patchWorkerApi(win) {
    try {
      if (typeof win.Worker === 'function') {
        defineBlockedGetter(win, 'Worker');

        // 额外补一层：有些脚本会直接抓旧引用，用原型链不好挡，直接把构造函数再包一层
        const origWorker = win.Worker;
        defineBlockedValue(win, 'Worker', new Proxy(origWorker, {
          construct(target, args) {
            const url = args && args[0];
            if (isBlockedUrl(url)) throw blockedError();
            // 直接封死所有 worker，最稳
            throw blockedError();
          },
          apply() {
            throw blockedError();
          }
        }));
      }
    } catch (_) {}

    try {
      if (typeof win.SharedWorker === 'function') {
        defineBlockedValue(win, 'SharedWorker', new Proxy(win.SharedWorker, {
          construct() {
            throw blockedError();
          },
          apply() {
            throw blockedError();
          }
        }));
      }
    } catch (_) {}
  }

  function patchServiceWorker(win) {
    try {
      const sw = win.navigator && win.navigator.serviceWorker;
      if (sw && typeof sw.register === 'function') {
        defineBlockedValue(sw, 'register', new Proxy(sw.register, {
          apply() {
            throw blockedError();
          }
        }));
      }
    } catch (_) {}
  }

  function patchWebRtcAndTransport(win) {
    [
      'RTCPeerConnection',
      'webkitRTCPeerConnection',
      'RTCSessionDescription',
      'RTCIceCandidate',
      'RTCDataChannel',
      'WebTransport'
    ].forEach(prop => {
      try {
        if (prop in win) defineBlockedGetter(win, prop);
      } catch (_) {}
    });
  }

  function patchRealm(win) {
    if (!win) return;
    patchWebRtcAndTransport(win);
    patchWorkerApi(win);
    patchUrlApi(win);
    patchServiceWorker(win);
  }

  function patchIframe(el) {
    try {
      if (el && el.tagName === 'IFRAME' && el.contentWindow) {
        patchRealm(el.contentWindow);
      }
    } catch (_) {}
  }

  // 先堵当前页面主 realm
  patchRealm(window);

  // 兼顾页面里动态创建的 iframe
  try {
    const mo = new MutationObserver(records => {
      for (const rec of records) {
        for (const node of rec.addedNodes || []) {
          if (node && node.tagName === 'IFRAME') {
            patchIframe(node);
            node.addEventListener('load', () => patchIframe(node), { once: true });
          }
        }
      }
    });

    mo.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  } catch (_) {}

  // 兜底扫一遍已存在 iframe
  try {
    window.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('iframe').forEach(patchIframe);
    }, { once: true });
  } catch (_) {}

})();
