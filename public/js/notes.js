;(function NotesModule(global) {
    'use strict';

    // ========== Private State ==========
    let notesPaths = [];
    let currentNotesPath = null;
    let currentNote = null;
    let currentNoteContent = '';
    let notesList = [];
    let notesEditor = null;
    let autoSaveTimer = null;
    let isModified = false;
    let currentFilter = 'all';
    let currentTagFilter = ''; // empty = no tag filter
    let searchQuery = '';
    let searchDebounceTimer = null;
    let serverSearchActive = false;
    let currentTab = 'edit'; // 'edit' | 'preview' | 'todos'
    let sidebarCollapsed = false;
    let dirBrowserCurrentPath = '';

    function onEditorChange() {
        isModified = true;
        updateSaveStatus('modified');
        scheduleAutoSave();
        if (currentTab === 'preview') {
            renderPreview(notesEditor.getValue());
        }
    }

    // ========== Constants ==========
    const AUTO_SAVE_DELAY = 2000;
    const TYPE_ICONS = { note: '📝', idea: '💡', todo: '✅', journal: '📔' };
    const TYPE_LABELS = { note: '笔记', idea: '想法', todo: '待办', journal: '日记' };
    const CATEGORY_MAP = { all: '全部', note: '笔记', idea: '想法', todo: '待办' };

    // ========== Annotation Path Sync ==========
    async function syncAnnotationPaths() {
        try {
            var resp = await fetch('/api/vault/notes-paths');
            var data = await resp.json();
            if (!data.notesPaths || data.notesPaths.length === 0) return;
            var configResp = await fetch('/api/notes/paths');
            var configData = await configResp.json();
            var existingPaths = (configData.paths || configData || []).map(function(p) { return p.path; });
            for (var i = 0; i < data.notesPaths.length; i++) {
                var np = data.notesPaths[i];
                if (existingPaths.indexOf(np.path) === -1) {
                    await fetch('/api/notes/paths', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: np.path, name: np.name })
                    });
                }
            }
        } catch (e) {}
    }


    // ========== View Initialization ==========
    global.showNotesView = async function() {
        showView('notesView');
        document.getElementById('headerTitle').textContent = '📝 笔记';
        serverSearchActive = false;
        await syncAnnotationPaths();
        await loadNotesPaths();
        renderPathSelector();
        renderTagFilterBar();
        updateSearchClearButton(searchQuery);
        if (notesPaths.length > 0) {
            if (!currentNotesPath || !isUsableNotesPath(currentNotesPath)) {
                currentNotesPath = getDefaultNotesPath();
            }
            renderPathSelector();
            await loadNotes();
            if (!currentNote) showEmptyState();
        } else {
            renderEmptyPaths();
        }
    };

    global.closeNotesView = function() {
        clearAutoSave();
        if (isModified && currentNote && notesEditor) {
            saveCurrentNote();
        }
        if (notesEditor) {
            notesEditor.toTextArea();
            notesEditor = null;
        }
        showView('listView');
        document.getElementById('headerTitle').textContent = '文件管理器';
    };

    // ========== Path Management ==========
    async function loadNotesPaths() {
        try {
            const resp = await fetch('/api/notes/paths');
            if (resp.status === 401) { window.location.href = '/login'; return; }
            const data = await resp.json();
            notesPaths = data.paths || [];
        } catch (e) {
            showToast('加载笔记路径失败: ' + e.message, 'error');
        }
    }

    global.showNotesPathManager = function() {
        const modal = document.getElementById('notesPathManager');
        if (!modal) return;
        renderNotesPathManager();
        modal.classList.remove('notes-hidden');
        modal.style.display = 'flex';
    };

    global.hideNotesPathManager = function() {
        const modal = document.getElementById('notesPathManager');
        if (!modal) return;
        modal.classList.add('notes-hidden');
        modal.style.display = 'none';
    };

    function renderNotesPathManager() {
        const list = document.getElementById('notesPathManagerList');
        if (!list) return;
        if (notesPaths.length === 0) {
            list.innerHTML = '<div class="notes-list-empty"><span class="empty-icon">📂</span>还没有配置笔记目录</div>';
            return;
        }
        list.innerHTML = notesPaths.map(p => `
            <div class="notes-path-item">
                <span class="path-icon">📁</span>
                <div class="path-info">
                    <div class="path-name">${escapeHtml(p.name)}</div>
                    <div class="path-value">${escapeHtml(p.path)}</div>
                </div>
                <button class="path-delete" onclick="removeNotesPath('${p.id}')" title="删除">✕</button>
            </div>
        `).join('');
    }


    global.removeNotesPath = async function(id) {
        if (!confirm('确定要移除此笔记路径吗？（不会删除文件）')) return;
        try {
            const resp = await fetch('/api/notes/paths/' + id, { method: 'DELETE' });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            notesPaths = data.paths;
            renderNotesPathManager();
            renderPathSelector();
            if (notesPaths.length > 0 && !notesPaths.find(p => p.path === currentNotesPath)) {
                currentNotesPath = notesPaths[0].path;
            }
            if (notesPaths.length === 0) {
                currentNotesPath = null;
                renderEmptyPaths();
            } else {
                await loadNotes();
            }
            showToast('路径已移除', 'success');
        } catch (e) {
            showToast('移除失败: ' + e.message, 'error');
        }
    };

    function renderEmptyPaths() {
        const list = document.getElementById('notesList');
        if (list) {
            list.innerHTML = '<div class="notes-list-empty"><span class="empty-icon">📝</span>点击 + 添加笔记目录</div>';
        }
        showEmptyState();
    }

    // ========== Sidebar Path Selector ==========
    function renderPathSelector() {
        const dropdown = document.getElementById('notesPathDropdown');
        if (!dropdown) return;
        let html = '';
        if (notesPaths.length === 0) {
            html = '<option value="">\u6dfb\u52a0\u7b14\u8bb0\u76ee\u5f55...</option>';
        } else {
            notesPaths.forEach(function(p) {
                const selected = p.path === currentNotesPath ? ' selected' : '';
                html += '<option value="' + escapeAttr(p.path) + '"' + selected + '>' + escapeHtml(p.name) + '</option>';
            });
        }
        dropdown.innerHTML = html;
    }

    global.removeCurrentNotesPath = async function() {
        if (!currentNotesPath) { showToast('\u8bf7\u5148\u9009\u62e9\u8def\u5f84', 'error'); return; }
        const currentP = notesPaths.find(function(p) { return p.path === currentNotesPath; });
        if (!currentP) return;
        if (!confirm('\u786e\u5b9a\u8981\u79fb\u9664\u300c' + currentP.name + '\u300d\u5417\uff1f\uff08\u4e0d\u4f1a\u5220\u9664\u6587\u4ef6\uff09')) return;
        try {
            const resp = await fetch('/api/notes/paths/' + currentP.id, { method: 'DELETE' });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            notesPaths = data.paths;
            if (notesPaths.length > 0) {
                currentNotesPath = notesPaths[0].path;
                renderPathSelector();
                await loadNotes();
            } else {
                currentNotesPath = null;
                renderPathSelector();
                renderEmptyPaths();
            }
            showToast('\u8def\u5f84\u5df2\u79fb\u9664', 'success');
        } catch (e) {
            showToast('\u79fb\u9664\u5931\u8d25: ' + e.message, 'error');
        }
    };

    // ========== Directory Browser ==========
    global.showDirBrowser = async function() {
        dirBrowserCurrentPath = '';
        const modal = document.getElementById('notesDirBrowser');
        if (!modal) return;
        modal.classList.remove('notes-hidden');
        modal.style.display = 'flex';
        const nameInput = document.getElementById('dirBrowserName');
        if (nameInput) nameInput.value = '';
        notesBrowseTo('');
    };

    global.hideDirBrowser = function() {
        const modal = document.getElementById('notesDirBrowser');
        if (modal) {
            modal.classList.add('notes-hidden');
            modal.style.display = 'none';
        }
    };

    global.notesBrowseTo = async function(dirPath) {
        const pathEl = document.getElementById('notesDirBrowserPath');
        const listEl = document.getElementById('notesDirBrowserList');
        if (!listEl) return;
        listEl.innerHTML = '<div class="notes-list-empty"><div class="spinner"></div></div>';
        try {
            const url = '/api/browse' + (dirPath ? '?path=' + encodeURIComponent(dirPath) : '');
            const resp = await fetch(url);
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            dirBrowserCurrentPath = data.path;
            if (pathEl) pathEl.textContent = data.path;
            let html = '';
            const parentPath = data.path.replace(/\/[^\/]+\/?$/, '');
            if (parentPath && parentPath !== data.path) {
                html += '<div class="dir-browser-item dir-browser-up" onclick="notesBrowseTo(\'' + escapeAttr(parentPath) + '\')"><span class="dir-icon">⬆️</span> ..</div>';
            }
            if (data.dirs && data.dirs.length > 0) {
                data.dirs.forEach(function(d) {
                    html += '<div class="dir-browser-item" onclick="notesBrowseTo(\'' + escapeAttr(d.path) + '\')"><span class="dir-icon">📁</span> ' + escapeHtml(d.name) + '</div>';
                });
            } else if (!parentPath || parentPath === data.path) {
                html += '<div class="notes-list-empty" style="padding:16px;">\u6ca1\u6709\u5b50\u76ee\u5f55</div>';
            }
            listEl.innerHTML = html;
            const nameInput = document.getElementById('dirBrowserName');
            if (nameInput && !nameInput.value) {
                const folderName = data.path.split('/').filter(Boolean).pop() || '';
                nameInput.value = folderName;
            }
        } catch (e) {
            listEl.innerHTML = '<div class="notes-list-empty">\u52a0\u8f7d\u5931\u8d25: ' + escapeHtml(e.message) + '</div>';
        }
    };

    global.selectDirFromBrowser = async function() {
        if (!dirBrowserCurrentPath) { showToast('\u8bf7\u5148\u9009\u62e9\u76ee\u5f55', 'error'); return; }
        const nameInput = document.getElementById('dirBrowserName');
        const name = nameInput ? nameInput.value.trim() : '';
        try {
            const resp = await fetch('/api/notes/paths', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dirBrowserCurrentPath, name: name || undefined })
            });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            notesPaths = data.paths;
            const newPath = notesPaths.find(function(p) { return p.path === dirBrowserCurrentPath; });
            if (newPath) currentNotesPath = newPath.path;
            renderPathSelector();
            hideDirBrowser();
            await loadNotes();
            showToast('\u8def\u5f84\u5df2\u6dfb\u52a0', 'success');
        } catch (e) {
            showToast('\u6dfb\u52a0\u5931\u8d25: ' + e.message, 'error');
        }
    };

    // ========== Notes Loading & Rendering ==========
    async function loadNotes() {
        if (!currentNotesPath) return;
        try {
            let params = '?path=' + encodeURIComponent(currentNotesPath);
            if (currentFilter !== 'all') params += '&type=' + currentFilter;
            if (currentTagFilter) params += '&tag=' + encodeURIComponent(currentTagFilter);
            const resp = await fetch('/api/notes/list' + params);
            if (resp.status === 401) { window.location.href = '/login'; return; }
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            notesList = data.notes || [];
            serverSearchActive = false;
            renderNotesList();
        } catch (e) {
            showToast('加载笔记失败: ' + e.message, 'error');
        }
    }

    function renderNotesList() {
        const list = document.getElementById('notesList');
        if (!list) return;

        const hasSearch = !!searchQuery.trim();
        let filtered = notesList;
        if (hasSearch && !serverSearchActive) {
            const q = searchQuery.toLowerCase();
            filtered = notesList.filter(n =>
                n.name.toLowerCase().includes(q) ||
                (n.tags && n.tags.some(t => t.toLowerCase().includes(q)))
            );
        }

        if (filtered.length === 0) {
            list.innerHTML = `<div class="notes-list-empty"><span class="empty-icon">${hasSearch ? '🔍' : '📝'}</span>${hasSearch ? '没有找到匹配的笔记' : '还没有笔记'}</div>`;
            return;
        }

        list.innerHTML = filtered.map(note => {
            const title = note.name.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
            const type = note.type || 'note';
            const icon = TYPE_ICONS[type] || '📝';
            const modified = formatRelativeTime(note.modified);
            const isActive = currentNote && currentNote.path === note.path;
            const tagsHtml = (note.tags || []).slice(0, 3).map(t => `<span class="note-item-tag" onclick="event.stopPropagation(); setTagFilter('${escapeAttr(t)}')">#${escapeHtml(t)}</span>`).join('');
            return `
                <div class="note-item${isActive ? ' active' : ''}" onclick="openNote('${escapeAttr(note.relativePath)}')">
                    <div class="note-item-title">${icon} ${escapeHtml(title)}</div>
                    <div class="note-item-meta">
                        <span class="note-item-type ${type}">${TYPE_LABELS[type] || type}</span>
                        <span>${modified}</span>
                    </div>
                    ${tagsHtml ? '<div class="note-item-tags">' + tagsHtml + '</div>' : ''}
                </div>`;
        }).join('');
    }

    // ========== Note Operations ==========
    global.openNote = async function(relativePath) {
        if (!currentNotesPath) return;
        clearAutoSave();
        if (isModified && currentNote) {
            await saveCurrentNote();
        }
        try {
            const resp = await fetch('/api/notes/read?path=' + encodeURIComponent(currentNotesPath) + '&file=' + encodeURIComponent(relativePath));
            if (resp.status === 401) { window.location.href = '/login'; return; }
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            currentNote = data;
            currentNoteContent = data.content;
            isModified = false;
            updateSaveStatus('saved');
            const editorHeader = document.getElementById('notesEditorHeader');
            const editorContainer = document.getElementById('notesEditorContainer');
            if (editorHeader) editorHeader.style.display = 'flex';
            if (editorContainer) editorContainer.style.display = 'flex';

            // Update editor
            if (notesEditor) {
                notesEditor.off('change', onEditorChange);
                isModified = false;
                notesEditor.setValue(data.content);
                notesEditor.clearHistory();
                notesEditor.on('change', onEditorChange);
            } else {
                initEditor(data.content);
            }

            // Update preview
            renderPreview(data.content);

            switchNotesTab(currentTab === 'todos' ? 'edit' : currentTab);

            // Update sidebar active state
            renderNotesList();

            // Collapse sidebar on mobile
            if (window.innerWidth <= 768) {
                toggleNotesSidebar(true);
            }
        } catch (e) {
            showToast('打开笔记失败: ' + e.message, 'error');
        }
    };

    async function saveCurrentNote() {
        if (!currentNote || !currentNotesPath || !notesEditor) return;
        const content = notesEditor.getValue();
        if (content === currentNoteContent) {
            isModified = false;
            updateSaveStatus('saved');
            return;
        }
        updateSaveStatus('saving');
        try {
            const resp = await fetch('/api/notes/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: currentNotesPath,
                    file: currentNote.relativePath,
                    content: content
                })
            });
            const data = await resp.json();
            if (data.error) { showToast('保存失败: ' + data.error, 'error'); updateSaveStatus('modified'); return; }
            currentNoteContent = content;
            isModified = false;
            updateSaveStatus('saved');
        } catch (e) {
            showToast('保存失败: ' + e.message, 'error');
            updateSaveStatus('modified');
        }
    }

    global.saveNotesFile = function() {
        clearAutoSave();
        saveCurrentNote();
    };

    global.deleteNotesFile = async function() {
        if (!currentNote || !currentNotesPath) return;
        if (!confirm('确定要删除此笔记吗？')) return;
        try {
            const resp = await fetch('/api/notes/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentNotesPath, file: currentNote.relativePath })
            });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            currentNote = null;
            currentNoteContent = '';
            if (notesEditor) notesEditor.setValue('');
            isModified = false;
            clearAutoSave();
            showToast('笔记已删除', 'success');
            showEmptyState();
            await loadNotes();
        } catch (e) {
            showToast('删除失败: ' + e.message, 'error');
        }
    };

    // ========== Note Creation ==========
    global.showNewNoteModal = function() {
        const modal = document.getElementById('notesNewModal');
        if (!modal) return;
        renderTemplateGrid();
        modal.classList.remove('notes-hidden');
        modal.style.display = 'flex';
    };

    global.hideNewNoteModal = function() {
        const modal = document.getElementById('notesNewModal');
        if (modal) {
            modal.classList.add('notes-hidden');
            modal.style.display = 'none';
        }
    };

    function renderTemplateGrid() {
        const grid = document.getElementById('notesTemplateGrid');
        if (!grid) return;
        const icons = { blank: '📄', meeting: '🤝', reading: '📖', weekly: '📅', todo: '✅' };
        fetch('/api/notes/templates')
            .then(r => r.json())
            .then(data => {
                grid.innerHTML = Object.entries(data.templates).map(([key, val]) => `
                    <div class="notes-template-item" onclick="createNoteFromTemplate('${key}')">
                        <span class="template-icon">${icons[key] || '📝'}</span>
                        <span class="template-name">${escapeHtml(val.name)}</span>
                    </div>
                `).join('');
            })
            .catch(() => {
                grid.innerHTML = '<div style="color:var(--dim);font-size:13px;">加载模板失败</div>';
            });
    }

    global.createNoteFromTemplate = async function(template) {
        hideNewNoteModal();
        const titleInput = document.getElementById('notesNewTitle');
        let title = titleInput ? titleInput.value.trim() : '';
        if (!title) title = '未命名';
        if (!currentNotesPath && notesPaths.length > 0) {
            currentNotesPath = notesPaths[0].path;
        }
        if (!currentNotesPath) {
            showToast('请先配置笔记路径', 'error');
            return;
        }
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const sanitized = title.replace(/[\/\\:*?"<>|]/g, '_');
        const fileName = dateStr + '-' + sanitized + '.md';
        try {
            const resp = await fetch('/api/notes/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: currentNotesPath,
                    file: fileName,
                    template: template
                })
            });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            if (titleInput) titleInput.value = '';
            showToast('笔记已创建', 'success');
            await loadNotes();
            await openNote(fileName);
        } catch (e) {
            showToast('创建失败: ' + e.message, 'error');
        }
    };

    // ========== Editor ==========
    function initEditor(content) {
        const wrap = document.getElementById('notesEditorWrap');
        if (!wrap) return;
        wrap.innerHTML = '';
        const textarea = document.createElement('textarea');
        wrap.appendChild(textarea);
        notesEditor = CodeMirror.fromTextArea(textarea, {
            mode: 'markdown',
            theme: 'dracula',
            lineWrapping: true,
            lineNumbers: false,
            autofocus: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            extraKeys: {
                'Ctrl-S': function() { global.saveNotesFile(); },
                'Cmd-S': function() { global.saveNotesFile(); },
                'Tab': function(cm) {
                    cm.replaceSelection('    ', 'end');
                }
            }
        });
        notesEditor.setValue(content || '');
        notesEditor.on('change', onEditorChange);
    }

    function scheduleAutoSave() {
        clearAutoSave();
        autoSaveTimer = setTimeout(function() {
            if (isModified) {
                saveCurrentNote();
            }
        }, AUTO_SAVE_DELAY);
    }

    function clearAutoSave() {
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    }

    function updateSaveStatus(status) {
        const el = document.getElementById('notesSaveStatus');
        if (!el) return;
        const labels = { saved: '✓ 已保存', saving: '⏳ 保存中...', modified: '● 已修改' };
        el.textContent = labels[status] || '';
        el.className = 'notes-save-status ' + status;
    }

    function renderEmptyEditor() {
        showEmptyState();
    }

    function showEmptyState() {
        var editorHeader = document.getElementById('notesEditorHeader');
        var editorContainer = document.getElementById('notesEditorContainer');
        var previewBody = document.getElementById('notesPreviewBody');
        var todosContainer = document.getElementById('notesTodosContainer');
        setElementVisibility(editorHeader, false, 'flex');
        setElementVisibility(editorContainer, false, 'flex');
        setElementVisibility(todosContainer, false, 'block');
        if (previewBody) {
            setElementVisibility(previewBody, true, 'block');
            previewBody.innerHTML = '<div class="notes-empty-state"><div class="empty-icon">📝</div><p>选择笔记开始编辑</p><span class="empty-hint">从左侧列表选择一个笔记，或点击 + 创建新笔记</span></div>';
        }
    }

    // ========== Preview ==========
    function renderPreview(content) {
        const container = document.getElementById('notesPreviewBody');
        if (!container) return;
        if (!content) {
            container.innerHTML = '<div class="notes-empty-state"><p>暂无内容</p></div>';
            return;
        }
        const { body } = parseFrontmatterClient(content);
        let html = '';
        if (typeof marked !== 'undefined') {
            html = marked.parse(body);
        } else {
            html = '<pre>' + escapeHtml(body) + '</pre>';
        }
        // Convert checkboxes to interactive ones
        let lineIndex = 0;
        const lines = content.split('\n');
        html = html.replace(/<li><input type="checkbox"(?: disabled)?( checked)?>\s*/g, function(match, checked) {
            // Find the corresponding line number
            while (lineIndex < lines.length && !lines[lineIndex].match(/^\s*- \[[ x]\]/i)) {
                lineIndex++;
            }
            const ln = lineIndex;
            lineIndex++;
            const checkedAttr = checked ? ' checked' : '';
            return `<li><input type="checkbox"${checkedAttr} onchange="toggleNoteTodo(${ln})" data-line="${ln}"> `;
        });
        container.innerHTML = '<div class="markdown-body">' + html + '</div>';
        // Highlight code blocks
        if (typeof hljs !== 'undefined') {
            container.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }
    }

    function parseFrontmatterClient(content) {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match) return { metadata: null, body: content };
        const body = content.slice(match[0].length).replace(/^\n+/, '');
        const metadata = {};
        match[1].split('\n').forEach(function(line) {
            const m = line.match(/^(\w+):\s*(.*)$/);
            if (m) {
                let val = m[2].trim();
                if (val.startsWith('[') && val.endsWith(']')) {
                    val = val.slice(1, -1).split(',').map(function(s) { return s.trim(); });
                }
                metadata[m[1]] = val;
            }
        });
        return { metadata, body };
    }

    // ========== Tabs ==========
    global.switchNotesTab = function(tab) {
        currentTab = tab;
        const tabs = document.querySelectorAll('.notes-content-tab');
        tabs.forEach(function(t) {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        const editEl = document.getElementById('notesEditorContainer');
        const previewEl = document.getElementById('notesPreviewBody');
        const todosEl = document.getElementById('notesTodosContainer');
        const headerEl = document.getElementById('notesEditorHeader');
        const hasCurrentNote = !!currentNote;

        setElementVisibility(editEl, hasCurrentNote && tab === 'edit', 'flex');
        setElementVisibility(previewEl, tab === 'preview' || (!hasCurrentNote && tab !== 'todos'), 'block');
        setElementVisibility(todosEl, tab === 'todos', 'block');
        setElementVisibility(headerEl, hasCurrentNote && tab === 'edit', 'flex');

        if (tab === 'preview' && notesEditor) {
            renderPreview(notesEditor.getValue());
        }
        if (tab === 'todos') {
            loadTodosView();
        }
        if (tab === 'edit' && notesEditor) {
            setTimeout(function() { notesEditor.refresh(); }, 10);
        }
    };

    // ========== Category Filter ==========
    global.setNotesFilter = function(filter) {
        currentFilter = filter;
        const tabs = document.querySelectorAll('.notes-category-tab');
        tabs.forEach(function(t) {
            t.classList.toggle('active', t.dataset.filter === filter);
        });
        loadNotes();
    };

    // ========== Search ==========
    global.onNotesSearch = function(value) {
        searchQuery = value;
        updateSearchClearButton(value);
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        searchDebounceTimer = setTimeout(async function() {
            if (!searchQuery.trim()) {
                serverSearchActive = false;
                await loadNotes();
                return;
            }
            if (serverSearchActive) {
                serverSearchActive = false;
                await loadNotes();
                return;
            }
            renderNotesList();
        }, 300);
    };

    global.clearNotesSearch = function() {
        var input = document.getElementById('notesSearchInput');
        if (input) input.value = '';
        searchQuery = '';
        serverSearchActive = false;
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        updateSearchClearButton('');
        loadNotes();
    };

    global.doNotesSearch = async function() {
        var input = document.getElementById('notesSearchInput');
        if (!input) return;
        var q = input.value.trim();
        searchQuery = q;
        updateSearchClearButton(q);
        if (!q) { serverSearchActive = false; await loadNotes(); return; }
        try {
            const resp = await fetch('/api/notes/search?q=' + encodeURIComponent(q) +
                (currentNotesPath ? '&path=' + encodeURIComponent(currentNotesPath) : ''));
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            notesList = data.results.map(function(r) { return {
                name: r.name,
                path: r.path,
                relativePath: r.relativePath,
                type: r.type,
                tags: r.tags,
                modified: r.modified,
                snippet: r.snippet
            }; });
            serverSearchActive = true;
            renderNotesList();
        } catch (e) {
            showToast('搜索失败: ' + e.message, 'error');
        }
    };

    // ========== Todo Checkbox Toggle ==========
    global.toggleNoteTodo = async function(lineNum) {
        if (!currentNote) return;
        try {
            const resp = await fetch('/api/notes/toggle-todo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentNote.path, line: lineNum })
            });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            // Reload the note to sync editor
            await openNote(currentNote.relativePath);
        } catch (e) {
            showToast('切换失败: ' + e.message, 'error');
        }
    };

    // ========== Todos Aggregation View ==========
    async function loadTodosView() {
        const container = document.getElementById('notesTodosContainer');
        if (!container) return;
        container.innerHTML = '<div class="notes-list-empty"><div class="spinner"></div></div>';
        try {
            const resp = await fetch('/api/notes/todos');
            const data = await resp.json();
            if (data.error) { container.innerHTML = '<div class="notes-list-empty">加载失败</div>'; return; }
            renderTodosView(container, data);
        } catch (e) {
            container.innerHTML = '<div class="notes-list-empty">加载失败: ' + escapeHtml(e.message) + '</div>';
        }
    }

    function renderTodosView(container, data) {
        const todos = data.todos || [];
        const unchecked = todos.filter(t => !t.checked);
        const checked = todos.filter(t => t.checked);
        const total = todos.length;
        const done = checked.length;

        let html = '';
        // Progress bar
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        html += `<div class="notes-todo-progress">
            <div class="notes-todo-progress-bar"><div class="notes-todo-progress-fill" style="width:${pct}%"></div></div>
            <span class="notes-todo-progress-text">${done}/${total}</span>
        </div>`;

        // Group by file
        const groups = {};
        unchecked.forEach(t => {
            const key = t.filePath;
            if (!groups[key]) groups[key] = { name: t.file, notesName: t.notesName, items: [] };
            groups[key].items.push(t);
        });

        html += '<div style="padding:8px;">';
        if (Object.keys(groups).length === 0) {
            html += '<div class="notes-list-empty"><span class="empty-icon">🎉</span>没有未完成的待办事项</div>';
        } else {
            for (const [filePath, group] of Object.entries(groups)) {
                html += `<div class="notes-todo-group">`;
                html += `<div class="notes-todo-group-header" onclick="openNote('${escapeAttr(group.items[0].relativePath)}')">📄 ${escapeHtml(group.name)} <span style="color:var(--dim);font-size:11px;">(${group.notesName})</span></div>`;
                group.items.forEach(t => {
                    html += `<div class="notes-todo-item" onclick="toggleAggTodo('${escapeAttr(t.filePath)}', ${t.line})">
                        <input type="checkbox" ${t.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleAggTodo('${escapeAttr(t.filePath)}', ${t.line})">
                        <span>${escapeHtml(t.text)}</span>
                    </div>`;
                });
                html += '</div>';
            }
        }

        // Completed section
        if (checked.length > 0) {
            html += `<div class="notes-todo-group" style="margin-top:16px;">`;
            html += `<div class="notes-todo-group-header" style="color:var(--dim);">✅ 已完成 (${checked.length})</div>`;
            checked.slice(0, 20).forEach(t => {
                html += `<div class="notes-todo-item checked" onclick="toggleAggTodo('${escapeAttr(t.filePath)}', ${t.line})">
                    <input type="checkbox" checked onclick="event.stopPropagation(); toggleAggTodo('${escapeAttr(t.filePath)}', ${t.line})">
                    <span>${escapeHtml(t.text)}</span>
                    <span class="todo-source">${escapeHtml(t.file)}</span>
                </div>`;
            });
            if (checked.length > 20) {
                html += `<div style="padding:8px 16px;font-size:12px;color:var(--dim);">... 还有 ${checked.length - 20} 项已完成</div>`;
            }
            html += '</div>';
        }
        html += '</div>';

        container.innerHTML = html;
    }

    global.toggleAggTodo = async function(filePath, lineNum) {
        try {
            const resp = await fetch('/api/notes/toggle-todo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, line: lineNum })
            });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            // Reload todos view
            loadTodosView();
            // If this file is currently open, reload it
            if (currentNote && currentNote.path === filePath) {
                await openNote(currentNote.relativePath);
            }
        } catch (e) {
            showToast('切换失败: ' + e.message, 'error');
        }
    };

    // ========== Quick Capture ==========
    global.doQuickCapture = async function() {
        if (!currentNotesPath) {
            showToast('请先配置笔记路径', 'error');
            return;
        }
        const input = document.getElementById('notesQuickInput');
        if (!input) return;
        const content = input.value.trim();
        if (!content) return;
        // Extract tags
        const tagMatches = content.match(/#([\w\u4e00-\u9fa5]+)/g);
        const tags = tagMatches ? tagMatches.map(t => t.slice(1)) : [];
        const cleanContent = content.replace(/#[\w\u4e00-\u9fa5]+/g, '').trim();
        try {
            const resp = await fetch('/api/notes/quick-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: cleanContent || content, tags, path: currentNotesPath || undefined })
            });
            const data = await resp.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            input.value = '';
            showToast('已记录 ✓', 'success');
            // Reload notes if inbox might be in the current list
            loadNotes();
        } catch (e) {
            showToast('记录失败: ' + e.message, 'error');
        }
    };

    // ========== Sidebar Toggle ==========
    global.toggleNotesSidebar = function(forceCollapse) {
        var sidebar = document.getElementById('notesSidebar');
        if (!sidebar) return;
        if (forceCollapse === true) {
            sidebar.classList.add('collapsed');
            sidebarCollapsed = true;
        } else if (forceCollapse === false) {
            sidebar.classList.remove('collapsed');
            sidebarCollapsed = false;
        } else {
            sidebarCollapsed = !sidebarCollapsed;
            sidebar.classList.toggle('collapsed', sidebarCollapsed);
        }
    };

    // ========== Notes Path Switcher ==========
    global.switchNotesPath = function(notesPath) {
        if (!notesPath) return;
        if (!isUsableNotesPath(notesPath)) {
            showToast('该笔记目录不可用，请在路径管理中移除或更换', 'error');
            renderPathSelector();
            return;
        }
        currentNotesPath = notesPath;
        currentNote = null;
        currentTagFilter = '';
        currentFilter = 'all';
        document.querySelectorAll('.notes-category-tab').forEach(function(t) {
            t.classList.toggle('active', t.dataset.filter === 'all');
        });
        renderTagFilterBar();
        serverSearchActive = false;
        loadNotes();
        showEmptyState();
        renderPathSelector();
    };

    // ========== Utility Functions ==========
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeAttr(text) {
        if (!text) return '';
        return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function formatRelativeTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return diffMins + '分钟前';
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return diffHrs + '小时前';
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 7) return diffDays + '天前';
        if (diffDays < 30) return Math.floor(diffDays / 7) + '周前';
        return date.toLocaleDateString('zh-CN');
    }

    function updateSearchClearButton(value) {
        var clearBtn = document.getElementById('notesSearchClear');
        if (!clearBtn) return;
        clearBtn.classList.toggle('notes-hidden', !value);
    }

    function isUsableNotesPath(notesPath) {
        return !!(notesPath && typeof HOME !== 'undefined' && notesPath.startsWith(HOME));
    }

    function getDefaultNotesPath() {
        var usable = notesPaths.find(function(p) {
            return isUsableNotesPath(p.path);
        });
        return usable ? usable.path : (notesPaths[0] ? notesPaths[0].path : null);
    }

    function setElementVisibility(element, visible, displayValue) {
        if (!element) return;
        element.classList.toggle('notes-hidden', !visible);
        element.style.display = visible ? (displayValue || '') : 'none';
    }

    // ========== Tag Filter ==========
    global.setTagFilter = function(tag) {
        currentTagFilter = (currentTagFilter === tag) ? '' : tag; // toggle
        renderTagFilterBar();
        loadNotes();
    };

    global.clearTagFilter = function() {
        currentTagFilter = '';
        renderTagFilterBar();
        loadNotes();
    };

    function renderTagFilterBar() {
        var bar = document.getElementById('notesTagFilter');
        var val = document.getElementById('notesTagFilterValue');
        if (!bar) return;
        if (currentTagFilter) {
            bar.classList.remove('notes-hidden');
            bar.style.display = 'flex';
            if (val) val.textContent = '#' + currentTagFilter;
        } else {
            bar.classList.add('notes-hidden');
            bar.style.display = 'none';
            if (val) val.textContent = '';
        }
    }
})(window);
