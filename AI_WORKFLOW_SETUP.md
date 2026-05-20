# AI Workflow Setup (Windows + PowerShell)

## 1) Start aider safely

```powershell
Set-Location "c:\Users\Nazim\Desktop\P.Post\Label Generator"
.\.venv\Scripts\Activate.ps1
$env:DEEPSEEK_API_KEY = "<your-key-here>"
aider --model deepseek/deepseek-v4-flash
```

If `aider` is not found in a fresh terminal, run:

```powershell
.\.venv\Scripts\aider.exe --model deepseek/deepseek-v4-flash
```

## 2) Auto Git commit support

Configured global aliases:

- `git autocommit` -> stages all changes and creates `chore: auto-commit`
- `git undo` -> undo last commit but keep changes staged
- `git unstage` -> remove everything from staging

Recommended safe flow:

```powershell
git status
git add -A
git commit -m "feat: short message"
```

## 3) Rollback Git safely

Undo last commit, keep work:

```powershell
git undo
```

Hard reset examples (destructive, ask before using):

```powershell
git reset --hard HEAD~1
```

## 4) Push to GitHub

```powershell
git remote -v
git push origin main
```

If not authenticated:

```powershell
gh auth login
```

## 5) Deploy to Railway

```powershell
railway whoami
railway link
railway up
railway logs
```

## 6) Safe AI coding practices

- Keep secrets only in `.env` or system environment variables.
- Never commit `.env` or credentials files.
- Commit in small increments before AI-assisted refactors.
- Run validation after each significant AI change:

```powershell
npm run lint
npm run typecheck
npm test
```

- Review every AI-generated migration/script before execution.
- Prefer non-destructive commands first (`status`, `diff`, `--dry-run`).
- Keep production keys separate from local/dev keys.
