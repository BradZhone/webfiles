// modals.js - Generic modals, navigation helpers
// 路径跳转
function showJumpModal() {
    showModald('📁 跳转到路径', currentPath, (newPath) => {
        const resolved = newPath.startsWith('/') ? newPath : currentPath + '/' + newPath;
        loadFiles(resolved);
    });
}

// 模态框
function showModald(title, defaultValue, callback) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalInput').value = defaultValue || '';
    document.getElementById('modal').classList.add('show');
    document.getElementById('modalInput').focus();
    modalCallback = callback;
}

function hideModal() {
    document.getElementById('modal').classList.remove('show');
    modalCallback = null;
}

function confirmModal() {
    const val = document.getElementById('modalInput').value.trim();
    if (val && modalCallback) modalCallback(val);
    hideModal();
}

function showNewModal(type) {
    showModald(type === 'file' ? '新建文件' : '新建文件夹', '', async (name) => {
        const newPath = currentPath + '/' + name;
        try {
            const res = await fetch('/api/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: newPath, type })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            showToast('创建成功', 'success');
            loadFiles(currentPath);
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

function refreshList() {
    hideMainMenu();
    loadFiles(currentPath);
}

