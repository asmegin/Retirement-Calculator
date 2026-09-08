'use strict';
/* =============================================================================
   Lifecycle Drawdown Engine — simulation core (v3)
   Runs identically in the browser (window.RetireEngine) and in Node (require).
   Money is NOMINAL; every year carries a `deflator` for today's-dollar display.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.RetireEngine = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  var Planning = typeof module === 'object' && module.exports ? require('./planning-core.js') : self.PlanningCore;

  /* ---------------------------------------------------------------- helpers */
  function num(v, d) { var x = parseFloat(v); return isFinite(x) ? x : (d === undefined ? 0 : d); }
  function int(v, d) { var x = parseInt(v, 10); return isFinite(x) ? x : (d === undefined ? 0 : d); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* --------------------------------------------- tax parameters (2025 base) */
  var TAX_BASE_YEAR = 2025;
  var FED = {
    brackets: [[57375, 0.14], [114750, 0.205], [177882, 0.26], [253414, 0.29], [Infinity, 0.33]],
    bpa: 16129, ageAmt: 9028, ageThresh: 45522, pensionAmt: 2000, creditRate: 0.14
  };
  var ONT = {
    brackets: [[52886, 0.0505], [105775, 0.0915], [150000, 0.1116], [220000, 0.1216], [Infinity, 0.1316]],
    bpa: 12747, ageAmt: 6142, ageThresh: 46006, pensionAmt: 1641, creditRate: 0.0505,
    surtax1: 5710, surtax2: 7307
  };
  /* 2025 annual schedules; future years use the plan's inflation assumption.
     Sources: CRA T4127 (January/July 2025), provincial 428 forms/worksheets,
     https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package.html
     Pension amounts: https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31400-pension-income-amount.html
     Quebec: https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf
     Rates are annual rates (Alberta 8%, not the July payroll catch-up 6%). */
  function schedule(name, brackets, bpa, ageAmt, ageThresh, pensionAmt, eligible, nonEligible) {
    return { name: name, brackets: brackets, bpa: bpa, ageAmt: ageAmt, ageThresh: ageThresh,
      pensionAmt: pensionAmt, creditRate: brackets[0][1], dividendEligible: eligible, dividendNonEligible: nonEligible };
  }
  var PROVINCES = {
    ON: Object.assign(ONT, { name:'Ontario', ageAmt:6223, ageThresh:46330, pensionAmt:1762, dividendEligible:0.10, dividendNonEligible:0.029863 }),
    BC: schedule('British Columbia', [[49279,.0506],[98560,.077],[113158,.105],[137407,.1229],[186306,.147],[259829,.168],[Infinity,.205]],12932,5799,43169,1000,.12,.0196),
    AB: schedule('Alberta', [[60000,.08],[151234,.10],[181481,.12],[241974,.13],[362961,.14],[Infinity,.15]],22323,6221,46308,1719,.0812,.0218),
    QC: schedule('Quebec', [[53255,.14],[106495,.19],[129590,.24],[Infinity,.2575]],18571,3906,42090,3470,.117,.0342),
    MB: schedule('Manitoba', [[47000,.108],[100000,.1275],[Infinity,.174]],15780,3728,27749,1000,.08,.007835),
    SK: schedule('Saskatchewan', [[53463,.105],[152750,.125],[Infinity,.145]],19491,5785,43066,1000,.11,.02105),
    NS: schedule('Nova Scotia', [[30507,.0879],[61015,.1495],[95883,.1667],[154650,.175],[Infinity,.21]],11744,5734,30828,1173,.0885,.015),
    NB: schedule('New Brunswick', [[51306,.094],[102614,.14],[190060,.16],[Infinity,.195]],13396,6037,44945,1000,.14,.0275),
    NL: schedule('Newfoundland and Labrador', [[44192,.087],[88382,.145],[157792,.158],[220910,.178],[282214,.198],[564429,.208],[1128858,.213],[Infinity,.218]],11067,7064,38712,1000,.063,.032),
    PE: schedule('Prince Edward Island', [[33328,.095],[64656,.1347],[105000,.166],[140000,.1762],[Infinity,.19]],14650,6510,36600,1000,.105,.013),
    YT: schedule('Yukon', [[57375,.064],[114750,.09],[177882,.109],[500000,.128],[Infinity,.15]],16129,9028,45522,2000,.1202,.0067),
    NT: schedule('Northwest Territories', [[51964,.059],[103930,.086],[168967,.122],[Infinity,.1405]],17842,8727,45522,1000,.115,.06),
    NU: schedule('Nunavut', [[54707,.04],[109413,.07],[177881,.09],[Infinity,.115]],19274,12303,45522,2000,.0551,.0261)
  };
  var OAS_CLAWBACK_THRESHOLD = 93454;
  var OAS_CLAWBACK_RATE = 0.15;
  var TFSA_ANNUAL_ROOM = 7000;
  var RRSP_DOLLAR_LIMIT = 32490;
  var RRSP_EARNED_PCT = 0.18;
  var CCA_RATE = 0.04;                 /* Class 1 rental building, declining balance */
  var CAPITAL_GAINS_INCLUSION = 0.5;
  /* Childcare expense limits are NOT indexed by CRA. */
  var CHILDCARE_LIMIT_UNDER_7 = 8000;
  var CHILDCARE_LIMIT_7_TO_16 = 5000;
  var CHILDCARE_EARNED_FRACTION = 2 / 3;

  var RRIF_FACTORS = {
    71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582, 76: 0.0598,
    77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682, 81: 0.0708, 82: 0.0738,
    83: 0.0771, 84: 0.0808, 85: 0.0851, 86: 0.0899, 87: 0.0955, 88: 0.1021,
    89: 0.1099, 90: 0.1192, 91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879, 95: 0.2000
  };
  function rrifFactor(age) {
    if (age < 71) return age >= 90 ? 0.2 : 1 / (90 - age);
    return RRIF_FACTORS[Math.min(age, 95)];
  }

  var WITHDRAWAL_ORDERS = {
    'tfsa-first':    ['TFSA', 'TAXABLE', 'RRSP'],
    'rrsp-first':    ['RRSP', 'TAXABLE', 'TFSA'],
    'taxable-first': ['TAXABLE', 'RRSP', 'TFSA'],
    'min-tax':       ['TFSA', 'TAXABLE', 'RRSP'],
    'oas-smart':     ['TFSA', 'TAXABLE', 'RRSP']
  };

  /* ------------------------------------------------------------- defaults  */
  function defaultConfig() {
    return {
      incomes: [
        { name: 'Jon', birthYear: 1985, salary: 130000, salaryGrowth: 3,
          cppBaseAt65: 1141, oasBaseAt65: 751, targetRetireAge: 55,
          cppStartAge: 65, oasStartAge: 65, hooppStartAge: null,
          rrspRoomOpening: 112212, tfsaRoomOpening: 103319,
          hbpAnnual: 1516, hbpYears: 5 },
        { name: 'Kristen', birthYear: 1987, salary: 105000, salaryGrowth: 3,
          cppBaseAt65: 1141, oasBaseAt65: 751, targetRetireAge: 55,
          cppStartAge: 65, oasStartAge: 65, hooppStartAge: null,
          rrspRoomOpening: 112212, tfsaRoomOpening: 103319,
          hbpAnnual: 1516, hbpYears: 10 }
      ],
      assumptions: {
        province: 'ON', householdType: 'couple', gisEnabled: true,
        desiredMonthlyIncome: 13000,
        inflation: 2.1,
        rentalIncomeInflation: 1.5,
        targetDeathAge: 90,
        withdrawalStrategy: 'tfsa-first',
        returnMode: 'deterministic',
        conservativeDelta: 2,
        badDecadeDelta: 4,
        mcRuns: 500,
        mcVolatility: 12,
        vacancyRate: 8,
        rentalOwnerSplit: 50,
        spendingIncludesDebtPayments: true,
        applySpendingBeforeRetirement: false,
        optimizePensionSplit: true,
        reinvestSurplus: true,
        reinvestPayoffPayments: true,
        hooppIndexRate: 2,
        hooppIndexBeforeStart: false,
        optimizeContributions: true,
        rrspMinMarginalRate: 35,
        contributionSlice: 500,
        reinvestRefund: true,
        spendingPhases: [
          { untilAge: 75, factor: 100 },
          { untilAge: 85, factor: 92 },
          { untilAge: 999, factor: 85 }
        ],
        childcare: {
          childrenBirthYears: [2018, 2020, 2022],
          items: [
            { name: 'Daycare', amount: 10000, startYear: 2026, endYear: 2026, declinePerYear: 0 },
            { name: 'Aftercare', amount: 10000, startYear: 2026, endYear: 2031, declinePerYear: 2000 },
            { name: 'Summer camps', amount: 6000, startYear: 2026, endYear: 2032, declinePerYear: 1000 }
          ]
        }
      },
      accounts: [
        { name: 'Questrade RRSP', owner: 'Jon', type: 'RRSP', balance: 40000, contribAmt: 750,
          contribFreq: 'monthly', contribGrowth: 3, growthRate: 7, solveToTarget: true },
        { name: 'Questrade TFSA', owner: 'Jon', type: 'TFSA', balance: 3000, contribAmt: 10000,
          contribFreq: 'yearly', contribGrowth: 2, growthRate: 7, flexible: true, reinvestTarget: true },
        { name: 'Manulife Group RRSP', owner: 'Jon', type: 'RRSP', balance: 50000, contribAmt: 262,
          contribFreq: 'semimonthly', contribGrowth: 3, growthRate: 7, flexible: false,
          employerMatchPct: 5, annualBonus: 0, hbpAccount: true },
        { name: 'Tangerine TFSA', owner: 'Kristen', type: 'TFSA', balance: 1000, contribAmt: 50,
          contribFreq: 'weekly', contribGrowth: 2, growthRate: 5, flexible: true },
        { name: 'Tangerine RRSP', owner: 'Kristen', type: 'RRSP', balance: 30000, contribAmt: 50,
          contribFreq: 'weekly', contribGrowth: 3, growthRate: 5, flexible: true, hbpAccount: true }
      ],
      hooppTiers: [
        { startAge: 55, lifetime: 2460, bridge: 540 },
        { startAge: 60, lifetime: 4180, bridge: 990 },
        { startAge: 65, lifetime: 5550, bridge: 0 }
      ],
      dbPensions: [],
      realEstate: [
        { name: 'Principal Residence', type: 'principal', value: 950000, appreciation: 3,
          mortgage: 478533.23, interestRate: 3.69, renewalYear: 2028, renewalRate: 3.69,
          paymentBiweekly: 1500, paymentMonthly: 0, payoffYear: 2042,
          grossRentMonthly: 0, annualPropertyTax: 6000, annualInsurance: 1800, annualMaintenance: 3000,
          attachToRental: false, interestDeductible: false, reinvestOnPayoff: true,
          acb: 0, saleYear: 0, sellingCostPct: 5, ccaEnabled: false, uccPool: 0 },
        { name: 'Rental Property', type: 'rental', value: 650000, appreciation: 3,
          mortgage: 426531.48, interestRate: 3.73, renewalYear: 2028, renewalRate: 3.73,
          paymentBiweekly: 0, paymentMonthly: 2118.69, payoffYear: 2052,
          grossRentMonthly: 4583, annualPropertyTax: 4820, annualInsurance: 2111, annualMaintenance: 2000,
          otherAnnualInterest: 0,
          attachToRental: false, interestDeductible: true, reinvestOnPayoff: true,
          acb: 735000, saleYear: 0, sellingCostPct: 5, ccaEnabled: true, uccPool: 361225 },
        { name: 'Principal HELOC', type: 'heloc', value: 0, appreciation: 0,
          mortgage: 291400, interestRate: 3.75, renewalYear: 2028, renewalRate: 3.75,
          paymentBiweekly: 753.51, paymentMonthly: 0, payoffYear: 2048,
          grossRentMonthly: 0, annualPropertyTax: 0, annualInsurance: 0, annualMaintenance: 0,
          attachToRental: true, interestDeductible: true, reinvestOnPayoff: true,
          acb: 0, saleYear: 0, sellingCostPct: 0, ccaEnabled: false, uccPool: 0 }
      ]
    };
  }

  /* ------------------------------------------------------------ normalize  */
  function normalizeConfig(raw) {
    var d = defaultConfig();
    var c = raw && typeof raw === 'object' ? clone(raw) : {};

    c.incomes = Array.isArray(c.incomes) && c.incomes.length ? c.incomes.slice(0, 2) : d.incomes;
    while (c.incomes.length < 2) c.incomes.push(clone(d.incomes[c.incomes.length]));
    c.incomes = c.incomes.map(function (p, idx) {
      p = p || {};
      var dp = d.incomes[idx];
      return Object.assign({}, p, {
        name: p.name || dp.name,
        birthYear: int(p.birthYear, dp.birthYear),
        salary: num(p.salary, dp.salary),
        salaryGrowth: num(p.salaryGrowth, dp.salaryGrowth),
        cppBaseAt65: num(p.cppBaseAt65, dp.cppBaseAt65),
        oasBaseAt65: num(p.oasBaseAt65, dp.oasBaseAt65),
        targetRetireAge: int(p.targetRetireAge, dp.targetRetireAge),
        cppStartAge: clamp(int(p.cppStartAge, 65), 60, p.cppPlan === 'QPP' ? 72 : 70),
        oasStartAge: clamp(int(p.oasStartAge, 65), 65, 70),
        hooppStartAge: p.hooppStartAge === undefined ? (dp.hooppStartAge || null)
          : (p.hooppStartAge === '' || p.hooppStartAge === null ? null : int(p.hooppStartAge, 55)),
        incorporated: p.incorporated === true,
        eligibleDividends: Math.max(0, num(p.eligibleDividends)),
        nonEligibleDividends: Math.max(0, num(p.nonEligibleDividends)),
        annualDeductions: Math.max(0, num(p.annualDeductions, num(p.otherDeductions))),
        pensionAdjustment: Math.max(0, num(p.pensionAdjustment)),
        gisEligible: p.gisEligible !== false,
        gisIncomeOpening: p.gisIncomeOpening == null || p.gisIncomeOpening === '' ? null : Math.max(0,num(p.gisIncomeOpening)),
        fhsaOpenYear: int(p.fhsaOpenYear, new Date().getFullYear()),
        fhsaRoomOpening: clamp(num(p.fhsaRoomOpening, 8000), 0, 16000),
        fhsaLifetimeContributions: clamp(num(p.fhsaLifetimeContributions), 0, 40000),
        rrspRoomOpening: num(p.rrspRoomOpening, dp.rrspRoomOpening),
        tfsaRoomOpening: num(p.tfsaRoomOpening, dp.tfsaRoomOpening),
        hbpAnnual: num(p.hbpAnnual, dp.hbpAnnual),
        hbpRepaymentBudget: Math.max(0, num(p.hbpRepaymentBudget, num(p.hbpAnnual, dp.hbpAnnual))),
        hbpYears: int(p.hbpYears, dp.hbpYears),
        rrifConversionAge: clamp(int(p.rrifConversionAge, 71), 18, 71),
        pension2Name: p.pension2Name || 'Other pension',
        pension2Amount: num(p.pension2Amount, 0),
        pension2StartAge: int(p.pension2StartAge, 65),
        pension2IndexRate: num(p.pension2IndexRate, 0)
      });
    });

    var a = c.assumptions || {}, da = d.assumptions;
    var phases = Array.isArray(a.spendingPhases) && a.spendingPhases.length ? a.spendingPhases : da.spendingPhases;
    var cc = a.childcare || da.childcare;
    c.assumptions = Object.assign({}, a, {
      province: Object.prototype.hasOwnProperty.call(PROVINCES, String(a.province).toUpperCase()) ? String(a.province).toUpperCase() : 'ON',
      householdType: a.householdType === 'single' ? 'single' : 'couple',
      gisEnabled: a.gisEnabled !== false,
      desiredMonthlyIncome: num(a.desiredMonthlyIncome, da.desiredMonthlyIncome),
      inflation: num(a.inflation, da.inflation),
      rentalIncomeInflation: num(a.rentalIncomeInflation, da.rentalIncomeInflation),
      targetDeathAge: int(a.targetDeathAge, da.targetDeathAge),
      withdrawalStrategy: WITHDRAWAL_ORDERS[a.withdrawalStrategy] ? a.withdrawalStrategy : da.withdrawalStrategy,
      returnMode: a.returnMode || da.returnMode,
      conservativeDelta: num(a.conservativeDelta, da.conservativeDelta),
      badDecadeDelta: num(a.badDecadeDelta, da.badDecadeDelta),
      mcRuns: clamp(int(a.mcRuns, da.mcRuns), 50, 5000),
      mcVolatility: num(a.mcVolatility, da.mcVolatility),
      vacancyRate: num(a.vacancyRate, da.vacancyRate),
      rentalOwnerSplit: clamp(num(a.rentalOwnerSplit, da.rentalOwnerSplit), 0, 100),
      spendingIncludesDebtPayments: a.spendingIncludesDebtPayments !== false,
      applySpendingBeforeRetirement: a.applySpendingBeforeRetirement === true,
      rrspGoalCompletion:clamp(num(a.rrspGoalCompletion,85),0,100),
      optimizePensionSplit: a.optimizePensionSplit !== false,
      reinvestSurplus: a.reinvestSurplus !== false,
      reinvestPayoffPayments: a.reinvestPayoffPayments !== false,
      hooppIndexRate: num(a.hooppIndexRate, da.hooppIndexRate),
      hooppIndexBeforeStart: a.hooppIndexBeforeStart === true,
      optimizeContributions: a.optimizeContributions !== false,
      rrspMinMarginalRate: num(a.rrspMinMarginalRate, num(a.assumedWithdrawalRate, da.rrspMinMarginalRate)),
      contributionSlice: Math.max(100, num(a.contributionSlice, da.contributionSlice)),
      reinvestRefund: a.reinvestRefund !== false,
      spendingMode: a.spendingMode === 'categories' ? 'categories' : 'target',
      spendingCategories: (Array.isArray(a.spendingCategories) ? a.spendingCategories : []).map(function(s) {
        return Object.assign({},s,{name:s.name || 'Expense',amount:Math.max(0,num(s.amount)),frequency:s.frequency === 'yearly' ? 'yearly' : 'monthly',
          startAge:int(s.startAge,0),endAge:int(s.endAge,120),everyYears:Math.max(1,int(s.everyYears,1)),
          inflation:s.inflation == null || s.inflation === '' ? null : num(s.inflation),ageReference:s.ageReference || 'person1',enabled:s.enabled !== false});
      }),
      estate:Object.assign({enabled:false,spousalRollover:true,survivorSpendingPercent:70,notarialWill:true,probateOverride:null},a.estate || {}),
      spendingPhases: phases.map(function (p) {
        return { untilAge: int(p.untilAge, 999), factor: num(p.factor, 100) };
      }).sort(function (x, y) { return x.untilAge - y.untilAge; }),
      childcare: Object.assign({},cc, {
        childrenBirthYears: (Array.isArray(cc.childrenBirthYears) ? cc.childrenBirthYears : [])
          .map(function (b) { return int(b, 0); }).filter(function (b) { return b > 1900; }),
        items: (Array.isArray(cc.items) ? cc.items : []).map(function (it) {
          return {
            name: it.name || 'Childcare',
            amount: num(it.amount, 0),
            startYear: int(it.startYear, 0),
            endYear: int(it.endYear, 0),
            declinePerYear: num(it.declinePerYear, 0)
          };
        })
      })
    });

    var owners = [c.incomes[0].name, c.incomes[1].name];
    c.accounts = (Array.isArray(c.accounts) ? c.accounts : d.accounts).map(function (ac) {
      ac = ac || {};
      var t = String(ac.type || 'RRSP').toUpperCase();
      if (['RRSP', 'TFSA', 'TAXABLE', 'CORP', 'FHSA', 'DC'].indexOf(t) < 0) t = 'RRSP';
      var owner = (ac.owner && (owners.indexOf(ac.owner) >= 0 || ac.owner === 'Joint')) ? ac.owner : owners[0];
      var freq = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly'].indexOf(ac.contribFreq) >= 0
        ? ac.contribFreq : 'monthly';
      return Object.assign({}, ac, {
        name: ac.name || 'Account',
        owner: owner,
        type: t,
        balance: num(ac.balance, 0),
        costBasis: (ac.costBasis === undefined || ac.costBasis === '') ? num(ac.balance, 0) : num(ac.costBasis, 0),
        growthRate: num(ac.growthRate, 6),
        distributionYield: num(ac.distributionYield, t === 'TAXABLE' ? 2 : 0),
        distributionType: ['eligible','non-eligible'].indexOf(ac.distributionType) >= 0 ? ac.distributionType : 'interest',
        corporateTaxRate: clamp(num(ac.corporateTaxRate, 50), 0, 100),
        dividendType: ac.dividendType === 'eligible' ? 'eligible' : 'non-eligible',
        qualifyingWithdrawalYear: int(ac.qualifyingWithdrawalYear),
        qualifyingWithdrawalAmount: Math.max(0, num(ac.qualifyingWithdrawalAmount)),
        contribAmt: num(ac.contribAmt, 0),
        contribFreq: freq,
        contribGrowth: num(ac.contribGrowth, 0),
        annualBonus: num(ac.annualBonus, 0),
        employerMatchPct: t === 'RRSP' || t === 'DC' ? num(ac.employerMatchPct, 0) : 0,
        solveToTarget: ac.solveToTarget === true && t === 'RRSP',
        /* solve mode replaces pooling — an account is never both */
        flexible: ac.flexible === true && ['RRSP','TFSA','TAXABLE'].indexOf(t) >= 0 && !(ac.solveToTarget === true && t === 'RRSP'),
        hbpAccount: ac.hbpAccount === true,
        reinvestTarget: ac.reinvestTarget === true
      });
    });

    c.hooppTiers = (Array.isArray(c.hooppTiers) && c.hooppTiers.length ? c.hooppTiers : d.hooppTiers)
      .map(function (t) {
        return { startAge: int(t.startAge, 55), lifetime: num(t.lifetime, 0), bridge: num(t.bridge, 0) };
      }).sort(function (x, y) { return x.startAge - y.startAge; });

    // Migrate legacy pensions once; clear their old income sources to avoid duplication.
    c.dbPensions = Array.isArray(c.dbPensions) ? c.dbPensions : [];
    c.incomes.forEach(function(p) {
      if (p.hooppStartAge !== null) {
        var tier = hooppAt(c.hooppTiers, p.hooppStartAge);
        c.dbPensions.push({name:'HOOPP',owner:p.name,startAge:p.hooppStartAge,
          lifetime:tier.lifetime,bridge:tier.bridge,bridgeCutoffAge:65,tiers:clone(c.hooppTiers),
          indexingRate:c.assumptions.hooppIndexRate,indexBeforeStart:c.assumptions.hooppIndexBeforeStart});
        p.hooppStartAge = null;
      }
      if (p.pension2Amount > 0) {
        c.dbPensions.push({name:p.pension2Name,owner:p.name,startAge:p.pension2StartAge,
          lifetime:p.pension2Amount,indexingRate:p.pension2IndexRate});
        p.pension2Amount = 0;
      }
    });
    c.dbPensions = (Array.isArray(c.dbPensions) ? c.dbPensions : []).map(function (p) {
      p = p || {};
      return Object.assign({}, p, { name:p.name || 'DB pension', owner:owners.indexOf(p.owner) >= 0 ? p.owner : owners[0],
        startAge:int(p.startAge,65), lifetime:Math.max(0,num(p.lifetime)), bridge:Math.max(0,num(p.bridge)),
        bridgeCutoffAge:int(p.bridgeCutoffAge,65), indexingRate:num(p.indexingRate), indexBeforeStart:p.indexBeforeStart === true,
        followsRetirement:p.followsRetirement === true,
        tiers:(Array.isArray(p.tiers) ? p.tiers : []).map(function(t) {
          return {startAge:int(t.startAge,65),lifetime:Math.max(0,num(t.lifetime)),bridge:Math.max(0,num(t.bridge))};
        }).sort(function(a,b) { return a.startAge-b.startAge; }) });
    });

    c.realEstate = (Array.isArray(c.realEstate) ? c.realEstate : d.realEstate).map(function (r) {
      r = r || {};
      var name = r.name || 'Property';
      var type = String(r.type || 'principal').toLowerCase();
      if (/heloc|line of credit/i.test(name)) type = 'heloc';
      if (['principal', 'rental', 'heloc'].indexOf(type) < 0) type = 'principal';
      var rate = num(r.interestRate, type === 'heloc' ? 3.75 : 4);
      return Object.assign({}, r, {
        name: name,
        type: type,
        value: num(r.value, 0),
        appreciation: num(r.appreciation, type === 'heloc' ? 0 : 3),
        mortgage: num(r.mortgage, 0),
        interestRate: rate,
        renewalYear: int(r.renewalYear, 0),
        renewalRate: num(r.renewalRate, rate),
        paymentBiweekly: num(r.paymentBiweekly, 0),
        paymentMonthly: num(r.paymentMonthly, 0),
        payoffYear: int(r.payoffYear, 0),
        grossRentMonthly: num(r.grossRentMonthly, 0),
        vacancyRate: r.vacancyRate == null || r.vacancyRate === '' ? null : clamp(num(r.vacancyRate),0,100),
        ownerSplit: r.ownerSplit == null || r.ownerSplit === '' ? null : clamp(num(r.ownerSplit),0,100),
        rentalName: r.rentalName || '',
        ccaRate: clamp(num(r.ccaRate,4),0,100),
        annualPropertyTax: num(r.annualPropertyTax, 0),
        annualInsurance: num(r.annualInsurance, 0),
        annualMaintenance: num(r.annualMaintenance, 0),
        otherAnnualInterest: num(r.otherAnnualInterest, 0),
        attachToRental: r.attachToRental === true || (type === 'heloc' && r.attachToRental === undefined),
        interestDeductible: r.interestDeductible === true ||
          (r.interestDeductible === undefined && (type === 'rental' || (type === 'heloc' && r.attachToRental !== false))),
        reinvestOnPayoff: r.reinvestOnPayoff !== false,
        extraPaymentAnnual:Math.max(0,num(r.extraPaymentAnnual)),extraPaymentStart:int(r.extraPaymentStart,0),extraPaymentEnd:int(r.extraPaymentEnd,9999),
        smithEnabled:r.smithEnabled === true,smithRate:Math.max(0,num(r.smithRate,6)),smithLimit:Math.max(0,num(r.smithLimit,500000)),
        smithGrowthRate:num(r.smithGrowthRate,5),smithOwner:r.smithOwner === owners[1] ? owners[1] : owners[0],
        acb: num(r.acb, 0),
        buildingAcb: Math.max(0,num(r.buildingAcb,num(r.acb))),
        buildingSalePercent: clamp(num(r.buildingSalePercent,100),0,100),
        saleYear: int(r.saleYear, 0),
        sellingCostPct: num(r.sellingCostPct, 5),
        ccaEnabled: r.ccaEnabled === true,
        uccPool: Math.max(0,num(r.uccPool, num(r.buildingAcb,num(r.acb))))
      });
    });

    return c;
  }

  /* ------------------------------------------------------- amortization    */
  function buildSchedule(debt, startYear, endYear) {
    var sched = {};
    var bal = num(debt.mortgage);
    var perYear = num(debt.paymentBiweekly) > 0 ? 26 : 12;
    var pmt = perYear === 26 ? num(debt.paymentBiweekly) : num(debt.paymentMonthly);
    var actualPayoff = null;
    var negativeAmortization = false;

    function periodicRate(year) {
      var annual = (debt.renewalYear && year >= debt.renewalYear ? num(debt.renewalRate) : num(debt.interestRate)) / 100;
      return debt.type === 'heloc' ? annual / perYear : Math.pow(1 + annual / 2, 2 / perYear) - 1;
    }

    var linear = !(pmt > 0);
    var span = Math.max(1, (int(debt.payoffYear) || endYear) - startYear + 1);
    var linearPrincipal = bal / span;

    for (var y = startYear; y <= endYear; y++) {
      var interest = 0, principal = 0, paid = 0, extra = 0;
      if (bal > 0.01) {
        if (linear) {
          principal = Math.min(bal, linearPrincipal);
          interest = bal * num(debt.interestRate) / 100;
          paid = principal + interest;
          bal -= principal;
        } else {
          var i = periodicRate(y);
          for (var p = 0; p < perYear && bal > 0.01; p++) {
            var pInt = bal * i;
            var pPrin = pmt - pInt;
            if (pPrin <= 0) { negativeAmortization = true; pPrin = 0; }
            pPrin = Math.min(pPrin, bal);
            interest += pInt; principal += pPrin; paid += pInt + pPrin;
            bal -= pPrin;
          }
        }
        if (y >= num(debt.extraPaymentStart) && y <= num(debt.extraPaymentEnd,9999)) {
          extra=Math.min(bal,Math.max(0,num(debt.extraPaymentAnnual)));bal-=extra;principal+=extra;paid+=extra;
        }
        if (bal <= 0.01 && actualPayoff === null) actualPayoff = y;
      }
      sched[y] = { interest: interest, principal: principal, payment: paid, extraPayment:extra, endBalance: Math.max(0, bal) };
    }
    return {
      byYear: sched, actualPayoffYear: actualPayoff,
      annualPayment: pmt * perYear, negativeAmortization: negativeAmortization
    };
  }

  /* ------------------------------------------------------------- taxes     */
  function bracketTax(income, brackets, idx) {
    var tax = 0, prev = 0;
    for (var b = 0; b < brackets.length; b++) {
      var cap = brackets[b][0] === Infinity ? Infinity : brackets[b][0] * idx;
      if (income <= prev) break;
      tax += (Math.min(income, cap) - prev) * brackets[b][1];
      prev = cap;
    }
    return tax;
  }

  function personTax(taxable, age, eligiblePension, oasReceived, idx, province, details) {
    idx = num(idx, 1); province = province || 'ON'; details = details || {};
    var provincial = PROVINCES[province] || ONT;
    taxable = Math.max(0, taxable);
    function jurisdiction(J, withSurtax) {
      var gross = bracketTax(taxable, J.brackets, idx);
      var credits = J.bpa * idx;
      if (J === FED || J === PROVINCES.YT) credits -= 1591 * idx * clamp((taxable / idx - 177882) / (253414 - 177882), 0, 1);
      if (J === PROVINCES.MB) credits *= 1 - clamp((taxable / idx - 200000) / 200000, 0, 1);
      if (J === PROVINCES.QC) {
        var familyIncome = num(details.familyIncome, taxable);
        var agePension = (age >= 65 ? J.ageAmt * idx : 0) + Math.min(J.pensionAmt * idx, 1.25*Math.max(0,eligiblePension));
        credits += num(details.qcCreditAmount, Math.max(0, agePension - .1875 * Math.max(0, familyIncome - J.ageThresh * idx)));
      } else {
        if (age >= 65) credits += Math.max(0, J.ageAmt * idx - 0.15 * Math.max(0, taxable - J.ageThresh * idx));
        credits += Math.min(J.pensionAmt * idx, Math.max(0, eligiblePension));
      }
      if (J !== PROVINCES.QC) credits += num(details.cppCredit);
      if (J === FED || J === PROVINCES.YT) credits += Math.min(1471 * idx, num(details.employment));
      var net = Math.max(0, gross - credits * J.creditRate);
      if (withSurtax) {
        var s = 0;
        if (net > J.surtax1 * idx) s += 0.20 * (net - J.surtax1 * idx);
        if (net > J.surtax2 * idx) s += 0.36 * (net - J.surtax2 * idx);
        net += s;
      }
      var e = num(details.eligibleDividends) * 1.38, n = num(details.nonEligibleDividends) * 1.15;
      net = Math.max(0, net - e * (J === FED ? .150198 : J.dividendEligible || 0) - n * (J === FED ? .090301 : J.dividendNonEligible || 0));
      if (J === PROVINCES.BC) net = Math.max(0,net - Math.max(0,562 * idx - .0356 * Math.max(0,taxable - 25020 * idx)));
      if (J === ONT) {
        net = Math.max(0,net - Math.max(0,2 * 294 * idx - net));
        /* Ontario health premium thresholds are not indexed. */
        var h = taxable <= 20000 ? 0 : taxable <= 36000 ? Math.min(300,.06*(taxable-20000))
          : taxable <= 48000 ? 300+Math.min(150,.06*(taxable-36000))
          : taxable <= 72000 ? 450+Math.min(150,.25*(taxable-48000))
          : taxable <= 200600 ? 600+Math.min(150,.25*(taxable-72000)) : 750+Math.min(150,.25*(taxable-200600));
        net += h;
      }
      return net;
    }
    var fed = jurisdiction(FED, false);
    if (province === 'QC') fed *= .835;
    var ont = jurisdiction(provincial, province === 'ON');
    var clawback = Math.min(
      Math.max(0, oasReceived),
      OAS_CLAWBACK_RATE * Math.max(0, taxable - OAS_CLAWBACK_THRESHOLD * idx)
    );
    return { federal:fed, provincial:ont, income: fed + ont, clawback: clawback, total: fed + ont + clawback,
      federalAgeAmount:age >= 65 ? Math.max(0,FED.ageAmt*idx-.15*Math.max(0,taxable-FED.ageThresh*idx)) : 0,
      provincialAgeAmount:age >= 65 ? Math.max(0,provincial.ageAmt*idx-(province === 'QC' ? .1875 : .15)*Math.max(0,(province === 'QC' ? num(details.familyIncome,taxable) : taxable)-provincial.ageThresh*idx)) : 0 };
  }

  function marginalRate(taxable, age, eligiblePension, oas, idx, province, details) {
    var a = personTax(taxable, age, eligiblePension, oas, idx, province, details).total;
    var b = personTax(taxable + 1000, age, eligiblePension, oas, idx, province, details).total;
    return (b - a) / 1000;
  }

  function householdTax(p1, p2, idx, splitEnabled, province, single) {
    if (single) p2 = {taxable:0, age:0, eligiblePension:0, oas:0};
    var t1 = p1.taxable, t2 = p2.taxable, transfer = 0;
    if (splitEnabled && !single) {
      if (t1 > t2 && p1.eligiblePension > 0) transfer = Math.min(0.5 * p1.eligiblePension, (t1 - t2) / 2);
      else if (t2 > t1 && p2.eligiblePension > 0) transfer = -Math.min(0.5 * p2.eligiblePension, (t2 - t1) / 2);
    }
    var family = Math.max(0,t1) + Math.max(0,t2);
    var creditPension = [Math.max(0,p1.eligiblePension-transfer),Math.max(0,p2.eligiblePension+transfer)];
    if (transfer > 0 && p2.age < 65) creditPension[1] = num(p2.eligibleDB,p2.eligiblePension)+Math.min(transfer,num(p1.eligibleDB,p1.age < 65 ? p1.eligiblePension : 0));
    if (transfer < 0 && p1.age < 65) creditPension[0] = num(p1.eligibleDB,p1.eligiblePension)+Math.min(-transfer,num(p2.eligibleDB,p2.age < 65 ? p2.eligiblePension : 0));
    var a = personTax(t1 - transfer, p1.age, creditPension[0], p1.oas, idx, province, Object.assign({},p1,{familyIncome:family}));
    var b = personTax(t2 + transfer, p2.age, creditPension[1], p2.oas, idx, province, Object.assign({},p2,{familyIncome:family}));
    // Quebec permits a transferring pensioner to split only from age 65.
    var provincialTransfer = transfer;
    if (province === 'QC' && ((transfer > 0 && p1.age < 65) || (transfer < 0 && p2.age < 65))) {
      provincialTransfer = 0;
    }
    if (province === 'QC') {
      // Schedule B combines spouses' age/pension amounts before applying one
      // family-income reduction, then lets them allocate the remaining credit.
      var J=PROVINCES.QC;
      var qcPensions=[Math.max(0,p1.eligiblePension-provincialTransfer),Math.max(0,p2.eligiblePension+provincialTransfer)];
      var qcPool=(p1.age >= 65 ? J.ageAmt*idx : 0)+(p2.age >= 65 ? J.ageAmt*idx : 0)
        +Math.min(J.pensionAmt*idx,1.25*qcPensions[0])+Math.min(J.pensionAmt*idx,1.25*qcPensions[1]);
      qcPool=Math.max(0,qcPool-.1875*Math.max(0,family-J.ageThresh*idx));
      [a,b].forEach(function(t,k) {
        var p=k === 0 ? p1 : p2, income=p.taxable+(k === 0 ? -provincialTransfer : provincialTransfer);
        var before=personTax(income,p.age,qcPensions[k],p.oas,idx,province,Object.assign({},p,{familyIncome:family,qcCreditAmount:0})).provincial;
        var used=Math.min(qcPool,before/J.creditRate);qcPool-=used;
        t.provincial=Math.max(0,before-used*J.creditRate);
        t.income=t.federal+t.provincial;t.total=t.income+t.clawback;
      });
    }
    return {
      p1: a, p2: b, split: transfer, provincialSplit:provincialTransfer,
      totalTax: a.income + b.income, totalClawback: a.clawback + b.clawback, total: a.total + b.total
    };
  }

  function payrollCPP(salary, age, idx, province, year, inflation) {
    if (age < 18 || age >= (province === 'QC' ? 73 : 70)) return {total:0,credit:0,deduction:0};
    var ceiling=year ? Planning.ympe(year,num(inflation,2.1)) : 71300*idx;
    var second=year===2026?85000:year>2026?Math.floor(ceiling*1.14/100)*100:81200*idx;
    var first = Math.max(0,Math.min(salary,ceiling)-3500);
    var enhanced = first * .01 + Math.max(0,Math.min(salary,second)-ceiling) * .04;
    var base = first * (province === 'QC' ? (year>=2026?.053:.054) : .0495);
    return { total:base+enhanced, credit:base, deduction:enhanced };
  }

  /* Annual GIS planning estimate, July–September 2026 full-OAS rates.
     Basic benefit tapers at 50% (single) or 25% (couple, per recipient).
     The top-up has a separate taper; OAS/GIS/TFSA are excluded from income.
     Annual prior-year income is used (actual Service Canada payments reset July).
     https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/payments.html */
  function gisBenefit(income, single, spouseOAS, idx) {
    income = Math.max(0,income); idx = num(idx,1);
    var threshold = (single ? 22800 : spouseOAS ? 30096 : 54624) * idx;
    var rate = single ? .5 : .25;
    var maximum = (single || !spouseOAS ? 1123.17 : 676.09) * 12 * idx;
    var basic = Math.min(maximum,threshold * rate);
    var topup = maximum - basic;
    return Math.max(0,basic-rate*income) + Math.max(0,topup-.25*Math.max(0,income-(single ? 2000 : 4000)*idx));
  }

  /* ------------------------------------------------------------ benefits   */
  function cppAdjust(base, startAge) {
    if (!base) return 0;
    var months = (startAge - 65) * 12;
    if (months < 0) return base * (1 + months * 0.006);
    if (months > 0) return base * (1 + months * 0.007);
    return base;
  }
  function oasAdjust(base, startAge, age) {
    if (!base) return 0;
    var amt = base * (1 + Math.max(0, (startAge - 65) * 12) * 0.006);
    if (age >= 75) amt *= 1.10;
    return amt;
  }
  function hooppAt(tiers, startAge) {
    if (!tiers.length) return { lifetime: 0, bridge: 0 };
    var exact = tiers.filter(function (t) { return t.startAge === startAge; })[0];
    if (exact) return exact;
    if (startAge <= tiers[0].startAge) return tiers[0];
    if (startAge >= tiers[tiers.length - 1].startAge) return tiers[tiers.length - 1];
    for (var k = 0; k < tiers.length - 1; k++) {
      var lo = tiers[k], hi = tiers[k + 1];
      if (startAge > lo.startAge && startAge < hi.startAge) {
        var f = (startAge - lo.startAge) / (hi.startAge - lo.startAge);
        return { lifetime: lo.lifetime + f * (hi.lifetime - lo.lifetime), bridge: lo.bridge + f * (hi.bridge - lo.bridge) };
      }
    }
    return tiers[0];
  }

  function contribPerYear(amt, freq) {
    if (freq === 'weekly') return amt * 52;
    if (freq === 'biweekly') return amt * 26;
    if (freq === 'semimonthly') return amt * 24;
    if (freq === 'monthly') return amt * 12;
    return amt;
  }

  /* -------------------------------------------------------- childcare      */
  function childcareSpend(cc, year) {
    var total = 0;
    (cc.items || []).forEach(function (it) {
      if (it.startYear && year < it.startYear) return;
      if (it.endYear && year > it.endYear) return;
      var elapsed = it.startYear ? year - it.startYear : 0;
      total += Math.max(0, it.amount - it.declinePerYear * elapsed);
    });
    return total;
  }
  function childcareCap(cc, year) {
    var cap = 0;
    (cc.childrenBirthYears || []).forEach(function (b) {
      var age = year - b;
      if (age < 0) return;
      if (age < 7) cap += CHILDCARE_LIMIT_UNDER_7;
      else if (age <= 16) cap += CHILDCARE_LIMIT_7_TO_16;
    });
    return cap;
  }

  /* ------------------------------------------------------------- returns   */
  function gaussian(rand) {
    var u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* =========================================================== simulate()  */
  function simulate(cfg, opts) {
    opts = opts || {};
    cfg = normalizeConfig(cfg);
    var A = cfg.assumptions;
    var single = A.householdType === 'single';
    var active = single ? [0] : [0, 1];
    var infl = num(A.inflation) / 100;
    var startYear = opts.startYear || new Date().getFullYear();
    var P = clone(cfg.incomes);
    active.forEach(function(k){if(cfg.accounts.filter(function(ac){return ac.type==='CORP'&&ac.integratedCorporate&&ac.businessIncome>0&&ac.owner===P[k].name;}).length>1)throw new Error('Use one operating corporate account for '+P[k].name+' to avoid counting the same remuneration twice.');});
    var cppEstimates=P.map(function(p) {return p.cppMethod === 'history' ? Planning.cppHistory(p,{startYear:startYear,inflation:A.inflation}) : null;});
    var alive=[true,!single],deathYears=P.map(function(p){return p.birthYear+int(p.deathAge,A.targetDeathAge);});
    if (single) P[1] = Object.assign({}, P[1], {birthYear:P[0].birthYear, salary:0, cppBaseAt65:0, oasBaseAt65:0,
      targetRetireAge:P[0].targetRetireAge, hbpYears:0, hbpAnnual:0, rrspRoomOpening:0, tfsaRoomOpening:0});
    var birth = [int(P[0].birthYear), int(P[1].birthYear)];
    var retireYear = [birth[0] + int(P[0].targetRetireAge), birth[1] + int(P[1].targetRetireAge)];
    var deathAge = int(A.targetDeathAge, 90);
    var endYear = Math.max(birth[0] + deathAge, birth[1] + deathAge);
    if(A.estate.enabled) endYear=single ? deathYears[0] : Math.max.apply(null,deathYears);
    var mode = opts.returnMode || A.returnMode || 'deterministic';
    var strategy = opts.withdrawalStrategy || A.withdrawalStrategy || 'tfsa-first';
    var order = (WITHDRAWAL_ORDERS[strategy] || WITHDRAWAL_ORDERS['tfsa-first']).concat(['CORP','DC','FHSA']);
    var rand = opts.rand || null;
    var vol = num(A.mcVolatility, 12) / 100;
    var firstRetireYear = Math.min(retireYear[0], retireYear[1]);
    var slice = A.contributionSlice;
    var rrspFloor = num(A.rrspMinMarginalRate, 35) / 100;

    var accts = cfg.accounts.filter(function (a) { return !single || a.owner !== cfg.incomes[1].name; }).map(function (a, idx) {
      return {
        id: idx, name: a.name, owner: a.owner, type: a.type,
        bal: a.balance, basis: a.type === 'TAXABLE' ? a.costBasis : a.balance,
        rate: a.growthRate / 100, dist: a.distributionYield / 100, distributionType:a.distributionType,
        baseContrib: contribPerYear(a.contribAmt, a.contribFreq),
        contribStartYear:int(a.contribStartYear,0),contribEndYear:int(a.contribEndYear,9999),contributeInRetirement:a.contributeInRetirement === true,
        annualBonus: a.annualBonus,
        employerMatchPct: a.employerMatchPct / 100,
        contribGrowth: a.contribGrowth / 100,
        flexible: a.flexible, solveToTarget: a.solveToTarget,
        hbpAccount: a.hbpAccount, reinvestTarget: a.reinvestTarget,
        corporateTaxRate: a.corporateTaxRate / 100, dividendType:a.dividendType,
        integratedCorporate:a.integratedCorporate === true,cda:Math.max(0,num(a.cdaOpening)),grip:Math.max(0,num(a.gripOpening)),
        erdtoh:Math.max(0,num(a.erdtohOpening)),nrdtoh:Math.max(0,num(a.nrdtohOpening)),useCDA:a.useCDA !== false,
        businessIncome:Math.max(0,num(a.businessIncome)),businessSmallRate:num(a.businessSmallRate,12.2)/100,businessGeneralRate:num(a.businessGeneralRate,26.5)/100,
        priorPassive:Math.max(0,num(a.priorPassiveIncome)),associatedPassive:Math.max(0,num(a.associatedPassiveIncome)),
        capitalReturnShare:clamp(num(a.capitalReturnShare,50),0,100)/100,realizationRate:clamp(num(a.realizationRate,25),0,100)/100,
        probateIncluded:a.probateIncluded !== false,
        qualifyingWithdrawalYear:a.qualifyingWithdrawalYear, qualifyingWithdrawalAmount:a.qualifyingWithdrawalAmount,
        isRRIF: false
      };
    });
    function ownerIndex(o) { return o === P[1].name ? 1 : 0; }
    function ensureAccount(type, owner, name, unique) {
      var found = accts.filter(function (x) { return x.type === type && x.owner === owner && (!unique || x.name === name); })[0];
      if (found) return found;
      var made = {
        id: accts.length, name: name, owner: owner, type: type, bal: 0, basis: 0,
        rate: (accts[0] ? accts[0].rate : 0.06), dist: type === 'TAXABLE' ? 0.02 : 0, distributionType:'interest',
        baseContrib: 0, annualBonus: 0, employerMatchPct: 0, contribGrowth: 0,
        flexible: false, solveToTarget: false, hbpAccount: false, reinvestTarget: false,
        isRRIF: false, synthetic: true
      };
      accts.push(made); return made;
    }
    var tfsaOf = [ensureAccount('TFSA', P[0].name, 'TFSA'), single ? null : ensureAccount('TFSA', P[1].name, 'TFSA')];
    var rrspOf = [ensureAccount('RRSP', P[0].name, 'RRSP'), single ? null : ensureAccount('RRSP', P[1].name, 'RRSP')];
    var nonRegistered = ensureAccount('TAXABLE', P[0].name, 'Non-registered');
    function hbpAccountFor(k) {
      return accts.filter(function (x) { return x.type === 'RRSP' && x.owner === P[k].name && x.hbpAccount; })[0] || rrspOf[k];
    }

    var props = cfg.realEstate.map(function (r) {
      return { def: r, sched: buildSchedule(r, startYear, endYear), value: r.value, sold: false, ucc: r.uccPool, ccaClaimed: Math.max(0,r.buildingAcb-r.uccPool),smithBalance:0 };
    });
    props.forEach(function(p){if(p.def.smithEnabled){p.smithAccount=ensureAccount('TAXABLE',p.def.smithOwner,p.def.name+' investment loan portfolio',true);p.smithAccount.rate=p.def.smithGrowthRate/100;}});
    var rentals = props.filter(function (p) { return p.def.type === 'rental'; });
    function attachedRental(p) { return p.def.attachToRental ? rentals.filter(function(r) { return r.def.name === p.def.rentalName; })[0] || (!p.def.rentalName ? rentals[0] : null) : null; }

    var rrspRoom = [num(P[0].rrspRoomOpening), num(P[1].rrspRoomOpening)];
    var tfsaRoom = [num(P[0].tfsaRoomOpening), num(P[1].tfsaRoomOpening)];
    var priorEarned = [num(P[0].salary), num(P[1].salary)];
    var priorPA = P.map(function(p) { return p.pensionAdjustment; });
    var fhsaUsed = P.map(function(p) { return p.fhsaLifetimeContributions; });
    var fhsaRoom = P.map(function(p) { return Math.min(p.fhsaRoomOpening,40000-p.fhsaLifetimeContributions); });
    var fhsaClosed = [false,false], fhsaFirstWithdrawal = [0,0];
    var gisPriorIncome = P.map(function(p) { return p.gisIncomeOpening; });
    var priorTfsaWithdrawals = [0, 0];
    var pendingRefund = 0;
    var hbpLeft = [int(P[0].hbpYears), int(P[1].hbpYears)];

    var years = [], depletedYear = null, firstClawbackYear = null;
    var contributionPlan = opts.contributionPlan || null;
    var planOut = {};
    var estateEvents=[],estateLiability=0;

    for (var y = startYear; y <= endYear; y++) {
      active=single ? [0] : [0,1].filter(function(k){return alive[k];});
      var t = y - startYear;
      var taxIdx = Math.pow(1 + infl, y - TAX_BASE_YEAR);
      var inflIdx = Math.pow(1 + infl, t);
      var age = [y - birth[0], y - birth[1]];
      var retired = [y >= retireYear[0], y >= retireYear[1]];
      var anyRetired = retired[0] || retired[1];
      var smithInterest=[0,0],smithAdvance=0,extraDebtPayments=0,homePurchaseCash=0;
      props.forEach(function(p){
        var s=p.sched.byYear[y],operating=!p.sold&&p.def.saleYear!==y&&(!p.def.purchaseYear||y>=p.def.purchaseYear);
        if(operating)extraDebtPayments+=num(s.extraPayment);
        if(p.def.smithEnabled){
          var advance=operating?Math.min(Math.max(0,p.def.smithLimit-p.smithBalance),s.principal):0;
          var interest=p.smithBalance*p.def.smithRate/100;
          p.smithBalance+=advance;smithAdvance+=advance;
          p.smithAccount.bal+=advance;p.smithAccount.basis+=advance;
          smithInterest[ownerIndex(p.smithAccount.owner)]+=interest;
        }
      });

      var rateAdj = 0, shock = 0;
      if (mode === 'conservative') rateAdj = -num(A.conservativeDelta) / 100;
      else if (mode === 'bad-decade') {
        var into = y - firstRetireYear;
        rateAdj = (into >= 0 && into < 10) ? -num(A.badDecadeDelta) / 100 : 0;
      } else if (mode === 'monte-carlo' && rand) shock = gaussian(rand) * vol;

      /* ---- property values, debt, sales ---- */
      var totalDebt = estateLiability, principalEquity = 0, rentalEquity = 0, otherDebt = estateLiability;
      props.forEach(function(p){totalDebt+=p.smithBalance;otherDebt+=p.smithBalance;});
      var debtRows = [], saleEvents = [];
      var saleTaxable = [0, 0], saleRecapture = [0, 0], saleProceedsCash = 0, saleCapitalLoss = 0;

      props.forEach(function (p) {
        if(p.def.purchaseYear&&y<p.def.purchaseYear)return;
        var s = p.sched.byYear[y] || { interest: 0, principal: 0, payment: 0, endBalance: 0 };
        if (p.def.type !== 'heloc') p.value = p.def.value * Math.pow(1 + num(p.def.appreciation) / 100, t);
        if(p.def.purchaseYear===y)homePurchaseCash+=Math.max(0,p.value-num(p.def.mortgage));

        if (!p.sold && p.def.saleYear && y === p.def.saleYear && p.def.type !== 'heloc') {
          var grossPrice = p.value;
          var costs = grossPrice * num(p.def.sellingCostPct) / 100;
          var netProceeds = grossPrice - costs;
          // Sales occur at the start of the year, before rent or debt payments.
          var mortgageOff = s.endBalance + s.principal;
          var cash = netProceeds - mortgageOff;
          var gain = netProceeds - num(p.def.acb);
          var buildingProceeds = netProceeds*p.def.buildingSalePercent/100;
          var recapture = Math.max(0,Math.min(buildingProceeds,p.def.buildingAcb)-p.ucc);
          var terminalLoss = Math.max(0,p.ucc-buildingProceeds);
          var landGain = netProceeds-buildingProceeds-(p.def.acb-p.def.buildingAcb);
          // ITA 13(21.1): land gains first reduce a building terminal loss.
          var reallocation = Math.min(terminalLoss,Math.max(0,landGain));
          terminalLoss -= reallocation; buildingProceeds += reallocation; landGain -= reallocation;
          if (p.def.type === 'rental') gain = Math.max(0,buildingProceeds-p.def.buildingAcb)+landGain;
          if (p.def.type === 'rental') {
            var sp = single ? 1 : num(p.def.ownerSplit,A.rentalOwnerSplit) / 100;
            if (gain > 0) {
              saleTaxable[0] += gain * CAPITAL_GAINS_INCLUSION * sp;
              saleTaxable[1] += gain * CAPITAL_GAINS_INCLUSION * (1 - sp);
            } else {
              saleCapitalLoss += Math.max(0,-gain);   /* unused land losses offset capital gains only */
            }
            saleRecapture[0] += (recapture-terminalLoss) * sp;
            saleRecapture[1] += (recapture-terminalLoss) * (1 - sp);
          }
          saleProceedsCash += cash;
          saleEvents.push({
            name: p.def.name, grossPrice: grossPrice, sellingCosts: costs, mortgageDischarged: mortgageOff,
            netCash: cash, capitalGain: gain,
            ccaRecapture: p.def.type === 'rental' ? recapture : 0,
            terminalLoss: p.def.type === 'rental' ? terminalLoss : 0,
            taxableGain: gain > 0 ? gain * CAPITAL_GAINS_INCLUSION : 0,
            capitalLoss: p.def.type === 'rental' ? Math.max(0,-gain) : 0,
            exempt: p.def.type === 'principal'
          });
          p.sold = true;
        }

        if (p.sold) {
          debtRows.push({ name: p.def.name, type: p.def.type, balance: 0, interest: 0, payment: 0, value: 0, sold: true });
          return;
        }
        totalDebt += s.endBalance;
        if (p.def.type === 'principal') principalEquity += Math.max(0, p.value - s.endBalance);
        else if (p.def.type === 'rental') rentalEquity += Math.max(0, p.value - s.endBalance);
        else otherDebt += s.endBalance;
        debtRows.push({ name: p.def.name, type: p.def.type, balance: s.endBalance, interest: s.interest, payment: s.payment, value: p.value });
      });

      var redirected = 0;
      if (A.reinvestPayoffPayments && !(retired[0] && retired[1])) {
        props.forEach(function (p) {
          var s2 = p.sched.byYear[y];
          if (!p.sold && p.def.reinvestOnPayoff && s2 && s2.endBalance <= 0.01 && s2.payment <= 0.01) redirected += p.sched.annualPayment;
        });
      }

      /* ---- rental operations ---- */
      var rentGross = 0, rentOpex = 0, rentInterest = 0, rentPayment = 0, rentCash = 0;
      var rentIncomeBeforeCCA = 0, ccaClaim = 0, rentTaxable = 0;
      var rentalIncome = [0,0], rentalRows = [];
      rentals.forEach(function(rental) {
        if (rental.sold || rental.def.purchaseYear&&y<rental.def.purchaseYear) return;
        var rInflIdx = Math.pow(1 + num(A.rentalIncomeInflation) / 100, t);
        var rs = rental.sched.byYear[y];
        var gross = rental.def.grossRentMonthly * 12 * rInflIdx * (1-num(rental.def.vacancyRate,A.vacancyRate)/100);
        var opex = (rental.def.annualPropertyTax+rental.def.annualInsurance+rental.def.annualMaintenance)*inflIdx;
        var interest = rental.def.interestDeductible ? rs.interest : 0, payment = rs.payment;
        props.forEach(function(p) {
          if (p.def.type !== 'rental' && attachedRental(p) === rental && !p.sold) {
            var hs = p.sched.byYear[y]; payment += hs.payment;
            if (p.def.interestDeductible) interest += hs.interest;
          }
        });
        interest += rental.def.otherAnnualInterest; payment += rental.def.otherAnnualInterest;
        var beforeCCA = gross-opex-interest;
        rentalRows.push({name:rental.def.name, gross:gross, opex:opex, interest:interest, payment:payment,
          cash:gross-opex-payment, beforeCCA:beforeCCA, cca:0, taxable:beforeCCA, ucc:rental.ucc, property:rental});
      });
      // CCA cannot create/increase the aggregate rental loss; pools stay separate.
      var ccaCapacity = Math.max(0,rentalRows.reduce(function(sum,r) { return sum+r.beforeCCA; },0));
      rentalRows.forEach(function(r) {
        var p = r.property;
        if (p.def.ccaEnabled) {
          r.cca = Math.min(p.ucc*p.def.ccaRate/100,Math.max(0,r.beforeCCA),ccaCapacity);
          p.ucc -= r.cca; p.ccaClaimed += r.cca; ccaCapacity -= r.cca;
        }
        r.ucc = p.ucc; r.taxable -= r.cca;
        var sp = single ? 1 : num(p.def.ownerSplit,A.rentalOwnerSplit)/100;
        rentalIncome[0] += r.taxable*sp; rentalIncome[1] += r.taxable*(1-sp);
        rentGross += r.gross; rentOpex += r.opex; rentInterest += r.interest;
        rentPayment += r.payment; rentCash += r.cash; rentIncomeBeforeCCA += r.beforeCCA;
        ccaClaim += r.cca; rentTaxable += r.taxable; delete r.property;
      });

      var householdDebtPayments = 0;
      props.forEach(function (p) {
        if (p.sold || p.def.type === 'rental') return;
        if (attachedRental(p) && !attachedRental(p).sold) return;
        householdDebtPayments += p.sched.byYear[y].payment;
      });

      /* ---- income ---- */
      var person = [0, 1].map(function (k) {
        var inc = { employment: 0, cpp: 0, oas: 0, pension: 0, pension2: 0, bridge: 0, rrif: 0, rental: 0, dist: 0, sale: 0, eligibleDividends:0, nonEligibleDividends:0, payroll:0, cppCredit:0, cppDeduction:0, gis:0 };
        if (!alive[k]) return inc;
        if (!retired[k]) inc.employment = P[k].salary * Math.pow(1 + num(P[k].salaryGrowth) / 100, t);
        if (age[k] >= P[k].cppStartAge) inc.cpp = cppEstimates[k] ? cppEstimates[k].monthly*12*Math.pow(1+infl,y-cppEstimates[k].claimYear)*(y === cppEstimates[k].claimYear ? (13-cppEstimates[k].claimMonth)/12 : 1) : cppAdjust(P[k].cppBaseAt65, P[k].cppStartAge) * 12 * inflIdx;
        if (age[k] >= P[k].oasStartAge) inc.oas = oasAdjust(P[k].oasBaseAt65, P[k].oasStartAge, age[k]) * 12 * inflIdx;
        if (!retired[k]) {
          var remunerationIdx = Math.pow(1+P[k].salaryGrowth/100,t);
          inc.eligibleDividends = P[k].eligibleDividends*remunerationIdx;
          inc.nonEligibleDividends = P[k].nonEligibleDividends*remunerationIdx;
        }
        var payroll = payrollCPP(inc.employment,age[k],taxIdx,A.province,y,A.inflation);
        inc.payroll = payroll.total; inc.cppCredit = payroll.credit; inc.cppDeduction = payroll.deduction;
        return inc;
      });

      active.forEach(function (k) {
        /* second employer pension (e.g. a former employer's DB plan) */
        var p2 = num(P[k].pension2Amount), p2Age = int(P[k].pension2StartAge, 65);
        if (p2 > 0 && age[k] >= p2Age) {
          person[k].pension2 = p2 * 12 * Math.pow(1 + num(P[k].pension2IndexRate) / 100, age[k] - p2Age);
          person[k].pension += person[k].pension2;
        }
        var start = P[k].hooppStartAge;
        if (!start || age[k] < start) return;
        var tier = hooppAt(cfg.hooppTiers, start);
        var idxRate = num(A.hooppIndexRate) / 100;
        var preIdx = A.hooppIndexBeforeStart ? Math.pow(1 + idxRate, Math.max(0, (birth[k] + start) - startYear)) : 1;
        var esc = Math.pow(1 + idxRate, age[k] - start) * preIdx;
        person[k].pension += tier.lifetime * 12 * esc;
        if (age[k] < 65) person[k].bridge = tier.bridge * 12 * esc;
      });

      cfg.dbPensions.forEach(function(plan) {
        var member = ownerIndex(plan.owner), k=member;
        var survivorFactor=1;
        if(!alive[k]){if(active.length!==1)return;k=active[0];survivorFactor=clamp(num(plan.survivorPercent,60),0,100)/100;}
        var start = plan.followsRetirement ? P[member].targetRetireAge : plan.startAge;
        if ((single && k === 1) || age[member] < start) return;
        var amount = plan.tiers.length ? hooppAt(plan.tiers,start) : plan;
        var periods = age[member]-start + (plan.indexBeforeStart ? Math.max(0,birth[member]+start-startYear) : 0);
        var factor = Math.pow(1+plan.indexingRate/100,periods);
        person[k].pension += amount.lifetime*12*factor*survivorFactor;
        if (survivorFactor===1 && age[k] < plan.bridgeCutoffAge) person[k].bridge += amount.bridge*12*factor;
      });
      person[0].rental = rentalIncome[0]; person[1].rental = rentalIncome[1];
      person[0].sale = saleTaxable[0] + saleRecapture[0];
      person[1].sale = saleTaxable[1] + saleRecapture[1];

      accts.forEach(function (ac) {
        if (ac.type !== 'TAXABLE' || ac.bal <= 0 || ac.dist <= 0) return;
        var dv = ac.bal * ac.dist;
        var recipient = person[ownerIndex(ac.owner)];
        if (ac.distributionType === 'eligible') recipient.eligibleDividends += dv;
        else if (ac.distributionType === 'non-eligible') recipient.nonEligibleDividends += dv;
        else recipient.dist += dv;
        // Distributions are reinvested in the account, not spendable cash.
        recipient.reinvestedDividends = (recipient.reinvestedDividends || 0) + (ac.distributionType === 'interest' ? 0 : dv);
        ac.basis += dv;
      });

      /* ---- room accrues on prior-year earned income, less the DPSP PA ---- */
      active.forEach(function (k) {
        var accrual = Math.min(RRSP_EARNED_PCT * priorEarned[k], RRSP_DOLLAR_LIMIT * taxIdx) - priorPA[k];
        rrspRoom[k] = Math.max(0, rrspRoom[k] + Math.max(0, accrual));
        tfsaRoom[k] += TFSA_ANNUAL_ROOM * taxIdx + priorTfsaWithdrawals[k];
        priorTfsaWithdrawals[k] = 0;
      });

      /* ---- childcare deduction, claimed by the lower-income spouse ---- */
      var ccSpend = childcareSpend(A.childcare, y);
      var ccCap = childcareCap(A.childcare, y);
      function childcareNet(k) { var p=person[k]; return p.employment+p.cpp+p.oas+p.pension+p.bridge+p.rental+p.sale+p.dist+p.eligibleDividends*1.38+p.nonEligibleDividends*1.15-p.cppDeduction-P[k].annualDeductions*inflIdx; }
      var claimant = active.length===1 ? active[0] : childcareNet(0) <= childcareNet(1) ? 0 : 1;
      var childcareClaim = Math.max(0, Math.min(ccSpend, ccCap, CHILDCARE_EARNED_FRACTION * person[claimant].employment));
      var childcareDeduction = [0, 0];
      childcareDeduction[claimant] = childcareClaim;

      var fhsaQualifyingCash = 0;
      active.forEach(function(k) {
        if (y < P[k].fhsaOpenYear) { fhsaRoom[k] = 0; return; }
        if (y > startYear) fhsaRoom[k] = Math.min(40000-fhsaUsed[k],8000+Math.min(8000,fhsaRoom[k]));
        if (y > P[k].fhsaOpenYear+15 || age[k] > 71 || (fhsaFirstWithdrawal[k] && y > fhsaFirstWithdrawal[k]+1)) fhsaClosed[k] = true;
        accts.filter(function(ac) { return ac.type === 'FHSA' && ownerIndex(ac.owner) === k; }).forEach(function(ac) {
          if (fhsaClosed[k]) { rrspOf[k].bal += ac.bal; ac.bal = 0; return; }
          if (ac.qualifyingWithdrawalYear === y) {
            var withdrawal = Math.min(ac.bal,ac.qualifyingWithdrawalAmount || ac.bal);
            ac.bal -= withdrawal; fhsaQualifyingCash += withdrawal; ac.qualifyingThisYear = withdrawal;
            fhsaFirstWithdrawal[k] = y;
          }
        });
      });

      /* ---- contributions ---- */
      var contribs = {}, deductible = [0, 0], employerTotal = [0, 0], hbpPaid = [0, 0];
      var rrspTarget = [0, 0], rrspPace = [0, 0];
      function addContrib(ac, amt, isDeductible) {
        var k = ownerIndex(ac.owner);
        if (ac.type === 'RRSP' && age[k] > P[k].rrifConversionAge) return;
        if (ac.type === 'FHSA') amt = Math.min(amt,fhsaClosed[k] || fhsaFirstWithdrawal[k] || y < P[k].fhsaOpenYear ? 0 : fhsaRoom[k],40000-fhsaUsed[k]);
        if (ac.type === 'DC') amt = Math.min(amt,Math.max(0,33810*taxIdx-(contribs[ac.id] || 0)));
        if (amt <= 0) return;
        if (ac.type === 'FHSA') { fhsaRoom[k] -= amt; fhsaUsed[k] += amt; deductible[k] += amt; }
        if (ac.type === 'DC') deductible[k] += amt;
        contribs[ac.id] = (contribs[ac.id] || 0) + amt;
        var k = ownerIndex(ac.owner);
        if (ac.type === 'RRSP' && isDeductible) { rrspRoom[k] = Math.max(0, rrspRoom[k] - amt); deductible[k] += amt; }
        if (ac.type === 'TFSA') tfsaRoom[k] = Math.max(0, tfsaRoom[k] - amt);
      }

      if (contributionPlan && contributionPlan[y]) {
        var pl = contributionPlan[y];
        Object.keys(pl.contribs).forEach(function (id) { contribs[id] = pl.contribs[id]; });
        deductible = pl.deductible.slice();
        employerTotal = pl.employer.slice();
        hbpPaid = pl.hbp.slice();
        rrspTarget = pl.target.slice();
        rrspPace = pl.pace.slice();
        rrspRoom = pl.rrspRoomAfter.slice();
        tfsaRoom = pl.tfsaRoomAfter.slice();
        if (pl.fhsaRoomAfter) { fhsaRoom = pl.fhsaRoomAfter.slice(); fhsaUsed = pl.fhsaUsedAfter.slice(); }
      } else {
        var flexBudget = pendingRefund;
        accts.forEach(function (ac) {
          var k = ownerIndex(ac.owner);
          var working = ac.owner === 'Joint' ? !(retired[0] && retired[1]) : !retired[k];
          if ((!working&&!ac.contributeInRetirement)||y<num(ac.contribStartYear)||y>num(ac.contribEndYear,9999)||!alive[k]) return;
          var amt = ac.baseContrib * Math.pow(1 + ac.contribGrowth, t) + ac.annualBonus;
          if (amt <= 0) return;
          if (ac.solveToTarget && A.optimizeContributions) { rrspPace[k] += amt; return; }
          if (ac.flexible && A.optimizeContributions) { flexBudget += amt; return; }
          if (ac.type === 'RRSP') amt = Math.min(amt, rrspRoom[k]);
          if (ac.type === 'TFSA') amt = Math.min(amt, tfsaRoom[k]);
          addContrib(ac, amt, ac.type === 'RRSP');
        });

        /* employer DPSP match: not your cash, not deductible, creates a PA */
        accts.forEach(function (ac) {
          var k = ownerIndex(ac.owner);
          if (!ac.employerMatchPct || retired[k] || age[k] > 71) return;
          var match = person[k].employment * ac.employerMatchPct;
          if (ac.type === 'DC') match = Math.min(match,Math.max(0,33810*taxIdx-(contribs[ac.id] || 0)));
          contribs[ac.id] = (contribs[ac.id] || 0) + match;
          employerTotal[k] += match;
        });

        /* HBP repayments: mandatory, not deductible, consume no room */
        active.forEach(function (k) {
          if (hbpLeft[k] <= 0 || num(P[k].hbpAnnual) <= 0) return;
          var acc = hbpAccountFor(k);
          hbpPaid[k] = age[k] > P[k].rrifConversionAge ? 0 : Math.min(P[k].hbpAnnual,P[k].hbpRepaymentBudget);
          contribs[acc.id] = (contribs[acc.id] || 0) + hbpPaid[k];
        });

        if (redirected > 0) {
          var rt = accts.filter(function (x) { return x.reinvestTarget; })[0];
          if (rt) {
            var rk = ownerIndex(rt.owner);
            var cap = rt.type === 'TFSA' ? tfsaRoom[rk] : (rt.type === 'RRSP' ? rrspRoom[rk] : Infinity);
            addContrib(rt, Math.min(redirected, cap), rt.type === 'RRSP');
          } else flexBudget += redirected;
        }

        var runningTaxable = [0, 1].map(function (k) {
          return person[k].employment + person[k].cpp + person[k].oas + person[k].pension +
            person[k].bridge + person[k].rental + person[k].dist + person[k].sale + person[k].eligibleDividends*1.38 + person[k].nonEligibleDividends*1.15 - P[k].annualDeductions*inflIdx - person[k].cppDeduction -
            childcareDeduction[k] - deductible[k];
        });

        /* ---- solve-to-target RRSPs ----
           Contribute whatever brings this person down to the marginal-rate
           floor. The amount is an output, not an input: the dashboard shows it
           as this year's target so you can true up by the March deadline. */
        var rrspGoalHandled=[false,false];
        accts.forEach(function (ac) {
          if (!ac.solveToTarget || !A.optimizeContributions) return;
          var k = ownerIndex(ac.owner);
          if (retired[k] || age[k] > P[k].rrifConversionAge || rrspGoalHandled[k]) return;
          rrspGoalHandled[k]=true;
          var g = 0,goal=0,openingTaxable=runningTaxable[k];
          while (rrspRoom[k]-goal >= slice && g++ < 600) {
            var m = (personTax(runningTaxable[k], age[k], 0, person[k].oas, taxIdx, A.province, person[k]).total
                   - personTax(runningTaxable[k] - slice, age[k], 0, person[k].oas, taxIdx, A.province, person[k]).total) / slice;
            if (m < rrspFloor) break;
            goal+=slice;
            runningTaxable[k] -= slice;
            rrspTarget[k] += slice;
          }
          var expected=goal*A.rrspGoalCompletion/100;
          addContrib(ac,expected,true);runningTaxable[k]=openingTaxable-expected;
        });

        /* ---- the optimizer ---- */
        if (flexBudget > 0) {
          var guard = 0;
          while (flexBudget > 1 && guard++ < 600) {
            var step = Math.min(slice, flexBudget);
            var best = null;
            for (var k2 = 0; k2 < active.length; k2++) {
              /* RRSP earns its keep only while the marginal rate is high enough;
                 below the floor a TFSA dollar is worth more over a lifetime. */
              if (age[k2] <= P[k2].rrifConversionAge && rrspRoom[k2] >= step) {
                var mr = (personTax(runningTaxable[k2], age[k2], 0, person[k2].oas, taxIdx, A.province, person[k2]).total - personTax(runningTaxable[k2] - step, age[k2], 0, person[k2].oas, taxIdx, A.province, person[k2]).total) / step;
                if (mr >= rrspFloor) {
                  var score = mr - rrspFloor;
                  if (!best || score > best.score) best = { score: score, kind: 'RRSP', k: k2, rate: mr };
                }
              }
              if (tfsaRoom[k2] >= step) {
                if (!best || best.score < 0) best = { score: 0, kind: 'TFSA', k: k2, rate: 0 };
              }
            }
            if (!best) break;
            var fallback = best.kind === 'RRSP' ? rrspOf[best.k] : tfsaOf[best.k];
            var pick = accts.filter(function (x) {
              return x.type === best.kind && x.owner === P[best.k].name && x.flexible && !x.synthetic;
            })[0] || fallback;
            addContrib(pick, step, best.kind === 'RRSP');
            if (best.kind === 'RRSP') runningTaxable[best.k] -= step;
            flexBudget -= step;
          }
          if (flexBudget > 1) { addContrib(nonRegistered, flexBudget, false); flexBudget = 0; }
        }

        planOut[y] = {
          contribs: clone(contribs), deductible: deductible.slice(), employer: employerTotal.slice(),
          hbp: hbpPaid.slice(), rrspRoomAfter: rrspRoom.slice(), tfsaRoomAfter: tfsaRoom.slice(),
          target: rrspTarget.slice(), pace: rrspPace.slice(), fhsaRoomAfter:fhsaRoom.slice(), fhsaUsedAfter:fhsaUsed.slice()
        };
      }

      var corporateOperatingTax=0,corporateWarnings=[],corporateFundingShortfall=0;
      accts.forEach(function(ac){
        if(ac.type!=='CORP'||!ac.integratedCorporate)return;
        var k=ownerIndex(ac.owner),working=!retired[k]&&alive[k],remunerationFactor=Math.pow(1+P[k].salaryGrowth/100,t);
        var rawProfit=working&&ac.businessIncome>0?ac.businessIncome*remunerationFactor-person[k].employment-person[k].payroll:0,profit=Math.max(0,rawProfit);
        ac.businessLimit=Planning.smallBusinessLimit(ac.priorPassive+ac.associatedPassive);
        ac.operatingTax=Math.min(profit,ac.businessLimit)*ac.businessSmallRate+Math.max(0,profit-ac.businessLimit)*ac.businessGeneralRate;
        ac.grip+=Math.max(0,profit-ac.businessLimit)*.72;
        var dividends=working?(P[k].eligibleDividends+P[k].nonEligibleDividends)*remunerationFactor:0;
        if(ac.businessIncome>0&&dividends>0){
          var requestedEligible=P[k].eligibleDividends*remunerationFactor;
          var actualEligible=Math.min(requestedEligible,ac.grip),nonEligible=dividends-actualEligible;
          person[k].eligibleDividends-=requestedEligible-actualEligible;
          person[k].nonEligibleDividends+=requestedEligible-actualEligible;
          ac.grip-=actualEligible;
          var refundNon=Math.min(ac.nrdtoh,nonEligible*23/60);
          var refundEligible=Math.min(ac.erdtoh,dividends*23/60-refundNon);
          ac.nrdtoh-=refundNon;ac.erdtoh-=refundEligible;
          ac.refundPending=(ac.refundPending||0)+refundNon+refundEligible;
        }
        var retained=rawProfit-ac.operatingTax-dividends;
        if(ac.businessIncome>0){
          if(retained<0){var cover=Math.min(ac.bal,-retained);ac.bal-=cover;corporateFundingShortfall+=-retained-cover;corporateWarnings.push(ac.name+': remuneration exceeds current business profit; '+Math.round(cover)+' is paid from corporate investments.');}
          else contribs[ac.id]=(contribs[ac.id]||0)+retained;
        }
        corporateOperatingTax+=ac.operatingTax;
      });
      var totalContribs = Object.keys(contribs).reduce(function (s, id) { return s + contribs[id]; }, 0);
      // CORP contributions are retained business earnings, already net of
      // operating tax, salary, dividends and employer payroll costs.
      var corporateContributions = accts.filter(function(ac) { return ac.type === 'CORP'; })
        .reduce(function(sum,ac) { return sum+(contribs[ac.id] || 0); },0);
      var householdContribCash = totalContribs - employerTotal[0] - employerTotal[1] - corporateContributions;
      var hbpShortfall = active.map(function(k) { return hbpLeft[k] > 0 ? Math.max(0,P[k].hbpAnnual-hbpPaid[k]) : 0; });

      /* ---- RRIF conversion + forced minimums ---- */
      var rrifForced = 0;
      accts.forEach(function (ac) {
        if (ac.type !== 'RRSP' && ac.type !== 'DC') return;
        var k = ownerIndex(ac.owner);
        if (age[k] >= P[k].rrifConversionAge) ac.isRRIF = true;
        if (age[k] <= P[k].rrifConversionAge || !ac.isRRIF || ac.bal <= 0) return;
        // Displayed ages are year-end ages; CRA uses age at January 1.
        var minWd = Math.min(ac.bal, ac.bal * rrifFactor(age[k]-1));
        ac.bal -= minWd;
        ac.forcedThisYear = minWd;
        person[k].rrif += minWd;
        rrifForced += minWd;
      });

      /* ---- spending target ---- */
      var elderAge = Math.max(age[0], age[1]);
      var phaseFactor = 1;
      for (var ph = 0; ph < A.spendingPhases.length; ph++) {
        if (elderAge <= A.spendingPhases[ph].untilAge) { phaseFactor = A.spendingPhases[ph].factor / 100; break; }
      }
      var spendTarget = 0;
      var spendingCategories=Planning.spendingForYear(A.spendingCategories,P.slice(0,single?1:2),y,startYear,A.inflation);
      if (anyRetired || A.applySpendingBeforeRetirement) {
        spendTarget = A.spendingMode === 'categories' ? spendingCategories.reduce(function(s,r){return s+r.amount;},0)*num(opts.spendingScale,1) : A.desiredMonthlyIncome * 12 * inflIdx * phaseFactor;
        if(A.estate.enabled&&!single&&active.length===1)spendTarget*=clamp(num(A.estate.survivorSpendingPercent,70),0,100)/100;
        if (!A.spendingIncludesDebtPayments) spendTarget += householdDebtPayments;
      }
      // Additional paydowns are extra spending, even if the base goal includes normal debt payments.
      if(A.spendingIncludesDebtPayments || !(anyRetired || A.applySpendingBeforeRetirement))spendTarget+=extraDebtPayments;
      spendTarget+=smithInterest[0]+smithInterest[1];
      spendTarget+=homePurchaseCash;

      /* ---- tax helpers ---- */
      function taxableOf(k, extra) {
        var p = person[k];
        return p.employment + p.cpp + p.oas + p.pension + p.bridge + p.rrif + p.rental + p.dist + p.sale + p.eligibleDividends*1.38 + p.nonEligibleDividends*1.15
          - (!alive[k] ? 0 : P[k].annualDeductions*inflIdx) - smithInterest[k] - p.cppDeduction - childcareDeduction[k] - deductible[k] + (hbpShortfall[k] || 0) + (extra || 0);
      }
      function cashOf(k) {
        var p = person[k];
        return p.employment + p.cpp + p.oas + p.pension + p.bridge + p.rrif + p.eligibleDividends + p.nonEligibleDividends + (p.capitalDividends||0) - (p.reinvestedDividends || 0) - p.payroll;
      }
      function evalTax(e0, e1, dividends, trialPensions) {
        dividends = dividends || [{eligibleDividends:0,nonEligibleDividends:0},{eligibleDividends:0,nonEligibleDividends:0}];
        trialPensions = trialPensions || [0,0];
        function eligible(k, extra) {
          var e = person[k].pension + person[k].bridge;
          if (age[k] >= 65) e += person[k].rrif + drawPension[k] + trialPensions[k];
          return e;
        }
        var result=householdTax(
          Object.assign({},person[0], { taxable: taxableOf(0, e0), eligibleDividends:person[0].eligibleDividends+dividends[0].eligibleDividends, nonEligibleDividends:person[0].nonEligibleDividends+dividends[0].nonEligibleDividends, age: age[0], oas: person[0].oas, eligibleDB:person[0].pension+person[0].bridge, eligiblePension: eligible(0, e0) }),
          Object.assign({},person[1], { taxable: taxableOf(1, e1), eligibleDividends:person[1].eligibleDividends+dividends[1].eligibleDividends, nonEligibleDividends:person[1].nonEligibleDividends+dividends[1].nonEligibleDividends, age: age[1], oas: person[1].oas, eligibleDB:person[1].pension+person[1].bridge, eligiblePension: eligible(1, e1) }),
          taxIdx, A.optimizePensionSplit, A.province, single
        );
        if(!single&&active.length===1){
          var k=active[0],p=person[k],tax=personTax(taxableOf(k,k===0?e0:e1),age[k],eligible(k),p.oas,taxIdx,A.province,Object.assign({},p,{
            eligibleDividends:p.eligibleDividends+dividends[k].eligibleDividends,nonEligibleDividends:p.nonEligibleDividends+dividends[k].nonEligibleDividends}));
          var zero=personTax(0,0,0,0,taxIdx,A.province);
          result={p1:k===0?tax:zero,p2:k===1?tax:zero,total:tax.total,totalTax:tax.income,totalClawback:tax.clawback,split:0,provincialSplit:0};
        }
        return result;
      }
      // Benefits use last year's assessed income; opening income is configurable.
      function gisIncome(k, extra) {
        var earned = person[k].employment;
        var exemption = Math.min(earned,5000) + .5*Math.min(10000,Math.max(0,earned-5000));
        return Math.max(0,taxableOf(k,extra)-person[k].oas-exemption);
      }
      active.forEach(function(k) {
        if (gisPriorIncome[k] === null) gisPriorIncome[k] = gisIncome(k,0);
      });
      var gisHouseholdIncome = active.reduce(function(s,k){return s+gisPriorIncome[k];},0);
      active.forEach(function(k) {
        if (A.gisEnabled && P[k].gisEligible && age[k] >= 65 && person[k].oas > 0)
          person[k].gis = gisBenefit(gisHouseholdIncome,active.length===1,active.length>1 && person[1-k].oas > 0,Math.pow(1+infl,y-2026));
      });
      var gisCash = person[0].gis+person[1].gis;
      var provincialBenefits=0;
      active.forEach(function(k){if(A.province==='ON'&&P[k].gainsEligible&&person[k].gis>0&&person[k].oas>0)provincialBenefits+=Planning.gains(gisHouseholdIncome,active.length>1,true,Math.pow(1+infl,y-2026));});
      function householdCashBase() {
        return cashOf(0) + cashOf(1) + rentCash + saleProceedsCash + fhsaQualifyingCash + gisCash + provincialBenefits - householdContribCash - corporateDrawCash;
      }

      /* ---- withdrawals ---- */
      var draws = {}, drawTaxable = [0, 0], drawPension = [0,0], corporateDrawCash = 0;
      function takeFrom(ac, amt) {
        amt = Math.min(amt, ac.bal);
        if (amt <= 0) return 0;
        var k = ownerIndex(ac.owner);
        var taxablePortion = 0;
        if (ac.type === 'RRSP' || ac.type === 'DC' || ac.type === 'FHSA') taxablePortion = amt;
        else if (ac.type === 'CORP') {
          if(ac.integratedCorporate){
            var distribution=Planning.corporateDistribution(amt,ac);ac.cda-=distribution.capital;ac.grip-=distribution.eligible;
            ac.nrdtoh-=distribution.refundNon;ac.erdtoh-=distribution.refundEligible;ac.refundPending=(ac.refundPending||0)+distribution.refund;
            person[k].capitalDividends=(person[k].capitalDividends||0)+distribution.capital;
            person[k].eligibleDividends+=distribution.eligible;person[k].nonEligibleDividends+=distribution.nonEligible;
          }else{var field = ac.dividendType === 'eligible' ? 'eligibleDividends' : 'nonEligibleDividends'; person[k][field] += amt;}
          corporateDrawCash += amt;
        }
        else if (ac.type === 'TAXABLE') {
          var gainFrac = ac.bal > 0 ? Math.max(0, (ac.bal - ac.basis) / ac.bal) : 0;
          taxablePortion = amt * gainFrac * CAPITAL_GAINS_INCLUSION;
          ac.basis -= amt * (1 - gainFrac);
        } else if (ac.type === 'TFSA') priorTfsaWithdrawals[k] += amt;
        ac.bal -= amt;
        draws[ac.id] = (draws[ac.id] || 0) + amt;
        drawTaxable[k] += taxablePortion;
        if (ac.isRRIF && age[k] >= 65) drawPension[k] += amt;
        return amt;
      }

      var withdrawalPlan=opts.withdrawalPlan || A.withdrawalPlan;
      if(withdrawalPlan&&withdrawalPlan[y])active.forEach(function(k){
        var target=Math.max(0,num(withdrawalPlan[y][k])-person[k].rrif);
        accts.filter(function(ac){return ac.owner===P[k].name&&(ac.type==='RRSP'||ac.type==='DC');}).forEach(function(ac){target-=takeFrom(ac,Math.min(ac.bal,target));});
      });
      if (!withdrawalPlan && anyRetired && (strategy === 'min-tax' || strategy === 'oas-smart')) {
        var ceiling = strategy === 'min-tax' ? FED.brackets[0][0] * taxIdx : OAS_CLAWBACK_THRESHOLD * taxIdx;
        active.forEach(function (k) {
          if (!retired[k]) return;
          var room = ceiling - taxableOf(k, drawTaxable[k]);
          if (room <= 0) return;
          accts.filter(function (x) { return x.type === 'RRSP' && x.owner === P[k].name && x.bal > 0; })
            .forEach(function (ac) { if (room > 0) room -= takeFrom(ac, Math.min(room, ac.bal)); });
        });
      }

      var preDrawCash = Object.keys(draws).reduce(function (s, id) { return s + draws[id]; }, 0);
      function netCashWith(e0, e1, grossExtra, dividends, pensions) {
        return householdCashBase() + preDrawCash + grossExtra - evalTax(drawTaxable[0] + e0, drawTaxable[1] + e1, dividends, pensions).total;
      }
      function tryAllocate(gross) {
        var remaining = gross, tax0 = 0, tax1 = 0, plan = [], pensions = [0,0], dividends = [{eligibleDividends:0,nonEligibleDividends:0},{eligibleDividends:0,nonEligibleDividends:0}];
        for (var oi = 0; oi < order.length && remaining > 0.01; oi++) {
          var pool = accts.filter(function (x) { return x.type === order[oi] && x.bal > 0; });
          for (var pi = 0; pi < pool.length && remaining > 0.01; pi++) {
            var ac = pool[pi], amt = Math.min(ac.bal, remaining), k = ownerIndex(ac.owner), tp = 0;
            if (ac.type === 'RRSP' || ac.type === 'DC' || ac.type === 'FHSA') tp = amt;
            else if (ac.type === 'CORP') {
              if(ac.integratedCorporate){var cd=Planning.corporateDistribution(amt,ac);tp=cd.taxable;dividends[k].eligibleDividends+=cd.eligible;dividends[k].nonEligibleDividends+=cd.nonEligible;}
              else{tp = amt*(ac.dividendType === 'eligible' ? 1.38 : 1.15); dividends[k][ac.dividendType === 'eligible' ? 'eligibleDividends' : 'nonEligibleDividends'] += amt;}
            }
            else if (ac.type === 'TAXABLE') {
              var gf = ac.bal > 0 ? Math.max(0, (ac.bal - ac.basis) / ac.bal) : 0;
              tp = amt * gf * CAPITAL_GAINS_INCLUSION;
            }
            if (k === 0) tax0 += tp; else tax1 += tp;
            if (ac.isRRIF && age[k] >= 65) pensions[k] += amt;
            plan.push({ ac: ac, amt: amt });
            remaining -= amt;
          }
        }
        return { plan: plan, gross: gross - remaining, tax0: tax0, tax1: tax1, dividends:dividends, pensions:pensions };
      }

      var unfunded = 0;
      var availableTotal = accts.reduce(function (s, ac) { return s + Math.max(0, ac.bal); }, 0);
      var currentNet = netCashWith(0, 0, 0);

      if (currentNet < spendTarget - 1 && availableTotal <= 0.01) {
        unfunded = spendTarget - currentNet;
      } else if (currentNet < spendTarget - 1) {
        var lo = 0, hi = availableTotal;
        var iters = opts.fastSolve ? 20 : 34;
        for (var it = 0; it < iters; it++) {
          var mid = (lo + hi) / 2;
          var trial = tryAllocate(mid);
          if (netCashWith(trial.tax0, trial.tax1, trial.gross, trial.dividends, trial.pensions) < spendTarget) lo = mid; else hi = mid;
        }
        var fin = tryAllocate(hi);
        if (netCashWith(fin.tax0, fin.tax1, fin.gross, fin.dividends, fin.pensions) < spendTarget - 1) {
          fin = tryAllocate(availableTotal);
          unfunded = spendTarget - netCashWith(fin.tax0, fin.tax1, fin.gross, fin.dividends, fin.pensions);
        }
        fin.plan.forEach(function (step2) { takeFrom(step2.ac, step2.amt); });
      }

      var taxResult = evalTax(drawTaxable[0], drawTaxable[1]);
      var saleIncomeTax = saleEvents.length ? taxResult.total - evalTax(drawTaxable[0]-person[0].sale,drawTaxable[1]-person[1].sale).total : 0;
      unfunded=Math.max(unfunded,corporateFundingShortfall);
      var totalDrawn = Object.keys(draws).reduce(function (s, id) { return s + draws[id]; }, 0);
      var netCash = householdCashBase() + totalDrawn - taxResult.total;

      /* ---- RRSP refund, credited to next year's contribution budget ---- */
      var refund = 0;
      if (A.reinvestRefund && (deductible[0] + deductible[1]) > 0) {
        var withoutDeduction = householdTax(
          Object.assign({},person[0], { taxable: taxableOf(0, drawTaxable[0]) + deductible[0], age: age[0], oas: person[0].oas, eligiblePension: person[0].pension + person[0].bridge }),
          Object.assign({},person[1], { taxable: taxableOf(1, drawTaxable[1]) + deductible[1], age: age[1], oas: person[1].oas, eligiblePension: person[1].pension + person[1].bridge }),
          taxIdx, A.optimizePensionSplit, A.province, single
        );
        refund = Math.max(0, withoutDeduction.total - taxResult.total);
      }
      pendingRefund = refund;

      /* ---- surplus reinvestment ---- */
      /* Post-retirement, all surplus cash is reinvested. Before retirement the
         spending target is 0 and salary surplus is assumed spent — but sale
         proceeds are real money and must never evaporate. */
      var surplus = 0;
      var reinvestable = netCash - spendTarget;
      if (!anyRetired) reinvestable = Math.min(reinvestable, saleProceedsCash);
      if (A.reinvestSurplus && reinvestable > 1) {
        surplus = reinvestable;
        for (var si = 0; si < active.length; si++) {
          var sk=active[si];
          if (surplus <= 0) break;
          var put = Math.min(surplus, tfsaRoom[sk]);
          tfsaOf[sk].bal += put; tfsaOf[sk].basis += put; tfsaRoom[sk] -= put; surplus -= put;
        }
        if (surplus > 0) { nonRegistered.bal += surplus; nonRegistered.basis += surplus; }
      }

      /* ---- contributions land, then growth ---- */
      var acctRows = [];
      var corporateInvestmentTax=0;
      accts.forEach(function (ac) {
        var startBal = ac.bal + (draws[ac.id] || 0) + (ac.forcedThisYear || 0);
        var contrib = contribs[ac.id] || 0;
        ac.bal += contrib; ac.basis += contrib;
        var growth = ac.bal * (ac.rate + rateAdj + shock);
        // Effective corporate tax drag on investment returns; no personal tax until distribution.
        var corporateTax = ac.type === 'CORP' ? Math.max(0,growth)*ac.corporateTaxRate : 0;
        if(ac.type==='CORP'&&ac.integratedCorporate){
          var realized=growth*ac.capitalReturnShare*ac.realizationRate,interestIncome=Math.max(0,growth*(1-ac.capitalReturnShare));
          ac.cda=Math.max(0,ac.cda+realized*.5);ac.priorPassive=interestIncome+Math.max(0,realized)*.5;
          corporateTax=ac.priorPassive*ac.corporateTaxRate;
          ac.nrdtoh+=Math.min(corporateTax,ac.priorPassive*.306667);
          growth+=ac.refundPending||0;
        }
        corporateInvestmentTax+=corporateTax-(ac.refundPending||0);
        growth -= corporateTax;
        ac.bal = Math.max(0, ac.bal + growth);
        if (startBal > 1 || ac.bal > 1 || contrib > 1) {
          acctRows.push({
            id:ac.id,name: ac.name, owner: ac.owner, type: ac.isRRIF ? 'RRIF' : ac.type,
            start: startBal, forced: ac.forcedThisYear || 0, draw: draws[ac.id] || 0,
            contrib: contrib, growth: growth, end: ac.bal, corporateTax:corporateTax, qualifyingWithdrawal:ac.qualifyingThisYear || 0,
            cda:ac.cda||0,grip:ac.grip||0,erdtoh:ac.erdtoh||0,nrdtoh:ac.nrdtoh||0,corporateRefund:ac.refundPending||0,businessLimit:ac.businessLimit,operatingTax:ac.operatingTax||0
          });
        }
        ac.forcedThisYear = 0; ac.qualifyingThisYear = 0;ac.refundPending=0;
      });

      priorEarned = [person[0].employment + Math.max(0, person[0].rental), person[1].employment + Math.max(0, person[1].rental)];
      priorPA = employerTotal.map(function(amount,k) {
        return amount + P[k].pensionAdjustment + accts.filter(function(ac) { return ac.type === 'DC' && ownerIndex(ac.owner) === k; })
          .reduce(function(sum,ac) { return sum+(contribs[ac.id] || 0); },0)
          - accts.filter(function(ac) { return ac.type === 'DC' && ownerIndex(ac.owner) === k; }).reduce(function(sum,ac) { return sum+Math.min(person[k].employment*ac.employerMatchPct,contribs[ac.id] || 0); },0);
      });
      active.forEach(function(k) { gisPriorIncome[k] = gisIncome(k,drawTaxable[k]); });
      active.forEach(function(hk){if(hbpLeft[hk]>0)hbpLeft[hk]--;});

      var portfolio = accts.reduce(function (s, ac) { return s + Math.max(0, ac.bal); }, 0);
      var netWorth = portfolio + principalEquity + rentalEquity - otherDebt;
      var terminalIncome=[0,0],terminalTax=0,terminalResult=null,probateFees=0,estateThisYear=[];
      if(A.estate.enabled){
        var dying=active.filter(function(k){return y>=deathYears[k];}),remaining=active.filter(function(k){return dying.indexOf(k)<0;});
        dying.forEach(function(k){
          var rollover=remaining.length===1&&A.estate.spousalRollover,recipient=remaining[0],probateAssets=0;
          accts.filter(function(ac){return ac.owner===P[k].name || ac.owner==='Joint';}).forEach(function(ac){
            var share=ac.owner==='Joint'?.5:1,amount=ac.bal*share;
            if(!rollover){
              if(['RRSP','DC','FHSA'].indexOf(ac.type)>=0)terminalIncome[k]+=amount;
              if(ac.type==='TAXABLE'||ac.type==='CORP')terminalIncome[k]+=Math.max(0,ac.bal-ac.basis)*share*.5;
              if(ac.probateIncluded!==false)probateAssets+=amount;
            }
            if(remaining.length){
              if(ac.owner==='Joint')ac.owner=P[recipient].name;
              else ac.owner=P[recipient].name;
              if(!rollover){ac.type='TAXABLE';ac.basis=ac.bal;ac.isRRIF=false;}
            }else if(['RRSP','DC','FHSA'].indexOf(ac.type)>=0){ac.type='TAXABLE';ac.basis=ac.bal;ac.isRRIF=false;}
          });
          props.forEach(function(p){
            if(p.sold || p.def.purchaseYear&&y<p.def.purchaseYear)return;
            var share=single?1:(k===0?num(p.def.ownerSplit,A.rentalOwnerSplit)/100:1-num(p.def.ownerSplit,A.rentalOwnerSplit)/100);
            if(!rollover){
              if(p.def.type==='rental'){
                var building=p.value*p.def.buildingSalePercent/100;
                var recapture=Math.max(0,Math.min(building,p.def.buildingAcb)-p.ucc);
                var terminalLoss=Math.max(0,p.ucc-building),landGain=p.value-building-(p.def.acb-p.def.buildingAcb);
                var allocation=Math.min(terminalLoss,Math.max(0,landGain));terminalLoss-=allocation;building+=allocation;landGain-=allocation;
                terminalIncome[k]+=(Math.max(0,Math.max(0,building-p.def.buildingAcb)+landGain)*CAPITAL_GAINS_INCLUSION+recapture-terminalLoss)*share;
                if(remaining.length){p.def.acb+=(p.value-p.def.acb)*share;p.def.buildingAcb+=(building-p.def.buildingAcb)*share;p.ucc+=(building-p.ucc)*share;}
              }
              if(p.def.type!=='heloc')probateAssets+=Math.max(0,p.value-p.sched.byYear[y].endBalance)*share;
            }
            if(remaining.length)p.def.ownerSplit=recipient===0?100:0;
          });
          var fee=rollover?0:Planning.probate(probateAssets,A.province,A.estate);
          probateFees+=fee||0;
          var event={year:y,name:P[k].name,age:age[k],rollover:!!rollover,recipient:remaining.length?P[recipient].name:null,
            terminalIncome:terminalIncome[k],probateAssets,probate:fee,probateNeedsOverride:fee===null};
          estateThisYear.push(event);estateEvents.push(event);
        });
        if(dying.length){
          terminalResult=evalTax(drawTaxable[0]+terminalIncome[0],drawTaxable[1]+terminalIncome[1]);
          terminalTax=terminalResult.total-taxResult.total;
          dying.forEach(function(k){alive[k]=false;});
          var bill=terminalTax+probateFees;
          if(bill<0){nonRegistered.bal-=bill;nonRegistered.basis-=bill;bill=0;}
          accts.filter(function(ac){return ac.type==='TAXABLE'||ac.type==='TFSA';}).forEach(function(ac){var paid=Math.min(bill,Math.max(0,ac.bal));ac.bal-=paid;bill-=paid;});
          estateLiability+=bill;otherDebt+=bill;totalDebt+=bill;
          portfolio=accts.reduce(function(s,ac){return s+Math.max(0,ac.bal);},0);
          netWorth=portfolio+principalEquity+rentalEquity-otherDebt;
          estateThisYear.forEach(function(e){e.netEstate=netWorth;e.householdTerminalTax=terminalTax;});
          acctRows.forEach(function(r){r.end=accts[r.id].bal;});
        }
      }

      if (unfunded > 1 && depletedYear === null && anyRetired) depletedYear = y;
      if (taxResult.totalClawback > 1 && firstClawbackYear === null) firstClawbackYear = y;

      var claimantName = childcareClaim > 0 ? P[claimant].name : '';
      years.push({
        year: y, ages: age.slice(), retired: retired.slice(), deflator: 1 / inflIdx,
        alive:alive.slice(),spendingCategories:spendingCategories,estateEvents:estateThisYear,terminalTax:terminalTax,probateFees:probateFees,
        provincialBenefits:provincialBenefits,smithAdvance:smithAdvance,smithInterest:smithInterest[0]+smithInterest[1],smithDebt:props.reduce(function(s,p){return s+p.smithBalance;},0),
        extraDebtPayments:extraDebtPayments,corporateOperatingTax:corporateOperatingTax,corporateInvestmentTax:corporateInvestmentTax,corporateWarnings:corporateWarnings,
        employment: person[0].employment + person[1].employment,
        dividends:person[0].eligibleDividends+person[0].nonEligibleDividends+person[1].eligibleDividends+person[1].nonEligibleDividends-corporateDrawCash,
        gis:gisCash, payrollCPP:person[0].payroll+person[1].payroll, fhsaQualifyingWithdrawal:fhsaQualifyingCash, fhsaRoom:fhsaRoom.slice(),
        cpp: person[0].cpp + person[1].cpp,
        oas: person[0].oas + person[1].oas,
        pension: person[0].pension + person[1].pension + person[0].bridge + person[1].bridge,
        pension2: person[0].pension2 + person[1].pension2,
        bridge: person[0].bridge + person[1].bridge,
        rentGross: rentGross, rentOpex: rentOpex, rentInterest: rentInterest,
        rentPayment: rentPayment, rentCash: rentCash, rentTaxable: rentTaxable,
        ccaClaim: ccaClaim, uccRemaining: rentals.reduce(function(s,p) { return s+(p.sold ? 0 : p.ucc); },0), ccaClaimedToDate: rentals.reduce(function(s,p) { return s+p.ccaClaimed; },0), rentals:rentalRows,
        rrifForced: rrifForced, discretionaryDraw: totalDrawn, totalWithdrawn: totalDrawn + rrifForced,
        contributions: totalContribs, contributionsFromCash: householdContribCash,
        employerContributions: employerTotal[0] + employerTotal[1],
        hbpRepayments: hbpPaid[0] + hbpPaid[1],
        hbpShortfall: hbpShortfall.reduce(function(s,v) { return s+v; },0),
        deductibleContributions: deductible[0] + deductible[1],
        refund: refund, redirected: redirected,
        rrspTarget: rrspTarget.slice(), rrspPace: rrspPace.slice(),
        childcareClaim: childcareClaim, childcareSpend: ccSpend, childcareCap: ccCap, childcareClaimant: claimantName,
        rrspRoom: rrspRoom.slice(), tfsaRoom: tfsaRoom.slice(),
        incomeTax: taxResult.totalTax, oasClawback: taxResult.totalClawback,
        totalTax: taxResult.total+terminalTax, pensionSplit: taxResult.split, provincialPensionSplit:taxResult.provincialSplit,
        taxableIncome: [taxableOf(0, drawTaxable[0])+terminalIncome[0], taxableOf(1, drawTaxable[1])+terminalIncome[1]],
        marginalRates: [
          marginalRate(taxableOf(0, drawTaxable[0]), age[0], 0, person[0].oas, taxIdx, A.province, person[0]),
          marginalRate(taxableOf(1, drawTaxable[1]), age[1], 0, person[1].oas, taxIdx, A.province, person[1])
        ],
        spendTarget: spendTarget, netCash: netCash, unfunded: unfunded, surplus: surplus,
        portfolio: portfolio, principalEquity: principalEquity, rentalEquity: rentalEquity,
        debt: totalDebt, otherDebt: otherDebt, netWorth: netWorth,
        householdDebtPayments: householdDebtPayments,
        saleEvents: saleEvents, saleProceeds: saleProceedsCash, saleCapitalLoss: saleCapitalLoss, saleIncomeTax: saleIncomeTax,
        accounts: acctRows, debts: debtRows,
        person: active.map(function (k) {
          var annualTax=terminalResult||taxResult,pt = k === 0 ? annualTax.p1 : annualTax.p2;
          return {
            name: P[k].name, employment: person[k].employment, cpp: person[k].cpp, oas: person[k].oas,
            pension: person[k].pension, pension2: person[k].pension2, bridge: person[k].bridge, rrif: person[k].rrif,
            rental: person[k].rental, sale: person[k].sale, gis:person[k].gis, payrollCPP:person[k].payroll,
            eligibleDividends:person[k].eligibleDividends, nonEligibleDividends:person[k].nonEligibleDividends, fhsaRoom:fhsaRoom[k],
            childcare: childcareDeduction[k], deductible: deductible[k],
            hbpShortfall:hbpShortfall[k] || 0, terminalIncome:terminalIncome[k], federalTax:pt.federal, provincialTax:pt.provincial,
            federalAgeAmount:pt.federalAgeAmount, provincialAgeAmount:pt.provincialAgeAmount,
            rrspTarget: rrspTarget[k], rrspPace: rrspPace[k],
            tax: pt.income, clawback: pt.clawback, rrspRoom: rrspRoom[k], tfsaRoom: tfsaRoom[k]
          };
        })
      });
    }

    return {
      years: years, depletedYear: depletedYear, firstClawbackYear: firstClawbackYear,
      estateEvents:estateEvents,cppEstimates:cppEstimates,netEstate:netWorth,
      lifetimeCorporateTax:years.reduce(function(s,r){return s+r.corporateOperatingTax+r.corporateInvestmentTax;},0),
      lifetimeBenefits:years.reduce(function(s,r){return s+r.gis+r.provincialBenefits;},0),
      startYear: startYear, endYear: endYear,
      contributionPlan: opts.contributionPlan || planOut,
      schedules: props.map(function (p) {
        return {
          name: p.def.name, type: p.def.type,
          configuredPayoff: p.def.payoffYear, actualPayoff: p.sched.actualPayoffYear,
          negativeAmortization: p.sched.negativeAmortization,
          mismatch: p.def.payoffYear
            ? (p.sched.actualPayoffYear ? Math.abs(p.def.payoffYear - p.sched.actualPayoffYear) > 1 : true)
            : false,
          saleYear: p.def.saleYear || null
        };
      }),
      lifetimeTax: years.reduce(function (s, r) { return s + r.totalTax; }, 0),
      lifetimeRefunds: years.reduce(function (s, r) { return s + r.refund; }, 0),
      finalNetWorth: years.length ? years[years.length - 1].netWorth : 0,
      finalNetWorthReal: years.length ? years[years.length - 1].netWorth * years[years.length - 1].deflator : 0
    };
  }

  /* ------------------------------------------------- max sustainable spend */
  function maxSustainableSpend(cfg, opts) {
    var lo = 0, hi = 40000, best = 0;
    var base = clone(cfg);
    for (var i = 0; i < 18; i++) {
      var mid = (lo + hi) / 2;
      base.assumptions.desiredMonthlyIncome = mid;
      var res = simulate(base, Object.assign({ fastSolve: true,spendingScale:base.assumptions.spendingMode === 'categories' ? mid/Math.max(1,Planning.spendingBaseline(base.assumptions.spendingCategories)/12) : 1 }, opts || {}));
      if (isFunded(res)) { best = mid; lo = mid; } else { hi = mid; }
    }
    return best;
  }

  /* ---------------------------------------------------------- monte carlo  */
  // Exhaustive, ordered search: pension tiers and benefit cutoffs make funding
  // non-monotonic. Run in a worker in the UI so sliders remain responsive.
  function retirementCandidates(cfg, opts) {
    cfg = normalizeConfig(cfg); opts = opts || {};
    var year = opts.startYear || new Date().getFullYear(), single = cfg.assumptions.householdType === 'single';
    var ranges = cfg.incomes.map(function(p,k) {
      var current = year-p.birthYear, upper = Math.min(int(opts.maxAge,75),cfg.assumptions.targetDeathAge-1);
      if (single && k === 1) return [p.targetRetireAge];
      if (opts.fixedPerson === k) return p.targetRetireAge < cfg.assumptions.targetDeathAge ? [p.targetRetireAge] : [];
      if (p.targetRetireAge < current) return [p.targetRetireAge]; // Already retired.
      var ages = []; for (var age=Math.max(18,current); age<=upper; age++) ages.push(age);
      return ages;
    });
    var candidates = [];
    function gap(x) { return single ? 0 : Math.abs(cfg.incomes[0].birthYear+x[0]-cfg.incomes[1].birthYear-x[1]); }
    ranges[0].forEach(function(a) { ranges[1].forEach(function(b) {
      if(opts.maxYearGap==null || gap([a,b])<=Math.max(0,num(opts.maxYearGap)))candidates.push([a,b]);
    }); });
    function latest(x) { return single ? cfg.incomes[0].birthYear+x[0] : Math.max(cfg.incomes[0].birthYear+x[0],cfg.incomes[1].birthYear+x[1]); }
    return candidates.sort(function(a,b) { return latest(a)-latest(b) || (opts.preferClose ? gap(a)-gap(b) : 0) || (a[0]+a[1])-(b[0]+b[1]) || a[0]-b[0]; });
  }
  function solveRetirementAges(cfg, opts) {
    opts = opts || {}; cfg = normalizeConfig(cfg);
    var candidates = retirementCandidates(cfg,opts), base = clone(cfg), count = 0;
    for (var i=0;i<candidates.length;i++) {
      candidates[i].forEach(function(age,k) { base.incomes[k].targetRetireAge=age; });
      if(opts.sellRentals){
        var paths=rentalSaleSchedules(base,opts),winner=null,winnerSales=null;
        for(var j=0;j<paths.length;j++){
          var trial=clone(base);applyRentalSales(trial,paths[j]);
          var projected=simulate(trial,{startYear:opts.startYear});count++;
          if(opts.onProgress&&count%10===0)opts.onProgress(count,candidates.length*paths.length);
          if(isFunded(projected)&&(!winner||projected.finalNetWorthReal>winner.finalNetWorthReal+1)) {winner=projected;winnerSales=paths[j];}
        }
        if(winner)return {found:true,ages:candidates[i],years:candidates[i].map(function(a,k){return cfg.incomes[k].birthYear+a;}),tested:count,goal:cfg.assumptions.desiredMonthlyIncome,endYear:winner.endYear,rentalSales:winnerSales};
        continue;
      }
      var result = simulate(base,{startYear:opts.startYear,fastSolve:true}); count++;
      if (opts.onProgress && (count%10 === 0)) opts.onProgress(count,candidates.length);
      if (result.years.length && result.depletedYear === null && result.years.every(function(r) { return r.unfunded <= 1; })) {
        // Verify the displayed candidate at the dashboard's full precision.
        result=simulate(base,{startYear:opts.startYear});
        if (result.depletedYear !== null || result.years.some(function(r) { return r.unfunded > 1; })) continue;
        return {found:true,ages:candidates[i],years:candidates[i].map(function(a,k) { return cfg.incomes[k].birthYear+a; }),
          tested:count,goal:cfg.assumptions.desiredMonthlyIncome,endYear:result.endYear};
      }
    }
    return {found:false,tested:count,maxAge:int(opts.maxAge,75),goal:cfg.assumptions.desiredMonthlyIncome};
  }

  function optimizeWithdrawals(cfg,opts){
    opts=opts||{};cfg=normalizeConfig(cfg);
    var originalPlan=clone(cfg.assumptions.withdrawalPlan||null);
    var evaluated=0,maxEvaluations=int(opts.maxEvaluations,700),objective=opts.objective||'tax';
    var baseline=simulate(cfg,{startYear:opts.startYear}),best=baseline,bestPlan=originalPlan,bestStrategy=cfg.assumptions.withdrawalStrategy;
    delete cfg.assumptions.withdrawalPlan;
    function score(r){
      var shortfall=r.years.reduce(function(s,y){return s+y.unfunded*y.deflator;},0);
      var tax=r.lifetimeTax+r.lifetimeCorporateTax;
      var benefit=r.lifetimeBenefits;
      return shortfall*1e7+(objective==='estate'?-r.finalNetWorthReal:objective==='benefits'?tax-benefit:tax);
    }
    var bestScore=score(best);
    function evaluate(plan,strategy){
      if(evaluated>=maxEvaluations)return false;
      var result=simulate(cfg,{startYear:opts.startYear,withdrawalPlan:plan,withdrawalStrategy:strategy,fastSolve:true});evaluated++;
      if(opts.onProgress&&evaluated%10===0)opts.onProgress({evaluated,maxEvaluations,bestTax:best.lifetimeTax,objective});
      var s=score(result);
      // Preserve a funded baseline and its after-tax ending estate while reducing tax.
      if(s<bestScore-.01&&(!isFunded(baseline)||isFunded(result))&&(objective==='estate'||result.finalNetWorthReal>=baseline.finalNetWorthReal-1)){
        best=result;bestScore=s;bestPlan=plan?clone(plan):null;bestStrategy=strategy;return true;
      }
      return false;
    }
    Object.keys(WITHDRAWAL_ORDERS).forEach(function(strategy){evaluate(null,strategy);});
    var plan={};
    best.years.forEach(function(row){plan[row.year]=cfg.incomes.map(function(p){return row.accounts.filter(function(ac){return ac.owner===p.name&&['RRSP','RRIF','DC'].indexOf(ac.type)>=0;}).reduce(function(s,ac){return s+ac.draw+ac.forced;},0);});});
    var count=cfg.assumptions.householdType==='single'?1:2;
    var periods=best.years.filter(function(r){return r.retired.some(Boolean);});
    // Coordinate search across all retirement years, then refine dollar amounts.
    [10000,2500,500,1].forEach(function(step){
      periods.forEach(function(row){for(var k=0;k<count&&evaluated<maxEvaluations;k++){
        var current=num(plan[row.year][k]);
        var choices=step===10000?[0,current+step,Math.max(0,57375/row.deflator-row.taxableIncome[k]+current),Math.max(0,93454/row.deflator-row.taxableIncome[k]+current)]:[Math.max(0,current-step),current+step];
        choices.forEach(function(value){var candidate=clone(plan);candidate[row.year][k]=Math.round(value);if(evaluate(candidate,'tfsa-first'))plan=clone(bestPlan);});
      }});
    });
    var verified=simulate(cfg,{startYear:opts.startYear,withdrawalPlan:bestPlan,withdrawalStrategy:bestStrategy});
    if(score(verified)>score(baseline)+1 || isFunded(baseline)&&!isFunded(verified) || objective!=='estate'&&verified.finalNetWorthReal<baseline.finalNetWorthReal-1){verified=baseline;bestPlan=originalPlan;bestStrategy=cfg.assumptions.withdrawalStrategy;}
    return {baseline:baseline,result:verified,withdrawalPlan:bestPlan,withdrawalStrategy:bestStrategy,evaluated,objective,
      taxSavings:baseline.lifetimeTax+baseline.lifetimeCorporateTax-verified.lifetimeTax-verified.lifetimeCorporateTax,
      benefitChange:verified.lifetimeBenefits-baseline.lifetimeBenefits,estateChange:verified.finalNetWorthReal-baseline.finalNetWorthReal,
      globalOptimum:false};
  }

  function isFunded(r){return r.years.length>0&&r.depletedYear===null&&r.years.every(function(y){return y.unfunded<=1;});}
  function totalTax(r){return r.lifetimeTax+r.lifetimeCorporateTax;}
  function compareWithdrawalOrders(cfg,opts){
    opts=opts||{};cfg=normalizeConfig(cfg);
    var baseline=simulate(cfg,{startYear:opts.startYear});
    var rows=[{label:'Current settings',strategy:cfg.assumptions.withdrawalStrategy,plan:cfg.assumptions.withdrawalPlan||null,config:clone(cfg)}];
    Object.keys(WITHDRAWAL_ORDERS).forEach(function(strategy){var c=clone(cfg);delete c.assumptions.withdrawalPlan;c.assumptions.withdrawalStrategy=strategy;rows.push({label:strategy,strategy:strategy,plan:null,config:c});});
    rows.forEach(function(row,i){var r=i===0?baseline:simulate(row.config,{startYear:opts.startYear});row.tax=totalTax(r);row.estate=r.finalNetWorthReal;row.funded=isFunded(r);row.shortfallYear=(r.years.find(function(y){return y.unfunded>1;})||{}).year||null;row.monthlySpend=maxSustainableSpend(row.config,{startYear:opts.startYear});delete row.config;if(opts.onProgress)opts.onProgress({evaluated:i+1,maxEvaluations:rows.length});});
    var viable=rows.filter(function(r){return r.funded;});
    return {rows:rows,bestTax:viable.reduce(function(a,b){return !a||b.tax<a.tax?b:a;},null),bestEstate:viable.reduce(function(a,b){return !a||b.estate>a.estate?b:a;},null),bestSpending:rows.reduce(function(a,b){return b.monthlySpend>a.monthlySpend?b:a;},rows[0])};
  }
  function applyRentalSales(cfg,sales){sales.forEach(function(s){cfg.realEstate[s.index].saleYear=s.year;});}
  function rentalSaleSchedules(cfg,opts){
    opts=opts||{};var start=opts.startYear||new Date().getFullYear(),projection=simulate(cfg,{startYear:start});
    var rentals=cfg.realEstate.map(function(p,index){return {p:p,index:index};}).filter(function(x){return x.p.type==='rental'&&(!x.p.saleYear||x.p.saleYear>=start);});
    var current=rentals.map(function(x){return {index:x.index,year:x.p.saleYear};}),paths=[current],seen=new Set([JSON.stringify(current)]);
    function add(path){var key=JSON.stringify(path);if(!seen.has(key)){paths.push(path);seen.add(key);}}
    add(rentals.map(function(x){return {index:x.index,year:0};}));
    for(var year=start;year<=projection.endYear;year++){
      if(rentals.length&&rentals.every(function(x){return !x.p.purchaseYear||year>=x.p.purchaseYear;}))add(rentals.map(function(x){return {index:x.index,year:year};}));
    }
    return paths;
  }
  function compareRentalSales(cfg,opts){
    opts=opts||{};cfg=normalizeConfig(cfg);var index=int(opts.propertyIndex,-1),property=cfg.realEstate[index];
    if(!property||property.type!=='rental')throw new Error('Choose a rental property first.');
    var start=opts.startYear||new Date().getFullYear();
    if(property.saleYear&&property.saleYear<start)throw new Error('This rental has a past sale year. Update Properties to describe what you own today.');
    if(property.acb<=0||property.buildingAcb>property.acb||property.uccPool>property.buildingAcb)throw new Error('Check total cost, building cost and remaining UCC under Properties. UCC must not exceed building cost, and building cost must not exceed total cost.');
    // All alternatives include the same terminal-tax assumptions, including holding.
    cfg.assumptions.estate.enabled=true;
    var baseline=simulate(cfg,{startYear:start}),rows=[],candidates=[{label:'Current settings',year:property.saleYear,cca:property.ccaEnabled},{label:'Keep through plan',year:0,cca:property.ccaEnabled}];
    for(var year=Math.max(start,property.purchaseYear||start);year<=baseline.endYear;year++){
      candidates.push({label:'Sell '+year,year:year,cca:property.ccaEnabled});
      if(opts.compareCCA)candidates.push({label:'Sell '+year+'; no future CCA',year:year,cca:false});
    }
    if(opts.compareCCA)candidates.push({label:'Keep; no future CCA',year:0,cca:false});
    candidates.forEach(function(choice,i){
      var c=clone(cfg);c.realEstate[index].saleYear=choice.year;c.realEstate[index].ccaEnabled=choice.cca;
      if(i!==0)delete c.assumptions.withdrawalPlan;
      var r=i===0?baseline:simulate(c,{startYear:start}),saleRow=r.years.find(function(y){return y.year===choice.year;}),event=saleRow&&saleRow.saleEvents.find(function(s){return s.name===property.name;});
      rows.push({label:choice.label,year:choice.year,cca:choice.cca,tax:totalTax(r),estate:r.finalNetWorthReal,funded:isFunded(r),shortfallYear:(r.years.find(function(y){return y.unfunded>1;})||{}).year||null,benefits:r.lifetimeBenefits,sale:event||null,saleIncomeTax:event?saleRow.saleIncomeTax:null,taxChange:totalTax(r)-totalTax(baseline),estateChange:r.finalNetWorthReal-baseline.finalNetWorthReal});
      if(opts.onProgress)opts.onProgress({evaluated:i+1,maxEvaluations:candidates.length});
    });
    var funded=rows.filter(function(r){return r.funded;});
    return {rows:rows,propertyIndex:index,propertyName:property.name,startYear:start,endYear:baseline.endYear,includesTerminalTax:true,bestTax:funded.reduce(function(a,b){return !a||b.tax<a.tax?b:a;},null),bestEstate:funded.reduce(function(a,b){return !a||b.estate>a.estate?b:a;},null)};
  }

  function monteCarloRun(cfg, runs, seed, onProgress, done) {
    runs = runs || 500;
    var plan = simulate(cfg, { fastSolve: true }).contributionPlan;
    var results = [], run = 0, byYear = {};
    function chunk() {
      var stop = Math.min(run + 25, runs);
      for (; run < stop; run++) {
        var res = simulate(cfg, {
          returnMode: 'monte-carlo', rand: mulberry32(seed + run * 7919),
          fastSolve: true, contributionPlan: plan
        });
        results.push({ depletedYear: res.depletedYear, funded:isFunded(res), finalNetWorth: res.finalNetWorth, lifetimeTax: res.lifetimeTax });
        res.years.forEach(function (r) { (byYear[r.year] = byYear[r.year] || []).push(r.portfolio); });
      }
      if (onProgress) onProgress(run / runs);
      if (run < runs) setTimeout(chunk, 0);
      else {
        var successes = results.filter(function (r) { return r.funded; }).length;
        var bands = Object.keys(byYear).map(function (yr) {
          var arr = byYear[yr].sort(function (a, b) { return a - b; });
          function pct(p) { return arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]; }
          return { year: parseInt(yr, 10), p10: pct(0.10), p25: pct(0.25), p50: pct(0.50), p75: pct(0.75), p90: pct(0.90) };
        }).sort(function (a, b) { return a.year - b.year; });
        done({ runs: runs, successRate: successes / runs, bands: bands, results: results });
      }
    }
    chunk();
  }
  function monteCarloSync(cfg, runs, seed) {
    var plan = simulate(cfg, { fastSolve: true }).contributionPlan;
    var ok = 0;
    for (var i = 0; i < runs; i++) {
      var r = simulate(cfg, { returnMode: 'monte-carlo', rand: mulberry32((seed || 1) + i * 7919), fastSolve: true, contributionPlan: plan });
      if (isFunded(r)) ok++;
    }
    return ok / runs;
  }

  /* ------------------------------------------------------------- timeline  */
  function buildTimeline(cfg, sim) {
    cfg = normalizeConfig(cfg);
    var P = cfg.incomes, ev = [];
    function add(year, label) { if (year) ev.push({ year: year, label: label }); }
    (cfg.assumptions.householdType === 'single' ? [0] : [0,1]).forEach(function (k) {
      add(P[k].birthYear + P[k].targetRetireAge, P[k].name + ' retires (age ' + P[k].targetRetireAge + ')');
      add(P[k].birthYear + P[k].cppStartAge, P[k].name + ' starts CPP (age ' + P[k].cppStartAge + ')');
      add(P[k].birthYear + P[k].oasStartAge, P[k].name + ' starts OAS (age ' + P[k].oasStartAge + ')');
      add(P[k].birthYear + P[k].rrifConversionAge, P[k].name + ' RRSP converts to RRIF');
      add(P[k].birthYear + P[k].rrifConversionAge + 1, P[k].name + ' RRIF minimum withdrawals begin');
      add(P[k].birthYear + 75, P[k].name + ' OAS increases 10% (age 75)');
      if (P[k].hooppStartAge) {
        add(P[k].birthYear + P[k].hooppStartAge, P[k].name + ' starts HOOPP (age ' + P[k].hooppStartAge + ')');
        add(P[k].birthYear + 65, P[k].name + ' HOOPP bridge benefit ends (age 65)');
      }
      if (P[k].hbpYears > 0) add(sim.startYear + P[k].hbpYears, P[k].name + ' finishes HBP repayments');
      if (P[k].pension2Amount > 0) add(P[k].birthYear + P[k].pension2StartAge, P[k].name + ' starts ' + P[k].pension2Name);
    });
    cfg.dbPensions.forEach(function(plan) {
      var p = P.find(function(p) { return p.name === plan.owner; });
      if (!p || (cfg.assumptions.householdType === 'single' && p !== P[0])) return;
      add(p.birthYear+(plan.followsRetirement ? p.targetRetireAge : plan.startAge),p.name+' starts '+plan.name);
      if (plan.bridge > 0) add(p.birthYear+plan.bridgeCutoffAge,plan.name+' bridge ends');
    });
    var lastChildcare = null;
    sim.years.forEach(function (r) { if (r.childcareSpend > 0) lastChildcare = r.year; });
    if (lastChildcare) add(lastChildcare + 1, 'Childcare expenses end');
    sim.schedules.forEach(function (s) {
      if (s.saleYear) add(s.saleYear, s.name + ' sold');
      if (s.actualPayoff) add(s.actualPayoff, s.name + ' paid off');
      else if (s.configuredPayoff) add(s.configuredPayoff, s.name + ' paid off (assumed)');
    });
    if (sim.firstClawbackYear) add(sim.firstClawbackYear, 'OAS clawback begins');
    if (sim.depletedYear) add(sim.depletedYear, 'Portfolio can no longer fund the spending target');
    return ev.filter(function (e) { return e.year >= sim.startYear && e.year <= sim.endYear; })
             .sort(function (a, b) { return a.year - b.year; });
  }

  return {
    simulate: simulate, maxSustainableSpend: maxSustainableSpend,
    solveRetirementAges:solveRetirementAges, retirementCandidates:retirementCandidates,
    optimizeWithdrawals:optimizeWithdrawals,compareWithdrawalOrders:compareWithdrawalOrders,compareRentalSales:compareRentalSales,Planning:Planning,
    monteCarloRun: monteCarloRun, monteCarloSync: monteCarloSync,
    buildTimeline: buildTimeline, normalizeConfig: normalizeConfig, defaultConfig: defaultConfig,
    personTax: personTax, marginalRate: marginalRate, householdTax: householdTax,
    buildSchedule: buildSchedule, rrifFactor: rrifFactor, pensionEstimate: hooppAt,
    childcareSpend: childcareSpend, childcareCap: childcareCap,
    WITHDRAWAL_ORDERS: WITHDRAWAL_ORDERS, TAX_BASE_YEAR: TAX_BASE_YEAR,
    PROVINCES: PROVINCES, gisBenefit:gisBenefit, payrollCPP:payrollCPP,
    FED: FED, ONT: ONT, OAS_CLAWBACK_THRESHOLD: OAS_CLAWBACK_THRESHOLD,
    RRSP_DOLLAR_LIMIT: RRSP_DOLLAR_LIMIT, TFSA_ANNUAL_ROOM: TFSA_ANNUAL_ROOM
  };
});
