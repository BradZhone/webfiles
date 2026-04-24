// file-manager.js - File browsing, rendering, thumbnails
async function loadFiles(path) {
    currentPath = path;
    document.getElementById('headerTitle').textContent = path.split('/').pop() || 'Home';
    updateBreadcrumb(path);

    try {
        const res = await fetch('/api/files?path=' + encodeURIComponent(path));
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // 排序后渲染
        const sortedFiles = sortFiles(data.files);
        renderFiles(sortedFiles);
    } catch (e) {
        window.location.href = '/login';
    }
}

function updateBreadcrumb(path) {
    let displayPath = path;
    if (path.startsWith(HOME)) {
        displayPath = path.substring(HOME.length);
    }
    const parts = displayPath.split('/').filter(p => p);
    let html = '<span onclick="loadFiles(\'' + HOME + '\')">~</span>';
    let acc = HOME;
    parts.forEach((p, i) => {
        acc += '/' + p;
        html += ' / <span onclick="loadFiles(\'' + acc + '\')">' + p + '</span>';
    });
    document.getElementById('breadcrumb').innerHTML = html;
}

function escapeJs(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderFiles(files) {
    const list = document.getElementById('fileList');

    // 保存当前文件列表用于排序
    currentFiles = files;

    if (files.length === 0) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">📂</div><div>文件夹为空</div></div>';
        return;
    }

    // 构建文件元数据字符串
    function getFileMeta(f) {
        const parts = [];
        if (f.isDirectory) {
            parts.push('文件夹');
        } else {
            if (displayColumns.size) parts.push(formatSize(f.size));
            if (displayColumns.type) parts.push(f.type || '文件');
        }
        if (displayColumns.modified) parts.push(formatDate(f.modified));
        return parts.join(' · ');
    }

    list.innerHTML = files.map(f => {
        const escapedPath = escapeJs(f.path);
        const escapedName = escapeJs(f.name);
        const isImage = f.type === 'image';

        // 根据视图模式调整缩略图大小
        const thumbSize = viewMode === 'icon' ? 120 : (viewMode === 'grid' ? 80 : 64);

        // 图片文件使用缩略图容器
        const iconHtml = isImage
            ? `<div class="file-icon has-thumbnail" onclick="onItemClick('${escapedPath}', ${f.isDirectory}, '${f.type || 'file'}')" data-thumbnail-path="${escapedPath}" data-needs-thumbnail="true" data-thumb-size="${thumbSize}">
                 <div class="icon-placeholder">${getFileIcon(f.name, f.isDirectory, f.type)}</div>
               </div>`
            : `<div class="file-icon" onclick="onItemClick('${escapedPath}', ${f.isDirectory}, '${f.type || 'file'}')">${getFileIcon(f.name, f.isDirectory, f.type)}</div>`;

        return `
        <div class="file-item ${selectedFiles.has(f.path) ? 'selected' : ''}" data-path="${f.path}" data-isdir="${f.isDirectory}" data-type="${f.type || 'file'}">
            <div class="file-checkbox ${selectMode ? '' : 'hidden'} ${selectedFiles.has(f.path) ? 'checked' : ''}" onclick="toggleSelect('${escapedPath}', event)">${selectMode && selectedFiles.has(f.path) ? '✓' : ''}</div>
            ${iconHtml}
            <div class="file-info" onclick="onItemClick('${escapedPath}', ${f.isDirectory}, '${f.type || 'file'}')">
                <div class="file-name">${f.name}</div>
                <div class="file-meta">${getFileMeta(f)}</div>
            </div>
            <div class="file-arrow" onclick="event.stopPropagation(); showActionMenu('${escapedPath}', '${escapedName}', ${f.isDirectory}, '${f.type || 'file'}')">⋮</div>
        </div>`;
    }).join('');

    // 懒加载缩略图
    loadVisibleThumbnails();
}

// 缩略图缓存
const thumbnailCache = new Map();
const THUMBNAIL_SIZE = 64;

// 加载可见区域的缩略图
function loadVisibleThumbnails() {
    const items = document.querySelectorAll('[data-needs-thumbnail="true"]');
    if (items.length === 0) return;

    // 使用Intersection Observer实现懒加载
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const imgPath = el.dataset.thumbnailPath;
                if (imgPath) {
                    loadThumbnail(el, imgPath);
                }
                observer.unobserve(el);
            }
        });
    }, { rootMargin: '100px' });

    items.forEach(item => {
        observer.observe(item);
    });
}

// 加载单个缩略图
async function loadThumbnail(el, imgPath) {
    // 检查缓存
    if (thumbnailCache.has(imgPath)) {
        showThumbnail(el, thumbnailCache.get(imgPath));
        return;
    }

    try {
        const res = await fetch(`/api/thumbnail?path=${encodeURIComponent(imgPath)}&size=${THUMBNAIL_SIZE}`);
        if (!res.ok) throw new Error('加载失败');

        const data = await res.json();
        if (data.success && data.data) {
            const thumbSrc = `data:${data.mime};base64,${data.data}`;
            thumbnailCache.set(imgPath, thumbSrc);
            showThumbnail(el, thumbSrc);
        }
    } catch (e) {
        // 加载失败，保持默认图标
        el.dataset.needsThumbnail = 'error';
    }
}

// 显示缩略图
function showThumbnail(el, src) {
    const placeholder = el.querySelector('.icon-placeholder');
    if (placeholder) {
        placeholder.innerHTML = `<img src="${src}" class="file-thumbnail" onerror="this.parentElement.innerHTML='🖼️'">`;
    }
    el.classList.add('has-thumbnail');
    el.dataset.needsThumbnail = 'loaded';
}

// 清除缩略图缓存
function clearThumbnailCache() {
    thumbnailCache.clear();
}


// onItemClick - navigation handler
function onItemClick(path, isDir, type) {
    if (selectMode) {
        toggleSelect(path);
        return;
    }
    if (isDir) {
        loadFiles(path);
    } else {
        openFile(path, type);
    }
}

// 打开文件
