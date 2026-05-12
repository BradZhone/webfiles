;(function AIChatModule(global) {
    var currentConvId = null;
    var isStreaming = false;
    var panelExpanded = false;

    // === Panel Control ===
    global.toggleAIChat = function() {
        var panel = document.getElementById('aiChatPanel');
        if (!panel) return;
        if (panel.style.display === 'none' || !panel.style.display) {
            panel.style.display = 'flex';
            updateContextBar();
            loadConversationList();
            checkAIConfig();
            var input = document.getElementById('aiChatInput');
            if (input) input.focus();
        } else {
            panel.style.display = 'none';
        }
    };

    global.toggleAIChatSize = function() {
        var panel = document.getElementById('aiChatPanel');
        var btn = document.getElementById('aiExpandBtn');
        if (!panel) return;
        panelExpanded = !panelExpanded;
        if (panelExpanded) {
            panel.classList.add('ai-chat-expanded');
            if (btn) btn.textContent = '▫';
        } else {
            panel.classList.remove('ai-chat-expanded');
            if (btn) btn.textContent = '□';
        }
    };

    global.newAIConversation = function() {
        currentConvId = null;
        var container = document.getElementById('aiChatMessages');
        if (container) {
            container.innerHTML =
                '<div class="ai-chat-welcome">' +
                    '<div class="ai-welcome-icon">🤖</div>' +
                    '<p>我是你的 AI 助手，可以帮你：</p>' +
                    '<ul>' +
                        '<li>📖 查看和搜索笔记/知识库</li>' +
                        '<li>✏️ 编辑、整理文档格式和内容</li>' +
                        '<li>📝 撰写新文档</li>' +
                        '<li>❓ 回答关于你文档的问题</li>' +
                    '</ul>' +
                '</div>';
        }
        var select = document.getElementById('aiConversationSelect');
        if (select) select.value = '';
        updateContextBar();
    };

    // === Send Message ===
    global.sendAIMessage = async function() {
        var input = document.getElementById('aiChatInput');
        if (!input) return;
        var text = input.value.trim();
        if (!text || isStreaming) return;

        // Clear input and reset height
        input.value = '';
        input.style.height = 'auto';

        // Append user message
        appendMessage('user', text);

        // Collect context
        var context = getCurrentContext();

        // Create assistant placeholder
        var assistantDiv = appendMessage('assistant', '');
        var contentEl = assistantDiv.querySelector('.ai-msg-content');
        var toolsEl = assistantDiv.querySelector('.ai-msg-tools');

        isStreaming = true;
        updateSendButton();

        var fullText = '';

        try {
            var body = {
                message: text,
                context: context
            };
            if (currentConvId) body.conversationId = currentConvId;

            var resp = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                var errText = await resp.text();
                contentEl.innerHTML = '<div class="ai-error">请求失败: ' + escapeHtml(errText || resp.statusText) + '</div>';
                isStreaming = false;
                updateSendButton();
                return;
            }

            var reader = resp.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';

            while (true) {
                var result = await reader.read();
                if (result.done) break;

                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line.startsWith('data: ')) continue;
                    var jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') continue;

                    try {
                        var evt = JSON.parse(jsonStr);

                        if (evt.type === 'text' || evt.type === 'content') {
                            fullText += (evt.content || evt.text || '');
                            contentEl.innerHTML = renderMarkdown(fullText);
                            scrollToBottom();
                        } else if (evt.type === 'tool_call') {
                            appendToolCall(toolsEl, evt.name || evt.tool, evt.arguments || evt.args);
                            scrollToBottom();
                        } else if (evt.type === 'tool_result') {
                            updateToolResult(toolsEl, evt.name || evt.tool);
                        } else if (evt.type === 'done') {
                            if (evt.conversationId) {
                                currentConvId = evt.conversationId;
                                var select = document.getElementById('aiConversationSelect');
                                if (select) select.value = currentConvId;
                            }
                            loadConversationList();
                        } else if (evt.type === 'error') {
                            contentEl.innerHTML += '<div class="ai-error">' + escapeHtml(evt.message || evt.error || '未知错误') + '</div>';
                        }
                    } catch (parseErr) {
                        // Skip unparseable lines
                    }
                }
            }

            // If no text was received, show a fallback
            if (!fullText && !contentEl.querySelector('.ai-error')) {
                var hasToolCalls = toolsEl && toolsEl.querySelectorAll('.ai-tool-call').length > 0;
                if (hasToolCalls) {
                    contentEl.innerHTML = '<span class="ai-done">操作已完成</span>';
                } else {
                    contentEl.innerHTML = '<span class="ai-typing">AI 未返回内容，请重试</span>';
                }
            }

        } catch (err) {
            contentEl.innerHTML = '<div class="ai-error">连接失败: ' + escapeHtml(err.message) + '</div>';
        } finally {
            isStreaming = false;
            updateSendButton();
        }
    };

    // === Context Detection ===
    function getCurrentContext() {
        return {
            currentView: detectView(),
            currentFile: detectFile(),
            currentVault: detectVault(),
            currentNotesPath: detectNotesPath()
        };
    }

    function detectView() {
        if (document.getElementById('vaultView') && document.getElementById('vaultView').classList.contains('active')) return 'vault';
        if (document.getElementById('notesView') && document.getElementById('notesView').classList.contains('active')) return 'notes';
        if (document.getElementById('editorView') && document.getElementById('editorView').classList.contains('active')) return 'editor';
        if (document.getElementById('terminalView') && document.getElementById('terminalView').classList.contains('active')) return 'terminal';
        return 'files';
    }

    function detectFile() {
        // Try vault current file
        var vaultFile = document.querySelector('.vault-tree-item.active');
        if (vaultFile) return vaultFile.dataset && vaultFile.dataset.path ? vaultFile.dataset.path : vaultFile.textContent;
        // Try editor activeFilePath
        if (typeof activeFilePath !== 'undefined' && activeFilePath) return activeFilePath;
        // Try notes current note
        var notesTitle = document.getElementById('notesEditorTitle');
        if (notesTitle && notesTitle.textContent) return notesTitle.textContent;
        return null;
    }

    function detectVault() {
        var select = document.getElementById('vaultSelector');
        return select ? select.value || null : null;
    }

    function detectNotesPath() {
        var select = document.getElementById('notesPathDropdown');
        return select ? select.value || null : null;
    }

    // === Message Rendering ===
    function appendMessage(role, content) {
        var container = document.getElementById('aiChatMessages');
        if (!container) return null;
        var welcome = container.querySelector('.ai-chat-welcome');
        if (welcome) welcome.remove();

        var div = document.createElement('div');
        div.className = 'ai-msg ai-msg-' + role;
        div.innerHTML =
            '<div class="ai-msg-avatar">' + (role === 'user' ? '👤' : '🤖') + '</div>' +
            '<div class="ai-msg-body">' +
                '<div class="ai-msg-tools"></div>' +
                '<div class="ai-msg-content">' + (content ? renderMarkdown(content) : '<span class="ai-typing">思考中</span>') + '</div>' +
            '</div>';
        container.appendChild(div);
        scrollToBottom();
        return div;
    }

    function renderMarkdown(text) {
        if (typeof marked !== 'undefined') {
            try { return marked.parse(text); } catch (e) { /* fallback below */ }
        }
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function appendToolCall(toolsEl, name, args) {
        if (!toolsEl) return;
        var icons = {
            get_vault_overview: '🗺️', search_content: '🔍', read_outline: '📋',
            read_section: '📄', read_full: '📖', edit_section: '✏️',
            write_new_file: '📝', rename_note: '✏️', lint_fix: '🔧',
            get_graph_neighborhood: '🕸️', list_notes: '📋', get_tags: '🏷️',
            get_todos: '✅', edit_metadata: '⚙️', quick_capture: '📌',
            insert_section: '➕'
        };
        var labels = {
            get_vault_overview: '查看知识库', search_content: '搜索',
            read_outline: '读取大纲', read_section: '读取章节',
            read_full: '读取全文', edit_section: '编辑章节',
            write_new_file: '创建文件', rename_note: '重命名',
            lint_fix: '修复格式', get_graph_neighborhood: '查看关系',
            list_notes: '列出笔记', get_tags: '获取标签',
            get_todos: '获取待办', edit_metadata: '修改属性',
            quick_capture: '快速记录', insert_section: '插入章节'
        };
        var div = document.createElement('div');
        div.className = 'ai-tool-call';
        div.dataset.tool = name;
        div.innerHTML = '<span class="ai-tool-icon">' + (icons[name] || '🔧') + '</span>' +
            '<span class="ai-tool-name">' + (labels[name] || name) + '</span>' +
            '<span class="ai-tool-status">⏳</span>';
        toolsEl.appendChild(div);
        toolsEl.style.display = 'flex';
    }

    function updateToolResult(toolsEl, name) {
        if (!toolsEl) return;
        var calls = toolsEl.querySelectorAll('.ai-tool-call');
        for (var i = calls.length - 1; i >= 0; i--) {
            if (calls[i].dataset.tool === name && calls[i].querySelector('.ai-tool-status').textContent === '⏳') {
                calls[i].querySelector('.ai-tool-status').textContent = '✓';
                calls[i].classList.add('ai-tool-done');
                break;
            }
        }
    }

    // === Conversation Management ===
    global.loadAIConversation = async function(id) {
        if (!id) { global.newAIConversation(); return; }
        try {
            var resp = await fetch('/api/ai/conversations/' + id);
            if (!resp.ok) throw new Error('Failed to load');
            var conv = await resp.json();
            currentConvId = id;
            var container = document.getElementById('aiChatMessages');
            if (!container) return;
            container.innerHTML = '';
            (conv.messages || []).forEach(function(m) { appendMessage(m.role, m.content); });
        } catch (e) {
            if (typeof showToast === 'function') showToast('加载对话失败', 'error');
        }
    };

    async function loadConversationList() {
        try {
            var resp = await fetch('/api/ai/conversations');
            var data = await resp.json();
            var select = document.getElementById('aiConversationSelect');
            if (!select) return;
            select.innerHTML = '<option value="">新对话</option>';
            (data.conversations || []).slice(0, 20).forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = (c.title || '无标题').slice(0, 20);
                if (c.id === currentConvId) opt.selected = true;
                select.appendChild(opt);
            });
        } catch (e) { /* ignore */ }
    }

    // === Context Bar ===
    function updateContextBar() {
        var bar = document.getElementById('aiChatContext');
        if (!bar) return;
        var ctx = getCurrentContext();
        if (ctx.currentFile) {
            var name = typeof ctx.currentFile === 'string' ? ctx.currentFile.split('/').pop() : '';
            bar.innerHTML = '<span class="ai-context-badge">📎 ' + escapeHtml(name) + '</span>';
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    }

    // === Settings ===
    global.showAISettings = async function() {
        try {
            var resp = await fetch('/api/ai/config');
            var config = await resp.json();
            document.getElementById('aiBaseUrlInput').value = config.baseUrl || 'https://api.z.ai/api/coding/paas/v4';
            document.getElementById('aiModelInput').value = config.model || 'glm-5.1';
            // Don't prefill API key for security
        } catch (e) {}
        document.getElementById('aiSettingsModal').style.display = 'flex';
    };

    global.hideAISettings = function() {
        document.getElementById('aiSettingsModal').style.display = 'none';
    };

    global.saveAISettings = async function() {
        var apiKey = document.getElementById('aiApiKeyInput').value;
        var model = document.getElementById('aiModelInput').value;
        var baseUrl = document.getElementById('aiBaseUrlInput').value;
        try {
            await fetch('/api/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: apiKey || undefined, model: model, baseUrl: baseUrl })
            });
            global.hideAISettings();
            if (typeof showToast === 'function') showToast('AI 配置已保存', 'success');
        } catch (e) {
            if (typeof showToast === 'function') showToast('保存失败', 'error');
        }
    };

    // === Input Handling ===
    global.autoResizeAIInput = function(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    };

    function initInputHandlers() {
        var input = document.getElementById('aiChatInput');
        if (!input) return;
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                global.sendAIMessage();
            }
        });
        input.addEventListener('input', function() {
            global.autoResizeAIInput(this);
        });
    }

    // === Utilities ===
    function scrollToBottom() {
        var el = document.getElementById('aiChatMessages');
        if (el) el.scrollTop = el.scrollHeight;
    }

    function updateSendButton() {
        var btn = document.getElementById('aiSendBtn');
        if (btn) btn.disabled = isStreaming;
    }

    async function checkAIConfig() {
        try {
            var resp = await fetch('/api/ai/config');
            var config = await resp.json();
            if (!config.configured) global.showAISettings();
        } catch (e) {}
    }

    // Init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInputHandlers);
    } else {
        initInputHandlers();
    }

})(window);
