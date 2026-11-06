# FBIS 1.0 — Web foundation

This is the first responsive web prototype for the Football Betting Intelligence System.

## Included
- Mobile-friendly dashboard
- Project modules and development roadmap
- Clear prototype/data disclaimer
- No API keys, live fixtures, bookmaker odds or predictions

## Publish with GitHub Pages
1. Create a new public GitHub repository named `fbis-football-intelligence`.
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md` to the repository root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then save.
6. Wait for the Pages deployment to finish, then open the published URL shown in Settings → Pages.

## Next engineering stages
1. Connect a reliable global fixture/results data provider.
2. Store normalized fixtures and source timestamps.
3. Add team, player, injury and odds data where licensed/available.
4. Build probability models and calibrate them against historical results.
5. Add a database for pre-match forecasts and settled outcomes.
6. Add monitoring, data-quality checks and model-performance reports.

## Important
Do not put private API keys in browser JavaScript or public GitHub repositories. A secure backend is required for provider credentials. All sample UI content is illustrative and must not be treated as a betting recommendation.
