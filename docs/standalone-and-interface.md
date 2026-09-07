# Running the calculator

## Docker on Unraid

The container continues to serve the app on port 3333, with configuration and backups in the mounted data directory. Successful API and Socket.IO connections select server storage and synchronize open pages. The image now uses Node 22, matching the test runtime.

App Config shows the connection mode, HTTP Auth status, appearance, and backups. HTTP Auth credentials remain server environment variables: `BASIC_AUTH_ENABLED=true`, `BASIC_AUTH_USER`, and `BASIC_AUTH_PASS`. Change them in the Unraid container editor and restart the container. They are never included in exported plan JSON.

## Standalone files

Extract **all** files from `retirement-calculator-standalone.zip` and open `index.html` in Edge or Chrome. Node, Docker, and internet access are unnecessary. Chart.js, Socket.IO's browser client, icons, styles, and the engine are bundled locally. Calculation workers use bundled Blob URLs for `file:` pages, avoiding file-worker import restrictions.

File pages share a small `storage.html` frame. This gives each dedicated page access to the same browser-local storage even in browsers that isolate storage by file path. The bridge accepts messages only from its parent, with keys restricted to this application; pages accept replies only from their own bridge. Browser privacy settings must allow local storage. Export JSON provides a portable backup when changing browsers, folders, or devices.

An unavailable API or failed Socket.IO connection selects local storage and displays **Saved on this device**. Local changes stay local; they are not silently uploaded when the server returns. The cached Docker configuration is stored separately from local edits. To transfer a local plan into Docker, export it while in local mode, reconnect to Docker, then import it. Both modes support scenarios and a maximum of 30 local/server backups respectively. Import validates the plan and runs the engine before replacing saved state.

## Pages and disclosure

| Page | Contents |
| --- | --- |
| Overview | Monthly after-tax spending, retirement ages, projection graph, and a native retirement/withdrawal action plan. |
| Detailed Overview | Net worth, cash flow, contribution targets, yearly ledger, timeline, and risk analysis. |
| Household | People, investment accounts, province, spending, and optional estate/survivor settings. |
| Employment | Salary, dividends, RRSP goals, savings choices, and childcare. |
| Properties | Property and loan balances; Advanced Options contain payments, sales, tax costs, CCA, prepayments, and Smith-style investment borrowing. |
| Pensions | Government and optional workplace pensions; optional earnings-history calculations. |
| Compare scenarios | Separate alternatives with net-worth, tax, benefit and shortfall deltas. |
| Withdrawal strategy | Bounded withdrawal search, apply controls and an exportable annual schedule. |
| App Config | Appearance, HTTP Auth status/instructions, storage mode and backups. |

Every navigation link opens a dedicated HTML page; the server also accepts the corresponding extensionless route. There are no section-anchor navigation links. `config.html` remains a household/setup entry point; `planning.html` remains a scenario entry point for existing bookmarks.

Account and property forms initially show names, ownership, type, and balances/value. Advanced Options use native keyboard-accessible disclosure controls. Help is short inline text associated with its control through `aria-describedby`. FHSA opening-year and room fields appear only when an FHSA account exists. Pensions have compact start-age inputs. Category spending controls were removed: the UI uses the main monthly goal and optional spending phases. Historical category fields can remain in JSON but are not selected by the UI.

## Contribution and optimization behavior

**Goal reached estimate per year** defaults to 85%. The engine first calculates the full RRSP contribution required to reach the chosen tax rate. It then models the selected percentage as the actual contribution, uses that amount for the deduction and room consumption, and calculates any reinvested refund from that contribution. Fixed payroll deposits and HBP repayment budgets remain separate. A 0% estimate gives no extra goal contribution; 100% models the full target.

The Overview action plan calls `solveRetirementAges` and shows the funded candidate's retirement ages/years, benefit commencement ages, projected deposits and first retirement-year withdrawals. Moving one age fixes that person while the other is searched. The net-worth action calls `optimizeWithdrawals` with the estate objective and displays actual annual account withdrawal amounts, tax, ending-wealth change, and any remaining funding shortfall. Results are applied only through the corresponding buttons; input changes cancel stale searches.

These are annual projections under the entered assumptions. The bounded withdrawal search evaluates complete schedules but does not prove a globally optimal dollar-by-dollar strategy. CPP/QPP history mode estimates base and enhanced benefits; missing records, annual-to-monthly allocation, future ceilings, disability enhancement provisions, post-retirement benefits, credit splitting and special QPP provisions limit exactness. Corporate modeling uses editable effective rates and simplified GRIP/refund timing, rather than preparing a T2. GIS/GAINS are annual estimates; refundable provincial benefits outside Ontario GAINS are not comprehensive.

## Build and verification

Run `node scripts/build-client.js` from the repository root (or `npm run build` in `src`). Edit the templates `index.html`, `config.html`, and `planning.html`, plus their shared scripts; this command regenerates dedicated pages and `worker-bundle.js`. Docker runs the same build during image construction.

Run `npm test` in `src` for engine regressions. `python src/test/dual-mode-smoke.py` runs real-server and offline-file browser checks with isolated temporary data. It requires Python Playwright, Edge, Node, and the project's server dependencies. `NODE_EXE`, `NODE_PATH`, and `BROWSER_CHANNEL` can be set for nonstandard installations.

`python scripts/package-standalone.py` writes `dist/retirement-calculator-standalone.zip`, including only public client assets. On pushes to main (and the existing master branch trigger), GitHub Actions builds and tests the client, uploads that ZIP using `actions/upload-artifact@v4`, and builds/pushes the GHCR image. The downloaded Actions artifact contains the standalone ZIP. See the [artifact action documentation](https://github.com/actions/upload-artifact) and [Chart.js script-tag integration](https://www.chartjs.org/docs/latest/getting-started/integration.html).

Calculation references: [CRA CPP contribution ceilings](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html), [Retraite Québec contribution rates](https://www.retraitequebec.gouv.qc.ca/en/professionals-employers/your-role-quebec-pension-plan/contributions-quebec-pension-plan-qpp), [CRA dividend refunds](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4012/t2-corporation-income-tax-guide-chapter-6-pages-6-7-t2-return.html), [CRA interest deductibility](https://www.canada.ca/en/revenue-agency/services/tax/technical-information/income-tax/income-tax-folios-index/series-3-property-investments-savings-plans/series-3-property-investments-savings-plan-folio-6-interest/income-tax-folio-s3-f6-c1-interest-deductibility.html), and [Ontario estate administration tax](https://www.ontario.ca/page/estate-administration-tax).
