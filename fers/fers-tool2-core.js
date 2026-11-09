/*
 * FERS Tool 2 — core calculation logic (no DOM dependencies).
 * Spec: ~/workspace/three-tracks-phase0/fers-tool2-spec.md (確定版, Day 1)
 * - Sick leave conversion: OPM CSRS & FERS Handbook Ch.50 Chart 2 (2,087-hour chart),
 *   intermediate values rounded UP to the next chart value, leftover days dropped
 *   AFTER combining with actual service. (Spec fix #1 — no ÷174 approximation.)
 * - Supplement numerator: nearest whole year, cap 40, civilian service only. (Fix #2)
 * - MRA+10 reduction: full months from annuity start to 62nd birthday x 5/12%. (Fix #3)
 * - Estimate only; not OPM's official computation. (Fix #4 disclaimers live in the page.)
 *
 * BAL 18-103 assumption (UNVERIFIED against the original letter): unused sick leave
 * counts toward the 20 years required for the 1.1% factor at age 62+. Quasi-primary
 * sources agree; the tool flags on screen when this assumption is what qualifies.
 */
(function (global) {
  'use strict';

  // ---- OPM Chart 2: hours for [days 0..29] x [months 0..11] -------------------
  // Transcribed from CSRS & FERS Handbook Ch.50, Chart 2 (Sick Leave Chart, 2087 Hours).
  var CHART2 = [
    [0, 174, 348, 522, 696, 870, 1044, 1217, 1391, 1565, 1739, 1913],
    [6, 180, 354, 528, 701, 875, 1049, 1223, 1397, 1571, 1745, 1919],
    [12, 186, 359, 533, 707, 881, 1055, 1229, 1403, 1577, 1751, 1925],
    [17, 191, 365, 539, 713, 887, 1061, 1235, 1409, 1583, 1757, 1930],
    [23, 197, 371, 545, 719, 893, 1067, 1241, 1415, 1588, 1762, 1936],
    [29, 203, 377, 551, 725, 899, 1072, 1246, 1420, 1594, 1768, 1942],
    [35, 209, 383, 557, 730, 904, 1078, 1252, 1426, 1600, 1774, 1948],
    [41, 214, 388, 562, 736, 910, 1084, 1258, 1432, 1606, 1780, 1954],
    [46, 220, 394, 568, 742, 916, 1090, 1264, 1438, 1612, 1786, 1959],
    [52, 226, 400, 574, 748, 922, 1096, 1270, 1444, 1617, 1791, 1965],
    [58, 232, 406, 580, 754, 928, 1101, 1275, 1449, 1623, 1797, 1971],
    [64, 238, 412, 586, 759, 933, 1107, 1281, 1455, 1629, 1803, 1977],
    [70, 243, 417, 591, 765, 939, 1113, 1287, 1461, 1635, 1809, 1983],
    [75, 249, 423, 597, 771, 945, 1119, 1293, 1467, 1641, 1815, 1988],
    [81, 255, 429, 603, 777, 951, 1125, 1299, 1472, 1646, 1820, 1994],
    [87, 261, 435, 609, 783, 957, 1130, 1304, 1478, 1652, 1826, 2000],
    [93, 267, 441, 615, 788, 962, 1136, 1310, 1484, 1658, 1832, 2006],
    [99, 272, 446, 620, 794, 968, 1142, 1316, 1490, 1664, 1838, 2012],
    [104, 278, 452, 626, 800, 974, 1148, 1322, 1496, 1670, 1844, 2017],
    [110, 284, 458, 632, 806, 980, 1154, 1328, 1501, 1675, 1849, 2023],
    [116, 290, 464, 638, 812, 986, 1159, 1333, 1507, 1681, 1855, 2029],
    [122, 296, 470, 643, 817, 991, 1165, 1339, 1513, 1687, 1861, 2035],
    [128, 301, 475, 649, 823, 997, 1171, 1345, 1519, 1693, 1867, 2041],
    [133, 307, 481, 655, 829, 1003, 1177, 1351, 1525, 1699, 1873, 2046],
    [139, 313, 487, 661, 835, 1009, 1183, 1357, 1530, 1704, 1878, 2052],
    [146, 319, 493, 667, 841, 1015, 1188, 1362, 1536, 1710, 1884, 2058],
    [151, 325, 499, 672, 846, 1020, 1194, 1368, 1542, 1716, 1890, 2064],
    [157, 330, 504, 678, 852, 1026, 1200, 1374, 1548, 1722, 1896, 2070],
    [162, 336, 510, 684, 858, 1032, 1206, 1380, 1554, 1728, 1901, 2075],
    [168, 342, 516, 690, 864, 1038, 1212, 1386, 1559, 1733, 1907, 2081]
  ];
  var CHART_MAX = 2081; // 11 months 29 days — the largest cell below 2,087.

  // Convert unused sick-leave hours to {years, months, days} using Chart 2.
  // Values between chart entries round UP to the next entry (spec fix #1).
  function sickLeaveToService(hours) {
    hours = Math.max(0, Math.floor(Number(hours) || 0));
    var years = Math.floor(hours / 2087);
    var rem = hours - years * 2087;
    if (rem > CHART_MAX) { // 2,082–2,086 hrs: next chart point is 2,087 = 1 full year
      return { years: years + 1, months: 0, days: 0 };
    }
    var best = null;
    for (var d = 0; d < 30; d++) {
      for (var m = 0; m < 12; m++) {
        var v = CHART2[d][m];
        if (v >= rem && (best === null || v < best.value)) {
          best = { value: v, months: m, days: d };
        }
      }
    }
    return { years: years, months: best.months, days: best.days };
  }

  // Length of service between two dates, OPM style: end - start + 1 day,
  // borrowing with 30-day months. Dates are {y, m, d}.
  function serviceFromDates(start, end) {
    var y = end.y - start.y;
    var m = end.m - start.m;
    var d = end.d - start.d + 1;
    if (d < 0) { d += 30; m -= 1; }
    if (d >= 30) { d -= 30; m += 1; }
    if (m < 0) { m += 12; y -= 1; }
    if (m >= 12) { m -= 12; y += 1; }
    return { years: y, months: m, days: d };
  }

  // Add actual service + sick-leave service, then apply OPM combination rules:
  // 30+ combined days roll into a month; leftover days are dropped for the annuity.
  function combineService(actual, sick) {
    var days = actual.days + sick.days;
    var months = actual.months + sick.months + Math.floor(days / 30);
    var leftoverDays = days % 30;
    var years = actual.years + sick.years + Math.floor(months / 12);
    months = months % 12;
    return {
      years: years, months: months, leftoverDays: leftoverDays,
      totalMonths: years * 12 + months,
      decimalYears: years + months / 12
    };
  }

  // Full calendar months from `from` to `to` (partial month at the end not counted).
  function fullMonthsBetween(from, to) {
    var months = (to.y - from.y) * 12 + (to.m - from.m);
    if (to.d < from.d) months -= 1;
    return Math.max(0, months);
  }

  function ageAt(dob, onDate) {
    var age = onDate.y - dob.y;
    if (onDate.m < dob.m || (onDate.m === dob.m && onDate.d < dob.d)) age -= 1;
    return age;
  }

  // Spec fix #2: Supplement numerator years — nearest whole year, cap 40.
  // Input must be CIVILIAN service only (no sick leave, no military buyback).
  function supplementYears(civilianDecimalYears) {
    return Math.min(40, Math.round(Number(civilianDecimalYears) || 0));
  }

  /*
   * Main annuity computation.
   * input = {
   *   high3: number,
   *   actualService: {years, months, days},   // actual creditable service (no sick leave)
   *   sickLeaveHours: number,
   *   retirementType: 'immediate' | 'mra10' | 'special',
   *   dob: {y,m,d}, annuityStart: {y,m,d},    // required for mra10; age uses annuityStart
   *   survivorElection: 'none' | '50' | '25'
   * }
   */
  function computeAnnuity(input) {
    var steps = [];
    var sick = sickLeaveToService(input.sickLeaveHours);
    steps.push('Sick leave ' + (input.sickLeaveHours || 0) + ' hrs -> ' +
      sick.years + 'y ' + sick.months + 'm ' + sick.days + 'd (OPM Chart 2, rounded up).');

    var combined = combineService(input.actualService, sick);
    steps.push('Creditable service for annuity: ' + combined.years + 'y ' + combined.months +
      'm (' + combined.leftoverDays + ' leftover day(s) dropped).');

    var age = (input.dob && input.annuityStart) ? ageAt(input.dob, input.annuityStart) : null;
    var annuity;

    if (input.retirementType === 'special') {
      // Special category: 1.7% for the first 20 years of actual special service,
      // 1.0% beyond; sick-leave credit itself is always at 1.0%.
      var actualDec = input.actualService.years + input.actualService.months / 12;
      var first20 = Math.min(actualDec, 20);
      var beyond = Math.max(actualDec - 20, 0);
      var sickDec = sick.years + sick.months / 12;
      var pct = 0.017 * first20 + 0.01 * beyond + 0.01 * sickDec;
      annuity = input.high3 * pct;
      steps.push('Special category: 1.7% x ' + first20.toFixed(4) + 'y + 1.0% x ' +
        beyond.toFixed(4) + 'y (actual) + 1.0% x ' + sickDec.toFixed(4) + 'y (sick leave).');
    } else {
      var use11 = age !== null && age >= 62 && combined.totalMonths >= 240;
      var factor = use11 ? 0.011 : 0.01;
      annuity = input.high3 * factor * combined.decimalYears;
      steps.push('Factor ' + (factor * 100).toFixed(1) + '%' +
        (use11 ? ' (age 62+ with 20+ years incl. sick leave).' : '.'));
      var result11 = {
        factorUsed: factor,
        // True when actual service alone is under 20y and sick leave makes up the difference.
        sickLeaveMade20: use11 &&
          (input.actualService.years * 12 + input.actualService.months) < 240
      };
      if (result11.sickLeaveMade20) {
        steps.push('Note: the 1.1% factor applies because sick leave brings total service ' +
          'to 20 years (BAL 18-103 position; original letter not yet verified).');
      }
      var out = finish(input, annuity, combined, steps);
      out.factorUsed = factor;
      out.sickLeaveMade20 = result11.sickLeaveMade20;
      return out;
    }

    return finish(input, annuity, combined, steps);
  }

  function finish(input, annuity, combined, steps) {
    var unreduced = annuity;
    var mra = null;
    if (input.retirementType === 'mra10') {
      var b62 = { y: input.dob.y + 62, m: input.dob.m, d: input.dob.d };
      var months = fullMonthsBetween(input.annuityStart, b62);
      var reductionPct = months * (5 / 12); // percent
      annuity = annuity * (1 - reductionPct / 100);
      mra = { fullMonths: months, reductionPct: reductionPct };
      steps.push('MRA+10 reduction: ' + months + ' full months x 5/12% = ' +
        reductionPct.toFixed(2) + '% -> $' + annuity.toFixed(2) + '/yr.');
    }
    var survRate = input.survivorElection === '50' ? 0.10 :
                   input.survivorElection === '25' ? 0.05 : 0;
    var survBenefitRate = input.survivorElection === '50' ? 0.50 :
                          input.survivorElection === '25' ? 0.25 : 0;
    var retiree = annuity * (1 - survRate);
    var survivor = annuity * survBenefitRate;
    if (survRate > 0) {
      steps.push('Survivor election ' + input.survivorElection + '%: retiree annuity -' +
        (survRate * 100).toFixed(0) + '% -> $' + retiree.toFixed(2) + '/yr; survivor benefit $' +
        survivor.toFixed(2) + '/yr.');
    }
    return {
      creditable: combined,
      annuityBeforeReductions: unreduced,
      mra10: mra,
      annuityAfterReductions: annuity,
      retireeAnnual: retiree,
      retireeMonthly: retiree / 12,
      survivorAnnual: survivor,
      steps: steps
    };
  }

  var api = {
    CHART2: CHART2,
    sickLeaveToService: sickLeaveToService,
    serviceFromDates: serviceFromDates,
    combineService: combineService,
    fullMonthsBetween: fullMonthsBetween,
    ageAt: ageAt,
    supplementYears: supplementYears,
    computeAnnuity: computeAnnuity
  };
  global.FersTool2 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
