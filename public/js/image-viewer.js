// image-viewer.js - Image zoom/pan viewer
// ========== 图片放大查看器 ==========
let imageViewerZoom = 1;
let imageViewerPanX = 0;
let imageViewerPanY = 0;
let imageViewerIsDragging = false;
let imageViewerLastX = 0;
let imageViewerLastY = 0;
let imageViewerStartDist = 0;
let imageViewerStartZoom = 1;

function openImageViewer(src, name) {
    const viewer = document.getElementById('imageViewer');
    const img = document.getElementById('imageViewerImg');
    const title = document.getElementById('imageViewerTitle');

    title.textContent = name || '图片预览';
    img.src = src;
    viewer.classList.add('show');

    // 重置状态
    imageViewerZoom = 1;
    imageViewerPanX = 0;
    imageViewerPanY = 0;
    updateImageViewerTransform();
    document.body.style.overflow = 'hidden';
}

function closeImageViewer() {
    document.getElementById('imageViewer').classList.remove('show');
    document.body.style.overflow = '';
}

function updateImageViewerTransform() {
    const img = document.getElementById('imageViewerImg');
    img.style.transform = `translate(${imageViewerPanX}px, ${imageViewerPanY}px) scale(${imageViewerZoom})`;
    document.getElementById('imageViewerZoomLevel').textContent = Math.round(imageViewerZoom * 100) + '%';
}

function imageViewerZoomIn() {
    imageViewerZoom = Math.min(imageViewerZoom + 0.25, 10);
    updateImageViewerTransform();
}

function imageViewerZoomOut() {
    imageViewerZoom = Math.max(imageViewerZoom - 0.25, 0.1);
    updateImageViewerTransform();
}

function imageViewerReset() {
    imageViewerZoom = 1;
    imageViewerPanX = 0;
    imageViewerPanY = 0;
    updateImageViewerTransform();
}

// 图片查看器事件
const imageViewerContainer = document.getElementById('imageViewerContainer');

// 鼠标滚轮缩放
imageViewerContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    imageViewerZoom = Math.max(0.1, Math.min(10, imageViewerZoom + delta));
    updateImageViewerTransform();
});

// 鼠标拖拽
imageViewerContainer.addEventListener('mousedown', (e) => {
    imageViewerIsDragging = true;
    imageViewerLastX = e.clientX;
    imageViewerLastY = e.clientY;
    imageViewerContainer.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (!imageViewerIsDragging) return;
    const dx = e.clientX - imageViewerLastX;
    const dy = e.clientY - imageViewerLastY;
    imageViewerPanX += dx;
    imageViewerPanY += dy;
    imageViewerLastX = e.clientX;
    imageViewerLastY = e.clientY;
    updateImageViewerTransform();
});

document.addEventListener('mouseup', () => {
    imageViewerIsDragging = false;
    imageViewerContainer.style.cursor = 'grab';
});

// 触摸事件 - 双指缩放
imageViewerContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        imageViewerStartDist = Math.sqrt(dx * dx + dy * dy);
        imageViewerStartZoom = imageViewerZoom;
    } else if (e.touches.length === 1) {
        imageViewerIsDragging = true;
        imageViewerLastX = e.touches[0].clientX;
        imageViewerLastY = e.touches[0].clientY;
    }
});

imageViewerContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        imageViewerZoom = Math.max(0.1, Math.min(10, imageViewerStartZoom * (dist / imageViewerStartDist)));
        updateImageViewerTransform();
    } else if (e.touches.length === 1 && imageViewerIsDragging) {
        const dx = e.touches[0].clientX - imageViewerLastX;
        const dy = e.touches[0].clientY - imageViewerLastY;
        imageViewerPanX += dx;
        imageViewerPanY += dy;
        imageViewerLastX = e.touches[0].clientX;
        imageViewerLastY = e.touches[0].clientY;
        updateImageViewerTransform();
    }
}, { passive: false });

imageViewerContainer.addEventListener('touchend', () => {
    imageViewerIsDragging = false;
});

// 双击重置
imageViewerContainer.addEventListener('dblclick', () => {
    imageViewerReset();
});

// 点击查看器背景关闭 (不是图片)
document.getElementById('imageViewer').addEventListener('click', (e) => {
    if (e.target.id === 'imageViewerContainer' || e.target.id === 'imageViewer') {
        closeImageViewer();
    }
});

// ESC 关闭
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('imageViewer').classList.contains('show')) {
        closeImageViewer();
    }
});

