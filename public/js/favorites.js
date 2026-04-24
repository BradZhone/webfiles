// favorites.js - Favorites sidebar
async function loadFavorites() {
    try {
        const res = await fetch('/api/favorites');
        const data = await res.json();
        favorites = data.favorites || [];
        renderFavorites();
    } catch (e) {
        console.error('加载收藏夹失败', e);
    }
}

function renderFavorites() {
    const list = document.getElementById('favoritesList');

    if (favorites.length === 0) {
        list.innerHTML = '<div class="sidebar-empty">暂无收藏<br><br>点击文件菜单中的 "⭐ 收藏" 添加</div>';
        return;
    }

    list.innerHTML = favorites.map(f => `
        <div class="sidebar-item">
            <span onclick="goToFavorite('${f.path}')">📁 ${f.name}</span>
            <span class="remove" onclick="removeFavorite('${f.path}', event)">×</span>
        </div>
    `).join('');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('show', isOpen);

    if (isOpen) loadFavorites();
}

function goToFavorite(path) {
    toggleSidebar();
    loadFiles(path);
}

async function addFavorite(path, name) {
    try {
        const res = await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, name })
        });
        const data = await res.json();
        if (data.success) {
            showToast('已添加到收藏夹', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function removeFavorite(path, event) {
    event.stopPropagation();
    try {
        const res = await fetch('/api/favorites', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        const data = await res.json();
        if (data.success) {
            loadFavorites();
            showToast('已从收藏夹移除', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function closeAllPanels() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
}
