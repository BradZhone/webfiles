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
            // Auto-sync quicknote path to notes
            fetch('/api/quicknote/sync').catch(function() {});
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
            var configResp = await fetch('/api/quicknote/config');
            var configData = await configResp.json();
            var qnPath = configData.path || '';
            
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
                // Encode path info for jumping
                var encodedPath = encodeURIComponent(qnPath);
                var encodedFile = encodeURIComponent(note.path);
                html += '<div class="quicknote-recent-item" onclick="jumpToQuickNote(\'' + encodedPath + '\', \'' + encodedFile + '\')">'+
                    '<span class="quicknote-recent-name">' + name + '</span>' +
                    '<span class="quicknote-recent-time">' + time + '</span>' +
                    '</div>';
            });
            container.innerHTML = html;
        } catch(e) {}
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

    global.configQuickNotePath = function() {
        fetch('/api/quicknote/config').then(function(r) { return r.json(); }).then(function(data) {
            customPrompt('速记存储路径:', data.path || '', function(newPath) {
                if (!newPath || !newPath.trim()) return;
                fetch('/api/quicknote/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: newPath.trim() })
                }).then(function(r) { return r.json(); }).then(function(d) {
                    if (d.success) {
                        var hint = document.getElementById('quickNoteHint');
                        if (hint) { hint.textContent = '✅ 路径已更新'; hint.style.color = '#a6e3a1'; }
                        setTimeout(function() { if (hint) { hint.textContent = 'Ctrl+Enter 保存'; hint.style.color = ''; } }, 2000);
                    }
                });
            });
        });
    };

    global.jumpToQuickNote = function(encodedPath, encodedFile) {
        var qnPath = decodeURIComponent(encodedPath);
        var filePath = decodeURIComponent(encodedFile);
        
        // Close quicknote panel
        toggleQuickNote();
        
        // Switch to notes view
        if (typeof showNotesView === 'function') {
            showNotesView();
        }
        
        // After notes view loads, select the quicknote path and open the file
        setTimeout(function() {
            // Try to switch to quicknote path in notes dropdown
            if (typeof switchNotesPath === 'function') {
                switchNotesPath(qnPath);
            }
            // Try to open the specific file
            setTimeout(function() {
                if (typeof openNote === 'function') {
                    // Need to construct the full path
                    var fullPath = qnPath + '/' + filePath;
                    openNote(fullPath);
                }
            }, 500);
        }, 300);
    };
    
})(window);
