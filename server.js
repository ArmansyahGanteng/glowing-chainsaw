const express = require('express');
const path = require('path');
const cheerio = require('cheerio');
const JSZip = require('jszip');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MAX_FILES = 25;
const VALID_PROTOCOLS = ['http:', 'https:'];

function normalizeUrl(input) {
  if (!input || typeof input !== 'string') throw new Error('URL is required.');

  const trimmed = input.trim();
  if (!trimmed) throw new Error('URL cannot be empty.');

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      throw new Error('Enter a valid public URL, for example: https://example.com');
    }
  }

  if (!VALID_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported.');
  }

  return parsed.toString();
}

function isTextType(fileType) {
  return ['html', 'css', 'js', 'json', 'ts', 'tsx', 'jsx', 'vue', 'php', 'py', 'md', 'svg', 'txt', 'xml'].includes(fileType);
}

function getFileType(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.js')) return 'js';
  if (lower.endsWith('.mjs')) return 'js';
  if (lower.endsWith('.ts')) return 'ts';
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.vue')) return 'vue';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.py')) return 'py';
  if (lower.endsWith('.md')) return 'md';
  if (lower.endsWith('.svg')) return 'svg';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.gif')) return 'image';
  if (lower.endsWith('.woff') || lower.endsWith('.woff2') || lower.endsWith('.ttf')) return 'font';
  return 'other';
}

function detectTechFromHtml(html, fileList) {
  const combined = [html, ...fileList.map((item) => item.content || '')].join('\n').toLowerCase();
  const techMap = [
    { name: 'HTML5', match: /<html|<!doctype html>/i },
    { name: 'CSS3', match: /<style|\.css|backdrop-filter|grid-template/i },
    { name: 'JavaScript', match: /<script|document\.|window\.|fetch\(|addEventListener/i },
    { name: 'TypeScript', match: /interface |type [a-z]|tsx|tsconfig|: string/i },
    { name: 'React', match: /react|createRoot\(|useState\(|jsx-runtime|from 'react'|from \"react\"/i },
    { name: 'Next.js', match: /next/ },
    { name: 'Vue', match: /vue|createApp\(|defineComponent|v-bind|v-model/i },
    { name: 'Angular', match: /@angular|ng-app|angular/i },
    { name: 'Node.js', match: /express\(|require\('express'\)|require\("express"\)|http\.createServer/i },
    { name: 'PHP', match: /<?php|\$_get|\$_post|echo \$/i },
    { name: 'Python', match: /import flask|from flask|django|def main\(|print\(/i },
    { name: 'JSON', match: /"[a-zA-Z0-9_\-]+"\s*:\s*\{|\{\s*"name"/i },
    { name: 'Tailwind', match: /tailwind|className=\".*bg-|class=\".*text-/i },
    { name: 'Vite', match: /vite|@vitejs|import.meta.env/i },
    { name: 'Webpack', match: /webpack|babel|mini-css-extract-plugin/i },
    { name: 'SVG', match: /<svg|<path|fill="currentColor"/i },
    { name: 'CMS', match: /wordpress|strapi|contentful|sanity|shopify/i }
  ];

  const technologies = techMap.filter((item) => item.match.test(combined)).map((item) => item.name);

  const unique = [...new Set(technologies)];
  return unique.length > 0 ? unique : ['HTML5'];
}

function buildRelativePath(url, baseUrl) {
  const target = new URL(url, baseUrl);
  const base = new URL(baseUrl);
  const relative = path.posix.relative(base.pathname.replace(/\/$/, ''), target.pathname.replace(/\/$/, '')) || 'index.html';
  return relative.startsWith('/') ? relative.slice(1) : relative;
}

function normalizePathname(name) {
  if (!name || name === '/') return 'index.html';
  return name.replace(/^\/+/, '').replace(/\/+/g, '/');
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'FENCT-ALL-CODE/1.0',
      Accept: 'text/html,application/javascript,text/css,*/*;q=0.8',
      ...headers
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch resource ${url} (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  return { text, contentType };
}

async function analyzeWebsite(inputUrl) {
  const url = normalizeUrl(inputUrl);
  const base = new URL(url);

  const mainHtml = await fetchText(url);
  const $ = cheerio.load(mainHtml.text);

  const files = [];
  const seen = new Set();

  const addFile = (name, content, type, source, size) => {
    const normalizedName = normalizePathname(name || 'index.html');
    if (seen.has(normalizedName)) return;
    seen.add(normalizedName);
    files.push({
      id: `${source}-${normalizedName}`,
      name: normalizedName,
      type,
      source,
      size,
      content
    });
  };

  addFile(base.pathname || '/index.html', mainHtml.text, 'html', 'entry', mainHtml.text.length);

  const refs = [];
  $('script[src]').each((_, el) => refs.push($(el).attr('src')));
  $('link[rel="stylesheet"][href]').each((_, el) => refs.push($(el).attr('href')));
  $('img[src]').each((_, el) => refs.push($(el).attr('src')));
  $('source[src]').each((_, el) => refs.push($(el).attr('src')));

  for (const ref of refs) {
    if (!ref || ref.startsWith('data:') || ref.startsWith('#')) continue;

    try {
      const targetUrl = new URL(ref, url).toString();
      const parsedPath = new URL(targetUrl);
      const type = getFileType(parsedPath.pathname);
      if (type === 'image' || type === 'font' || type === 'other') {
        continue;
      }

      const response = await fetchText(targetUrl);
      const content = response.text;
      const safeName = normalizePathname(parsedPath.pathname.replace(base.origin, '').replace(/^\/+/, '') || 'index.html');
      addFile(safeName, content, type, 'asset', content.length);
      if (files.length >= MAX_FILES) break;
    } catch (error) {
      // Ignore unreachable assets to keep the analysis resilient.
    }
  }

  const detectedTech = detectTechFromHtml(mainHtml.text, files);

  return {
    url,
    title: $('title').first().text().trim() || 'Untitled Page',
    metaDescription: $('meta[name="description"]').attr('content') || 'No description available',
    fileCount: files.length,
    totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
    technologies: detectedTech,
    files: files.map((file) => ({
      ...file,
      typeLabel: file.type.toUpperCase()
    }))
  };
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body || {};
    const safeUrl = normalizeUrl(url);
    const result = await analyzeWebsite(safeUrl);
    res.json({ ok: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(400).json({ ok: false, message: error.message || 'Unable to analyze the URL.' });
  }
});

app.post('/api/download-zip', async (req, res) => {
  try {
    const { files = [] } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, message: 'No files selected to download.' });
    }

    const zip = new JSZip();
    files.forEach((file) => {
      if (!file?.name) return;
      const safeName = normalizePathname(file.name);
      zip.file(safeName, file.content || '');
    });

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="fenc-all-code.zip"');
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: 'Unable to generate ZIP archive.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FENCT ALL CODE running at http://localhost:${PORT}`);
  });
}

module.exports = app;
