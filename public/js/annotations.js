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

    // Find and wrap text with highlight span (supports cross-paragraph)
    function highlightTextInElement(container, text, annId, color, comment) {
        if (!text || text.length < 3) return;
        
        // Normalize search text — replace literal \n from JSON, then remove all newlines for matching
        var searchText = text.replace(/\\n/g, '\n');
        var searchNormalized = searchText.replace(/[\n\r]/g, '');  // Remove newlines for DOM matching
        
        // Collect all text nodes with their positions in the full concatenated text
        var textNodes = [];
        var fullText = '';
        var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while (node = walker.nextNode()) {
            textNodes.push({ node: node, start: fullText.length, end: fullText.length + node.textContent.length });
            fullText += node.textContent;
        }
        
        // Search with normalized (no newlines) text
        var matchIdx = fullText.indexOf(searchNormalized);
        if (matchIdx === -1) {
            // Try matching just the first 60 chars
            var shortSearch = searchNormalized.substring(0, 60);
            if (shortSearch.length >= 3) matchIdx = fullText.indexOf(shortSearch);
            if (matchIdx === -1) return;
            searchNormalized = shortSearch;
        }
        
        var matchEnd = matchIdx + searchNormalized.length;
        
        // Find which text nodes overlap with [matchIdx, matchEnd)
        var nodesToWrap = [];
        for (var i = 0; i < textNodes.length; i++) {
            var tn = textNodes[i];
            if (tn.end <= matchIdx) continue;  // Before match
            if (tn.start >= matchEnd) break;   // After match
            // This node overlaps with the match
            var startInNode = Math.max(0, matchIdx - tn.start);
            var endInNode = Math.min(tn.node.textContent.length, matchEnd - tn.start);
            nodesToWrap.push({ node: tn.node, start: startInNode, end: endInNode });
        }
        
        // Wrap each overlapping portion (go in reverse to not break offsets)
        for (var j = nodesToWrap.length - 1; j >= 0; j--) {
            var info = nodesToWrap[j];
            try {
                var range = document.createRange();
                range.setStart(info.node, info.start);
                range.setEnd(info.node, info.end);
                var span = document.createElement('span');
                span.className = 'annotation-highlight annotation-' + color;
                span.setAttribute('data-ann-id', annId);
                span.setAttribute('data-comment', comment || '');
                if (j === 0) {
                    // Only first span gets click handler (to avoid duplicate popups)
                    span.onclick = function(e) { e.stopPropagation(); showAnnotationPopup(this); };
                } else {
                    span.onclick = function(e) {
                        e.stopPropagation();
                        // Find the first span with same ann-id and trigger its popup
                        var first = document.querySelector('[data-ann-id="' + annId + '"]');
                        if (first) showAnnotationPopup(first);
                    };
                }
                range.surroundContents(span);
            } catch (e) { /* skip DOM errors for this node */ }
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
            preview._annMouseUp = null;
        }
        if (preview._annTouchEnd) {
            preview.removeEventListener('touchend', preview._annTouchEnd);
            preview._annTouchEnd = null;
        }
        if (document._annSelChange) {
            document.removeEventListener('selectionchange', document._annSelChange);
        }
        
        var debounceTimer = null;
        
        document._annSelChange = function() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                var sel = window.getSelection();
                if (!sel || sel.isCollapsed || !sel.toString().trim() || sel.toString().trim().length < 2) {
                    // Don't hide immediately — user might still be selecting
                    return;
                }
                // Check if selection is within the preview
                if (sel.anchorNode && preview.contains(sel.anchorNode)) {
                    showSelectionToolbar(sel);
                }
            }, 400);
        };
        
        document.addEventListener('selectionchange', document._annSelChange);
        
        // Hide toolbar on mousedown outside toolbar (desktop)
        document.addEventListener('mousedown', function(e) {
            var toolbar = document.getElementById('annotationToolbar');
            if (toolbar && !toolbar.contains(e.target)) {
                hideSelectionToolbar();
            }
        });
        
        // Hide toolbar on touch outside (mobile)
        document.addEventListener('touchstart', function(e) {
            var toolbar = document.getElementById('annotationToolbar');
            if (toolbar && !toolbar.contains(e.target)) {
                // Delay hiding so that tapping toolbar buttons works
                setTimeout(function() {
                    var tb = document.getElementById('annotationToolbar');
                    if (tb && !tb.contains(document.activeElement)) {
                        hideSelectionToolbar();
                    }
                }, 200);
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
            // Fixed top bar on mobile (below the browser chrome, above content)
            toolbar.style.position = 'fixed';
            toolbar.style.top = '50px';  // Below browser address bar
            toolbar.style.left = '8px';
            toolbar.style.right = '8px';
            toolbar.style.bottom = 'auto';
            toolbar.style.borderRadius = '8px';
            toolbar.style.justifyContent = 'center';
            toolbar.style.padding = '10px 16px';
            toolbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
            toolbar.style.zIndex = '9999';
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
        var text = sel ? sel.toString().trim() : '';
        if (!text) return;

        hideSelectionToolbar();

        if (type === 'comment') {
            // Show inline comment input instead of prompt()
            showCommentInput(text, color);
        } else {
            saveAnnotation(text, 'highlight', color, '', 0, 0, text.length);
            if (sel) sel.removeAllRanges();
        }
    };

    function showCommentInput(selectedText, color) {
        hideCommentInput();
        var isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        var inputBox = document.createElement('div');
        inputBox.id = 'annotationCommentInput';
        inputBox.className = 'annotation-comment-input';
        inputBox.innerHTML =
            '<div class="ann-comment-header">💬 添加评论</div>' +
            '<div class="ann-comment-quote">' + escapeHtml(selectedText.substring(0, 50)) + (selectedText.length > 50 ? '...' : '') + '</div>' +
            '<textarea id="annCommentText" placeholder="输入评论..." rows="3"></textarea>' +
            '<div class="ann-comment-actions">' +
            '<button class="ann-comment-cancel" onclick="hideCommentInput()">取消</button>' +
            '<button class="ann-comment-save" onclick="saveCommentFromInput()">保存</button>' +
            '</div>';

        inputBox.style.position = 'fixed';
        if (isMobile) {
            inputBox.style.top = '50px';
            inputBox.style.left = '8px';
            inputBox.style.right = '8px';
        } else {
            inputBox.style.top = '50%';
            inputBox.style.left = '50%';
            inputBox.style.transform = 'translate(-50%, -50%)';
            inputBox.style.width = '320px';
        }
        inputBox.style.zIndex = '10000';

        // Store selected text for later save
        inputBox.setAttribute('data-selected-text', selectedText);
        inputBox.setAttribute('data-color', color);

        document.body.appendChild(inputBox);

        // Focus the textarea
        setTimeout(function() {
            var ta = document.getElementById('annCommentText');
            if (ta) ta.focus();
        }, 100);
    }

    function hideCommentInput() {
        var el = document.getElementById('annotationCommentInput');
        if (el) el.remove();
    }

    global.hideCommentInput = hideCommentInput;

    global.saveCommentFromInput = function() {
        var box = document.getElementById('annotationCommentInput');
        if (!box) return;
        var text = box.getAttribute('data-selected-text');
        var color = box.getAttribute('data-color') || 'blue';
        var comment = (document.getElementById('annCommentText') || {}).value || '';
        hideCommentInput();
        if (text) {
            saveAnnotation(text, 'comment', color, comment, 0, 0, text.length);
        }
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
