// ==UserScript==
// @name         Iframe & Worker P2P CDN blocker
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  锁死 WebRTC / WebTransport / Worker / ServiceWorker，尽量阻断直播站点 P2P 上行
// @author       Septuagint[URL:https://Candy-spt.com]
// @match        *://*.bilibili.com/*
// @match        *://*.huya.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const blockedError = () => new DOMException('Blocked by userscript', 'SecurityError');

  const blockedCallable = new Proxy(function () {}, {
    apply() {
      throw blockedError();
    },
    construct() {
      throw blockedError();
    }
  });

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

  function patchRealm(win) {
    if (!win) return;

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

    try {
      if (typeof win.Worker === 'function') {
        defineBlockedValue(win, 'Worker', new Proxy(win.Worker, {
          construct() {
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

  function patchIframe(el) {
    try {
      if (el && el.tagName === 'IFRAME' && el.contentWindow) {
        patchRealm(el.contentWindow);
      }
    } catch (_) {}
  }

  patchRealm(window);

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

  try {
    window.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('iframe').forEach(patchIframe);
    }, { once: true });
  } catch (_) {}
})();
