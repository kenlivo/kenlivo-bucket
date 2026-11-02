#!/usr/bin/env node
/**
 * Upload a file to GitHub Releases (kenlivo-bucket)
 * Usage: node upload.js <file-path> [tag]
 * Requires: GITHUB_TOKEN env var with repo scope
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OWNER = "kenlivo";
const REPO = "kenlivo-bucket";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable not set");
  process.exit(1);
}

const filePath = process.argv[2];
const tag = process.argv[3] || "assets";

if (!filePath) {
  console.error("Usage: node upload.js <file-path> [tag]");
  process.exit(1);
}

const fileName = path.basename(filePath);
const fileContent = fs.readFileSync(filePath);
const fileSize = fs.statSync(filePath).size;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getReleaseId() {
  const res = await request({
    hostname: "api.github.com",
    path: `/repos/${OWNER}/${REPO}/releases/tags/${tag}`,
    method: "GET",
    headers: {
      Authorization: `token ${TOKEN}`,
      "User-Agent": "kenlivo-bucket",
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (res.status === 200) return res.body.id;

  // Create release if not exists
  const create = await request(
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
    throw new Error(`Failed to create release: ${JSON.stringify(create.body)}`);
  }
  return create.body.id;
}

async function upload() {
  console.log(`Uploading ${fileName} to release tag: ${tag}`);
  const releaseId = await getReleaseId();

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
          "Content-Length": fileSize,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }
    );
    req.on("error", reject);
    req.write(fileContent);
    req.end();
  });

  if (res.status !== 201) {
    throw new Error(`Upload failed: ${JSON.stringify(res.body)}`);
  }

  const url = `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${fileName}`;
  console.log(`Done! Public URL:\n${url}`);
}

upload().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
