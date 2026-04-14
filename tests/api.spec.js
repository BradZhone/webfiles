// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const TEST_VAULT = path.resolve(__dirname, 'test-vault');

test.describe('Vault API', () => {

  // ==================== GET /api/vault/graph ====================

  test.describe('GET /api/vault/graph', () => {
    test('returns 200 with nodes and edges for valid vault', async ({ request }) => {
      const resp = await request.get('/api/vault/graph', {
        params: { vault: TEST_VAULT },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(data.nodes).toBeDefined();
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(data.nodes.length).toBeGreaterThanOrEqual(4);
      expect(data.edges).toBeDefined();
      expect(Array.isArray(data.edges)).toBe(true);
      expect(data.edges.length).toBeGreaterThan(0);

      // Verify node structure
      const node = data.nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('path');
      expect(node).toHaveProperty('tags');
      expect(node).toHaveProperty('group');
    });

    test('returns edges reflecting wiki-links between files', async ({ request }) => {
      const resp = await request.get('/api/vault/graph', {
        params: { vault: TEST_VAULT },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();

      // index.md links to webfiles and markdown-guide
      const indexToWebfiles = data.edges.find(
        (e) => e.from === 'index' && e.to === 'webfiles'
      );
      expect(indexToWebfiles).toBeDefined();

      const indexToGuide = data.edges.find(
        (e) => e.from === 'index' && e.to === 'markdown-guide'
      );
      expect(indexToGuide).toBeDefined();
    });

    test('returns 400 for missing vault param', async ({ request }) => {
      const resp = await request.get('/api/vault/graph');
      expect(resp.status()).toBe(400);

      const data = await resp.json();
      expect(data.error).toBeDefined();
    });

    test('returns 400 for invalid vault path', async ({ request }) => {
      const resp = await request.get('/api/vault/graph', {
        params: { vault: '/nonexistent/fake/path' },
      });
      expect(resp.status()).toBe(400);

      const data = await resp.json();
      expect(data.error).toBeDefined();
    });
  });

  // ==================== GET /api/vault/backlinks ====================

  test.describe('GET /api/vault/backlinks', () => {
    test('returns 200 with backlinks for a linked file', async ({ request }) => {
      const resp = await request.get('/api/vault/backlinks', {
        params: {
          vault: TEST_VAULT,
          file: 'projects/webfiles.md',
        },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(data.file).toBe('webfiles');
      expect(data.backlinks).toBeDefined();
      expect(Array.isArray(data.backlinks)).toBe(true);
      // index.md, daily/2026-04-13.md, and resources/markdown-guide.md all link to webfiles
      expect(data.backlinks.length).toBeGreaterThanOrEqual(3);
    });

    test('backlink entries have expected structure', async ({ request }) => {
      const resp = await request.get('/api/vault/backlinks', {
        params: {
          vault: TEST_VAULT,
          file: 'projects/webfiles.md',
        },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      const backlink = data.backlinks[0];
      expect(backlink).toHaveProperty('path');
      expect(backlink).toHaveProperty('name');
      expect(backlink).toHaveProperty('basename');
    });

    test('returns 400 for missing params', async ({ request }) => {
      const resp = await request.get('/api/vault/backlinks', {
        params: { vault: TEST_VAULT },
      });
      expect(resp.status()).toBe(400);
    });
  });

  // ==================== GET /api/vault/tags ====================

  test.describe('GET /api/vault/tags', () => {
    test('returns 200 with tags map for valid vault', async ({ request }) => {
      const resp = await request.get('/api/vault/tags', {
        params: { vault: TEST_VAULT },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(data.tags).toBeDefined();
      expect(typeof data.tags).toBe('object');
      expect(data.totalFiles).toBeGreaterThanOrEqual(4);
    });

    test('tags include both frontmatter and inline tags', async ({ request }) => {
      const resp = await request.get('/api/vault/tags', {
        params: { vault: TEST_VAULT },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      // Frontmatter tags
      expect(data.tags).toHaveProperty('project');
      expect(data.tags).toHaveProperty('daily');
      expect(data.tags).toHaveProperty('reference');
      // Inline tags
      expect(data.tags).toHaveProperty('javascript');
      expect(data.tags).toHaveProperty('writing');
    });

    test('tag entries list associated files', async ({ request }) => {
      const resp = await request.get('/api/vault/tags', {
        params: { vault: TEST_VAULT },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      const projectFiles = data.tags['project'];
      expect(Array.isArray(projectFiles)).toBe(true);
      expect(projectFiles.length).toBeGreaterThanOrEqual(1);
      expect(projectFiles[0]).toHaveProperty('path');
      expect(projectFiles[0]).toHaveProperty('name');
    });

    test('returns 400 for invalid vault', async ({ request }) => {
      const resp = await request.get('/api/vault/tags', {
        params: { vault: '/nonexistent/path' },
      });
      expect(resp.status()).toBe(400);
    });
  });

  // ==================== POST /api/vault/parse ====================

  test.describe('POST /api/vault/parse', () => {
    test('returns 200 with parsed data for valid file', async ({ request }) => {
      const resp = await request.post('/api/vault/parse', {
        data: {
          vault: TEST_VAULT,
          file: 'index.md',
        },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(data.metadata).toBeDefined();
      expect(data.body).toBeDefined();
      expect(data.links).toBeDefined();
      expect(data.tags).toBeDefined();
      expect(data.headings).toBeDefined();
      expect(data.basename).toBe('index');
    });

    test('extracts wiki-links from content', async ({ request }) => {
      const resp = await request.post('/api/vault/parse', {
        data: {
          vault: TEST_VAULT,
          file: 'index.md',
        },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(data.links).toContain('webfiles');
      expect(data.links).toContain('markdown-guide');
    });

    test('extracts frontmatter metadata', async ({ request }) => {
      const resp = await request.post('/api/vault/parse', {
        data: {
          vault: TEST_VAULT,
          file: 'projects/webfiles.md',
        },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(data.metadata).toBeDefined();
      expect(data.metadata.title).toBe('WebFiles Project');
      expect(data.metadata.date).toBe('2026-04-13');
    });

    test('extracts headings for TOC', async ({ request }) => {
      const resp = await request.post('/api/vault/parse', {
        data: {
          vault: TEST_VAULT,
          file: 'resources/markdown-guide.md',
        },
      });
      expect(resp.status()).toBe(200);

      const data = await resp.json();
      expect(data.headings.length).toBeGreaterThanOrEqual(2);
      expect(data.headings[0]).toHaveProperty('level');
      expect(data.headings[0]).toHaveProperty('text');
    });

    test('returns 404 for non-existent file', async ({ request }) => {
      const resp = await request.post('/api/vault/parse', {
        data: {
          vault: TEST_VAULT,
          file: 'nonexistent.md',
        },
      });
      expect(resp.status()).toBe(404);

      const data = await resp.json();
      expect(data.error).toBeDefined();
    });

    test('returns 400 for missing file param', async ({ request }) => {
      const resp = await request.post('/api/vault/parse', {
        data: { vault: TEST_VAULT },
      });
      expect(resp.status()).toBe(400);
    });
  });
});
