// vault.js - Vault browser, knowledge base (IIFE module)
// ========== Vault Browser Module ==========
;(function VaultModule(global) {
    'use strict';

    // --- Private State ---
    let currentVault = null;
    let currentFile = null;
    var currentFileRaw = '';
    let graphNetwork = null;
    let graphCache = null;
    var graphMode = 'global';
    var graphData = null;
    var selectedGraphNode = null;
    var graphTooltipEl = null;
    let savedVaultPaths = [];
    let dirBrowserCurrentPath = null;

    const DIR_COLORS = {
        'daily-notes': '#f38ba8', 'projects': '#3fb950', 'areas': '#58a6ff',
        'resources': '#d29922', 'archive': '#6e7681', 'templates': '#a371f7',
        'attachments': '#6e7681'
    };
    const TAG_COLORS = [
        '#f38ba8', '#3fb950', '#58a6ff', '#d29922',
        '#a371f7', '#79c0ff', '#f0883e', '#56d364'
    ];
    const DEFAULT_COLOR = '#58a6ff';
    const VAULT_COLORS = [
        '#89b4fa', '#f38ba8', '#a6e3a1', '#f9e2af',
        '#cba6f7', '#94e2d5', '#fab387', '#89dceb'
    ];

    // --- Utility ---
    function slugify(text) {
        return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
    }
    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }
    function getNodeColor(filePath, groupBy, tags) {
        if (groupBy === 'tag' && tags && tags.length > 0) {
            return TAG_COLORS[Math.abs(hashCode(tags[0])) % TAG_COLORS.length];
        }
        var parts = filePath.split('/');
        var dir = parts.length > 1 ? parts[0] : 'root';
        return DIR_COLORS[dir.toLowerCase()] || DEFAULT_COLOR;
    }
    function vaultIdFromPath(vaultPath) {
        return 'vr_' + Math.abs(hashCode(vaultPath));
    }

    // --- View Management ---
    async function showVaultView() {
        showView('vaultView');
        document.getElementById('headerTitle').textContent = '\ud83d\udcda \u77e5\u8bc6\u5e93';
        await loadAllVaults();
    }

    // --- Multi-Vault Loading ---
    async function loadAllVaults() {
        try {
            var resp = await fetch('/api/vault/paths');
            var data = await resp.json();
            savedVaultPaths = data.paths || [];
        } catch (e) {
            savedVaultPaths = [];
        }
        renderVaultRoots(savedVaultPaths);
        if (!currentVault && savedVaultPaths.length > 0) currentVault = savedVaultPaths[0];
        window._currentVaultPath = currentVault;
    }

    function renderVaultRoots(vaults) {
        var container = document.getElementById('vaultRoots');
        if (vaults.length === 0) {
            container.innerHTML = '<div class="vault-roots-empty" id="vaultRootsEmpty"><span class="empty-icon">\ud83d\udcc2</span><p>No knowledge bases yet</p><span style="font-size:11px;color:var(--dim);margin-top:4px;">Click \"+ Add Vault\" below to get started</span></div>';
            return;
        }
        var html = '';
        vaults.forEach(function(vaultPath) {
            var name = vaultPath.split('/').pop() || vaultPath;
            var vid = vaultIdFromPath(vaultPath);
            html += '<div class="vault-root" id="' + vid + '" data-vault="' + escapeHtml(vaultPath) + '">';
            html += '<div class="vault-root-header" onclick="toggleVaultRoot(\'' + vid + '\')"><span class="vault-root-icon">\u25bc</span><span class="vault-root-name">\ud83d\udcc2 ' + escapeHtml(name) + '</span>';
            html += '<button class="vault-root-new" onclick="event.stopPropagation();createVaultFileInVault(\'' + escapeHtml(vaultPath).replace(/'/g, "\\'") + '\')" title="新建文档">+</button>';
            html += '<button class="vault-root-jump" onclick="event.stopPropagation();jumpToVaultPath(\'' + escapeHtml(vaultPath).replace(/'/g, "\\'") + '\')" title="在文件管理器中打开">↗</button>';
            html += '<button class="vault-root-remove" onclick="event.stopPropagation();removeVault(\'' + escapeHtml(vaultPath).replace(/'/g, "\\'") + '\')" title="Remove">\u00d7</button></div>';
            html += '<div class="vault-root-tree" id="tree_' + vid + '"><div class="panel-empty" style="padding:8px 12px;font-size:12px;">Loading...</div></div>';
            html += '</div>';
        });
        container.innerHTML = html;
        // Load all trees in parallel
        vaults.forEach(function(vp) { loadVaultTree(vp); });
        if (!currentVault && vaults.length > 0) currentVault = vaults[0];
    }

    // --- Vault Root Toggle ---
    function toggleVaultRoot(vid) {
        var el = document.getElementById(vid);
        if (el) {
            el.classList.toggle('collapsed');
            var icon = el.querySelector('.vault-root-icon');
            if (icon) icon.textContent = el.classList.contains('collapsed') ? '\u25b6' : '\u25bc';
        }
    }

    // --- Remove Vault ---
    async function removeVault(vaultPath) {
        try {
            await fetch('/api/vault/paths', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: vaultPath })
            });
        } catch (e) { /* ignore */ }
        if (currentVault === vaultPath) { currentVault = null; window._currentVaultPath = currentVault; currentFile = null; graphCache = null; }
        await loadAllVaults();
        showToast('Vault removed', 'info');
    }

    // --- File Tree ---
    async function loadVaultTree(vaultPath) {
        var vid = vaultIdFromPath(vaultPath);
        var treeEl = document.getElementById('tree_' + vid);
        if (!treeEl) return;
        treeEl.innerHTML = '<div class="panel-empty" style="padding:8px 12px;font-size:12px;">Loading...</div>';
        try {
            var resp = await fetch('/api/vault/graph?vault=' + encodeURIComponent(vaultPath));
            treeEl = document.getElementById('tree_' + vid);
            if (!treeEl) return;
            if (!resp.ok) { treeEl.innerHTML = '<div class="panel-empty" style="padding:8px 12px;font-size:12px;color:var(--danger);">Failed to load</div>'; return; }
            var data = await resp.json();
            var payload = data.data || data;
            var nodes = payload.nodes || [];
            if (nodes.length === 0) { treeEl.innerHTML = '<div class="panel-empty" style="padding:8px 12px;font-size:12px;">No Markdown files</div>'; return; }
            var tree = buildTreeFromNodes(nodes);
            renderTreeInto(treeEl, tree, vaultPath);
            // Update vault header with file count
            var headerEl = document.querySelector('#' + vid + ' .vault-root-name');
            if (headerEl) {
                headerEl.innerHTML = '📂 ' + escapeHtml(vaultPath.split('/').pop() || vaultPath) + ' <span class="vault-file-count">' + nodes.length + '</span>';
            }
            if (vaultPath === currentVault) graphCache = payload;
        } catch (e) {
            treeEl = document.getElementById('tree_' + vid);
            if (treeEl) treeEl.innerHTML = '<div class="panel-empty" style="padding:8px 12px;font-size:12px;color:var(--danger);">' + escapeHtml(e.message) + '</div>';
        }
    }

    function buildTreeFromNodes(nodes) {
        var root = { name: '', children: {}, files: [] };
        nodes.forEach(function(node) {
            var parts = (node.path || node.id).split('/');
            var current = root;
            for (var i = 0; i < parts.length - 1; i++) {
                var dir = parts[i];
                if (!current.children[dir]) current.children[dir] = { name: dir, children: {}, files: [] };
                current = current.children[dir];
            }
            current.files.push({ name: parts[parts.length - 1], label: node.label || parts[parts.length - 1].replace(/\.md$/, ''), path: node.path || node.id, tags: node.tags || [] });
        });
        return root;
    }

    function renderTreeInto(container, tree, vaultPath) {
        var html = '';
        var dirs = Object.keys(tree.children).sort();
        dirs.forEach(function(dirName) { html += renderTreeFolder(tree.children[dirName], dirName, vaultPath); });
        var files = (tree.files || []).sort(function(a, b) { return a.name.localeCompare(b.name); });
        files.forEach(function(f) {
            html += '<div class="vault-tree-item" data-path="' + escapeHtml(f.path) + '" data-vault="' + escapeHtml(vaultPath) + '" onclick="openVaultFile(\'' + escapeHtml(f.path).replace(/'/g, "\\'") + '\', \'' + escapeHtml(vaultPath).replace(/'/g, "\\'") + '\')">'
                 + '<span class="tree-icon">\ud83d\udcc4</span><span class="tree-label">' + escapeHtml(f.label) + '</span></div>';
        });
        container.innerHTML = html || '<div class="panel-empty" style="padding:8px 12px;font-size:12px;">No files</div>';
    }

    function countFilesInFolder(folder) {
        var count = (folder.files || []).length;
        Object.values(folder.children).forEach(function(child) {
            count += countFilesInFolder(child);
        });
        return count;
    }

    function renderTreeFolder(folder, name, vaultPath) {
        var fileCount = countFilesInFolder(folder);
        var html = '<div class="vault-tree-folder">';
        html += '<div class="vault-tree-item" onclick="toggleTreeFolder(this.parentElement)"><span class="tree-icon">▶</span><span class="tree-label">📁 ' + escapeHtml(name) + ' <span class="vault-file-count">' + fileCount + '</span></span></div>';
        html += '<div class="vault-tree-children">';
        Object.keys(folder.children).sort().forEach(function(d) { html += renderTreeFolder(folder.children[d], d, vaultPath); });
        (folder.files || []).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(f) {
            html += '<div class="vault-tree-item" data-path="' + escapeHtml(f.path) + '" data-vault="' + escapeHtml(vaultPath) + '" onclick="openVaultFile(\'' + escapeHtml(f.path).replace(/'/g, "\\'") + '\', \'' + escapeHtml(vaultPath).replace(/'/g, "\\'") + '\')">'
                 + '<span class="tree-icon">\ud83d\udcc4</span><span class="tree-label">' + escapeHtml(f.label) + '</span></div>';
        });
        html += '</div></div>';
        return html;
    }

    global.toggleTreeFolder = function(el) {
        el.classList.toggle('open');
        var icon = el.querySelector('.tree-icon');
        if (icon) icon.textContent = el.classList.contains('open') ? '\u25bc' : '\u25b6';
    };

    // --- Directory Browser ---
    function toggleDirBrowser() {
        var el = document.getElementById('dirBrowser');
        if (el.style.display === 'none') {
            el.style.display = '';
            loadDirBrowser(null);
        } else {
            el.style.display = 'none';
        }
    }
    function closeDirBrowser() { document.getElementById('dirBrowser').style.display = 'none'; }

    async function loadDirBrowser(dirPath) {
        var list = document.getElementById('dirBrowserList');
        var pathEl = document.getElementById('dirBrowserPath');
        list.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--dim);">Loading...</div>';
        try {
            var url = '/api/browse';
            if (dirPath) url += '?path=' + encodeURIComponent(dirPath);
            var resp = await fetch(url);
            var data = await resp.json();
            if (data.error) { list.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--danger);">' + escapeHtml(data.error) + '</div>'; return; }
            dirBrowserCurrentPath = data.path;
            pathEl.textContent = 'Current: ' + data.path;
            if (!data.dirs || data.dirs.length === 0) {
                list.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--dim);text-align:center;">No subdirectories</div>';
                return;
            }
            var html = '';
            data.dirs.forEach(function(d) {
                html += '<div class="dir-browser-item" onclick="browseTo(\'' + escapeHtml(d.path).replace(/'/g, "\\'") + '\')">' + '\ud83d\udcc1 ' + escapeHtml(d.name) + '</div>';
            });
            list.innerHTML = html;
        } catch (e) {
            list.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--danger);">Error: ' + escapeHtml(e.message) + '</div>';
        }
    }

    function browseTo(dirPath) { loadDirBrowser(dirPath); }

    function dirBrowserUp() {
        if (!dirBrowserCurrentPath) return;
        var parts = dirBrowserCurrentPath.split('/');
        if (parts.length <= 2) return; // don't go above root
        var parent = parts.slice(0, -1).join('/') || '/';
        loadDirBrowser(parent);
    }

    async function dirBrowserSelect() {
        if (!dirBrowserCurrentPath) return;
        try {
            var resp = await fetch('/api/vault/paths', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dirBrowserCurrentPath })
            });
            var data = await resp.json();
            if (data.error) { showToast(data.error, 'warning'); return; }
            closeDirBrowser();
            currentVault = dirBrowserCurrentPath;
            window._currentVaultPath = currentVault;
            await loadAllVaults();
            showToast('Vault added: ' + dirBrowserCurrentPath.split('/').pop(), 'success');
        } catch (e) {
            showToast('Failed: ' + e.message, 'error');
        }
    }

    // --- File Preview ---
    async function openVaultFile(filePath, vaultPath) {
        if (vaultPath) currentVault = vaultPath;
        window._currentVaultPath = currentVault;
        if (!currentVault) return;
        // Auto-collapse sidebar on mobile
        if (window.innerWidth <= 768) {
            var sidebar = document.getElementById('vaultSidebar');
            if (sidebar) sidebar.classList.add('collapsed');
        }
        currentFile = filePath;
        // Highlight active
        document.querySelectorAll('.vault-tree-item.active').forEach(function(el) { el.classList.remove('active'); });
        document.querySelectorAll('.vault-tree-item[data-path]').forEach(function(el) {
            if (el.dataset.path === filePath) el.classList.add('active');
        });
        switchContentTab('preview');
        var preview = document.getElementById('contentPreview');
        preview.innerHTML = '<div class="panel-empty"><div class="graph-spinner" style="margin:20px auto;"></div>Loading...</div>';
        try {
            var resp = await fetch('/api/vault/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault: currentVault, file: filePath })
            });
            var data = await resp.json();
            if (!resp.ok || data.error) {
                preview.innerHTML = '<div class="vault-empty-state"><div class="empty-icon">🔍</div><p>文档未找到</p><span class="empty-hint">' + escapeHtml(filePath) + ' 不存在于当前知识库中</span></div>';
                return;
            }
            var payload = data.data || data;
            currentFileRaw = payload.raw || payload.body || '';
            renderPreview(preview, payload);
            loadBacklinks(filePath);
            // metadata displayed in preview Properties block
            var title = payload.metadata && payload.metadata.title ? payload.metadata.title : filePath.split('/').pop().replace(/\.md$/, '');
            document.getElementById('headerTitle').textContent = '\ud83d\udcda ' + title;
            // Auto-open TOC panel when file loaded
            var tocBody = document.getElementById('panelToc');
            var tocArrow = document.getElementById('panelTocArrow');
            if (tocBody && tocBody.classList.contains('collapsed')) {
                tocBody.classList.remove('collapsed');
                if (tocArrow) tocArrow.textContent = '▼';
            }
        } catch (e) {
            preview.innerHTML = '<div class="panel-empty">Failed: ' + escapeHtml(e.message) + '</div>';
        }
    }

    function renderPreview(container, payload) {
        var html = '';
        if (payload.html) { html = payload.html; }
        else if (payload.body) { try { html = marked.parse(payload.body); } catch(e) { html = '<pre style="white-space:pre-wrap;color:var(--text-secondary);">' + payload.body.replace(/</g,'&lt;') + '</pre>'; } }
        else if (payload.raw) { try { html = marked.parse(payload.raw); } catch(e) { html = '<pre style="white-space:pre-wrap;color:var(--text-secondary);">' + payload.raw.replace(/</g,'&lt;') + '</pre>'; } }
        var bcHtml = '';
        if (currentFile && currentVault) {
            var vaultName = currentVault.split('/').pop() || currentVault;
            var parts = currentFile.split('/');
            bcHtml = '<div class="vault-breadcrumb" style="display:flex;">';
            bcHtml += '<span>\ud83d\udcda ' + escapeHtml(vaultName) + '</span>';
            for (var i = 0; i < parts.length; i++) {
                bcHtml += '<span class="bc-sep">\u203a</span>';
                if (i === parts.length - 1) bcHtml += '<span class="bc-current">' + escapeHtml(parts[i].replace(/\.md$/, '')) + '</span>';
                else bcHtml += '<span>' + escapeHtml(parts[i]) + '</span>';
            }
            bcHtml += '</div>';
        }
        var propsHtml = '';
        var meta = payload.metadata;
        if (meta && Object.keys(meta).length > 0) {
            propsHtml = '<div class="frontmatter-block" id="frontmatterBlock">';
            propsHtml += '<div class="frontmatter-header" onclick="toggleFrontmatterCollapse()" style="cursor:pointer;"><span>⚙ Properties</span><span class="frontmatter-toggle" id="fmToggle">▼</span></div>';
            propsHtml += '<div class="frontmatter-display" id="frontmatterDisplay"><table class="frontmatter-table">';
            var keys = Object.keys(meta);
            var orderedKeys = [];
            var dateKeys = [];
            keys.forEach(function(key) {
                if (key === 'created' || key === 'updated' || key === 'date' || key === 'modified') {
                    dateKeys.push(key);
                } else {
                    orderedKeys.push(key);
                }
            });
            var titleIdx = orderedKeys.indexOf('title');
            var insertPos = titleIdx >= 0 ? titleIdx + 1 : 0;
            orderedKeys.splice.apply(orderedKeys, [insertPos, 0].concat(dateKeys));
            orderedKeys.forEach(function(key) {
                if (!(key in meta)) return;
                var val = meta[key];
                var valHtml = '';
                if (key === 'tags' && Array.isArray(val)) {
                    valHtml = val.map(function(t) {
                        return '<span class="obsidian-tag" style="cursor:pointer;" onclick="filterByTag(\'' + escapeHtml(String(t)).replace(/'/g, "\\'") + '\')">#' + escapeHtml(String(t)) + '</span>';
                    }).join(' ');
                } else if (Array.isArray(val)) {
                    valHtml = val.map(function(v) {
                        var s = String(v);
                        var wm = s.match(/^\[\[(.+?)\]\]$/);
                        if (wm) return '<a class="wiki-link" href="javascript:void(0)" onclick="openWikiLink(\'' + encodeURIComponent(wm[1]) + '\')">' + escapeHtml(wm[1]) + '</a>';
                        return escapeHtml(s);
                    }).join(' · ');
                } else {
                    valHtml = escapeHtml(String(val || ''));
                }
                propsHtml += '<tr><td class="fm-key">' + escapeHtml(key) + '</td><td class="fm-val">' + valHtml + '</td></tr>';
            });
            propsHtml += '</table></div>';
            propsHtml += '</div>';
        }
        container.innerHTML = bcHtml + propsHtml + '<div class="markdown-body">' + html + '</div>';
        var headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(function(h) { if (!h.id) h.id = slugify(h.textContent); });
        var tocItems = [];
        if (payload.toc && payload.toc.length > 0) tocItems = payload.toc;
        else tocItems = generateTOC(container);
        renderTOC(document.getElementById('panelToc'), tocItems);
        if (typeof renderMermaidDiagrams === 'function') renderMermaidDiagrams(container);
        if (typeof loadEmbeds === 'function') loadEmbeds(container);
    }

    // --- TOC ---
    function generateTOC(container) {
        var headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        var items = [];
        headings.forEach(function(h) { items.push({ level: parseInt(h.tagName[1]), text: h.textContent, id: h.id || slugify(h.textContent) }); });
        return items;
    }
    function renderTOC(container, tocItems) {
        if (!tocItems || tocItems.length === 0) {
            container.innerHTML = '<div class="panel-empty"><span class="empty-icon-sm">\ud83d\udccb</span>\u672a\u68c0\u6d4b\u5230\u6807\u9898<div class="empty-sub">\u5f53\u524d\u6587\u4ef6\u6ca1\u6709\u6807\u9898\u7ed3\u6784</div></div>';
            var cEl = document.getElementById('panelTocCount'); if (cEl) cEl.textContent = '';
            return;
        }
        var minLevel = Math.min.apply(null, tocItems.map(function(t) { return t.level; }));
        var html = '<div class="panel-header"><span>\ud83d\udccb</span><span>\u5927\u7eb2 (' + tocItems.length + ')</span></div>';
        html += '<div class="toc-list">';
        tocItems.forEach(function(item) {
            var level = item.level - minLevel + 1;
            html += '<div class="toc-item toc-level-' + level + '" onclick="scrollToHeading(\'' + escapeHtml(item.id) + '\')">' + escapeHtml(item.text) + '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
        var cEl = document.getElementById('panelTocCount'); if (cEl) cEl.textContent = '(' + tocItems.length + ')';
    }
    global.scrollToHeading = function(id) {
        var el = document.getElementById(id);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.style.background = 'rgba(88,166,255,0.15)'; setTimeout(function() { el.style.background = ''; }, 1500); }
    };

    // --- Backlinks ---
    async function loadBacklinks(filePath) {
        var container = document.getElementById('panelBacklinks');
        if (!container || !currentVault) return;
        var basename = filePath.replace(/\.md$/, '').split('/').pop();
        try {
            var resp = await fetch('/api/vault/backlinks?vault=' + encodeURIComponent(currentVault) + '&file=' + encodeURIComponent(filePath));
            var data = await resp.json();
            var backlinks = data.backlinks || [];
            var outlinks = data.outlinks || [];
            var html = '';
            
            // Backlinks section
            html += '<div class="links-section">';
            html += '<div class="links-section-title">↩ 反向链接 (' + backlinks.length + ')</div>';
            if (backlinks.length === 0) {
                html += '<div style="padding:4px 8px;color:var(--dim);font-size:11px;">无反向链接</div>';
            } else {
                backlinks.forEach(function(bl) {
                    html += '<div class="backlink-item" onclick="openVaultFile(\'' + escapeHtml(bl.path || '').replace(/'/g, "\\'") + '\', \'' + escapeHtml(currentVault).replace(/'/g, "\\'") + '\')">';
                    html += '📄 ' + escapeHtml(bl.basename || bl.name || '') + '</div>';
                });
            }
            html += '</div>';
            
            // Outlinks section
            html += '<div class="links-section" style="margin-top:8px;">';
            html += '<div class="links-section-title">↗ 出链 (' + outlinks.length + ')</div>';
            if (outlinks.length === 0) {
                html += '<div style="padding:4px 8px;color:var(--dim);font-size:11px;">无出链</div>';
            } else {
                outlinks.forEach(function(ol) {
                    html += '<div class="backlink-item" onclick="openVaultFile(\'' + escapeHtml(ol.path || '').replace(/'/g, "\\'") + '\', \'' + escapeHtml(currentVault).replace(/'/g, "\\'") + '\')">';
                    html += '📄 ' + escapeHtml(ol.basename || ol.name || '') + '</div>';
                });
            }
            html += '</div>';
            
            container.innerHTML = html;
            // Update count
            var countEl = document.getElementById('panelBacklinksCount');
            if (countEl) countEl.textContent = '(' + (backlinks.length + outlinks.length) + ')';
        } catch(e) {
            container.innerHTML = '<div style="padding:8px;color:var(--dim);">加载失败</div>';
        }
    }

    // --- Info Panel Tab ---
    function switchInfoTab(tab) {
        var tabs = document.querySelectorAll('.vault-info-panel .panel-tab');
        tabs.forEach(function(t) { t.classList.remove('active'); });
        var panels = { toc: document.getElementById('panelToc'), backlinks: document.getElementById('panelBacklinks') };
        Object.keys(panels).forEach(function(key) { if (panels[key]) panels[key].style.display = key === tab ? '' : 'none'; });
        tabs.forEach(function(t) {
            var tabName = t.textContent.includes('\u5927\u7eb2') ? 'toc' : t.textContent.includes('\u53cd\u94fe') ? 'backlinks' : 'meta';
            if (tabName === tab) t.classList.add('active');
        });
    }

    // --- Metadata ---
    function renderMetadata(container, metadata) {
        if (!metadata || Object.keys(metadata).length === 0) {
            container.innerHTML = '<div class="panel-header"><span>\ud83d\udcca</span><span>\u5143\u6570\u636e</span></div><div class="panel-empty"><span class="empty-icon-sm">\ud83d\udcc4</span>\u65e0\u5143\u6570\u636e<div class="empty-sub">\u6587\u4ef6\u7f3a\u5c11 YAML frontmatter</div></div>';
            return;
        }
        var html = '<div class="panel-header"><span>\ud83d\udcca</span><span>\u5143\u6570\u636e</span></div><table class="vault-meta-table">';
        Object.keys(metadata).forEach(function(key) {
            var val = metadata[key];
            var valHtml = '';
            if (key === 'tags' && Array.isArray(val)) {
                valHtml = val.map(function(t) {
                    return '<span class="obsidian-tag" style="cursor:pointer;margin:1px 2px;" onclick="filterByTag(\'' + escapeHtml(String(t)).replace(/'/g, "\\'") + '\')">#' + escapeHtml(String(t)) + '</span>';
                }).join(' ');
            } else if (key === 'related' && Array.isArray(val)) {
                valHtml = val.map(function(v) {
                    var s = String(v);
                    var wikiMatch = s.match(/^\[\[(.+?)\]\]$/);
                    if (wikiMatch) {
                        var target = wikiMatch[1];
                        return '<a class="wiki-link" href="javascript:void(0)" onclick="openWikiLink(\'' + encodeURIComponent(target) + '\')">' + escapeHtml(target) + '</a>';
                    }
                    return escapeHtml(s);
                }).join(', ');
            } else if (Array.isArray(val)) {
                valHtml = val.map(function(v) { return escapeHtml(String(v)); }).join(', ');
            } else {
                valHtml = escapeHtml(String(val));
            }
            html += '<tr><td>' + escapeHtml(key) + '</td><td>' + valHtml + '</td></tr>';
        });
        html += '</table>';
        container.innerHTML = html;
    }

    // --- Knowledge Graph ---
    function showGraph() {
        if (!currentVault) { showToast('请先添加 Vault', 'warning'); return; }
        togglePanel('graph');
    }

    function switchGraphVault(vaultPath) {
        graphCache = null;
        loadGraphForVault(vaultPath);
    }

    function loadGraphForVault(vaultPath) {
        var container = document.getElementById('graphContainer');
        container.innerHTML = '<div class="graph-loading"><div class="graph-spinner"></div><span>Loading graph...</span></div>';
        fetch('/api/vault/graph?vault=' + encodeURIComponent(vaultPath))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var payload = data.data || data;
                if (vaultPath === currentVault) graphCache = payload;
                initGraph(container, payload);
            })
            .catch(function(e) { container.innerHTML = '<div class="panel-empty" style="height:100%;display:flex;align-items:center;justify-content:center;">Failed: ' + escapeHtml(e.message) + '</div>'; });
    }
    function getEdgeColor(type) {
        switch(type) {
            case 'wikilink': return { color: '#89b4fa', highlight: '#b4d0fb', hover: '#b4d0fb' };
            case 'tag': return { color: '#f9e2af', highlight: '#fcefd5', hover: '#fcefd5' };
            case 'backlink': return { color: '#a6e3a1', highlight: '#c8eec6', hover: '#c8eec6' };
            default: return { color: '#585b70', highlight: '#89b4fa', hover: '#89b4fa' };
        }
    }
    function initGraph(container, data) {
        if (typeof vis === 'undefined' || !vis.Network) { container.innerHTML = '<div class="graph-loading"><span style="font-size:48px;">\u26a0\ufe0f</span><span>vis-network not loaded</span></div>'; return; }
        function graphNodeColor(baseColor) {
            return {
                background: baseColor || '#89b4fa',
                border: (baseColor || '#89b4fa') + '80',
                highlight: { background: '#f5c2e7', border: '#f5c2e7' },
                hover: { background: baseColor || '#89b4fa', border: '#cdd6f4' }
            };
        }
        var hasGroups = data.nodes && data.nodes.some(function(n) { return n.vaultName; });
        var connectionCount = {};
        (data.edges || []).forEach(function(e) {
            connectionCount[e.from] = (connectionCount[e.from] || 0) + 1;
            connectionCount[e.to] = (connectionCount[e.to] || 0) + 1;
        });
        // Seed initial positions by group (vault+subdirectory)
        var groupCenters = {};
        var groupIdx = 0;
        if (hasGroups) {
            (data.nodes || []).forEach(function(n) {
                var gKey = n.groupKey || n.vaultName || 'default';
                if (!groupCenters[gKey]) {
                    var angle = (groupIdx / 8) * Math.PI * 2;
                    groupCenters[gKey] = { x: Math.cos(angle) * 250, y: Math.sin(angle) * 250 };
                    groupIdx++;
                }
            });
        }

        var nodes = (data.nodes || []).map(function(n) {
            var baseColor = n.color || getNodeColor(n.path || n.id, 'directory', n.tags || []);
            var name = (n.label || n.path || '').replace(/\.md$/, '');
            if (name.indexOf(':') !== -1) name = name.split(':').pop();
            return { id: n.id || n.path, label: name.length > 15 ? name.substring(0, 14) + '…' : name, path: n.path || n.id, vault: n.vault || null, vaultName: n.vaultName || null, groupKey: n.groupKey || null, color: graphNodeColor(baseColor), size: Math.max(14, Math.min(26, 14 + (connectionCount[n.id || n.path] || 0) * 1)), tags: n.tags || [], font: { color: 'transparent', size: 11 }, title: (n.label || n.path) + (n.tags && n.tags.length ? '\nTags: ' + n.tags.join(', ') : ''), x: hasGroups ? (groupCenters[n.groupKey || n.vaultName || 'default'] || {x:0}).x + (Math.random() - 0.5) * 80 : undefined, y: hasGroups ? (groupCenters[n.groupKey || n.vaultName || 'default'] || {y:0}).y + (Math.random() - 0.5) * 80 : undefined };
        });
        var edges = (data.edges || []).map(function(e, i) {
            var fromNode = data.nodes.find(function(n) { return (n.id || n.path) === e.from; });
            var toNode = data.nodes.find(function(n) { return (n.id || n.path) === e.to; });
            var isIntraVault = fromNode && toNode && fromNode.vaultName && fromNode.vaultName === toNode.vaultName;
            return {
                id: 'e' + i,
                from: e.from,
                to: e.to,
                type: e.type || 'wikilink',
                title: e.context || e.label || undefined,
                color: getEdgeColor(e.type || 'wikilink'),
                dashes: e.type === 'tag' ? [5, 5] : false,
                width: 1.5
            };
        });
        container.innerHTML = '';
        var nodesDS = new vis.DataSet(nodes);
        var edgesDS = new vis.DataSet(edges);
        var physicsOptions = hasGroups ? {
            solver: 'barnesHut',
            barnesHut: {
                gravitationalConstant: -1200,
                centralGravity: 0.5,
                springLength: 120,
                springConstant: 0.06,
                damping: 0.4,
                avoidOverlap: 0.1
            },
            stabilization: { iterations: 200, updateInterval: 50 },
            minVelocity: 1.5,
            maxVelocity: 30
        } : {
            solver: 'barnesHut',
            barnesHut: {
                gravitationalConstant: -800,
                centralGravity: 0.5,
                springLength: 95,
                springConstant: 0.06,
                damping: 0.4,
                avoidOverlap: 0.1
            },
            stabilization: { iterations: 200, updateInterval: 50 },
            minVelocity: 1.5,
            maxVelocity: 30
        };
        var options = { nodes: { color: graphNodeColor('#89b4fa'), shape: 'dot', size: 20, borderWidth: 2, borderWidthSelected: 4, font: { color: 'transparent', size: 11 } }, edges: { color: { color: '#585b70', highlight: '#89b4fa', hover: '#89b4fa' }, width: 1.5, arrows: { to: { enabled: false } }, smooth: false, font: { color: 'transparent', size: 10, strokeWidth: 0 } }, physics: physicsOptions, interaction: { hover: true, tooltipDelay: 300000, navigationButtons: false, keyboard: true, dragNodes: true } };
        var network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, options);
        graphNetwork = network;
        network._nodesDS = nodesDS; network._edgesDS = edgesDS; network._allNodes = nodes; network._allEdges = edges;
        network.on('dragStart', function(params) {
            if (params.nodes.length > 0) {
                nodesDS.update({ id: params.nodes[0], fixed: false });
            }
        });
        network.on('dragEnd', function(params) {
            if (params.nodes.length > 0) {
                var nodeId = params.nodes[0];
                var pos = network.getPositions([nodeId]);
                nodesDS.update({ id: nodeId, x: pos[nodeId].x, y: pos[nodeId].y, fixed: { x: true, y: true } });
            }
        });
        network.on('click', function(params) {
            if (params.nodes.length > 0) {
                var nodeId = params.nodes[0];
                if (selectedGraphNode === nodeId) {
                    hideGraphTooltip();
                    resetGraphHighlight();
                    selectedGraphNode = null;
                    var node = nodesDS.get(nodeId);
                    var filePath = node ? (node.path || nodeId.split(':').slice(1).join(':')) : nodeId;
                    if (!filePath.endsWith('.md')) filePath += '.md';
                    switchContentTab('preview');
                    openVaultFile(filePath, node && node.vault ? node.vault : currentVault);
                    return;
                }
                selectedGraphNode = nodeId;
                highlightGraphConnections(nodeId);
                showGraphTooltip(nodeId, params.pointer.DOM);
            } else if (params.edges.length > 0) {
                hideGraphTooltip();
                resetGraphHighlight();
                selectedGraphNode = null;
                var edgeId = params.edges[0];
                var edge = edgesDS.get(edgeId);
                if (edge && edge.type === 'tag' && edge.title) {
                    edgesDS.update({
                        id: edgeId,
                        label: edge.title,
                        font: { color: '#f9e2af', size: 11, strokeWidth: 3, strokeColor: '#1e1e2e' }
                    });
                    setTimeout(function() {
                        edgesDS.update({
                            id: edgeId,
                            label: '',
                            font: { color: 'transparent', size: 10, strokeWidth: 0, strokeColor: 'transparent' }
                        });
                    }, 3000);
                }
            } else {
                hideGraphTooltip();
                resetGraphHighlight();
                selectedGraphNode = null;
            }
        });
        network.on('doubleClick', function(params) {
            if (params.nodes.length > 0) {
                var nodeId = params.nodes[0];
                hideGraphTooltip();
                resetGraphHighlight();
                selectedGraphNode = null;
                var node = nodesDS.get(nodeId);
                var filePath = node ? (node.path || nodeId.split(':').slice(1).join(':')) : nodeId;
                if (!filePath.endsWith('.md')) filePath += '.md';
                switchContentTab('preview');
                openVaultFile(filePath, node && node.vault ? node.vault : currentVault);
            }
        });
        network.on('hoverNode', function(params) {
            if (selectedGraphNode) return;
            var nodeId = params.node;
            var connectedNodes = network.getConnectedNodes(nodeId);
            var connectedEdges = network.getConnectedEdges(nodeId);
            var connectedEdgeSet = {};
            connectedEdges.forEach(function(eid) { connectedEdgeSet[eid] = true; });
            nodesDS.forEach(function(n) {
                var isConnected = n.id === nodeId || connectedNodes.indexOf(n.id) !== -1;
                nodesDS.update({ id: n.id, opacity: isConnected ? 1 : 0.2, font: { color: isConnected ? '#cdd6f4' : 'transparent', size: 11 } });
            });
            edgesDS.forEach(function(e) {
                edgesDS.update({ id: e.id, color: { color: connectedEdgeSet[e.id] ? '#89b4fa' : 'rgba(88,91,112,0.1)' }, width: connectedEdgeSet[e.id] ? 2.5 : 0.5, font: { color: 'transparent', size: 10, strokeWidth: 0, strokeColor: 'transparent' } });
            });
        });
        network.on('blurNode', function() {
            if (selectedGraphNode) return;
            nodesDS.forEach(function(n) {
                nodesDS.update({ id: n.id, opacity: 1, font: { color: 'transparent', size: 11 } });
            });
            edgesDS.forEach(function(e) {
                edgesDS.update({ id: e.id, color: { color: '#585b70' }, width: 1.5, font: { color: 'transparent', size: 10, strokeWidth: 0, strokeColor: 'transparent' } });
            });
        });
        setTimeout(function() { if (network) network.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } }); }, 0);
    }
    function showGraphTooltip(nodeId, position) {
        hideGraphTooltip();
        if (!graphNetwork) return;
        var node = graphNetwork._nodesDS.get(nodeId);
        if (!node) return;
        var connections = graphNetwork.getConnectedNodes(nodeId);
        var connectedEdges = graphNetwork.getConnectedEdges(nodeId);
        var edgeTypes = { wikilink: 0, tag: 0 };
        connectedEdges.forEach(function(eid) {
            var edge = graphNetwork._edgesDS.get(eid);
            if (edge && edge.type) edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
        });
        var typeInfo = Object.entries(edgeTypes).filter(function(e) { return e[1] > 0; }).map(function(e) {
            return (e[0] === 'wikilink' ? '🔗' : '🏷️') + ' ' + e[1];
        }).join('  ');
        var tags = node.tags || [];
        var tooltip = document.createElement('div');
        tooltip.id = 'graphTooltip';
        tooltip.className = 'graph-tooltip';
        tooltip.innerHTML = '<button onclick="hideGraphTooltip()" style="position:absolute;top:4px;right:8px;background:none;border:none;color:#6c7086;cursor:pointer;font-size:14px;">✕</button>' +
        '<div class="graph-tooltip-title">📄 ' + (node.label || node.id) + '</div>' +
        '<div class="graph-tooltip-path">' + (node.path || node.id) + '</div>' +
        '<div class="graph-tooltip-meta">' +
            (tags.length > 0 ? '<div class="graph-tooltip-tags">' + tags.map(function(t) { return '<span class="graph-tooltip-tag">#' + t + '</span>'; }).join(' ') + '</div>' : '') +
            '<div class="graph-tooltip-connections">' + typeInfo + '  (共 ' + connections.length + ' 个连接)</div>' +
            (node.group && node.group !== '.' ? '<div class="graph-tooltip-group">📁 ' + node.group + '</div>' : '') +
            '</div>' +
            '<div class="graph-tooltip-hint">再次点击打开文档</div>';
        var container = document.getElementById('graphCanvas');
        if (!container) return;
        container.style.position = 'relative';
        tooltip.style.position = 'absolute';
        tooltip.style.right = '8px';
        tooltip.style.top = '8px';
        tooltip.style.left = 'auto';
        container.appendChild(tooltip);
        graphTooltipEl = tooltip;
        requestAnimationFrame(function() { tooltip.classList.add('show'); });
    }
    function hideGraphTooltip() {
        var el = document.getElementById('graphTooltip');
        if (el) el.remove();
        graphTooltipEl = null;
    }
    function highlightGraphConnections(nodeId) {
        if (!graphNetwork) return;
        var connected = graphNetwork.getConnectedNodes(nodeId);
        var connectedEdges = graphNetwork.getConnectedEdges(nodeId);
        var connectedEdgeSet = {};
        connectedEdges.forEach(function(eid) { connectedEdgeSet[eid] = true; });
        graphNetwork._nodesDS.forEach(function(n) {
            var isClicked = n.id === nodeId;
            var isConnected = connected.indexOf(n.id) !== -1;
            var isHighlighted = isClicked || isConnected;
            graphNetwork._nodesDS.update({
                id: n.id,
                opacity: isHighlighted ? 1 : 0.2,
                font: { color: isHighlighted ? '#cdd6f4' : 'transparent', size: isClicked ? 14 : (isConnected ? 12 : 11) },
                borderWidth: isClicked ? 4 : 2
            });
        });
        graphNetwork._edgesDS.forEach(function(e) {
            var isHighlighted = connectedEdgeSet[e.id];
            graphNetwork._edgesDS.update({
                id: e.id,
                color: isHighlighted ? { color: '#89b4fa', highlight: '#89b4fa' } : { color: '#313244' },
                width: isHighlighted ? 3 : 0.5,
                label: (isHighlighted && e.type === 'tag') ? (e.title || '') : '',
                font: (isHighlighted && e.type === 'tag') ? { color: '#f9e2af', size: 11, strokeWidth: 5, strokeColor: '#1e1e2e' } : { color: 'transparent', size: 10, strokeWidth: 0, strokeColor: 'transparent' }
            });
        });
    }
    function resetGraphHighlight() {
        if (!graphNetwork) return;
        graphNetwork._nodesDS.forEach(function(n) {
            graphNetwork._nodesDS.update({
                id: n.id,
                opacity: 1,
                font: { color: 'transparent', size: 11 },
                borderWidth: 2
            });
        });
        graphNetwork._edgesDS.forEach(function(e) {
            graphNetwork._edgesDS.update({
                id: e.id,
                color: { color: '#585b70', highlight: '#89b4fa' },
                width: 1.5,
                label: '',
                font: { color: 'transparent', size: 10, strokeWidth: 0, strokeColor: 'transparent', background: 'transparent' }
            });
        });
    }
    function updateGraphGrouping(value) {
        if (!graphNetwork || !graphNetwork._allNodes) return;
        var nodesDS = graphNetwork._nodesDS;
        graphNetwork._allNodes.forEach(function(n) { nodesDS.update({ id: n.id, color: { background: getNodeColor(n.path, value, n.tags || []), border: '#74c7ec', highlight: { background: '#f38ba8', border: '#f38ba8' }, hover: { background: '#a6e3a1', border: '#a6e3a1' } } }); });
    }
    function filterGraphBySearch(query) {
        if (!graphNetwork || !graphNetwork._allNodes) return;
        var nodesDS = graphNetwork._nodesDS;
        var q = (query || '').toLowerCase().trim();
        if (!q) {
            graphNetwork._allNodes.forEach(function(n) { nodesDS.update({ id: n.id, opacity: 1, font: { color: '#cdd6f4', size: 14 } }); });
            return;
        }
        graphNetwork._allNodes.forEach(function(n) {
            var match = (n.label || '').toLowerCase().indexOf(q) !== -1 || (n.path || '').toLowerCase().indexOf(q) !== -1 || (n.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) !== -1; });
            nodesDS.update({ id: n.id, opacity: match ? 1 : 0.15, font: { color: match ? '#f9e2af' : '#45475a', size: match ? 16 : 10 } });
        });
    }
    function filterGraphNodes(query) { filterGraphBySearch(query); }
    function setupGraphToolbar() {
        var tb = document.getElementById('graphToolbar');
        if (!tb) return;
        tb.className = 'graph-toolbar';
        var vaultOptions = '<option value="all">所有知识库</option>';
        savedVaultPaths.forEach(function(vp) {
            var name = vp.split('/').pop();
            vaultOptions += '<option value="' + escapeHtml(vp) + '">' + escapeHtml(name) + '</option>';
        });
        tb.innerHTML = '<input type="text" id="graphSearch" placeholder="搜索节点..." oninput="filterGraphBySearch(this.value)" class="graph-search-input">' +
            '<select id="graphVaultFilter" onchange="filterGraphByVault(this.value)" style="background:var(--item);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:12px;">' + vaultOptions + '</select>' +
            '<label class="graph-toggle"><input type="checkbox" id="graphShowOrphans" checked onchange="refreshGraph()"> 孤立</label>';
    }
    function setGraphMode(mode) {
        graphMode = mode;
        var globalBtn = document.getElementById('graphGlobalBtn');
        var localBtn = document.getElementById('graphLocalBtn');
        if (globalBtn) globalBtn.classList.toggle('active', mode === 'global');
        if (localBtn) localBtn.classList.toggle('active', mode === 'local');
        renderCurrentGraph();
    }
    function refreshGraph() {
        renderCurrentGraph();
    }
    function renderCurrentGraph() {
        var graphArea = document.getElementById('graphCanvas');
        if (!graphArea) {
            var container = document.getElementById('contentGraph');
            if (!container) return;
            graphArea = document.createElement('div');
            graphArea.id = 'graphCanvas';
            graphArea.style.cssText = 'flex:1;width:100%;position:relative;';
            container.appendChild(graphArea);
        }
        if (!graphData) { graphArea.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);">No graph data</div>'; return; }
        var displayNodes = graphData.nodes ? graphData.nodes.slice() : [];
        var displayEdges = graphData.edges ? graphData.edges.slice() : [];
        // Vault filter
        var vaultFilter = document.getElementById('graphVaultFilter');
        if (vaultFilter && vaultFilter.value !== 'all') {
            var filterVault = vaultFilter.value;
            displayNodes = displayNodes.filter(function(n) { return n.vault === filterVault; });
            var nodeIdSet = {};
            displayNodes.forEach(function(n) { nodeIdSet[n.id] = true; });
            displayEdges = displayEdges.filter(function(e) { return nodeIdSet[e.from] && nodeIdSet[e.to]; });
        }
        // Orphan filter
        var showOrphansEl = document.getElementById('graphShowOrphans');
        if (showOrphansEl && !showOrphansEl.checked) {
            var connectedIds = {};
            displayEdges.forEach(function(e) { connectedIds[e.from] = true; connectedIds[e.to] = true; });
            displayNodes = displayNodes.filter(function(n) { return connectedIds[n.id || n.path]; });
        }
        graphArea.style.cssText = '';
        initGraph(graphArea, { nodes: displayNodes, edges: displayEdges });
        renderGraphLegend(graphArea, { nodes: displayNodes, edges: displayEdges });
        setTimeout(function() { if (graphNetwork) graphNetwork.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } }); }, 300);
    }
    function renderGraphLegend(container, data) {
        var existing = container.querySelector('.graph-legend');
        if (existing) existing.remove();
        var legend = document.createElement('div');
        legend.className = 'graph-legend';
        // Group colors (vault+subdirectory)
        var vaults = {};
        (data.nodes || []).forEach(function(n) {
            var gKey = n.groupKey || n.vaultName;
            if (gKey && n.color && !vaults[gKey]) {
                var colorVal = typeof n.color === 'string' ? n.color : (n.color.background || '#89b4fa');
                var displayName = gKey.replace(/\/\.$/, '');
                vaults[displayName] = colorVal;
            }
        });
        var html = '<div class="graph-legend-title">图例</div>';
        // Vault section
        if (Object.keys(vaults).length > 1) {
            html += '<div class="graph-legend-section"><span class="legend-section-label">知识库</span>';
            Object.entries(vaults).forEach(function(entry) {
                html += '<div class="legend-item"><span class="legend-dot" style="background:' + entry[1] + '"></span>' + entry[0] + '</div>';
            });
            html += '</div>';
        }
        // Edge types section
        html += '<div class="graph-legend-section"><span class="legend-section-label">连接类型</span>';
        html += '<div class="legend-item"><span class="legend-line" style="border-color:#89b4fa;border-style:solid;"></span>引用链接</div>';
        html += '<div class="legend-item"><span class="legend-line" style="border-color:#f9e2af;border-style:dashed;"></span>共享标签</div>';
        html += '</div>';
        legend.innerHTML = html;
        container.appendChild(legend);
    }
    function closeGraphModal() { var m = document.getElementById('graphModal'); if (m) m.classList.remove('show'); }

    function filterGraphByVault(vault) {
        if (!graphData) return;
        renderCurrentGraph();
    }


    function filterByTag(tagName) {
        if (savedVaultPaths.length === 0) { showToast('#' + tagName, 'info'); return; }
        var searchInput = document.getElementById('vaultSearchInput');
        if (searchInput) searchInput.value = '#' + tagName;
        var searchClearBtn = document.getElementById('searchClearBtn');
        if (searchClearBtn) searchClearBtn.style.display = '';
        // Fetch tags from all vaults
        var promises = savedVaultPaths.map(function(vp) {
            return fetch('/api/vault/tags?vault=' + encodeURIComponent(vp))
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var payload = data.data || data;
                    var tags = payload.tags || {};
                    return { vault: vp, files: (tags[tagName] || []).map(function(f) { f.vault = vp; return f; }) };
                })
                .catch(function() { return { vault: vp, files: [] }; });
        });
        Promise.all(promises).then(function(results) {
            var allFiles = [];
            results.forEach(function(r) { allFiles = allFiles.concat(r.files); });
            var filePaths = new Set(allFiles.map(function(f) { return f.path || f.name || ''; }));
            var items = document.querySelectorAll('#vaultRoots .vault-tree-item[data-path]');
            var folders = document.querySelectorAll('#vaultRoots .vault-tree-folder');
            var visiblePaths = new Set();
            items.forEach(function(el) {
                var p = el.dataset.path || '';
                var match = filePaths.has(p);
                el.style.display = match ? '' : 'none';
                if (match) {
                    var parent = el.closest('.vault-tree-folder');
                    while (parent) {
                        visiblePaths.add(parent);
                        parent.classList.add('open');
                        var icon = parent.querySelector(':scope > .vault-tree-item .tree-icon');
                        if (icon) icon.textContent = '\u25bc';
                        parent = parent.parentElement.closest('.vault-tree-folder');
                    }
                    var vr = el.closest('.vault-root');
                    if (vr) vr.classList.remove('collapsed');
                }
            });
            folders.forEach(function(f) {
                if (!visiblePaths.has(f)) {
                    var hasVisible = f.querySelector('.vault-tree-item[data-path]:not([style*="display: none"])');
                    f.style.display = hasVisible ? '' : 'none';
                } else { f.style.display = ''; }
            });
            var preview = document.getElementById('contentPreview');
            if (preview && allFiles.length > 0) {
                switchContentTab('preview');
                var html = '<div style="padding:16px;"><h3 style="color:var(--accent);margin:0 0 12px;">#' + escapeHtml(tagName) + ' <span style="color:var(--dim);font-weight:normal;">(' + allFiles.length + ' files)</span></h3><ul class="tag-file-list">';
                allFiles.forEach(function(f) {
                    var fv = f.vault || currentVault;
                    html += '<li onclick="openVaultFile(\'' + escapeHtml(f.path || f.name || '').replace(/'/g, "\\'") + '\', \'' + escapeHtml(fv).replace(/'/g, "\\'") + '\')">' + '\ud83d\udcc4 ' + escapeHtml(f.name || f.path || '') + '</li>';
                });
                html += '</ul></div>';
                preview.innerHTML = html;
            } else if (preview) {
                switchContentTab('preview');
                preview.innerHTML = '<div style="padding:16px;color:var(--dim);">No files with tag #' + escapeHtml(tagName) + '</div>';
            }
        });
    }

    // --- Search across all vaults ---
    function searchVault(query) {
        var q = query.toLowerCase().trim();
        var items = document.querySelectorAll('#vaultRoots .vault-tree-item[data-path]');
        var folders = document.querySelectorAll('#vaultRoots .vault-tree-folder');
        var vaultRoots = document.querySelectorAll('#vaultRoots .vault-root');
        if (!q) {
            items.forEach(function(el) { el.style.display = ''; });
            folders.forEach(function(f) { f.style.display = ''; });
            return;
        }
        var visiblePaths = new Set();
        items.forEach(function(el) {
            var p = (el.dataset.path || '').toLowerCase();
            var label = (el.querySelector('.tree-label') || {}).textContent || '';
            var match = p.includes(q) || label.toLowerCase().includes(q);
            el.style.display = match ? '' : 'none';
            if (match) {
                var parent = el.closest('.vault-tree-folder');
                while (parent) {
                    visiblePaths.add(parent);
                    parent.classList.add('open');
                    var icon = parent.querySelector(':scope > .vault-tree-item .tree-icon');
                    if (icon) icon.textContent = '\u25bc';
                    parent = parent.parentElement.closest('.vault-tree-folder');
                }
                var vr = el.closest('.vault-root');
                if (vr) vr.classList.remove('collapsed');
            }
        });
        folders.forEach(function(f) {
            if (!visiblePaths.has(f)) {
                var hasVisible = f.querySelector('.vault-tree-item[data-path]:not([style*="display: none"])');
                f.style.display = hasVisible ? '' : 'none';
            } else { f.style.display = ''; }
        });
    }

    // --- Tag Search ---
    var cachedTags = null;
    var cachedTagsVersion = null;

    async function onVaultSearch(query) {
        var suggestions = document.getElementById('tagSuggestions');
        var searchClearBtn = document.getElementById('searchClearBtn');
        if (searchClearBtn) searchClearBtn.style.display = query ? '' : 'none';
        if (query.startsWith('#')) {
            // Fetch tags from ALL vaults
            var vaultsKey = savedVaultPaths.join(',');
            if ((!cachedTags || cachedTagsVersion !== vaultsKey) && savedVaultPaths.length > 0) {
                cachedTagsVersion = vaultsKey;
                var allTags = {};
                for (var vi = 0; vi < savedVaultPaths.length; vi++) {
                    try {
                        var resp = await fetch('/api/vault/tags?vault=' + encodeURIComponent(savedVaultPaths[vi]));
                        var data = await resp.json();
                        var payload = data.data || data;
                        var tags = payload.tags || {};
                        Object.keys(tags).forEach(function(k) {
                            allTags[k] = (allTags[k] || 0) + (Array.isArray(tags[k]) ? tags[k].length : 1);
                        });
                    } catch(e) {}
                }
                cachedTags = Object.keys(allTags).map(function(k) { return { name: k, count: allTags[k] }; }).sort(function(a,b) { return b.count - a.count; });
            }
            var filter = query.slice(1).toLowerCase();
            var filtered = (cachedTags || []).filter(function(t) {
                return t.name.toLowerCase().includes(filter);
            });
            if (filtered.length > 0) {
                suggestions.innerHTML = filtered.map(function(t) {
                    return '<div class="tag-suggestion-item" onclick="filterByTag(\'' + t.name.replace(/'/g, "\\'") + '\'); document.getElementById(\'tagSuggestions\').style.display=\'none\';">' +
                        '<span class="tag-name">#' + escapeHtml(t.name) + '</span>' +
                        '<span class="tag-count">' + t.count + ' files</span></div>';
                }).join('');
                suggestions.style.display = '';
            } else {
                suggestions.style.display = 'none';
            }
        } else {
            suggestions.style.display = 'none';
            searchVault(query);
        }
    }

    function clearVaultSearch() {
        var input = document.getElementById('vaultSearchInput');
        if (input) input.value = '';
        onVaultSearch('');
        var clearBtn = document.getElementById('searchClearBtn');
        if (clearBtn) clearBtn.style.display = 'none';
        var suggestions = document.getElementById('tagSuggestions');
        if (suggestions) suggestions.style.display = 'none';
    }

    // --- Document CRUD ---
    async function saveVaultFile() {
        if (!currentVault || !currentFile) return;
        var content = document.getElementById('vaultEditor').value;
        // Auto-update the 'updated' date in frontmatter
        var today = new Date().toISOString().split('T')[0];
        if (content.match(/^---[\s\S]*?---/)) {
            if (content.match(/^---[\s\S]*?updated:/m)) {
                content = content.replace(/(updated:\s*).*/m, '$1' + today);
            } else {
                // Add updated field before the closing ---
                content = content.replace(/\n---/, '\nupdated: ' + today + '\n---');
            }
        }
        try {
            var resp = await fetch('/api/vault/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault: currentVault, file: currentFile, content: content })
            });
            var data = await resp.json();
            if (data.success) {
                showToast('已保存', 'success');
                currentFileRaw = content;
                switchContentTab('preview');
                openVaultFile(currentFile, currentVault);
            } else {
                showToast('保存失败: ' + (data.error || ''), 'error');
            }
        } catch(e) {
            showToast('保存失败: ' + e.message, 'error');
        }
    }

    async function createVaultFile() {
        if (!currentVault) { showToast('请先选择 Vault', 'warning'); return; }
        var fileName = prompt('文件名 (例如: notes/my-note.md):');
        if (!fileName) return;
        if (!fileName.endsWith('.md')) fileName += '.md';
        try {
            var resp = await fetch('/api/vault/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault: currentVault, file: fileName, content: '# ' + fileName.replace(/\.md$/, '').split('/').pop() + '\n\n' })
            });
            var data = await resp.json();
            if (data.success) {
                showToast('文件已创建', 'success');
                await loadAllVaults();
                openVaultFile(fileName, currentVault);
            } else {
                showToast('创建失败: ' + (data.error || ''), 'error');
            }
        } catch(e) { showToast('创建失败: ' + e.message, 'error'); }
    }

    async function deleteVaultFile() {
        if (!currentVault || !currentFile) return;
        if (!confirm('确定删除 ' + currentFile + '？此操作不可撤销。')) return;
        try {
            var resp = await fetch('/api/vault/file', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault: currentVault, file: currentFile })
            });
            var data = await resp.json();
            if (data.success) {
                showToast('文件已删除', 'success');
                currentFile = null;
                currentFileRaw = '';
                switchContentTab('preview');
                document.getElementById('contentPreview').innerHTML = '<div class="vault-empty-state"><div class="empty-icon">📑</div><p>选择文件开始浏览</p></div>';
                await loadAllVaults();
            } else {
                showToast('删除失败: ' + (data.error || ''), 'error');
            }
        } catch(e) { showToast('删除失败: ' + e.message, 'error'); }
    }

    // Ctrl+S save in editor
    (function() {
        var ed = document.getElementById('vaultEditor');
        if (ed) ed.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveVaultFile(); }
        });
    })();

    // Close tag suggestions on outside click
    document.addEventListener('click', function(e) {
        var sug = document.getElementById('tagSuggestions');
        if (sug && !sug.contains(e.target) && e.target.id !== 'vaultSearchInput') {
            sug.style.display = 'none';
        }
    });

    // --- Collapsible Panel Toggle ---
    function togglePanel(name) {
        var capName = name.charAt(0).toUpperCase() + name.slice(1);
        var body = document.getElementById('panel' + capName);
        var arrow = document.getElementById('panel' + capName + 'Arrow');
        if (!body) return;
        var isCollapsed = body.classList.contains('collapsed');
        body.classList.toggle('collapsed');
        if (arrow) arrow.textContent = isCollapsed ? '▼' : '▶';
    }
    function toggleFrontmatterCollapse() {
        var block = document.getElementById('frontmatterBlock');
        var display = document.getElementById('frontmatterDisplay');
        if (block && display) {
            block.classList.toggle('collapsed');
            display.classList.toggle('collapsed');
        }
    }

    // --- Content Tab Switching ---
    function switchContentTab(tab) {
        var previewEl = document.getElementById('contentPreview');
        var editEl = document.getElementById('contentEdit');
        var graphEl = document.getElementById('contentGraph');
        var tabPreviewBtn = document.getElementById('tabPreview');
        var tabEditBtn = document.getElementById('tabEdit');
        var tabGraphBtn = document.getElementById('tabGraph');
        if (previewEl) previewEl.style.display = tab === 'preview' ? '' : 'none';
        if (editEl) editEl.style.display = tab === 'edit' ? 'flex' : 'none';
        if (graphEl) graphEl.style.display = tab === 'graph' ? 'flex' : 'none';
        if (tabPreviewBtn) tabPreviewBtn.classList.toggle('active', tab === 'preview');
        if (tabEditBtn) tabEditBtn.classList.toggle('active', tab === 'edit');
        if (tabGraphBtn) tabGraphBtn.classList.toggle('active', tab === 'graph');
        if (tab === 'graph') { loadContentGraph(); }
        if (tab === 'edit') {
            var editor = document.getElementById('vaultEditor');
            if (editor) { editor.value = currentFileRaw || ''; editor.focus(); }
        }
    }

    // --- Content Area Graph ---
    async function loadContentGraph() {
        var container = document.getElementById('contentGraph');
        if (!container || savedVaultPaths.length === 0) return;
        container.innerHTML = '';
        var tb = document.createElement('div'); tb.id = 'graphToolbar'; container.appendChild(tb);
        setupGraphToolbar();
        var graphArea = document.createElement('div');
        graphArea.id = 'graphCanvas';
        graphArea.style.cssText = 'flex:1;width:100%;position:relative;';
        container.appendChild(graphArea);
        graphArea.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="graph-spinner"></div></div>';
        try {
            var results = await Promise.all(savedVaultPaths.map(function(vp) {
                return fetch('/api/vault/graph?vault=' + encodeURIComponent(vp))
                    .then(function(r) { return r.json(); })
                    .then(function(data) { return { vault: vp, data: data.data || data }; })
                    .catch(function() { return { vault: vp, data: { nodes: [], edges: [] } }; });
            }));
            var allNodes = [], allEdges = [], nodeIds = {};
            results.forEach(function(r, vaultIndex) {
                var vaultName = r.vault.split('/').pop();
                var groupColors = {};
                var groupIndex = 0;
                (r.data.nodes || []).forEach(function(n) {
                    var uniqueId = vaultName + ':' + n.id;
                    if (!nodeIds[uniqueId]) {
                        nodeIds[uniqueId] = true;
                        n.id = uniqueId;
                        n.label = n.label || n.id;
                        n.vault = r.vault;
                        n.vaultName = vaultName;
                        // Color by vault+group (subdirectory)
                        var groupKey = vaultName + '/' + (n.group || '.');
                        if (!groupColors[groupKey]) {
                            groupColors[groupKey] = VAULT_COLORS[(vaultIndex * 3 + groupIndex) % VAULT_COLORS.length];
                            groupIndex++;
                        }
                        n.color = groupColors[groupKey];
                        n.groupKey = groupKey;
                        n.vaultIndex = vaultIndex;
                        allNodes.push(n);
                    }
                });
                (r.data.edges || []).forEach(function(e) {
                    allEdges.push({ from: vaultName + ':' + e.from, to: vaultName + ':' + e.to, type: e.type || 'wikilink', label: e.label || undefined, context: e.context || '', weight: e.weight || 1 });
                });
            });
            graphData = { nodes: allNodes, edges: allEdges };
            renderCurrentGraph();
        } catch(e) {
            if (graphArea) graphArea.innerHTML = '<div style="text-align:center;color:var(--dim);padding:20px;">Failed: ' + (e.message || e) + '</div>';
        }
    }


    function toggleVaultSidebar() {
        var sidebar = document.getElementById('vaultSidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
    }

    function jumpToVaultPath(vaultPath) {
        goBack();
        loadFiles(vaultPath);
    }

    async function createVaultFileInVault(vaultPath) {
        var fileName = prompt('新建文档 (例如: notes/my-note.md):');
        if (!fileName) return;
        if (!fileName.endsWith('.md')) fileName += '.md';
        try {
            var resp = await fetch('/api/vault/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault: vaultPath, file: fileName, content: '# ' + fileName.replace(/\.md$/, '').split('/').pop() + '\n\n' })
            });
            var data = await resp.json();
            if (data.success) {
                showToast('文件已创建', 'success');
                await loadAllVaults();
                openVaultFile(fileName, vaultPath);
            } else {
                showToast('创建失败: ' + (data.error || ''), 'error');
            }
        } catch(e) { showToast('创建失败: ' + e.message, 'error'); }
    }

    // --- Public API ---
    global.showVaultView = showVaultView;
    global.toggleVaultRoot = toggleVaultRoot;
    global.removeVault = removeVault;
    global.toggleDirBrowser = toggleDirBrowser;
    global.closeDirBrowser = closeDirBrowser;
    global.browseTo = browseTo;
    global.dirBrowserUp = dirBrowserUp;
    global.dirBrowserSelect = dirBrowserSelect;
    global.openVaultFile = openVaultFile;
    global.toggleVaultSidebar = toggleVaultSidebar;
    global.showGraph = showGraph;
    global.switchGraphVault = switchGraphVault;
    global.loadGraphForVault = loadGraphForVault;
    global.closeGraphModal = closeGraphModal;
    global.filterByTag = filterByTag;
    global.switchInfoTab = switchInfoTab;
    global.searchVault = searchVault;
    global.onVaultSearch = onVaultSearch;
    global.clearVaultSearch = clearVaultSearch;
    global.updateGraphGrouping = updateGraphGrouping;
    global.filterGraphNodes = filterGraphNodes;
    global.filterGraphBySearch = filterGraphBySearch;
    global.setGraphMode = setGraphMode;
    global.refreshGraph = refreshGraph;
    global.filterGraphByVault = filterGraphByVault;
    global.setupGraphToolbar = setupGraphToolbar;
    global.togglePanel = togglePanel;
    global.loadContentGraph = loadContentGraph;
    global.switchContentTab = switchContentTab;
    global.saveVaultFile = saveVaultFile;
    global.createVaultFile = createVaultFile;
    global.deleteVaultFile = deleteVaultFile;
    global.jumpToVaultPath = jumpToVaultPath;
    global.createVaultFileInVault = createVaultFileInVault;
    global.toggleFrontmatterCollapse = toggleFrontmatterCollapse;

    global.VaultModule = {
        showVaultView: showVaultView,
        openVaultFile: openVaultFile,
        showGraph: showGraph,
        filterByTag: filterByTag,
        togglePanel: togglePanel,
        switchContentTab: switchContentTab,
        loadContentGraph: loadContentGraph,
        saveVaultFile: saveVaultFile,
        createVaultFile: createVaultFile,
        deleteVaultFile: deleteVaultFile,
        get currentVault() { return currentVault; }
    };

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var gm = document.getElementById('graphModal');
            if (gm && gm.classList.contains('show')) {
                closeGraphModal(); e.preventDefault(); return;
            }
            var db = document.getElementById('dirBrowser');
            if (db && db.style.display !== 'none') {
                closeDirBrowser(); e.preventDefault(); return;
            }
        }
        if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !e.ctrlKey && !e.metaKey)) {
            var searchInput = document.getElementById('vaultSearchInput');
            var vaultView = document.querySelector('.vault-view');
            if (searchInput && vaultView && vaultView.offsetParent !== null) {
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                    if (e.key === '/') return;
                }
                e.preventDefault(); searchInput.focus(); searchInput.select();
            }
        }
    });

    document.addEventListener('click', function(e) {
        var suggestions = document.getElementById('tagSuggestions');
        var searchInput = document.getElementById('vaultSearchInput');
        if (suggestions && suggestions.style.display !== 'none') {
            if (!suggestions.contains(e.target) && e.target !== searchInput) {
                suggestions.style.display = 'none';
            }
        }
    });

})(window);
