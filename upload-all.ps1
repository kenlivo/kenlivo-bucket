# Bulk upload all dashboard images to GitHub Releases (kenlivo-bucket)
# Usage: .\upload-all.ps1 -Token "ghp_yourtoken" [-ImagesDir "path\to\images"]
#
# Folder structure → Release tags:
#   public/images/users/*       → tag: users
#   public/images/products/*    → tag: products
#   public/images/*.png         → tag: root
#   etc.

param(
    [Parameter(Mandatory=$true)]
    [string]$Token,
    [string]$ImagesDir = "f:\github\kenlivo_dashboard\public\images"
)

$Owner = "kenlivo"
$Repo  = "kenlivo-bucket"
$Headers = @{
    Authorization = "token $Token"
    Accept        = "application/vnd.github.v3+json"
    "User-Agent"  = "kenlivo-bucket"
}

if (-not (Test-Path $ImagesDir)) {
    Write-Error "Images directory not found: $ImagesDir"
    exit 1
}

# ── Helpers ──────────────────────────────────────────────────────────────────

$releaseCache = @{}

function Get-OrCreate-Release($tag) {
    if ($releaseCache.ContainsKey($tag)) { return $releaseCache[$tag] }

    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases/tags/$tag" `
                               -Headers $Headers -Method GET -ErrorAction Stop
        $releaseCache[$tag] = $r.id
        return $r.id
    } catch {}

    $body = @{ tag_name = $tag; name = $tag; draft = $false; prerelease = $false } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases" `
                           -Headers $Headers -Method POST -Body $body -ContentType "application/json"
    $releaseCache[$tag] = $r.id
    return $r.id
}

function Upload-File($releaseId, $filePath, $fileName) {
    $uploadUrl = "https://uploads.github.com/repos/$Owner/$Repo/releases/$releaseId/assets?name=$([Uri]::EscapeDataString($fileName))"
    $bytes = [System.IO.File]::ReadAllBytes($filePath)

    try {
        $uploadHeaders = $Headers.Clone()
        $uploadHeaders["Content-Type"] = "application/octet-stream"
        Invoke-RestMethod -Uri $uploadUrl -Headers $uploadHeaders -Method POST -Body $bytes -ErrorAction Stop | Out-Null
        Write-Host "  [OK] $fileName" -ForegroundColor Green
    } catch {
        $msg = $_.Exception.Message
        if ($msg -like "*already_exists*" -or $msg -like "*422*") {
            Write-Host "  [SKIP] $fileName (already uploaded)" -ForegroundColor Yellow
        } else {
            Write-Host "  [FAIL] $fileName - $msg" -ForegroundColor Red
        }
    }
}

# ── Collect files ─────────────────────────────────────────────────────────────

$files = @()
Get-ChildItem -Path $ImagesDir -File | ForEach-Object {
    $files += @{ tag = "root"; path = $_.FullName; name = $_.Name }
}
Get-ChildItem -Path $ImagesDir -Directory | ForEach-Object {
    $tag = $_.Name
    Get-ChildItem -Path $_.FullName -File | ForEach-Object {
        $files += @{ tag = $tag; path = $_.FullName; name = $_.Name }
    }
}

Write-Host "Found $($files.Count) files to upload`n"

# ── Upload by tag ─────────────────────────────────────────────────────────────

$byTag = $files | Group-Object -Property { $_["tag"] }
foreach ($group in $byTag) {
    Write-Host "`n[$($group.Name)] — $($group.Count) files"
    $releaseId = Get-OrCreate-Release $group.Name
    foreach ($f in $group.Group) {
        Upload-File $releaseId $f["path"] $f["name"]
    }
}

Write-Host "`nDone! All images are now in GitHub Releases." -ForegroundColor Cyan
Write-Host "Restart your dashboard dev server." -ForegroundColor Cyan
