<#
.SYNOPSIS
    `git switch <branch>` that cannot get stuck on "Rename ... HEAD.lock ... failed. Should I try again?".

.DESCRIPTION
    Runs `git switch` with no terminal on stdin, so git does not stop to ask the y/n question when it
    cannot replace .git/HEAD (another process, e.g. the Claude desktop app polling git, has it open). If
    the switch wrote the files but not HEAD, it then runs scripts/git/restore-head.ps1, which checks the
    index against the branch and finishes the switch with `git symbolic-ref`. Any other failure (local
    changes that would be overwritten, an unknown branch) is shown as git reported it.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/git/switch.ps1 feat/systems-view
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Branch,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# stdin from NUL: git sees no terminal and answers its own retry prompt with "no" instead of waiting.
$quotedExtra = (@($ExtraArgs) | Where-Object { $_ } | ForEach-Object { '"' + $_ + '"' }) -join ' '
cmd /c "git switch `"$Branch`" $quotedExtra < NUL"
$switchCode = $LASTEXITCODE

$current = (& git symbolic-ref -q HEAD 2>$null)
if ($current -eq "refs/heads/$Branch") {
    if ($switchCode -eq 0) { exit 0 }
}

$lastMove = (& git reflog -1 --format=%gs HEAD 2>$null)
if ($lastMove -match "^checkout: moving from .+ to $([regex]::Escape($Branch))$" -and $current -ne "refs/heads/$Branch") {
    Write-Host 'git wrote the files but could not write .git/HEAD; finishing the switch.' -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'restore-head.ps1')
    exit $LASTEXITCODE
}

exit $switchCode
