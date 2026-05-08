// ========== 隐私模式 (Privacy Mode) ==========
// Desktop-only: hides real content when mouse leaves the page

(function () {
    'use strict';

    const STORAGE_KEY = 'privacyMode';
    const POLL_INTERVAL = 800; // ms — fallback check interval

    let privacyEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    let overlay = null;
    let btn = null;
    let pollTimer = null;
    let lastMouseX = -1;
    let lastMouseY = -1;
    let mouseInViewport = true;

    // Desktop detection: pointer device with hover capability
    function isDesktop() {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    function getOverlay() {
        if (!overlay) overlay = document.getElementById('privacyOverlay');
        return overlay;
    }

    function getBtn() {
        if (!btn) btn = document.getElementById('privacyBtn');
        return btn;
    }

    function updateDecoyTime() {
        const now = new Date();
        const timeEl = document.getElementById('privacyTime');
        const dateEl = document.getElementById('privacyDate');
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        }
    }

    function showDecoy() {
        const el = getOverlay();
        if (el && !el.classList.contains('visible')) {
            updateDecoyTime();
            el.classList.add('visible');
        }
    }

    function hideDecoy() {
        const el = getOverlay();
        if (el) {
            el.classList.remove('visible');
        }
    }

    function updateButtonState() {
        const b = getBtn();
        if (!b) return;
        if (privacyEnabled) {
            b.textContent = '🔒';
            b.classList.add('privacy-active');
            b.title = '隐私模式：开启';
        } else {
            b.textContent = '🔓';
            b.classList.remove('privacy-active');
            b.title = '隐私模式：关闭';
        }
    }

    // --- Detection Strategy 1: mouseleave on documentElement ---
    function onMouseLeave(e) {
        if (!privacyEnabled) return;
        // Check if mouse actually left viewport bounds
        if (e.clientY <= 0 || e.clientX <= 0 ||
            e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            mouseInViewport = false;
            showDecoy();
        }
    }

    function onMouseEnter() {
        if (!privacyEnabled) return;
        mouseInViewport = true;
        hideDecoy();
    }

    // --- Detection Strategy 2: mouseout with relatedTarget check ---
    function onMouseOut(e) {
        if (!privacyEnabled) return;
        // relatedTarget is null when mouse leaves the document entirely
        if (e.relatedTarget === null || e.relatedTarget.nodeName === 'HTML') {
            mouseInViewport = false;
            showDecoy();
        }
    }

    // --- Detection Strategy 3: visibilitychange ---
    function onVisibilityChange() {
        if (!privacyEnabled) return;
        if (document.hidden) {
            showDecoy();
        } else {
            // Tab is visible again — only hide if mouse is confirmed in viewport
            // Use a small delay to let mouseenter fire first
            setTimeout(function () {
                if (mouseInViewport) hideDecoy();
            }, 50);
        }
    }

    // --- Detection Strategy 4: blur/focus on window ---
    function onWindowBlur() {
        if (!privacyEnabled) return;
        // Window lost focus — mouse likely left to browser chrome or other app
        mouseInViewport = false;
        showDecoy();
    }

    function onWindowFocus() {
        if (!privacyEnabled) return;
        // Only hide on focus if we detect mouse is back inside
        // The mouseenter handler will take care of actually hiding
    }

    // --- Detection Strategy 5: polling fallback ---
    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(function () {
            if (!privacyEnabled) return;
            // If document doesn't have focus and we haven't seen mouse recently, show decoy
            if (!document.hasFocus() && !mouseInViewport) {
                showDecoy();
            }
        }, POLL_INTERVAL);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // --- Track mouse position for fallback logic ---
    function onMouseMove(e) {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        mouseInViewport = true;
        // If decoy is showing but mouse is inside, hide it
        if (privacyEnabled) {
            hideDecoy();
        }
    }

    function bindEvents() {
        document.documentElement.addEventListener('mouseleave', onMouseLeave);
        document.documentElement.addEventListener('mouseenter', onMouseEnter);
        document.addEventListener('mouseout', onMouseOut);
        document.addEventListener('visibilitychange', onVisibilityChange);
        document.addEventListener('mousemove', onMouseMove);
        window.addEventListener('blur', onWindowBlur);
        window.addEventListener('focus', onWindowFocus);
        startPolling();
    }

    function unbindEvents() {
        document.documentElement.removeEventListener('mouseleave', onMouseLeave);
        document.documentElement.removeEventListener('mouseenter', onMouseEnter);
        document.removeEventListener('mouseout', onMouseOut);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        document.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('blur', onWindowBlur);
        window.removeEventListener('focus', onWindowFocus);
        stopPolling();
        hideDecoy();
    }

    // Global toggle function (called by onclick)
    window.togglePrivacyMode = function () {
        if (!isDesktop()) {
            if (typeof showToast === 'function') {
                showToast('隐私模式仅在桌面端可用', 'warning');
            }
            return;
        }

        privacyEnabled = !privacyEnabled;
        localStorage.setItem(STORAGE_KEY, privacyEnabled);
        updateButtonState();

        if (privacyEnabled) {
            bindEvents();
            if (typeof showToast === 'function') {
                showToast('🔒 隐私模式已开启', 'success');
            }
        } else {
            unbindEvents();
            if (typeof showToast === 'function') {
                showToast('🔓 隐私模式已关闭', 'info');
            }
        }
    };

    // Initialize on DOM ready
    function init() {
        updateButtonState();

        if (!isDesktop()) {
            // Hide button on mobile
            const b = getBtn();
            if (b) b.style.display = 'none';
            return;
        }

        if (privacyEnabled) {
            bindEvents();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
