/**
 * Kenlivo Bucket — URL helpers
 * Import this in any project to get file URLs
 */

const OWNER = "kenlivo";
const REPO = "kenlivo-bucket";
const DEFAULT_TAG = "assets";

/**
 * Get the public URL for a file in the bucket
 * @param {string} filename
 * @param {string} tag - release tag (default: "assets")
 */
function bucketUrl(filename, tag = DEFAULT_TAG) {
  return `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${filename}`;
}

/**
 * Get URL for an image
 */
function imageUrl(filename, tag = DEFAULT_TAG) {
  return bucketUrl(filename, tag);
}

module.exports = { bucketUrl, imageUrl };
