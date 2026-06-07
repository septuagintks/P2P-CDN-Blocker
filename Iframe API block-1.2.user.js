// ==UserScript==
// @name         Iframe API block
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  锁死 WebRTC 与 WebTransport 原型链，防止直播网站薅上行流量
// @author       Septuagint[URL:https://Candy-spt.com]
// @match        *://*.bilibili.com/*
// @match        *://*.huya.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const disableProps = {
        value: undefined,
        enumerable: false,
        writable: false,
        configurable: false
    };

    // 1. 冻结当前 window 的相关 API
    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate', 'WebTransport'].forEach(prop => {
        if (prop in window) {
            try {
                Object.defineProperty(window, prop, disableProps);
            } catch (e) {}
        }
    });

    // 2. 拦截 iframe 原型链，堵住“动态创建 iframe 获取干净 API”的漏洞
    if (window.HTMLIFrameElement) {
        const origGet = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get;
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
            get: function() {
                const win = origGet.apply(this);
                if (win) {
                    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate', 'WebTransport'].forEach(prop => {
                        try {
                            Object.defineProperty(win, prop, disableProps);
                        } catch (e) {}
                    });
                }
                return win;
            },
            configurable: true,
            enumerable: true
        });
    }
})();