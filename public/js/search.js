// search.js - File search
function showSearchView() {
    hideMainMenu();
    showView('searchView');
    document.getElementById('headerTitle').textContent = '搜索';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInfo').textContent = '';
    document.getElementById('searchInput').focus();
}

function closeSearchView() {
    showView('listView');
    document.getElementById('headerTitle').textContent = currentPath.split('/').pop() || 'Home';
}

async function doSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    document.getElementById('searchResults').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const res = await fetch('/api/search?query=' + encodeURIComponent(query) + '&path=' + encodeURIComponent(currentPath));
        const data = await res.json();

        document.getElementById('searchInfo').textContent = `找到 ${data.total} 个结果`;

        if (data.results.length === 0) {
            document.getElementById('searchResults').innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div>未找到匹配的文件</div></div>';
            return;
        }

        document.getElementById('searchResults').innerHTML = '<div class="file-list">' + data.results.map(f => {
            const escapedPath = escapeJs(f.path);
            return `
            <div class="file-item" onclick="onSearchItemClick('${escapedPath}', ${f.isDirectory}, '${f.type || 'file'}')">
                <div class="file-icon">${getFileIcon(f.name, f.isDirectory, f.type)}</div>
                <div class="file-info">
                    <div class="file-name">${f.name}</div>
                    <div class="file-meta" style="word-break:break-all;font-size:11px;">${f.path}</div>
                </div>
            </div>`;
        }).join('') + '</div>';
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function onSearchItemClick(path, isDir, type) {
    if (isDir) {
        closeSearchView();
        loadFiles(path);
    } else {
        closeSearchView();
        openFile(path, type);
    }
}

// 收藏夹
