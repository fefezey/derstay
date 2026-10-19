import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, limit,
  serverTimestamp, writeBatch, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { wordOfTheDay } from "./words.js";
import { t, locale, applyStatic, setLang } from "./i18n.js";

// Yerelde "npm run dev" ile denerken gerçek proje yerine emülatör kullanılır
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const app = initializeApp(isLocal
  ? { ...firebaseConfig, apiKey: "demo-key", projectId: "demo-derstayim" }
  : firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (isLocal) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const $ = (s) => document.querySelector(s);
const TZ = "Europe/Istanbul";

const svg = (body, w = 2.2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`, 3),
  x: svg(`<path d="M6 6l12 12M18 6L6 18"/>`, 2.6),
  calendar: svg(`<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>`),
  clock: svg(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`),
  history: svg(`<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>`),
  user: svg(`<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>`),
  users: svg(`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3.2 2.2 3.8 5"/>`),
  home: svg(`<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>`),
  list: svg(`<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>`),
  search: svg(`<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>`),
  shield: svg(`<path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z"/>`),
  info: svg(`<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>`),
  logout: svg(`<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>`),
  undo: svg(`<path d="M4 10h11a5 5 0 0 1 0 10h-3"/><path d="M8 6l-4 4 4 4"/>`),
  globe: svg(`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>`),
};

function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) el.innerHTML = ICONS[el.dataset.icon] ?? "";
}
hydrateIcons();
applyStatic();

// Tarih her zaman Türkiye saatine göre (sunucu da aynısını kontrol eder)
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const asDate = (d) => new Date(d + "T12:00:00");
const prettyDate = (d) => asDate(d).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (ts) => ts
  ? ts.toDate().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
  : "…";
const fmtStamp = (ts) => ts.toDate().toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric", timeZone: TZ })
  + " • " + fmtTime(ts);
const nowHM = () => new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const firstName = (u) => (u.displayName ?? "").split(" ")[0];
const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0].toLocaleUpperCase("tr-TR")).join("");
const avatar = (name, photo) => photo
  ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`
  : esc(initials(name));

const pill = (status) => ({
  approved: `<span class="pill ok">${ICONS.check}${t("pill_present")}</span>`,
  pending: `<span class="pill wait">${ICONS.clock}${t("pill_pending")}</span>`,
  rejected: `<span class="pill no">${ICONS.x}${t("pill_rejected")}</span>`,
})[status];

let unsubs = [];
function clearSubs() { unsubs.forEach((u) => u()); unsubs = []; }

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

// ---------- Ekranlar ve alt menü ----------

const SCREENS = ["loading", "login", "s-home", "s-history", "t-home", "profile"];
let tabs = [];
let rerender = () => {}; // dil değişince açık ekranı yeniden çizer

function go(id) {
  for (const s of SCREENS) $("#" + s).hidden = s !== id;
  $("#tabbar").hidden = !tabs.some((tab) => tab.id === id);
  for (const b of document.querySelectorAll(".tab")) b.classList.toggle("active", b.dataset.go === id);
  window.scrollTo(0, 0);
}

function setTabs(list) {
  tabs = list;
  $("#tabbar").innerHTML = list.map((tab) =>
    `<button class="tab" data-go="${tab.id}">${ICONS[tab.icon]}<span>${t(tab.label)}</span></button>`).join("");
  for (const b of document.querySelectorAll(".tab")) b.classList.toggle("active", !$("#" + b.dataset.go).hidden);
}

document.addEventListener("click", (e) => {
  const l = e.target.closest("[data-lang]");
  if (l) {
    setLang(l.dataset.lang);
    setTabs(tabs);
    rerender();
    return;
  }
  const b = e.target.closest("[data-go]");
  if (b) go(b.dataset.go);
});

$("#loginBtn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
  .catch((e) => toast(t("login_error") + e.message));
$("#logout").onclick = () => { if (confirm(t("confirm_logout"))) signOut(auth); };

onAuthStateChanged(auth, async (user) => {
  clearSubs();
  rerender = () => {};
  $("#success").hidden = true;
  if (!user) {
    setTabs([]);
    go("login");
    return;
  }
  go("loading");
  const isTeacher = (await getDoc(doc(db, "teachers", user.uid))).exists();
  fillProfile(user, isTeacher);
  isTeacher ? startTeacher(user) : startStudent(user);
});

function fillProfile(user, isTeacher) {
  $("#pAvatar").innerHTML = avatar(user.displayName, user.photoURL);
  $("#pName").textContent = user.displayName || "—";
  $("#pEmail").textContent = user.email || "";
  $("#pRole").textContent = t(isTeacher ? "role_teacher" : "role_student");
  $("#pStatRow").hidden = isTeacher;
}

function greeting() {
  const h = Number(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", timeZone: TZ }));
  return t(h < 12 ? "morning" : h < 18 ? "day" : "evening");
}

const hello = (name, key = "hello") => t(name ? key : "hello_noname", { g: greeting(), name });

function setLive(el, session) {
  const closed = session?.open === false;
  el.textContent = t(closed ? "closed" : "live");
  el.classList.toggle("closed", closed);
}

// ---------- Öğrenci ----------

function startStudent(user) {
  setTabs([
    { id: "s-home", label: "tab_home", icon: "home" },
    { id: "s-history", label: "tab_history", icon: "history" },
    { id: "profile", label: "profile", icon: "user" },
  ]);
  go("s-home");

  const btn = $("#checkin");
  const status = $("#sStatus");
  const name = firstName(user);

  const tick = () => {
    $("#sHello").textContent = hello(name);
    $("#sClock").textContent = nowHM();
  };
  tick();
  const timer = setInterval(tick, 1000);
  unsubs.push(() => clearInterval(timer));

  let date, session, record, loaded, celebrate = false, history = [];

  const setStatus = (kind, icon, title, text) => {
    btn.hidden = true;
    status.hidden = false;
    status.className = `status-card ${kind}`;
    $("#sStatusIcon").innerHTML = ICONS[icon];
    $("#sStatusTitle").textContent = title;
    $("#sStatusText").textContent = text;
  };

  const render = () => {
    $("#sDate").textContent = prettyDate(date);
    setLive($("#sLive"), session);
    const [word, tr, example] = wordOfTheDay(date);
    $("#wotd").innerHTML = `
      <div class="wotd-badge">WORD<br>OF THE<br>DAY</div>
      <div>
        <div class="wotd-word">${esc(word)} <span>· ${esc(tr)}</span></div>
        <div class="wotd-ex">“${esc(example)}”</div>
      </div>`;

    if (loaded < 2) { btn.hidden = true; status.hidden = true; return; }
    const time = record ? fmtTime(record.checkedInAt) : "";
    if (record?.status === "approved") {
      setStatus("approved", "check", t("st_approved_t"), t("st_approved", { time }));
    } else if (record?.status === "rejected") {
      setStatus("rejected", "x", t("st_rejected_t"), t("st_rejected", { time }));
    } else if (record) {
      setStatus("pending", "clock", t("st_pending_t"), t("st_pending", { time }));
    } else if (session?.open === false) {
      setStatus("closed", "x", t("st_closed_t"), t("st_closed"));
    } else {
      status.hidden = true;
      btn.hidden = false;
      btn.disabled = false;
    }

    if (celebrate && record?.checkedInAt) {
      celebrate = false;
      $("#successTime").textContent = fmtStamp(record.checkedInAt);
      $("#success").hidden = false;
    }
  };

  const watch = () => {
    for (const u of unsubs.splice(1)) u(); // saat dışındaki dinleyicileri kapat
    date = today();
    session = record = null;
    loaded = 0;
    unsubs.push(onSnapshot(doc(db, "sessions", date), (s) => {
      session = s.data() ?? null; loaded++; render();
    }, (e) => toast(e.message)));
    unsubs.push(onSnapshot(doc(db, "attendance", `${date}_${user.uid}`), (s) => {
      record = s.exists() ? s.data() : null; loaded++; render();
    }, (e) => toast(e.message)));
    unsubs.push(onSnapshot(query(collection(db, "attendance"), where("uid", "==", user.uid), limit(60)),
      (snap) => { history = snap.docs.map((d) => d.data()); renderHistory(history); },
      (e) => toast(e.message)));
    render();
  };
  watch();
  rerender = () => { tick(); render(); renderHistory(history); };

  btn.onclick = async () => {
    if (date !== today()) { watch(); return; } // sayfa gece açık kaldıysa
    btn.disabled = true;
    navigator.vibrate?.(30);
    try {
      celebrate = true;
      await setDoc(doc(db, "attendance", `${date}_${user.uid}`), {
        uid: user.uid,
        name: user.displayName ?? "",
        email: user.email ?? "",
        photo: user.photoURL ?? "",
        date,
        checkedInAt: serverTimestamp(),
        status: "pending",
      });
      render();
    } catch {
      celebrate = false;
      toast(t("checkin_error"));
      render();
    }
  };

  const closeSuccess = () => { $("#success").hidden = true; };
  $("#successOk").onclick = closeSuccess;
  $("#successClose").onclick = closeSuccess;
}

function renderHistory(items) {
  items.sort((a, b) => b.date.localeCompare(a.date));
  const n = (s) => items.filter((r) => r.status === s).length;
  $("#hOk").textContent = n("approved");
  $("#hWait").textContent = n("pending");
  $("#hNo").textContent = n("rejected");
  $("#pStat").textContent = t(n("approved") === 1 ? "day_one" : "days", { n: n("approved") });

  $("#hList").innerHTML = items.length === 0
    ? `<li class="empty">${t("history_empty")}</li>`
    : items.map((r) => {
        const d = asDate(r.date);
        return `
        <li>
          <span class="datebox"><b>${d.getDate()}</b><small>${d.toLocaleDateString(locale(), { month: "short" })}</small></span>
          <div class="who">
            <div class="name">${d.toLocaleDateString(locale(), { weekday: "long" })}</div>
            <div class="time">${t("checked_in_at", { time: fmtTime(r.checkedInAt) })}</div>
          </div>
          ${pill(r.status)}
        </li>`;
      }).join("");
}

// ---------- Hoca ----------

function startTeacher(user) {
  setTabs([
    { id: "t-home", label: "tab_attendance", icon: "list" },
    { id: "profile", label: "profile", icon: "user" },
  ]);
  go("t-home");

  const list = $("#tList");
  const search = $("#search");
  const name = firstName(user);

  let date, session, rows = [];
  const seen = new Set();

  const render = () => {
    $("#tHello").textContent = hello(name, "hello_teacher");
    $("#tDate").textContent = prettyDate(date);
    setLive($("#tLive"), session);

    const n = (s) => rows.filter((r) => r.status === s).length;
    $("#nOk").textContent = n("approved");
    $("#nWait").textContent = n("pending");
    $("#nAll").textContent = rows.length;

    const approveAll = $("#approveAll");
    approveAll.disabled = n("pending") === 0;
    approveAll.textContent = n("pending") ? t("approve_all_n", { n: n("pending") }) : t("approve_all");

    const closed = session?.open === false;
    const toggle = $("#toggleSession");
    toggle.textContent = t(closed ? "reopen" : "close");
    toggle.classList.toggle("danger", !closed);

    const q = search.value.trim().toLocaleLowerCase("tr-TR");
    const shown = q ? rows.filter((r) => (r.name || r.email).toLocaleLowerCase("tr-TR").includes(q)) : rows;

    list.innerHTML = rows.length === 0
      ? `<li class="empty">${t("t_empty")}</li>`
      : shown.length === 0
        ? `<li class="empty">${t("t_noresult")}</li>`
        : shown.map((r) => {
            const isNew = !seen.has(r.id);
            seen.add(r.id);
            const right = r.status === "pending"
              ? `<div class="acts">
                   <button class="act no" data-id="${esc(r.id)}" data-act="rejected" aria-label="${t("reject")}">${ICONS.x}</button>
                   <button class="act ok" data-id="${esc(r.id)}" data-act="approved" aria-label="${t("approve")}">${ICONS.check}</button>
                 </div>`
              : `<div class="acts">${pill(r.status)}
                   <button class="act undo" data-id="${esc(r.id)}" data-act="pending" aria-label="${t("undo")}">${ICONS.undo}</button>
                 </div>`;
            return `
            <li class="${isNew ? "new" : ""}">
              <span class="avatar">${avatar(r.name || r.email, r.photo)}</span>
              <div class="who">
                <div class="name">${esc(r.name || r.email)}</div>
                <div class="time">${fmtTime(r.checkedInAt)}</div>
              </div>
              ${right}
            </li>`;
          }).join("");
  };

  const watch = () => {
    clearSubs();
    date = today();
    session = null;
    rows = [];
    unsubs.push(onSnapshot(doc(db, "sessions", date), (s) => {
      session = s.data() ?? null; render();
    }, (e) => toast(e.message)));
    const q = query(collection(db, "attendance"), where("date", "==", date));
    unsubs.push(onSnapshot(q, (snap) => {
      rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.checkedInAt?.toMillis() ?? Infinity) - (b.checkedInAt?.toMillis() ?? Infinity));
      render();
    }, (e) => toast(e.message)));
    render();
  };
  watch();
  search.oninput = render;
  rerender = render;

  const decide = (id, status) => updateDoc(doc(db, "attendance", id), {
    status, decidedAt: serverTimestamp(), decidedBy: user.uid,
  });

  list.onclick = (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    navigator.vibrate?.(15);
    decide(b.dataset.id, b.dataset.act).catch((err) => toast(err.message));
  };

  $("#approveAll").onclick = async () => {
    const batch = writeBatch(db);
    for (const r of rows.filter((r) => r.status === "pending")) {
      batch.update(doc(db, "attendance", r.id), {
        status: "approved", decidedAt: serverTimestamp(), decidedBy: user.uid,
      });
    }
    await batch.commit().catch((err) => toast(err.message));
  };

  $("#toggleSession").onclick = async () => {
    const closing = session?.open !== false;
    if (closing && !confirm(t("confirm_close"))) return;
    await setDoc(doc(db, "sessions", date), {
      open: !closing, date, updatedAt: serverTimestamp(), updatedBy: user.uid,
    }, { merge: true }).catch((err) => toast(err.message));
  };
}
