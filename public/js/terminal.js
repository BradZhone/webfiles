// terminal.js - Terminal management, WebSocket, tabs, mobile keyboard, shortcuts, quick commands
// ========== 终端功能 ==========
let terminalList = []; // 服务器上的终端列表

async function showTerminalView() {
    showView('terminalView');
    document.getElementById('headerTitle').textContent = '终端';
    document.getElementById('viewToggle').style.display = 'none';

    // 加载已存在的终端
    await loadExistingTerminals();

    // 如果没有终端，自动创建一个
    if (Object.keys(terminals).length === 0) {
        createTerminal();
    }
}

async function loadExistingTerminals() {
    try {
        const res = await fetch('/api/terminals');
        const data = await res.json();
        terminalList = data.terminals || [];

        // 为每个已存在的终端创建 UI 并连接 WebSocket
        for (const term of terminalList) {
            if (!terminals[term.id]) {
                await createTerminalUI(term.id, term.name, term.cwd, true);
            }
        }

        updateTerminalEmptyState();
    } catch (e) {
        console.error('加载终端列表失败', e);
    }
}

function updateTerminalEmptyState() {
    const emptyMsg = document.getElementById('terminalEmpty');
    if (emptyMsg) {
        emptyMsg.style.display = Object.keys(terminals).length === 0 ? 'block' : 'none';
    }
}

function closeTerminalView() {
    showView('listView');
    document.getElementById('headerTitle').textContent = currentPath.split('/').pop() || 'Home';
}

// 终端翻页行数设置
let scrollLines = parseInt(localStorage.getItem('scrollLines')) || 3;

// 系统监控刷新频率设置
let statsRefreshInterval = parseInt(localStorage.getItem('statsRefreshInterval')) || 5;
let statsIntervalId = null;

// 终端翻页
function scrollTerminalUp() {
    const termId = activeTerminalId;
    if (!termId || !terminals[termId]) return;
    const term = terminals[termId].term;
    const ws = terminals[termId].ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
        const x = Math.floor(term.cols / 2);
        const y = Math.floor(term.rows / 2);
        for (let i = 0; i < scrollLines; i++) {
            ws.send(JSON.stringify({ type: 'input', data: `\x1b[<64;${x};${y}M` }));
        }
    }
}

function scrollTerminalDown() {
    const termId = activeTerminalId;
    if (!termId || !terminals[termId]) return;
    const term = terminals[termId].term;
    const ws = terminals[termId].ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
        const x = Math.floor(term.cols / 2);
        const y = Math.floor(term.rows / 2);
        for (let i = 0; i < scrollLines; i++) {
            ws.send(JSON.stringify({ type: 'input', data: `\x1b[<65;${x};${y}M` }));
        }
    }
}

// 设置模态框
function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.classList.add('active');
    document.getElementById('scrollLinesSlider').value = scrollLines;
    document.getElementById('scrollLinesValue').textContent = scrollLines;
    document.getElementById('statsRefreshSlider').value = statsRefreshInterval;
    document.getElementById('statsRefreshValue').textContent = statsRefreshInterval + '秒';
    loadBoostActions();
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

function hideSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

function updateScrollLinesDisplay() {
    const value = document.getElementById('scrollLinesSlider').value;
    document.getElementById('scrollLinesValue').textContent = value;
    scrollLines = parseInt(value);
    localStorage.setItem('scrollLines', scrollLines);
}

function updateStatsRefreshDisplay() {
    const value = document.getElementById('statsRefreshSlider').value;
    document.getElementById('statsRefreshValue').textContent = value + '秒';
    statsRefreshInterval = parseInt(value);
    localStorage.setItem('statsRefreshInterval', statsRefreshInterval);

    // 重启监控以应用新的刷新频率
    if (statsIntervalId) {
        clearInterval(statsIntervalId);
    }
    loadSystemStats();
    statsIntervalId = setInterval(loadSystemStats, statsRefreshInterval * 1000);
}

async function changePassword() {
    const currentPwd = document.getElementById('currentPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;

    if (!currentPwd || !newPwd || !confirmPwd) {
        showToast('请填写所有密码字段', 'error');
        return;
    }

    if (newPwd !== confirmPwd) {
        showToast('新密码两次输入不一致', 'error');
        return;
    }

    if (newPwd.length < 4) {
        showToast('新密码至少4个字符', 'error');
        return;
    }

    try {
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
        });
        const data = await res.json();

        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast('密码修改成功', 'success');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        }
    } catch (e) {
        showToast('修改密码失败: ' + e.message, 'error');
    }
}

async function createTerminal(customPath, customName) {
    const workDir = customPath || currentPath;
    const terminalId = 'term_' + Date.now();
    const name = customName || workDir.split('/').pop() || 'Terminal';

    try {
        // 先在服务器创建终端
        const res = await fetch('/api/terminals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: terminalId, cwd: workDir, name })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        await createTerminalUI(terminalId, name, workDir, true);

    } catch (e) {
        showToast('创建终端失败: ' + e.message, 'error');
    }
}

async function createTerminalUI(terminalId, name, workDir, connect) {
    // 检查终端是否已存在
    if (terminals[terminalId]) {
        console.log('Terminal already exists:', terminalId);
        // 只重新连接 WebSocket
        if (connect !== false && !terminals[terminalId].ws) {
            connectTerminalWebSocket(terminalId, terminals[terminalId].term);
        }
        switchTerminal(terminalId);
        return;
    }

    // 创建终端标签
    const tabsContainer = document.getElementById('terminalTabs');
    const addBtn = tabsContainer.querySelector('.terminal-add-btn');
    const tab = document.createElement('div');
    tab.className = 'terminal-tab';
    tab.id = 'tab_' + terminalId;
    tab.innerHTML = `
        <span class="terminal-tab-name" ondblclick="renameTerminal('${terminalId}')">${name}</span>
        <span class="terminal-tab-close" onclick="event.stopPropagation(); closeTerminal('${terminalId}')">×</span>
    `;
    tab.onclick = () => switchTerminal(terminalId);
    tabsContainer.insertBefore(tab, addBtn);

    // 创建终端容器
    const container = document.getElementById('terminalContainer');
    const emptyMsg = document.getElementById('terminalEmpty');
    if (emptyMsg) emptyMsg.style.display = 'none';

    const termDiv = document.createElement('div');
    termDiv.className = 'terminal-instance';
    termDiv.id = 'instance_' + terminalId;
    container.appendChild(termDiv);

    // 初始化 xterm
    const term = new Terminal({
        theme: {
            background: '#0d1117',
            foreground: '#e6edf3',
            cursor: '#58a6ff',
            cursorAccent: '#0d1117',
            selectionBackground: 'rgba(88, 166, 255, 0.3)',
            black: '#484f58',
            red: '#f85149',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#58a6ff',
            magenta: '#a371f7',
            cyan: '#39c5cf',
            white: '#b1bac4',
            brightBlack: '#6e7681',
            brightRed: '#f85149',
            brightGreen: '#3fb950',
            brightYellow: '#d29922',
            brightBlue: '#58a6ff',
            brightMagenta: '#a371f7',
            brightCyan: '#39c5cf',
            brightWhite: '#e6edf3'
        },
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        fontSize: currentTermFontSize,
        lineHeight: 1.2,
        allowTransparency: true,
        scrollback: 10000,
        allowProposedApi: true
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(termDiv);

    // Load search addon
    if (typeof SearchAddon !== 'undefined') {
        const sAddon = new SearchAddon.SearchAddon();
        term.loadAddon(sAddon);
        searchAddons[terminalId] = sAddon;
    }

    // Ctrl+F search handler
    term.attachCustomKeyEventHandler(e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            toggleTerminalSearch();
            return false;
        }
        return true;
    });

    terminals[terminalId] = { term, fitAddon, ws: null, name, cwd: workDir };
    terminalFitAddons[terminalId] = fitAddon;

    // 设置选择功能（用于选择模式）
    setupTerminalSelection(terminalId, term);

    // Setup right-click context menu (desktop)
    setupTerminalContextMenu(terminalId, term);

    // 先自适应大小，再连接 WebSocket
    setTimeout(() => {
        fitAddon.fit();
        term.focus();

        // 连接 WebSocket（在 fit 之后）
        if (connect !== false) {
            connectTerminalWebSocket(terminalId, term);
        }
    }, 50);

    // 切换到新终端
    switchTerminal(terminalId);

    updateTerminalEmptyState();
}

function connectTerminalWebSocket(terminalId, term) {
    // 确保 terminals[terminalId] 存在
    if (!terminals[terminalId]) {
        console.error('Terminal not found:', terminalId);
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/terminal/${terminalId}`;

    // 先关闭现有连接
    if (terminals[terminalId].ws) {
        const oldWs = terminals[terminalId].ws;
        // 移除旧的 onData 监听器
        if (terminals[terminalId].dataDisposable) {
            terminals[terminalId].dataDisposable.dispose();
            terminals[terminalId].dataDisposable = null;
        }
        if (terminals[terminalId].resizeDisposable) {
            terminals[terminalId].resizeDisposable.dispose();
            terminals[terminalId].resizeDisposable = null;
        }
        // 设置标志防止重连
        oldWs._isReplaced = true;
        oldWs.close();
    }

    const ws = new WebSocket(wsUrl);
    let isWsOpen = false;

    ws.onopen = () => {
        if (ws._isReplaced) return;
        isWsOpen = true;
        if (terminals[terminalId]) {
            terminals[terminalId].ws = ws;
            terminals[terminalId]._reconnectAttempts = 0;
            term.clear();
            const fitAddon = terminals[terminalId].fitAddon;
            if (fitAddon) {
                setTimeout(() => {
                    if (terminals[terminalId] && terminals[terminalId].ws === ws) {
                        fitAddon.fit();
                        safeSend(ws, { type: 'resize', cols: term.cols, rows: term.rows });
                    }
                }, 100);
            }
        }
        updateTerminalStatus('connected');
    };

    // 写入队列和节流控制
    let writeQueue = [];
    let isWriting = false;
    let lastWriteTime = 0;
    const WRITE_THROTTLE_MS = 16; // ~60fps
    const MAX_QUEUE_SIZE = 1000;

    const processWriteQueue = () => {
        if (isWriting || writeQueue.length === 0) return;
        isWriting = true;
        
        const now = Date.now();
        const timeSinceLastWrite = now - lastWriteTime;
        
        if (timeSinceLastWrite < WRITE_THROTTLE_MS) {
            setTimeout(() => {
                isWriting = false;
                processWriteQueue();
            }, WRITE_THROTTLE_MS - timeSinceLastWrite);
            return;
        }

        // 批量处理队列中的数据
        const batchSize = Math.min(writeQueue.length, 50);
        let combinedData = '';
        for (let i = 0; i < batchSize; i++) {
            combinedData += writeQueue.shift();
        }
        
        try {
            term.write(combinedData);
            lastWriteTime = Date.now();
        } catch (e) {
            console.error('Terminal write error:', e);
        }
        
        isWriting = false;
        
        // 如果队列中还有数据，继续处理
        if (writeQueue.length > 0) {
            requestAnimationFrame(processWriteQueue);
        }
    };

    ws.onmessage = (event) => {
        if (ws._isReplaced) return;
        
        // 添加到写入队列
        writeQueue.push(event.data);
        
        // 防止队列过大
        if (writeQueue.length > MAX_QUEUE_SIZE) {
            writeQueue = writeQueue.slice(-MAX_QUEUE_SIZE / 2);
        }
        
        // 使用 requestAnimationFrame 进行节流
        requestAnimationFrame(processWriteQueue);
    };

    ws.onclose = () => {
        isWsOpen = false;
        if (terminals[terminalId] && terminals[terminalId].ws === ws) {
            terminals[terminalId].ws = null;
        }
        writeQueue = [];

        // Auto-reconnect
        if (ws._isReplaced || !terminals[terminalId]) return;
        updateTerminalStatus('disconnected');

        if (!terminals[terminalId]._reconnectAttempts) terminals[terminalId]._reconnectAttempts = 0;
        if (terminals[terminalId]._reconnectAttempts < 10) {
            terminals[terminalId]._reconnectAttempts++;
            updateTerminalStatus('reconnecting');
            const delay = Math.min(1000 * Math.pow(1.5, terminals[terminalId]._reconnectAttempts), 10000);
            setTimeout(() => {
                if (terminals[terminalId]) {
                    connectTerminalWebSocket(terminalId, terminals[terminalId].term);
                }
            }, delay);
        }
    };

    ws.onerror = (error) => {
        console.error('Terminal WebSocket error:', error);
    };

    // 安全发送函数，检查缓冲区
    const safeSend = (websocket, msg) => {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) return false;
        
        // 检查缓冲区大小，避免阻塞
        if (websocket.bufferedAmount > 1024 * 1024) { // 1MB
            console.warn('WebSocket buffer full, skipping send');
            return false;
        }
        
        try {
            websocket.send(JSON.stringify(msg));
            return true;
        } catch (e) {
            console.error('WebSocket send error:', e);
            return false;
        }
    };

    // 保存 disposable 以便后续清理
    // 重要：使用 terminals[terminalId].ws 而不是闭包中的 ws 变量
    terminals[terminalId].dataDisposable = term.onData((data) => {
        const currentWs = terminals[terminalId]?.ws;
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
            safeSend(currentWs, { type: 'input', data });
        }
    });

    terminals[terminalId].resizeDisposable = term.onResize(({ cols, rows }) => {
        const currentWs = terminals[terminalId]?.ws;
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
            safeSend(currentWs, { type: 'resize', cols, rows });
        }
    });
}

function switchTerminal(terminalId) {
    activeTerminalId = terminalId;

    // Update connection status indicator
    if (terminals[terminalId] && terminals[terminalId].ws && terminals[terminalId].ws.readyState === WebSocket.OPEN) {
        updateTerminalStatus('connected');
    } else {
        updateTerminalStatus('disconnected');
    }

    // 更新标签状态
    document.querySelectorAll('.terminal-tab').forEach(tab => {
        tab.classList.toggle('active', tab.id === 'tab_' + terminalId);
    });

    // 更新终端显示
    document.querySelectorAll('.terminal-instance').forEach(inst => {
        inst.classList.toggle('active', inst.id === 'instance_' + terminalId);
    });

    // 自适应大小并聚焦
    if (terminalFitAddons[terminalId]) {
        setTimeout(() => {
            terminalFitAddons[terminalId].fit();
            if (terminals[terminalId] && terminals[terminalId].term) {
                terminals[terminalId].term.focus();
            }
        }, 50);
    }
}

async function closeTerminal(terminalId) {
    customConfirm('确定关闭此终端？终端内容将被清除。', async function() {
        try {
            await fetch('/api/terminals/' + terminalId, { method: 'DELETE' });
        } catch (e) {}

        // 关闭 WebSocket
        if (terminals[terminalId] && terminals[terminalId].ws) {
            terminals[terminalId].ws.close();
        }

        // 移除标签
        const tab = document.getElementById('tab_' + terminalId);
        if (tab) tab.remove();

        // 移除终端容器
        const inst = document.getElementById('instance_' + terminalId);
        if (inst) inst.remove();

        // 清理
        delete terminals[terminalId];
        delete searchAddons[terminalId];
        delete terminalFitAddons[terminalId];

        updateTerminalEmptyState();

        if (activeTerminalId === terminalId) {
            activeTerminalId = null;
            // 切换到另一个终端
            const remainingIds = Object.keys(terminals);
            if (remainingIds.length > 0) {
                switchTerminal(remainingIds[0]);
            }
        }
    });
}

async function renameTerminal(terminalId) {
    const term = terminals[terminalId];
    if (!term) return;

    customPrompt('输入新名称:', term.name, async function(newName) {
        if (!newName || !newName.trim()) return;
        term.name = newName.trim();

        // 更新标签显示
        const tab = document.getElementById('tab_' + terminalId);
        if (tab) {
            const nameSpan = tab.querySelector('.terminal-tab-name');
            if (nameSpan) nameSpan.textContent = newName.trim();
        }

        // 保存到服务器
        try {
            await fetch('/api/terminals/' + terminalId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            });
        } catch (e) {}
    });
}

function duplicateTerminal() {
    if (!activeTerminalId || !terminals[activeTerminalId]) return;
    const term = terminals[activeTerminalId];
    createTerminal(term.cwd, term.name + ' (副本)');
}

function showTerminalPathModal() {
    document.getElementById('terminalPathInput').value = currentPath;
    document.getElementById('terminalPathModal').classList.add('show');
    document.getElementById('terminalPathInput').focus();
}

function hideTerminalPathModal() {
    document.getElementById('terminalPathModal').classList.remove('show');
}

function confirmTerminalPath() {
    const path = document.getElementById('terminalPathInput').value.trim();
    hideTerminalPathModal();
    if (path) {
        createTerminal(path);
    }
}

// 终端路径模态框事件
document.getElementById('terminalPathModal').onclick = (e) => {
    if (e.target.id === 'terminalPathModal') hideTerminalPathModal();
};
document.getElementById('terminalPathInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmTerminalPath();
    if (e.key === 'Escape') hideTerminalPathModal();
});

// === Terminal Connection Status ===
function updateTerminalStatus(state) {
    const el = document.getElementById('terminalStatus');
    if (!el) return;
    const dot = el.querySelector('.status-dot');
    const text = el.querySelector('.status-text');
    if (state === 'connected') {
        dot.className = 'status-dot connected';
        if (text) text.textContent = '已连接';
    } else if (state === 'disconnected') {
        dot.className = 'status-dot disconnected';
        if (text) text.textContent = '已断开';
    } else if (state === 'reconnecting') {
        dot.className = 'status-dot reconnecting';
        if (text) text.textContent = '重连中...';
    }
}

// === Terminal Font Size ===
function terminalFontSize(delta) {
    currentTermFontSize = Math.max(8, Math.min(24, currentTermFontSize + delta));
    localStorage.setItem('termFontSize', currentTermFontSize);
    Object.values(terminals).forEach(t => {
        if (t.term) {
            t.term.options.fontSize = currentTermFontSize;
            if (t.fitAddon) t.fitAddon.fit();
        }
    });
}

// === Terminal Search ===
function toggleTerminalSearch() {
    const bar = document.getElementById('terminalSearchBar');
    if (!bar) return;
    if (bar.style.display === 'none') {
        bar.style.display = 'flex';
        document.getElementById('terminalSearchInput').focus();
    } else {
        bar.style.display = 'none';
        const addon = searchAddons[activeTerminalId];
        if (addon && addon.clearDecorations) addon.clearDecorations();
    }
}

function terminalSearchNext() {
    const query = document.getElementById('terminalSearchInput').value;
    const addon = searchAddons[activeTerminalId];
    if (addon && query) addon.findNext(query);
}

function terminalSearchPrev() {
    const query = document.getElementById('terminalSearchInput').value;
    const addon = searchAddons[activeTerminalId];
    if (addon && query) addon.findPrevious(query);
}

// 窗口大小变化时重新适应终端
window.addEventListener('resize', () => {
    Object.keys(terminalFitAddons).forEach(id => {
        if (terminalFitAddons[id]) {
            terminalFitAddons[id].fit();
        }
    });
});

// Mobile keyboard helper functions
let customShortcuts = [];

// Load custom shortcuts from localStorage
function loadCustomShortcuts() {
    try {
        const saved = localStorage.getItem('terminalCustomShortcuts');
        if (saved) {
            customShortcuts = JSON.parse(saved);
        }
    } catch (e) {
        customShortcuts = [];
    }
    renderCustomShortcuts();
}

// Save custom shortcuts to localStorage
function saveCustomShortcuts() {
    localStorage.setItem('terminalCustomShortcuts', JSON.stringify(customShortcuts));
}

// Render custom shortcuts buttons
function renderCustomShortcuts() {
    const container = document.getElementById('customShortcuts');
    const row = document.getElementById('customShortcutsRow');
    if (!container) return;

    if (customShortcuts.length === 0) {
        container.innerHTML = '';
        if (row) row.style.display = 'none';
        return;
    }

    container.innerHTML = customShortcuts.map((s, i) =>
        `<button class="terminal-keyboard-btn" onclick="executeCustomShortcut(${i})">${s.name}</button>`
    ).join('');
    if (row) row.style.display = 'flex';
}

// Execute custom shortcut sequence
async function executeCustomShortcut(index) {
    const shortcut = customShortcuts[index];
    if (!shortcut || !activeTerminalId || !terminals[activeTerminalId]) return;

    const ws = terminals[activeTerminalId].ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const keys = shortcut.sequence.split(',').map(k => k.trim());
    for (let i = 0; i < keys.length; i++) {
        const data = getKeyCode(keys[i]);
        ws.send(JSON.stringify({ type: 'input', data }));
        if (shortcut.delay > 0 && i < keys.length - 1) {
            await new Promise(r => setTimeout(r, shortcut.delay));
        }
    }
}

// Get terminal escape code for a key
function getKeyCode(keyName) {
    const keyMap = {
        // Special keys
        'Tab': '\t',
        'Shift+Tab': '\x1b[Z',
        'BackTab': '\x1b[Z',  // Alias for Shift+Tab
        'Escape': '\x1b',
        'Enter': '\r',
        'Space': ' ',
        'Backspace': '\x7f',
        'Delete': '\x1b[3~',
        'Insert': '\x1b[2~',
        'Home': '\x1b[H',
        'End': '\x1b[F',

        // Arrow keys
        'ArrowUp': '\x1b[A',
        'ArrowDown': '\x1b[B',
        'ArrowRight': '\x1b[C',
        'ArrowLeft': '\x1b[D',

        // Shift + Arrow keys (for selection)
        'Shift+ArrowUp': '\x1b[1;2A',
        'Shift+ArrowDown': '\x1b[1;2B',
        'Shift+ArrowRight': '\x1b[1;2C',
        'Shift+ArrowLeft': '\x1b[1;2D',

        // Ctrl + Arrow keys (word navigation)
        'Ctrl+ArrowUp': '\x1b[1;5A',
        'Ctrl+ArrowDown': '\x1b[1;5B',
        'Ctrl+ArrowRight': '\x1b[1;5C',
        'Ctrl+ArrowLeft': '\x1b[1;5D',

        // Function keys
        'F1': '\x1bOP',
        'F2': '\x1bOQ',
        'F3': '\x1bOR',
        'F4': '\x1bOS',
        'F5': '\x1b[15~',
        'F6': '\x1b[17~',
        'F7': '\x1b[18~',
        'F8': '\x1b[19~',
        'F9': '\x1b[20~',
        'F10': '\x1b[21~',
        'F11': '\x1b[23~',
        'F12': '\x1b[24~',

        // Ctrl combinations
        'Ctrl+A': '\x01', 'Ctrl+B': '\x02', 'Ctrl+C': '\x03', 'Ctrl+D': '\x04',
        'Ctrl+E': '\x05', 'Ctrl+F': '\x06', 'Ctrl+G': '\x07', 'Ctrl+H': '\x08',
        'Ctrl+I': '\x09', 'Ctrl+J': '\x0a', 'Ctrl+K': '\x0b', 'Ctrl+L': '\x0c',
        'Ctrl+M': '\x0d', 'Ctrl+N': '\x0e', 'Ctrl+O': '\x0f', 'Ctrl+P': '\x10',
        'Ctrl+Q': '\x11', 'Ctrl+R': '\x12', 'Ctrl+S': '\x13', 'Ctrl+T': '\x14',
        'Ctrl+U': '\x15', 'Ctrl+V': '\x16', 'Ctrl+W': '\x17', 'Ctrl+X': '\x18',
        'Ctrl+Y': '\x19', 'Ctrl+Z': '\x1a',

        // Alt combinations (ESC + key)
        'Alt+A': '\x1ba', 'Alt+B': '\x1bb', 'Alt+C': '\x1bc', 'Alt+D': '\x1bd',
        'Alt+F': '\x1bf', 'Alt+N': '\x1bn', 'Alt+P': '\x1bp', 'Alt+Q': '\x1bq',
        'Alt+R': '\x1br', 'Alt+S': '\x1bs', 'Alt+T': '\x1bt', 'Alt+U': '\x1bu',
        'Alt+W': '\x1bw', 'Alt+Y': '\x1by', 'Alt+.': '\x1b.',

        // Alternative naming
        'Control+A': '\x01', 'Control+B': '\x02', 'Control+C': '\x03', 'Control+D': '\x04',
        'Control+E': '\x05', 'Control+F': '\x06', 'Control+G': '\x07', 'Control+H': '\x08',
        'Control+I': '\x09', 'Control+J': '\x0a', 'Control+K': '\x0b', 'Control+L': '\x0c',
        'Control+M': '\x0d', 'Control+N': '\x0e', 'Control+O': '\x0f', 'Control+P': '\x10',
        'Control+Q': '\x11', 'Control+R': '\x12', 'Control+S': '\x13', 'Control+T': '\x14',
        'Control+U': '\x15', 'Control+V': '\x16', 'Control+W': '\x17', 'Control+X': '\x18',
        'Control+Y': '\x19', 'Control+Z': '\x1a',

        // ctrl+a = ctrl+A (lowercase aliases)
        'ctrl+a': '\x01', 'ctrl+b': '\x02', 'ctrl+c': '\x03', 'ctrl+d': '\x04',
        'ctrl+e': '\x05', 'ctrl+f': '\x06', 'ctrl+g': '\x07', 'ctrl+h': '\x08',
        'ctrl+i': '\x09', 'ctrl+j': '\x0a', 'ctrl+k': '\x0b', 'ctrl+l': '\x0c',
        'ctrl+m': '\x0d', 'ctrl+n': '\x0e', 'ctrl+o': '\x0f', 'ctrl+p': '\x10',
        'ctrl+q': '\x11', 'ctrl+r': '\x12', 'ctrl+s': '\x13', 'ctrl+t': '\x14',
        'ctrl+u': '\x15', 'ctrl+v': '\x16', 'ctrl+w': '\x17', 'ctrl+x': '\x18',
        'ctrl+y': '\x19', 'ctrl+z': '\x1a',
    };

    // Check if it's a single character
    if (keyName.length === 1) {
        return keyName;
    }

    return keyMap[keyName] || keyName;
}

function showMobileKeyboard() {
    const helper = document.getElementById('mobileKeyboardHelper');
    helper.classList.add('active');
    loadCustomShortcuts();
    renderQuickCommands();
    document.getElementById('mobileTerminalInput').focus();
}

function hideMobileKeyboard() {
    const helper = document.getElementById('mobileKeyboardHelper');
    helper.classList.remove('active');
    document.getElementById('mobileTerminalInput').value = '';
}

// ========== 终端选择模式 ==========
let isInSelectMode = false;

function toggleTerminalSelectMode() {
    if (isInSelectMode) {
        exitSelectMode();
    } else {
        enterSelectMode();
    }
}

function enterSelectMode() {
    if (!activeTerminalId || !terminals[activeTerminalId]) {
        alert('请先选择一个终端');
        return;
    }

    isInSelectMode = true;
    const btn = document.getElementById('selectModeBtn');
    btn.classList.add('active');
    btn.textContent = '📎 退出';

    const term = terminals[activeTerminalId].term;

    // 手机端：显示选择覆盖层
    if (window.innerWidth < 768 || 'ontouchstart' in window) {
        const overlay = document.getElementById('terminalSelectOverlay');
        const textarea = document.getElementById('terminalSelectTextarea');

        // 获取终端当前内容
        const buffer = term.buffer.active;
        let content = '';
        for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i);
            if (line) {
                content += line.translateToString(true) + '\n';
            }
        }

        textarea.value = content.trim();
        overlay.classList.add('active');

        // 聚焦到 textarea 以便选择
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(0, 0);
            textarea.scrollTop = textarea.scrollHeight;
        }, 100);
    } else {
        // 电脑端：禁用 tmux 鼠标模式，启用原生选择
        const termInstance = document.getElementById('instance_' + activeTerminalId);
        if (termInstance) {
            termInstance.classList.add('select-mode');
        }

        // 发送按键禁用 tmux 鼠标
        const ws = terminals[activeTerminalId].ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
            // 先按住 Shift 才能选择，所以我们只是提示用户
        }

        // 启用 xterm 的选择功能
        term.options.selectOnMouseUp = true;

        // 提示用户
        showToast('选择模式：按住 Shift 并拖动鼠标选择文本，松开后自动复制');
    }
}

function exitSelectMode() {
    isInSelectMode = false;
    const btn = document.getElementById('selectModeBtn');
    btn.classList.remove('active');
    btn.textContent = '📎 选择';

    // 隐藏手机端选择覆盖层
    const overlay = document.getElementById('terminalSelectOverlay');
    overlay.classList.remove('active');

    // 电脑端：恢复终端实例
    if (activeTerminalId && terminals[activeTerminalId]) {
        const termInstance = document.getElementById('instance_' + activeTerminalId);
        if (termInstance) {
            termInstance.classList.remove('select-mode');
        }
    }
}

function copySelectedText() {
    const textarea = document.getElementById('terminalSelectTextarea');
    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);

    if (selectedText) {
        navigator.clipboard.writeText(selectedText).then(() => {
            showToast('已复制 ' + selectedText.length + ' 个字符');
            exitSelectMode();
        }).catch(err => {
            // 降级方案：使用 execCommand
            textarea.select();
            document.execCommand('copy');
            showToast('已复制 ' + selectedText.length + ' ' + '个字符');
            exitSelectMode();
        });
    } else {
        showToast('请先选择要复制的文本');
    }
}

// 电脑端：监听终端选择事件，自动复制
function setupTerminalSelection(terminalId, term) {
    term.onSelectionChange(() => {
        if (!isInSelectMode) return;

        const selection = term.getSelection();
        if (selection && selection.length > 0) {
            navigator.clipboard.writeText(selection).then(() => {
                showToast('已复制 ' + selection.length + ' 个字符');
            }).catch(() => {
                // 降级方案
                const textArea = document.createElement('textarea');
                textArea.value = selection;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('已复制 ' + selection.length + ' 个字符');
            });
        }
    });
}

// ========== Terminal Context Menu (Desktop) ==========
function showTerminalContextMenu(x, y, hasSelection, term) {
    let menu = document.getElementById('termContextMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'termContextMenu';
        menu.className = 'term-context-menu';
        document.body.appendChild(menu);
    }
    menu.innerHTML = '';

    if (hasSelection) {
        const copyItem = document.createElement('div');
        copyItem.className = 'term-context-menu-item';
        copyItem.innerHTML = '📋 复制';
        copyItem.onclick = () => {
            const text = term.getSelection();
            navigator.clipboard.writeText(text).then(() => showToast('已复制', 'success'));
            hideTerminalContextMenu();
        };
        menu.appendChild(copyItem);

        const sep = document.createElement('div');
        sep.className = 'term-context-menu-separator';
        menu.appendChild(sep);
    }

    const pasteItem = document.createElement('div');
    pasteItem.className = 'term-context-menu-item';
    pasteItem.innerHTML = '📥 粘贴';
    pasteItem.onclick = () => {
        navigator.clipboard.readText().then(text => {
            const ws = terminals[activeTerminalId]?.ws;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data: text }));
            }
        }).catch(() => showToast('无法读取剪贴板', 'error'));
        hideTerminalContextMenu();
    };
    menu.appendChild(pasteItem);

    const sep2 = document.createElement('div');
    sep2.className = 'term-context-menu-separator';
    menu.appendChild(sep2);

    const clearItem = document.createElement('div');
    clearItem.className = 'term-context-menu-item';
    clearItem.innerHTML = '🗑️ 清屏';
    clearItem.onclick = () => {
        const ws = terminals[activeTerminalId]?.ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data: 'clear\n' }));
        }
        hideTerminalContextMenu();
    };
    menu.appendChild(clearItem);

    // Position menu within viewport
    const menuWidth = 160;
    const menuHeight = hasSelection ? 140 : 100;
    const posX = Math.min(x, window.innerWidth - menuWidth - 8);
    const posY = Math.min(y, window.innerHeight - menuHeight - 8);
    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';
    menu.classList.add('show');

    // Auto-close on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                hideTerminalContextMenu();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 50);
}

function hideTerminalContextMenu() {
    const menu = document.getElementById('termContextMenu');
    if (menu) menu.classList.remove('show');
}

function setupTerminalContextMenu(terminalId, term) {
    const termDiv = document.getElementById('instance_' + terminalId);
    if (!termDiv) return;
    termDiv.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        const hasSelection = term.hasSelection();
        showTerminalContextMenu(e.clientX, e.clientY, hasSelection, term);
    });
}

function sendMobileInput() {
    const input = document.getElementById('mobileTerminalInput');
    const text = input.value;
    if (!text || !activeTerminalId || !terminals[activeTerminalId]) return;

    const term = terminals[activeTerminalId];
    const ws = term.ws;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: text + '\r' }));
    }

    input.value = '';
    input.focus();
}

// ========== Mobile Paste ==========
async function mobilePaste() {
    try {
        const text = await navigator.clipboard.readText();
        const ws = terminals[activeTerminalId]?.ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data: text }));
        }
    } catch(e) {
        showToast('无法读取剪贴板', 'error');
    }
}

// Sticky modifier key state
let activeModifier = null; // null, 'Shift', or 'Ctrl'

function toggleModifier(mod) {
    const btn = document.getElementById('sticky' + mod);
    if (activeModifier === mod) {
        // Deactivate if already active
        activeModifier = null;
        btn.classList.remove('active');
    } else {
        // Deactivate previous modifier first
        if (activeModifier) {
            document.getElementById('sticky' + activeModifier).classList.remove('active');
        }
        // Activate new modifier
        activeModifier = mod;
        btn.classList.add('active');
    }
}

function clearActiveModifier() {
    if (activeModifier) {
        document.getElementById('sticky' + activeModifier).classList.remove('active');
        activeModifier = null;
    }
}

function sendMobileKey(key) {
    if (!activeTerminalId || !terminals[activeTerminalId]) return;

    const term = terminals[activeTerminalId];
    const ws = term.ws;

    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Handle sticky modifier combinations
    let finalKey = key;
    if (activeModifier && key !== 'Shift' && key !== 'Ctrl' && key !== 'Alt') {
        // Combine modifier with key
        if (activeModifier === 'Shift') {
            // Shift + key: mostly for uppercase letters
            if (key.length === 1 && /[a-z]/.test(key)) {
                finalKey = key.toUpperCase();
            } else if (key === 'Tab') {
                finalKey = 'Shift+Tab';
            } else if (key.startsWith('Arrow')) {
                // Shift + Arrow for selection in some apps
                finalKey = 'Shift+' + key;
            }
        } else if (activeModifier === 'Ctrl') {
            // Ctrl + key
            if (key.length === 1) {
                finalKey = 'Ctrl+' + key.toUpperCase();
            } else if (key === 'ArrowUp' || key === 'ArrowDown') {
                finalKey = 'Ctrl+' + key;
            }
        } else if (activeModifier === 'Alt') {
            // Alt + key
            if (key.length === 1) {
                finalKey = 'Alt+' + key.toUpperCase();
            }
        }
        // Clear modifier after use
        clearActiveModifier();
    }

    const data = getKeyCode(finalKey);
    ws.send(JSON.stringify({ type: 'input', data }));
}

// Shortcut configuration modal
function showShortcutConfig() {
    loadCustomShortcuts();
    renderSavedShortcutsList();
    document.getElementById('shortcutConfigModal').classList.add('show');
}

function hideShortcutConfig() {
    document.getElementById('shortcutConfigModal').classList.remove('show');
}

function renderSavedShortcutsList() {
    const container = document.getElementById('savedShortcutsList');
    if (!container) return;

    if (customShortcuts.length === 0) {
        container.innerHTML = '<div style="color: var(--dim); font-size: 12px; text-align: center; padding: 20px;">暂无自定义快捷键</div>';
        return;
    }

    container.innerHTML = customShortcuts.map((s, i) => `
        <div class="shortcut-config-item">
            <span class="shortcut-config-name">${s.name}</span>
            <span style="color: var(--dim); font-size: 11px; font-family: monospace;">${s.sequence}</span>
            <span class="shortcut-config-delete" onclick="deleteCustomShortcut(${i})">✕</span>
        </div>
    `).join('');
}

function addCustomShortcut() {
    const nameInput = document.getElementById('newShortcutName');
    const seqInput = document.getElementById('newShortcutSequence');
    const delaySelect = document.getElementById('newShortcutDelay');

    const name = nameInput.value.trim();
    const sequence = seqInput.value.trim();
    const delay = parseInt(delaySelect.value) || 0;

    if (!name || !sequence) {
        showToast('请填写名称和按键序列', 'error');
        return;
    }

    customShortcuts.push({ name, sequence, delay });
    saveCustomShortcuts();
    renderSavedShortcutsList();
    renderCustomShortcuts();

    nameInput.value = '';
    seqInput.value = '';
    showToast('快捷键已添加', 'success');
}

function deleteCustomShortcut(index) {
    customShortcuts.splice(index, 1);
    saveCustomShortcuts();
    renderSavedShortcutsList();
    renderCustomShortcuts();
}

function resetShortcuts() {
    customConfirm('确定要重置所有自定义快捷键吗？', function() {
        customShortcuts = [];
        saveCustomShortcuts();
        renderSavedShortcutsList();
        renderCustomShortcuts();
        showToast('已重置', 'success');
    });
}

// ========== Quick Commands ==========
const defaultQuickCommands = [
    { name: 'ls', cmd: 'ls -la\n' },
    { name: 'cd ..', cmd: 'cd ..\n' },
    { name: 'clear', cmd: 'clear\n' },
    { name: 'top', cmd: 'top\n' },
    { name: 'exit', cmd: 'exit\n' },
    { name: 'pwd', cmd: 'pwd\n' },
    { name: 'df -h', cmd: 'df -h\n' },
    { name: 'free -m', cmd: 'free -m\n' },
    { name: 'ps aux', cmd: 'ps aux\n' },
    { name: 'history', cmd: 'history\n' },
];

let quickCommandsExpanded = false;

function sendQuickCommand(cmd) {
    const ws = terminals[activeTerminalId]?.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: cmd }));
    }
}

function renderQuickCommands() {
    const container = document.getElementById('quickCommandsList');
    if (!container) return;
    const cmds = quickCommandsExpanded ? defaultQuickCommands : defaultQuickCommands.slice(0, 5);
    container.innerHTML = cmds.map(c =>
        `<button class="quick-cmd-btn" onclick="sendQuickCommand('${c.cmd.replace(/'/g, "\\'")}')"><span>${c.name}</span></button>`
    ).join('') + `<button class="quick-cmd-btn more-btn" onclick="toggleQuickCommands()">${quickCommandsExpanded ? '收起▴' : '更多▾'}</button>`;
}

function toggleQuickCommands() {
    quickCommandsExpanded = !quickCommandsExpanded;
    renderQuickCommands();
}

// Mobile terminal input enter key
document.getElementById('mobileTerminalInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMobileInput();
    }
});

// 事件绑定
document.getElementById('backBtn').onclick = goBack;
document.getElementById('menuBtn').onclick = showMainMenu;
document.getElementById('modal').onclick = (e) => { if (e.target.id === 'modal') hideModal(); };
document.getElementById('uploadModal').onclick = (e) => { if (e.target.id === 'uploadModal') hideUploadModal(); };
document.getElementById('actionMenu').onclick = (e) => { if (e.target.classList.contains('action-menu-close')) hideActionMenu(); };
document.getElementById('mainMenu').onclick = (e) => { if (e.target.classList.contains('action-menu-close')) hideMainMenu(); };
document.getElementById('shortcutConfigModal').onclick = (e) => { if (e.target.id === 'shortcutConfigModal') hideShortcutConfig(); };
document.getElementById('batchRenameModal').onclick = (e) => { if (e.target.id === 'batchRenameModal') hideBatchRenameModal(); };
document.getElementById('shareModal').onclick = (e) => { if (e.target.id === 'shareModal') hideShareModal(); };
document.getElementById('openFilesPanel').onclick = (e) => { if (e.target.id === 'openFilesPanel') hideOpenFilesPanel(); };
