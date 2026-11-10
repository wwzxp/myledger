#!/usr/bin/env node
/**
 * 文档门禁：四项检查，任一失败即退出码 1。
 *
 * 1. 每个目录都有 README.md
 * 2. 每个 README.md 都有 frontmatter 的 description（根 README 除外）
 * 3. 所有 markdown 的本地链接都指向存在的文件或目录
 * 4. INDEX.md 表格里引用的路径都存在
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', '.codegraph', 'dist', 'build', 'coverage', '__pycache__', '.deploy', '.github', '.run']);
const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)\)/g;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const INDEX_ROW_RE = /^\|\s*`([^`]+)`\s*\|/gm;

const errors = [];

function walk(dir, dirs = [], files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      dirs.push(full);
      walk(full, dirs, files);
    } else {
      files.push(full);
    }
  }
  return { dirs, files };
}

const { dirs, files } = walk(ROOT);
const rel = (p) => p.slice(ROOT.length + 1).replaceAll('\\', '/');

// 1. 目录 README
for (const dir of dirs) {
  if (!existsSync(join(dir, 'README.md'))) {
    errors.push(`${rel(dir)}/: 缺少 README.md`);
  }
}

// 2. README frontmatter
for (const file of files) {
  if (!file.endsWith('README.md') || dirname(file) === ROOT) continue;
  const text = readFileSync(file, 'utf8');
  const match = FRONTMATTER_RE.exec(text);
  if (!match) {
    errors.push(`${rel(file)}: 缺少 frontmatter（需要 description）`);
    continue;
  }
  if (!/^\s*description\s*:\s*\S/m.test(match[1])) {
    errors.push(`${rel(file)}: frontmatter 缺少 description`);
  }
}

// 3. 本地链接
for (const file of files) {
  if (!file.endsWith('.md')) continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(LINK_RE)) {
    const raw = match[1];
    if (/^(https?:|mailto:|#|data:)/i.test(raw)) continue;
    const target = decodeURI(raw.split('#')[0].split('?')[0]);
    if (!target) continue;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      errors.push(`${rel(file)}: 链接指向不存在的路径 ${target}`);
    }
  }
}

// 4. INDEX.md 引用
const indexPath = join(ROOT, 'INDEX.md');
if (existsSync(indexPath)) {
  const text = readFileSync(indexPath, 'utf8');
  for (const match of text.matchAll(INDEX_ROW_RE)) {
    const target = match[1].trim();
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const resolved = resolve(ROOT, target);
    if (!existsSync(resolved)) {
      errors.push(`INDEX.md: 引用了不存在的路径 ${target}`);
    } else if (statSync(resolved).isFile() === false && !target.endsWith('/')) {
      errors.push(`INDEX.md: 目录条目应以 / 结尾 ${target}`);
    }
  }
} else {
  errors.push('INDEX.md: 文件不存在');
}

// 5. 前端 JS 语法检查：重复声明会让整份脚本失效（曾导致所有按钮失灵）
const { execFileSync } = await import("node:child_process");
const jsFiles = files.filter((f) => f.endsWith(".js") && !f.includes("node_modules"));
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    const detail = (error.stderr?.toString() || error.message).split("\n").slice(0, 3).join(" ");
    errors.push(`${rel(file)}: JS 语法错误 ${detail}`);
  }
}

if (errors.length) {
  console.error(`文档门禁失败，共 ${errors.length} 项：`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`文档门禁通过：${dirs.length} 个目录，${files.filter((f) => f.endsWith('.md')).length} 份 md。`);
