(function(global) {
    'use strict';
    
    var currentType = 'idea';
    var panelOpen = false;
    
    global.toggleQuickNote = function() {
        var panel = document.getElementById('quickNotePanel');
        if (!panel) return;
        panelOpen = !panelOpen;
        panel.style.display = panelOpen ? 'block' : 'none';
        if (panelOpen) {
            var ta = document.getElementById('quickNoteContent');
            if (ta) { ta.value = ''; ta.focus(); }
            loadRecentNotes();
        }
    };
    
    global.setQuickNoteType = function(btn) {
        document.querySelectorAll('.quicknote-type').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentType = btn.getAttribute('data-type');
        var ta = document.getElementById('quickNoteContent');
        if (ta) {
            if (currentType === 'todo') ta.placeholder = '每行一个待办事项...';
            else if (currentType === 'journal') ta.placeholder = '今天发生了什么...';
            else ta.placeholder = '写点什么...';
            ta.focus();
        }
    };
    
    global.saveQuickNote = async function() {
        var content = (document.getElementById('quickNoteContent') || {}).value;
        if (!content || !content.trim()) return;
        var hint = document.getElementById('quickNoteHint');
        try {
            if (hint) hint.textContent = '保存中...';
            var resp = await fetch('/api/quicknote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: currentType, content: content })
            });
            var data = await resp.json();
            if (data.success) {
                if (hint) {
                    hint.textContent = '✅ 已保存';
                    hint.style.color = '#a6e3a1';
                }
                var ta = document.getElementById('quickNoteContent');
                if (ta) ta.value = '';
                loadRecentNotes();
                setTimeout(function() {
                    if (hint) { hint.textContent = 'Ctrl+Enter 保存'; hint.style.color = ''; }
                }, 2000);
            } else {
                if (hint) { hint.textContent = '❌ ' + (data.error || '保存失败'); hint.style.color = '#f38ba8'; }
            }
        } catch (e) {
            if (hint) { hint.textContent = '❌ 网络错误'; hint.style.color = '#f38ba8'; }
        }
    };
    
    async function loadRecentNotes() {
        try {
            var resp = await fetch('/api/quicknote/recent');
            var data = await resp.json();
            var container = document.getElementById('quickNoteRecent');
            if (!container || !data.notes || data.notes.length === 0) {
                if (container) container.innerHTML = '';
                return;
            }
            var html = '<div class="quicknote-recent-title">最近速记</div>';
            data.notes.slice(0, 5).forEach(function(note) {
                var name = note.name.replace(/\.md$/, '');
                var time = new Date(note.modified).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                html += '<div class="quicknote-recent-item">' +
                    '<span class="quicknote-recent-name">' + name + '</span>' +
                    '<span class="quicknote-recent-time">' + time + '</span>' +
                    '</div>';
            });
            container.innerHTML = html;
        } catch {}
    }
    
    // Keyboard shortcut: Ctrl+Enter to save, Escape to close
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && panelOpen) {
            toggleQuickNote();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            var ta = document.getElementById('quickNoteContent');
            if (ta && document.activeElement === ta) {
                e.preventDefault();
                saveQuickNote();
            }
        }
    });
    
})(window);
