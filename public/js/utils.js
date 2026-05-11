// utils.js - Global state, Button component, modes map, formatters, helpers
let currentPath = HOME;
let currentFile = null;
let currentFileType = null;
let editor = null;
let modified = false;
let actionTarget = null;
let modalCallback = null;
let fileContent = '';
let currentView = 'edit';
let selectMode = false;
let selectedFiles = new Set();
let favorites = [];
let uploadFiles = [];

// 视图和显示设置
let viewMode = 'list'; // list, icon
let sortBy = 'name';   // name, size, modified
let sortOrder = 'asc'; // asc, desc
let displayColumns = { size: true, modified: true, type: false };
let currentFiles = []; // 保存当前文件列表用于排序

// 多标签编辑相关
let openFiles = {}; // { path: { content, cursor, modified, editor, fileType, name } }
let activeFilePath = null;

// 终端相关变量
let terminals = {};
let activeTerminalId = null;
let terminalSocket = null;
let terminalFitAddons = {};
let terminalPathCallback = null;
let currentTermFontSize = parseInt(localStorage.getItem('termFontSize') || '14');
let searchAddons = {};

// ========== 统一按钮组件 ==========
const Button = {
    // 主要按钮
    primary(text, onClick, icon = '') {
        return `<button class="btn-primary" onclick="${onClick}">${icon}${text}</button>`;
    },
    // 次要按钮
    secondary(text, onClick, icon = '') {
        return `<button class="btn-secondary" onclick="${onClick}">${icon}${text}</button>`;
    },
    // 危险按钮
    danger(text, onClick, icon = '') {
        return `<button class="btn-danger" onclick="${onClick}">${icon}${text}</button>`;
    },
    // 工具栏按钮
    toolbar(text, onClick, icon = '', extraClass = '') {
        return `<button class="toolbar-btn ${extraClass}" onclick="${onClick}">${icon}${text}</button>`;
    },
    // 模态框底部按钮组
    modalFooter(cancelFn, confirmFn, cancelText = '取消', confirmText = '确定') {
        return `<div class="modal-btns">
            <button class="btn-secondary" onclick="${cancelFn}">${cancelText}</button>
            <button class="btn-primary" onclick="${confirmFn}">${confirmText}</button>
        </div>`;
    },
    // 模态框单按钮（只有确认）
    modalSingle(confirmFn, confirmText = '完成') {
        return `<div class="modal-btns">
            <button class="btn-primary" onclick="${confirmFn}">${confirmText}</button>
        </div>`;
    },
    // 编辑器底部操作栏
    editorBar(showSave = true) {
        let html = '<button class="btn-secondary" onclick="goBack()">返回</button>' +
                  '<button class="btn-secondary" onclick="downloadCurrentFile()">下载</button>';
        if (showSave) {
            html += '<button class="btn-primary" onclick="saveFile()">保存</button>';
        }
        return html;
    },
    // 设置按钮加载状态
    setLoading(btn, loading) {
        if (loading) {
            btn.classList.add('btn-loading');
            btn.dataset.originalText = btn.textContent;
        } else {
            btn.classList.remove('btn-loading');
            if (btn.dataset.originalText) {
                btn.textContent = btn.dataset.originalText;
            }
        }
    }
};

const modes = {
    // JavaScript/TypeScript
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    // HTML/模板
    html: 'htmlmixed', htm: 'htmlmixed', xhtml: 'htmlmixed',
    vue: 'vue', svelte: 'htmlmixed',
    pug: 'pug', jade: 'jade', haml: 'haml',
    ejs: 'htmlmixed', hbs: 'htmlmixed', handlebars: 'htmlmixed', mustache: 'htmlmixed',
    // CSS/样式
    css: 'css', scss: 'sass', sass: 'sass', less: 'less',
    // 数据格式
    json: { name: 'javascript', json: true }, jsonc: { name: 'javascript', json: true },
    xml: 'xml', xsl: 'xml', xslt: 'xml', svg: 'xml',
    yml: 'yaml', yaml: 'yaml',
    toml: 'toml', ini: 'ini', conf: 'ini', cfg: 'ini', config: 'ini',
    properties: 'properties', env: 'properties',
    // Python
    py: 'python', pyw: 'python', pyx: 'python', pyx: 'python',
    // Web后端
    php: 'php', php3: 'php', php4: 'php', php5: 'php', phtml: 'php',
    rb: 'ruby', erb: 'ruby', ruby: 'ruby', gemspec: 'ruby', rake: 'ruby',
    go: 'go', gomod: 'go',
    rs: 'rust', rlib: 'rust',
    java: 'text/x-java', jar: 'text/x-java',
    // C/C++
    c: 'text/x-csrc', h: 'text/x-csrc',
    cpp: 'text/x-c++src', cc: 'text/x-c++src', cxx: 'text/x-c++src', hpp: 'text/x-c++src', hh: 'text/x-c++src',
    // Shell/脚本
    sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell',
    zsh: 'shell',
    ps1: 'powershell', ps1m: 'powershell', psd1: 'powershell',
    bat: 'text/bat', cmd: 'text/bat',
    vbs: 'vbscript', vba: 'vbscript',
    fish: 'shell',
    perl: 'perl', pl: 'perl', pm: 'perl', t: 'perl',
    lua: 'lua',
    coffeescript: 'coffeescript', coffee: 'coffeescript', litcoffee: 'coffeescript',
    livescript: 'livescript', ls: 'livescript',
    // 配置/DevOps
    dockerfile: 'dockerfile', docker: 'dockerfile',
    'docker-compose.yml': 'yaml', 'docker-compose.yaml': 'yaml',
    nginx: 'nginx', nginxconf: 'nginx',
    apache: 'apache', htaccess: 'apache',
    // 数据库
    sql: 'sql', ddl: 'sql', dml: 'sql',
    cypher: 'cypher', cyp: 'cypher',
    // 文档
    md: 'markdown', markdown: 'markdown', mdwn: 'markdown', mkd: 'markdown', mkdn: 'markdown',
    tex: 'stex', latex: 'stex', ltx: 'stex', bibtex: 'stex',
    rst: 'rst', rest: 'rst',
    // 编程语言
    swift: 'swift',
    kt: 'kotlin', kts: 'kotlin', kotlin: 'kotlin',
    scala: 'scala', sc: 'scala',
    groovy: 'groovy', gvy: 'groovy', gy: 'groovy', gsh: 'groovy',
    d: 'd', di: 'd',
    r: 'r', rmd: 'r',
    jl: 'text/x-julia', julia: 'text/x-julia',
    elm: 'elm',
    erl: 'erlang', hrl: 'erlang', erlang: 'erlang',
    hs: 'haskell', lhs: 'haskell', haskell: 'haskell',
    clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
    lisp: 'commonlisp', lsp: 'commonlisp', cl: 'commonlisp',
    scm: 'scheme', ss: 'scheme', rkt: 'scheme', scheme: 'scheme',
    pas: 'pascal', pp: 'pascal', inc: 'pascal', pascal: 'pascal',
    ex: 'elixir', exs: 'elixir', elixir: 'elixir',
    ml: 'mllike', mli: 'mllike', ocaml: 'mllike',
    fs: 'text/x-fsharp', fsi: 'text/x-fsharp', fsharp: 'text/x-fsharp',
    vb: 'vb', vbnet: 'vb', bas: 'vb',
    forth: 'forth', frt: 'forth',
    // 模板
    jinja: 'jinja2', jinja2: 'jinja2', j2: 'jinja2',
    // 硬件/系统
    v: 'verilog', verilog: 'verilog', sv: 'verilog', vhd: 'vhdl', vhdl: 'vhdl',
    asm: 'text/x-asm', s: 'text/x-asm',
    // 其他
    diff: 'diff', patch: 'diff',
    csv: 'spreadsheet', tsv: 'spreadsheet',
    txt: 'text/plain', text: 'text/plain', log: 'text/plain',
    makefile: 'cmake', cmake: 'cmake', mk: 'cmake',
    graphQL: 'javascript', gql: 'javascript', graphql: 'javascript',
};

function getMode(name) {
    const basename = name.split('/').pop().toLowerCase();

    // 特殊文件名匹配（隐藏文件、配置文件等）
    const specialFiles = {
        // Shell 配置
        '.bashrc': 'shell', '.bash_profile': 'shell', '.bash_logout': 'shell',
        '.zshrc': 'shell', '.zprofile': 'shell', '.zshenv': 'shell', '.zlogin': 'shell',
        '.profile': 'shell', '.kshrc': 'shell',
        '.shrc': 'shell', '.aliases': 'shell', '.functions': 'shell',
        // Git
        '.gitignore': 'shell', '.gitattributes': 'shell', '.gitmodules': 'shell', '.gitkeep': 'text/plain',
        '.gitconfig': 'ini', '.git-commit-msg': 'text/plain',
        // 编辑器/IDE
        '.vimrc': 'shell', '.gvimrc': 'shell', '.exrc': 'shell',
        '.editorconfig': 'ini',
        '.eslintrc': 'javascript', '.eslintrc.js': 'javascript', '.eslintrc.json': { name: 'javascript', json: true },
        '.prettierrc': 'javascript', '.prettierrc.js': 'javascript', '.prettierrc.json': { name: 'javascript', json: true },
        '.stylelintrc': 'javascript', '.stylelintrc.js': 'javascript', '.stylelintrc.json': { name: 'javascript', json: true },
        '.babelrc': 'javascript', '.babelrc.js': 'javascript', '.babelrc.json': { name: 'javascript', json: true },
        '.tslintrc': 'javascript',
        // Node.js
        '.npmrc': 'ini', '.nvmrc': 'text/plain', '.node-version': 'text/plain',
        '.npmignore': 'shell',
        // Python
        '.pythonrc': 'python', '.python_history': 'text/plain',
        '.condarc': 'yaml', '.pylintrc': 'ini',
        // Docker
        '.dockerignore': 'shell', 'dockerfile': 'dockerfile',
        'docker-compose.yml': 'yaml', 'docker-compose.yaml': 'yaml',
        // Web
        '.htaccess': 'apache',
        '.nginx.conf': 'nginx',
        '.env': 'properties', '.env.local': 'properties', '.env.development': 'properties', '.env.production': 'properties',
        '.env.example': 'properties',
        // Config
        '.curlrc': 'text/plain', '.wgetrc': 'text/plain',
        '.inputrc': 'text/plain',
        '.screenrc': 'text/plain', '.tmux.conf': 'shell',
        '.config': 'ini',
        'makefile': 'shell', 'gnumakefile': 'shell',
        'vagrantfile': 'ruby',
        'gemfile': 'ruby', 'rakefile': 'ruby',
        'procfile': 'text/plain',
        'jenkinsfile': 'groovy',
        'package.json': { name: 'javascript', json: true }, 'package-lock.json': { name: 'javascript', json: true },
        'tsconfig.json': { name: 'javascript', json: true }, 'jsconfig.json': { name: 'javascript', json: true },
        'composer.json': { name: 'javascript', json: true },
        'license': 'markdown', 'license.md': 'markdown', 'license.txt': 'text/plain',
        'readme': 'markdown', 'readme.md': 'markdown', 'readme.txt': 'text/plain',
        'changelog': 'markdown', 'changelog.md': 'markdown',
        'contributing': 'markdown', 'contributing.md': 'markdown',
    };

    if (specialFiles[basename]) {
        return specialFiles[basename];
    }

    // 检查部分匹配
    if (basename.startsWith('dockerfile')) return 'dockerfile';
    if (basename.startsWith('.env')) return 'properties';
    if (basename.startsWith('.bash')) return 'shell';
    if (basename.startsWith('.zsh')) return 'shell';
    if (basename.endsWith('rc') && basename.startsWith('.')) return 'shell';
    if (basename === 'license' || basename.startsWith('license.')) return 'markdown';
    if (basename === 'readme' || basename.startsWith('readme.')) return 'markdown';
    if (basename === 'changelog' || basename.startsWith('changelog.')) return 'markdown';
    if (basename === 'makefile' || basename.startsWith('makefile.')) return 'shell';
    if (basename.endsWith('.service')) return 'ini';  // systemd
    if (basename.endsWith('.conf')) return 'ini';

    // 扩展名匹配
    const ext = name.split('.').pop().toLowerCase();
    return modes[ext] || 'text/plain';
}

function formatSize(size) {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
}

function showToast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// 视图切换
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('backBtn').style.display = id === 'listView' ? 'none' : 'block';
    document.getElementById('favBtn').style.display = id === 'listView' ? 'block' : 'none';
    document.getElementById('settingsBtn').style.display = id === 'listView' ? 'block' : 'none';
}

function goBack() {
    // 检查是否有未保存的文件
    const modifiedFiles = Object.keys(openFiles).filter(p => openFiles[p].modified);
    if (modifiedFiles.length > 0) {
        customConfirm(`有 ${modifiedFiles.length} 个文件未保存，确定返回？`, function() {
            showView('listView');
            document.getElementById('headerTitle').textContent = currentPath.split('/').pop() || 'Home';
            document.getElementById('viewToggle').style.display = 'none';
        });
        return;
    }

    showView('listView');
    document.getElementById('headerTitle').textContent = currentPath.split('/').pop() || 'Home';
    document.getElementById('viewToggle').style.display = 'none';
}

function switchEditorView(view) {
    currentView = view;
    document.querySelectorAll('.toggle-btn').forEach((btn, i) => {
        btn.classList.toggle('active', (i === 0 && view === 'edit') || (i === 1 && view === 'preview'));
    });

    const wrap = document.getElementById('editorWrap');

    // HTML 文件
    if (currentFileType === 'html') {
        if (view === 'preview') {
            const blob = new Blob([fileContent || ''], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            wrap.innerHTML = `<iframe class="html-preview" src="${url}" style="border:none;width:100%;flex:1;background:#fff;"></iframe>`;
        } else {
            const bar = document.getElementById('editorBar');
            bar.innerHTML = Button.editorBar(true);
            initEditor(fileContent || '', currentFile.split('/').pop());
        }
        return;
    }

    // Markdown 文件
    if (view === 'preview') {
        wrap.innerHTML = `<div class="markdown-view"><div class="markdown-body">${marked.parse(fileContent || '')}</div></div>`;
        renderMermaidDiagrams(wrap);
        loadEmbeds(wrap);
    } else if (view === 'edit') {
        const bar = document.getElementById('editorBar');
        bar.innerHTML = Button.editorBar(true);
        initEditor(fileContent || '', currentFile.split('/').pop());
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}


// getFileIcon - shared utility used by file-manager, editor, actions
function getFileIcon(name, isDir, type) {
    if (isDir) return '📁';
    if (type === 'image') return '🖼️';
    if (type === 'audio') return '🎵';
    if (type === 'video') return '🎬';
    if (type === 'pdf') return '📕';
    if (type === 'markdown') return '📝';
    if (type === 'html') return '🌐';

    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        js: '📜', jsx: '⚛️', ts: '📘', tsx: '⚛️',
        html: '🌐', css: '🎨', json: '📋',
        py: '🐍', go: '🔷', rs: '🦀', java: '☕',
        sh: '💻', yml: '⚙️', yaml: '⚙️', txt: '📄', zip: '📦'
    };
    return icons[ext] || '📄';
}

