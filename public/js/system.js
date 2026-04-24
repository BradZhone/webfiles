// system.js - System stats monitoring, boost
// ========== 系统状态监控 ==========
async function loadSystemStats() {
    try {
        const res = await fetch('/api/system-stats');
        if (res.ok) {
            const data = await res.json();
            updateStatsDisplay(data);
        }
    } catch (e) {
        console.error('Failed to load system stats:', e);
    }
}

function updateStatsDisplay(data) {
    // CPU 使用率
    const cpuEl = document.getElementById('cpuUsage');
    cpuEl.textContent = data.cpu.usage + '%';
    cpuEl.className = 'stats-item-value ' + getUsageClass(data.cpu.usage);

    // 系统负载
    const loadEl = document.getElementById('loadAvg');
    const load1 = data.cpu.loadAvg[0].toFixed(2);
    loadEl.textContent = load1;
    loadEl.className = 'stats-item-value ' + getUsageClass((load1 / data.cpu.cores) * 100);

    // 内存使用
    const memEl = document.getElementById('memUsage');
    const memUsedGB = (data.memory.used / 1024 / 1024 / 1024).toFixed(1);
    const memTotalGB = (data.memory.total / 1024 / 1024 / 1024).toFixed(1);
    memEl.textContent = `${memUsedGB}/${memTotalGB}GB`;
    memEl.className = 'stats-item-value ' + getUsageClass(data.memory.usage);

    // 磁盘使用
    const diskEl = document.getElementById('diskUsage');
    if (data.disk.total > 0) {
        const diskUsedGB = (data.disk.used / 1024 / 1024 / 1024).toFixed(0);
        const diskTotalGB = (data.disk.total / 1024 / 1024 / 1024).toFixed(0);
        diskEl.textContent = `${diskUsedGB}/${diskTotalGB}GB`;
        diskEl.className = 'stats-item-value ' + getUsageClass(data.disk.usage);
    } else {
        diskEl.textContent = 'N/A';
    }

    // 网络速度
    const netEl = document.getElementById('netSpeed');
    const rxSpeed = formatSpeed(data.network.rxSpeed);
    const txSpeed = formatSpeed(data.network.txSpeed);
    netEl.textContent = `↓${rxSpeed} ↑${txSpeed}`;

    // 系统运行时间
    const uptimeEl = document.getElementById('uptime');
    uptimeEl.textContent = formatUptime(data.system.uptime);
}

function getUsageClass(usage) {
    if (usage < 50) return 'good';
    if (usage < 70) return '';
    if (usage < 90) return 'warning';
    return 'danger';
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function formatSpeed(bytesPerSec) {
    if (bytesPerSec === 0) return '0B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

function startStatsMonitoring() {
    loadSystemStats();
    statsIntervalId = setInterval(loadSystemStats, statsRefreshInterval * 1000);
}

// ========== 系统加速功能 ==========
const defaultBoostActions = ['memory', 'temp', 'packages', 'logs', 'thumbnails'];

function getBoostActions() {
    const saved = localStorage.getItem('boostActions');
    return saved ? JSON.parse(saved) : defaultBoostActions;
}

async function runSystemBoost() {
    const btn = document.getElementById('boostBtn');
    btn.classList.add('loading');

    try {
        const res = await fetch('/api/system-optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actions: getBoostActions() })
        });
        const data = await res.json();

        if (data.success) {
            showToast('🧹 系统清理已启动', 'success');
            // 延迟刷新系统状态
            setTimeout(loadSystemStats, 2000);
        } else {
            showToast('清理失败', 'error');
        }
    } catch (e) {
        showToast('清理失败: ' + e.message, 'error');
    } finally {
        setTimeout(() => btn.classList.remove('loading'), 1000);
    }
}

function updateBoostActions() {
    const checkboxes = document.querySelectorAll('.boost-action-checkbox');
    const actions = [];
    checkboxes.forEach(cb => {
        if (cb.checked) actions.push(cb.dataset.action);
    });
    localStorage.setItem('boostActions', JSON.stringify(actions));
}

function loadBoostActions() {
    const actions = getBoostActions();
    const checkboxes = document.querySelectorAll('.boost-action-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = actions.includes(cb.dataset.action);
    });
}

// 加载文件列表
