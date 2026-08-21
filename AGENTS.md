# Agent Guidelines for Dev Studio

## Automatic GitHub Pages Deployment
- The Dev Studio frontend is hosted at https://evanstom273.github.io/dev-studio/ and accessed primarily on mobile.
- GitHub Pages is configured via .github/workflows/deploy.yml to build and deploy ONLY when changes are pushed to the main branch.
- **CRITICAL WORKFLOW RULE**: Whenever you complete a feature, fix, or update in this repository:
  1. Verify the frontend builds cleanly (
pm run build).
  2. Commit the changes.
  3. Ensure the changes are merged into main and pushed to origin/main (and keep your working branch synced).
  4. Never leave completed changes only on a feature branch without merging to main, otherwise the live GitHub Pages app will not update.
