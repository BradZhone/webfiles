// batch-ops.js - Batch delete, move, copy, rename
function toggleSelectMode() {
    selectMode = !selectMode;
    selectedFiles.clear();

    document.getElementById('selectBtn').classList.toggle('active', selectMode);
    document.getElementById('toolbar').style.display = selectMode ? 'none' : 'flex';
    document.getElementById('batchToolbar').style.display = selectMode ? 'flex' : 'none';

    loadFiles(currentPath);
}

function toggleSelect(path, event) {
    if (event) event.stopPropagation();

    if (selectedFiles.has(path)) {
        selectedFiles.delete(path);
    } else {
        selectedFiles.add(path);
    }
    loadFiles(currentPath);
}

function selectAll() {
    document.querySelectorAll('.file-item').forEach(item => {
        selectedFiles.add(item.dataset.path);
    });
    loadFiles(currentPath);
}

function cancelSelect() {
    selectMode = false;
    selectedFiles.clear();
    document.getElementById('selectBtn').classList.remove('active');
    document.getElementById('toolbar').style.display = 'flex';
    document.getElementById('batchToolbar').style.display = 'none';
    loadFiles(currentPath);
}

async function batchDelete() {
    if (selectedFiles.size === 0) {
        showToast('请选择文件', 'error');
        return;
    }

    customConfirm(`确定删除选中的 ${selectedFiles.size} 个项目？`, async function() {
        try {
            const res = await fetch('/api/batch-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: Array.from(selectedFiles) })
            });
            const data = await res.json();

            const success = data.results.filter(r => r.success).length;
            showToast(`已删除 ${success} 个项目`, 'success');

            cancelSelect();
            loadFiles(currentPath);
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

// 批量操作相关
let batchActionType = '';
let batchDestPath = '';

function showBatchMoveModal() {
    if (selectedFiles.size === 0) {
        showToast('请选择文件', 'error');
        return;
    }
    batchActionType = 'move';
    showDestModal();
}

function showBatchCopyModal() {
    if (selectedFiles.size === 0) {
        showToast('请选择文件', 'error');
        return;
    }
    batchActionType = 'copy';
    showDestModal();
}

async function showDestModal() {
    document.getElementById('destModalTitle').textContent = batchActionType === 'move' ? '📁 移动到' : '📋 复制到';
    document.getElementById('destCount').textContent = selectedFiles.size;
    document.getElementById('destPath').value = currentPath;
    batchDestPath = currentPath;
    document.getElementById('destModal').classList.add('show');
    await loadDestDirs(currentPath);
}

function hideDestModal() {
    document.getElementById('destModal').classList.remove('show');
}

async function loadDestDirs(dirPath) {
    const list = document.getElementById('destDirList');
    list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await fetch('/api/files?path=' + encodeURIComponent(dirPath));
        const data = await res.json();

        const dirs = data.files.filter(f => f.isDirectory);

        if (dirs.length === 0) {
            list.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;">无子文件夹</div>';
            return;
        }

        list.innerHTML = dirs.map(d => `
            <div class="sidebar-item" onclick="selectDestDir('${escapeJs(d.path)}')">
                <span>📁 ${d.name}</span>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">加载失败</div>';
    }
}

function selectDestDir(path) {
    batchDestPath = path;
    document.getElementById('destPath').value = path;
    loadDestDirs(path);
}

async function confirmBatchAction() {
    const dest = document.getElementById('destPath').value.trim();
    if (!dest) {
        showToast('请输入目标路径', 'error');
        return;
    }

    try {
        const endpoint = batchActionType === 'move' ? '/api/batch-move' : '/api/batch-copy';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: Array.from(selectedFiles), dest })
        });
        const data = await res.json();

        const success = data.results.filter(r => r.success).length;
        const action = batchActionType === 'move' ? '移动' : '复制';
        showToast(`已${action} ${success} 个项目`, 'success');

        hideDestModal();
        cancelSelect();
        loadFiles(currentPath);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// 批量重命名功能
let renamePreviewData = [];
let renameFilesList = []; // 保存待重命名的文件列表

function showBatchRenameModal() {
    if (selectedFiles.size === 0) {
        showToast('请选择文件', 'error');
        return;
    }

    // 保存当前选中的文件列表
    renameFilesList = Array.from(selectedFiles);

    document.getElementById('renameCount').textContent = renameFilesList.length;

    // 重置所有输入
    document.getElementById('renameFind').value = '';
    document.getElementById('renameReplace').value = '';
    document.getElementById('renamePrefix').value = '';
    document.getElementById('renameSuffix').value = '';
    document.getElementById('renameRegex').value = '';
    document.getElementById('renameRegexReplace').value = '';

    // 重置复选框
    document.getElementById('renameReplaceEnabled').checked = false;
    document.getElementById('renamePrefixEnabled').checked = false;
    document.getElementById('renameRegexEnabled').checked = false;
    document.getElementById('renameCaseEnabled').checked = false;

    updateRenamePreview();
    document.getElementById('batchRenameModal').classList.add('show');
}

function hideBatchRenameModal() {
    document.getElementById('batchRenameModal').classList.remove('show');
}

function updateRenamePreview() {
    const files = renameFilesList;
    renamePreviewData = [];

    // 获取所有规则设置
    const replaceEnabled = document.getElementById('renameReplaceEnabled')?.checked || false;
    const prefixEnabled = document.getElementById('renamePrefixEnabled')?.checked || false;
    const regexEnabled = document.getElementById('renameRegexEnabled')?.checked || false;
    const caseEnabled = document.getElementById('renameCaseEnabled')?.checked || false;

    const find = document.getElementById('renameFind')?.value || '';
    const replace = document.getElementById('renameReplace')?.value || '';
    const prefix = document.getElementById('renamePrefix')?.value || '';
    const suffix = document.getElementById('renameSuffix')?.value || '';
    const regex = document.getElementById('renameRegex')?.value || '';
    const regexReplace = document.getElementById('renameRegexReplace')?.value || '';
    const caseMode = document.getElementById('renameCaseMode')?.value || 'lower';

    let hasError = false;
    let hasConflict = false;
    const newNames = new Set();
    let changedCount = 0;

    for (const filePath of files) {
        const oldName = filePath.split('/').pop();
        let newName = oldName;
        let nameWithoutExt = oldName;
        let ext = '';

        // 分离文件名和扩展名
        const dotIndex = oldName.lastIndexOf('.');
        if (dotIndex > 0) {
            nameWithoutExt = oldName.substring(0, dotIndex);
            ext = oldName.substring(dotIndex);
        }

        try {
            // 1. 查找替换
            if (replaceEnabled && find) {
                newName = newName.split(find).join(replace);
            }

            // 2. 前缀后缀
            if (prefixEnabled) {
                // 对文件名部分添加前缀后缀，保留扩展名
                if (dotIndex > 0) {
                    const newNamePart = prefix + newName.substring(0, newName.lastIndexOf('.')) + suffix;
                    newName = newNamePart + ext;
                } else {
                    newName = prefix + newName + suffix;
                }
            }

            // 3. 正则表达式
            if (regexEnabled && regex) {
                const re = new RegExp(regex, 'g');
                newName = newName.replace(re, regexReplace);
            }

            // 4. 大小写转换
            if (caseEnabled) {
                if (dotIndex > 0) {
                    const namePart = newName.substring(0, newName.lastIndexOf('.'));
                    ext = newName.substring(newName.lastIndexOf('.'));
                    switch (caseMode) {
                        case 'lower':
                            newName = namePart.toLowerCase() + ext;
                            break;
                        case 'upper':
                            newName = namePart.toUpperCase() + ext;
                            break;
                        case 'title':
                            newName = namePart.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()) + ext;
                            break;
                        case 'sentence':
                            newName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase() + ext;
                            break;
                    }
                } else {
                    switch (caseMode) {
                        case 'lower':
                            newName = newName.toLowerCase();
                            break;
                        case 'upper':
                            newName = newName.toUpperCase();
                            break;
                        case 'title':
                            newName = newName.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
                            break;
                        case 'sentence':
                            newName = newName.charAt(0).toUpperCase() + newName.slice(1).toLowerCase();
                            break;
                    }
                }
            }
        } catch (e) {
            hasError = true;
            newName = oldName + ' (错误)';
        }

        const changed = oldName !== newName;
        if (changed) changedCount++;

        // 检查冲突
        if (newNames.has(newName)) {
            hasConflict = true;
        }
        newNames.add(newName);

        renamePreviewData.push({
            path: filePath,
            oldName,
            newName,
            changed
        });
    }

    // 更新计数
    const countEl = document.getElementById('renamePreviewCount');
    if (countEl) countEl.textContent = changedCount;

    // 渲染预览
    const previewEl = document.getElementById('renamePreview');
    if (!previewEl) return;

    previewEl.innerHTML = renamePreviewData.map(item => {
        const color = item.changed ? 'var(--success)' : 'var(--dim)';
        const icon = item.changed ? '→' : '=';
        return `<div style="color:${color};padding:2px 0;">
            <span style="color:var(--text-secondary)">${escapeHtml(item.oldName)}</span>
            <span style="color:var(--dim)"> ${icon} </span>
            <span>${escapeHtml(item.newName)}</span>
        </div>`;
    }).join('');

    if (hasError) {
        previewEl.innerHTML += '<div style="color:var(--danger);margin-top:8px;">⚠️ 正则表达式错误</div>';
    }
    if (hasConflict) {
        previewEl.innerHTML += '<div style="color:var(--warning);margin-top:8px;">⚠️ 存在重名冲突</div>';
    }
}

async function confirmBatchRename() {
    const changedItems = renamePreviewData.filter(item => item.changed);
    if (changedItems.length === 0) {
        showToast('没有需要重命名的文件', 'error');
        return;
    }

    // 检查冲突
    const newNames = new Set();
    for (const item of changedItems) {
        if (newNames.has(item.newName)) {
            showToast('存在重名冲突，请修改后重试', 'error');
            return;
        }
        newNames.add(item.newName);
    }

    try {
        const res = await fetch('/api/batch-rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: changedItems.map(item => ({
                    oldPath: item.path,
                    newName: item.newName
                }))
            })
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        const success = data.results?.filter(r => r.success).length || 0;
        showToast(`已重命名 ${success} 个文件`, 'success');

        hideBatchRenameModal();
        cancelSelect();
        loadFiles(currentPath);
    } catch (e) {
        showToast('重命名失败: ' + e.message, 'error');
    }
}

// 搜索
