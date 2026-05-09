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
            recalcAnnotationOffsets();
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

    // Recalculate annotation offsets using DOM positions after rendering
    function recalcAnnotationOffsets() {
        var preview = document.getElementById('contentPreview');
        if (!preview) return;

        currentAnnotations.forEach(function(ann) {
            var el = preview.querySelector('[data-ann-id="' + ann.id + '"]');
            if (el) {
                // Calculate offset from top of preview using element position
                ann._sortOffset = el.offsetTop * 10000 + el.offsetLeft;
            } else {
                // Not found in DOM — try text-based offset calculation
                var fullText = preview.textContent || '';
                var searchText = (ann.range || '').replace(/\\n/g, '\n').replace(/[\n\r\s]+/g, '');
                var normalizedFull = fullText.replace(/[\n\r\s]+/g, '');
                var idx = normalizedFull.indexOf(searchText.substring(0, 40));
                ann._sortOffset = idx >= 0 ? idx : 999999;
            }
        });
    }

    // Find and wrap text with highlight span (supports cross-paragraph)
    function highlightTextInElement(container, text, annId, color, comment) {
        if (!text || text.length < 3) return;
        
        // Normalize search text
        var searchText = text.replace(/\\n/g, '\n');
        var searchNormalized = searchText.replace(/[\n\r\s]+/g, '');  // Remove ALL whitespace for matching
        if (searchNormalized.length < 3) return;
        
        // Collect all text nodes
        var textNodes = [];
        var fullText = '';
        var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while (node = walker.nextNode()) {
            textNodes.push({ node: node, start: fullText.length, end: fullText.length + node.textContent.length });
            fullText += node.textContent;
        }
        
        // Build normalized fullText with position mapping back to original
        var normalizedFull = '';
        var normToOrig = [];  // normToOrig[i] = original fullText position of char at normalized index i
        for (var k = 0; k < fullText.length; k++) {
            var ch = fullText[k];
            if (!/[\n\r\s]/.test(ch)) {
                normToOrig.push(k);
                normalizedFull += ch;
            }
        }
        
        // Search in normalized text
        var normMatchIdx = normalizedFull.indexOf(searchNormalized);
        if (normMatchIdx === -1) {
            // Try shorter match (first 40 chars)
            var shortSearch = searchNormalized.substring(0, 40);
            if (shortSearch.length >= 3) normMatchIdx = normalizedFull.indexOf(shortSearch);
            if (normMatchIdx === -1) return;
            searchNormalized = shortSearch;
        }
        
        // Map normalized positions back to original fullText positions
        var matchStart = normToOrig[normMatchIdx];
        var matchEndNormIdx = normMatchIdx + searchNormalized.length - 1;
        var matchEnd = (matchEndNormIdx < normToOrig.length) ? normToOrig[matchEndNormIdx] + 1 : fullText.length;
        
        // Find which text nodes overlap with [matchStart, matchEnd) in original fullText
        var nodesToWrap = [];
        for (var i = 0; i < textNodes.length; i++) {
            var tn = textNodes[i];
            if (tn.end <= matchStart) continue;
            if (tn.start >= matchEnd) break;
            var startInNode = Math.max(0, matchStart - tn.start);
            var endInNode = Math.min(tn.node.textContent.length, matchEnd - tn.start);
            // Skip whitespace-only portions
            var portion = tn.node.textContent.substring(startInNode, endInNode);
            if (portion.trim().length === 0) continue;
            nodesToWrap.push({ node: tn.node, start: startInNode, end: endInNode });
        }
        
        // Wrap each overlapping portion (reverse order to preserve offsets)
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
                    span.onclick = function(e) { e.stopPropagation(); showAnnotationPopup(this); };
                } else {
                    span.onclick = function(e) {
                        e.stopPropagation();
                        var first = document.querySelector('[data-ann-id="' + annId + '"]');
                        if (first) showAnnotationPopup(first);
                    };
                }
                range.surroundContents(span);
            } catch (e) { /* skip DOM errors */ }
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

        // Calculate position in document
        var docOffset = 0;
        var preview = document.getElementById('contentPreview');
        if (preview && sel.rangeCount > 0) {
            var selRange = sel.getRangeAt(0);
            var walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, null, false);
            var node;
            var found = false;
            while (node = walker.nextNode()) {
                if (node === selRange.startContainer) {
                    docOffset += selRange.startOffset;
                    found = true;
                    break;
                }
                docOffset += node.textContent.length;
            }
            if (!found) docOffset = 0;
        }

        hideSelectionToolbar();

        if (type === 'comment') {
            showCommentInput(text, color, docOffset);
        } else {
            saveAnnotation(text, 'highlight', color, '', 0, docOffset, text.length);
        }

        if (sel) sel.removeAllRanges();
    };

    function showCommentInput(selectedText, color, docOffset) {
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
        inputBox.setAttribute('data-doc-offset', docOffset || 0);

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
        var docOffset = parseInt(box.getAttribute('data-doc-offset')) || 0;
        var comment = (document.getElementById('annCommentText') || {}).value || '';
        hideCommentInput();
        if (text) {
            saveAnnotation(text, 'comment', color, comment, 0, docOffset, text.length);
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

        // Sort by document position (offset field)
        var sorted = currentAnnotations.slice().sort(function(a, b) {
            return (a._sortOffset || a.offset || 0) - (b._sortOffset || b.offset || 0);
        });

        var html = '';
        sorted.forEach(function(ann) {
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
        showAnnotationConfirm('确定删除这条批注？', function() {
            deleteAnnotation(id);
        });
    };

    global.editAnnotationComment = function(id) {
        var ann = currentAnnotations.find(function(a) { return a.id === id; });
        if (!ann) return;
        hideAnnotationPopup();
        showEditCommentInput(ann);
    };

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showAnnotationConfirm(message, onConfirm) {
        hideAnnotationPopup();
        var overlay = document.createElement('div');
        overlay.id = 'annConfirmOverlay';
        overlay.className = 'ann-confirm-overlay';
        overlay.innerHTML =
            '<div class="ann-confirm-box">' +
            '<p class="ann-confirm-msg">' + message + '</p>' +
            '<div class="ann-confirm-actions">' +
            '<button class="ann-confirm-cancel" onclick="closeAnnotationConfirm()">取消</button>' +
            '<button class="ann-confirm-ok" id="annConfirmOk">确定</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        document.getElementById('annConfirmOk').onclick = function() {
            closeAnnotationConfirm();
            onConfirm();
        };
    }

    global.closeAnnotationConfirm = function() {
        var el = document.getElementById('annConfirmOverlay');
        if (el) el.remove();
    };

    function showEditCommentInput(ann) {
        hideCommentInput();
        var isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        var inputBox = document.createElement('div');
        inputBox.id = 'annotationCommentInput';
        inputBox.className = 'annotation-comment-input';
        inputBox.innerHTML =
            '<div class="ann-comment-header">✏️ 编辑评论</div>' +
            '<div class="ann-comment-quote">' + escapeHtml((ann.range || '').substring(0, 50)) + '</div>' +
            '<textarea id="annCommentText" placeholder="输入评论..." rows="3">' + escapeHtml(ann.comment || '') + '</textarea>' +
            '<div class="ann-comment-actions">' +
            '<button class="ann-comment-cancel" onclick="hideCommentInput()">取消</button>' +
            '<button class="ann-comment-save" id="annEditSaveBtn">保存</button>' +
            '</div>';
        inputBox.style.position = 'fixed';
        if (isMobile) {
            inputBox.style.top = '50px'; inputBox.style.left = '8px'; inputBox.style.right = '8px';
        } else {
            inputBox.style.top = '50%'; inputBox.style.left = '50%'; inputBox.style.transform = 'translate(-50%, -50%)'; inputBox.style.width = '320px';
        }
        inputBox.style.zIndex = '10000';
        document.body.appendChild(inputBox);
        document.getElementById('annEditSaveBtn').onclick = function() {
            var newComment = (document.getElementById('annCommentText') || {}).value || '';
            hideCommentInput();
            fetch('/api/vault/annotations/' + ann.id, {
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
        setTimeout(function() { var ta = document.getElementById('annCommentText'); if (ta) ta.focus(); }, 100);
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
