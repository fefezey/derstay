import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, limit,
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
  speaker: svg(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`),
  camera: svg(`<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>`),
  mail: svg(`<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>`),
  back: svg(`<path d="M19 12H5M11 18l-6-6 6-6"/>`),
  plus: svg(`<path d="M12 5v14M5 12h14"/>`, 2.6),
  edit: svg(`<path d="M4 20h4L19 9l-4-4L4 16z"/>`),
  trash: svg(`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`),
  book: svg(`<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>`),
  chevron: svg(`<path d="M9 6l6 6-6 6"/>`),
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
const EARLY = 15; // yoklama ders başlamadan kaç dakika önce açılır (kurallarla aynı)
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const nowDow = () => DOW[new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })];
const nowMin = () => {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: TZ }).split(":").map(Number);
  return h * 60 + m;
};
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (v) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; };
// 1 = Pazartesi … 7 = Pazar (1 Ocak 2024 Pazartesi)
const dayName = (d, weekday = "long") => new Date(2024, 0, d).toLocaleDateString(locale(), { weekday });
const lessonTime = (l) => `${fmtMin(l.startMin)} – ${fmtMin(l.endMin)}`;

let lessons = []; // tüm dersler (canlı)
const todaysLessons = () => lessons.filter((l) => l.days.includes(nowDow())).sort((a, b) => a.startMin - b.startMin);
function lessonState(l) {
  if (!l.days.includes(nowDow())) return "off";
  const m = nowMin();
  if (m < l.startMin - EARLY) return "upcoming";
  if (m > l.endMin) return "done";
  return "live";
}
const activeLesson = () => todaysLessons().find((l) => lessonState(l) === "live") ?? null;

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

const SCREENS = ["loading", "login", "auth", "verify", "s-home", "s-history", "lessons", "t-today", "t-home", "lesson-form", "profile"];
let tabs = [];
let me = null, meIsTeacher = false, myPhoto = null, profileUnsub = null;
let rerender = () => {}; // dil değişince açık ekranı yeniden çizer
let onLessons = () => {}; // dersler değişince açık ekranları yeniden çizer
let lessonsUnsub = null;
let current = null;

function go(id) {
  if (id === "t-home" && current !== "t-home" && !pickLesson()) return; // gösterilecek ders yoksa
  current = id;
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
    renderPhoto();
    if (!$("#wordModal").hidden) fillWord();
    if (current === "auth") renderAuth();
    if (current === "verify") $("#verifyText").innerHTML = t("verify_text", { email: esc(me?.email ?? "") });
    rerender();
    return;
  }
  const b = e.target.closest("[data-go]");
  if (b) go(b.dataset.go);
});

$("#loginBtn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
  .catch((e) => toast(authError(e)));
$("#emailBtn").onclick = () => openAuth("email");
$("#signupLink").onclick = () => openAuth("signup");
$("#authBack").onclick = () => go("login");
$("#lightbox").onclick = () => { $("#lightbox").hidden = true; };
$("#logout").onclick = () => { if (confirm(t("confirm_logout"))) logout(); };

// Önce dinleyicileri kapat, yoksa çıkış anında "izin yok" hatası görünür
function logout() {
  clearSubs();
  profileUnsub?.();
  lessonsUnsub?.();
  profileUnsub = lessonsUnsub = null;
  signOut(auth);
}

onAuthStateChanged(auth, (user) => handleUser(user));

let authSeq = 0;
async function handleUser(user) {
  const seq = ++authSeq;
  clearSubs();
  profileUnsub?.();
  lessonsUnsub?.();
  profileUnsub = lessonsUnsub = null;
  rerender = () => {};
  onLessons = () => {};
  me = user;
  myPhoto = null;
  $("#success").hidden = true;
  if (!user) {
    setTabs([]);
    go("login");
    return;
  }
  // E-posta ile kayıt olanlar önce e-postalarını doğrulamalı
  if (user.providerData.some((p) => p.providerId === "password") && !user.emailVerified) {
    setTabs([]);
    $("#verifyText").innerHTML = t("verify_text", { email: esc(user.email) });
    go("verify");
    return;
  }
  go("loading");
  meIsTeacher = (await getDoc(doc(db, "teachers", user.uid))).exists();
  if (seq !== authSeq) return;
  fillProfile(user, meIsTeacher);
  profileUnsub = onSnapshot(doc(db, "profiles", user.uid), (s) => {
    myPhoto = s.data()?.photo ?? "";
    renderPhoto();
  }, (e) => toast(e.message));

  let first = true;
  lessonsUnsub = onSnapshot(collection(db, "lessons"), (snap) => {
    lessons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (first) {
      first = false;
      meIsTeacher ? startTeacher(user) : startStudent(user);
      if (!wordShown) { wordShown = true; openWord(); } // uygulama her açıldığında günün kelimesi
    } else {
      onLessons();
    }
  }, (e) => toast(e.message));
}

// ---------- E-posta ile giriş ----------

const AUTH_ERRORS = {
  "auth/invalid-credential": "err_invalid", "auth/wrong-password": "err_invalid", "auth/user-not-found": "err_invalid",
  "auth/email-already-in-use": "err_exists", "auth/weak-password": "err_weak", "auth/invalid-email": "err_email",
  "auth/too-many-requests": "err_many",
};
const authError = (e) => (AUTH_ERRORS[e.code] ? t(AUTH_ERRORS[e.code]) : t("login_error") + e.message);

let authMode = "email";
function openAuth(mode) {
  authMode = mode;
  renderAuth();
  go("auth");
}

function renderAuth() {
  const field = (name, type, label, extra = "") =>
    `<label><span>${t(label)}</span><input name="${name}" type="${type}" required ${extra}></label>`;
  const forms = {
    email: `
      <h2>${t("email_title")}</h2>
      <form class="form">
        ${field("email", "email", "email", `autocomplete="email"`)}
        ${field("password", "password", "password", `autocomplete="current-password"`)}
        <button class="btn btn-yellow btn-lg" type="submit">${t("login_submit")}</button>
      </form>
      <p class="center"><button class="link" data-auth="reset">${t("forgot")}</button></p>
      <p class="center small"><span class="muted">${t("no_account")}</span> <button class="link" data-auth="signup">${t("signup")}</button></p>`,
    signup: `
      <h2>${t("signup_title")}</h2>
      <p class="muted">${t("signup_desc")}</p>
      <form class="form">
        ${field("name", "text", "full_name", `autocomplete="name" minlength="3" maxlength="60"`)}
        ${field("email", "email", "email", `autocomplete="email"`)}
        ${field("password", "password", "password", `autocomplete="new-password" minlength="6" placeholder="${esc(t("pw_ph"))}"`)}
        <button class="btn btn-yellow btn-lg" type="submit">${t("signup")}</button>
      </form>
      <p class="center small"><span class="muted">${t("have_account")}</span> <button class="link" data-auth="email">${t("login_link")}</button></p>`,
    reset: `
      <h2>${t("reset_title")}</h2>
      <p class="muted">${t("reset_desc")}</p>
      <form class="form">
        ${field("email", "email", "email", `autocomplete="email"`)}
        <button class="btn btn-yellow btn-lg" type="submit">${t("reset_submit")}</button>
      </form>`,
  };
  const body = $("#authBody");
  body.innerHTML = forms[authMode];
  body.querySelectorAll("[data-auth]").forEach((b) => (b.onclick = () => openAuth(b.dataset.auth)));
  const form = body.querySelector("form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      if (authMode === "email") {
        await signInWithEmailAndPassword(auth, f.email.trim(), f.password);
      } else if (authMode === "signup") {
        const { user } = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
        await updateProfile(user, { displayName: f.name.trim().replace(/\s+/g, " ") });
        await sendEmailVerification(user);
        handleUser(user);
      } else {
        await sendPasswordResetEmail(auth, f.email.trim());
        toast(t("reset_sent"));
        openAuth("email");
      }
    } catch (err) {
      toast(authError(err));
    } finally {
      btn.disabled = false;
    }
  };
}

$("#verifyDone").onclick = async () => {
  const user = auth.currentUser;
  await user.reload();
  if (!user.emailVerified) return toast(t("verify_not_yet"));
  await user.getIdToken(true); // isim ve doğrulama bilgisi jetona girsin
  handleUser(user);
};
$("#verifyAgain").onclick = () => sendEmailVerification(auth.currentUser)
  .then(() => toast(t("verify_sent")))
  .catch((e) => toast(authError(e)));
$("#verifyOut").onclick = logout;

// ---------- Günün kelimesi ----------

let wordShown = false;

function fillWord() {
  const w = wordOfTheDay(today());
  $("#wmDate").textContent = prettyDate(today());
  $("#wmWord").textContent = w.word;
  $("#wmType").textContent = t("type_" + w.type);
  $("#wmTr").textContent = w.tr;
  $("#wmEx").textContent = `“${w.example}”`;
  $("#wmExTr").textContent = w.exampleTr;
  return w;
}

function openWord() {
  fillWord();
  $("#wmSpeak").hidden = !("speechSynthesis" in window);
  $("#wordModal").hidden = false;
}

// Telefonun kendi sesiyle İngiliz aksanında okur
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  u.rate = 0.9;
  const voice = speechSynthesis.getVoices().find((v) => v.lang === "en-GB" || v.lang === "en_GB");
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

$("#wmSpeak").onclick = () => {
  const w = wordOfTheDay(today());
  speak(`${w.word}. ${w.example}`);
};
$("#wmOk").onclick = () => { window.speechSynthesis?.cancel(); $("#wordModal").hidden = true; };
$("#wordModal").onclick = (e) => { if (e.target.id === "wordModal") $("#wmOk").click(); };
$("#wotd").onclick = openWord;

// ---------- Profil fotoğrafı ----------

function renderPhoto() {
  if (!me) return;
  $("#pAvatar").innerHTML = avatar(me.displayName, myPhoto || me.photoURL);
  const has = Boolean(myPhoto);
  $("#photoCard").classList.toggle("done", has);
  $("#photoTitle").textContent = t(has ? "photo_has_t" : "photo_none_t");
  $("#photoText").textContent = t(has ? "photo_has" : "photo_none");
  $("#photoPick").textContent = t(has ? "photo_change" : "photo_add");
  $("#photoRemove").hidden = !has;
  $("#photoNudge").hidden = meIsTeacher || myPhoto !== "";
}

// Fotoğrafı ortadan kare kırpıp 320px JPEG'e küçültür (~30 KB)
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 320;
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(img,
        (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      let quality = 0.82, data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 190000 && quality > 0.3) data = canvas.toDataURL("image/jpeg", (quality -= 0.15));
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

$("#photoPick").onclick = () => $("#photoInput").click();
$("#photoInput").onchange = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file || !me) return;
  toast(t("photo_saving"));
  try {
    const photo = await shrinkPhoto(file);
    await setDoc(doc(db, "profiles", me.uid), { photo, updatedAt: serverTimestamp() });
    toast(t("photo_saved"));
  } catch {
    toast(t("photo_error"));
  }
};
$("#photoRemove").onclick = async () => {
  if (!me || !confirm(t("photo_confirm_remove"))) return;
  await deleteDoc(doc(db, "profiles", me.uid)).catch((err) => toast(err.message));
};

function fillProfile(user, isTeacher) {
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
    { id: "lessons", label: "tab_lessons", icon: "calendar" },
    { id: "s-history", label: "tab_history", icon: "history" },
    { id: "profile", label: "profile", icon: "user" },
  ]);
  go("s-home");

  const btn = $("#checkin");
  const status = $("#sStatus");
  const name = firstName(user);

  let date, active, session, record, loaded, celebrate = false, history = [], lessonSubs = [];

  const tick = () => {
    $("#sHello").textContent = hello(name);
    const clock = $("#sClock");
    if (clock) clock.textContent = nowHM();
    // Ders başladıysa / bittiyse ya da gün değiştiyse yeniden bağlan
    if (date !== today() || (activeLesson()?.id ?? null) !== (active?.id ?? null)) watchLesson();
  };

  const setStatus = (kind, icon, title, text) => {
    btn.hidden = true;
    status.hidden = false;
    status.className = `status-card ${kind}`;
    $("#sStatusIcon").innerHTML = ICONS[icon];
    $("#sStatusTitle").textContent = title;
    $("#sStatusText").textContent = text;
  };

  const renderCard = () => {
    const next = todaysLessons().find((l) => lessonState(l) === "upcoming");
    const l = active ?? next;
    const card = $("#sLesson");
    card.classList.toggle("idle", !active);
    card.innerHTML = `
      <span class="icon-box">${ICONS[active ? "book" : "clock"]}</span>
      <div class="today-text">
        <small>${t(active ? "active_lesson" : next ? "next_lesson" : "today")}</small>
        <b>${l ? esc(l.name) : t("no_active")}</b>
        <span>${l ? `${lessonTime(l)} · ${esc(t("teacher_of", { name: l.teacherName }))}` : t("no_more_today")}</span>
        ${!active && next ? `<span>${t("opens_at", { time: fmtMin(Math.max(0, next.startMin - EARLY)) })}</span>` : ""}
      </div>
      <span id="sClock" class="today-clock">${nowHM()}</span>`;
  };

  const render = () => {
    setLive($("#sLive"), active ? session : { open: false });
    $("#sLive").hidden = !active;
    renderCard();
    const w = wordOfTheDay(date);
    $("#wotd").innerHTML = `
      <div class="wotd-badge">${t("wotd_badge")}</div>
      <div>
        <div class="wotd-word">${esc(w.word)} <span>· ${esc(w.tr)}</span></div>
        <div class="wotd-ex">“${esc(w.example)}”</div>
      </div>
      <span class="wotd-more">›</span>`;

    if (!active) {
      setStatus("closed", "clock", t("st_wait_t"), t("st_wait"));
      return;
    }
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

  // Aktif dersin yoklama oturumunu ve öğrencinin kaydını dinle
  function watchLesson() {
    lessonSubs.forEach((u) => u());
    lessonSubs = [];
    date = today();
    active = activeLesson();
    session = record = null;
    loaded = 0;
    if (active) {
      const key = `${date}_${active.id}`;
      lessonSubs.push(onSnapshot(doc(db, "sessions", key), (s) => {
        session = s.data() ?? null; loaded++; render();
      }, (e) => toast(e.message)));
      lessonSubs.push(onSnapshot(doc(db, "attendance", `${key}_${user.uid}`), (s) => {
        record = s.exists() ? s.data() : null; loaded++; render();
      }, (e) => toast(e.message)));
    }
    render();
  }
  unsubs.push(() => lessonSubs.forEach((u) => u()));

  unsubs.push(onSnapshot(query(collection(db, "attendance"), where("uid", "==", user.uid), limit(60)),
    (snap) => { history = snap.docs.map((d) => d.data()); renderHistory(history); },
    (e) => toast(e.message)));

  watchLesson();
  tick();
  const timer = setInterval(tick, 1000);
  unsubs.push(() => clearInterval(timer));

  onLessons = () => { watchLesson(); renderLessons(); };
  rerender = () => { tick(); render(); renderHistory(history); renderLessons(); };
  renderLessons();

  btn.onclick = async () => {
    const lesson = activeLesson();
    if (date !== today() || lesson?.id !== active?.id) { watchLesson(); return; } // ders/gün değiştiyse
    btn.disabled = true;
    navigator.vibrate?.(30);
    try {
      celebrate = true;
      await setDoc(doc(db, "attendance", `${date}_${lesson.id}_${user.uid}`), {
        uid: user.uid,
        name: user.displayName ?? "",
        email: user.email ?? "",
        photo: user.photoURL ?? "",
        date,
        lessonId: lesson.id,
        lessonName: lesson.name,
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
  items.sort((a, b) => b.date.localeCompare(a.date)
    || (b.checkedInAt?.toMillis() ?? 0) - (a.checkedInAt?.toMillis() ?? 0));
  const n = (s) => items.filter((r) => r.status === s).length;
  $("#hOk").textContent = n("approved");
  $("#hWait").textContent = n("pending");
  $("#hNo").textContent = n("rejected");
  $("#pStat").textContent = t(n("approved") === 1 ? "day_one" : "days", { n: n("approved") });

  $("#hList").innerHTML = items.length === 0
    ? `<li class="empty">${t("history_empty")}</li>`
    : items.map((r) => {
        const d = asDate(r.date);
        const weekday = d.toLocaleDateString(locale(), { weekday: "long" });
        return `
        <li>
          <span class="datebox"><b>${d.getDate()}</b><small>${d.toLocaleDateString(locale(), { month: "short" })}</small></span>
          <div class="who">
            <div class="name">${esc(r.lessonName || weekday)}</div>
            <div class="time">${r.lessonName ? weekday + " · " : ""}${t("checked_in_at", { time: fmtTime(r.checkedInAt) })}</div>
          </div>
          ${pill(r.status)}
        </li>`;
      }).join("");
}

// ---------- Ders programı (öğrenci ve hoca) ----------

function renderLessons() {
  $("#addLesson").hidden = !meIsTeacher;
  $("#lToday").textContent = prettyDate(today());
  const badge = { live: "b_live", upcoming: "b_upcoming", done: "b_done" };
  const today_ = todaysLessons();
  $("#lTodayList").innerHTML = today_.length
    ? today_.map((l) => {
        const st = lessonState(l);
        return `
        <button class="lesson-row s-${st}" data-lesson="${esc(l.id)}">
          <span class="icon-box ${st === "live" ? "" : "grey"}">${ICONS.book}</span>
          <span class="lr-text"><b>${esc(l.name)}</b><span>${lessonTime(l)} · ${esc(l.teacherName)}</span>
            <span class="days">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<i class="${l.days.includes(d) ? "on" : ""}">${dayName(d, "short")}</i>`).join("")}</span></span>
          <em class="badge s-${st}">${t(badge[st])}</em>
        </button>`;
      }).join("")
    : `<p class="muted small pad">${t("no_lessons_today")}</p>`;

  $("#lWeek").innerHTML = lessons.length
    ? [1, 2, 3, 4, 5, 6, 7].map((d) => {
        const ls = lessons.filter((l) => l.days.includes(d)).sort((a, b) => a.startMin - b.startMin);
        if (!ls.length) return "";
        return `<div class="day-group${d === nowDow() ? " is-today" : ""}"><h4>${dayName(d)}</h4>${ls.map((l) => `
          <button class="mini-row" data-lesson="${esc(l.id)}"><b>${fmtMin(l.startMin)}</b><span>${esc(l.name)}</span><small>${fmtMin(l.endMin)}</small></button>`).join("")}</div>`;
      }).join("")
    : `<div class="card empty-card"><span class="big-icon">${ICONS.calendar}</span><b>${t("no_lessons_t")}</b>
       <p>${t(meIsTeacher ? "no_lessons_teacher" : "no_lessons_student")}</p></div>`;

  // Hoca derse dokununca ders detayı açılır
  if (meIsTeacher) for (const b of document.querySelectorAll("#lessons [data-lesson]")) b.onclick = () => openLesson(b.dataset.lesson);
  $("#lessons").classList.toggle("readonly", !meIsTeacher);
}

// ---------- Hoca ----------

let detailId = null;
let openLesson = () => {};
const pickLesson = () => {
  if (!meIsTeacher) return null;
  if (detailId && lessons.some((l) => l.id === detailId)) return detailId;
  const today_ = todaysLessons();
  const l = activeLesson() ?? today_.find((x) => lessonState(x) === "upcoming") ?? today_.at(-1);
  if (l) { openLesson(l.id, false); return l.id; }
  toast(t("no_today_t"));
  return null;
};

function startTeacher(user) {
  setTabs([
    { id: "t-today", label: "tab_home", icon: "home" },
    { id: "lessons", label: "tab_lessons", icon: "calendar" },
    { id: "t-home", label: "tab_attendance", icon: "list" },
    { id: "profile", label: "profile", icon: "user" },
  ]);
  detailId = null;
  go("t-today");

  const list = $("#tList");
  const search = $("#search");
  const name = firstName(user);

  let date, session, rows = [], detailSubs = [];
  const seen = new Set();
  const photos = new Map(); // uid → öğrencinin yüklediği fotoğraf ("" = yok)
  unsubs.push(() => detailSubs.forEach((u) => u()));

  const renderToday = () => {
    $("#tHello").textContent = hello(name, "hello_teacher");
    const today_ = todaysLessons();
    const label = { live: "st_live_l", upcoming: "st_upcoming_l", done: "st_done_l" };
    $("#tTodayList").innerHTML = today_.length
      ? today_.map((l) => {
          const st = lessonState(l);
          return `
          <button class="lesson-row s-${st}" data-lesson="${esc(l.id)}">
            <span class="icon-box ${st === "live" ? "" : "grey"}">${ICONS.clock}</span>
            <span class="lr-text"><b>${esc(l.name)}</b><span>${lessonTime(l)}</span><em class="st s-${st}">${t(label[st])}</em></span>
            <span class="chev">${ICONS.chevron}</span>
          </button>`;
        }).join("")
      : `<div class="empty-card"><span class="big-icon">${ICONS.calendar}</span><b>${t("no_today_t")}</b>
         <p>${t("no_today")}</p><button id="addFirst" class="btn btn-yellow">${ICONS.plus}${t("add_lesson")}</button></div>`;
    for (const b of document.querySelectorAll("#tTodayList [data-lesson]")) b.onclick = () => openLesson(b.dataset.lesson);
    $("#addFirst")?.addEventListener("click", () => openForm());
  };

  const loadPhotos = () => {
    for (const r of rows) {
      if (!r.uid || photos.has(r.uid)) continue;
      photos.set(r.uid, "");
      getDoc(doc(db, "profiles", r.uid))
        .then((s) => { if (s.data()?.photo) { photos.set(r.uid, s.data().photo); renderList(); } })
        .catch(() => {});
    }
  };

  const lesson = () => lessons.find((l) => l.id === detailId);

  const renderHead = () => {
    const l = lesson();
    if (!l) return;
    const live = lessonState(l) === "live";
    $("#tLive").hidden = !live;
    setLive($("#tLive"), session);
    $("#tDate").textContent = prettyDate(date);
    $("#tLessonCard").innerHTML = `
      <span class="icon-box black">${ICONS.calendar}</span>
      <div><b>${esc(l.name)}</b><span>${lessonTime(l)}</span><span>${esc(t("teacher_of", { name: l.teacherName }))}</span></div>`;
    $("#segInfo").innerHTML = `
      <div class="card info-list">
        <div><span>${ICONS.clock}</span><small>${t("i_time")}</small><b>${lessonTime(l)}</b></div>
        <div><span>${ICONS.calendar}</span><small>${t("i_days")}</small><b>${l.days.map((d) => dayName(d)).join(", ")}</b></div>
        <div><span>${ICONS.user}</span><small>${t("i_teacher")}</small><b>${esc(l.teacherName)}</b></div>
        <div><span>${ICONS.list}</span><small>${t("i_window")}</small><b>${t("i_window_val", { a: fmtMin(Math.max(0, l.startMin - EARLY)), b: fmtMin(l.endMin) })}</b></div>
      </div>
      <div class="row-btns">
        <button id="editLesson" class="btn btn-outline">${ICONS.edit}${t("edit")}</button>
        <button id="delLesson" class="btn btn-outline danger">${ICONS.trash}${t("delete")}</button>
      </div>`;
    $("#editLesson").onclick = () => openForm(l.id);
    $("#delLesson").onclick = async () => {
      if (!confirm(t("confirm_delete", { name: l.name }))) return;
      await deleteDoc(doc(db, "lessons", l.id)).catch((e) => toast(e.message));
    };
  };

  const renderList = () => {
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
              <span class="avatar">${avatar(r.name || r.email, photos.get(r.uid) || r.photo)}</span>
              <div class="who">
                <div class="name">${esc(r.name || r.email)}</div>
                <div class="time">${fmtTime(r.checkedInAt)}</div>
              </div>
              ${right}
            </li>`;
          }).join("");
  };

  // Ders detayını aç: o dersin bugünkü yoklamasını dinle
  openLesson = (id, show = true) => {
    if (id !== detailId || date !== today()) {
      detailSubs.forEach((u) => u());
      detailSubs = [];
      detailId = id;
      date = today();
      session = null;
      rows = [];
      search.value = "";
      const key = `${date}_${id}`;
      detailSubs.push(onSnapshot(doc(db, "sessions", key), (s) => {
        session = s.data() ?? null; renderHead(); renderList();
      }, (e) => toast(e.message)));
      detailSubs.push(onSnapshot(query(collection(db, "attendance"), where("date", "==", date), where("lessonId", "==", id)), (snap) => {
        rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.checkedInAt?.toMillis() ?? Infinity) - (b.checkedInAt?.toMillis() ?? Infinity));
        loadPhotos();
        renderList();
      }, (e) => toast(e.message)));
    }
    setSeg("list");
    renderHead();
    renderList();
    if (show) go("t-home");
  };

  const setSeg = (k) => {
    for (const b of document.querySelectorAll("[data-seg]")) b.classList.toggle("on", b.dataset.seg === k);
    $("#segList").hidden = k !== "list";
    $("#segInfo").hidden = k !== "info";
  };
  for (const b of document.querySelectorAll("[data-seg]")) b.onclick = () => setSeg(b.dataset.seg);

  search.oninput = renderList;
  $("#addLesson").onclick = () => openForm();

  const tick = () => {
    renderToday();
    if (current === "lessons") renderLessons();
    if (detailId) renderHead();
  };
  const timer = setInterval(tick, 20000);
  unsubs.push(() => clearInterval(timer));

  onLessons = () => {
    renderToday();
    renderLessons();
    if (detailId && !lesson()) {
      detailSubs.forEach((u) => u());
      detailSubs = [];
      detailId = null;
      if (current === "t-home") go("lessons");
    } else if (detailId) {
      renderHead();
    }
  };
  rerender = () => { renderToday(); renderLessons(); if (detailId) { renderHead(); renderList(); } renderFormText(); };
  renderToday();
  renderLessons();

  const decide = (id, status) => updateDoc(doc(db, "attendance", id), {
    status, decidedAt: serverTimestamp(), decidedBy: user.uid,
  });

  list.onclick = (e) => {
    const img = e.target.closest(".avatar img");
    if (img) {
      $("#lightboxImg").src = img.src;
      $("#lightboxName").textContent = img.closest("li").querySelector(".name").textContent;
      $("#lightbox").hidden = false;
      return;
    }
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
    await setDoc(doc(db, "sessions", `${date}_${detailId}`), {
      open: !closing, date, lessonId: detailId, updatedAt: serverTimestamp(), updatedBy: user.uid,
    }, { merge: true }).catch((err) => toast(err.message));
  };
}

// ---------- Ders formu (hoca) ----------

let formId = null, formBack = "lessons";

function renderFormText() {
  const l = lessons.find((x) => x.id === formId);
  $("#formTitle").textContent = t(l ? "f_edit" : "f_new");
  $("#formSave").textContent = t(l ? "f_save" : "f_add");
  for (const sp of document.querySelectorAll("#dayPick [data-day]")) sp.textContent = dayName(Number(sp.dataset.day), "short");
}

function openForm(id = null) {
  const l = lessons.find((x) => x.id === id);
  formId = l ? id : null;
  formBack = current;
  const f = $("#lessonForm");
  f.name.value = l?.name ?? "";
  f.start.value = l ? fmtMin(l.startMin) : "10:00";
  f.end.value = l ? fmtMin(l.endMin) : "11:30";
  $("#dayPick").innerHTML = [1, 2, 3, 4, 5, 6, 7].map((d) =>
    `<label><input type="checkbox" name="days" value="${d}" ${l?.days.includes(d) ? "checked" : ""}><span data-day="${d}"></span></label>`).join("");
  renderFormText();
  go("lesson-form");
}

$("#formBack").onclick = () => go(formBack);
$("#lessonForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const days = fd.getAll("days").map(Number);
  const startMin = toMin(fd.get("start"));
  const endMin = toMin(fd.get("end"));
  if (!days.length) return toast(t("f_need_day"));
  if (endMin <= startMin) return toast(t("f_bad_time"));
  const l = lessons.find((x) => x.id === formId);
  const data = {
    name: fd.get("name").trim(),
    teacherId: l?.teacherId ?? me.uid,
    teacherName: l?.teacherName ?? firstName(me),
    days, startMin, endMin,
    updatedAt: serverTimestamp(),
  };
  const btn = $("#formSave");
  btn.disabled = true;
  try {
    if (l) {
      await updateDoc(doc(db, "lessons", l.id), data);
      openLesson(l.id);
    } else {
      const ref = await addDoc(collection(db, "lessons"), data);
      if (!lessons.some((x) => x.id === ref.id)) lessons.push({ id: ref.id, ...data }); // dinleyici gelmeden açabilmek için
      openLesson(ref.id);
    }
    toast(t("f_saved"));
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
};
