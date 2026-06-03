import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUILD_ID =
  process.env.VITE_BUILD_SHA || process.env.GIT_SHA || Date.now().toString(36);

const ASSET_ORIGIN = (process.env.VITE_ASSET_ORIGIN || '').replace(/\/$/, '');

const TG_SDK = 'https://telegram.org/js/telegram-web-app.js';

function bustAssetUrls(html: string): string {
  return html.replace(
    /(src|data-src)="(\/assets\/[^"?]+)(?:\?[^"]*)?"/g,
    (_, attr: string, assetPath: string) => {
      const url = ASSET_ORIGIN ? `${ASSET_ORIGIN}${assetPath}` : assetPath;
      return `${attr}="${url}?b=${BUILD_ID}"`;
    },
  );
}

/** Убрать inline System.import — ломает WebView + CSP (vitejs/vite#21393). */
function externalizeLegacyLoader(html: string, outDir: string): string {
  const tag = html.match(/<script[^>]*id="vite-legacy-entry"[^>]*>[\s\S]*?<\/script>/);
  if (!tag) return html;

  const entryRaw =
    tag[0].match(/data-src="(\/assets\/index-legacy[^"]+)"/)?.[1] ||
    tag[0].match(/(\/assets\/index-legacy-[A-Za-z0-9_-]+\.js)/)?.[1];
  if (!entryRaw) return html;
  const entryPath = entryRaw.replace(/\?.*$/, '');

  const entryUrl = `${ASSET_ORIGIN || ''}${entryPath}?b=${BUILD_ID}`;
  const loaderName = `legacy-loader-${BUILD_ID}.js`;
  const loaderPath = path.join(outDir, 'assets', loaderName);
  fs.mkdirSync(path.dirname(loaderPath), { recursive: true });
  // Без System.config — в legacy-бандле его нет, иначе «System.config is not a function».
  fs.writeFileSync(loaderPath, `System.import("${entryUrl}");`);

  const base = ASSET_ORIGIN || '';
  return html.replace(
    tag[0],
    `<script id="vite-legacy-entry" src="${base}/assets/${loaderName}?b=${BUILD_ID}"></script>`,
  );
}

export function telegramHtml(): Plugin {
  let outDir = 'dist';
  return {
    name: 'telegram-html',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let out = html.replace(/\s+crossorigin(="[^"]*")?/gi, '');
        if (!out.includes('telegram-web-app.js')) {
          out = out.replace(
            /<head>/i,
            `<head>\n    <script src="${TG_SDK}"></script>`,
          );
        }
        if (out.includes('vite-legacy-entry')) {
          out = externalizeLegacyLoader(out, outDir);
        }
        out = bustAssetUrls(out);
        return out;
      },
    },
    closeBundle() {
      compressAssetsGzip(outDir);
    },
  };
}

/** nginx gzip_static: отдаём .js.gz с корректным Content-Length (форумы / SO). */
function compressAssetsGzip(outDir: string): void {
  const assetsDir = path.join(outDir, 'assets');
  if (!fs.existsSync(assetsDir)) return;
  for (const name of fs.readdirSync(assetsDir)) {
    if (!name.endsWith('.js') || name.endsWith('.gz')) continue;
    const raw = fs.readFileSync(path.join(assetsDir, name));
    fs.writeFileSync(path.join(assetsDir, `${name}.gz`), gzipSync(raw));
  }
}
