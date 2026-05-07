;(function(global) {
    'use strict';

    var currentAnnotations = [];
    var currentVault = null;
    var currentFile = null;

    // Load annotations for current file
    async function loadAnnotations(vault, file) {
        currentVault = vault;
        currentFile = file;
        try {
            var resp = await fetch('/api/vault/annotations?vault=' + encodeURIComponent(vault) + '&file=' + encodeURIComponent(file));
            var data = await resp.json();
            currentAnnotations = data.annotations || [];
            renderHighlights();
            renderAnnotationPanel();
            return currentAnnotations;
        } catch (e) {
            currentAnnotations = [];
            return [];
        }
    }

    // Save a new annotation
    async function saveAnnotation(range, type, color, comment, paragraph, offset, length) {
        var annotation = { range: range, type: type, color: color || 'yellow', comment: comment || '', paragraph: paragraph, offset: offset, length: length };
        try {
            var resp = await fetch('/api/vault/annotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault: currentVault, file: currentFile, annotation: annotation })
            });
            var data = await resp.json();
            if (data.success) {
                currentAnnotations.push(data.annotation);
                renderHighlights();
                renderAnnotationPanel();
                return data.annotation;
            }
        } catch (e) { console.error(e); }
        return null;
    }

    // Delete an annotation
    async function deleteAnnotation(id) {
        try {
            var resp = await fetch('/api/vault/annotations/' + id, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vault: currentVault, file: currentFile })
            });
            var data = await resp.json();
            if (data.success) {
                currentAnnotations = currentAnnotations.filter(function(a) { return a.id !== id; });
                renderHighlights();
                renderAnnotationPanel();
            }
        } catch (e) { console.error(e); }
    }

    // Render highlights in the preview content
    function renderHighlights() {
        var preview = document.getElementById('contentPreview');
        if (!preview) return;

        // Remove existing highlights
        preview.querySelectorAll('.annotation-highlight').forEach(function(el) {
            var parent = el.parentNode;
            while (el.firstChild) {
                parent.insertBefore(el.firstChild, el);
            }
            parent.removeChild(el);
            parent.normalize();
        });

        if (currentAnnotations.length === 0) return;

        // Apply highlights using text search
        currentAnnotations.forEach(function(ann) {
            if (!ann.range) return;
            highlightTextInElement(preview, ann.range, ann.id, ann.color || 'yellow', ann.comment);
        });
    }

    // Find and wrap text with highlight span
    function highlightTextInElement(container, text, annId, color, comment) {
        var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while (node = walker.nextNode()) {
            var idx = node.textContent.indexOf(text);
            if (idx !== -1) {
                var range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + text.length);
                var span = document.createElement('span');
                span.className = 'annotation-highlight annotation-' + color;
                span.setAttribute('data-ann-id', annId);
                span.setAttribute('data-comment', comment || '');
                span.title = comment || '';
                span.onclick = function(e) { e.stopPropagation(); showAnnotationPopup(this); };
                range.surroundContents(span);
                break;  // Only highlight first occurrence
            }
        }
    }

    // Show popup when clicking a highlight
    function showAnnotationPopup(el) {
        hideAnnotationPopup();
        var comment = el.getAttribute('data-comment');
        var annId = el.getAttribute('data-ann-id');
        if (!comment && !annId) return;

        var popup = document.createElement('div');
        popup.className = 'annotation-popup';
        popup.innerHTML = '<div class="annotation-popup-content">' +
            (comment ? '<p>' + escapeHtml(comment) + '</p>' : '<p class="annotation-no-comment">无评论</p>') +
            '</div><div class="annotation-popup-actions">' +
            '<button onclick="editAnnotationComment(\'' + annId + '\')">编辑</button>' +
            '<button onclick="deleteAnnotationById(\'' + annId + '\')">删除</button>' +
            '</div>';

        var rect = el.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
        popup.style.top = (rect.bottom + 5) + 'px';
        document.body.appendChild(popup);

        // Close on outside click
        setTimeout(function() {
            document.addEventListener('click', function handler(e) {
                if (!popup.contains(e.target)) {
                    hideAnnotationPopup();
                    document.removeEventListener('click', handler);
                }
            });
        }, 100);
    }

    function hideAnnotationPopup() {
        document.querySelectorAll('.annotation-popup').forEach(function(el) { el.remove(); });
    }

    // Medium-style floating toolbar on text selection
    function setupSelectionToolbar() {
        var preview = document.getElementById('contentPreview');
        if (!preview) return;

        // Remove old listeners if any
        if (preview._annMouseUp) {
            preview.removeEventListener('mouseup', preview._annMouseUp);
        }
        if (preview._annTouchEnd) {
            preview.removeEventListener('touchend', preview._annTouchEnd);
        }

        function handleSelectionEnd(e) {
            var sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                hideSelectionToolbar();
                return;
            }
            showSelectionToolbar(sel, e);
        }

        preview._annMouseUp = function(e) {
            setTimeout(function() { handleSelectionEnd(e); }, 10);
        };

        preview._annTouchEnd = function(e) {
            setTimeout(function() { handleSelectionEnd(e); }, 100);
        };

        preview.addEventListener('mouseup', preview._annMouseUp);
        preview.addEventListener('touchend', preview._annTouchEnd);

        // Hide on click outside
        document.addEventListener('mousedown', function(e) {
            var toolbar = document.getElementById('annotationToolbar');
            if (toolbar && !toolbar.contains(e.target)) {
                hideSelectionToolbar();
            }
        });
    }

    function showSelectionToolbar(selection, event) {
        hideSelectionToolbar();
        var text = selection.toString().trim();
        if (!text || text.length < 2) return;

        var toolbar = document.createElement('div');
        toolbar.id = 'annotationToolbar';
        toolbar.className = 'annotation-toolbar';

        var isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        toolbar.innerHTML =
            '<button class="ann-btn ann-highlight-btn" onclick="annotateSelection(\'highlight\', \'yellow\')">🖊 高亮</button>' +
            '<button class="ann-btn ann-comment-btn" onclick="annotateSelection(\'comment\', \'blue\')">💬 评论</button>' +
            (isMobile ? '<button class="ann-btn ann-cancel-btn" onclick="hideSelectionToolbar()">取消</button>' : '');

        if (isMobile) {
            // Fixed bottom bar on mobile
            toolbar.style.position = 'fixed';
            toolbar.style.bottom = '0';
            toolbar.style.left = '0';
            toolbar.style.right = '0';
            toolbar.style.top = 'auto';
            toolbar.style.borderRadius = '12px 12px 0 0';
            toolbar.style.justifyContent = 'center';
            toolbar.style.padding = '12px 16px';
            toolbar.style.boxShadow = '0 -4px 20px rgba(0,0,0,0.5)';
        } else {
            // Desktop: float above selection
            var range = selection.getRangeAt(0);
            var rect = range.getBoundingClientRect();
            toolbar.style.position = 'fixed';
            toolbar.style.left = Math.max(10, Math.min(rect.left + rect.width / 2 - 70, window.innerWidth - 160)) + 'px';
            toolbar.style.top = Math.max(10, rect.top - 44) + 'px';
        }

        document.body.appendChild(toolbar);
    }

    function hideSelectionToolbar() {
        var tb = document.getElementById('annotationToolbar');
        if (tb) tb.remove();
    }

    // Called when user clicks highlight or comment button
    global.annotateSelection = function(type, color) {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        var text = sel.toString().trim();
        if (!text) return;

        hideSelectionToolbar();

        if (type === 'comment') {
            var comment = prompt('添加评论:');
            if (comment === null) return;  // cancelled
            saveAnnotation(text, 'comment', color, comment, 0, 0, text.length);
        } else {
            saveAnnotation(text, 'highlight', color, '', 0, 0, text.length);
        }

        sel.removeAllRanges();
    };

    // Render the sidebar annotation panel
    function renderAnnotationPanel() {
        var panel = document.getElementById('annotationPanelBody');
        if (!panel) return;

        var countEl = document.getElementById('annotationCount');
        if (countEl) countEl.textContent = currentAnnotations.length;

        if (currentAnnotations.length === 0) {
            panel.innerHTML = '<div class="panel-empty" style="padding:8px 12px;font-size:11px;color:var(--dim);">暂无批注</div>';
            return;
        }

        var html = '';
        currentAnnotations.forEach(function(ann) {
            var shortText = (ann.range || '').substring(0, 30) + (ann.range && ann.range.length > 30 ? '...' : '');
            html += '<div class="annotation-panel-item annotation-' + (ann.color || 'yellow') + '" onclick="scrollToAnnotation(\'' + ann.id + '\')">';
            html += '<div class="annotation-panel-text">' + escapeHtml(shortText) + '</div>';
            if (ann.comment) html += '<div class="annotation-panel-comment">' + escapeHtml(ann.comment) + '</div>';
            html += '</div>';
        });
        panel.innerHTML = html;
    }

    // Scroll to annotation in preview
    global.scrollToAnnotation = function(annId) {
        var el = document.querySelector('[data-ann-id="' + annId + '"]');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('annotation-flash');
            setTimeout(function() { el.classList.remove('annotation-flash'); }, 1500);
        }
    };

    global.deleteAnnotationById = function(id) {
        if (confirm('删除这条批注？')) deleteAnnotation(id);
    };

    global.editAnnotationComment = function(id) {
        var ann = currentAnnotations.find(function(a) { return a.id === id; });
        if (!ann) return;
        var newComment = prompt('编辑评论:', ann.comment || '');
        if (newComment === null) return;
        hideAnnotationPopup();
        fetch('/api/vault/annotations/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vault: currentVault, file: currentFile, updates: { comment: newComment } })
        }).then(function(r) { return r.json(); }).then(function(data) {
            if (data.success) {
                ann.comment = newComment;
                renderHighlights();
                renderAnnotationPanel();
            }
        });
    };

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Word count display
    async function loadWordCount(vault, file) {
        try {
            var resp = await fetch('/api/vault/wordcount?vault=' + encodeURIComponent(vault) + '&file=' + encodeURIComponent(file));
            var data = await resp.json();
            var el = document.getElementById('vaultWordCount');
            if (el) {
                if (data.hasChinese) {
                    el.textContent = data.total.toLocaleString() + ' 字';
                } else {
                    el.textContent = data.total.toLocaleString() + ' words';
                }
            }
        } catch (e) {}
    }

    // Initialize on file open
    global.initAnnotations = function(vault, file) {
        loadAnnotations(vault, file);
        loadWordCount(vault, file);
        setupSelectionToolbar();
    };

    global.AnnotationModule = {
        load: loadAnnotations,
        render: renderHighlights,
        setup: setupSelectionToolbar
    };

})(window);
