// upload.js - Upload modal, file select, drag-drop
// 文件上传
function showUploadModal() {
    hideMainMenu();
    document.getElementById('uploadDest').textContent = currentPath;
    document.getElementById('uploadFileList').textContent = '';
    uploadFiles = [];
    document.getElementById('uploadModal').classList.add('show');
    document.getElementById('fileInput').value = '';
}

function hideUploadModal() {
    document.getElementById('uploadModal').classList.remove('show');
}

function handleFileSelect(event) {
    uploadFiles = Array.from(event.target.files);
    const list = document.getElementById('uploadFileList');
    if (uploadFiles.length > 0) {
        list.innerHTML = uploadFiles.map(f => `<div>📄 ${f.name} (${formatSize(f.size)})</div>`).join('');
    } else {
        list.innerHTML = '';
    }
}

async function uploadFilesNow() {
    if (uploadFiles.length === 0) {
        showToast('请选择文件', 'error');
        return;
    }

    hideUploadModal();
    const progress = document.getElementById('uploadProgress');
    const status = document.getElementById('uploadStatus');
    progress.classList.add('show');
    status.textContent = '上传中...';

    const formData = new FormData();
    uploadFiles.forEach(file => formData.append('files', file));

    try {
        const res = await fetch('/api/upload?dest=' + encodeURIComponent(currentPath), {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            status.textContent = '上传成功!';
            showToast(`已上传 ${data.files.length} 个文件`, 'success');
            loadFiles(currentPath);
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        status.textContent = '上传失败';
        showToast(e.message, 'error');
    }

    setTimeout(() => progress.classList.remove('show'), 2000);
}
