/**
 * 生成 PDF 用的中间 Markdown：
 * - 把 ```mermaid 代码块按出现顺序替换成本地 PNG（WeasyPrint 不执行 JS）
 * - 把相对图片路径改写成绝对 file:// URL（WeasyPrint 的 base_url 是输入文件目录）
 * - 给图片加尺寸上限，避免整页截图撑爆版面
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("用法：node scripts/prepare-pdf.mjs <输入.md> <输出.md>");
  process.exit(1);
}

const baseDir = dirname(resolve(inputPath));
const diagrams = ["架构-firefly", "架构-actual", "架构-deg", "架构-bookkeeping", "架构-quadrant"];

let text = readFileSync(inputPath, "utf8");
let index = 0;

text = text.replace(/```mermaid\r?\n([\s\S]*?)```/g, (match) => {
  const name = diagrams[index++];
  if (!name) return match;
  const png = join(baseDir, "assets", `${name}.png`);
  return `<p><img src="${pathToFileURL(png).href}" alt="${name}" style="max-width:100%; max-height:105mm;" /></p>`;
});

text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, target) => {
  if (/^(https?:|file:|data:)/i.test(target)) return match;
  const png = resolve(baseDir, decodeURI(target));
  return `<p><img src="${pathToFileURL(png).href}" alt="${alt}" style="max-width:88%; max-height:95mm;" /></p>`;
});

writeFileSync(outputPath, text, "utf8");
console.log(`已处理 ${index} 张架构图 → ${outputPath}`);
