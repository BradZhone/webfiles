(function(global) {
    'use strict';
    
    // Custom confirm dialog — replaces native confirm()
    // Usage: customConfirm('确定删除？', function() { /* on yes */ });
    // Or: customConfirm('确定删除？', function() { /* yes */ }, function() { /* no */ });
    global.customConfirm = function(message, onYes, onNo) {
        var overlay = document.createElement('div');
        overlay.className = 'custom-dialog-overlay';
        overlay.innerHTML = 
            '<div class="custom-dialog">' +
            '<p class="custom-dialog-msg">' + (message || '确认操作？') + '</p>' +
            '<div class="custom-dialog-actions">' +
            '<button class="custom-dialog-btn cancel">取消</button>' +
            '<button class="custom-dialog-btn confirm">确定</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        
        overlay.querySelector('.confirm').onclick = function() {
            overlay.remove();
            if (onYes) onYes();
        };
        overlay.querySelector('.cancel').onclick = function() {
            overlay.remove();
            if (onNo) onNo();
        };
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) { overlay.remove(); if (onNo) onNo(); }
        });
    };
    
    // Custom prompt dialog — replaces native prompt()
    // Usage: customPrompt('请输入名称:', '默认值', function(value) { /* on ok */ });
    global.customPrompt = function(message, defaultValue, onOk, onCancel) {
        var overlay = document.createElement('div');
        overlay.className = 'custom-dialog-overlay';
        overlay.innerHTML = 
            '<div class="custom-dialog">' +
            '<p class="custom-dialog-msg">' + (message || '请输入') + '</p>' +
            '<input type="text" class="custom-dialog-input" value="' + ((defaultValue || '').replace(/"/g, '&quot;')) + '">' +
            '<div class="custom-dialog-actions">' +
            '<button class="custom-dialog-btn cancel">取消</button>' +
            '<button class="custom-dialog-btn confirm">确定</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        
        var input = overlay.querySelector('.custom-dialog-input');
        setTimeout(function() { input.focus(); input.select(); }, 50);
        
        // Enter to confirm
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { overlay.remove(); if (onOk) onOk(input.value); }
            if (e.key === 'Escape') { overlay.remove(); if (onCancel) onCancel(); }
        });
        
        overlay.querySelector('.confirm').onclick = function() {
            overlay.remove();
            if (onOk) onOk(input.value);
        };
        overlay.querySelector('.cancel').onclick = function() {
            overlay.remove();
            if (onCancel) onCancel();
        };
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) { overlay.remove(); if (onCancel) onCancel(); }
        });
    };
    
})(window);
