// ========== 隐私模式 (Privacy Mode) ==========
// Desktop-only: hides real content when mouse leaves the page
// Reveal requires clicking a secret button on the decoy overlay.

(function () {
    'use strict';

    const STORAGE_KEY = 'privacyMode';
    const POLL_INTERVAL = 800; // ms — fallback check interval

    let privacyEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
    let overlay = null;
    let btn = null;
    let pollTimer = null;
    let revealBtn = null;

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

    function getRevealBtn() {
        if (!revealBtn) revealBtn = document.getElementById('privacyRevealBtn');
        return revealBtn;
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
            showDecoy();
        }
    }

    // --- Detection Strategy 2: mouseout with relatedTarget check ---
    function onMouseOut(e) {
        if (!privacyEnabled) return;
        // relatedTarget is null when mouse leaves the document entirely
        if (e.relatedTarget === null || e.relatedTarget.nodeName === 'HTML') {
            showDecoy();
        }
    }

    // --- Detection Strategy 3: visibilitychange ---
    function onVisibilityChange() {
        if (!privacyEnabled) return;
        if (document.hidden) {
            showDecoy();
        }
        // Tab becoming visible again does NOT auto-reveal — user must click the button
    }

    // --- Detection Strategy 4: blur on window ---
    function onWindowBlur() {
        if (!privacyEnabled) return;
        showDecoy();
    }

    // --- Detection Strategy 5: polling fallback ---
    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(function () {
            if (!privacyEnabled) return;
            if (!document.hasFocus()) {
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

    // --- Click-to-reveal handler ---
    function onRevealClick(e) {
        e.stopPropagation();
        e.preventDefault();
        if (privacyEnabled) {
            hideDecoy();
        }
    }

    function bindEvents() {
        document.documentElement.addEventListener('mouseleave', onMouseLeave);
        document.addEventListener('mouseout', onMouseOut);
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('blur', onWindowBlur);
        startPolling();

        // Bind reveal button
        const rb = getRevealBtn();
        if (rb) {
            rb.addEventListener('click', onRevealClick);
        }
    }

    function unbindEvents() {
        document.documentElement.removeEventListener('mouseleave', onMouseLeave);
        document.removeEventListener('mouseout', onMouseOut);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('blur', onWindowBlur);
        stopPolling();
        hideDecoy();

        // Unbind reveal button
        const rb = getRevealBtn();
        if (rb) {
            rb.removeEventListener('click', onRevealClick);
        }
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
