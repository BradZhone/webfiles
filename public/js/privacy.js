// ========== 隐私模式 (Privacy Mode) ==========
// Desktop-only: hides real content when mouse leaves the page

(function () {
    'use strict';

    const STORAGE_KEY = 'privacyMode';
    let privacyEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    let overlay = null;
    let btn = null;

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

    function showDecoy() {
        const el = getOverlay();
        if (el) {
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
            b.classList.add('active');
            b.title = '隐私模式：开启';
        } else {
            b.textContent = '🔓';
            b.classList.remove('active');
            b.title = '隐私模式：关闭';
        }
    }

    function onMouseLeave(e) {
        // Only trigger if mouse actually left the viewport
        if (e.clientY <= 0 || e.clientX <= 0 ||
            e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            if (privacyEnabled) showDecoy();
        }
    }

    function onMouseEnter() {
        if (privacyEnabled) hideDecoy();
    }

    function bindEvents() {
        document.documentElement.addEventListener('mouseleave', onMouseLeave);
        document.documentElement.addEventListener('mouseenter', onMouseEnter);
    }

    function unbindEvents() {
        document.documentElement.removeEventListener('mouseleave', onMouseLeave);
        document.documentElement.removeEventListener('mouseenter', onMouseEnter);
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
