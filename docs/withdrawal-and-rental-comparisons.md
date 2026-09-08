# Withdrawal and rental decisions

The withdrawal order control in Plan details links to **Calculate best withdrawal options**. Overview also links directly to the same comparison. **Plan → Withdrawal strategy** compares current settings (including a saved annual schedule) with all five withdrawal orders. It recommends the lowest lifetime tax and highest ending net worth among paths that fund current spending, and the highest estimated sustainable monthly spending among all tested orders. Spending estimates use the existing $40,000/month search ceiling. Applying an order keeps the spending goal; Save plan persists it. The existing annual RRSP/RRIF schedule optimizer follows the comparison and uses the same engine.

**Properties → When should I sell my rental?** compares the selected property's current sale/CCA settings, keeping it, and selling at the start of every projected year. The optional CCA comparison also tests stopping future claims. Past CCA remains reflected in opening UCC. Other properties retain their dates. Results include signed tax and wealth changes, funding status, and a sale breakdown: selling costs, mortgage discharge, capital gain, recapture, terminal loss and estimated sale-income tax. The tax estimate removes sale income while holding other income and withdrawals constant; it includes all property sales in that year and OAS recovery. Lifetime results include subsequent GIS effects.

All rental alternatives include terminal tax at the same configured lifespans, including the keep option. This comparison does not turn on estate modelling in the saved plan. Alternatives clear saved annual withdrawal targets, as applying property changes requires recalculation. They retain the selected withdrawal order. Results therefore describe the combined sale/CCA choice and recalculated withdrawals. The current-settings row preserves the original schedule. Apply changes the sale year and future CCA flag in the property editor; Save changes persists them. Attached HELOCs continue under their entered repayment schedules. Sales occur before that year's rent, mortgage payments, prepayments and new Smith borrowing.

**Action plan → Retire sooner, together** can consider selling rental properties. For each retirement-age candidate, it tests the existing rental dates, keeping all rentals, and selling all rentals in each common calendar year. It picks the earliest funded retirement combination using the existing age/gap preferences, then the highest ending net worth among the sale schedules at those ages. For one rental this tests every sale year; for multiple rentals it does not enumerate all independently staggered sales. Apply saves both retirement ages and returned rental dates, and clears the old withdrawal schedule. This search retains the plan's current estate settings.

**Steps to reduce lifetime tax** shows Current → Proposed values and signed changes. Tax reductions are green, tax increases red; increases in net worth or benefits are green. Words and signs accompany the colours. The same comparison works for the net-worth action.

## Tax basis and limits

Rules checked September 8, 2026: capital gains have a 50% inclusion rate, CCA recapture is ordinary income, and CCA cannot create or increase an aggregate rental loss. The proposed inclusion-rate increase was cancelled. Sources: [CRA rental-income guide](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4036/rental-income.html), [CRA selling rental property](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/rental-income/capital-cost-allowance-rental-property/determining-capital-cost-property-special-situations/selling-your-rental-property.html), and [March 2025 cancellation announcement](https://www.pm.gc.ca/en/news/news-releases/2025/03/21/prime-minister-mark-carney-cancels-proposed-capital-gains-tax-increase).

The model assumes established personally owned long-term rentals with a separate building CCA class emptied on sale. Enter building cost excluding land, a supportable allocation of proceeds, total adjusted cost, UCC, ownership, costs and debt. Land gains can reduce a building terminal loss. Corporate rentals, flipped properties, changes of use, GST/HST, special elections and capital-loss carryovers require separate analysis. Tax brackets retain the application's 2025 base indexed by the plan's inflation assumption; these are planning estimates, not tax-return calculations. Future laws and market returns are unknown. Each recommendation is best among the options tested, not a proof of a global optimum.

## Review and verification

The review covered calculation paths, worker parity, configuration and scenario storage, API validation, navigation/resources, responsive layouts and the main browser workflows. Corrections include:

- Keeping the saved withdrawal schedule in the optimization baseline and fallback.
- Charging opening mortgage debt at a start-of-year sale, retaining underwater sale deficits, and avoiding sale-year prepayments/new investment advances.
- Honouring entered payments on zero-interest loans.
- Recognizing terminal rental losses and the associated reduction in final-year tax.
- Rejecting unfunded pre-retirement contributions in sustainable-spending and Monte Carlo success checks.
- Preserving unsaved planning workspace edits when another window updates the saved plan.
- Giving local scenarios a saved date, rendering scenario names as text, rejecting malformed API configurations, and clearing an annual schedule for an explicit projection strategy override.

The automated engine suite has 54 tests. Browser checks exercise both a temporary real server and offline `file:` pages, including rental/withdrawal comparisons, Apply versus Save, joint retirement with rentals, baseline deltas, import/export, cross-page synchronization, pensions, scenario previews, cancellation, mobile layout and themes. Build regenerates dedicated pages and the offline worker source. Standalone packaging includes the new comparison script and worker.
