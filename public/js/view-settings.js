// view-settings.js - View mode, sort, display settings
// ========== 视图和排序功能 ==========
const VIEW_SETTINGS_KEY = 'webfiles_view_settings';

// 加载视图设置
function loadViewSettings() {
    try {
        const saved = localStorage.getItem(VIEW_SETTINGS_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            viewMode = settings.viewMode || 'list';
            sortBy = settings.sortBy || 'name';
            sortOrder = settings.sortOrder || 'asc';
            if (settings.displayColumns) {
                displayColumns = { ...displayColumns, ...settings.displayColumns };
            }
        }
    } catch (e) {
        console.error('加载视图设置失败:', e);
    }
}

// 保存视图设置
function saveViewSettings() {
    try {
        const settings = {
            viewMode,
            sortBy,
            sortOrder,
            displayColumns
        };
        localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('保存视图设置失败:', e);
    }
}

// 应用视图设置到 UI
function applyViewSettings() {
    // 应用视图模式
    setViewMode(viewMode, false);
    // 更新排序下拉菜单
    updateSortDropdownUI();
    // 更新显示设置弹窗 UI
    updateDisplaySettingsUI();
}

// 设置视图模式
function setViewMode(mode, save = true) {
    viewMode = mode;
    const list = document.getElementById('fileList');

    // 移除所有视图类
    list.classList.remove('icon-view', 'compact-view');

    // 添加对应的视图类
    if (mode === 'icon') {
        list.classList.add('icon-view');
    } else if (mode === 'compact') {
        list.classList.add('compact-view');
    }

    // 更新工具栏按钮状态
    document.getElementById('viewListBtn').classList.toggle('active', mode === 'list' || mode === 'compact');
    document.getElementById('viewIconBtn').classList.toggle('active', mode === 'icon');

    if (save) {
        saveViewSettings();
    }

    // 重新渲染文件列表
    if (currentFiles.length > 0) {
        renderFiles(currentFiles);
    }
}

// 切换排序下拉菜单
function toggleSortDropdown() {
    const dropdown = document.getElementById('sortDropdown');
    dropdown.classList.toggle('open');
}

// 设置排序方式
function setSort(field, order, save = true) {
    console.log('setSort called:', field, order);
    sortBy = field;
    sortOrder = order;

    updateSortDropdownUI();

    // 关闭下拉菜单
    document.getElementById('sortDropdown').classList.remove('open');

    if (save) {
        saveViewSettings();
    }

    // 重新排序并渲染
    console.log('currentFiles:', currentFiles ? currentFiles.length : 'null');
    sortAndRenderFiles();
}

// 更新排序下拉菜单 UI
function updateSortDropdownUI() {
    document.querySelectorAll('.sort-option').forEach(opt => {
        const optSort = opt.dataset.sort;
        const optOrder = opt.dataset.order;
        const isActive = optSort === sortBy && optOrder === sortOrder;
        opt.classList.toggle('active', isActive);
        opt.querySelector('.sort-option-check').style.display = isActive ? 'inline' : 'none';
    });
}

// 排序文件列表
function sortFiles(files) {
    return [...files].sort((a, b) => {
        // 文件夹始终在前面
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;

        let comparison = 0;
        switch (sortBy) {
            case 'name':
                comparison = a.name.localeCompare(b.name, 'zh-CN');
                break;
            case 'size':
                comparison = a.size - b.size;
                break;
            case 'modified':
                comparison = new Date(a.modified) - new Date(b.modified);
                break;
            default:
                comparison = a.name.localeCompare(b.name, 'zh-CN');
        }

        return sortOrder === 'asc' ? comparison : -comparison;
    });
}

// 排序并渲染文件
function sortAndRenderFiles() {
    if (currentFiles && currentFiles.length > 0) {
        const sorted = sortFiles(currentFiles);
        renderFiles(sorted);
    }
}

// 显示设置弹窗
function showDisplaySettings() {
    updateDisplaySettingsUI();
    document.getElementById('displaySettingsModal').classList.add('show');
}

// 隐藏显示设置弹窗
function hideDisplaySettingsModal() {
    document.getElementById('displaySettingsModal').classList.remove('show');
}

// 更新显示设置弹窗 UI
function updateDisplaySettingsUI() {
    // 显示列复选框
    document.getElementById('colSize').checked = displayColumns.size;
    document.getElementById('colModified').checked = displayColumns.modified;
    document.getElementById('colType').checked = displayColumns.type;
}

// 保存显示设置
function saveDisplaySettings() {
    displayColumns.size = document.getElementById('colSize').checked;
    displayColumns.modified = document.getElementById('colModified').checked;
    displayColumns.type = document.getElementById('colType').checked;
    saveViewSettings();

    // 重新渲染文件列表
    if (currentFiles.length > 0) {
        renderFiles(currentFiles);
    }
}

// 点击其他地方关闭排序下拉菜单
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('sortDropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

