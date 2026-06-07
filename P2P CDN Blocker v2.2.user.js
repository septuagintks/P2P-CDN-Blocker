// ==UserScript==
// @name         Iframe API block light
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  仅阻断 WebTransport，保留 Worker 与播放链路
// @author       Septuagint
// @match        *://*.bilibili.com/*
// @match        *://*.huya.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const blockedError = () => new DOMException('Blocked by userscript', 'SecurityError');

  function killAsUnavailable(win, name) {
    try {
      Object.defineProperty(win, name, {
        configurable: false,
        enumerable: false,
        get() {
          return undefined;
        }
      });
    } catch (_) {}
  }

  function killCallable(win, name) {
    try {
      const blocked = new Proxy(function () {}, {
        apply() {
          throw blockedError();
        },
        construct() {
          throw blockedError();
        },
        get(target, prop, receiver) {
          if (prop === 'toString') return () => 'function () { [native code] }';
          return Reflect.get(target, prop, receiver);
        }
      });

      Object.defineProperty(win, name, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: blocked
      });
    } catch (_) {}
  }

  function patchRealm(win) {
    if (!win) return;

    // 只封 WebTransport，不动 Worker / SharedWorker / serviceWorker
    killAsUnavailable(win, 'WebTransport');

    // 有些页面会先拿原型再判断，这里顺手把 prototype 上常见入口也封掉
    try {
      if (win.WebTransport && win.WebTransport.prototype) {
        [
          'close',
          'createBidirectionalStream',
          'createUnidirectionalStream',
          'getStats'
        ].forEach(method => {
          try {
            if (typeof win.WebTransport.prototype[method] === 'function') {
              killCallable(win.WebTransport.prototype, method);
            }
          } catch (_) {}
        });
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
