# Changelog

## [2.0.0] - 2026-04-23

### Added
- **Knowledge Base**: Obsidian-style vault browser with multi-vault support
- **Knowledge Graph**: vis-network visualization with cross-vault aggregation, search, filter, hover highlight, click tooltip
- **Wiki-links**: `[[target]]` and `[[target|alias]]` with cross-vault resolution
- **Callouts**: `> [!type]` blocks (note, tip, warning, danger, etc.)
- **Mermaid diagrams**: Rendered with zoom, drag, and fullscreen controls
- **Tag system**: Frontmatter + inline tags with search-based filtering
- **Embeds**: `![[file]]` transclusion support
- **Properties display**: YAML frontmatter rendered at top of preview, collapsible
- **Document CRUD**: Create, edit, delete vault files with auto-updated timestamps
- **Backlinks + outlinks**: Real-time link tracking per file
- **Terminal auto-reconnect**: Exponential backoff with connection status indicator
- **Terminal search**: Ctrl+F in-terminal search (xterm-addon-search)
- **Terminal font size**: Adjustable with persistent preference
- **Terminal quick commands**: Configurable command shortcuts for mobile
- **Terminal tab rename**: Double-click to rename tabs
- **File manager integration**: "Open terminal here" from context menu
- **File compress**: Single-file compress from context menu
- **Directory browser**: Navigate server filesystem to add vaults
- **Cross-vault search**: Search files and tags across all loaded vaults
- **Mobile sidebar drawer**: Collapsible overlay with toggle bar
- **Scrollable stats bar**: Horizontal scroll on mobile
- **Dynamic HOME_DIR**: Server-side injection prevents redirect loops

### Fixed
- Body-parser Express 5 compatibility
- Callout extension marked 12.x token compatibility
- Graph self-referencing edges filtered
- Graph duplicate bidirectional edges deduplicated
- Vault cache invalidation (startsWith → includes)
- Breadcrumb path prefix display
- File action button visibility on dark theme
- HTML structure integrity (unclosed div detection)
- YAML list-style frontmatter parsing

### Changed
- Three-column layout → two-column (sidebar + full-width preview)
- Graph moved from modal overlay to content area tab
- Tag cloud panel replaced with search-based tag filtering
- Metadata panel moved from sidebar to preview Properties block
- Mobile layout from stacked to overlay drawer

## [1.0.0] - 2026-02-04

### Added
- File manager with upload, download, edit, delete
- Multi-tab code editor with CodeMirror
- Built-in terminal with tmux integration
- System stats monitoring
- File sharing
- Dark theme
