/**
 * Pure JavaScript Hebrew (Jewish) calendar conversion
 * Rata Die (RD) based – RD 1 = 1 January 1 CE Gregorian
 * Algorithms derived from Dershowitz & Reingold / common open implementations.
 */
(function (global) {
  "use strict";

  const MONTH_NAMES = [
    "", "Nisan", "Iyar", "Sivan", "Tammuz", "Av", "Elul",
    "Tishrei", "Cheshvan", "Kislev", "Tevet", "Shevat", "Adar", "Adar II"
  ];

  // Hebrew epoch: absolute RD of 1 Tishrei year 1
  const HEBREW_EPOCH = -1373427;

  function isLeapYear(year) {
    return ((7 * year + 1) % 19) < 7;
  }

  function lastMonthOfYear(year) {
    return isLeapYear(year) ? 13 : 12;
  }

  /** Absolute RD of 1 Tishrei of the given Hebrew year */
  function hebrewNewYear(year) {
    // Months elapsed before this year
    const months = Math.floor((235 * year - 234) / 19);
    // Parts (from molad)
    const parts = 12084 + 13753 * months;
    let day = 29 * months + Math.floor(parts / 25920);

    // Postpone Rosh Hashana if molad falls on Sun / Wed / Fri
    if ((3 * (day + 1)) % 7 < 3) {
      day += 1;
    }

    // Extra postponements so year length is 353-355 or 383-385
    const nextMonths = Math.floor((235 * (year + 1) - 234) / 19);
    const nextParts = 12084 + 13753 * nextMonths;
    let nextDay = 29 * nextMonths + Math.floor(nextParts / 25920);
    if ((3 * (nextDay + 1)) % 7 < 3) nextDay += 1;

    const prevMonths = Math.floor((235 * (year - 1) - 234) / 19);
    const prevParts = 12084 + 13753 * prevMonths;
    let prevDay = 29 * prevMonths + Math.floor(prevParts / 25920);
    if ((3 * (prevDay + 1)) % 7 < 3) prevDay += 1;

    if (nextDay - day === 356) {
      day += 2;
    } else if (day - prevDay === 382) {
      day += 1;
    }

    return day + HEBREW_EPOCH;
  }

  function daysInHebrewYear(year) {
    return hebrewNewYear(year + 1) - hebrewNewYear(year);
  }

  function longCheshvan(year) {
    const d = daysInHebrewYear(year);
    return d === 355 || d === 385;
  }

  function shortKislev(year) {
    const d = daysInHebrewYear(year);
    return d === 353 || d === 383;
  }

  function hebrewMonthLength(year, month) {
    // month: 1=Nisan … 13=Adar II
    if (month === 2 || month === 4 || month === 6 || month === 10 || month === 13) return 29;
    if (month === 12) return isLeapYear(year) ? 30 : 29; // Adar / Adar I
    if (month === 8) return longCheshvan(year) ? 30 : 29; // Cheshvan
    if (month === 9) return shortKislev(year) ? 29 : 30;  // Kislev
    return 30;
  }

  /** RD of a Hebrew date */
  function hebrewToAbs(year, month, day) {
    let abs = hebrewNewYear(year);
    if (month < 7) {
      // Nisan–Elul: first finish Tishrei→last month of the year
      for (let m = 7; m <= lastMonthOfYear(year); m++) {
        abs += hebrewMonthLength(year, m);
      }
      for (let m = 1; m < month; m++) {
        abs += hebrewMonthLength(year, m);
      }
    } else {
      for (let m = 7; m < month; m++) {
        abs += hebrewMonthLength(year, m);
      }
    }
    return abs + day - 1;
  }

  /** Convert RD → Hebrew date */
  function absToHebrew(abs) {
    // Approximate year
    let year = Math.floor((abs - HEBREW_EPOCH) * 98496 / 35975351) + 1;
    while (hebrewNewYear(year) <= abs) year++;
    year--;

    let absMonthStart = hebrewNewYear(year);
    const last = lastMonthOfYear(year);
    const order = [];
    for (let m = 7; m <= last; m++) order.push(m);
    for (let m = 1; m <= 6; m++) order.push(m);

    let month = 7;
    for (let i = 0; i < order.length; i++) {
      const m = order[i];
      const len = hebrewMonthLength(year, m);
      if (abs < absMonthStart + len) {
        month = m;
        break;
      }
      absMonthStart += len;
    }
    const day = abs - absMonthStart + 1;
    return { year, month, day };
  }

  /** Gregorian → RD (proleptic) */
  function gregorianToFixed(year, month, day) {
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    const jd =
      day +
      Math.floor((153 * m + 2) / 5) +
      365 * y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) -
      32045;
    // Convert Julian Day Number to Rata Die
    return jd - 1721425;
  }

  /** RD → Gregorian */
  function fixedToGregorian(fixed) {
    const jd = fixed + 1721425;
    const a = jd + 32044;
    const b = Math.floor((4 * a + 3) / 146097);
    const c = a - Math.floor((146097 * b) / 4);
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor((1461 * d) / 4);
    const m = Math.floor((5 * e + 2) / 153);
    const day = e - Math.floor((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * Math.floor(m / 10);
    const year = 100 * b + d - 4800 + Math.floor(m / 10);
    return { year, month, day };
  }

  // ---------- Public API ----------
  function gregorianToJewish(gYear, gMonth, gDay) {
    const fixed = gregorianToFixed(gYear, gMonth, gDay);
    const h = absToHebrew(fixed);
    return {
      year: h.year,
      month: h.month,
      day: h.day,
      monthName: MONTH_NAMES[h.month] || "?",
      formatted: `${h.day} ${MONTH_NAMES[h.month]} ${h.year}`,
      formattedShort: `${h.day} ${MONTH_NAMES[h.month]}`,
    };
  }

  function jewishToGregorian(jYear, jMonth, jDay) {
    const abs = hebrewToAbs(jYear, jMonth, jDay);
    const g = fixedToGregorian(abs);
    return {
      year: g.year,
      month: g.month,
      day: g.day,
      date: new Date(g.year, g.month - 1, g.day),
      formatted: formatGregorian(g.year, g.month, g.day),
    };
  }

  function formatGregorian(y, m, d) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${String(d).padStart(2, "0")} ${months[m - 1]}, ${y}`;
  }

  function parseDateInput(val) {
    if (!val) return null;
    const [y, m, d] = val.split("-").map(Number);
    return { year: y, month: m, day: d };
  }

  function toDateInputValue(y, m, d) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  /** Days from today until the next occurrence of a Jewish anniversary */
  function daysUntilAnniversary(jMonth, jDay, fromDate) {
    const today = fromDate || new Date();
    const gToday = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
    const todayAbs = gregorianToFixed(gToday.year, gToday.month, gToday.day);
    const hToday = absToHebrew(todayAbs);

    let targetYear = hToday.year;
    let targetAbs = hebrewToAbs(targetYear, jMonth, jDay);

    // If the date already passed this Hebrew year, move to next year
    if (targetAbs < todayAbs) {
      targetYear += 1;
      // Leap-year adjustments for Adar
      if (jMonth === 13 && !isLeapYear(targetYear)) {
        targetAbs = hebrewToAbs(targetYear, 12, Math.min(jDay, 29));
      } else if (jMonth === 12 && isLeapYear(targetYear)) {
        // Keep Adar I
        targetAbs = hebrewToAbs(targetYear, 12, jDay);
      } else {
        // Also handle short Cheshvan/Kislev day overflow
        const maxDay = hebrewMonthLength(targetYear, jMonth);
        targetAbs = hebrewToAbs(targetYear, jMonth, Math.min(jDay, maxDay));
      }
    } else {
      const maxDay = hebrewMonthLength(targetYear, jMonth);
      if (jDay > maxDay) {
        targetAbs = hebrewToAbs(targetYear, jMonth, maxDay);
      }
    }

    return targetAbs - todayAbs;
  }


  /**
   * Advance a Hebrew date by `count` months.
   * Month order within year Y (Tishrei-based): 7..last, then 1..6.
   * After Elul (6) → Tishrei (7) of year+1.
   * After Adar/Adar II → Nisan (1) of same year.
   */
  function addHebrewMonths(year, month, day, count) {
    let y = year;
    let m = month;
    let d = day;
    const n = count | 0;
    for (let i = 0; i < n; i++) {
      const last = lastMonthOfYear(y);
      if (m === 6) {
        // Elul → next Tishrei (new year)
        y += 1;
        m = 7;
      } else if (m === last) {
        // Adar / Adar II → Nisan same year number in this encoding
        m = 1;
      } else if (m >= 7 && m < last) {
        m += 1;
      } else if (m >= 1 && m < 6) {
        m += 1;
      } else {
        m += 1;
      }
    }
    const maxDay = hebrewMonthLength(y, m);
    if (d > maxDay) d = maxDay;
    return { year: y, month: m, day: d };
  }

  /**
   * First-year monthly memorial dates after a death (Jewish day-of-month).
   * Returns 12 rows: 1 month later … 12 months later (Yahrzeit).
   */
  function monthlyMemorialTable(jYear, jMonth, jDay) {
    const rows = [];
    for (let n = 1; n <= 12; n++) {
      const h = addHebrewMonths(jYear, jMonth, jDay, n);
      const g = jewishToGregorian(h.year, h.month, h.day);
      const gDate = new Date(g.year, g.month - 1, g.day, 12, 0, 0);
      const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const secular =
        weekdays[gDate.getDay()] + ", " + months[gDate.getMonth()] + " " + gDate.getDate() + ", " + gDate.getFullYear();
      let notes;
      if (n === 11) {
        notes = "11-month mark (Daily Kaddish concludes)";
      } else if (n === 12) {
        notes = "1st First-Year Anniversary (Yahrzeit)";
      } else {
        notes = n + "-month milestone";
      }
      rows.push({
        monthsAfter: n,
        hebrewMonth: MONTH_NAMES[h.month] || "?",
        hebrewDay: h.day,
        hebrewYear: h.year,
        jewishFormatted: h.day + " " + (MONTH_NAMES[h.month] || "?") + " " + h.year,
        secularDate: secular,
        notes: notes,
        gYear: g.year,
        gMonth: g.month,
        gDay: g.day,
      });
    }
    return rows;
  }

  global.HebrewCalendar = {
    gregorianToJewish,
    jewishToGregorian,
    formatGregorian,
    parseDateInput,
    toDateInputValue,
    daysUntilAnniversary,
    isLeapYear,
    MONTH_NAMES,
    hebrewToAbs,
    absToHebrew,
    addHebrewMonths,
    monthlyMemorialTable,
    hebrewMonthLength,
    lastMonthOfYear,
  };
})(typeof window !== "undefined" ? window : globalThis);
