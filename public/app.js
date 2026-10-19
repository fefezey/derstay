import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where,
  serverTimestamp, writeBatch, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

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
const STATUS_TR = { pending: "Bekliyor", approved: "Onaylı", rejected: "Ret" };

const ICONS = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  hourglass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
};

// Tarih her zaman Türkiye saatine göre (sunucu da aynısını kontrol eder)
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const prettyDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("tr-TR", {
  weekday: "long", day: "numeric", month: "long",
});
const fmtTime = (ts) => ts
  ? ts.toDate().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
  : "…";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0].toLocaleUpperCase("tr-TR")).join("");
const avatar = (name, photo) => photo
  ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`
  : esc(initials(name));

let unsubs = [];
function clearSubs() { unsubs.forEach((u) => u()); unsubs = []; }

function show(id) {
  for (const s of document.querySelectorAll("section.view")) s.hidden = s.id !== id;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

$("#loginBtn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
  .catch((e) => toast("Giriş yapılamadı: " + e.message));
$("#me").onclick = () => { if (confirm("Çıkış yapılsın mı?")) signOut(auth); };

onAuthStateChanged(auth, async (user) => {
  clearSubs();
  document.body.classList.toggle("signed-out", !user);
  if (!user) {
    show("login");
    return;
  }
  $("#me").innerHTML = avatar(user.displayName, user.photoURL);
  show("loading");
  const isTeacher = (await getDoc(doc(db, "teachers", user.uid))).exists();
  isTeacher ? startTeacher(user) : startStudent(user);
});

// ---------- Öğrenci ----------

function greeting() {
  const h = Number(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", timeZone: TZ }));
  return h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar";
}

function startStudent(user) {
  show("student");
  const btn = $("#checkin");
  const state = $("#state");
  const firstName = (user.displayName ?? "").split(" ")[0];

  const tick = () => {
    $("#clock").textContent = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
    $("#greet").textContent = `${greeting()}${firstName ? ", " + firstName : ""} 👋`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  unsubs.push(() => clearInterval(timer));

  let date, session, record, loaded;

  const setState = (kind, icon, title, text) => {
    btn.hidden = true;
    state.hidden = false;
    state.className = `state ${kind}`;
    $("#stateIcon").innerHTML = ICONS[icon];
    $("#stateTitle").textContent = title;
    $("#stateText").textContent = text;
  };

  const render = () => {
    $("#studentDate").textContent = prettyDate(date);
    if (loaded < 2) { btn.hidden = true; state.hidden = true; return; }
    const time = record ? fmtTime(record.checkedInAt) : "";
    if (record?.status === "approved") {
      setState("approved", "check", "Dersteyim!", `${time} · Hocan onayladı`);
    } else if (record?.status === "rejected") {
      setState("rejected", "cross", "Onaylanmadı", `${time} · Bir yanlışlık varsa hocanla konuş`);
    } else if (record) {
      setState("pending", "hourglass", "Kaydın alındı", `${time} · Hocanın onayı bekleniyor`);
    } else if (session?.open === false) {
      setState("closed", "lock", "Yoklama kapandı", "Bugün için artık giriş alınmıyor");
    } else {
      state.hidden = true;
      btn.hidden = false;
      btn.disabled = false;
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
    render();
  };
  watch();

  btn.onclick = async () => {
    if (date !== today()) { watch(); return; } // sayfa gece açık kaldıysa
    btn.disabled = true;
    navigator.vibrate?.(30);
    try {
      await setDoc(doc(db, "attendance", `${date}_${user.uid}`), {
        uid: user.uid,
        name: user.displayName ?? "",
        email: user.email ?? "",
        photo: user.photoURL ?? "",
        date,
        checkedInAt: serverTimestamp(),
        status: "pending",
      });
    } catch {
      toast("Giriş kaydedilemedi. Yoklama kapanmış veya zaten giriş yapmış olabilirsin.");
      render();
    }
  };
}

// ---------- Hoca ----------

function startTeacher(user) {
  show("teacher");
  const list = $("#list");

  let date, session, rows = [];
  const seen = new Set();

  const render = () => {
    $("#teacherDate").textContent = prettyDate(date);
    const n = (s) => rows.filter((r) => r.status === s).length;
    $("#nPending").textContent = n("pending");
    $("#nApproved").textContent = n("approved");
    $("#nRejected").textContent = n("rejected");

    const approveAll = $("#approveAll");
    approveAll.disabled = n("pending") === 0;
    approveAll.textContent = n("pending") ? `Hepsini onayla (${n("pending")})` : "Hepsini onayla";

    const closed = session?.open === false;
    const pill = $("#sessionPill");
    pill.textContent = closed ? "Yoklama kapalı" : "Yoklama açık";
    pill.classList.toggle("closed", closed);
    const toggle = $("#toggleSession");
    toggle.textContent = closed ? "Yeniden aç" : "Yoklamayı kapat";
    toggle.classList.toggle("danger", !closed);

    list.innerHTML = rows.length === 0
      ? `<li class="empty">
           <svg><use href="#bigben"/></svg>
           <h3>Henüz kimse gelmedi</h3>
           <p>Öğrenciler "Geldim"e bastıkça burada belirecek.</p>
         </li>`
      : rows.map((r) => {
          const isNew = !seen.has(r.id);
          seen.add(r.id);
          return `
          <li class="row ${r.status}${isNew ? " new" : ""}">
            <div class="avatar">${avatar(r.name || r.email, r.photo)}</div>
            <div class="who">
              <div class="name">${esc(r.name || r.email)}</div>
              <div class="meta">${fmtTime(r.checkedInAt)} <span class="tag">${STATUS_TR[r.status]}</span></div>
            </div>
            <div class="acts">
              <button class="act ok${r.status === "approved" ? " on" : ""}" data-id="${esc(r.id)}" data-act="approved" aria-label="Onayla">${ICONS.check}</button>
              <button class="act no${r.status === "rejected" ? " on" : ""}" data-id="${esc(r.id)}" data-act="rejected" aria-label="Reddet">${ICONS.cross}</button>
            </div>
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
    if (closing && !confirm("Yoklama kapansın mı? Bundan sonra kimse giriş yapamaz.")) return;
    await setDoc(doc(db, "sessions", date), {
      open: !closing, date, updatedAt: serverTimestamp(), updatedBy: user.uid,
    }, { merge: true }).catch((err) => toast(err.message));
  };
}
