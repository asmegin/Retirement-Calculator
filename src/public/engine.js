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
          cppStartAge: 65, oasStartAge: 65, hooppStartAge: 55,
          rrspRoomOpening: 112212, tfsaRoomOpening: 103319,
          hbpAnnual: 1516, hbpYears: 10 }
      ],
      assumptions: {
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
      var dp = d.incomes[idx];
      return {
        name: p.name || dp.name,
        birthYear: int(p.birthYear, dp.birthYear),
        salary: num(p.salary, dp.salary),
        salaryGrowth: num(p.salaryGrowth, dp.salaryGrowth),
        cppBaseAt65: num(p.cppBaseAt65, dp.cppBaseAt65),
        oasBaseAt65: num(p.oasBaseAt65, dp.oasBaseAt65),
        targetRetireAge: int(p.targetRetireAge, dp.targetRetireAge),
        cppStartAge: clamp(int(p.cppStartAge, 65), 60, 70),
        oasStartAge: clamp(int(p.oasStartAge, 65), 65, 70),
        hooppStartAge: (p.hooppStartAge === undefined || p.hooppStartAge === '' || p.hooppStartAge === null)
          ? (dp.hooppStartAge || null) : int(p.hooppStartAge, 55),
        rrspRoomOpening: num(p.rrspRoomOpening, dp.rrspRoomOpening),
        tfsaRoomOpening: num(p.tfsaRoomOpening, dp.tfsaRoomOpening),
        hbpAnnual: num(p.hbpAnnual, dp.hbpAnnual),
        hbpYears: int(p.hbpYears, dp.hbpYears),
        pension2Name: p.pension2Name || 'Other pension',
        pension2Amount: num(p.pension2Amount, 0),
        pension2StartAge: int(p.pension2StartAge, 65),
        pension2IndexRate: num(p.pension2IndexRate, 0)
      };
    });

    var a = c.assumptions || {}, da = d.assumptions;
    var phases = Array.isArray(a.spendingPhases) && a.spendingPhases.length ? a.spendingPhases : da.spendingPhases;
    var cc = a.childcare || da.childcare;
    c.assumptions = {
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
      optimizePensionSplit: a.optimizePensionSplit !== false,
      reinvestSurplus: a.reinvestSurplus !== false,
      reinvestPayoffPayments: a.reinvestPayoffPayments !== false,
      hooppIndexRate: num(a.hooppIndexRate, da.hooppIndexRate),
      hooppIndexBeforeStart: a.hooppIndexBeforeStart === true,
      optimizeContributions: a.optimizeContributions !== false,
      rrspMinMarginalRate: num(a.rrspMinMarginalRate, num(a.assumedWithdrawalRate, da.rrspMinMarginalRate)),
      contributionSlice: Math.max(100, num(a.contributionSlice, da.contributionSlice)),
      reinvestRefund: a.reinvestRefund !== false,
      spendingPhases: phases.map(function (p) {
        return { untilAge: int(p.untilAge, 999), factor: num(p.factor, 100) };
      }).sort(function (x, y) { return x.untilAge - y.untilAge; }),
      childcare: {
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
      }
    };

    var owners = [c.incomes[0].name, c.incomes[1].name];
    c.accounts = (Array.isArray(c.accounts) ? c.accounts : d.accounts).map(function (ac) {
      var t = String(ac.type || 'RRSP').toUpperCase();
      if (['RRSP', 'TFSA', 'TAXABLE'].indexOf(t) < 0) t = 'RRSP';
      var owner = (ac.owner && (owners.indexOf(ac.owner) >= 0 || ac.owner === 'Joint')) ? ac.owner : owners[0];
      var freq = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly'].indexOf(ac.contribFreq) >= 0
        ? ac.contribFreq : 'monthly';
      return {
        name: ac.name || 'Account',
        owner: owner,
        type: t,
        balance: num(ac.balance, 0),
        costBasis: (ac.costBasis === undefined || ac.costBasis === '') ? num(ac.balance, 0) : num(ac.costBasis, 0),
        growthRate: num(ac.growthRate, 6),
        distributionYield: num(ac.distributionYield, t === 'TAXABLE' ? 2 : 0),
        contribAmt: num(ac.contribAmt, 0),
        contribFreq: freq,
        contribGrowth: num(ac.contribGrowth, 0),
        annualBonus: num(ac.annualBonus, 0),
        employerMatchPct: t === 'RRSP' ? num(ac.employerMatchPct, 0) : 0,
        solveToTarget: ac.solveToTarget === true && t === 'RRSP',
        /* solve mode replaces pooling — an account is never both */
        flexible: ac.flexible === true && !(ac.solveToTarget === true && t === 'RRSP'),
        hbpAccount: ac.hbpAccount === true,
        reinvestTarget: ac.reinvestTarget === true
      };
    });

    c.hooppTiers = (Array.isArray(c.hooppTiers) && c.hooppTiers.length ? c.hooppTiers : d.hooppTiers)
      .map(function (t) {
        return { startAge: int(t.startAge, 55), lifetime: num(t.lifetime, 0), bridge: num(t.bridge, 0) };
      }).sort(function (x, y) { return x.startAge - y.startAge; });

    c.realEstate = (Array.isArray(c.realEstate) ? c.realEstate : d.realEstate).map(function (r) {
      var name = r.name || 'Property';
      var type = String(r.type || 'principal').toLowerCase();
      if (/heloc|line of credit/i.test(name)) type = 'heloc';
      if (['principal', 'rental', 'heloc'].indexOf(type) < 0) type = 'principal';
      var rate = num(r.interestRate, type === 'heloc' ? 3.75 : 4);
      return {
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
        annualPropertyTax: num(r.annualPropertyTax, 0),
        annualInsurance: num(r.annualInsurance, 0),
        annualMaintenance: num(r.annualMaintenance, 0),
        otherAnnualInterest: num(r.otherAnnualInterest, 0),
        attachToRental: r.attachToRental === true || (type === 'heloc' && r.attachToRental === undefined),
        interestDeductible: r.interestDeductible === true ||
          (r.interestDeductible === undefined && (type === 'rental' || (type === 'heloc' && r.attachToRental !== false))),
        reinvestOnPayoff: r.reinvestOnPayoff !== false,
        acb: num(r.acb, 0),
        saleYear: int(r.saleYear, 0),
        sellingCostPct: num(r.sellingCostPct, 5),
        ccaEnabled: r.ccaEnabled === true,
        uccPool: num(r.uccPool, 0)
      };
    });

    delete c.pensions;
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

    var linear = !(num(debt.interestRate) > 0 && pmt > 0);
    var span = Math.max(1, (int(debt.payoffYear) || endYear) - startYear + 1);
    var linearPrincipal = bal / span;

    for (var y = startYear; y <= endYear; y++) {
      var interest = 0, principal = 0, paid = 0;
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
        if (bal <= 0.01 && actualPayoff === null) actualPayoff = y;
      }
      sched[y] = { interest: interest, principal: principal, payment: paid, endBalance: Math.max(0, bal) };
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

  function personTax(taxable, age, eligiblePension, oasReceived, idx) {
    taxable = Math.max(0, taxable);
    function jurisdiction(J, withSurtax) {
      var gross = bracketTax(taxable, J.brackets, idx);
      var credits = J.bpa * idx;
      if (age >= 65) credits += Math.max(0, J.ageAmt * idx - 0.15 * Math.max(0, taxable - J.ageThresh * idx));
      credits += Math.min(J.pensionAmt * idx, Math.max(0, eligiblePension));
      var net = Math.max(0, gross - credits * J.creditRate);
      if (withSurtax) {
        var s = 0;
        if (net > J.surtax1 * idx) s += 0.20 * (net - J.surtax1 * idx);
        if (net > J.surtax2 * idx) s += 0.36 * (net - J.surtax2 * idx);
        net += s;
      }
      return net;
    }
    var fed = jurisdiction(FED, false);
    var ont = jurisdiction(ONT, true);
    var clawback = Math.min(
      Math.max(0, oasReceived),
      OAS_CLAWBACK_RATE * Math.max(0, taxable - OAS_CLAWBACK_THRESHOLD * idx)
    );
    return { income: fed + ont, clawback: clawback, total: fed + ont + clawback };
  }

  function marginalRate(taxable, age, eligiblePension, oas, idx) {
    var a = personTax(taxable, age, eligiblePension, oas, idx).total;
    var b = personTax(taxable + 1000, age, eligiblePension, oas, idx).total;
    return (b - a) / 1000;
  }

  function householdTax(p1, p2, idx, splitEnabled) {
    var t1 = p1.taxable, t2 = p2.taxable, transfer = 0;
    if (splitEnabled) {
      if (t1 > t2 && p1.eligiblePension > 0) transfer = Math.min(0.5 * p1.eligiblePension, (t1 - t2) / 2);
      else if (t2 > t1 && p2.eligiblePension > 0) transfer = -Math.min(0.5 * p2.eligiblePension, (t2 - t1) / 2);
    }
    var a = personTax(t1 - transfer, p1.age, Math.max(0, p1.eligiblePension - Math.max(0, transfer)), p1.oas, idx);
    var b = personTax(t2 + transfer, p2.age, Math.max(0, p2.eligiblePension - Math.max(0, -transfer)), p2.oas, idx);
    return {
      p1: a, p2: b, split: transfer,
      totalTax: a.income + b.income, totalClawback: a.clawback + b.clawback, total: a.total + b.total
    };
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
    var A = cfg.assumptions;
    var infl = num(A.inflation) / 100;
    var startYear = opts.startYear || new Date().getFullYear();
    var P = cfg.incomes;
    var birth = [int(P[0].birthYear), int(P[1].birthYear)];
    var retireYear = [birth[0] + int(P[0].targetRetireAge), birth[1] + int(P[1].targetRetireAge)];
    var deathAge = int(A.targetDeathAge, 90);
    var endYear = Math.max(birth[0] + deathAge, birth[1] + deathAge);
    var mode = opts.returnMode || A.returnMode || 'deterministic';
    var strategy = opts.withdrawalStrategy || A.withdrawalStrategy || 'tfsa-first';
    var order = WITHDRAWAL_ORDERS[strategy] || WITHDRAWAL_ORDERS['tfsa-first'];
    var rand = opts.rand || null;
    var vol = num(A.mcVolatility, 12) / 100;
    var firstRetireYear = Math.min(retireYear[0], retireYear[1]);
    var slice = A.contributionSlice;
    var rrspFloor = num(A.rrspMinMarginalRate, 35) / 100;

    var accts = cfg.accounts.map(function (a, idx) {
      return {
        id: idx, name: a.name, owner: a.owner, type: a.type,
        bal: a.balance, basis: a.type === 'TAXABLE' ? a.costBasis : a.balance,
        rate: a.growthRate / 100, dist: a.distributionYield / 100,
        baseContrib: contribPerYear(a.contribAmt, a.contribFreq),
        annualBonus: a.annualBonus,
        employerMatchPct: a.employerMatchPct / 100,
        contribGrowth: a.contribGrowth / 100,
        flexible: a.flexible, solveToTarget: a.solveToTarget,
        hbpAccount: a.hbpAccount, reinvestTarget: a.reinvestTarget,
        isRRIF: false
      };
    });
    function ownerIndex(o) { return o === P[1].name ? 1 : 0; }
    function ensureAccount(type, owner, name) {
      var found = accts.filter(function (x) { return x.type === type && x.owner === owner; })[0];
      if (found) return found;
      var made = {
        id: accts.length, name: name, owner: owner, type: type, bal: 0, basis: 0,
        rate: (accts[0] ? accts[0].rate : 0.06), dist: type === 'TAXABLE' ? 0.02 : 0,
        baseContrib: 0, annualBonus: 0, employerMatchPct: 0, contribGrowth: 0,
        flexible: false, solveToTarget: false, hbpAccount: false, reinvestTarget: false,
        isRRIF: false, synthetic: true
      };
      accts.push(made); return made;
    }
    var tfsaOf = [ensureAccount('TFSA', P[0].name, 'TFSA'), ensureAccount('TFSA', P[1].name, 'TFSA')];
    var rrspOf = [ensureAccount('RRSP', P[0].name, 'RRSP'), ensureAccount('RRSP', P[1].name, 'RRSP')];
    var nonRegistered = ensureAccount('TAXABLE', P[0].name, 'Non-registered');
    function hbpAccountFor(k) {
      return accts.filter(function (x) { return x.type === 'RRSP' && x.owner === P[k].name && x.hbpAccount; })[0] || rrspOf[k];
    }

    var props = cfg.realEstate.map(function (r) {
      return { def: r, sched: buildSchedule(r, startYear, endYear), value: r.value, sold: false, ucc: r.uccPool, ccaClaimed: 0 };
    });
    var rental = props.filter(function (p) { return p.def.type === 'rental'; })[0] || null;

    var rrspRoom = [num(P[0].rrspRoomOpening), num(P[1].rrspRoomOpening)];
    var tfsaRoom = [num(P[0].tfsaRoomOpening), num(P[1].tfsaRoomOpening)];
    var priorEarned = [num(P[0].salary), num(P[1].salary)];
    var priorPA = [0, 0];
    var priorTfsaWithdrawals = [0, 0];
    var pendingRefund = 0;
    var hbpLeft = [int(P[0].hbpYears), int(P[1].hbpYears)];

    var years = [], depletedYear = null, firstClawbackYear = null;
    var contributionPlan = opts.contributionPlan || null;
    var planOut = {};

    for (var y = startYear; y <= endYear; y++) {
      var t = y - startYear;
      var taxIdx = Math.pow(1 + infl, y - TAX_BASE_YEAR);
      var inflIdx = Math.pow(1 + infl, t);
      var age = [y - birth[0], y - birth[1]];
      var retired = [y >= retireYear[0], y >= retireYear[1]];
      var anyRetired = retired[0] || retired[1];

      var rateAdj = 0, shock = 0;
      if (mode === 'conservative') rateAdj = -num(A.conservativeDelta) / 100;
      else if (mode === 'bad-decade') {
        var into = y - firstRetireYear;
        rateAdj = (into >= 0 && into < 10) ? -num(A.badDecadeDelta) / 100 : 0;
      } else if (mode === 'monte-carlo' && rand) shock = gaussian(rand) * vol;

      /* ---- property values, debt, sales ---- */
      var totalDebt = 0, principalEquity = 0, rentalEquity = 0, otherDebt = 0;
      var debtRows = [], saleEvents = [];
      var saleTaxable = [0, 0], saleRecapture = [0, 0], saleProceedsCash = 0, saleCapitalLoss = 0;

      props.forEach(function (p) {
        var s = p.sched.byYear[y] || { interest: 0, principal: 0, payment: 0, endBalance: 0 };
        if (p.def.type !== 'heloc') p.value = p.def.value * Math.pow(1 + num(p.def.appreciation) / 100, t);

        if (!p.sold && p.def.saleYear && y === p.def.saleYear && p.def.type !== 'heloc') {
          var grossPrice = p.value;
          var costs = grossPrice * num(p.def.sellingCostPct) / 100;
          var netProceeds = grossPrice - costs;
          var mortgageOff = s.endBalance;
          var cash = netProceeds - mortgageOff;
          var gain = netProceeds - num(p.def.acb);
          var recapture = p.ccaClaimed;
          if (p.def.type === 'rental') {
            var sp = num(A.rentalOwnerSplit) / 100;
            if (gain > 0) {
              saleTaxable[0] += gain * CAPITAL_GAINS_INCLUSION * sp;
              saleTaxable[1] += gain * CAPITAL_GAINS_INCLUSION * (1 - sp);
            } else {
              saleCapitalLoss += -gain;   /* offsets capital gains only — not applied to income */
            }
            saleRecapture[0] += recapture * sp;
            saleRecapture[1] += recapture * (1 - sp);
          }
          saleProceedsCash += Math.max(0, cash);
          saleEvents.push({
            name: p.def.name, grossPrice: grossPrice, sellingCosts: costs, mortgageDischarged: mortgageOff,
            netCash: cash, capitalGain: gain,
            ccaRecapture: p.def.type === 'rental' ? recapture : 0,
            taxableGain: gain > 0 ? gain * CAPITAL_GAINS_INCLUSION : 0,
            capitalLoss: gain < 0 ? -gain : 0,
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
          if (p.def.reinvestOnPayoff && s2 && s2.endBalance <= 0.01 && s2.payment <= 0.01) redirected += p.sched.annualPayment;
        });
      }

      /* ---- rental operations ---- */
      var rentGross = 0, rentOpex = 0, rentInterest = 0, rentPayment = 0, rentCash = 0;
      var rentIncomeBeforeCCA = 0, ccaClaim = 0, rentTaxable = 0;
      if (rental && !rental.sold) {
        var rInflIdx = Math.pow(1 + num(A.rentalIncomeInflation) / 100, t);
        var rs = rental.sched.byYear[y];
        rentGross = rental.def.grossRentMonthly * 12 * rInflIdx * (1 - num(A.vacancyRate) / 100);
        rentOpex = (rental.def.annualPropertyTax + rental.def.annualInsurance + rental.def.annualMaintenance) * inflIdx;
        rentInterest = rs.interest;
        rentPayment = rs.payment;
        props.forEach(function (p) {
          if (p.def.type === 'heloc' && p.def.attachToRental && !p.sold) {
            var hs = p.sched.byYear[y];
            rentPayment += hs.payment;
            if (p.def.interestDeductible) rentInterest += hs.interest;
          }
        });
        /* Interest on debt the app has no schedule for — set from your T776
           line 8710 when the modelled schedules come up short. */
        rentInterest += num(rental.def.otherAnnualInterest);
        rentPayment += num(rental.def.otherAnnualInterest);
        rentCash = rentGross - rentOpex - rentPayment;
        rentIncomeBeforeCCA = rentGross - rentOpex - rentInterest;
        if (rental.def.ccaEnabled && rental.ucc > 0 && rentIncomeBeforeCCA > 0) {
          ccaClaim = Math.min(rental.ucc * CCA_RATE, rentIncomeBeforeCCA);
          rental.ucc -= ccaClaim;
          rental.ccaClaimed += ccaClaim;
        }
        rentTaxable = rentIncomeBeforeCCA - ccaClaim;
      }

      var householdDebtPayments = 0;
      props.forEach(function (p) {
        if (p.sold || p.def.type === 'rental') return;
        if (p.def.type === 'heloc' && p.def.attachToRental) return;
        householdDebtPayments += p.sched.byYear[y].payment;
      });

      /* ---- income ---- */
      var person = [0, 1].map(function (k) {
        var inc = { employment: 0, cpp: 0, oas: 0, pension: 0, pension2: 0, bridge: 0, rrif: 0, rental: 0, dist: 0, sale: 0 };
        if (!retired[k]) inc.employment = P[k].salary * Math.pow(1 + num(P[k].salaryGrowth) / 100, t);
        if (age[k] >= P[k].cppStartAge) inc.cpp = cppAdjust(P[k].cppBaseAt65, P[k].cppStartAge) * 12 * inflIdx;
        if (age[k] >= P[k].oasStartAge) inc.oas = oasAdjust(P[k].oasBaseAt65, P[k].oasStartAge, age[k]) * 12 * inflIdx;
        return inc;
      });

      [0, 1].forEach(function (k) {
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

      var splitPct = num(A.rentalOwnerSplit, 50) / 100;
      person[0].rental = rentTaxable * splitPct;
      person[1].rental = rentTaxable * (1 - splitPct);
      person[0].sale = saleTaxable[0] + saleRecapture[0];
      person[1].sale = saleTaxable[1] + saleRecapture[1];

      accts.forEach(function (ac) {
        if (ac.type !== 'TAXABLE' || ac.bal <= 0 || ac.dist <= 0) return;
        var dv = ac.bal * ac.dist;
        person[ownerIndex(ac.owner)].dist += dv;
        ac.basis += dv;
      });

      /* ---- room accrues on prior-year earned income, less the DPSP PA ---- */
      [0, 1].forEach(function (k) {
        var accrual = Math.min(RRSP_EARNED_PCT * priorEarned[k], RRSP_DOLLAR_LIMIT * taxIdx) - priorPA[k];
        rrspRoom[k] = Math.max(0, rrspRoom[k] + Math.max(0, accrual));
        tfsaRoom[k] += TFSA_ANNUAL_ROOM * taxIdx + priorTfsaWithdrawals[k];
        priorTfsaWithdrawals[k] = 0;
      });

      /* ---- childcare deduction, claimed by the lower-income spouse ---- */
      var ccSpend = childcareSpend(A.childcare, y);
      var ccCap = childcareCap(A.childcare, y);
      var claimant = person[0].employment <= person[1].employment ? 0 : 1;
      var childcareClaim = Math.max(0, Math.min(ccSpend, ccCap, CHILDCARE_EARNED_FRACTION * person[claimant].employment));
      var childcareDeduction = [0, 0];
      childcareDeduction[claimant] = childcareClaim;

      /* ---- contributions ---- */
      var contribs = {}, deductible = [0, 0], employerTotal = [0, 0], hbpPaid = [0, 0];
      var rrspTarget = [0, 0], rrspPace = [0, 0];
      function addContrib(ac, amt, isDeductible) {
        if (amt <= 0) return;
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
      } else {
        var flexBudget = pendingRefund;
        accts.forEach(function (ac) {
          var k = ownerIndex(ac.owner);
          var working = ac.owner === 'Joint' ? !(retired[0] && retired[1]) : !retired[k];
          if (!working) return;
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
          if (!ac.employerMatchPct || retired[k]) return;
          var match = person[k].employment * ac.employerMatchPct;
          contribs[ac.id] = (contribs[ac.id] || 0) + match;
          employerTotal[k] += match;
        });

        /* HBP repayments: mandatory, not deductible, consume no room */
        [0, 1].forEach(function (k) {
          if (hbpLeft[k] <= 0 || num(P[k].hbpAnnual) <= 0) return;
          var acc = hbpAccountFor(k);
          contribs[acc.id] = (contribs[acc.id] || 0) + num(P[k].hbpAnnual);
          hbpPaid[k] = num(P[k].hbpAnnual);
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
            person[k].bridge + person[k].rental + person[k].dist + person[k].sale -
            childcareDeduction[k] - deductible[k];
        });

        /* ---- solve-to-target RRSPs ----
           Contribute whatever brings this person down to the marginal-rate
           floor. The amount is an output, not an input: the dashboard shows it
           as this year's target so you can true up by the March deadline. */
        accts.forEach(function (ac) {
          if (!ac.solveToTarget || !A.optimizeContributions) return;
          var k = ownerIndex(ac.owner);
          if (retired[k]) return;
          var g = 0;
          while (rrspRoom[k] >= slice && g++ < 600) {
            var m = (personTax(runningTaxable[k], age[k], 0, person[k].oas, taxIdx).total
                   - personTax(runningTaxable[k] - slice, age[k], 0, person[k].oas, taxIdx).total) / slice;
            if (m < rrspFloor) break;
            addContrib(ac, slice, true);
            runningTaxable[k] -= slice;
            rrspTarget[k] += slice;
          }
        });

        /* ---- the optimizer ---- */
        if (flexBudget > 0) {
          var guard = 0;
          while (flexBudget > 1 && guard++ < 600) {
            var step = Math.min(slice, flexBudget);
            var best = null;
            for (var k2 = 0; k2 < 2; k2++) {
              /* RRSP earns its keep only while the marginal rate is high enough;
                 below the floor a TFSA dollar is worth more over a lifetime. */
              if (rrspRoom[k2] >= step) {
                var mr = (personTax(runningTaxable[k2], age[k2], 0, person[k2].oas, taxIdx).total - personTax(runningTaxable[k2] - step, age[k2], 0, person[k2].oas, taxIdx).total) / step;
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
          target: rrspTarget.slice(), pace: rrspPace.slice()
        };
      }

      var totalContribs = Object.keys(contribs).reduce(function (s, id) { return s + contribs[id]; }, 0);
      var householdContribCash = totalContribs - employerTotal[0] - employerTotal[1];

      /* ---- RRIF conversion + forced minimums ---- */
      var rrifForced = 0;
      accts.forEach(function (ac) {
        if (ac.type !== 'RRSP') return;
        var k = ownerIndex(ac.owner);
        if (age[k] >= 71) ac.isRRIF = true;
        if (!ac.isRRIF || ac.bal <= 0) return;
        var minWd = Math.min(ac.bal, ac.bal * rrifFactor(age[k]));
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
      if (anyRetired || A.applySpendingBeforeRetirement) {
        spendTarget = A.desiredMonthlyIncome * 12 * inflIdx * phaseFactor;
        if (!A.spendingIncludesDebtPayments) spendTarget += householdDebtPayments;
      }

      /* ---- tax helpers ---- */
      function taxableOf(k, extra) {
        var p = person[k];
        return p.employment + p.cpp + p.oas + p.pension + p.bridge + p.rrif + p.rental + p.dist + p.sale
          - childcareDeduction[k] - deductible[k] + (extra || 0);
      }
      function cashOf(k) {
        var p = person[k];
        return p.employment + p.cpp + p.oas + p.pension + p.bridge + p.rrif;
      }
      function evalTax(e0, e1) {
        function eligible(k, extra) {
          var e = person[k].pension + person[k].bridge;
          if (age[k] >= 65) e += person[k].rrif + Math.max(0, extra);
          return e;
        }
        return householdTax(
          { taxable: taxableOf(0, e0), age: age[0], oas: person[0].oas, eligiblePension: eligible(0, e0) },
          { taxable: taxableOf(1, e1), age: age[1], oas: person[1].oas, eligiblePension: eligible(1, e1) },
          taxIdx, A.optimizePensionSplit
        );
      }
      function householdCashBase() {
        return cashOf(0) + cashOf(1) + rentCash + saleProceedsCash - householdContribCash;
      }

      /* ---- withdrawals ---- */
      var draws = {}, drawTaxable = [0, 0];
      function takeFrom(ac, amt) {
        amt = Math.min(amt, ac.bal);
        if (amt <= 0) return 0;
        var k = ownerIndex(ac.owner);
        var taxablePortion = 0;
        if (ac.type === 'RRSP') taxablePortion = amt;
        else if (ac.type === 'TAXABLE') {
          var gainFrac = ac.bal > 0 ? Math.max(0, (ac.bal - ac.basis) / ac.bal) : 0;
          taxablePortion = amt * gainFrac * CAPITAL_GAINS_INCLUSION;
          ac.basis -= amt * (1 - gainFrac);
        } else if (ac.type === 'TFSA') priorTfsaWithdrawals[k] += amt;
        ac.bal -= amt;
        draws[ac.id] = (draws[ac.id] || 0) + amt;
        drawTaxable[k] += taxablePortion;
        return amt;
      }

      if (anyRetired && (strategy === 'min-tax' || strategy === 'oas-smart')) {
        var ceiling = strategy === 'min-tax' ? FED.brackets[0][0] * taxIdx : OAS_CLAWBACK_THRESHOLD * taxIdx;
        [0, 1].forEach(function (k) {
          if (!retired[k]) return;
          var room = ceiling - taxableOf(k, drawTaxable[k]);
          if (room <= 0) return;
          accts.filter(function (x) { return x.type === 'RRSP' && x.owner === P[k].name && x.bal > 0; })
            .forEach(function (ac) { if (room > 0) room -= takeFrom(ac, Math.min(room, ac.bal)); });
        });
      }

      var preDrawCash = Object.keys(draws).reduce(function (s, id) { return s + draws[id]; }, 0);
      function netCashWith(e0, e1, grossExtra) {
        return householdCashBase() + preDrawCash + grossExtra - evalTax(drawTaxable[0] + e0, drawTaxable[1] + e1).total;
      }
      function tryAllocate(gross) {
        var remaining = gross, tax0 = 0, tax1 = 0, plan = [];
        for (var oi = 0; oi < order.length && remaining > 0.01; oi++) {
          var pool = accts.filter(function (x) { return x.type === order[oi] && x.bal > 0; });
          for (var pi = 0; pi < pool.length && remaining > 0.01; pi++) {
            var ac = pool[pi], amt = Math.min(ac.bal, remaining), k = ownerIndex(ac.owner), tp = 0;
            if (ac.type === 'RRSP') tp = amt;
            else if (ac.type === 'TAXABLE') {
              var gf = ac.bal > 0 ? Math.max(0, (ac.bal - ac.basis) / ac.bal) : 0;
              tp = amt * gf * CAPITAL_GAINS_INCLUSION;
            }
            if (k === 0) tax0 += tp; else tax1 += tp;
            plan.push({ ac: ac, amt: amt });
            remaining -= amt;
          }
        }
        return { plan: plan, gross: gross - remaining, tax0: tax0, tax1: tax1 };
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
          if (netCashWith(trial.tax0, trial.tax1, trial.gross) < spendTarget) lo = mid; else hi = mid;
        }
        var fin = tryAllocate(hi);
        if (netCashWith(fin.tax0, fin.tax1, fin.gross) < spendTarget - 1) {
          fin = tryAllocate(availableTotal);
          unfunded = spendTarget - netCashWith(fin.tax0, fin.tax1, fin.gross);
        }
        fin.plan.forEach(function (step2) { takeFrom(step2.ac, step2.amt); });
      }

      var taxResult = evalTax(drawTaxable[0], drawTaxable[1]);
      var totalDrawn = Object.keys(draws).reduce(function (s, id) { return s + draws[id]; }, 0);
      var netCash = householdCashBase() + totalDrawn - taxResult.total;

      /* ---- RRSP refund, credited to next year's contribution budget ---- */
      var refund = 0;
      if (A.reinvestRefund && (deductible[0] + deductible[1]) > 0) {
        var withoutDeduction = householdTax(
          { taxable: taxableOf(0, drawTaxable[0]) + deductible[0], age: age[0], oas: person[0].oas, eligiblePension: person[0].pension + person[0].bridge },
          { taxable: taxableOf(1, drawTaxable[1]) + deductible[1], age: age[1], oas: person[1].oas, eligiblePension: person[1].pension + person[1].bridge },
          taxIdx, A.optimizePensionSplit
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
        for (var sk = 0; sk < 2; sk++) {
          if (surplus <= 0) break;
          var put = Math.min(surplus, tfsaRoom[sk]);
          tfsaOf[sk].bal += put; tfsaOf[sk].basis += put; tfsaRoom[sk] -= put; surplus -= put;
        }
        if (surplus > 0) { nonRegistered.bal += surplus; nonRegistered.basis += surplus; }
      }

      /* ---- contributions land, then growth ---- */
      var acctRows = [];
      accts.forEach(function (ac) {
        var startBal = ac.bal + (draws[ac.id] || 0) + (ac.forcedThisYear || 0);
        var contrib = contribs[ac.id] || 0;
        ac.bal += contrib; ac.basis += contrib;
        var growth = ac.bal * (ac.rate + rateAdj + shock);
        ac.bal = Math.max(0, ac.bal + growth);
        if (startBal > 1 || ac.bal > 1 || contrib > 1) {
          acctRows.push({
            name: ac.name, owner: ac.owner, type: ac.isRRIF ? 'RRIF' : ac.type,
            start: startBal, forced: ac.forcedThisYear || 0, draw: draws[ac.id] || 0,
            contrib: contrib, growth: growth, end: ac.bal
          });
        }
        ac.forcedThisYear = 0;
      });

      priorEarned = [person[0].employment + Math.max(0, person[0].rental), person[1].employment + Math.max(0, person[1].rental)];
      priorPA = employerTotal.slice();
      for (var hk = 0; hk < 2; hk++) if (hbpPaid[hk] > 0) hbpLeft[hk]--;

      var portfolio = accts.reduce(function (s, ac) { return s + Math.max(0, ac.bal); }, 0);
      var netWorth = portfolio + principalEquity + rentalEquity - otherDebt;

      if (unfunded > 1 && depletedYear === null && anyRetired) depletedYear = y;
      if (taxResult.totalClawback > 1 && firstClawbackYear === null) firstClawbackYear = y;

      var claimantName = childcareClaim > 0 ? P[claimant].name : '';
      years.push({
        year: y, ages: age.slice(), retired: retired.slice(), deflator: 1 / inflIdx,
        employment: person[0].employment + person[1].employment,
        cpp: person[0].cpp + person[1].cpp,
        oas: person[0].oas + person[1].oas,
        pension: person[0].pension + person[1].pension + person[0].bridge + person[1].bridge,
        pension2: person[0].pension2 + person[1].pension2,
        bridge: person[0].bridge + person[1].bridge,
        rentGross: rentGross, rentOpex: rentOpex, rentInterest: rentInterest,
        rentPayment: rentPayment, rentCash: rentCash, rentTaxable: rentTaxable,
        ccaClaim: ccaClaim, uccRemaining: rental ? rental.ucc : 0, ccaClaimedToDate: rental ? rental.ccaClaimed : 0,
        rrifForced: rrifForced, discretionaryDraw: totalDrawn, totalWithdrawn: totalDrawn + rrifForced,
        contributions: totalContribs, contributionsFromCash: householdContribCash,
        employerContributions: employerTotal[0] + employerTotal[1],
        hbpRepayments: hbpPaid[0] + hbpPaid[1],
        deductibleContributions: deductible[0] + deductible[1],
        refund: refund, redirected: redirected,
        rrspTarget: rrspTarget.slice(), rrspPace: rrspPace.slice(),
        childcareClaim: childcareClaim, childcareSpend: ccSpend, childcareCap: ccCap, childcareClaimant: claimantName,
        rrspRoom: rrspRoom.slice(), tfsaRoom: tfsaRoom.slice(),
        incomeTax: taxResult.totalTax, oasClawback: taxResult.totalClawback,
        totalTax: taxResult.total, pensionSplit: taxResult.split,
        taxableIncome: [taxableOf(0, drawTaxable[0]), taxableOf(1, drawTaxable[1])],
        marginalRates: [
          marginalRate(taxableOf(0, drawTaxable[0]), age[0], 0, person[0].oas, taxIdx),
          marginalRate(taxableOf(1, drawTaxable[1]), age[1], 0, person[1].oas, taxIdx)
        ],
        spendTarget: spendTarget, netCash: netCash, unfunded: unfunded, surplus: surplus,
        portfolio: portfolio, principalEquity: principalEquity, rentalEquity: rentalEquity,
        debt: totalDebt, otherDebt: otherDebt, netWorth: netWorth,
        householdDebtPayments: householdDebtPayments,
        saleEvents: saleEvents, saleProceeds: saleProceedsCash, saleCapitalLoss: saleCapitalLoss,
        accounts: acctRows, debts: debtRows,
        person: [0, 1].map(function (k) {
          var pt = k === 0 ? taxResult.p1 : taxResult.p2;
          return {
            name: P[k].name, employment: person[k].employment, cpp: person[k].cpp, oas: person[k].oas,
            pension: person[k].pension, pension2: person[k].pension2, bridge: person[k].bridge, rrif: person[k].rrif,
            rental: person[k].rental, sale: person[k].sale,
            childcare: childcareDeduction[k], deductible: deductible[k],
            rrspTarget: rrspTarget[k], rrspPace: rrspPace[k],
            tax: pt.income, clawback: pt.clawback, rrspRoom: rrspRoom[k], tfsaRoom: tfsaRoom[k]
          };
        })
      });
    }

    return {
      years: years, depletedYear: depletedYear, firstClawbackYear: firstClawbackYear,
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
      var res = simulate(base, Object.assign({ fastSolve: true }, opts || {}));
      if (res.depletedYear === null) { best = mid; lo = mid; } else { hi = mid; }
    }
    return best;
  }

  /* ---------------------------------------------------------- monte carlo  */
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
        results.push({ depletedYear: res.depletedYear, finalNetWorth: res.finalNetWorth, lifetimeTax: res.lifetimeTax });
        res.years.forEach(function (r) { (byYear[r.year] = byYear[r.year] || []).push(r.portfolio); });
      }
      if (onProgress) onProgress(run / runs);
      if (run < runs) setTimeout(chunk, 0);
      else {
        var successes = results.filter(function (r) { return r.depletedYear === null; }).length;
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
      if (r.depletedYear === null) ok++;
    }
    return ok / runs;
  }

  /* ------------------------------------------------------------- timeline  */
  function buildTimeline(cfg, sim) {
    var P = cfg.incomes, ev = [];
    function add(year, label) { if (year) ev.push({ year: year, label: label }); }
    [0, 1].forEach(function (k) {
      add(P[k].birthYear + P[k].targetRetireAge, P[k].name + ' retires (age ' + P[k].targetRetireAge + ')');
      add(P[k].birthYear + P[k].cppStartAge, P[k].name + ' starts CPP (age ' + P[k].cppStartAge + ')');
      add(P[k].birthYear + P[k].oasStartAge, P[k].name + ' starts OAS (age ' + P[k].oasStartAge + ')');
      add(P[k].birthYear + 71, P[k].name + ' RRSP converts to RRIF (age 71)');
      add(P[k].birthYear + 75, P[k].name + ' OAS increases 10% (age 75)');
      if (P[k].hooppStartAge) {
        add(P[k].birthYear + P[k].hooppStartAge, P[k].name + ' starts HOOPP (age ' + P[k].hooppStartAge + ')');
        add(P[k].birthYear + 65, P[k].name + ' HOOPP bridge benefit ends (age 65)');
      }
      if (P[k].hbpYears > 0) add(sim.startYear + P[k].hbpYears, P[k].name + ' finishes HBP repayments');
      if (P[k].pension2Amount > 0) add(P[k].birthYear + P[k].pension2StartAge, P[k].name + ' starts ' + P[k].pension2Name);
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
    monteCarloRun: monteCarloRun, monteCarloSync: monteCarloSync,
    buildTimeline: buildTimeline, normalizeConfig: normalizeConfig, defaultConfig: defaultConfig,
    personTax: personTax, marginalRate: marginalRate, householdTax: householdTax,
    buildSchedule: buildSchedule, rrifFactor: rrifFactor,
    childcareSpend: childcareSpend, childcareCap: childcareCap,
    WITHDRAWAL_ORDERS: WITHDRAWAL_ORDERS, TAX_BASE_YEAR: TAX_BASE_YEAR,
    FED: FED, ONT: ONT, OAS_CLAWBACK_THRESHOLD: OAS_CLAWBACK_THRESHOLD,
    RRSP_DOLLAR_LIMIT: RRSP_DOLLAR_LIMIT, TFSA_ANNUAL_ROOM: TFSA_ANNUAL_ROOM
  };
});
