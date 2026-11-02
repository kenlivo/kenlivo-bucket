#!/usr/bin/env node
/**
 * Bulk upload all dashboard images to GitHub Releases (kenlivo-bucket)
 * Usage: node upload-all.js
 * Requires: GITHUB_TOKEN env var with Contents: Read & Write on kenlivo-bucket
 *
 * Folder structure → Release tags:
 *   public/images/users/*      → tag: users
 *   public/images/products/*   → tag: products
 *   public/images/*.png        → tag: root
 *   etc.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OWNER = "kenlivo";
const REPO = "kenlivo-bucket";
const TOKEN = process.env.GITHUB_TOKEN;
const IMAGES_DIR = process.env.IMAGES_DIR || path.resolve(__dirname, "../kenlivo_dashboard/public/images");

if (!TOKEN) {
  console.error("Error: set GITHUB_TOKEN env var first");
  console.error("  Windows: $env:GITHUB_TOKEN = 'your_token'");
  process.exit(1);
}

if (!fs.existsSync(IMAGES_DIR)) {
  console.error(`Images dir not found: ${IMAGES_DIR}`);
  console.error("Adjust the IMAGES_DIR path in this script.");
  process.exit(1);
}

// ── GitHub API helpers ──────────────────────────────────────────────────────

function apiRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const releaseCache = {};

async function getOrCreateRelease(tag) {
  if (releaseCache[tag]) return releaseCache[tag];

  const get = await apiRequest({
    hostname: "api.github.com",
    path: `/repos/${OWNER}/${REPO}/releases/tags/${tag}`,
    method: "GET",
    headers: {
      Authorization: `token ${TOKEN}`,
      "User-Agent": "kenlivo-bucket",
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (get.status === 200) {
    releaseCache[tag] = get.body.id;
    return get.body.id;
  }

  const create = await apiRequest(
    {
      hostname: "api.github.com",
      path: `/repos/${OWNER}/${REPO}/releases`,
      method: "POST",
      headers: {
        Authorization: `token ${TOKEN}`,
        "User-Agent": "kenlivo-bucket",
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
    },
    JSON.stringify({ tag_name: tag, name: tag, draft: false, prerelease: false })
  );

  if (create.status !== 201) {
    throw new Error(`Failed to create release "${tag}": ${JSON.stringify(create.body)}`);
  }

  releaseCache[tag] = create.body.id;
  return create.body.id;
}

async function uploadFile(releaseId, filePath, fileName) {
  const content = fs.readFileSync(filePath);
  const size = fs.statSync(filePath).size;

  const res = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "uploads.github.com",
        path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`,
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "User-Agent": "kenlivo-bucket",
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/octet-stream",
          "Content-Length": size,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch {
            resolve({ status: res.statusCode, body: {} });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(content);
    req.end();
  });

  if (res.status === 422) {
    console.log(`  ⊙ Already exists: ${fileName}`);
    return;
  }
  if (res.status !== 201) {
    console.warn(`  ✗ Failed (${res.status}): ${fileName}`);
    return;
  }
  console.log(`  ✓ ${fileName}`);
}

// ── Walk images directory ────────────────────────────────────────────────────

function collectFiles(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const f of sub) {
        if (f.isFile()) {
          result.push({ tag: entry.name, file: path.join(fullPath, f.name), name: f.name });
        }
      }
    } else if (entry.isFile()) {
      result.push({ tag: "root", file: fullPath, name: entry.name });
    }
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const files = collectFiles(IMAGES_DIR);
  console.log(`Found ${files.length} files to upload\n`);

  const byTag = {};
  for (const f of files) {
    if (!byTag[f.tag]) byTag[f.tag] = [];
    byTag[f.tag].push(f);
  }

  for (const [tag, items] of Object.entries(byTag)) {
    console.log(`\n[${tag}] — ${items.length} files`);
    const releaseId = await getOrCreateRelease(tag);
    for (const item of items) {
      await uploadFile(releaseId, item.file, item.name);
    }
  }

  console.log("\n✅ Upload complete!");
  console.log(`\nNow restart your dashboard dev server — images will be served from GitHub.`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
