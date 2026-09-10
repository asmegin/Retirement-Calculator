# Rental comparison performance

Quick comparison is the default for multiple rentals. It screens up to 120 options with a $25/month spending bracket, then calculates the current plan, keeping the selected rentals and the strongest candidates at full precision. Only verified results can be reviewed or applied. Thorough retains the previous joint search with a 400-option default budget. Small grids and single-rental comparisons remain exhaustive.

## Search and verification

The initial grid samples ten-year intervals, keeping rentals and existing sale dates. Retirement and pension commencement years and their adjacent years supplement that grid. Several promising combinations are refined at five-year and one-year intervals, including mixed future-CCA choices. A final local search moves both dates together for two rentals, so it can cross a small dip that a one-property-at-a-time search would miss. Refinement stops when it finds no screening improvement, completes three final passes, or reaches its option budget.

Screening uses the existing withdrawal solver and stops the outer spending search when its bracket is narrower than $25/month. Finalists use the normal 18-step spending calculation. Current settings and keeping the rentals are always verified; at least the top screened candidates and additional close contenders are checked, up to 24 final rows for larger Quick searches. Search counts and verification counts are reported separately. These limits make the search a heuristic, and even Thorough can miss a better combination.

All displayed spending amounts and supporting tax/estate details use complete calculations. Quick's supporting tax and net-worth recommendations cover its verified spending finalists only. Neither method changes the saved plan during the search. The ordinary Apply/Save workflow, category spending schedules, lifespan and estate settings, and unselected properties' sale dates are preserved.

## Measurements

Measured September 9, 2026 on Windows with Node 22.23.2. Each synthetic fixture ran sequentially through Quick and the v1.0.5 engine at commit `c07a758`, without other project test processes running. These are single-run elapsed timings; actual runtime depends on the plan, processor and other system activity. Amounts below are sustainable after-tax monthly spending in today's dollars.

| Synthetic plan | Quick time | Previous time | Speedup | Quick spending | Previous spending | Previous search |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Short horizon, both rentals eligible for CCA | 13.2 s | 52.8 s | 4.01× | $14,244 | $14,244 | Exhaustive, 325 options |
| Retirement and pension transitions | 38.6 s | 110.7 s | 2.87× | $10,296 | $10,296 | Bounded, 225 options |

Quick searched 120 options and verified 14 complete rows in each case above. Matching these examples is evidence for the tested fixtures, not a guarantee about other plans.

## Reproduce

Run `node scripts/benchmark-rental-search.js` from the repository root. It prints JSON containing elapsed milliseconds, searched/verified counts, spending, selected dates and CCA flags, and the difference from Thorough. Use `--case=0`, `--case=1` or `--case=2` for one example, or `--quick-only` to omit the reference search. The default reference is the current Thorough implementation; `RENTAL_REFERENCE_ENGINE` can point to an earlier copy of `engine.js` placed beside its matching `planning-core.js`.

The Node regressions compare Quick with an exhaustive short-horizon reference, check exact spending for every displayed finalist, preserve category spending and unselected rentals, and enforce search budgets and purchase dates. Browser checks exercise mode selection, result invalidation, cancellation and result counts through real server and offline workers, plus the 320px layout.
