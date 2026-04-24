// actions.js - Action menu, file operations, share, compress, download
// 操作菜单
function showActionMenu(path, name, isDir, type) {
    actionTarget = { path, name, isDir, type };
    document.getElementById('actionMenu').classList.add('show');
}

function hideActionMenu() {
    document.getElementById('actionMenu').classList.remove('show');
}

function showMainMenu() {
    document.getElementById('mainMenu').classList.add('show');
}

function hideMainMenu() {
    document.getElementById('mainMenu').classList.remove('show');
}

// 已打开文件面板
function updateOpenFilesCount() {
    const count = Object.keys(openFiles).length;
    const countEl = document.getElementById('openFilesCount');
    if (countEl) countEl.textContent = count;
}

function showOpenFilesPanel() {
    hideMainMenu();
    renderOpenFilesList();
    document.getElementById('openFilesPanel').classList.add('show');
}

function hideOpenFilesPanel() {
    document.getElementById('openFilesPanel').classList.remove('show');
}

function renderOpenFilesList() {
    const listEl = document.getElementById('openFilesList');
    const files = Object.entries(openFiles);

    if (files.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: var(--dim); padding: 40px 20px;">暂无打开的文件<br><br>点击文件列表中的文件即可打开</div>';
        return;
    }

    listEl.innerHTML = files.map(([path, data]) => {
        const icon = getFileIcon(data.name, false, data.fileType);
        const modifiedMark = data.modified ? '<span style="color: var(--accent);"> ●</span>' : '';
        return `
            <div class="file-item" style="padding: 10px 12px;" onclick="switchToOpenFile('${escapeJs(path)}')">
                <div class="file-icon">${icon}</div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(data.name)}${modifiedMark}</div>
                    <div class="file-meta" style="font-size: 11px;">${escapeHtml(path)}</div>
                </div>
                <div class="file-arrow" onclick="event.stopPropagation(); closeOpenFile('${escapeJs(path)}')">×</div>
            </div>
        `;
    }).join('');
}

function switchToOpenFile(path) {
    hideOpenFilesPanel();
    switchToFileTab(path);
}

function closeOpenFile(path) {
    closeFileTab(path);
    renderOpenFilesList();
    updateOpenFilesCount();
}

function closeAllOpenFiles() {
    const paths = Object.keys(openFiles);
    for (const path of paths) {
        if (openFiles[path]?.modified) {
            if (!confirm(`${openFiles[path].name} 有未保存的更改，确定关闭？`)) {
                continue;
            }
        }
        closeFileTab(path);
    }
    renderOpenFilesList();
    updateOpenFilesCount();
}

async function doAction(action) {
    hideActionMenu();
    if (!actionTarget) return;

    if (action === 'open') {
        if (actionTarget.isDir) {
            loadFiles(actionTarget.path);
        } else {
            openFile(actionTarget.path, actionTarget.type);
        }
    } else if (action === 'download') {
        downloadFile(actionTarget.path);
    } else if (action === 'copyPath') {
        try {
            await navigator.clipboard.writeText(actionTarget.path);
            showToast('路径已复制到剪贴板', 'success');
        } catch (e) {
            // Fallback for older browsers
            const input = document.createElement('input');
            input.value = actionTarget.path;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            showToast('路径已复制', 'success');
        }
    } else if (action === 'share') {
        showShareModal(actionTarget.path, actionTarget.name);
    } else if (action === 'favorite') {
        await addFavorite(actionTarget.path, actionTarget.name);
    } else if (action === 'rename') {
        showModald('重命名', actionTarget.name, async (newName) => {
            try {
                const res = await fetch('/api/rename', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPath: actionTarget.path, newName })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                showToast('重命名成功', 'success');
                loadFiles(currentPath);
            } catch (e) {
                showToast(e.message, 'error');
            }
        });
    } else if (action === 'compress') {
        hideActionMenu();
        var compressName = prompt('压缩包名称:', actionTarget.name + '.zip');
        if (compressName) {
            try {
                showToast('正在压缩...', 'success');
                var format = compressName.endsWith('.tar.gz') ? 'tar.gz' : 'zip';
                var res = await fetch('/api/compress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: [actionTarget.path], dest: currentPath + '/' + compressName, format: format })
                });
                if (res.ok) { showToast('压缩完成', 'success'); loadFiles(currentPath); }
                else { var d = await res.json(); showToast('压缩失败: ' + (d.error || ''), 'error'); }
            } catch(e) { showToast('压缩失败: ' + e.message, 'error'); }
        }
    } else if (action === 'unzip') {
        await unzipFile(actionTarget.path);
    } else if (action === 'terminal') {
        const dirPath = actionTarget.isDir ? actionTarget.path : actionTarget.path.substring(0, actionTarget.path.lastIndexOf('/'));
        showTerminalView();
        createTerminal(dirPath);
    } else if (action === 'delete') {
        if (!confirm('确定删除 ' + actionTarget.name + '？')) return;
        try {
            const res = await fetch('/api/file', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: actionTarget.path })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            showToast('删除成功', 'success');
            loadFiles(currentPath);
        } catch (e) {
            showToast(e.message, 'error');
        }
    }
}

// 文件分享功能
let shareFilePath = null; // 保存待分享的文件路径

function showShareModal(path, name) {
    shareFilePath = path; // 保存路径到变量
    document.getElementById('shareFileName').textContent = name;
    document.getElementById('shareLinkContainer').style.display = 'none';
    document.getElementById('generateShareBtn').style.display = 'inline-block';
    document.getElementById('shareModal').classList.add('show');
}

function hideShareModal() {
    document.getElementById('shareModal').classList.remove('show');
    shareFilePath = null;
}

async function generateShareLink() {
    if (!shareFilePath) {
        showToast('文件路径丢失，请重试', 'error');
        return;
    }

    const expiry = document.getElementById('shareExpiry').value;

    try {
        const res = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: shareFilePath, expiry: parseInt(expiry) })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const shareUrl = window.location.origin + '/s/' + data.shareId;
        document.getElementById('shareLink').value = shareUrl;
        document.getElementById('shareLinkContainer').style.display = 'block';
        document.getElementById('generateShareBtn').style.display = 'none';
        showToast('分享链接已生成', 'success');
    } catch (e) {
        showToast('生成分享链接失败: ' + e.message, 'error');
    }
}

function copyShareLink() {
    const input = document.getElementById('shareLink');
    input.select();
    document.execCommand('copy');
    showToast('链接已复制', 'success');
}

// 压缩/解压功能
async function batchCompress() {
    if (selectedFiles.size === 0) {
        showToast('请选择文件', 'error');
        return;
    }

    const zipName = currentPath.split('/').pop() || 'archive';
    const defaultName = zipName + '.zip';

    const name = prompt('请输入压缩包名称:', defaultName);
    if (!name) return;

    let finalName = name.trim();
    if (!finalName.endsWith('.zip')) finalName += '.zip';
    const outputPath = currentPath + '/' + finalName;

    try {
        showToast('正在压缩...', 'success');
        const res = await fetch('/api/compress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paths: Array.from(selectedFiles),
                outputPath
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast(`已创建 ${finalName}`, 'success');
        cancelSelect();
        loadFiles(currentPath);
    } catch (e) {
        showToast('压缩失败: ' + e.message, 'error');
    }
}

async function unzipFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    if (!['zip', 'tar', 'gz', 'tgz', 'tar.gz'].includes(ext)) {
        showToast('不支持的压缩格式', 'error');
        return;
    }

    if (!confirm('确定解压 ' + filePath.split('/').pop() + '？')) return;

    try {
        const res = await fetch('/api/unzip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast('解压成功', 'success');
        loadFiles(currentPath);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// 下载文件
function downloadFile(filePath) {
    const link = document.createElement('a');
    link.href = '/api/download?path=' + encodeURIComponent(filePath);
    link.download = filePath.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('开始下载...', 'success');
}

function downloadCurrentFile() {
    if (currentFile) {
        downloadFile(currentFile);
    }
}
