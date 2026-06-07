// ==UserScript==
// @name         Iframe & Worker P2P CDN blocker
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  尽量阻断 WebRTC / WebTransport / Worker / iframe 逃逸
// @author       Septuagint[URL:https://Candy-spt.com]
// @match        *://*.bilibili.com/*
// @match        *://*.huya.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const MSG = 'Blocked by userscript';
  const blockedError = () => new DOMException(MSG, 'SecurityError');

  const blockedCallable = new Proxy(function () {}, {
    apply() {
      throw blockedError();
    },
    construct() {
      throw blockedError();
    },
    get(target, prop, receiver) {
      if (prop === 'toString') {
        return () => 'function () { [native code] }';
      }
      return Reflect.get(target, prop, receiver);
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

  function defineBlockedMethod(obj, key) {
    try {
      Object.defineProperty(obj, key, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: blockedCallable
      });
    } catch (_) {}
  }

  function patchRealm(win) {
    if (!win) return;

    // 1) WebRTC / WebTransport / ICE 相关构造器
    [
      'RTCPeerConnection',
      'webkitRTCPeerConnection',
      'RTCSessionDescription',
      'RTCIceCandidate',
      'RTCDataChannel',
      'WebTransport'
    ].forEach(k => defineBlockedGetter(win, k));

    // 2) 常见媒体入口
    try {
      if (win.navigator && win.navigator.mediaDevices) {
        ['getUserMedia', 'getDisplayMedia', 'enumerateDevices'].forEach(m => {
          if (m in win.navigator.mediaDevices) defineBlockedMethod(win.navigator.mediaDevices, m);
        });
      }
    } catch (_) {}

    // 3) Worker / SharedWorker / ServiceWorker 逃逸面
    if ('Worker' in win) defineBlockedGetter(win, 'Worker');
    if ('SharedWorker' in win) defineBlockedGetter(win, 'SharedWorker');

    try {
      if (win.navigator && win.navigator.serviceWorker && 'register' in win.navigator.serviceWorker) {
        defineBlockedMethod(win.navigator.serviceWorker, 'register');
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

  // 先堵当前主 realm
  patchRealm(window);

  // 监听后续 iframe
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

  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('iframe').forEach(patchIframe);
  }, { once: true });
})();
