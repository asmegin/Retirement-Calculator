# Retirement Calculator for Canada

A retirement calculator built for **Canada**, for one adult or a couple. Plan with Canadian tax estimates, CPP/QPP, OAS, RRSP/RRIF and TFSA accounts. Explore when you can retire, how much you can spend after tax, which accounts to withdraw from, and when to sell a rental property.

Run it **offline in your browser**, **on Docker/Unraid**, or **locally with Node.js**. No subscription or external financial account connection is required.

**Version 1.0.0** · [Download the standalone app](https://github.com/asmegin/Retirement-Calculator/releases/latest/download/retirement-calculator-standalone.zip) · [Releases](https://github.com/asmegin/Retirement-Calculator/releases) · [Version 1.0 release notes](docs/releases/v1.0.0.md)

If the repository is private, sign in to GitHub with an account that has access before opening these downloads.

## Contents

- [What it does](#what-it-does)
- [Choose an installation](#choose-an-installation)
- [Standalone installation](#standalone-installation)
- [Docker Compose](#docker-compose)
- [Unraid](#unraid)
- [Run from source with Node.js](#run-from-source-with-nodejs)
- [First-time setup](#first-time-setup)
- [Using the app](#using-the-app)
- [Saving, backups and moving your plan](#saving-backups-and-moving-your-plan)
- [Updates](#updates)
- [Configuration and access](#configuration-and-access)
- [Assumptions and limitations](#assumptions-and-limitations)
- [Troubleshooting](#troubleshooting)
- [Development and verification](#development-and-verification)

## What it does

- Projects employment income, savings, debt, retirement spending and net worth year by year.
- Supports RRSP/RRIF, TFSA, FHSA, non-registered investments, corporate investments and defined contribution accounts.
- Models CPP/QPP, OAS, optional workplace pensions, pension income splitting and estimated GIS/benefits.
- Searches for earlier retirement dates, including retirement dates close together for couples.
- Compares withdrawal orders for lower lifetime tax, higher ending net worth or more sustainable spending, and searches annual registered-account withdrawal targets.
- Compares rental sale years, keeping a rental, continuing or stopping future CCA claims, capital gains, recapture and terminal losses.
- Lets the retirement search consider selling rental properties.
- Compares scenarios such as different retirement dates, pension start ages or downsizing a home.
- Tests expected returns, lower returns, a difficult first decade and Monte Carlo market paths.
- Provides optional estate/survivor settings, debt prepayment comparisons and investment borrowing modelling.
- Includes light/dark appearance, mobile layouts, JSON backup/transfer and CSV exports.

## Choose an installation

| Method | Best for | Requirements | Where the plan is saved |
| --- | --- | --- | --- |
| Standalone ZIP | The easiest way to use it on one computer | A recent desktop Edge or Chrome browser | Browser storage on that device |
| Docker / Unraid | A shared household plan accessible from several devices | Docker Engine/Desktop with Compose, or Unraid | Your mounted server data directory |
| Node.js source | Local hosting or development | Node.js 22+, npm, and the source files | The directory you set as `DATA_DIR` |

The server hosts **one shared plan**, not separate user accounts. Anyone with access can change that plan. In standalone mode, different browsers or devices have separate plans.

## Standalone installation

1. Open [Releases](https://github.com/asmegin/Retirement-Calculator/releases/latest).
2. Download **retirement-calculator-standalone.zip** from **Assets**. Choose this file rather than GitHub's automatically generated “Source code” archive.
3. Extract the **entire ZIP** into a folder you intend to keep.
4. Open **index.html** in Edge or Chrome. The address will begin with `file:`.
5. Go to **Configuration → Household → Setup Wizard** to enter your information.

Keep all the extracted files together. No Node.js, Docker, server or internet connection is needed after downloading. Allow the browser to use local storage and avoid private/incognito mode for a plan you want to retain.

The app should show **Saved on this device**. Your financial plan is stored by the browser, **not written into index.html or the extracted folder**. Use **Export JSON** regularly, especially before moving the folder or clearing browser data.

The release also includes **SHA256SUMS.txt**. Optional download verification:

```powershell
# Windows PowerShell: compare this hash with SHA256SUMS.txt.
Get-FileHash .\retirement-calculator-standalone.zip -Algorithm SHA256
```

```bash
# Linux: place the ZIP and SHA256SUMS.txt in the same directory.
sha256sum -c SHA256SUMS.txt
```

## Docker Compose

Install [Docker with Compose](https://docs.docker.com/compose/install/). Get the source using Git or GitHub's **Code → Download ZIP**, then open a terminal in the extracted repository directory.

```bash
git clone https://github.com/asmegin/Retirement-Calculator.git
cd Retirement-Calculator
docker compose up -d
```

Open **http://localhost:3333**, or **http://YOUR-SERVER-IP:3333** from another device on your network.

The included [compose.yaml](compose.yaml) uses `ghcr.io/asmegin/retirement-calculator:1.0.0`, restarts automatically, and stores the shared plan and backups in `./data`. Keep that directory when updating or replacing the container.

Useful commands, run from the same directory:

```bash
docker compose logs -f retirement-calculator
docker compose stop
docker compose start
```

If the container package is private, sign in first with `docker login ghcr.io --username YOUR_GITHUB_USERNAME`. Use a GitHub personal access token with `read:packages` as the password, from an account allowed to read the package. Do not put the token in the Compose file. Alternatively, build from source using the commands below.

To change the host port, copy [.env.example](.env.example) to `.env`, set `HOST_PORT=3334`, and run `docker compose up -d` again. The internal container port remains 3333. Compose reads `.env`; a direct Node.js launch does not.

To build the image yourself instead of downloading it:

```bash
docker build -t retirement-calculator:1.0.0 ./src
docker run -d --name retirement-calculator --restart unless-stopped -p 3333:3333 -v retirement-calculator-data:/app/data retirement-calculator:1.0.0
```

This `docker run` example uses a Docker named volume, separate from Compose's `./data` directory. Use one installation method for a given plan, or transfer the plan with Export/Import JSON.

## Unraid

In **Docker → Add Container**, use:

| Setting | Value |
| --- | --- |
| Name | `retirement-calculator` |
| Repository | `ghcr.io/asmegin/retirement-calculator:1.0.0` |
| Network type | `Bridge` |
| Container port | `3333` / TCP |
| Host port | `3333`, or another unused port |
| Container path | `/app/data` |
| Host path | `/mnt/user/appdata/retirement-calculator` |
| WebUI | `http://[IP]:[PORT:3333]` |

Apply the settings and open the WebUI. The app creates its configuration and backups in the mapped appdata directory. Include this directory in your Unraid backup routine.

Optional HTTP authentication is configured with container variables, described under [Configuration and access](#configuration-and-access). Restart the container after changing them.

## Run from source with Node.js

Install [Node.js](https://nodejs.org/) **22 or later**, including npm. Clone or download this repository, open a terminal in its root directory, then install and build:

```bash
cd src
npm install
npm run build
```

Start it with a writable data directory. The following examples are run from `src` and bind to this computer only.

**Windows PowerShell**

```powershell
$env:DATA_DIR = Join-Path (Get-Location) '..\data'
$env:BIND = '127.0.0.1'
$env:PORT = '3333'
npm start
```

**macOS / Linux**

```bash
DATA_DIR="$(pwd)/../data" BIND=127.0.0.1 PORT=3333 npm start
```

Open **http://localhost:3333**. Keep the terminal running; press **Ctrl+C** to stop. To allow other devices on your network, set `BIND=0.0.0.0` and allow the port through your firewall.

## First-time setup

The app contains example values. Replace them and remove any accounts, properties, children, pensions or debts that do not apply to you. A newly initialized server opens setup when you enter a configuration page; you can reopen **Setup Wizard** from any configuration page.

Have your account balances, contribution room, pension estimates and property/debt details available.

1. **Household:** choose one or two adults, province, names, birth years and relevant childcare information.
2. **Plan settings:** enter your desired monthly **after-tax** spending in **today's Canadian dollars**, retirement ages, planning lifespan, inflation and return assumptions. Decide whether the spending goal already includes debt payments.
3. **Employment:** enter annual salary, business dividends if applicable, deductions and savings assumptions. Review **Goal reached estimate per year**: it controls how much of a calculated RRSP contribution target you expect to achieve.
4. **Accounts:** enter balances, ownership, growth assumptions, contribution amounts/frequency and unused contribution room. Use Advanced Options for taxable cost basis, FHSA details, employer matches and other account-specific settings.
5. **Pensions:** enter CPP/QPP and OAS estimates and start ages. Add a workplace pension only if you have one. Start with statement estimates; earnings-history mode is optional.
6. **Properties:** add your home, rentals, mortgages and HELOCs. Review Advanced Options for payments, rental costs, ownership, selling costs and tax information.
7. Select **Save changes** on each configuration page you edit. Check **Overview**, then run **Action plan → Check current status**.
8. Select **Export JSON** to keep an initial backup.

Labels show whether amounts are monthly, yearly or percentages. For an existing loan, enter its **current balance**, rate and payment. For a rental, enter **remaining UCC**, not the total depreciation already claimed. Opening contribution room should come from your own records; it is different from the account balance.

## Using the app

### Navigation and results

| Page | Use it to |
| --- | --- |
| Overview | Adjust the spending goal and retirement-age sliders, and view the main projection. |
| Plan details | Inspect charts, the yearly ledger, individual year details, contribution targets, timeline and market analysis. Export the ledger or print. |
| Configuration | Edit Household, Accounts, Employment, Properties and Pensions. Open Advanced Options for detailed inputs. |
| Plan settings | Change spending, planning assumptions, spending phases and optional estate/survivor settings. |
| Action plan | Check funding, find earlier retirement dates, increase net worth or reduce lifetime tax. |
| Compare scenarios | Try an alternative retirement date, pension start or home and compare it with the current plan. |
| Withdrawal strategy | Compare account orders, then search and export an annual withdrawal schedule. |
| App Config | Change appearance, view connection/authentication status and manage backups. |

On smaller screens, open **Menu** to reveal navigation. Wide result tables scroll sideways. Long calculations run in a worker; use their **Cancel** button to stop a search.

“Today’s dollars” remove the modelled effect of inflation. Lifetime tax totals in the comparison tools are future/nominal dollars. A spending shortfall means the projected cash and available withdrawals cannot cover the modelled requirement for that year. A funded projection depends on the entered assumptions; it is not a guaranteed outcome.

### Withdrawal order and strategy finder

Select **Compare withdrawal options** on Overview or **Calculate best withdrawal options** beside the withdrawal order in Plan details. Both open the same **Withdrawal strategy** page.

The comparison includes your current settings and all five account orders. It highlights options for **lowest lifetime tax**, **highest ending net worth**, and **most monthly spending**, with changes from your current plan. Review an option to see how its order works. **Use this withdrawal order** changes the workspace; select **Save plan** to keep it. Applying an order does not automatically raise your spending goal to the sustainable-spending estimate.

Below it, **Find a withdrawal plan** also searches annual RRSP/RRIF targets. Choose a tax, benefits or estate objective, review the result, use the plan, then save. You can export the annual withdrawal schedule.

### When to sell a rental

Go to **Properties → When should I sell my rental?**. Check the property's total adjusted cost, building cost excluding land, building share of sale proceeds, remaining UCC, ownership, debt, rental expenses and selling costs first.

Choose a rental and select **Calculate best sale years**. Optionally compare stopping future CCA claims. Review a year to see sale proceeds, mortgage discharge, capital gain, recapture, terminal loss and estimated tax. **Use this sale and CCA setting** updates the editor; **Save changes** keeps it. Historical CCA can still be recaptured even if future claims are stopped.

The comparison tests keeping the rental and selling at the **start** of each projected year. It includes terminal tax for the keep option as well, using the configured lifespans. Attached HELOCs continue under their entered schedules. The tool explains its tax assumptions below the results. Applying a property alternative clears an existing annual withdrawal schedule so withdrawals can be recalculated.

### Retire sooner, together

In **Action plan**, select **Find earliest retirement**. For a couple, open the search preferences to choose how far apart to retire or hold one person's retirement age fixed. The search tests whole years through age 75, before the planning horizon; past retirement dates remain fixed.

Enable **Consider selling rental properties** to include rental sales. With one rental, every projected sale year is tested. With multiple rentals, this search tests selling them all in a common year, as well as the current dates and keeping them. It does not try every possible combination of separate sale dates.

Review the proposed ages and rental dates, then **Apply** to save the result. Run **Check current status** again to examine market uncertainty under the updated plan.

### Tax-saving steps and market checks

**Find steps to reduce taxes** and **Find steps to increase net worth** show current and proposed values with signed changes. Lower tax is green; higher tax is red. Higher net worth or benefits is green. Signs and “better/worse” text accompany the colours.

**Check current status** compares your selected return assumptions with a difficult first decade and Monte Carlo simulations. Its percentage is the share of simulated paths that funded the plan, not a promised probability of success. Review spending, contribution affordability and the first shortfall year as well as the ending net worth.

### Scenarios and saving behaviour

Use **Compare scenarios** to experiment without immediately replacing the current plan. **Save sandbox as scenario** stores an alternative; **Use sandbox in this workspace** previews it as the workspace plan. **Save plan** then replaces the current saved plan.

| Action | Effect |
| --- | --- |
| Edit a configuration field | Unsaved until **Save changes**. |
| Change an Overview control | Automatically recalculates and saves after a short pause. |
| Run a comparison/search | Calculates a proposal without saving it. |
| Apply a result in Action plan | Applies **and saves** the proposed plan. |
| Use a result in Properties or Withdrawal strategy | Updates that page; **Save changes / Save plan** is still required. |
| Import JSON | Replaces the current saved plan with the imported plan. |

## Saving, backups and moving your plan

**Export JSON** is the portable backup of your financial plan. Use **Import JSON** to restore it or transfer it between devices, browsers or installation methods. Scenario collections are separate from the main plan JSON; save/export any alternative you want to move as its own plan, or back up the server data directory for the complete collection.

**Back up now** and **App Config → Backups** provide local/server snapshots. Up to 30 backups are retained. Restore replaces the current saved plan. Export a copy first if you also want to keep the current version.

In server mode, the data directory contains:

```text
data/
  config.json       Current shared plan
  scenarios.json    Saved scenarios, once created
  backups/          Configuration snapshots
```

Back up this directory independently of the container. Do not delete it when updating. Browser-only plans and backups can be lost when browser storage is cleared; keep JSON exports outside the browser.

**Connected to Docker** means the app is using the Node/Docker server and synchronizing saved changes between open pages. If the API or live connection cannot be reached, it falls back to **Saved on this device**. Changes in that mode stay local and are not automatically uploaded on reconnection. To transfer them, export the local plan, reconnect to the server and import it there.

## Updates

**Standalone:** export your plan, download and fully extract the new release into its own folder, open its `index.html`, and import your plan if necessary. Moving folders can change which browser storage is available.

**Docker Compose:** back up `data`, change the image version in `compose.yaml` or set `APP_VERSION` in `.env`, then run:

```bash
docker compose pull
docker compose up -d
```

**Unraid:** back up appdata, change the Repository tag to the desired release and apply/update the container. Keep the `/app/data` mapping.

**Node.js:** back up the data directory, stop the server, get the new source, run `npm install` and `npm run build` from `src`, then restart with the same `DATA_DIR`.

Use a numbered image such as `1.0.0` for a fixed release. The `latest` image also follows builds from the main branch and can contain changes newer than the last release. Before rolling back to older source, keep an export and a copy of the data directory; older versions may not understand newer settings.

## Configuration and access

| Server environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3333` | HTTP port inside the server/container. |
| `BIND` | `0.0.0.0` | Listening address. Use `127.0.0.1` for a local Node-only installation. |
| `DATA_DIR` | `/app/data` | Writable directory for the shared plan, scenarios and backups. Set explicitly outside Docker. |
| `BASIC_AUTH_ENABLED` | Disabled | Set to the literal `true` to require HTTP authentication. |
| `BASIC_AUTH_USER` | Unset | Username when authentication is enabled. |
| `BASIC_AUTH_PASS` | Unset | Password when authentication is enabled. |

For Compose, copy `.env.example` to `.env`, set the authentication variables there, and recreate the container with `docker compose up -d`. For Unraid, add container variables. A direct Node launch needs these variables in its process environment. Authentication settings are not edited inside the app. Both username and password are required when it is enabled.

HTTP Basic authentication protects pages and live connections but does not encrypt traffic. Use a trusted private network or an HTTPS reverse proxy/VPN for remote access. The default server has no login requirement; it is intended for a trusted household environment. Plan exports and server data files contain financial information and are not encrypted by the app.

## Assumptions and limitations

This is a planning calculator, not tax-return software or a financial recommendation. Its results depend on the data you enter. Review consequential tax, pension and property decisions with an appropriate professional.

- The app estimates Canadian federal/provincial tax. Its tax thresholds use a 2025 base indexed with your inflation assumption; it does not automatically download new tax legislation.
- Benefits, CPP/QPP history, corporate tax balances and survivor calculations have simplifying assumptions. Not all credits, premiums, special elections or individual circumstances are modelled.
- Rental comparisons assume an established, personally owned long-term rental and a separate building CCA class. Corporate rentals, flipped properties, changes of use, GST/HST and capital-loss carryovers need separate assessment.
- Rental keep/sell comparisons include terminal tax for comparability; this does not automatically enable estate modelling in the saved plan. Enable and review Estate and survivor settings for the main projection if you want that behaviour there.
- Searches report the best of the tested options, not a guaranteed global optimum. Sustainable monthly spending is searched up to $40,000/month. Market simulations cannot predict future returns.
- Different displays use future dollars or today's dollars; check the label before comparing totals.

See [calculation notes and sources](docs/calculation-notes.md), [withdrawal/rental comparison assumptions](docs/withdrawal-and-rental-comparisons.md), and [storage and architecture notes](docs/standalone-and-interface.md) for details.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Standalone page is blank or a calculation will not start | Extract all files before opening `index.html`; keep scripts and folders together. Try recent desktop Edge/Chrome and allow local storage. |
| Plan disappeared after moving folders, changing browsers or clearing data | Those actions can change/remove browser storage. Import a previously exported JSON plan. |
| A server installation says “Saved on this device” | Check the server/container, host/port, authentication, firewall and reverse proxy. Live Socket.IO connections must work as well as page requests. Export local edits before reconnecting. |
| Docker image download is denied | Check the repository/tag spelling and package visibility. A private GHCR package requires a GitHub login with package-read access; you can also build from source. |
| Port 3333 is already used | Change Compose's `HOST_PORT`, Unraid's host port, or the Node `PORT` variable. Open the corresponding URL. |
| Node/Docker reports data-directory permission errors | Set `DATA_DIR` to a writable path or correct the mounted directory permissions. Avoid using `/app/data` as an unconfigured desktop path. |
| Authentication prevents startup or repeatedly prompts | Set `BASIC_AUTH_ENABLED=true` with both credentials, recreate/restart the server, and check for stale credentials in the browser. |
| A property, income or account field is missing | Open that record's Advanced Options. Some fields depend on household or account type. |
| A rental calculation asks for cost/UCC corrections | Check that UCC is no larger than building cost, building cost is no larger than total adjusted cost, and all amounts describe the property you currently own. |
| A search finds no funded plan | Check spending units, balances, debt payments, contribution affordability, pension dates, lifespan and retirement-gap preferences. The search may need less spending or later retirement. |
| A comparison looks out of date | Save changed settings and run the search again. A property/retirement change can invalidate a saved annual withdrawal schedule. |
| Changes did not persist | Check the table under Saving behaviour, the page's save status, and whether you are in server or local mode. |

For a bug report, use [GitHub Issues](https://github.com/asmegin/Retirement-Calculator/issues) and include the app version, browser, installation method, steps to reproduce, and expected versus actual behaviour. Redact names, balances, credentials and other private information before attaching screenshots or a sample plan.

## Development and verification

From the repository root:

```bash
node scripts/build-client.js
cd src
npm install
npm test
cd ..
python scripts/package-standalone.py
```

Edit `src/public/index.html`, `config.html`, `planning.html` and their shared scripts. The build generates dedicated pages and `worker-bundle.js`; rebuild after changing the engine or templates so offline workers match the server. `src/server.js` hosts the app, and `src/public/engine.js` is shared between Node and the browser.

The standalone packager writes the ZIP and `SHA256SUMS.txt` into `dist`. It includes client assets and user documentation, without server data or configuration secrets.

The calculation suite contains 54 tests in version 1.0. Browser checks additionally exercise a temporary server and offline file pages. They require Python, Playwright, Edge and installed server dependencies:

```bash
python -m pip install playwright
python src/test/dual-mode-smoke.py
```

The browser suite defaults to the installed Microsoft Edge channel. `BROWSER_CHANNEL`, `NODE_EXE` and `NODE_PATH` can override browser/runtime locations.

GitHub Actions builds/tests the client and publishes the Docker image on pushes to `main`/`master`. A `v*` release tag must match `src/package.json`; its build publishes a versioned container and creates a GitHub Release with the standalone ZIP, checksum and `docs/releases/<tag>.md` notes. [Workflow](.github/workflows/docker-build.yaml) · [Docker metadata action](https://github.com/docker/metadata-action) · [GitHub release CLI](https://cli.github.com/manual/gh_release_create)

Third-party browser library notices are in [vendor/LICENSES.txt](src/public/vendor/LICENSES.txt).
