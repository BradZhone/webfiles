// obsidian-markdown.js - File preview optimization, Obsidian markdown enhancements
// ========== 文件预览优化 ==========
// Office文件预览（使用微软Office Online查看器）
function getOfficePreviewUrl(fileUrl, fileType) {
    const encodedUrl = encodeURIComponent(fileUrl);
    if (fileType === 'doc' || fileType === 'docx' || fileType === 'xls' || fileType === 'xlsx' || fileType === 'ppt' || fileType === 'pptx') {
        return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
    }
    return null;
}

// 代码文件语法高亮预览
function highlightCode(code, language) {
    // 简单的语法高亮
    const keywords = {
        javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'async', 'await', 'try', 'catch'],
        python: ['def', 'class', 'import', 'from', 'return', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 'with', 'as', 'async', 'await'],
        go: ['func', 'package', 'import', 'return', 'if', 'else', 'for', 'range', 'struct', 'interface', 'go', 'defer', 'chan', 'select', 'case'],
        rust: ['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'return', 'if', 'else', 'match', 'loop', 'while', 'for'],
        java: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'new', 'static', 'final']
    };

    const kw = keywords[language] || [];
    let highlighted = escapeHtml(code);

    // 高亮字符串
    highlighted = highlighted.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span style="color:#a5d6ff">$&</span>');

    // 高亮注释
    highlighted = highlighted.replace(/(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm, '<span style="color:#6e7681">$&</span>');

    // 高亮关键字
    kw.forEach(k => {
        const regex = new RegExp(`\\b(${k})\\b`, 'g');
        highlighted = highlighted.replace(regex, '<span style="color:#ff7b72">$1</span>');
    });

    // 高亮数字
    highlighted = highlighted.replace(/\b(\d+)\b/g, '<span style="color:#79c0ff">$1</span>');

    return highlighted;
}

// 增强文件打开函数，支持更多文件类型
const originalOpenFile = openFile;
openFile = async function(path, type) {
    const ext = path.split('.').pop().toLowerCase();

    // Office文件预览（需要公网访问）
    const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    if (officeExts.includes(ext)) {
        showToast('Office文件需要公网访问才能预览，建议下载查看', 'info');
        // 调用原始函数处理下载
        return originalOpenFile(path, type);
    }

    // 代码文件预览增强
    const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'rb', 'php', 'lua', 'sql'];
    if (codeExts.includes(ext)) {
        return originalOpenFile(path, type);
    }

    // 其他文件类型使用原始函数
    return originalOpenFile(path, type);
};

// ========== Obsidian Markdown Enhancements ==========

// Initialize Obsidian Markdown enhancements
function initObsidianMarkdown() {
    // Initialize mermaid
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            themeVariables: {
                darkMode: true,
                background: '#1e1e2e',
                primaryColor: '#89b4fa'
            }
        });
    }

    // Wiki-Link extension: [[target]] or [[target|alias]]
    const wikiLinkExtension = {
        name: 'wikiLink',
        level: 'inline',
        start(src) { return src.indexOf('[['); },
        tokenizer(src) {
            const match = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src);
            if (match) {
                return {
                    type: 'wikiLink',
                    raw: match[0],
                    target: match[1].trim(),
                    alias: match[2] ? match[2].trim() : null
                };
            }
        },
        renderer(token) {
            const display = token.alias || token.target;
            const encoded = encodeURIComponent(token.target);
            return `<a class="wiki-link" href="javascript:void(0)" data-target="${encoded}" onclick="openWikiLink('${encoded}')">${display}</a>`;
        }
    };

    // Callout extension: > [!type] title
    const calloutExtension = {
        name: 'callout',
        level: 'block',
        start(src) { return src.indexOf('> [!'); },
        tokenizer(src) {
            let token;
            const match = /^> \[!(\w+)\]\s*(.*?)\n((?:>.*\n?)*)/.exec(src);
            if (match) {
                const type = match[1].toLowerCase();
                const title = match[2].trim();
                const body = match[3].split('\n').map(line => line.replace(/^>\s?/, '')).join('\n').trim();
                const defaultTitles = {
                    note: '笔记', info: '信息', tip: '提示',
                    warning: '警告', danger: '危险', quote: '引用', example: '示例'
                };
                token = {
                    type: 'callout',
                    raw: match[0],
                    calloutType: type,
                    calloutTitle: title || defaultTitles[type] || type,
                    calloutBody: body,
                    tokens: []
                };
                this.lexer.blockTokens(body, token.tokens);
                return token;
            }
        },
        renderer(token) {
            const bodyHtml = this.parser.parse(token.tokens);
            return `<div class="callout callout-${token.calloutType}"><div class="callout-title">${token.calloutTitle}</div><div class="callout-body">${bodyHtml}</div></div>`;
        }
    };

    // Tag extension: #tag (not markdown headings)
    const tagExtension = {
        name: 'obsidianTag',
        level: 'inline',
        start(src) {
            const idx = src.indexOf('#');
            return idx;
        },
        tokenizer(src) {
            // Match #tag or #nested/tag, but NOT markdown headings
            const match = /(?:^|[\s(])(#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5/]*))/.exec(src);
            if (match && match.index === 0) {
                // At start of string - check if it's a heading
                if (/^#{1,6}\s/.test(src)) return;
            }
            if (match) {
                return {
                    type: 'obsidianTag',
                    raw: match[1],
                    tagName: match[2]
                };
            }
        },
        renderer(token) {
            return `<span class="obsidian-tag" data-tag="${token.tagName}" onclick="filterByTag('${token.tagName}')">#${token.tagName}</span>`;
        }
    };

    // Embed extension: ![[file]] or ![[file#heading]]
    const embedExtension = {
        name: 'embed',
        level: 'inline',
        start(src) { return src.indexOf('![['); },
        tokenizer(src) {
            const match = /^!\[\[([^]#]+)(?:#([^]]+))?\]\]/.exec(src);
            if (match) {
                return {
                    type: 'embed',
                    raw: match[0],
                    file: match[1].trim(),
                    heading: match[2] ? match[2].trim() : null
                };
            }
        },
        renderer(token) {
            const ext = token.file.split('.').pop().toLowerCase();
            if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
                return `<img class="embed-image" src="/api/file?path=${encodeURIComponent(token.file)}" alt="${token.file}" loading="lazy" style="max-width:100%;border-radius:6px;">`;
            }
            return `<div class="embed-content" data-file="${encodeURIComponent(token.file)}" data-heading="${token.heading || ''}"><div class="embed-loading">加载 ${token.file}...</div></div>`;
        }
    };

    // Mermaid extension: ```mermaid blocks
    const mermaidExtension = {
        name: 'mermaidBlock',
        level: 'block',
        start(src) {
            const idx = src.indexOf('```mermaid');
            return idx !== -1 ? idx : -1;
        },
        tokenizer(src) {
            const match = /^```mermaid\n([\s\S]*?)```/.exec(src);
            if (match) {
                return {
                    type: 'mermaidBlock',
                    raw: match[0],
                    code: match[1].trim()
                };
            }
        },
        renderer(token) {
            const id = 'mermaid-' + Math.random().toString(36).slice(2, 9);
            return `<div class="mermaid-container" id="${id}" data-code="${encodeURIComponent(token.code)}"><div class="embed-loading">渲染图表中...</div></div>`;
        }
    };

    // Register all extensions
    marked.use({
        extensions: [wikiLinkExtension, calloutExtension, tagExtension, embedExtension, mermaidExtension]
    });

    // Custom code renderer with highlight.js
    const renderer = {
        code(token) {
            var code = typeof token === 'object' ? (token.text || token.raw || '') : token;
            var language = typeof token === 'object' ? (token.lang || '') : (arguments[1] || '');
            var lang = language || '';
            if (lang === 'mermaid' && typeof mermaid !== 'undefined') {
                var id = 'mermaid-' + Math.random().toString(36).slice(2, 9);
                return '<div class="mermaid-container" id="' + id + '" data-code="' + encodeURIComponent(code) + '"><div class="embed-loading">渲染图表中...</div></div>';
            }
            var highlighted;
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                highlighted = hljs.highlight(code, { language: lang }).value;
            } else if (typeof hljs !== 'undefined') {
                highlighted = hljs.highlightAuto(code).value;
            } else {
                highlighted = code;
            }
            return '<pre><code class="hljs language-' + lang + '">' + highlighted + '</code></pre>';
        }
    };
    marked.use({ renderer });
}

// Global wiki link handler
function openWikiLink(encodedTarget) {
    var target = decodeURIComponent(encodedTarget);
    var filePath = target;
    if (!filePath.endsWith('.md')) filePath += '.md';
    // Try current vault first
    var vault = window._currentVaultPath;
    if (vault) {
        openVaultFile(filePath, vault);
        return;
    }
    // Try all saved vaults from DOM
    var vaultRoots = document.querySelectorAll('.vault-root[data-vault]');
    for (var i = 0; i < vaultRoots.length; i++) {
        openVaultFile(filePath, vaultRoots[i].dataset.vault);
        return;
    }
    showToast('请先打开一个知识库', 'warning');
}

function mermaidZoom(btn, factor) {
    var content = btn.closest('.mermaid-wrapper').querySelector('.mermaid-content');
    var current = parseFloat(content.dataset.scale || '1');
    var newScale = Math.max(0.3, Math.min(3, current * factor));
    content.dataset.scale = newScale;
    content.style.transform = 'scale(' + newScale + ')';
}
function mermaidReset(btn) {
    var content = btn.closest('.mermaid-wrapper').querySelector('.mermaid-content');
    content.dataset.scale = '1';
    content.style.transform = 'scale(1)';
}
function mermaidFullscreen(btn) {
    var wrapper = btn.closest('.mermaid-container');
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        wrapper.requestFullscreen().catch(function() {});
    }
}

// Render mermaid diagrams after markdown render
async function renderMermaidDiagrams(container) {
    if (typeof mermaid === 'undefined') return;
    const els = container.querySelectorAll('.mermaid-container[data-code]');
    for (const el of els) {
        const code = decodeURIComponent(el.dataset.code);
        try {
            const { svg } = await mermaid.render(el.id + '-svg', code);
            el.innerHTML = '<div class="mermaid-wrapper">' +
                '<div class="mermaid-controls">' +
                '<button onclick="mermaidZoom(this, 1.2)" title="放大">🔍+</button>' +
                '<button onclick="mermaidZoom(this, 0.8)" title="缩小">🔍-</button>' +
                '<button onclick="mermaidReset(this)" title="重置">↺</button>' +
                '<button onclick="mermaidFullscreen(this)" title="全屏">⛶</button>' +
                '</div>' +
                '<div class="mermaid-viewport" style="overflow:auto;cursor:grab;">' +
                '<div class="mermaid-content" style="transform-origin:0 0;transition:transform 0.2s;">' + svg + '</div>' +
                '</div></div>';
            var viewport = el.querySelector('.mermaid-viewport');
            if (viewport) {
                (function(vp) {
                    var isDragging = false, startX, startY, sLeft, sTop;
                    vp.addEventListener('mousedown', function(e) { isDragging = true; startX = e.pageX; startY = e.pageY; sLeft = vp.scrollLeft; sTop = vp.scrollTop; vp.style.cursor = 'grabbing'; });
                    vp.addEventListener('mousemove', function(e) { if (!isDragging) return; e.preventDefault(); vp.scrollLeft = sLeft - (e.pageX - startX); vp.scrollTop = sTop - (e.pageY - startY); });
                    vp.addEventListener('mouseup', function() { isDragging = false; vp.style.cursor = 'grab'; });
                    vp.addEventListener('mouseleave', function() { isDragging = false; vp.style.cursor = 'grab'; });
                })(viewport);
            }
        } catch (e) {
            el.innerHTML = '<div class="embed-error">图表渲染失败: ' + e.message + '</div>';
        }
    }
}

// Render embed content after markdown render
async function loadEmbeds(container) {
    const embeds = container.querySelectorAll('.embed-content[data-file]');
    for (const el of embeds) {
        const file = decodeURIComponent(el.dataset.file);
        const heading = el.dataset.heading;
        try {
            const resp = await fetch('/api/vault/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file })
            });
            const data = await resp.json();
            let html = marked.parse(data.body || '');
            el.innerHTML = `<div class="embed-header">${file}</div>${html}`;
        } catch (e) {
            el.innerHTML = `<div class="embed-error">加载失败: ${file}</div>`;
        }
    }
}

// Tag filter handler (placeholder, can be extended)
// filterByTag moved to VaultModule

// Initialize Obsidian Markdown on page load
