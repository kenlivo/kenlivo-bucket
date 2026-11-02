# kenlivo-bucket

GitHub Releases used as free file storage for the Kenlivo platform.

## Structure

Files are uploaded to GitHub Releases via the API and served via stable public URLs.

**URL format:**
```
https://github.com/kenlivo/kenlivo-bucket/releases/download/<tag>/<filename>
```

## Usage

```bash
node upload.js <file-path> [tag]
```

Default tag: `assets`
