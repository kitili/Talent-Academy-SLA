<#
.SYNOPSIS
    Finish a branch switch that wrote every file but could not write .git/HEAD.

.DESCRIPTION
    On Windows, `git switch` / `git checkout` can update the index and working tree, log the move in the
    reflog, and then fail to rename .git/HEAD.lock onto .git/HEAD because another process (here, the
    Claude desktop app polling git) has HEAD open. Git asks "Should I try again? (y/n)"; after "n", HEAD
    still names the old branch and `git status` shows the whole branch difference as staged changes.

    This script finishes the switch safely:
      1. reads the target branch from the newest reflog entry ("checkout: moving from A to B");
      2. refuses while a git switch/checkout is still running (answer its prompt with "n" first);
      3. removes a stale HEAD.lock only when no switch is running and it names the same target;
      4. checks that the index is exactly the target branch's tree and nothing is unstaged
         (untracked files are reported, never touched);
      5. points HEAD at the target with `git symbolic-ref` (no file is changed).
    If a check fails, it stops and changes nothing: real work may be mixed in.

    Background: docs/_learnings and the memory note "interrupted checkout leaves HEAD unwritten".

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/git/restore-head.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $output = & git @GitArgs 2>&1
    return @{ Code = $LASTEXITCODE; Output = ($output | Out-String).Trim() }
}

$top = Invoke-Git rev-parse --show-toplevel
if ($top.Code -ne 0) { Write-Host 'Not inside a git repository.' -ForegroundColor Red; exit 1 }
Set-Location $top.Output
$gitDir = (Invoke-Git rev-parse --absolute-git-dir).Output

# 1. The switch git was trying to finish.
$reflog = (Invoke-Git reflog -1 --format=%gs HEAD).Output
if ($reflog -notmatch '^checkout: moving from (.+) to (.+)$') {
    Write-Host "The newest reflog entry is not a branch switch: '$reflog'. Nothing to do." -ForegroundColor Yellow
    exit 0
}
$from = $Matches[1]
$target = $Matches[2]
$targetRef = "refs/heads/$target"
if ((Invoke-Git show-ref --verify --quiet $targetRef).Code -ne 0) {
    Write-Host "'$target' is not a local branch; restore it by hand." -ForegroundColor Red
    exit 1
}

$current = (Invoke-Git symbolic-ref -q HEAD).Output
if ($current -eq $targetRef) {
    Write-Host "HEAD already points at $target. Nothing to do." -ForegroundColor Green
    exit 0
}
Write-Host "Unfinished switch: $from -> $target (HEAD still says '$current')."

# 2. A switch still waiting at its prompt holds HEAD.lock; let it end first.
$running = Get-CimInstance Win32_Process -Filter "Name='git.exe'" |
    Where-Object { $_.CommandLine -match '\s(switch|checkout)\s' }
if ($running) {
    Write-Host "A git switch/checkout is still running (pid $($running.ProcessId -join ', ')). Answer its 'Should I try again?' prompt with n, then run this again." -ForegroundColor Yellow
    exit 1
}

# 3. A lock left behind by the failed rename.
$lock = Join-Path $gitDir 'HEAD.lock'
if (Test-Path $lock) {
    $lockContent = (Get-Content $lock -Raw).Trim()
    if ($lockContent -ne "ref: $targetRef") {
        Write-Host "HEAD.lock exists but says '$lockContent', not '$targetRef'. Not touching it." -ForegroundColor Red
        exit 1
    }
    Remove-Item $lock -Force
    Write-Host 'Removed the stale HEAD.lock (it named the same target).'
}

# 4. The safety checks: the index must be the target tree, nothing unstaged.
if ((Invoke-Git diff --cached --quiet $targetRef).Code -ne 0) {
    Write-Host "The index is NOT $target's tree: other staged work is mixed in. Stopping; nothing changed." -ForegroundColor Red
    exit 1
}
if ((Invoke-Git diff --quiet).Code -ne 0) {
    Write-Host 'There are unstaged changes in the working tree. Stopping; nothing changed.' -ForegroundColor Red
    exit 1
}
$untracked = @(& git ls-files --others --exclude-standard)
if ($untracked.Count -gt 0) {
    Write-Host "Note: $($untracked.Count) untracked file(s) exist; they are left exactly as they are."
}

# 5. Finish the switch: HEAD names the target branch. No file changes.
$result = Invoke-Git symbolic-ref -m "restore-head: finish checkout from $from to $target" HEAD $targetRef
if ($result.Code -ne 0) {
    Write-Host "git symbolic-ref failed: $($result.Output)" -ForegroundColor Red
    exit 1
}
Write-Host "Done: HEAD now points at $target." -ForegroundColor Green
& git status -sb | Select-Object -First 3
