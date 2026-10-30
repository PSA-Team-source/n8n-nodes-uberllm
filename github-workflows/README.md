# GitHub Actions workflows

`ci.yml` (lint + build on every push) and `publish.yml` (npm publish with provenance on every version tag, as n8n
requires for verified nodes) belong in `.github/workflows/`. They are kept here because the account that created this
repository could not write workflow files. To turn them on:

```sh
gh auth refresh -s workflow
git mv github-workflows/ci.yml github-workflows/publish.yml .github/workflows/
git commit -m "ci: enable CI and provenance publish workflows" && git push
```
