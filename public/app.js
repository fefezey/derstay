import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where,
  serverTimestamp, writeBatch, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, CLASSES } from "./config.js";

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
const STATUS_TR = { pending: "Onay bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };

// Tarih her zaman Türkiye saatine göre (sunucu da aynısını kontrol eder)
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const prettyDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("tr-TR", {
  weekday: "long", day: "numeric", month: "long",
});
const fmtTime = (ts) => ts
  ? ts.toDate().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })
  : "…";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

function fillClasses(select, key) {
  select.innerHTML = CLASSES.map((c) => `<option>${esc(c)}</option>`).join("");
  try {
    const saved = localStorage.getItem(key);
    if (CLASSES.includes(saved)) select.value = saved;
  } catch {}
  select.addEventListener("change", () => {
    try { localStorage.setItem(key, select.value); } catch {}
  });
}

$("#loginBtn").onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
  .catch((e) => toast("Giriş yapılamadı: " + e.message));
$("#logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  clearSubs();
  if (!user) {
    $("#who").hidden = true;
    show("login");
    return;
  }
  $("#who").hidden = false;
  $("#userName").textContent = user.displayName ?? user.email;
  show("loading");
  const isTeacher = (await getDoc(doc(db, "teachers", user.uid))).exists();
  isTeacher ? startTeacher(user) : startStudent(user);
});

// ---------- Öğrenci ----------

function startStudent(user) {
  show("student");
  const sel = $("#studentClass");
  const btn = $("#checkin");
  const status = $("#studentStatus");
  fillClasses(sel, "derstayim.class");

  let date, classId, session, record, loaded;

  const render = () => {
    $("#studentDate").textContent = prettyDate(date);
    if (loaded < 2) { btn.disabled = true; status.textContent = ""; return; }
    const closed = session?.open === false;
    if (record) {
      btn.disabled = true;
      status.textContent = `${fmtTime(record.checkedInAt)} · ${STATUS_TR[record.status]}`;
    } else if (closed) {
      btn.disabled = true;
      status.textContent = "Bugünün yoklaması kapandı.";
    } else {
      btn.disabled = false;
      status.textContent = "";
    }
  };

  const watch = () => {
    clearSubs();
    date = today();
    classId = sel.value;
    session = record = null;
    loaded = 0;
    const sid = `${date}_${classId}`;
    unsubs.push(onSnapshot(doc(db, "sessions", sid), (s) => {
      session = s.data() ?? null; loaded++; render();
    }, (e) => toast(e.message)));
    unsubs.push(onSnapshot(doc(db, "attendance", `${sid}_${user.uid}`), (s) => {
      record = s.exists() ? s.data() : null; loaded++; render();
    }, (e) => toast(e.message)));
    render();
  };

  sel.onchange = watch;
  watch();

  btn.onclick = async () => {
    if (date !== today()) { watch(); return; } // sayfa gece açık kaldıysa
    btn.disabled = true;
    try {
      await setDoc(doc(db, "attendance", `${date}_${classId}_${user.uid}`), {
        uid: user.uid,
        name: user.displayName ?? "",
        email: user.email ?? "",
        classId,
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
  const sel = $("#teacherClass");
  const list = $("#list");
  fillClasses(sel, "derstayim.teacherClass");

  let date, sid, session, rows = [];

  const render = () => {
    $("#teacherDate").textContent = prettyDate(date);
    const n = (s) => rows.filter((r) => r.status === s).length;
    $("#counts").innerHTML =
      `<span>Toplam ${rows.length}</span><span>Bekleyen ${n("pending")}</span>` +
      `<span>Onaylı ${n("approved")}</span><span>Ret ${n("rejected")}</span>`;
    $("#approveAll").disabled = n("pending") === 0;

    const closed = session?.open === false;
    const toggle = $("#toggleSession");
    toggle.textContent = closed ? "Yoklamayı yeniden aç" : "Yoklamayı kapat";
    toggle.className = closed ? "" : "danger";

    list.innerHTML = rows.length === 0
      ? `<li class="empty">Henüz giriş yapan yok.</li>`
      : rows.map((r) => `
        <li class="${r.status}">
          <div class="who">
            <div class="name">${esc(r.name || r.email)}</div>
            <div class="time">${fmtTime(r.checkedInAt)} · ${STATUS_TR[r.status]}</div>
          </div>
          <button class="ok ${r.status === "approved" ? "on" : ""}" data-id="${esc(r.id)}" data-act="approved">Onayla</button>
          <button class="no ${r.status === "rejected" ? "on" : ""}" data-id="${esc(r.id)}" data-act="rejected">Reddet</button>
        </li>`).join("");
  };

  const watch = () => {
    clearSubs();
    date = today();
    sid = `${date}_${sel.value}`;
    session = null;
    rows = [];
    unsubs.push(onSnapshot(doc(db, "sessions", sid), (s) => {
      session = s.data() ?? null; render();
    }, (e) => toast(e.message)));
    const q = query(collection(db, "attendance"), where("date", "==", date), where("classId", "==", sel.value));
    unsubs.push(onSnapshot(q, (snap) => {
      rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.checkedInAt?.toMillis() ?? 0) - (b.checkedInAt?.toMillis() ?? 0));
      render();
    }, (e) => toast(e.message)));
    render();
  };

  sel.onchange = watch;
  watch();

  const decide = (id, status) => updateDoc(doc(db, "attendance", id), {
    status, decidedAt: serverTimestamp(), decidedBy: user.uid,
  });

  list.onclick = (e) => {
    const b = e.target.closest("button[data-act]");
    if (b) decide(b.dataset.id, b.dataset.act).catch((err) => toast(err.message));
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
    await setDoc(doc(db, "sessions", sid), {
      open: !closing, date, classId: sel.value, updatedAt: serverTimestamp(), updatedBy: user.uid,
    }, { merge: true }).catch((err) => toast(err.message));
  };
}
