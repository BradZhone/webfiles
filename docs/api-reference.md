# WebFiles Vault API 参考文档

> WebFiles Obsidian 集成 — 新增 API 完整参考  
> 版本：1.0  
> 日期：2026-04-13

---

## 目录

- [1. 概述](#1-概述)
- [2. 通用约定](#2-通用约定)
- [3. GET /api/vault/graph](#3-get-apivaultgraph)
- [4. GET /api/vault/backlinks](#4-get-apivaultbacklinks)
- [5. GET /api/vault/tags](#5-get-apivaulttags)
- [6. POST /api/vault/parse](#6-post-apivaultparse)
- [7. GET /api/vault/config](#7-get-apivaultconfig)
- [8. 通用错误码](#8-通用错误码)

---

## 1. 概述

本文档定义了 WebFiles Obsidian 集成功能的所有新增 API。所有 API 遵循 RESTful 规范，返回 JSON 格式数据。

**基础路径**：`/api/vault`

**功能范围**：
- 知识图谱数据获取
- 反向链接查询
- 标签聚合与筛选
- Markdown 文件解析与增强渲染
- 配置信息获取

---

## 2. 通用约定

### 2.1 请求格式

- 查询参数使用 `application/x-www-form-urlencoded` 编码
- POST 请求体使用 `application/json`
- 所有路径参数使用 UTF-8 编码，需要 `encodeURIComponent` 处理

### 2.2 响应格式

所有接口统一返回以下 JSON 结构：

**成功响应**：

```json
{
  "ok": true,
  "data": { ... }
}
```

**错误响应**：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

### 2.3 路径安全

所有接受路径参数的 API 都会执行以下安全检查：
1. 使用 `path.resolve()` 规范化路径
2. 检查路径是否在 `VAULT_ROOTS` 配置的允许范围内
3. 阻止路径遍历攻击（如 `../../etc/passwd`）

---

## 3. GET /api/vault/graph

### 描述

获取指定 Vault 的知识图谱数据，包含所有 Markdown 文件节点及它们之间的 Wiki-Link 连接边。

### 请求方法和路径

```
GET /api/vault/graph
```

### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `vault` | string | ✅ | — | Vault 目录的绝对路径或相对路径 |
| `groupBy` | string | ❌ | `directory` | 节点分组方式：`directory`（按目录）或 `tag`（按标签） |
| `filter` | string | ❌ | — | 按标签名或目录名过滤，只返回匹配节点及其直接邻居 |
| `maxNodes` | number | ❌ | `500` | 最大返回节点数，超过时按连接数排序截断 |

### 请求示例

```bash
# 获取完整图谱
curl "http://localhost:3000/api/vault/graph?vault=/home/user/my-vault"

# 按标签分组
curl "http://localhost:3000/api/vault/graph?vault=/home/user/my-vault&groupBy=tag"

# 过滤指定目录的节点
curl "http://localhost:3000/api/vault/graph?vault=/home/user/my-vault&filter=projects"

# 限制节点数量
curl "http://localhost:3000/api/vault/graph?vault=/home/user/my-vault&maxNodes=100"
```

### 响应示例

```json
{
  "ok": true,
  "data": {
    "nodes": [
      {
        "id": "projects/webfiles.md",
        "label": "webfiles",
        "path": "projects/webfiles.md",
        "title": "WebFiles 项目",
        "tags": ["项目", "web", "工具"],
        "color": "#a6e3a1",
        "size": 22,
        "group": "projects",
        "fileCount": 1
      },
      {
        "id": "daily-notes/2026-04-13.md",
        "label": "2026-04-13",
        "path": "daily-notes/2026-04-13.md",
        "title": "2026-04-13",
        "tags": ["日志"],
        "color": "#f38ba8",
        "size": 16,
        "group": "daily-notes",
        "fileCount": 1
      },
      {
        "id": "resources/markdown-guide.md",
        "label": "markdown-guide",
        "path": "resources/markdown-guide.md",
        "title": "Markdown 指南",
        "tags": ["教程", "markdown"],
        "color": "#f9e2af",
        "size": 14,
        "group": "resources",
        "fileCount": 1
      }
    ],
    "edges": [
      {
        "from": "daily-notes/2026-04-13.md",
        "to": "projects/webfiles.md"
      },
      {
        "from": "projects/webfiles.md",
        "to": "resources/markdown-guide.md"
      },
      {
        "from": "daily-notes/2026-04-13.md",
        "to": "resources/markdown-guide.md"
      }
    ],
    "stats": {
      "totalNodes": 42,
      "totalEdges": 67,
      "orphanNodes": 5,
      "groups": {
        "projects": 8,
        "daily-notes": 15,
        "resources": 12,
        "areas": 7
      }
    },
    "meta": {
      "vault": "/home/user/my-vault",
      "groupBy": "directory",
      "cached": true,
      "generatedAt": "2026-04-13T15:30:00.000Z",
      "scanDurationMs": 234
    }
  }
}
```

### 错误码

| HTTP 状态码 | 错误码 | 说明 |
|-------------|--------|------|
| `400` | `MISSING_VAULT` | `vault` 查询参数缺失或为空 |
| `400` | `INVALID_GROUP_BY` | `groupBy` 参数值无效，仅支持 `directory` 或 `tag` |
| `400` | `INVALID_MAX_NODES` | `maxNodes` 参数不是有效的正整数 |
| `403` | `ACCESS_DENIED` | 请求的路径不在 `VAULT_ROOTS` 允许范围内 |
| `404` | `VAULT_NOT_FOUND` | Vault 目录不存在或不是有效目录 |
| `413` | `VAULT_TOO_LARGE` | Vault 文件数超过 `VAULT_MAX_FILES` 限制 |
| `500` | `SCAN_ERROR` | 服务端扫描过程中发生错误 |

---

## 4. GET /api/vault/backlinks

### 描述

查询指定文件的反向链接，即所有通过 `[[]]` 链接到目标文件的其他文件，包含链接上下文信息。

### 请求方法和路径

```
GET /api/vault/backlinks
```

### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `vault` | string | ✅ | — | Vault 目录路径 |
| `file` | string | ✅ | — | 目标文件相对于 Vault 根目录的路径 |
| `includeContent` | boolean | ❌ | `false` | 是否在上下文中包含链接所在段落完整内容 |
| `maxContextLines` | number | ❌ | `3` | 上下文显示的行数（上下各 N 行） |

### 请求示例

```bash
# 基本反链查询
curl "http://localhost:3000/api/vault/backlinks?vault=/home/user/my-vault&file=projects/webfiles.md"

# 包含更多上下文
curl "http://localhost:3000/api/vault/backlinks?vault=/home/user/my-vault&file=projects/webfiles.md&includeContent=true&maxContextLines=5"
```

### 响应示例

```json
{
  "ok": true,
  "data": {
    "file": "projects/webfiles.md",
    "title": "WebFiles 项目",
    "backlinks": [
      {
        "file": "daily-notes/2026-04-13.md",
        "title": "2026-04-13",
        "modifiedAt": "2026-04-13T10:30:00.000Z",
        "contexts": [
          {
            "line": 15,
            "column": 10,
            "snippet": "今天在开发 [[webfiles]] 项目\n使用 Express 5 重构后端\n整体架构更加清晰",
            "linkText": "webfiles"
          },
          {
            "line": 28,
            "column": 5,
            "snippet": "参考 [[webfiles|WebFiles 文档]] 了解更多\n特别是 API 设计部分",
            "linkText": "webfiles|WebFiles 文档"
          }
        ]
      },
      {
        "file": "resources/tools-list.md",
        "title": "工具列表",
        "modifiedAt": "2026-04-12T08:00:00.000Z",
        "contexts": [
          {
            "line": 42,
            "column": 20,
            "snippet": "推荐使用 [[webfiles]] 作为 Web 文件管理器\n支持多种文件操作",
            "linkText": "webfiles"
          }
        ]
      }
    ],
    "total": 2,
    "meta": {
      "vault": "/home/user/my-vault",
      "scanDurationMs": 156
    }
  }
}
```

### 错误码

| HTTP 状态码 | 错误码 | 说明 |
|-------------|--------|------|
| `400` | `MISSING_VAULT` | `vault` 查询参数缺失或为空 |
| `400` | `MISSING_FILE` | `file` 查询参数缺失或为空 |
| `403` | `ACCESS_DENIED` | 路径不在允许范围内 |
| `404` | `FILE_NOT_FOUND` | 目标文件不存在 |
| `404` | `VAULT_NOT_FOUND` | Vault 目录不存在 |
| `500` | `SCAN_ERROR` | 扫描过程发生错误 |

---

## 5. GET /api/vault/tags

### 描述

获取 Vault 内所有标签及其统计信息，可选择按标签名筛选并获取关联文件列表。

### 请求方法和路径

```
GET /api/vault/tags
```

### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `vault` | string | ✅ | — | Vault 目录路径 |
| `tag` | string | ❌ | — | 指定标签名，返回该标签的详情和关联文件 |
| `includeFiles` | boolean | ❌ | `false` | 是否包含标签关联的文件列表 |
| `sort` | string | ❌ | `count` | 排序方式：`count`（按数量降序）或 `name`（按名称排序） |
| `limit` | number | ❌ | `100` | 返回标签数量上限 |

### 请求示例

```bash
# 获取所有标签（按数量排序）
curl "http://localhost:3000/api/vault/tags?vault=/home/user/my-vault"

# 按名称排序，限制数量
curl "http://localhost:3000/api/vault/tags?vault=/home/user/my-vault&sort=name&limit=20"

# 获取指定标签的关联文件
curl "http://localhost:3000/api/vault/tags?vault=/home/user/my-vault&tag=项目&includeFiles=true"
```

### 响应示例

**无 `includeFiles` 参数时**：

```json
{
  "ok": true,
  "data": {
    "tags": [
      { "name": "项目", "count": 12 },
      { "name": "日志", "count": 8 },
      { "name": "web", "count": 6 },
      { "name": "工具", "count": 5 },
      { "name": "教程", "count": 4 },
      { "name": "javascript", "count": 3 },
      { "name": "markdown", "count": 3 },
      { "name": "前端", "count": 2 },
      { "name": "后端", "count": 2 },
      { "name": "设计", "count": 1 }
    ],
    "totalTags": 10,
    "totalTagInstances": 46,
    "totalFiles": 42,
    "filesWithTags": 35
  }
}
```

**带 `includeFiles=true` 参数时**：

```json
{
  "ok": true,
  "data": {
    "tags": [
      { "name": "项目", "count": 12 }
    ],
    "files": [
      {
        "path": "projects/webfiles.md",
        "title": "WebFiles 项目",
        "modifiedAt": "2026-04-13T15:00:00.000Z",
        "allTags": ["项目", "web", "工具"]
      },
      {
        "path": "projects/obsidian.md",
        "title": "Obsidian 集成",
        "modifiedAt": "2026-04-12T09:00:00.000Z",
        "allTags": ["项目", "知识管理"]
      },
      {
        "path": "projects/homepage.md",
        "title": "个人主页",
        "modifiedAt": "2026-04-10T14:00:00.000Z",
        "allTags": ["项目", "前端"]
      }
    ],
    "totalTags": 10,
    "totalFiles": 42,
    "filesWithTags": 35
  }
}
```

### 错误码

| HTTP 状态码 | 错误码 | 说明 |
|-------------|--------|------|
| `400` | `MISSING_VAULT` | `vault` 查询参数缺失或为空 |
| `400` | `INVALID_SORT` | `sort` 参数值无效，仅支持 `count` 或 `name` |
| `400` | `INVALID_LIMIT` | `limit` 参数不是有效的正整数 |
| `403` | `ACCESS_DENIED` | 路径不在允许范围内 |
| `404` | `VAULT_NOT_FOUND` | Vault 目录不存在 |
| `404` | `TAG_NOT_FOUND` | 指定的 `tag` 不存在 |
| `500` | `SCAN_ERROR` | 扫描过程发生错误 |

---

## 6. POST /api/vault/parse

### 描述

解析指定的 Markdown 文件，执行 Obsidian 增强渲染，返回 HTML、元数据、目录、链接和标签等结构化数据。

### 请求方法和路径

```
POST /api/vault/parse
```

### 请求体

Content-Type: `application/json`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `vault` | string | ✅ | — | Vault 目录路径 |
| `file` | string | ✅ | — | 文件相对于 Vault 根目录的路径 |
| `render` | boolean | ❌ | `true` | 是否渲染 HTML，设为 `false` 仅提取元数据 |
| `resolveLinks` | boolean | ❌ | `true` | 是否解析 `[[]]` 链接为可点击的锚点 |
| `maxEmbedDepth` | number | ❌ | `3` | 嵌入解析最大递归深度 |

### 请求示例

```bash
# 完整解析（含 HTML 渲染）
curl -X POST "http://localhost:3000/api/vault/parse" \
  -H "Content-Type: application/json" \
  -d '{
    "vault": "/home/user/my-vault",
    "file": "projects/webfiles.md"
  }'

# 仅提取元数据（不渲染 HTML）
curl -X POST "http://localhost:3000/api/vault/parse" \
  -H "Content-Type: application/json" \
  -d '{
    "vault": "/home/user/my-vault",
    "file": "projects/webfiles.md",
    "render": false
  }'

# 解析但不解析链接
curl -X POST "http://localhost:3000/api/vault/parse" \
  -H "Content-Type: application/json" \
  -d '{
    "vault": "/home/user/my-vault",
    "file": "projects/webfiles.md",
    "resolveLinks": false
  }'
```

### 响应示例

```json
{
  "ok": true,
  "data": {
    "file": "projects/webfiles.md",
    "metadata": {
      "title": "WebFiles 项目",
      "tags": ["项目", "web", "工具"],
      "date": "2026-04-13",
      "aliases": ["webfiles", "wf"],
      "custom": "任意值"
    },
    "html": "<h1 id=\"webfiles-项目\">WebFiles 项目</h1>\n<p>这是 <a class=\"wiki-link\" href=\"#vault:obsidian\" data-target=\"obsidian\">Obsidian</a> 集成方案的说明文档。</p>\n<div class=\"callout callout-note\">\n  <div class=\"callout-title\">笔记</div>\n  <div class=\"callout-body\">这是一个重要说明</div>\n</div>\n<h2 id=\"概述\">概述</h2>\n<p>项目使用 <span class=\"tag\" data-tag=\"javascript\">#javascript</span> 和 <span class=\"tag\" data-tag=\"express\">#express</span> 技术栈。</p>",
    "toc": [
      { "level": 1, "text": "WebFiles 项目", "id": "webfiles-项目" },
      { "level": 2, "text": "概述", "id": "概述" },
      { "level": 3, "text": "技术架构", "id": "技术架构" },
      { "level": 2, "text": "功能列表", "id": "功能列表" }
    ],
    "links": [
      {
        "target": "obsidian",
        "resolved": "resources/obsidian.md",
        "type": "wiki",
        "exists": true
      },
      {
        "target": "express",
        "resolved": null,
        "type": "wiki",
        "exists": false
      }
    ],
    "embeds": [
      {
        "file": "snippets/code-example.md",
        "resolved": "snippets/code-example.md",
        "depth": 1
      }
    ],
    "tags": ["项目", "web", "工具", "javascript", "express"],
    "wordCount": 256,
    "charCount": 1280,
    "headings": 4,
    "meta": {
      "vault": "/home/user/my-vault",
      "rendered": true,
      "parseDurationMs": 45
    }
  }
}
```

**当 `render: false` 时**：

```json
{
  "ok": true,
  "data": {
    "file": "projects/webfiles.md",
    "metadata": {
      "title": "WebFiles 项目",
      "tags": ["项目", "web", "工具"],
      "date": "2026-04-13"
    },
    "html": null,
    "toc": [
      { "level": 1, "text": "WebFiles 项目", "id": "webfiles-项目" },
      { "level": 2, "text": "概述", "id": "概述" }
    ],
    "links": [
      {
        "target": "obsidian",
        "resolved": "resources/obsidian.md",
        "type": "wiki",
        "exists": true
      }
    ],
    "embeds": [],
    "tags": ["项目", "web", "工具", "javascript", "express"],
    "wordCount": 256,
    "charCount": 1280,
    "headings": 4,
    "meta": {
      "vault": "/home/user/my-vault",
      "rendered": false,
      "parseDurationMs": 12
    }
  }
}
```

### 错误码

| HTTP 状态码 | 错误码 | 说明 |
|-------------|--------|------|
| `400` | `MISSING_VAULT` | `vault` 字段缺失或为空 |
| `400` | `MISSING_FILE` | `file` 字段缺失或为空 |
| `400` | `INVALID_REQUEST_BODY` | 请求体不是合法 JSON |
| `400` | `INVALID_MAX_EMBED_DEPTH` | `maxEmbedDepth` 超出范围（1-5） |
| `403` | `ACCESS_DENIED` | 路径不在允许范围内 |
| `404` | `FILE_NOT_FOUND` | 文件不存在 |
| `404` | `VAULT_NOT_FOUND` | Vault 目录不存在 |
| `413` | `FILE_TOO_LARGE` | 文件大小超过 `maxFileSize` 限制 |
| `415` | `NOT_MARKDOWN` | 文件不是 `.md` 格式 |
| `500` | `PARSE_ERROR` | 解析过程发生错误 |

---

## 7. GET /api/vault/config

### 描述

获取 Vault 功能的当前配置信息，前端用于初始化界面和判断功能可用性。

### 请求方法和路径

```
GET /api/vault/config
```

### 查询参数

无

### 请求示例

```bash
curl "http://localhost:3000/api/vault/config"
```

### 响应示例

```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "defaultVault": "/home/user/my-vault",
    "maxFiles": 5000,
    "maxFileSize": 1048576,
    "features": {
      "graph": true,
      "backlinks": true,
      "tags": true,
      "embed": true,
      "callout": true,
      "mermaid": true,
      "highlight": true
    },
    "cache": {
      "enabled": true,
      "ttlSeconds": 300
    },
    "watch": {
      "enabled": true
    },
    "version": "1.0.0"
  }
}
```

### 错误码

| HTTP 状态码 | 错误码 | 说明 |
|-------------|--------|------|
| `500` | `INTERNAL_ERROR` | 服务端内部错误 |

---

## 8. 通用错误码

以下错误码适用于所有 Vault API：

| HTTP 状态码 | 错误码 | 说明 |
|-------------|--------|------|
| `400` | `MISSING_VAULT` | `vault` 参数缺失或为空 |
| `400` | `MISSING_FILE` | `file` 参数缺失或为空 |
| `400` | `INVALID_REQUEST_BODY` | 请求体格式错误 |
| `400` | `INVALID_PARAMETER` | 参数值不合法 |
| `403` | `ACCESS_DENIED` | 路径不在允许范围内 |
| `404` | `VAULT_NOT_FOUND` | Vault 目录不存在 |
| `404` | `FILE_NOT_FOUND` | 文件不存在 |
| `404` | `TAG_NOT_FOUND` | 标签不存在 |
| `405` | `METHOD_NOT_ALLOWED` | HTTP 方法不被允许 |
| `413` | `VAULT_TOO_LARGE` | Vault 文件数超过限制 |
| `413` | `FILE_TOO_LARGE` | 文件大小超过限制 |
| `415` | `NOT_MARKDOWN` | 文件不是 Markdown 格式 |
| `429` | `RATE_LIMITED` | 请求频率过高 |
| `500` | `SCAN_ERROR` | 扫描过程发生错误 |
| `500` | `PARSE_ERROR` | 解析过程发生错误 |
| `500` | `INTERNAL_ERROR` | 服务端内部错误 |
| `503` | `VAULT_DISABLED` | Vault 功能未启用 |

### 错误响应格式

```json
{
  "ok": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "请求的路径 /etc/passwd 不在允许的 Vault 目录范围内",
    "details": {
      "allowedRoots": ["/home/user"],
      "requestedPath": "/etc/passwd"
    }
  }
}
```

`details` 字段为可选，仅在部分错误中提供额外的调试信息。

---

## 附录 A：后端路由注册模板

```javascript
// server.js — Vault 路由注册

import express from 'express';
import path from 'path';
import fs from 'fs/promises';

const vaultRouter = express.Router();

// 路径验证中间件
function validateVaultPath(req, res, next) {
  const vaultPath = req.query.vault || req.body?.vault;
  if (!vaultPath) {
    return res.status(400).json({
      ok: false,
      error: { code: 'MISSING_VAULT', message: 'vault 参数缺失' }
    });
  }
  try {
    const resolved = path.resolve(vaultPath);
    // 检查是否在允许范围内
    const allowed = (process.env.VAULT_ROOTS || '').split(':').filter(Boolean);
    const isAllowed = allowed.some(root => resolved.startsWith(path.resolve(root)));
    if (!isAllowed) {
      return res.status(403).json({
        ok: false,
        error: { code: 'ACCESS_DENIED', message: `路径 ${resolved} 不在允许范围内` }
      });
    }
    res.locals.vaultPath = resolved;
    next();
  } catch (e) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_PARAMETER', message: '无效的路径参数' }
    });
  }
}

// GET /api/vault/graph
vaultRouter.get('/graph', validateVaultPath, async (req, res) => {
  try {
    const vaultPath = res.locals.vaultPath;
    const groupBy = req.query.groupBy || 'directory';
    const filter = req.query.filter || null;
    const maxNodes = parseInt(req.query.maxNodes) || 500;

    // 检查目录是否存在
    try {
      await fs.access(vaultPath);
    } catch {
      return res.status(404).json({
        ok: false,
        error: { code: 'VAULT_NOT_FOUND', message: 'Vault 目录不存在' }
      });
    }

    const data = await buildGraphData(vaultPath, { groupBy, filter, maxNodes });
    res.json({ ok: true, data });
  } catch (e) {
    console.error('Graph error:', e);
    res.status(500).json({
      ok: false,
      error: { code: 'SCAN_ERROR', message: e.message }
    });
  }
});

// GET /api/vault/backlinks
vaultRouter.get('/backlinks', validateVaultPath, async (req, res) => {
  try {
    const vaultPath = res.locals.vaultPath;
    const file = req.query.file;

    if (!file) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FILE', message: 'file 参数缺失' }
      });
    }

    const filePath = path.join(vaultPath, file);
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        ok: false,
        error: { code: 'FILE_NOT_FOUND', message: '目标文件不存在' }
      });
    }

    const includeContent = req.query.includeContent === 'true';
    const maxContextLines = parseInt(req.query.maxContextLines) || 3;

    const data = await getBacklinks(vaultPath, file, { includeContent, maxContextLines });
    res.json({ ok: true, data });
  } catch (e) {
    console.error('Backlinks error:', e);
    res.status(500).json({
      ok: false,
      error: { code: 'SCAN_ERROR', message: e.message }
    });
  }
});

// GET /api/vault/tags
vaultRouter.get('/tags', validateVaultPath, async (req, res) => {
  try {
    const vaultPath = res.locals.vaultPath;
    const tag = req.query.tag || null;
    const includeFiles = req.query.includeFiles === 'true';
    const sort = req.query.sort || 'count';
    const limit = parseInt(req.query.limit) || 100;

    if (!['count', 'name'].includes(sort)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_SORT', message: 'sort 仅支持 count 或 name' }
      });
    }

    const data = await getTags(vaultPath, { tag, includeFiles, sort, limit });
    res.json({ ok: true, data });
  } catch (e) {
    console.error('Tags error:', e);
    res.status(500).json({
      ok: false,
      error: { code: 'SCAN_ERROR', message: e.message }
    });
  }
});

// POST /api/vault/parse
vaultRouter.post('/parse', validateVaultPath, async (req, res) => {
  try {
    const vaultPath = res.locals.vaultPath;
    const { file, render = true, resolveLinks = true, maxEmbedDepth = 3 } = req.body;

    if (!file) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FILE', message: 'file 字段缺失' }
      });
    }

    if (!file.endsWith('.md')) {
      return res.status(415).json({
        ok: false,
        error: { code: 'NOT_MARKDOWN', message: '文件不是 Markdown 格式' }
      });
    }

    const filePath = path.join(vaultPath, file);
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        ok: false,
        error: { code: 'FILE_NOT_FOUND', message: '文件不存在' }
      });
    }

    const data = await parseMarkdownFile(vaultPath, file, {
      render,
      resolveLinks,
      maxEmbedDepth
    });
    res.json({ ok: true, data });
  } catch (e) {
    console.error('Parse error:', e);
    res.status(500).json({
      ok: false,
      error: { code: 'PARSE_ERROR', message: e.message }
    });
  }
});

// GET /api/vault/config
vaultRouter.get('/config', (req, res) => {
  res.json({
    ok: true,
    data: {
      enabled: process.env.VAULT_ENABLED !== 'false',
      defaultVault: process.env.VAULT_DEFAULT || null,
      maxFiles: parseInt(process.env.VAULT_MAX_FILES) || 5000,
      maxFileSize: 1024 * 1024,
      features: {
        graph: true,
        backlinks: true,
        tags: true,
        embed: true,
        callout: true,
        mermaid: true,
        highlight: true
      },
      cache: {
        enabled: true,
        ttlSeconds: parseInt(process.env.VAULT_CACHE_TTL) || 300
      },
      watch: {
        enabled: process.env.VAULT_WATCH !== 'false'
      },
      version: '1.0.0'
    }
  });
});

// 挂载路由
// app.use('/api/vault', vaultRouter);
```

---

## 附录 B：前端 API 调用封装

```javascript
/**
 * Vault API 客户端封装
 */
const VaultAPI = {
  baseUrl: '/api/vault',

  /**
   * 获取知识图谱数据
   */
  async getGraph(vault, options = {}) {
    const params = new URLSearchParams({ vault });
    if (options.groupBy) params.set('groupBy', options.groupBy);
    if (options.filter) params.set('filter', options.filter);
    if (options.maxNodes) params.set('maxNodes', options.maxNodes);

    const resp = await fetch(`${this.baseUrl}/graph?${params}`);
    return this._handleResponse(resp);
  },

  /**
   * 获取反向链接
   */
  async getBacklinks(vault, file, options = {}) {
    const params = new URLSearchParams({ vault, file });
    if (options.includeContent) params.set('includeContent', 'true');
    if (options.maxContextLines) params.set('maxContextLines', options.maxContextLines);

    const resp = await fetch(`${this.baseUrl}/backlinks?${params}`);
    return this._handleResponse(resp);
  },

  /**
   * 获取标签列表
   */
  async getTags(vault, options = {}) {
    const params = new URLSearchParams({ vault });
    if (options.tag) params.set('tag', options.tag);
    if (options.includeFiles) params.set('includeFiles', 'true');
    if (options.sort) params.set('sort', options.sort);
    if (options.limit) params.set('limit', options.limit);

    const resp = await fetch(`${this.baseUrl}/tags?${params}`);
    return this._handleResponse(resp);
  },

  /**
   * 解析 Markdown 文件
   */
  async parseMarkdown(vault, file, options = {}) {
    const resp = await fetch(`${this.baseUrl}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vault,
        file,
        render: options.render !== false,
        resolveLinks: options.resolveLinks !== false,
        maxEmbedDepth: options.maxEmbedDepth || 3
      })
    });
    return this._handleResponse(resp);
  },

  /**
   * 获取配置信息
   */
  async getConfig() {
    const resp = await fetch(`${this.baseUrl}/config`);
    return this._handleResponse(resp);
  },

  /**
   * 统一响应处理
   */
  async _handleResponse(resp) {
    const data = await resp.json();
    if (!data.ok) {
      const err = new Error(data.error?.message || '未知错误');
      err.code = data.error?.code;
      err.status = resp.status;
      err.details = data.error?.details;
      throw err;
    }
    return data.data;
  }
};
```

---

> 文档结束  
> 本文档为 WebFiles Vault API 的完整参考，所有接口均可在本地开发环境直接测试。
