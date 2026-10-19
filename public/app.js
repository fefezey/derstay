import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where,
  serverTimestamp, writeBatch, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
import { wordOfTheDay } from "./words.js";

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
const STATUS_TR = { pending: "BEKLİYOR", approved: "ONAYLI", rejected: "RET" };

const ICONS = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

// Tarih her zaman Türkiye saatine göre (sunucu da aynısını kontrol eder)
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const prettyDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("tr-TR", {
  weekday: "long", day: "numeric", month: "long",
});
const shortDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
const fmtTime = (ts) => ts
  ? ts.toDate().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
  : "…";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0].toLocaleUpperCase("tr-TR")).join("");
const avatar = (name, photo) => photo
  ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`
  : esc(initials(name));

function nowParts() {
  const [h, m, s] = new Date().toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false }).split(":").map(Number);
  return { h, m, s };
}

function greeting() {
  const { h } = nowParts();
  return h < 12 ? ["Good morning", "Günaydın"] : h < 18 ? ["Good afternoon", "İyi günler"] : ["Good evening", "İyi akşamlar"];
}

let unsubs = [];
function clearSubs() { unsubs.forEach((u) => u()); unsubs = []; }

function show(id) {
  for (const s of document.querySelectorAll("section.view")) s.hidden = s.id !== id;
  $("#dock").hidden = id !== "teacher";
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

// Big Ben kadranı (Roma rakamları, canlı akrep/yelkovan)
function clockSVG() {
  const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  let ticks = "";
  for (let i = 0; i < 60; i++) {
    const long = i % 5 === 0;
    ticks += `<line class="cf-tick${long ? " l" : ""}" x1="100" y1="${long ? 16 : 18}" x2="100" y2="${long ? 26 : 22}" transform="rotate(${i * 6} 100 100)"/>`;
  }
  const nums = ROMAN.map((r, i) => {
    const a = (i * 30 * Math.PI) / 180;
    return `<text class="cf-num" x="${(100 + 62 * Math.sin(a)).toFixed(1)}" y="${(100 - 62 * Math.cos(a)).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${r}</text>`;
  }).join("");
  return `<svg viewBox="0 0 200 200" aria-hidden="true">
    <circle class="cf-rim" cx="100" cy="100" r="99"/>
    <circle class="cf-ring" cx="100" cy="100" r="92"/>
    <circle class="cf-face" cx="100" cy="100" r="88"/>
    <circle class="cf-ring" cx="100" cy="100" r="44"/>
    ${ticks}${nums}
    <line id="handH" class="hand h" x1="100" y1="108" x2="100" y2="60"/>
    <line id="handM" class="hand m" x1="100" y1="112" x2="100" y2="38"/>
    <line id="handS" class="hand s" x1="100" y1="118" x2="100" y2="30"/>
    <circle class="cf-pin" cx="100" cy="100" r="6"/>
  </svg>`;
}

function barcode(seed) {
  let x = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  let bars = "";
  for (let i = 0; i < 22; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    bars += `<i style="width:${1 + (x >>> 29)}px"></i>`;
  }
  return bars;
}

function startStudent(user) {
  show("student");
  const btn = $("#checkin");
  const pass = $("#pass");
  const stamp = $("#stamp");
  const name = user.displayName || user.email;
  const firstName = (user.displayName ?? "").split(" ")[0];

  $("#clockface").innerHTML = clockSVG();
  $("#passName").textContent = name;
  $("#barcode").innerHTML = barcode(user.uid);

  const tick = () => {
    const { h, m, s } = nowParts();
    $("#handH").style.transform = `rotate(${(h % 12) * 30 + m / 2}deg)`;
    $("#handM").style.transform = `rotate(${m * 6 + s / 10}deg)`;
    $("#handS").style.transform = `rotate(${s * 6}deg)`;
    const [en, tr] = greeting();
    $("#greetEn").textContent = `${en}${firstName ? ", " + firstName : ""}!`;
    $("#greetTr").textContent = `${tr} · ${prettyDate(today())}`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  unsubs.push(() => clearInterval(timer));

  let date, session, record, loaded, lastStamp;

  const showPass = (kind, stampText, time, note) => {
    btn.hidden = true;
    pass.hidden = false;
    pass.className = `pass ${kind}`;
    $("#passDate").textContent = shortDate(date);
    $("#passTime").textContent = time;
    $("#passNote").textContent = note;
    if (lastStamp !== stampText) {
      lastStamp = stampText;
      stamp.innerHTML = stampText;
      stamp.classList.remove("go");
      void stamp.offsetWidth; // animasyonu yeniden başlat
      stamp.classList.add("go");
    }
  };

  const render = () => {
    const [word, tr, example] = wordOfTheDay(date);
    $("#wotd").innerHTML = `
      <div class="wotd-badge">WORD<br>OF THE<br>DAY</div>
      <div>
        <div class="wotd-word">${esc(word)} <span>· ${esc(tr)}</span></div>
        <div class="wotd-ex">“${esc(example)}”</div>
      </div>`;

    if (loaded < 2) { btn.hidden = true; pass.hidden = true; return; }
    const time = record ? fmtTime(record.checkedInAt) : "—";
    if (record?.status === "approved") {
      showPass("approved", "DERSTEYİM ✓", time, "Hocan onayladı. İyi dersler!");
    } else if (record?.status === "rejected") {
      showPass("rejected", "REDDEDİLDİ", time, "Bir yanlışlık varsa hocanla konuş.");
    } else if (record) {
      showPass("pending", "BEKLİYOR", time, "Kaydın alındı, hocanın onayı bekleniyor.");
    } else if (session?.open === false) {
      showPass("closed", "KAPANDI", time, "Bugün için artık giriş alınmıyor.");
    } else {
      pass.hidden = true;
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
  const firstName = (user.displayName ?? "").split(" ")[0];
  const RING = 2 * Math.PI * 52;
  $("#ringFg").style.strokeDasharray = RING;

  let date, session, rows = [];
  const seen = new Set();

  const render = () => {
    const [en] = greeting();
    $("#tGreet").textContent = `${en}${firstName ? ", " + firstName : ""}!`;
    $("#teacherDate").textContent = prettyDate(date);

    const n = (s) => rows.filter((r) => r.status === s).length;
    $("#nPending").textContent = n("pending");
    $("#nApproved").textContent = n("approved");
    $("#nRejected").textContent = n("rejected");
    $("#ringNum").textContent = n("approved");
    $("#ringOf").textContent = `/ ${rows.length} onaylı`;
    $("#ringFg").style.strokeDashoffset = RING * (1 - (rows.length ? n("approved") / rows.length : 0));

    const approveAll = $("#approveAll");
    approveAll.disabled = n("pending") === 0;
    approveAll.textContent = n("pending") ? `Hepsini onayla (${n("pending")})` : "Hepsini onayla";

    const closed = session?.open === false;
    const pill = $("#sessionPill");
    pill.textContent = closed ? "KAPALI" : "CANLI";
    pill.classList.toggle("closed", closed);
    const toggle = $("#toggleSession");
    toggle.textContent = closed ? "Yeniden aç" : "Yoklamayı kapat";
    toggle.classList.toggle("danger", !closed);

    list.innerHTML = rows.length === 0
      ? `<li class="empty">
           <h3>Henüz kimse gelmedi</h3>
           <p>Öğrenciler "Geldim"e bastıkça burada belirecek.</p>
           <svg><use href="#skyline"/></svg>
         </li>`
      : rows.map((r) => {
          const isNew = !seen.has(r.id);
          seen.add(r.id);
          return `
          <li class="row ${r.status}${isNew ? " new" : ""}">
            <div class="row-main">
              <div class="avatar">${avatar(r.name || r.email, r.photo)}</div>
              <div class="who">
                <div class="name">${esc(r.name || r.email)}</div>
                <div class="meta"><span class="time">${fmtTime(r.checkedInAt)}</span><span class="tag">${STATUS_TR[r.status]}</span></div>
              </div>
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
