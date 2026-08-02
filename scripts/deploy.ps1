# Deploy the built site to the TAMU OAL webspace (U: -> ~farishittiny).
#
#   .\scripts\deploy.ps1            Stage A: copy dist -> U:\v2\  (preview at
#                                   people.tamu.edu/~farishittiny/v2/)
#   .\scripts\deploy.ps1 -Promote   Stage B: archive old site, copy dist -> U:\
#                                   root, report stale files (never deletes)
#   .\scripts\deploy.ps1 -Promote -RemoveStale
#                                   additionally deletes the reported stale
#                                   root files after a typed confirmation
#
# Guarantees: no /MIR, no blind deletes; resume/Resume.pdf path preserved;
# refuses to run if dist is missing or over 2 MB (asset-bloat tripwire).

param(
    [switch]$Promote,
    [switch]$RemoveStale
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$target = "U:\"

if (-not (Test-Path $dist)) { throw "dist/ not found - run 'npm run build' first." }
if (-not (Test-Path $target)) { throw "U: drive not available - check the network mapping." }

$size = (Get-ChildItem $dist -Recurse -File | Measure-Object Length -Sum).Sum
if ($size -gt 2MB) { throw ("dist is {0:N0} bytes (>2 MB tripwire). Investigate before deploying." -f $size) }
Write-Host ("dist size: {0:N0} bytes - OK" -f $size)

if (-not $Promote) {
    Write-Host "Stage A: copying dist -> U:\v2\ (additive, no deletes)"
    robocopy $dist "U:\v2" /E /FFT /R:2 /W:2 /XF Thumbs.db | Out-Host
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
    Write-Host "Preview: https://people.tamu.edu/~farishittiny/v2/"
    exit 0
}

# ---- Stage B: promote to root ----
$backup = "U:\_backup-old-site"
$oldFiles = @(
    "index.html", "portfolio.html", "qualifications.html", "service.html", "ai.html",
    "style.css", "style1.css", "style2.css", "toggle-style.js", "README.md",
    "Faris.JPG", "IMG_2026.jpeg", "Screenshot 2026-02-09 231629.png",
    "unnamed (6).jpg", "unnamed (7).jpg", "unnamed (8).jpg", "unnamed (9).jpg"
)

if (-not (Test-Path $backup)) {
    Write-Host "Archiving old site files -> $backup"
    New-Item -ItemType Directory -Force $backup | Out-Null
    foreach ($f in $oldFiles) {
        $p = Join-Path $target $f
        if (Test-Path $p) { Copy-Item $p $backup }
    }
    if (Test-Path (Join-Path $target "resume")) {
        Copy-Item (Join-Path $target "resume") (Join-Path $backup "resume") -Recurse -Force
    }
} else {
    Write-Host "Backup already exists at $backup - not overwriting."
}

$confirm = Read-Host "Copy new site over U:\ root? Type PROMOTE to continue"
if ($confirm -cne "PROMOTE") { Write-Host "Aborted."; exit 1 }

robocopy $dist $target /E /FFT /R:2 /W:2 /XF Thumbs.db /XD "_backup-old-site" "v2" | Out-Host
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# Stale report: files at root that the new site does not ship.
$distRel = Get-ChildItem $dist -Recurse -File | ForEach-Object { $_.FullName.Substring($dist.Length + 1) }
$rootRel = Get-ChildItem $target -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\(_backup-old-site|v2)\\' -and $_.Name -ne "Thumbs.db" } |
    ForEach-Object { $_.FullName.Substring($target.Length) }
$stale = $rootRel | Where-Object { $distRel -notcontains $_ }

if ($stale) {
    Write-Host "`nStale files at U:\ root (present live, not in the new build):"
    $stale | ForEach-Object { Write-Host "  $_" }
    if ($RemoveStale) {
        $confirm2 = Read-Host "Delete ALL files listed above? Type DELETE to continue"
        if ($confirm2 -ceq "DELETE") {
            $stale | ForEach-Object { Remove-Item (Join-Path $target $_) -Force }
            Write-Host "Stale files removed."
        } else {
            Write-Host "Stale files kept."
        }
    } else {
        Write-Host "(kept - rerun with -Promote -RemoveStale to delete)"
    }
} else {
    Write-Host "No stale files at root."
}

Write-Host "Live: https://people.tamu.edu/~farishittiny/"
