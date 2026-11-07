(function () {
  "use strict";

  const STORAGE_KEY = "memorial_deceased_v1";
  const HC = window.HebrewCalendar;

  // ---------- State ----------
  let people = loadPeople();
  let editingId = null;
  let searchQuery = "";

  // ---------- DOM refs ----------
  const views = {
    home: document.getElementById("view-home"),
    form: document.getElementById("view-form"),
    calc: document.getElementById("view-calc"),
    detail: document.getElementById("view-detail"),
  };

  const listContainer = document.getElementById("list-container");
  const sideMenu = document.getElementById("side-menu");
  const overlay = document.getElementById("menu-overlay");
  const form = document.getElementById("person-form");

  // Hidden file input for photo uploads
  const photoInput = document.createElement("input");
  photoInput.type = "file";
  photoInput.accept = "image/*";
  photoInput.style.display = "none";
  document.body.appendChild(photoInput);
  let photoTargetId = null;

  /** Resize & compress image to keep localStorage small and display reliable */
  function compressImage(dataUrl, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = dataUrl;
    });
  }

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files && photoInput.files[0];
    const targetId = photoTargetId;
    photoInput.value = "";
    photoTargetId = null;
    if (!file || !targetId) return;

    if (!file.type || !file.type.startsWith("image/")) {
      alert("Please choose an image file (JPG, PNG, etc.).");
      return;
    }

    try {
      const rawDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

      // Compress to ~256px JPEG so it always fits in storage and displays
      const dataUrl = await compressImage(rawDataUrl, 256, 0.72);

      const idx = people.findIndex((x) => x.id === targetId);
      if (idx < 0) return;

      people[idx].photo = dataUrl;
      const ok = savePeople();
      if (!ok) {
        // fallback: still show in memory this session
        alert("Photo is shown, but could not be saved permanently (storage full). Try a smaller image.");
      }
      renderList();
    } catch (err) {
      console.error(err);
      alert("Could not use this image. Please try another photo.");
    }
  });

  // ---------- Helpers ----------
  function loadPeople() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function savePeople() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
      return true;
    } catch (err) {
      console.error("savePeople failed", err);
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function showView(name) {
    Object.values(views).forEach((v) => v.classList.remove("active"));
    views[name].classList.add("active");
    closeMenu();
  }

  function openMenu() {
    sideMenu.classList.add("open");
    overlay.classList.add("show");
  }

  function closeMenu() {
    sideMenu.classList.remove("open");
    overlay.classList.remove("show");
  }

  /** Convert Gregorian → Jewish; if afterSunset, use next civil day (Hebrew day starts at nightfall). */
  function jewishFromGregorianParts(year, month, day, afterSunset) {
    let y = year, m = month, d = day;
    if (afterSunset) {
      const dt = new Date(year, month - 1, day);
      dt.setDate(dt.getDate() + 1);
      y = dt.getFullYear();
      m = dt.getMonth() + 1;
      d = dt.getDate();
    }
    return HC.gregorianToJewish(y, m, d);
  }

  function updateJewishFromGreg(gregInputId, jewishInputId, sunsetCheckboxId) {
    const val = document.getElementById(gregInputId).value;
    const out = document.getElementById(jewishInputId);
    if (!val) {
      out.value = "";
      return;
    }
    const p = HC.parseDateInput(val);
    const afterSunset = sunsetCheckboxId
      ? !!(document.getElementById(sunsetCheckboxId) && document.getElementById(sunsetCheckboxId).checked)
      : false;
    const j = jewishFromGregorianParts(p.year, p.month, p.day, afterSunset);
    out.value = j.formatted;
  }

  /**
   * Time since death in full years + months (based on death date → today).
   * Example: died 1 Mar 2025, today 1 Sep 2026 → 1 year 6 months
   * Example: died 1 Mar 2025, today 1 Mar 2026 → 1 year
   */
  function yearsSincePassing(person) {
    let death = null;
    if (person.deathGregISO) {
      death = new Date(person.deathGregISO + "T12:00:00");
    } else if (person.deathGregFormatted) {
      // try to parse "06 Nov, 2004"
      const d = new Date(person.deathGregFormatted);
      if (!isNaN(d.getTime())) death = d;
    }
    if (!death || isNaN(death.getTime())) return null;

    const today = new Date();
    // Normalize to noon to avoid DST edge issues
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    const d = new Date(death.getFullYear(), death.getMonth(), death.getDate(), 12, 0, 0);

    if (t < d) return { years: 0, months: 0 };

    let years = t.getFullYear() - d.getFullYear();
    let months = t.getMonth() - d.getMonth();
    if (t.getDate() < d.getDate()) {
      months -= 1;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return { years: 0, months: 0 };
    return { years: years, months: months };
  }

  function formatAnniversaryPassing(person) {
    const y = yearsSincePassing(person);
    if (!y) return "";
    const yp = y.years === 1 ? "1 year" : y.years + " years";
    const mp = y.months === 1 ? "1 month" : y.months + " months";
    if (y.years === 0 && y.months === 0) {
      return "Anniversary of passing: less than 1 month";
    }
    if (y.years === 0) {
      return "Anniversary of passing: " + mp;
    }
    if (y.months === 0) {
      return "Anniversary of passing: " + yp;
    }
    return "Anniversary of passing: " + yp + " " + mp;
  }

  /** Age at death (years of life), from birth to death */
  function yearsOfLife(person) {
    if (!person.birthGregISO || !person.deathGregISO) return null;
    const birth = new Date(person.birthGregISO + "T12:00:00");
    const death = new Date(person.deathGregISO + "T12:00:00");
    let years = death.getFullYear() - birth.getFullYear();
    const m = death.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && death.getDate() < birth.getDate())) {
      years--;
    }
    return Math.max(0, years);
  }

  /** Next anniversary date (Gregorian + Jewish text) */
  function formatLongWeekdayDate(dateObj) {
    const weekdays = [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
    ];
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return (
      weekdays[dateObj.getDay()] +
      ", " +
      months[dateObj.getMonth()] +
      " " +
      dateObj.getDate() +
      ", " +
      dateObj.getFullYear()
    );
  }

  function nextAnniversaryInfo(person) {
    if (!person.deathJewishMonth || !person.deathJewishDay) return null;
    const days = HC.daysUntilAnniversary(person.deathJewishMonth, person.deathJewishDay);
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    next.setDate(next.getDate() + days);
    const gYear = next.getFullYear();
    const gMonth = next.getMonth() + 1;
    const gDay = next.getDate();
    const j = HC.gregorianToJewish(gYear, gMonth, gDay);

    // Jewish day begins at sundown the previous evening
    const evening = new Date(next.getFullYear(), next.getMonth(), next.getDate());
    evening.setDate(evening.getDate() - 1);

    const gregLong = formatLongWeekdayDate(next);
    const eveningLong = formatLongWeekdayDate(evening);
    const gregWithSundown =
      "Gregorian Date: " +
      gregLong +
      " (beginning at sundown on the evening of " +
      eveningLong +
      ")";

    return {
      days: days,
      gregFormatted: HC.formatGregorian(gYear, gMonth, gDay),
      gregLong: gregLong,
      eveningLong: eveningLong,
      gregWithSundown: gregWithSundown,
      jewishFormatted: j.formatted,
      isToday: days === 0,
    };
  }

  function daysLeft(person) {
    if (!person.deathJewishMonth || !person.deathJewishDay) return 9999;
    return HC.daysUntilAnniversary(person.deathJewishMonth, person.deathJewishDay);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function defaultAvatarSvg() {
    return `<svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
  }

  // ---------- Render list ----------
  function getFilteredPeople() {
    const q = (searchQuery || "").trim().toLowerCase();
    let list = people.slice();
    if (q) {
      list = list.filter((p) => {
        const fields = [
          p.name,
          p.hebrewName,
          p.deathJewish,
          p.deathGregFormatted,
          p.deathGregISO,
          p.birthJewish,
          p.birthGregISO,
          p.city,
          p.country,
          p.cemetery,
          p.bio,
        ];
        return fields.some((f) => f && String(f).toLowerCase().includes(q));
      });
    }
    return list.sort((a, b) => daysLeft(a) - daysLeft(b));
  }

  function renderList() {
    listContainer.innerHTML = "";

    if (people.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No deceased records yet.<br/>Tap the menu (☰) to add someone.</p>
          <button type="button" id="empty-add">+ Add new person</button>
        </div>`;
      document.getElementById("empty-add").onclick = () => openForm();
      return;
    }

    const sorted = getFilteredPeople();

    if (sorted.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No profiles match “${escapeHtml(searchQuery)}”.</p>
          <button type="button" id="empty-clear-search">Clear search</button>
        </div>`;
      document.getElementById("empty-clear-search").onclick = () => {
        searchQuery = "";
        const inp = document.getElementById("search-input");
        if (inp) inp.value = "";
        const clr = document.getElementById("search-clear");
        if (clr) clr.hidden = true;
        renderList();
      };
      return;
    }

    sorted.forEach((p) => {
      const card = document.createElement("div");
      card.className = "person-card";
      card.dataset.id = p.id;

      const yearsText = formatAnniversaryPassing(p);
      const ysp = yearsSincePassing(p);
      // Only first year after death (has not completed 1 full year yet)
      const withinFirstYear = !!(ysp && ysp.years === 0);

      const lifeYears = yearsOfLife(p);
      const lifeText =
        lifeYears === null
          ? ""
          : lifeYears === 1
          ? "Years of Life: 1"
          : `Years of Life: ${lifeYears}`;

      const deathJewish = p.deathJewish || "";
      const deathGreg = p.deathGregFormatted || "";

      const hasPhoto = !!(p.photo && String(p.photo).startsWith("data:image"));
      const avatarContent = hasPhoto
        ? `<img src="${p.photo}" alt="Photo" class="avatar-img" draggable="false" />`
        : defaultAvatarSvg();

      card.innerHTML = `
        <div class="card-header">
          <div class="card-info">
            <span class="name-pill">${escapeHtml(p.name)}</span>
            ${p.hebrewName ? `<div class="hebrew-name">${escapeHtml(p.hebrewName)}</div>` : ""}
            <div class="date-line">${escapeHtml(deathJewish)}</div>
            <div class="date-line">${escapeHtml(deathGreg)}</div>
            <button type="button" class="anniversary-pill" title="Show next anniversary">Anniversary</button>
            <div class="countdown">${yearsText}</div>
          </div>
          <div class="card-right">
            <div class="avatar" role="button" tabindex="0" title="Tap to upload photo">${avatarContent}</div>
            ${lifeText ? `<div class="years-of-life">${lifeText}</div>` : ""}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-remind" title="Remind">🔔</button>
          <button class="btn-share" title="Share all profiles with family">🔗</button>
          ${withinFirstYear
            ? `<button type="button" class="btn-hebrew-month" title="Hebrew month milestones">Hebrew Month Anniversary</button>`
            : `<div class="bar bar-inactive"></div>`}
          <button class="btn-delete-card" title="Delete">🗑️</button>
        </div>
      `;

      // Name → detail
      card.querySelector(".name-pill").addEventListener("click", () => openDetail(p.id));
      card.querySelector(".hebrew-name")?.addEventListener("click", () => openDetail(p.id));

      // Photo upload – click avatar to choose image
      const avatarEl = card.querySelector(".avatar");
      const openPhotoPicker = (e) => {
        e.preventDefault();
        e.stopPropagation();
        photoTargetId = p.id;
        photoInput.click();
      };
      avatarEl.addEventListener("click", openPhotoPicker);
      avatarEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") openPhotoPicker(e);
      });

      // Anniversary button → show next date
      card.querySelector(".anniversary-pill").addEventListener("click", (e) => {
        e.stopPropagation();
        showAnniversaryPopup(p);
      });

      const hebBtn = card.querySelector(".btn-hebrew-month");
      if (hebBtn) {
        hebBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showHebrewMonthAnniversaryPopup(p);
        });
      }

      card.querySelector(".btn-delete-card").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Delete ${p.name}?`)) {
          people = people.filter((x) => x.id !== p.id);
          savePeople();
          renderList();
        }
      });

      card.querySelector(".btn-remind").addEventListener("click", (e) => {
        e.stopPropagation();
        const info = nextAnniversaryInfo(p);
        const when = info
          ? info.isToday
            ? "today"
            : `on ${info.gregFormatted} (${info.jewishFormatted})`
          : "the next anniversary";
        alert(`Reminder set for the anniversary of ${p.name} ${when}.`);
      });

      card.querySelector(".btn-share").addEventListener("click", (e) => {
        e.stopPropagation();
        shareAllProfiles();
      });

      listContainer.appendChild(card);
    });
  }

  // ---------- Anniversary popup ----------

  function resolveDeathJewishParts(person) {
    if (person.deathJewishMonth && person.deathJewishDay) {
      var year = null;
      if (person.deathJewish) {
        var m = String(person.deathJewish).match(/(\d{3,4})\s*$/);
        if (m) year = parseInt(m[1], 10);
      }
      if (!year && person.deathGregISO) {
        var p = HC.parseDateInput(person.deathGregISO);
        if (p) {
          var j = HC.gregorianToJewish(p.year, p.month, p.day);
          // if after sunset, Jewish date is next day — already stored on person
          year = j.year;
          // Prefer stored month/day from person
        }
      }
      if (!year) year = new Date().getFullYear() + 3760; // rough fallback
      return { year: year, month: person.deathJewishMonth, day: person.deathJewishDay };
    }
    if (person.deathGregISO) {
      var p2 = HC.parseDateInput(person.deathGregISO);
      if (!p2) return null;
      var j2 = HC.gregorianToJewish(p2.year, p2.month, p2.day);
      if (person.deathAfterSunset) {
        // advance one Gregorian day for Jewish conversion already done at save;
        // if only gregorian present, recompute with after sunset
        var dt = new Date(p2.year, p2.month - 1, p2.day);
        dt.setDate(dt.getDate() + 1);
        j2 = HC.gregorianToJewish(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      }
      return { year: j2.year, month: j2.month, day: j2.day };
    }
    return null;
  }

  function showHebrewMonthAnniversaryPopup(person) {
    document.getElementById("anniv-popup") && document.getElementById("anniv-popup").remove();
    document.getElementById("anniv-overlay") && document.getElementById("anniv-overlay").remove();

    var parts = resolveDeathJewishParts(person);
    var ov = document.createElement("div");
    ov.id = "anniv-overlay";
    ov.className = "anniv-overlay";
    var pop = document.createElement("div");
    pop.id = "anniv-popup";
    pop.className = "anniv-popup anniv-popup-wide";

    var body;
    if (!parts) {
      body = "<p>No death date on file for this person.</p>";
    } else {
      var rows = HC.monthlyMemorialTable(parts.year, parts.month, parts.day);
      var table =
        "<div class='month-table-wrap'><table class='month-table'>" +
        "<thead><tr>" +
        "<th>Hebrew Month</th><th>Day</th><th>Secular Date</th><th>Notes / Context</th>" +
        "</tr></thead><tbody>";
      rows.forEach(function (r) {
        table +=
          "<tr>" +
          "<td>" + escapeHtml(r.hebrewMonth) + "</td>" +
          "<td>" + r.hebrewDay + (r.hebrewDay === 1 ? "st" : r.hebrewDay === 2 ? "nd" : r.hebrewDay === 3 ? "rd" : "th") + "</td>" +
          "<td>" + escapeHtml(r.secularDate) + "</td>" +
          "<td>" + escapeHtml(r.notes) + "</td>" +
          "</tr>";
      });
      table += "</tbody></table></div>";
      body =
        "<p class='anniv-label'>First-year Hebrew month memorials</p>" +
        "<p class='share-hint'>Based on Jewish death date: <strong>" +
        escapeHtml(person.deathJewish || (parts.day + " / month " + parts.month + " / " + parts.year)) +
        "</strong></p>" +
        table;
    }

    pop.innerHTML =
      "<h3>" + escapeHtml(person.name) + "</h3>" +
      body +
      "<button type='button' class='anniv-close'>Close</button>";

    document.body.appendChild(ov);
    document.body.appendChild(pop);
    function close() {
      ov.remove();
      pop.remove();
    }
    ov.addEventListener("click", close);
    pop.querySelector(".anniv-close").addEventListener("click", close);
  }

  function showAnniversaryPopup(person) {
    const info = nextAnniversaryInfo(person);
    // Remove existing popup if any
    document.getElementById("anniv-popup")?.remove();
    document.getElementById("anniv-overlay")?.remove();

    const ov = document.createElement("div");
    ov.id = "anniv-overlay";
    ov.className = "anniv-overlay";

    const pop = document.createElement("div");
    pop.id = "anniv-popup";
    pop.className = "anniv-popup";

    let body;
    if (!info) {
      body = `<p>No death date on file for this person.</p>`;
    } else if (info.isToday) {
      body = `
        <p class="anniv-today">Today is the anniversary</p>
        <p><strong>Jewish date:</strong> ${escapeHtml(info.jewishFormatted)}</p>
        <p class="anniv-greg-long">${escapeHtml(info.gregWithSundown)}</p>
      `;
    } else {
      body = `
        <p class="anniv-label">Next anniversary</p>
        <p><strong>Jewish date:</strong> ${escapeHtml(info.jewishFormatted)}</p>
        <p class="anniv-greg-long">${escapeHtml(info.gregWithSundown)}</p>
        <p class="anniv-days">${info.days} day${info.days === 1 ? "" : "s"} from today</p>
      `;
    }

    const yearsLine = (() => {
      const t = formatAnniversaryPassing(person);
      return t ? `<p class="anniv-years">${t}</p>` : "";
    })();

    pop.innerHTML = `
      <h3>${escapeHtml(person.name)}</h3>
      ${yearsLine}
      ${body}
      <button type="button" class="anniv-close">Close</button>
    `;

    document.body.appendChild(ov);
    document.body.appendChild(pop);

    const close = () => {
      ov.remove();
      pop.remove();
    };
    ov.addEventListener("click", close);
    pop.querySelector(".anniv-close").addEventListener("click", close);
  }

  // ---------- Form ----------
  function openForm(id = null) {
    editingId = id;
    form.reset();
    document.getElementById("edit-id").value = "";

    if (id) {
      const p = people.find((x) => x.id === id);
      if (p) {
        document.getElementById("edit-id").value = p.id;
        document.getElementById("name").value = p.name || "";
        document.getElementById("hebrew-name").value = p.hebrewName || "";
        if (p.deathGregISO) document.getElementById("death-greg").value = p.deathGregISO;
        document.getElementById("death-after-sunset").checked = !!p.deathAfterSunset;
        document.getElementById("death-jewish").value = p.deathJewish || "";
        if (p.birthGregISO) document.getElementById("birth-greg").value = p.birthGregISO;
        document.getElementById("birth-after-sunset").checked = !!p.birthAfterSunset;
        document.getElementById("birth-jewish").value = p.birthJewish || "";
        document.getElementById("country").value = p.country || "";
        document.getElementById("city").value = p.city || "";
        document.getElementById("cemetery").value = p.cemetery || "";
        document.getElementById("block").value = p.block || "";
        document.getElementById("row").value = p.row || "";
        document.getElementById("place").value = p.place || "";
        document.getElementById("reminder").checked = p.reminder !== false;
      }
    }
    showView("form");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    if (!name) return;

    const deathISO = document.getElementById("death-greg").value;
    const deathAfterSunset = document.getElementById("death-after-sunset").checked;
    let deathJewish = "",
      deathJewishMonth = null,
      deathJewishDay = null,
      deathGregFormatted = "";
    if (deathISO) {
      const p = HC.parseDateInput(deathISO);
      const j = jewishFromGregorianParts(p.year, p.month, p.day, deathAfterSunset);
      deathJewish = j.formatted;
      deathJewishMonth = j.month;
      deathJewishDay = j.day;
      deathGregFormatted = HC.formatGregorian(p.year, p.month, p.day);
    }

    const birthISO = document.getElementById("birth-greg").value;
    const birthAfterSunset = document.getElementById("birth-after-sunset").checked;
    let birthJewish = "";
    if (birthISO) {
      const p = HC.parseDateInput(birthISO);
      const j = jewishFromGregorianParts(p.year, p.month, p.day, birthAfterSunset);
      birthJewish = j.formatted;
    }

    const existingId = document.getElementById("edit-id").value;
    const existing = existingId ? people.find((x) => x.id === existingId) : null;

    const record = {
      id: existingId || uid(),
      name,
      hebrewName: document.getElementById("hebrew-name").value.trim(),
      bio: "",
      deathGregISO: deathISO,
      deathGregFormatted,
      deathJewish,
      deathJewishMonth,
      deathJewishDay,
      deathAfterSunset: deathAfterSunset,
      birthGregISO: birthISO,
      birthJewish,
      birthAfterSunset: birthAfterSunset,
      country: document.getElementById("country").value,
      city: document.getElementById("city").value.trim(),
      cemetery: document.getElementById("cemetery").value.trim(),
      block: document.getElementById("block").value.trim(),
      row: document.getElementById("row").value.trim(),
      place: document.getElementById("place").value.trim(),
      reminder: document.getElementById("reminder").checked,
      photo: existing ? existing.photo || null : null,
      createdAt: existing ? existing.createdAt : Date.now(),
    };

    const idx = people.findIndex((x) => x.id === record.id);
    if (idx >= 0) {
      people[idx] = { ...people[idx], ...record };
    } else {
      people.push(record);
    }
    savePeople();
    renderList();
    showView("home");
  });

  function refreshDeathJewish() {
    updateJewishFromGreg("death-greg", "death-jewish", "death-after-sunset");
  }
  function refreshBirthJewish() {
    updateJewishFromGreg("birth-greg", "birth-jewish", "birth-after-sunset");
  }
  document.getElementById("death-greg").addEventListener("change", refreshDeathJewish);
  document.getElementById("death-after-sunset").addEventListener("change", refreshDeathJewish);
  document.getElementById("birth-greg").addEventListener("change", refreshBirthJewish);
  document.getElementById("birth-after-sunset").addEventListener("change", refreshBirthJewish);

  // ---------- Detail ----------
  function openDetail(id) {
    const p = people.find((x) => x.id === id);
    if (!p) return;
    const el = document.getElementById("detail-content");
    const yearsText = formatAnniversaryPassing(p);

    const lifeYears = yearsOfLife(p);
    const lifeText =
      lifeYears === null
        ? ""
        : `Years of Life: ${lifeYears}`;

    const photoHtml =
      p.photo && String(p.photo).startsWith("data:image")
        ? `<img src="${p.photo}" alt="Photo" class="detail-photo" />`
        : "";

    el.innerHTML = `
      ${photoHtml}
      <h2>${escapeHtml(p.name)}</h2>
      ${p.hebrewName ? `<div class="meta"><strong>${escapeHtml(p.hebrewName)}</strong></div>` : ""}
      <div class="meta">Death: ${escapeHtml(p.deathJewish || "—")} (${escapeHtml(p.deathGregFormatted || "—")})</div>
      ${yearsText ? `<div class="meta years-line">${yearsText}</div>` : ""}
      ${lifeText ? `<div class="meta life-line">${lifeText}</div>` : ""}
      ${p.birthJewish ? `<div class="meta">Birth: ${escapeHtml(p.birthJewish)}</div>` : ""}
      ${
        p.country || p.city || p.cemetery
          ? `
        <div class="meta" style="margin-top:12px"><strong>Burial</strong></div>
        <div class="meta">${[p.cemetery, p.city, p.country].filter(Boolean).map(escapeHtml).join(", ")}</div>
        ${
          p.block || p.row || p.place
            ? `<div class="meta">Block ${escapeHtml(p.block || "—")} / Row ${escapeHtml(p.row || "—")} / Place ${escapeHtml(p.place || "—")}</div>`
            : ""
        }
      `
          : ""
      }
      ${p.bio ? `<div class="bio">${escapeHtml(p.bio)}</div>` : ""}
      <div class="detail-actions">
        <button class="btn-edit" type="button">Edit</button>
        <button class="btn-delete" type="button">Delete</button>
      </div>
    `;
    el.querySelector(".btn-edit").onclick = () => openForm(p.id);
    el.querySelector(".btn-delete").onclick = () => {
      if (confirm(`Delete ${p.name}?`)) {
        people = people.filter((x) => x.id !== p.id);
        savePeople();
        renderList();
        showView("home");
      }
    };
    showView("detail");
  }

  // ---------- Calculator ----------
  function setupCalculator() {
    const gregInput = document.getElementById("calc-greg");
    const jewishResult = document.getElementById("calc-jewish-result");

    const today = new Date();
    gregInput.value = HC.toDateInputValue(today.getFullYear(), today.getMonth() + 1, today.getDate());
    convertGregToJewish();

    gregInput.addEventListener("change", convertGregToJewish);

    function convertGregToJewish() {
      const val = gregInput.value;
      if (!val) {
        jewishResult.textContent = "Select a date above";
        return;
      }
      const p = HC.parseDateInput(val);
      const j = HC.gregorianToJewish(p.year, p.month, p.day);
      jewishResult.innerHTML = `
        <div>${j.formatted}</div>
        <div style="font-size:0.85rem;font-weight:500;opacity:0.85;margin-top:4px">${j.monthName} ${j.year}</div>
      `;
    }

    document.getElementById("btn-convert-jewish").addEventListener("click", () => {
      const day = parseInt(document.getElementById("calc-j-day").value, 10);
      const month = parseInt(document.getElementById("calc-j-month").value, 10);
      const year = parseInt(document.getElementById("calc-j-year").value, 10);
      const resultEl = document.getElementById("calc-greg-result");
      if (!day || !month || !year) {
        resultEl.textContent = "Enter a complete Jewish date";
        return;
      }
      try {
        const g = HC.jewishToGregorian(year, month, day);
        resultEl.innerHTML = `
          <div>${g.formatted}</div>
          <div style="font-size:0.85rem;font-weight:500;opacity:0.85;margin-top:4px">${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}</div>
        `;
      } catch (err) {
        resultEl.textContent = "Could not convert this date";
      }
    });
  }

  // ---------- Navigation ----------
  document.getElementById("btn-menu").addEventListener("click", openMenu);
  document.getElementById("btn-close-menu").addEventListener("click", closeMenu);
  overlay.addEventListener("click", closeMenu);

  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "add") openForm();
      else if (action === "calc") showView("calc");
      else if (action === "home") {
        renderList();
        showView("home");
      } else if (action === "share") {
        closeMenu();
        shareAllProfiles();
      } else if (action === "download") {
        closeMenu();
        downloadProfiles();
      } else if (action === "import") {
        closeMenu();
        importProfiles();
      }
    });
  });

  document.getElementById("btn-back-form").addEventListener("click", () => {
    renderList();
    showView("home");
  });
  document.getElementById("btn-back-calc").addEventListener("click", () => {
    renderList();
    showView("home");
  });
  document.getElementById("btn-back-detail").addEventListener("click", () => {
    renderList();
    showView("home");
  });

  document.querySelectorAll("#view-home .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#view-home .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      if (tab.dataset.tab === "calc") {
        showView("calc");
      } else {
        renderList();
        showView("home");
      }
    });
  });

  document.getElementById("btn-change").addEventListener("click", () => {
    document.getElementById("name").focus();
  });

  // ---------- Seed example ----------

  // ---------- Share / Import ----------
  const EXPORT_TYPE = "memorial-profiles-v1";

  function isAndroidLike() {
    var ua = navigator.userAgent || "";
    return /Android/i.test(ua);
  }


  function buildExportPayload() {
    return {
      type: EXPORT_TYPE,
      app: "Memorial",
      exportedAt: new Date().toISOString(),
      count: people.length,
      people: people,
    };
  }

  /** Build a .txt file (plain text) containing the export JSON so Android share works. */
  function buildProfilesTextFile() {
    const payload = buildExportPayload();
    const text = JSON.stringify(payload, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const filename = "memorial-profiles-" + date + ".txt";
    const blob = new Blob([text], { type: "text/plain" });
    const file = new File([blob], filename, { type: "text/plain" });
    return { payload, text, filename, blob, file };
  }

  /** Build a .json file containing the export JSON for downloading profiles. */
  function buildProfilesJsonFile() {
    const payload = buildExportPayload();
    const text = JSON.stringify(payload, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const filename = "memorial-profiles-" + date + ".json";
    const blob = new Blob([text], { type: "application/json" });
    const file = new File([blob], filename, { type: "application/json" });
    return { payload, text, filename, blob, file };
  }

  function triggerJsonDownload(filename, text, blob) {
    if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.downloadJsonFile === "function") {
      var res = window.AndroidNativeBridge.downloadJsonFile(filename, text);
      if (res && String(res).indexOf("ERROR:") !== 0) {
        alert("Downloaded \"" + res + "\" to your device's Downloads folder.");
        return true;
      }
    }
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 300);
      return true;
    } catch (e) {
      console.error("Download failed", e);
      return false;
    }
  }


  function getCapPlugin(name) {
    try {
      var Cap = window.Capacitor;
      if (!Cap) return null;
      if (Cap.Plugins && Cap.Plugins[name]) return Cap.Plugins[name];
      if (typeof Cap.getPlugin === "function") {
        try { return Cap.getPlugin(name); } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  async function copyTextReliable(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "0";
      ta.style.top = "0";
      ta.style.opacity = "0.01";
      ta.style.width = "100%";
      ta.style.height = "40px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (e2) {
      return false;
    }
  }

  function showExportPanel(mode) {
    // mode: "download" | "share"
    if (!people.length) {
      alert("You have no profiles yet. Add someone first.");
      return;
    }
    var built = buildProfilesTextFile();
    var text = built.text;
    var filename = built.filename;
    var file = built.file;

    document.getElementById("share-overlay") && document.getElementById("share-overlay").remove();
    document.getElementById("share-panel") && document.getElementById("share-panel").remove();

    var ov = document.createElement("div");
    ov.id = "share-overlay";
    ov.className = "anniv-overlay";
    var panel = document.createElement("div");
    panel.id = "share-panel";
    panel.className = "anniv-popup share-panel";
    panel.innerHTML =
      "<h3>" + (mode === "share" ? "Share profiles" : "Download / save profiles") + "</h3>" +
      "<p class='share-desc'><strong>" + people.length + "</strong> profile(s) · file <strong>" + filename + "</strong></p>" +
      "<button type='button' class='share-btn primary' data-act='copy'>1. Copy profiles text</button>" +
      "<button type='button' class='share-btn' data-act='share'>2. Share via another app</button>" +
      "<button type='button' class='share-btn' data-act='select'>3. Select text below (long-press → Copy)</button>" +
      "<textarea id='export-text-box' class='import-paste' readonly rows='6'></textarea>" +
      "<p class='share-hint'>After Copy: open WhatsApp, Gmail, Drive, or Notes and Paste. Save as a .txt file, then others can Import it.</p>" +
      "<button type='button' class='share-btn' data-act='close'>Close</button>";

    document.body.appendChild(ov);
    document.body.appendChild(panel);
    var box = panel.querySelector("#export-text-box");
    box.value = text;

    function close() {
      ov.remove();
      panel.remove();
    }
    ov.addEventListener("click", close);
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    panel.querySelector("[data-act='close']").addEventListener("click", close);

    panel.querySelector("[data-act='copy']").addEventListener("click", async function () {
      var ok = await copyTextReliable(text);
      if (ok) {
        alert("Copied.\n\nNow open WhatsApp, Gmail, Drive, or Notes and Paste.\nSave the message/file so you can Import later.");
      } else {
        alert("Automatic copy failed.\n\nUse button 3: tap the text box, Select All, then Copy.");
        box.focus();
        box.select();
      }
    });

    panel.querySelector("[data-act='select']").addEventListener("click", function () {
      box.focus();
      box.select();
      try { box.setSelectionRange(0, text.length); } catch (e) {}
      alert("Text is selected.\nLong-press the selection → Copy.\nThen Paste into Drive / Notes / email.");
    });

    panel.querySelector("[data-act='share']").addEventListener("click", async function () {
      // Capacitor Share plugin (text)
      var Share = getCapPlugin("Share");
      if (Share && Share.share) {
        try {
          await Share.share({
            title: "Memorial profiles",
            text: text,
            dialogTitle: "Share Memorial profiles",
          });
          return;
        } catch (err) {
          if (err && (err.message || "").toLowerCase().indexOf("cancel") >= 0) return;
          console.warn("Capacitor Share failed", err);
        }
      }

      // Web Share API with file
      if (navigator.share) {
        try {
          var dataFiles = { title: "Memorial profiles", text: "Memorial profiles (" + people.length + ")", files: [file] };
          if (!navigator.canShare || navigator.canShare(dataFiles)) {
            await navigator.share(dataFiles);
            return;
          }
        } catch (err) {
          if (err && err.name === "AbortError") return;
          console.warn("share files failed", err);
        }
        try {
          await navigator.share({ title: "Memorial profiles", text: text });
          return;
        } catch (err2) {
          if (err2 && err2.name === "AbortError") return;
          console.warn("share text failed", err2);
        }
      }

      // Last resort: copy
      var ok = await copyTextReliable(text);
      if (ok) {
        alert("Share menu is not available.\nProfiles were copied to the clipboard.\nPaste into WhatsApp, Gmail, or Drive.");
      } else {
        alert("Share is not available.\nUse button 3 to select and copy the text manually.");
        box.focus();
        box.select();
      }
    });
  }

  async function downloadProfiles() {
    if (!people.length) {
      alert("You have no profiles yet. Add someone first.");
      return;
    }
    var built = buildProfilesJsonFile();
    var text = built.text;
    var filename = built.filename;
    var blob = built.blob;

    document.getElementById("share-overlay") && document.getElementById("share-overlay").remove();
    document.getElementById("share-panel") && document.getElementById("share-panel").remove();

    var ov = document.createElement("div");
    ov.id = "share-overlay";
    ov.className = "anniv-overlay";
    var panel = document.createElement("div");
    panel.id = "share-panel";
    panel.className = "anniv-popup share-panel";
    panel.innerHTML =
      "<h3>Download profiles (.json)</h3>" +
      "<p class='share-desc'><strong>" + people.length + "</strong> profile(s) · file <strong>" + filename + "</strong></p>" +
      "<button type='button' class='share-btn primary' data-act='download-json'>1. Download .json file</button>" +
      "<button type='button' class='share-btn' data-act='save-as-json'>2. Save .json file to folder...</button>" +
      "<button type='button' class='share-btn' data-act='copy-json'>3. Copy JSON text</button>" +
      "<textarea id='export-text-box' class='import-paste' readonly rows='6'></textarea>" +
      "<p class='share-hint'>Downloads <strong>" + filename + "</strong> directly to your device so you can import it anytime via Menu → Import profiles.</p>" +
      "<button type='button' class='share-btn' data-act='close'>Close</button>";

    document.body.appendChild(ov);
    document.body.appendChild(panel);
    var box = panel.querySelector("#export-text-box");
    box.value = text;

    function close() {
      ov.remove();
      panel.remove();
    }
    ov.addEventListener("click", close);
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    panel.querySelector("[data-act='close']").addEventListener("click", close);

    panel.querySelector("[data-act='download-json']").addEventListener("click", function () {
      triggerJsonDownload(filename, text, blob);
    });

    panel.querySelector("[data-act='save-as-json']").addEventListener("click", function () {
      if (window.AndroidNativeBridge && typeof window.AndroidNativeBridge.saveJsonFileWithPicker === "function") {
        window.AndroidNativeBridge.saveJsonFileWithPicker(filename, text);
      } else {
        triggerJsonDownload(filename, text, blob);
      }
    });

    panel.querySelector("[data-act='copy-json']").addEventListener("click", async function () {
      var ok = await copyTextReliable(text);
      if (ok) {
        alert("Copied JSON text to clipboard.");
      } else {
        box.focus();
        box.select();
        try { box.setSelectionRange(0, text.length); } catch (e) {}
        alert("Text is selected. Long-press the selection → Copy.");
      }
    });
  }

  async function shareAllProfiles() {
    showExportPanel("share");
  }

  function showShareFallbackPanel(filename, text, file) {
    showExportPanel("share");
  }

  function parseImportText(raw) {
    if (!raw || !String(raw).trim()) {
      throw new Error("Empty data");
    }
    var text = String(raw).replace(/^\uFEFF/, "").trim();
    if (text.charAt(0) !== "{" && text.charAt(0) !== "[") {
      var start = text.indexOf("{");
      var end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        text = text.slice(start, end + 1);
      }
    }
    var data = JSON.parse(text);
    var incoming = [];
    if (data && data.type === EXPORT_TYPE && Array.isArray(data.people)) {
      incoming = data.people;
    } else if (Array.isArray(data)) {
      incoming = data;
    } else if (data && Array.isArray(data.people)) {
      incoming = data.people;
    } else {
      throw new Error("Not a Memorial profiles file");
    }
    if (!incoming.length) throw new Error("No profiles in file");
    return incoming;
  }

  function applyImportedPeople(incoming) {
    var added = 0;
    var updated = 0;
    incoming.forEach(function (item) {
      if (!item || !item.name) return;
      var idx = -1;
      if (item.id) idx = people.findIndex(function (x) { return x.id === item.id; });
      if (idx < 0) {
        idx = people.findIndex(function (x) {
          return x.name === item.name && (x.deathGregISO || "") === (item.deathGregISO || "");
        });
      }
      var record = {
        id: item.id || uid(),
        name: item.name || "",
        hebrewName: item.hebrewName || "",
        bio: item.bio || "",
        deathGregISO: item.deathGregISO || "",
        deathGregFormatted: item.deathGregFormatted || "",
        deathJewish: item.deathJewish || "",
        deathJewishMonth: item.deathJewishMonth || null,
        deathJewishDay: item.deathJewishDay || null,
        deathAfterSunset: !!item.deathAfterSunset,
        birthGregISO: item.birthGregISO || "",
        birthJewish: item.birthJewish || "",
        birthAfterSunset: !!item.birthAfterSunset,
        country: item.country || "",
        city: item.city || "",
        cemetery: item.cemetery || "",
        block: item.block || "",
        row: item.row || "",
        place: item.place || "",
        reminder: item.reminder !== false,
        photo: item.photo || null,
        createdAt: item.createdAt || Date.now(),
      };
      if (idx >= 0) {
        people[idx] = Object.assign({}, people[idx], record, { id: people[idx].id });
        updated++;
      } else {
        people.push(record);
        added++;
      }
    });
    var ok = savePeople();
    renderList();
    showView("home");
    if (!ok) {
      alert("Import finished, but storage may be full.\nAdded: " + added + "\nUpdated: " + updated);
    } else {
      alert("Import complete.\nAdded: " + added + "\nUpdated: " + updated);
    }
  }


  function importProfiles() {
    document.getElementById("share-overlay") && document.getElementById("share-overlay").remove();
    document.getElementById("share-panel") && document.getElementById("share-panel").remove();

    var ov = document.createElement("div");
    ov.id = "share-overlay";
    ov.className = "anniv-overlay";

    var panel = document.createElement("div");
    panel.id = "share-panel";
    panel.className = "anniv-popup share-panel";
    panel.innerHTML =
      "<h3>Import profiles</h3>" +
      "<p class='share-desc'>Choose a profiles file, or paste the text.</p>" +
      "<div class='file-pick-box'>" +
      "<label class='file-pick-label' for='import-file-input'>Choose .txt / .json file</label>" +
      "<input id='import-file-input' type='file' accept='*/*' class='file-pick-input' />" +
      "</div>" +
      "<button type='button' class='share-btn primary' data-act='paste'>Paste profiles text</button>" +
      "<button type='button' class='share-btn' data-act='close'>Cancel</button>" +
      "<p class='share-hint'><strong>Android tip:</strong> If Choose file does nothing, use <strong>Paste</strong> below. Open the .txt in Files → Select All → Copy → Paste here.</p>";

    document.body.appendChild(ov);
    document.body.appendChild(panel);

    function close() {
      ov.remove();
      panel.remove();
    }
    // Do not close when tapping inside panel
    ov.addEventListener("click", close);
    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    panel.querySelector("[data-act='close']").addEventListener("click", close);

    var fileInput = panel.querySelector("#import-file-input");
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) {
        alert("No file selected.");
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var incoming = parseImportText(reader.result);
          if (!confirm("Import " + incoming.length + " profile(s) from \"" + file.name + "\"?\n\nOK = merge with your list")) {
            fileInput.value = "";
            return;
          }
          close();
          applyImportedPeople(incoming);
        } catch (err) {
          console.error(err);
          alert(
            "Could not read this file.\n\nTry: open the .txt, Select All, Copy, then Import → Paste profiles text."
          );
          fileInput.value = "";
        }
      };
      reader.onerror = function () {
        alert("Could not read the file. Try Paste profiles text instead.");
      };
      reader.readAsText(file);
    });

    panel.querySelector("[data-act='paste']").addEventListener("click", function () {
      close();
      var ov2 = document.createElement("div");
      ov2.id = "share-overlay";
      ov2.className = "anniv-overlay";
      var pan2 = document.createElement("div");
      pan2.id = "share-panel";
      pan2.className = "anniv-popup share-panel";
      pan2.innerHTML =
        "<h3>Paste profiles</h3>" +
        "<p class='share-desc'>Paste the full text from the shared file below.</p>" +
        "<textarea id='import-paste-box' class='import-paste' rows='8' placeholder='Paste here...'></textarea>" +
        "<button type='button' class='share-btn primary' data-act='do-paste'>Import pasted text</button>" +
        "<button type='button' class='share-btn' data-act='close2'>Cancel</button>";
      document.body.appendChild(ov2);
      document.body.appendChild(pan2);
      function close2() {
        ov2.remove();
        pan2.remove();
      }
      ov2.addEventListener("click", close2);
      pan2.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      pan2.querySelector("[data-act='close2']").addEventListener("click", close2);
      var box = pan2.querySelector("#import-paste-box");
      setTimeout(function () {
        if (box) box.focus();
      }, 200);
      pan2.querySelector("[data-act='do-paste']").addEventListener("click", function () {
        var raw = box ? box.value : "";
        try {
          var incoming = parseImportText(raw);
          if (!confirm("Import " + incoming.length + " profile(s)?\n\nOK = merge with your list")) {
            return;
          }
          close2();
          applyImportedPeople(incoming);
        } catch (err) {
          console.error(err);
          alert(
            "Could not import that text.\n\nCopy the WHOLE file (starts with { and ends with }).\n\n" +
              (err && err.message ? err.message : "")
          );
        }
      });
    });
  }


  function seedIfEmpty() {
    // Start with an empty list – user adds people via the menu
  }

  // ---------- Init ----------
  seedIfEmpty();
  setupCalculator();

  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value || "";
      if (searchClear) searchClear.hidden = !searchQuery.trim();
      renderList();
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      searchClear.hidden = true;
      renderList();
      if (searchInput) searchInput.focus();
    });
  }

  renderList();
  showView("home");
})();
