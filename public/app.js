import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where,
  serverTimestamp, writeBatch, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { I } from "./icons.js";

// Yerelde "npm run dev" ile denerken gerçek proje yerine emülatör kullanılır
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const fbApp = initializeApp(isLocal
  ? { ...firebaseConfig, apiKey: "demo-key", projectId: "demo-derstayim" }
  : firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

if (isLocal) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const $ = (s, root = document) => root.querySelector(s);
const app = $("#app");

// ---------- Yardımcılar ----------

const TZ = "Europe/Istanbul";
const DAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const DAY_LONG = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const EARLY = 15; // yoklama ders başlamadan kaç dakika önce açılır (kurallarla aynı)

// Türkiye saatine göre şu an (sunucu da aynısını kontrol eder)
function now() {
  const d = new Date();
  const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: TZ }).split(":").map(Number);
  return {
    date: d.toLocaleDateString("sv-SE", { timeZone: TZ }),
    dow: DOW[d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })],
    min: h * 60 + m,
    h,
  };
}

const prettyDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("tr-TR", {
  day: "numeric", month: "long", year: "numeric",
});
const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const fmtTime = (ts) => ts
  ? ts.toDate().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
  : "…";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const firstName = (u) => (u.displayName ?? "").split(" ")[0] || "";
const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0].toLocaleUpperCase("tr-TR")).join("");
const avatar = (name, photo, cls = "") => `<span class="avatar ${cls}">${photo
  ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`
  : esc(initials(name))}</span>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

const AUTH_ERRORS = {
  "auth/invalid-credential": "E-posta veya şifre hatalı.",
  "auth/wrong-password": "E-posta veya şifre hatalı.",
  "auth/user-not-found": "Bu e-posta ile kayıtlı hesap yok.",
  "auth/email-already-in-use": "Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.",
  "auth/weak-password": "Şifre en az 6 karakter olmalı.",
  "auth/invalid-email": "E-posta adresi geçersiz.",
  "auth/too-many-requests": "Çok fazla deneme yapıldı, biraz bekleyip tekrar dene.",
  "auth/popup-closed-by-user": "Giriş penceresi kapatıldı.",
};
const authError = (e) => AUTH_ERRORS[e.code] ?? "Bir sorun oluştu: " + e.message;

// ---------- Uygulama durumu ve gezinme ----------

const state = { user: null, role: null, lessons: [], screen: null };
let screenSubs = [];  // ekrandan çıkınca kapatılan dinleyiciler
let globalSubs = [];  // çıkış yapınca kapatılan dinleyiciler
let hooks = {};       // açık ekranın onLessons / onTick fonksiyonları

const SCREENS = {};

function go(name, params = {}, { replace = false } = {}) {
  screenSubs.forEach((u) => u());
  screenSubs = [];
  hooks = {};
  state.screen = name;
  const entry = { name, params };
  replace ? history.replaceState(entry, "") : history.pushState(entry, "");
  SCREENS[name](params);
  window.scrollTo(0, 0);
}

addEventListener("popstate", (e) => {
  if (!e.state || !state.user) return;
  screenSubs.forEach((u) => u());
  screenSubs = [];
  hooks = {};
  state.screen = e.state.name;
  SCREENS[e.state.name](e.state.params);
});

// Bugünkü dersler ve durumları
function todaysLessons() {
  const n = now();
  return state.lessons
    .filter((l) => l.days.includes(n.dow))
    .sort((a, b) => a.startMin - b.startMin);
}
function lessonState(l) {
  const n = now();
  if (!l.days.includes(n.dow)) return "off";
  if (n.min < l.startMin - EARLY) return "upcoming";
  if (n.min > l.endMin) return "done";
  return "live";
}
const activeLesson = () => todaysLessons().find((l) => lessonState(l) === "live");
const lessonTime = (l) => `${fmtMin(l.startMin)} - ${fmtMin(l.endMin)}`;

// ---------- Ortak parçalar ----------

const logo = (cls = "") => `<div class="logo ${cls}"><span>English</span><span>Time</span><i class="logo-mark"></i></div>`;

function tabbar(active) {
  const items = [
    ["home", I.home, "Ana Sayfa"],
    ["lessons", I.calendar, "Dersler"],
    ["attendance", I.checkCircle, "Yoklama"],
    ["profile", I.user, "Profil"],
  ];
  return `<nav class="tabbar">${items.map(([k, icon, label]) =>
    `<button class="tab${k === active ? " on" : ""}" data-tab="${k}">${icon}<span>${label}</span></button>`).join("")}</nav>`;
}

function shell({ header, body, tab, headerClass = "" }) {
  app.innerHTML = `
    <section class="screen">
      <header class="hdr ${headerClass}">${header}</header>
      <div class="sheet">${body}</div>
      ${tab ? tabbar(tab) : ""}
    </section>`;
  app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
  app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
  app.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => history.back()));
}

function openTab(tab) {
  if (tab === "attendance" && state.role === "teacher") {
    const today = todaysLessons();
    const pick = activeLesson() ?? today.find((l) => lessonState(l) === "upcoming") ?? today.at(-1);
    return pick ? go("lesson", { id: pick.id }) : go("lessons");
  }
  go(tab === "attendance" ? "history" : tab);
}

const topRow = () => `
  <div class="top-row">
    ${logo("logo-sm logo-inv")}
    <button class="top-avatar" data-go="profile" aria-label="Profil">${avatar(state.user.displayName || state.user.email, state.user.photoURL)}</button>
  </div>`;

const titleRow = (title, right = "", back = false) => `
  <div class="title-row">
    ${back ? `<button class="icon-btn" data-back aria-label="Geri">${I.back}</button>` : ""}
    <h1>${esc(title)}</h1>
    <span class="title-right">${right}</span>
  </div>`;

// ---------- Giriş ----------

SCREENS.login = ({ mode = "choose" } = {}) => {
  const forms = {
    choose: `
      <h1 class="welcome">Hoş Geldin!</h1>
      <p class="muted">Derstayım'a giriş yapmak için hesabını seç.</p>
      <button id="googleBtn" class="btn btn-yellow btn-lg">${I.google}<span>Google ile giriş yap</span></button>
      <button data-mode="email" class="btn btn-outline btn-lg">${I.mail}<span>E-posta ile giriş yap</span></button>
      <div class="or"><span>veya</span></div>
      <p class="center muted">Hesabın yok mu?<br><button class="link" data-mode="signup">Kayıt ol</button></p>`,
    email: `
      <h1 class="welcome">E-posta ile giriş</h1>
      <form id="form" class="form">
        <label>E-posta<input name="email" type="email" autocomplete="email" required></label>
        <label>Şifre<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn btn-yellow btn-lg" type="submit">Giriş yap</button>
      </form>
      <p class="center"><button class="link" data-mode="reset">Şifremi unuttum</button></p>
      <p class="center muted">Hesabın yok mu? <button class="link" data-mode="signup">Kayıt ol</button></p>`,
    signup: `
      <h1 class="welcome">Kayıt ol</h1>
      <p class="muted">Adını hocanın tanıyacağı şekilde yaz.</p>
      <form id="form" class="form">
        <label>Ad Soyad<input name="name" autocomplete="name" required minlength="3" maxlength="60"></label>
        <label>E-posta<input name="email" type="email" autocomplete="email" required></label>
        <label>Şifre<input name="password" type="password" autocomplete="new-password" required minlength="6" placeholder="En az 6 karakter"></label>
        <button class="btn btn-yellow btn-lg" type="submit">Kayıt ol</button>
      </form>
      <p class="center muted">Zaten hesabın var mı? <button class="link" data-mode="email">Giriş yap</button></p>`,
    reset: `
      <h1 class="welcome">Şifreni sıfırla</h1>
      <p class="muted">E-posta adresine bir sıfırlama bağlantısı gönderelim.</p>
      <form id="form" class="form">
        <label>E-posta<input name="email" type="email" autocomplete="email" required></label>
        <button class="btn btn-yellow btn-lg" type="submit">Bağlantı gönder</button>
      </form>`,
  };

  app.innerHTML = `
    <section class="login">
      ${mode !== "choose" ? `<button class="icon-btn login-back" data-mode="choose" aria-label="Geri">${I.back}</button>` : ""}
      ${logo("logo-md")}
      <div class="login-body">${forms[mode]}</div>
      <div class="login-foot">
        <svg viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60 C 120 120, 260 0, 400 40 L400 160 L0 160 Z" fill="#FFD60A"/>
          <path d="M0 100 C 130 150, 260 50, 400 80 L400 160 L0 160 Z" fill="#111"/>
        </svg>
        ${logo("logo-sm logo-inv logo-row")}
      </div>
    </section>`;

  app.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => go("login", { mode: b.dataset.mode }, { replace: true })));
  const google = $("#googleBtn");
  if (google) google.onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => toast(authError(e)));

  const form = $("#form");
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (mode === "email") {
        await signInWithEmailAndPassword(auth, f.email.trim(), f.password);
      } else if (mode === "signup") {
        const { user } = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
        await updateProfile(user, { displayName: f.name.trim().replace(/\s+/g, " ") });
        await sendEmailVerification(user);
        handleUser(user); // ismi göstermek için ekranı yenile
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, f.email.trim());
        toast("Sıfırlama bağlantısı gönderildi. E-postanı kontrol et.");
        go("login", { mode: "email" }, { replace: true });
      }
    } catch (err) {
      toast(authError(err));
    } finally {
      btn.disabled = false;
    }
  };
};

SCREENS.verify = () => {
  const user = auth.currentUser;
  app.innerHTML = `
    <section class="login">
      ${logo("logo-md")}
      <div class="login-body center">
        <div class="big-icon">${I.mail}</div>
        <h1 class="welcome">E-postanı doğrula</h1>
        <p class="muted"><b>${esc(user.email)}</b> adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra aşağıdaki düğmeye bas.</p>
        <button id="done" class="btn btn-yellow btn-lg">Doğruladım</button>
        <button id="again" class="btn btn-outline btn-lg">Tekrar gönder</button>
        <p><button id="out" class="link">Çıkış yap</button></p>
      </div>
    </section>`;
  $("#done").onclick = async () => {
    await user.reload();
    if (!user.emailVerified) return toast("Henüz doğrulanmamış görünüyor. E-postandaki bağlantıya tıkladın mı?");
    await user.getIdToken(true);
    handleUser(user);
  };
  $("#again").onclick = () => sendEmailVerification(user)
    .then(() => toast("Doğrulama e-postası tekrar gönderildi."))
    .catch((e) => toast(authError(e)));
  $("#out").onclick = logout;
};

// ---------- Ana sayfa ----------

SCREENS.home = () => (state.role === "teacher" ? teacherHome() : studentHome());

function studentHome() {
  shell({
    tab: "home",
    header: `${topRow()}
      <h1 class="hi">Merhaba ${esc(firstName(state.user))} 👋</h1>
      <p class="hi-sub">Bugün derse hazır mısın?</p>`,
    body: `
      <div id="lessonCard" class="float-card"></div>
      <div id="checkArea"></div>
      <div class="tiles">
        <button class="tile" data-go="lessons">${I.calendar}<b>Derslerim</b><span>Ders programını gör</span></button>
        <button class="tile" data-go="history">${I.history}<b>Yoklama Geçmişi</b><span>Kayıtlarını incele</span></button>
        <button class="tile" data-go="profile">${I.user}<b>Profilim</b><span>Bilgilerini gör</span></button>
        <button class="tile" id="helpTile">${I.help}<b>Yardım</b><span>Nasıl kullanılır?</span></button>
      </div>`,
  });
  $("#helpTile").onclick = () => go("profile", { open: "help" });

  let active = null, record, session, loaded, lessonSubs = [];
  const uid = state.user.uid;

  const render = () => {
    const card = $("#lessonCard");
    const area = $("#checkArea");
    if (!card) return;
    const next = todaysLessons().find((l) => lessonState(l) === "upcoming");

    if (active) {
      card.innerHTML = `
        <button class="lesson-row" data-go="lessons">
          <span class="lr-icon">${I.book}</span>
          <span class="lr-text"><small>Aktif Ders</small><b>${esc(active.name)}</b>
          <span>${lessonTime(active)}</span><span>Hoca: ${esc(active.teacherName)}</span></span>
          <span class="chev">${I.chevron}</span>
        </button>`;
    } else {
      card.innerHTML = `
        <div class="lesson-row">
          <span class="lr-icon grey">${I.clock}</span>
          <span class="lr-text"><small>${next ? "Sıradaki Ders" : "Bugün"}</small>
          <b>${next ? esc(next.name) : "Şu an aktif ders yok"}</b>
          <span>${next ? `${lessonTime(next)} · Yoklama ${fmtMin(next.startMin - EARLY)}'te açılır` : "Bugün için başka ders görünmüyor"}</span></span>
        </div>`;
    }

    if (!active) {
      area.innerHTML = `<button class="geldim off" disabled>${I.checkCircle}<b>Geldim</b><span>Yoklama ders saatinde açılır</span></button>`;
      return;
    }
    if (loaded < 2) { area.innerHTML = `<div class="geldim ghost"></div>`; return; }
    if (record?.status === "approved") {
      area.innerHTML = `<div class="geldim ok">${I.checkCircle}<b>Derstesin!</b><span>${fmtTime(record.checkedInAt)} · Hocan onayladı</span></div>`;
    } else if (record?.status === "rejected") {
      area.innerHTML = `<div class="geldim no">${I.x}<b>Onaylanmadı</b><span>Bir yanlışlık varsa hocanla konuş</span></div>`;
    } else if (record) {
      area.innerHTML = `<div class="geldim wait">${I.hourglass}<b>Geldin</b><span>${fmtTime(record.checkedInAt)} · Hocanın onayı bekleniyor</span></div>`;
    } else if (session?.open === false) {
      area.innerHTML = `<div class="geldim off">${I.lock}<b>Yoklama kapandı</b><span>Bu ders için artık giriş alınmıyor</span></div>`;
    } else {
      area.innerHTML = `<button id="checkin" class="geldim">${I.checkCircle}<b>Geldim</b><span>Yoklama için dokun</span></button>`;
      $("#checkin").onclick = checkIn;
    }
  };

  const watch = () => {
    lessonSubs.forEach((u) => u());
    lessonSubs = [];
    active = activeLesson() ?? null;
    record = session = null;
    loaded = 0;
    if (active) {
      const key = `${now().date}_${active.id}`;
      lessonSubs.push(onSnapshot(doc(db, "sessions", key), (s) => { session = s.data() ?? null; loaded++; render(); }, (e) => toast(e.message)));
      lessonSubs.push(onSnapshot(doc(db, "attendance", `${key}_${uid}`), (s) => { record = s.exists() ? s.data() : null; loaded++; render(); }, (e) => toast(e.message)));
    }
    render();
  };
  screenSubs.push(() => lessonSubs.forEach((u) => u()));

  const refresh = () => ((activeLesson()?.id ?? null) !== (active?.id ?? null) ? watch() : render());
  hooks.onLessons = refresh;
  hooks.onTick = refresh;
  watch();

  async function checkIn() {
    const btn = $("#checkin");
    btn.disabled = true;
    navigator.vibrate?.(30);
    const lesson = active;
    const ref = doc(db, "attendance", `${now().date}_${lesson.id}_${uid}`);
    try {
      await setDoc(ref, {
        uid,
        name: state.user.displayName ?? "",
        email: state.user.email ?? "",
        photo: state.user.photoURL ?? "",
        date: now().date,
        lessonId: lesson.id,
        lessonName: lesson.name,
        checkedInAt: serverTimestamp(),
        status: "pending",
      });
      const saved = await getDocFromServer(ref);
      showSuccess(lesson, saved.data()?.checkedInAt);
    } catch {
      toast("Giriş kaydedilemedi. Yoklama kapanmış, ders saati geçmiş veya zaten giriş yapmış olabilirsin.");
      render();
    }
  }
}

function showSuccess(lesson, ts) {
  const el = document.createElement("div");
  el.className = "success";
  el.innerHTML = `
    ${logo("logo-sm logo-row")}
    <div class="burst"><span class="rays"></span><span class="tick">${I.check}</span></div>
    <h1>Geldin!</h1>
    <p class="success-sub">Yoklaman başarıyla kaydedildi.</p>
    <div class="stamp-card">
      ${I.clock}
      <div><small>Kayıt zamanı</small><b>${prettyDate(now().date)} • ${fmtTime(ts)}</b><span>${esc(lesson.name)} · Sunucu saati</span></div>
    </div>
    <button class="btn btn-black btn-lg">Tamam</button>
    <p class="good-job">Good job! ☺</p>`;
  el.querySelector("button").onclick = () => el.remove();
  document.body.append(el);
}

function teacherHome() {
  shell({
    tab: "home",
    header: `${topRow()}
      <h1 class="hi">Merhaba ${esc(firstName(state.user))} Hoca 👋</h1>
      <p class="hi-sub">Bugünün derslerini yönetebilirsin.</p>`,
    body: `
      <div class="float-card">
        <div class="card-head"><h2>Bugünkü Dersler</h2><button class="link" data-go="lessons">Tümü</button></div>
        <div id="todayList"></div>
      </div>`,
  });

  const render = () => {
    const list = $("#todayList");
    if (!list) return;
    const today = todaysLessons();
    if (!today.length) {
      list.innerHTML = `
        <div class="empty">
          <div class="big-icon">${I.calendar}</div>
          <b>Bugün ders yok</b>
          <p>Ders programını oluşturmak için yeni ders ekle.</p>
          <button id="addLesson" class="btn btn-yellow">${I.plus}<span>Ders ekle</span></button>
        </div>`;
      $("#addLesson").onclick = () => go("lessonForm");
      return;
    }
    const label = { live: "Yoklama başladı", upcoming: "Henüz başlamadı", done: "Tamamlandı" };
    list.innerHTML = today.map((l) => {
      const st = lessonState(l);
      return `
        <button class="lesson-row ${st}" data-id="${esc(l.id)}">
          <span class="lr-icon ${st === "live" ? "" : "grey"}">${I.clock}</span>
          <span class="lr-text"><b>${esc(l.name)}</b><span>${lessonTime(l)}</span>
          <em class="st ${st}">${label[st]}</em></span>
          <span class="chev">${I.chevron}</span>
        </button>`;
    }).join("");
    list.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => go("lesson", { id: b.dataset.id })));
  };
  hooks.onLessons = render;
  hooks.onTick = render;
  render();
}

// ---------- Dersler ----------

SCREENS.lessons = () => {
  const teacher = state.role === "teacher";
  shell({
    tab: "lessons",
    header: titleRow("Ders Programı", teacher ? `<button class="pill-btn" data-go="lessonForm">${I.plus}<span>Yeni ders</span></button>` : ""),
    body: `<div id="today" class="float-card"></div><h2 class="section">Haftalık Program</h2><div id="week"></div>`,
  });

  const card = (l, showState) => {
    const st = lessonState(l);
    const badge = { live: "Şimdi", upcoming: "Sıradaki", done: "Bitti" }[st];
    return `
      <button class="lesson-row ${st}" data-id="${esc(l.id)}">
        <span class="lr-icon ${st === "live" ? "" : "grey"}">${I.book}</span>
        <span class="lr-text"><b>${esc(l.name)}</b><span>${lessonTime(l)} · ${esc(l.teacherName)} Hoca</span>
        <span class="days">${DAY_SHORT.map((d, i) => `<i class="${l.days.includes(i + 1) ? "on" : ""}">${d}</i>`).join("")}</span></span>
        ${showState && badge ? `<em class="badge ${st}">${badge}</em>` : teacher ? `<span class="chev">${I.chevron}</span>` : ""}
      </button>`;
  };

  const render = () => {
    const today = todaysLessons();
    $("#today").innerHTML = `
      <div class="card-head"><h2>Bugün</h2><span class="muted small">${dayLabel(now().date)}</span></div>
      ${today.length ? today.map((l) => card(l, true)).join("") : `<p class="muted small pad">Bugün ders yok.</p>`}`;
    const n = now();
    $("#week").innerHTML = state.lessons.length
      ? DAY_LONG.map((name, i) => {
          const ls = state.lessons.filter((l) => l.days.includes(i + 1)).sort((a, b) => a.startMin - b.startMin);
          if (!ls.length) return "";
          return `<div class="day-group${n.dow === i + 1 ? " today" : ""}"><h3>${name}</h3>${ls.map((l) => `
            <div class="mini-row"><b>${fmtMin(l.startMin)}</b><span>${esc(l.name)}</span><small>${fmtMin(l.endMin)}'e kadar</small></div>`).join("")}</div>`;
        }).join("")
      : `<div class="empty"><div class="big-icon">${I.calendar}</div><b>Henüz ders eklenmemiş</b>
         <p>${teacher ? "Sağ üstteki “Yeni ders” ile başla." : "Hocan dersleri eklediğinde burada görünecek."}</p></div>`;
    if (teacher) app.querySelectorAll(".lesson-row[data-id]").forEach((b) => (b.onclick = () => go("lesson", { id: b.dataset.id })));
  };
  hooks.onLessons = render;
  hooks.onTick = render;
  render();
};

SCREENS.lessonForm = ({ id } = {}) => {
  const l = state.lessons.find((x) => x.id === id);
  shell({
    tab: "lessons",
    header: titleRow(l ? "Dersi Düzenle" : "Yeni Ders", "", true),
    body: `
      <form id="lessonForm" class="form float-card pad-lg">
        <label>Ders adı<input name="name" required maxlength="60" placeholder="ör. General English" value="${esc(l?.name ?? "")}"></label>
        <div class="two">
          <label>Başlangıç<input name="start" type="time" required value="${l ? fmtMin(l.startMin) : "10:00"}"></label>
          <label>Bitiş<input name="end" type="time" required value="${l ? fmtMin(l.endMin) : "11:30"}"></label>
        </div>
        <fieldset class="day-pick"><legend>Günler</legend>
          ${DAY_SHORT.map((d, i) => `<label><input type="checkbox" name="days" value="${i + 1}" ${l?.days.includes(i + 1) ? "checked" : ""}><span>${d}</span></label>`).join("")}
        </fieldset>
        <p class="hint">${I.clock} Yoklama ders başlamadan ${EARLY} dakika önce açılır, ders bitince kapanır.</p>
        <button class="btn btn-yellow btn-lg" type="submit">${l ? "Kaydet" : "Dersi ekle"}</button>
      </form>`,
  });

  $("#lessonForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const days = fd.getAll("days").map(Number);
    const startMin = toMin(fd.get("start"));
    const endMin = toMin(fd.get("end"));
    if (!days.length) return toast("En az bir gün seç.");
    if (endMin <= startMin) return toast("Bitiş saati başlangıçtan sonra olmalı.");
    const data = {
      name: fd.get("name").trim(),
      teacherId: l?.teacherId ?? state.user.uid,
      teacherName: l?.teacherName ?? firstName(state.user),
      days, startMin, endMin,
      updatedAt: serverTimestamp(),
    };
    try {
      if (l) {
        await updateDoc(doc(db, "lessons", l.id), data);
        history.back();
      } else {
        const ref = await addDoc(collection(db, "lessons"), data);
        go("lesson", { id: ref.id }, { replace: true });
      }
      toast("Ders kaydedildi.");
    } catch (err) {
      toast("Kaydedilemedi: " + err.message);
    }
  };
};

// ---------- Ders detayı (hoca) ----------

SCREENS.lesson = ({ id, tab = "list" }) => {
  const lesson = () => state.lessons.find((x) => x.id === id);
  if (!lesson()) return go("lessons", {}, { replace: true });
  const date = now().date;
  const key = `${date}_${id}`;
  let rows = [], session = null, search = "";

  shell({
    tab: "attendance",
    header: titleRow("Ders Detayı", `<span id="livePill"></span>`, true),
    body: `
      <div id="lessonHead" class="yellow-card"></div>
      <div class="tabs">
        <button data-t="list" class="${tab === "list" ? "on" : ""}">Yoklama Listesi</button>
        <button data-t="info" class="${tab === "info" ? "on" : ""}">Ders Bilgileri</button>
      </div>
      <div id="tabList" ${tab === "list" ? "" : "hidden"}>
        <div class="stats">
          <div><span class="dot green">${I.check}</span><small>Katılan</small><b id="sApproved">0</b></div>
          <div><span class="dot amber">${I.clock}</span><small>Bekleyen</small><b id="sPending">0</b></div>
          <div><span class="dot black">${I.users}</span><small>Toplam</small><b id="sTotal">0</b></div>
        </div>
        <label class="search">${I.search}<input id="search" placeholder="Öğrenci ara..." autocomplete="off"></label>
        <div class="card-head"><h2>Canlı Liste</h2><span class="muted small">${dayLabel(date)}</span></div>
        <ul id="rows" class="rows"></ul>
        <div class="action-bar">
          <button id="approveAll" class="btn btn-yellow">Hepsini onayla</button>
          <button id="toggle" class="btn btn-outline">Yoklamayı kapat</button>
        </div>
      </div>
      <div id="tabInfo" ${tab === "info" ? "" : "hidden"}></div>`,
  });

  app.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
    app.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("on", x === b));
    $("#tabList").hidden = b.dataset.t !== "list";
    $("#tabInfo").hidden = b.dataset.t !== "info";
    history.replaceState({ name: "lesson", params: { id, tab: b.dataset.t } }, "");
  }));

  const renderHead = () => {
    const l = lesson();
    if (!l) return;
    const live = lessonState(l) === "live";
    $("#livePill").innerHTML = live ? `<span class="live-pill">Canlı</span>` : "";
    $("#lessonHead").innerHTML = `
      <span class="lr-icon black">${I.calendar}</span>
      <div><b>${esc(l.name)}</b><span>${lessonTime(l)}</span><span>${esc(l.teacherName)} Hoca</span></div>`;
    $("#tabInfo").innerHTML = `
      <div class="info-list float-card">
        <div><span>${I.clock}</span><small>Saat</small><b>${lessonTime(l)}</b></div>
        <div><span>${I.calendar}</span><small>Günler</small><b>${l.days.map((d) => DAY_LONG[d - 1]).join(", ")}</b></div>
        <div><span>${I.user}</span><small>Hoca</small><b>${esc(l.teacherName)}</b></div>
        <div><span>${I.checkCircle}</span><small>Yoklama</small><b>${fmtMin(Math.max(0, l.startMin - EARLY))} – ${fmtMin(l.endMin)} arası açık</b></div>
      </div>
      <div class="row-btns">
        <button id="edit" class="btn btn-outline">${I.edit}<span>Düzenle</span></button>
        <button id="del" class="btn btn-danger">${I.trash}<span>Sil</span></button>
      </div>`;
    $("#edit").onclick = () => go("lessonForm", { id });
    $("#del").onclick = async () => {
      if (!confirm(`"${l.name}" dersi silinsin mi? Geçmiş yoklama kayıtları silinmez.`)) return;
      await deleteDoc(doc(db, "lessons", id)).catch((e) => toast(e.message));
      go("lessons", {}, { replace: true });
    };
  };

  const renderRows = () => {
    const n = (s) => rows.filter((r) => r.status === s).length;
    $("#sApproved").textContent = n("approved");
    $("#sPending").textContent = n("pending");
    $("#sTotal").textContent = rows.length;
    const approveAll = $("#approveAll");
    approveAll.disabled = !n("pending");
    approveAll.textContent = n("pending") ? `Hepsini onayla (${n("pending")})` : "Hepsini onayla";
    const closed = session?.open === false;
    $("#toggle").textContent = closed ? "Yoklamayı aç" : "Yoklamayı kapat";
    $("#toggle").classList.toggle("btn-danger", !closed);

    const q = search.toLocaleLowerCase("tr-TR");
    const shown = rows.filter((r) => (r.name || r.email).toLocaleLowerCase("tr-TR").includes(q));
    const chip = { approved: ["green", "Geldi"], rejected: ["red", "Reddedildi"], pending: ["amber", "Bekliyor"] };
    $("#rows").innerHTML = shown.length ? shown.map((r) => `
      <li class="student-row">
        ${avatar(r.name || r.email, r.photo)}
        <div class="sr-text"><b>${esc(r.name || r.email)}</b><span>${fmtTime(r.checkedInAt)}</span></div>
        ${r.status === "pending"
          ? `<div class="sr-acts">
               <button class="mini ok" data-id="${esc(r.id)}" data-s="approved" aria-label="Onayla">${I.check}</button>
               <button class="mini no" data-id="${esc(r.id)}" data-s="rejected" aria-label="Reddet">${I.x}</button>
             </div>`
          : `<button class="chip ${chip[r.status][0]}" data-id="${esc(r.id)}" data-s="${r.status === "approved" ? "rejected" : "approved"}"
               title="Değiştirmek için dokun">${r.status === "approved" ? I.check : I.x}<span>${chip[r.status][1]}</span></button>`}
      </li>`).join("")
      : `<li class="empty small"><b>${rows.length ? "Sonuç yok" : "Henüz kimse gelmedi"}</b>
         <p>${rows.length ? "Aramayı değiştir." : "Öğrenciler “Geldim”e bastıkça burada belirecek."}</p></li>`;
  };

  $("#search").oninput = (e) => { search = e.target.value; renderRows(); };

  $("#rows").onclick = (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    if (b.classList.contains("chip")) {
      const msg = b.dataset.s === "rejected" ? "Bu öğrencinin kaydı reddedilsin mi?" : "Bu öğrencinin kaydı onaylansın mı?";
      if (!confirm(msg)) return;
    }
    navigator.vibrate?.(15);
    updateDoc(doc(db, "attendance", b.dataset.id), {
      status: b.dataset.s, decidedAt: serverTimestamp(), decidedBy: state.user.uid,
    }).catch((err) => toast(err.message));
  };

  $("#approveAll").onclick = async () => {
    const batch = writeBatch(db);
    for (const r of rows.filter((r) => r.status === "pending")) {
      batch.update(doc(db, "attendance", r.id), { status: "approved", decidedAt: serverTimestamp(), decidedBy: state.user.uid });
    }
    await batch.commit().catch((err) => toast(err.message));
  };

  $("#toggle").onclick = async () => {
    const closing = session?.open !== false;
    if (closing && !confirm("Yoklama kapansın mı? Bundan sonra bu derse kimse giriş yapamaz.")) return;
    await setDoc(doc(db, "sessions", key), {
      open: !closing, date, lessonId: id, updatedAt: serverTimestamp(), updatedBy: state.user.uid,
    }, { merge: true }).catch((err) => toast(err.message));
  };

  screenSubs.push(onSnapshot(doc(db, "sessions", key), (s) => { session = s.data() ?? null; renderRows(); }, (e) => toast(e.message)));
  screenSubs.push(onSnapshot(
    query(collection(db, "attendance"), where("date", "==", date), where("lessonId", "==", id)),
    (snap) => {
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.checkedInAt?.toMillis() ?? Infinity) - (b.checkedInAt?.toMillis() ?? Infinity));
      renderRows();
    },
    (e) => toast(e.message),
  ));

  hooks.onLessons = () => (lesson() ? renderHead() : go("lessons", {}, { replace: true }));
  hooks.onTick = renderHead;
  renderHead();
  renderRows();
};

// ---------- Yoklama geçmişi (öğrenci) ----------

SCREENS.history = () => {
  shell({
    tab: "attendance",
    header: titleRow("Yoklama Geçmişi"),
    body: `
      <div class="float-card summary">
        <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" class="ring-bg"/><circle id="ringFg" cx="60" cy="60" r="50" class="ring-fg"/></svg>
          <div><b id="pct">%0</b><small>katılım</small></div></div>
        <div class="sum-list">
          <div><span class="dot green">${I.check}</span>Katıldı<b id="hApproved">0</b></div>
          <div><span class="dot amber">${I.clock}</span>Bekleyen<b id="hPending">0</b></div>
          <div><span class="dot red">${I.x}</span>Reddedilen<b id="hRejected">0</b></div>
        </div>
      </div>
      <h2 class="section">Kayıtlar</h2>
      <ul id="hist" class="rows"></ul>`,
  });
  const C = 2 * Math.PI * 50;
  $("#ringFg").style.strokeDasharray = C;

  screenSubs.push(onSnapshot(query(collection(db, "attendance"), where("uid", "==", state.user.uid)), (snap) => {
    const rows = snap.docs.map((d) => d.data())
      .sort((a, b) => (b.checkedInAt?.toMillis() ?? Infinity) - (a.checkedInAt?.toMillis() ?? Infinity));
    const n = (s) => rows.filter((r) => r.status === s).length;
    const pct = rows.length ? Math.round((n("approved") / rows.length) * 100) : 0;
    $("#pct").textContent = `%${pct}`;
    $("#ringFg").style.strokeDashoffset = C * (1 - pct / 100);
    $("#hApproved").textContent = n("approved");
    $("#hPending").textContent = n("pending");
    $("#hRejected").textContent = n("rejected");
    const chip = { approved: ["green", "Geldi"], rejected: ["red", "Reddedildi"], pending: ["amber", "Bekliyor"] };
    $("#hist").innerHTML = rows.length ? rows.map((r) => `
      <li class="student-row">
        <span class="date-box"><b>${r.date.slice(8)}</b><small>${new Date(r.date + "T12:00:00").toLocaleDateString("tr-TR", { month: "short" })}</small></span>
        <div class="sr-text"><b>${esc(r.lessonName || "Ders")}</b><span>${fmtTime(r.checkedInAt)}</span></div>
        <span class="chip ${chip[r.status][0]}">${r.status === "approved" ? I.check : r.status === "rejected" ? I.x : I.clock}<span>${chip[r.status][1]}</span></span>
      </li>`).join("")
      : `<li class="empty small"><b>Henüz kayıt yok</b><p>Derse gelip “Geldim”e bastığında burada görünecek.</p></li>`;
  }, (e) => toast(e.message)));
};

// ---------- Profil ----------

SCREENS.profile = ({ open } = {}) => {
  const u = state.user;
  const google = u.providerData.some((p) => p.providerId === "google.com");
  const teacher = state.role === "teacher";
  const help = teacher
    ? `<p><b>Ders ekleme:</b> Dersler sekmesinde “Yeni ders” ile dersin adını, saatini ve günlerini gir.</p>
       <p><b>Yoklama:</b> Ders başlamadan ${EARLY} dk önce yoklama kendiliğinden açılır. Öğrenciler “Geldim”e bastıkça Ders Detayı'ndaki listeye düşer.</p>
       <p><b>Onay:</b> Her öğrencinin yanındaki ✓ / ✕ ile onayla ya da reddet, veya “Hepsini onayla”ya bas.</p>
       <p><b>Kapatma:</b> “Yoklamayı kapat” dersen o derse artık kimse giriş yapamaz.</p>`
    : `<p><b>1.</b> Derse gelince Ana Sayfa'daki sarı <b>Geldim</b> düğmesine bas.</p>
       <p><b>2.</b> Yoklama ders başlamadan ${EARLY} dk önce açılır ve ders bitince kapanır.</p>
       <p><b>3.</b> Giriş saatin sunucu saatiyle kaydedilir. Hocan onaylayınca “Derstesin!” yazar.</p>
       <p><b>4.</b> Geçmiş derslerini Yoklama sekmesinde görebilirsin.</p>`;

  shell({
    tab: "profile",
    headerClass: "hdr-profile",
    header: `${titleRow("Profil")}
      <div class="me">${avatar(u.displayName || u.email, u.photoURL, "avatar-lg")}
        <div><b>${esc(u.displayName || "İsimsiz")}</b><span>${esc(u.email)}</span></div></div>`,
    body: `
      <div class="menu float-card">
        <button class="menu-item" data-x="info">${I.id}<span>Kişisel Bilgiler</span><i class="chev">${I.chevron}</i></button>
        <div class="menu-x" id="x-info" ${open === "info" ? "" : "hidden"}>
          <p><small>Ad Soyad</small>${esc(u.displayName || "—")}</p>
          <p><small>E-posta</small>${esc(u.email)}</p>
          <p><small>Hesap türü</small>${teacher ? "Hoca" : "Öğrenci"}</p>
          <p><small>Giriş yöntemi</small>${google ? "Google" : "E-posta ve şifre"}</p>
        </div>
        <button class="menu-item" data-x="help">${I.help}<span>Yardım & Destek</span><i class="chev">${I.chevron}</i></button>
        <div class="menu-x" id="x-help" ${open === "help" ? "" : "hidden"}>${help}</div>
        <div class="menu-item static">${I.globe}<span>Dil</span><em>Türkçe</em></div>
        <button class="menu-item danger" id="logout">${I.logout}<span>Çıkış Yap</span></button>
      </div>
      <p class="center muted small">Derstayım · English Time</p>`,
  });
  app.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => {
    const x = $("#x-" + b.dataset.x);
    x.hidden = !x.hidden;
    b.classList.toggle("open", !x.hidden);
  }));
  if (open) $(`[data-x="${open}"]`)?.classList.add("open");
  $("#logout").onclick = () => { if (confirm("Çıkış yapılsın mı?")) logout(); };
};

// ---------- Oturum ----------

// Önce dinleyicileri kapat, yoksa çıkış anında "izin yok" hatası görünür
function logout() {
  screenSubs.forEach((u) => u());
  screenSubs = [];
  globalSubs.forEach((u) => u());
  globalSubs = [];
  signOut(auth);
}

const splashUntil = Date.now() + 1400;
let authSeq = 0;

async function handleUser(user) {
  const seq = ++authSeq;
  globalSubs.forEach((u) => u());
  globalSubs = [];
  await sleep(Math.max(0, splashUntil - Date.now()));
  if (seq !== authSeq) return;

  state.user = user;
  if (!user) {
    state.role = null;
    state.lessons = [];
    return go("login", {}, { replace: true });
  }
  const password = user.providerData.some((p) => p.providerId === "password");
  if (password && !user.emailVerified) return go("verify", {}, { replace: true });

  state.role = (await getDoc(doc(db, "teachers", user.uid))).exists() ? "teacher" : "student";
  if (seq !== authSeq) return;

  let first = true;
  globalSubs.push(onSnapshot(collection(db, "lessons"), (snap) => {
    state.lessons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (first) { first = false; go("home", {}, { replace: true }); } else hooks.onLessons?.();
  }, (e) => toast(e.message)));
  const timer = setInterval(() => hooks.onTick?.(), 20000);
  globalSubs.push(() => clearInterval(timer));
}

onAuthStateChanged(auth, handleUser);
