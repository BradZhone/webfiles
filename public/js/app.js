// app.js - Initialization, keyboard shortcuts, drag-drop setup
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('modal').classList.contains('show')) confirmModal();
    if (e.key === 'Escape') {
        hideModal();
        hideActionMenu();
        hideMainMenu();
        hideUploadModal();
        hideShortcutConfig();
        hideBatchRenameModal();
        hideShareModal();
        hideDestModal();
        hideSettingsModal();
        hideTerminalPathModal();
        closeAllPanels();
    }

    // 文件列表视图快捷键
    const isListView = document.getElementById('listView').classList.contains('active');
    if (isListView && (e.ctrlKey || e.metaKey)) {
        // Ctrl+U 上传
        if (e.key === 'u') {
            e.preventDefault();
            showUploadModal();
        }
        // Ctrl+K 搜索
        if (e.key === 'k') {
            e.preventDefault();
            showSearchView();
        }
        // Ctrl+N 新建文件
        if (e.key === 'n') {
            e.preventDefault();
            showNewModal('file');
        }
        // Ctrl+Shift+N 新建文件夹
        if (e.key === 'N') {
            e.preventDefault();
            showNewModal('folder');
        }
    }

    // 多选模式快捷键
    if (isListView && selectMode && selectedFiles.size > 0) {
        // Delete 删除选中文件
        if (e.key === 'Delete') {
            e.preventDefault();
            batchDelete();
        }
        // Ctrl+A 全选
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            selectAll();
        }
    }

    // 全局快捷键（仅在编辑器视图有效）
    const isEditorView = document.getElementById('editorView').classList.contains('active');

    if (e.ctrlKey || e.metaKey) {
        // Ctrl+S 保存
        if (e.key === 's' && editor) {
            e.preventDefault();
            saveFile();
        }
        // Ctrl+Shift+S 保存所有
        if (e.key === 'S' && editor) {
            e.preventDefault();
            saveAllFiles();
        }
        // Ctrl+Shift+F 格式化
        if (e.key === 'F' && editor) {
            e.preventDefault();
            formatCode();
        }
        // Ctrl+W 关闭当前标签
        if (e.key === 'w' && isEditorView && activeFilePath) {
            e.preventDefault();
            closeFileTab(activeFilePath);
        }
        // Ctrl+Tab 切换到下一个标签
        if (e.key === 'Tab' && isEditorView) {
            e.preventDefault();
            const paths = Object.keys(openFiles);
            if (paths.length > 1) {
                const currentIndex = paths.indexOf(activeFilePath);
                const nextIndex = (currentIndex + 1) % paths.length;
                switchToFileTab(paths[nextIndex]);
            }
        }
    }
});

// 初始化
loadViewSettings();
applyViewSettings();
loadFiles(HOME);
loadFavorites();
startStatsMonitoring();

// ========== 拖拽上传功能 ==========
const dropZone = document.getElementById('dropZone');
const dropZonePath = document.getElementById('dropZonePath');
let dragCounter = 0;

// 阻止默认拖拽行为
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

// 拖拽进入
document.body.addEventListener('dragenter', (e) => {
    dragCounter++;
    if (e.dataTransfer.types.includes('Files')) {
        dropZone.classList.add('active');
        dropZonePath.textContent = currentPath;
    }
});

// 拖拽离开
document.body.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter === 0) {
        dropZone.classList.remove('active');
    }
});

// 拖拽悬停
document.body.addEventListener('dragover', (e) => {
    e.dataTransfer.dropEffect = 'copy';
});

// 拖拽释放
document.body.addEventListener('drop', async (e) => {
    dragCounter = 0;
    dropZone.classList.remove('active');

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    // 上传文件
    await uploadDroppedFiles(files);
});

// 上传拖拽的文件
async function uploadDroppedFiles(files) {
    const progress = document.getElementById('uploadProgress');
    const status = document.getElementById('uploadStatus');
    progress.classList.add('show');
    status.textContent = `正在上传 ${files.length} 个文件...`;

    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));

    try {
        const res = await fetch('/api/upload?dest=' + encodeURIComponent(currentPath), {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        status.textContent = `已上传 ${files.length} 个文件`;
        showToast(`成功上传 ${files.length} 个文件`, 'success');
        loadFiles(currentPath);
    } catch (e) {
        status.textContent = '上传失败';
        showToast('上传失败: ' + e.message, 'error');
    } finally {
        setTimeout(() => progress.classList.remove('show'), 1500);
    }
}

// Final initialization (after vault module)
initObsidianMarkdown();
