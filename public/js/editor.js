// editor.js - Multi-tab editor, CodeMirror init, format, save
async function openFile(path, type) {
    const name = path.split('/').pop();

    // 检查文件是否已打开
    if (openFiles[path]) {
        switchToFileTab(path);
        return;
    }

    document.getElementById('headerTitle').textContent = name;
    document.getElementById('editorTitle').textContent = name;
    document.getElementById('editorStatus').textContent = '';
    document.getElementById('editorStatus').className = 'editor-status';
    document.getElementById('editorWrap').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    showView('editorView');

    const isMd = type === 'markdown';
    const isHtml = type === 'html';
    document.getElementById('viewToggle').style.display = (isMd || isHtml) ? 'flex' : 'none';

    const bar = document.getElementById('editorBar');
    if (['image', 'audio', 'video', 'pdf', 'binary'].includes(type)) {
        bar.innerHTML = Button.editorBar(false);
    } else {
        bar.innerHTML = Button.editorBar(true);
    }

    try {
        const res = await fetch('/api/file?path=' + encodeURIComponent(path));
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        currentFile = path;
        currentFileType = data.type || 'text';
        modified = false;
        currentView = 'edit';

        const wrap = document.getElementById('editorWrap');

        if (data.type === 'image') {
            const imgSrc = `data:${data.mime};base64,${data.data}`;
            wrap.innerHTML = `<div class="media-view">
                <img src="${imgSrc}" alt="${name}" onclick="openImageViewer('${imgSrc}', '${name.replace(/'/g, "\\'")}')">
                <div class="media-info">
                    <div class="media-info-title">${name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">📷 ${data.mime.split('/')[1]?.toUpperCase() || '图片'}</span>
                    </div>
                    <div class="media-info-actions">
                        <button class="media-action-btn" onclick="openImageViewer('${imgSrc}', '${name.replace(/'/g, "\\'")}')">🔍 放大</button>
                        <button class="media-action-btn" onclick="downloadCurrentFile()">⬇ 下载</button>
                    </div>
                </div>
            </div>`;
            // 媒体文件也加入标签
            addFileTab(path, name, data.type, false);
            return;
        }

        if (data.type === 'audio') {
            wrap.innerHTML = `<div class="media-view">
                <div style="font-size:64px;margin-bottom:16px;opacity:0.8">🎵</div>
                <audio controls src="data:${data.mime};base64,${data.data}" style="width:100%;max-width:400px"></audio>
                <div class="media-info">
                    <div class="media-info-title">${name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">🎵 ${data.mime.split('/')[1]?.toUpperCase() || '音频'}</span>
                    </div>
                </div>
            </div>`;
            addFileTab(path, name, data.type, false);
            return;
        }

        if (data.type === 'video') {
            wrap.innerHTML = `<div class="media-view">
                <video controls src="data:${data.mime};base64,${data.data}" style="max-width:100%;max-height:60vh;border-radius:8px;background:#000"></video>
                <div class="media-info">
                    <div class="media-info-title">${name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">🎬 ${data.mime.split('/')[1]?.toUpperCase() || '视频'}</span>
                    </div>
                </div>
            </div>`;
            addFileTab(path, name, data.type, false);
            return;
        }

        if (data.type === 'pdf') {
            wrap.innerHTML = `<div class="media-view" style="padding:0;flex-direction:column">
                <iframe class="html-preview" src="data:application/pdf;base64,${data.data}" style="flex:1;min-height:60vh"></iframe>
                <div class="media-info" style="margin:12px">
                    <div class="media-info-title">${name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">📄 PDF</span>
                    </div>
                </div>
            </div>`;
            addFileTab(path, name, data.type, false);
            return;
        }

        if (data.isBinary) {
            const ext = name.split('.').pop().toLowerCase();
            const binaryIcons = {
                zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
                exe: '⚙️', msi: '⚙️', dmg: '⚙️', app: '⚙️',
                apk: '📱', ipa: '📱',
                font: '🔤', ttf: '🔤', otf: '🔤', woff: '🔤', woff2: '🔤',
                default: '📦'
            };
            const icon = binaryIcons[ext] || binaryIcons.default;
            wrap.innerHTML = `<div class="binary-notice">
                <div class="icon">${icon}</div>
                <div style="font-size:16px;margin-top:8px">${name}</div>
                <div style="font-size:12px;color:var(--dim);margin-top:4px">${formatSize(data.size)} · ${ext.toUpperCase()} 文件</div>
                <div class="media-info-actions" style="margin-top:16px">
                    <button class="media-action-btn" onclick="downloadCurrentFile()">⬇ 下载</button>
                </div>
            </div>`;
            addFileTab(path, name, 'binary', false);
            return;
        }

        fileContent = data.content || '';

        // 添加到标签（文本文件）
        addFileTab(path, name, data.type, false, fileContent);

        // HTML 文件 - 默认预览 (使用 API 返回的类型)
        if (data.type === 'html' || isHtml) {
            currentView = 'preview';
            document.querySelectorAll('.toggle-btn').forEach((btn, i) => {
                btn.classList.toggle('active', i === 1);
            });
            const blob = new Blob([fileContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            wrap.innerHTML = `<iframe class="html-preview" src="${url}" style="border:none;width:100%;flex:1;background:#fff;"></iframe>`;
            document.getElementById('viewToggle').style.display = 'flex';
            return;
        }

        // Markdown
        if (isMd) {
            if (!data.content || data.content.trim() === '') {
                currentView = 'edit';
                document.querySelectorAll('.toggle-btn').forEach((btn, i) => {
                    btn.classList.toggle('active', i === 0);
                });
                initEditor('', name, path);
            } else {
                currentView = 'preview';
                document.querySelectorAll('.toggle-btn').forEach((btn, i) => {
                    btn.classList.toggle('active', i === 1);
                });
                wrap.innerHTML = `<div class="markdown-view"><div class="markdown-body">${marked.parse(data.content)}</div></div>`;
                renderMermaidDiagrams(wrap);
                loadEmbeds(wrap);
            }
        } else {
            initEditor(data.content || '', name, path);
        }

    } catch (e) {
        showToast(e.message, 'error');
        goBack();
    }
}

// 多标签功能
function addFileTab(path, name, fileType, isModified, content = '') {
    if (openFiles[path]) {
        switchToFileTab(path);
        return;
    }

    // 获取文件图标
    const icon = getFileIcon(name, false, fileType);

    // 创建标签
    const tabsContainer = document.getElementById('editorTabs');
    const tab = document.createElement('div');
    tab.className = 'editor-tab';
    tab.id = 'editorTab_' + path.replace(/[^a-zA-Z0-9]/g, '_');
    tab.dataset.path = path;
    tab.innerHTML = `
        <span class="editor-tab-icon">${icon}</span>
        <span class="editor-tab-name">${name}</span>
        <span class="editor-tab-modified" style="display:none;"></span>
        <span class="editor-tab-close" onclick="event.stopPropagation(); closeFileTab('${escapeJs(path)}')">×</span>
    `;
    tab.onclick = () => switchToFileTab(path);
    tabsContainer.appendChild(tab);

    // 保存文件信息
    openFiles[path] = {
        name,
        content,
        fileType,
        modified: false,
        editor: null,
        cursor: null
    };

    switchToFileTab(path);
    updateFormatButton(fileType);
    updateOpenFilesCount();
}

function switchToFileTab(path) {
    if (!openFiles[path]) return;

    const fileData = openFiles[path];
    activeFilePath = path;
    currentFile = path;
    currentFileType = fileData.fileType;

    // 更新标签状态
    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.path === path);
    });

    // 更新标题
    document.getElementById('headerTitle').textContent = fileData.name;
    document.getElementById('editorTitle').textContent = fileData.name;

    // 更新状态
    const statusEl = document.getElementById('editorStatus');
    if (fileData.modified) {
        statusEl.textContent = '已修改';
        statusEl.className = 'editor-status modified';
    } else {
        statusEl.textContent = '';
        statusEl.className = 'editor-status';
    }

    // 更新视图切换按钮
    const isMd = fileData.fileType === 'markdown';
    const isHtml = fileData.fileType === 'html';
    document.getElementById('viewToggle').style.display = (isMd || isHtml) ? 'flex' : 'none';

    // 更新底部栏
    const bar = document.getElementById('editorBar');
    if (['image', 'audio', 'video', 'pdf', 'binary'].includes(fileData.fileType)) {
        bar.innerHTML = Button.editorBar(false);
    } else {
        bar.innerHTML = Button.editorBar(true);
    }

    // 渲染内容
    const wrap = document.getElementById('editorWrap');

    if (fileData.editor) {
        // 已有编辑器实例，切换显示
        wrap.innerHTML = '';
        const textarea = document.createElement('textarea');
        textarea.id = 'code_' + path.replace(/[^a-zA-Z0-9]/g, '_');
        wrap.appendChild(textarea);
        textarea.value = fileData.content;

        fileData.editor = CodeMirror.fromTextArea(textarea, {
            mode: getMode(fileData.name),
            theme: 'dracula',
            lineNumbers: true,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: true
        });

        if (fileData.cursor) {
            fileData.editor.setCursor(fileData.cursor);
        }

        fileData.editor.on('change', () => {
            markFileModified(path);
            fileData.content = fileData.editor.getValue();
            fileContent = fileData.content;
        });

        editor = fileData.editor;

        // HTML 预览
        if (isHtml && currentView === 'preview') {
            const blob = new Blob([fileData.content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            wrap.innerHTML = `<iframe class="html-preview" src="${url}" style="border:none;width:100%;flex:1;background:#fff;"></iframe>`;
        }
    } else if (['image', 'audio', 'video', 'pdf', 'binary'].includes(fileData.fileType)) {
        // 媒体文件需要重新加载
        loadMediaContent(path, fileData);
    } else {
        // 文本文件
        initEditor(fileData.content || '', fileData.name, path);
    }

    updateFormatButton(fileData.fileType);
    showView('editorView');
}

async function loadMediaContent(path, fileData) {
    const wrap = document.getElementById('editorWrap');
    wrap.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await fetch('/api/file?path=' + encodeURIComponent(path));
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (data.type === 'image') {
            const imgSrc = `data:${data.mime};base64,${data.data}`;
            wrap.innerHTML = `<div class="media-view">
                <img src="${imgSrc}" alt="${fileData.name}" onclick="openImageViewer('${imgSrc}', '${fileData.name.replace(/'/g, "\\'")}')">
                <div class="media-info">
                    <div class="media-info-title">${fileData.name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">📷 ${data.mime.split('/')[1]?.toUpperCase() || '图片'}</span>
                    </div>
                    <div class="media-info-actions">
                        <button class="media-action-btn" onclick="openImageViewer('${imgSrc}', '${fileData.name.replace(/'/g, "\\'")}')">🔍 放大</button>
                        <button class="media-action-btn" onclick="downloadCurrentFile()">⬇ 下载</button>
                    </div>
                </div>
            </div>`;
        } else if (data.type === 'audio') {
            wrap.innerHTML = `<div class="media-view">
                <div style="font-size:64px;margin-bottom:16px;opacity:0.8">🎵</div>
                <audio controls src="data:${data.mime};base64,${data.data}" style="width:100%;max-width:400px"></audio>
                <div class="media-info">
                    <div class="media-info-title">${fileData.name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">🎵 ${data.mime.split('/')[1]?.toUpperCase() || '音频'}</span>
                    </div>
                </div>
            </div>`;
        } else if (data.type === 'video') {
            wrap.innerHTML = `<div class="media-view">
                <video controls src="data:${data.mime};base64,${data.data}" style="max-width:100%;max-height:60vh;border-radius:8px;background:#000"></video>
                <div class="media-info">
                    <div class="media-info-title">${fileData.name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">🎬 ${data.mime.split('/')[1]?.toUpperCase() || '视频'}</span>
                    </div>
                </div>
            </div>`;
        } else if (data.type === 'pdf') {
            wrap.innerHTML = `<div class="media-view" style="padding:0;flex-direction:column">
                <iframe class="html-preview" src="data:application/pdf;base64,${data.data}" style="flex:1;min-height:60vh"></iframe>
                <div class="media-info" style="margin:12px">
                    <div class="media-info-title">${fileData.name}</div>
                    <div class="media-info-meta">
                        <span class="media-info-item">📊 ${formatSize(data.size)}</span>
                        <span class="media-info-item">📄 PDF</span>
                    </div>
                </div>
            </div>`;
        } else if (data.isBinary) {
            const ext = fileData.name.split('.').pop().toLowerCase();
            const binaryIcons = {
                zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
                exe: '⚙️', msi: '⚙️', dmg: '⚙️', app: '⚙️',
                apk: '📱', ipa: '📱',
                ttf: '🔤', otf: '🔤', woff: '🔤', woff2: '🔤',
                default: '📦'
            };
            const icon = binaryIcons[ext] || binaryIcons.default;
            wrap.innerHTML = `<div class="binary-notice">
                <div class="icon">${icon}</div>
                <div style="font-size:16px;margin-top:8px">${fileData.name}</div>
                <div style="font-size:12px;color:var(--dim);margin-top:4px">${formatSize(data.size)} · ${ext.toUpperCase()} 文件</div>
                <div class="media-info-actions" style="margin-top:16px">
                    <button class="media-action-btn" onclick="downloadCurrentFile()">⬇ 下载</button>
                </div>
            </div>`;
        }
    } catch (e) {
        wrap.innerHTML = `<div class="binary-notice"><div class="icon" style="color:var(--danger)">⚠️</div><div>加载失败</div><div style="font-size:12px;color:var(--dim);margin-top:4px">${e.message}</div></div>`;
    }
}

function closeFileTab(path) {
    const fileData = openFiles[path];
    if (!fileData) return;

    // 检查是否有未保存的更改
    if (fileData.modified && !confirm(`${fileData.name} 有未保存的更改，确定关闭？`)) {
        return;
    }

    // 移除标签
    const tab = document.getElementById('editorTab_' + path.replace(/[^a-zA-Z0-9]/g, '_'));
    if (tab) tab.remove();

    // 清理编辑器
    if (fileData.editor) {
        fileData.editor.toTextArea();
    }

    delete openFiles[path];
    updateOpenFilesCount();

    // 如果关闭的是当前活动文件
    if (activeFilePath === path) {
        const remaining = Object.keys(openFiles);
        if (remaining.length > 0) {
            switchToFileTab(remaining[remaining.length - 1]);
        } else {
            // 没有打开的文件了，返回文件列表
            activeFilePath = null;
            currentFile = null;
            editor = null;
            goBack();
        }
    }
}

function markFileModified(path) {
    if (!openFiles[path]) return;
    if (!openFiles[path].modified) {
        openFiles[path].modified = true;
        modified = true;

        // 更新标签显示
        const tabId = 'editorTab_' + path.replace(/[^a-zA-Z0-9]/g, '_');
        const tab = document.getElementById(tabId);
        if (tab) {
            const dot = tab.querySelector('.editor-tab-modified');
            if (dot) dot.style.display = 'inline-block';
        }

        // 更新状态栏
        const st = document.getElementById('editorStatus');
        st.textContent = '已修改';
        st.className = 'editor-status modified';
    }
}

function initEditor(content, name, path) {
    const wrap = document.getElementById('editorWrap');
    wrap.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.id = 'code_' + (path ? path.replace(/[^a-zA-Z0-9]/g, '_') : 'current');
    wrap.appendChild(textarea);
    textarea.value = content;

    const cm = CodeMirror.fromTextArea(textarea, {
        mode: getMode(name),
        theme: 'dracula',
        lineNumbers: true,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: true
    });

    editor = cm;
    fileContent = content;

    // 保存到 openFiles
    if (path && openFiles[path]) {
        openFiles[path].editor = cm;
        openFiles[path].content = content;

        // 恢复光标位置
        if (openFiles[path].cursor) {
            cm.setCursor(openFiles[path].cursor);
        }
    }

    cm.on('change', () => {
        if (path) {
            markFileModified(path);
            openFiles[path].content = cm.getValue();
        }
        fileContent = cm.getValue();
    });

    // 保存光标位置
    cm.on('cursorActivity', () => {
        if (path && openFiles[path]) {
            openFiles[path].cursor = cm.getCursor();
        }
    });
}

// 更新格式化按钮
function updateFormatButton(fileType) {
    const btn = document.getElementById('formatBtn');
    if (!btn) return;

    const supportedTypes = ['javascript', 'typescript', 'html', 'css', 'json', 'markdown'];
    const isSupported = supportedTypes.some(t => fileType && fileType.includes(t));
    btn.style.display = isSupported ? 'block' : 'none';
}

// 代码格式化
function formatCode() {
    if (!editor || !activeFilePath) return;

    const fileData = openFiles[activeFilePath];
    if (!fileData) return;

    const content = editor.getValue();
    const ext = fileData.name.split('.').pop().toLowerCase();
    let formatted = content;

    try {
        if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(ext)) {
            formatted = beautifier.js(content, {
                indent_size: 2,
                indent_char: ' ',
                max_preserve_newlines: 2,
                preserve_newlines: true,
                keep_array_indentation: false,
                break_chained_methods: false,
                brace_style: 'collapse',
                space_before_conditional: true,
                unescape_strings: false,
                jslint_happy: false,
                end_with_newline: true,
                wrap_line_length: 0,
                e4x: false,
                comma_first: false,
                operator_position: 'before-newline'
            });
        } else if (['html', 'htm', 'vue', 'svelte'].includes(ext)) {
            formatted = beautifier.html(content, {
                indent_size: 2,
                indent_char: ' ',
                max_preserve_newlines: 2,
                preserve_newlines: true,
                indent_inner_html: true,
                wrap_line_length: 0,
                wrap_attributes: 'auto',
                wrap_attributes_indent_size: 2,
                end_with_newline: true
            });
        } else if (['css', 'scss', 'sass', 'less'].includes(ext)) {
            formatted = beautifier.css(content, {
                indent_size: 2,
                indent_char: ' ',
                max_preserve_newlines: 2,
                preserve_newlines: true,
                selector_separator_newline: true,
                end_with_newline: true
            });
        } else if (['json', 'jsonc'].includes(ext)) {
            // JSON 格式化
            try {
                const obj = JSON.parse(content);
                formatted = JSON.stringify(obj, null, 2);
            } catch (e) {
                showToast('JSON 解析错误: ' + e.message, 'error');
                return;
            }
        } else if (['md', 'markdown'].includes(ext)) {
            // Markdown 简单格式化
            formatted = content
                .replace(/\n{3,}/g, '\n\n')  // 最多两个空行
                .replace(/[ \t]+$/gm, '')    // 移除行尾空格
                .trim() + '\n';
        } else {
            showToast('不支持此文件类型的格式化', 'error');
            return;
        }

        if (formatted !== content) {
            editor.setValue(formatted);
            showToast('格式化完成', 'success');
        } else {
            showToast('代码已经格式化', 'success');
        }
    } catch (e) {
        showToast('格式化失败: ' + e.message, 'error');
    }
}

// 保存文件
async function saveFile() {
    if (!currentFile && !activeFilePath) return;
    const filePath = activeFilePath || currentFile;
    const fileData = openFiles[filePath];
    const content = editor ? editor.getValue() : (fileData ? fileData.content : fileContent);

    // 显示加载状态
    const saveBtns = document.querySelectorAll('#editorBar .btn-primary');
    saveBtns.forEach(btn => Button.setLoading(btn, true));

    try {
        const res = await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, content })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // 更新状态
        modified = false;
        if (fileData) {
            fileData.modified = false;
            // 更新标签显示
            const tabId = 'editorTab_' + filePath.replace(/[^a-zA-Z0-9]/g, '_');
            const tab = document.getElementById(tabId);
            if (tab) {
                const dot = tab.querySelector('.editor-tab-modified');
                if (dot) dot.style.display = 'none';
            }
        }

        const st = document.getElementById('editorStatus');
        st.textContent = '已保存';
        st.className = 'editor-status saved';
        showToast('保存成功', 'success');
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        // 移除加载状态
        const saveBtns = document.querySelectorAll('#editorBar .btn-primary');
        saveBtns.forEach(btn => Button.setLoading(btn, false));
    }
}

// 保存所有文件
async function saveAllFiles() {
    const paths = Object.keys(openFiles).filter(p => openFiles[p].modified);
    if (paths.length === 0) {
        showToast('没有需要保存的文件', 'success');
        return;
    }

    for (const path of paths) {
        const fileData = openFiles[path];
        try {
            const res = await fetch('/api/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content: fileData.content })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            fileData.modified = false;
            const tabId = 'editorTab_' + path.replace(/[^a-zA-Z0-9]/g, '_');
            const tab = document.getElementById(tabId);
            if (tab) {
                const dot = tab.querySelector('.editor-tab-modified');
                if (dot) dot.style.display = 'none';
            }
        } catch (e) {
            showToast(`保存 ${fileData.name} 失败: ${e.message}`, 'error');
        }
    }
    showToast('已保存所有文件', 'success');
}

// 多选模式
