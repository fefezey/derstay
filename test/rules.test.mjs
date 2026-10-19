import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "demo-derstayim",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
const ALL = [1, 2, 3, 4, 5, 6, 7];
const setSchedule = (data) => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "settings/schedule"), data));
await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "teachers/hoca"), { name: "Hoca" }));
await setSchedule({ days: ALL, startMin: 0, endMin: 1439 }); // testler her saatte çalışsın

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const TZ = "Europe/Istanbul";
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const dow = DOW[new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })];
const [hh, mm] = new Date().toLocaleTimeString("en-GB", { timeZone: TZ }).split(":").map(Number);
const nowMin = hh * 60 + mm;
const ctx = (uid, name, email, extra = {}) => env.authenticatedContext(uid, { name, email, email_verified: true, ...extra }).firestore();
const ali = ctx("ali", "Ali", "ali@x.com");
const ayse = ctx("ayse", "Ayşe", "ayse@x.com");
const hoca = ctx("hoca", "Hoca", "h@x.com");
const rec = (uid, name, email, extra = {}) => ({ uid, name, email, photo: "", date: today, checkedInAt: serverTimestamp(), status: "pending", ...extra });
const id = (uid, d = today) => `attendance/${d}_${uid}`;
let pass = 0, fail = 0;
const t = async (label, p) => { try { await p; pass++; console.log("OK  ", label); } catch (e) { fail++; console.log("FAIL", label, e.message); } };

await t("öğrenci kendi adına bugün giriş yapar", assertSucceeds(setDoc(doc(ali, id("ali")), rec("ali", "Ali", "ali@x.com"))));
await t("ikinci kez giriş yapamaz", assertFails(setDoc(doc(ali, id("ali")), rec("ali", "Ali", "ali@x.com"))));
await t("başkası adına giriş yapamaz", assertFails(setDoc(doc(ali, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com"))));
await t("başka isim yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ali", "ayse@x.com"))));
await t("geçmiş güne ekleyemez", assertFails(setDoc(doc(ayse, id("ayse", "2026-01-01")), rec("ayse", "Ayşe", "ayse@x.com", { date: "2026-01-01" }))));
await t("saati kendisi yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com", { checkedInAt: Timestamp.fromDate(new Date("2026-01-01")) }))));
await t("kendini onaylı yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com", { status: "approved" }))));
// Ders saati ve doğrulama
await setSchedule({ days: ALL, ...(nowMin > 120 ? { startMin: 0, endMin: 60 } : { startMin: 1300, endMin: 1400 }) });
await t("ders saati dışında giriş yapamaz", assertFails(setDoc(doc(ctx("mert", "Mert", "m@x.com"), id("mert")), rec("mert", "Mert", "m@x.com"))));
await setSchedule({ days: ALL.filter((d) => d !== dow), startMin: 0, endMin: 1439 });
await t("ders olmayan gün giriş yapamaz", assertFails(setDoc(doc(ctx("mert", "Mert", "m@x.com"), id("mert")), rec("mert", "Mert", "m@x.com"))));
await setSchedule({ days: ALL, startMin: 0, endMin: 1439 });
await t("e-postası doğrulanmamış hesap giriş yapamaz", assertFails(setDoc(doc(ctx("deniz", "Deniz", "d@x.com", { email_verified: false }), id("deniz")), rec("deniz", "Deniz", "d@x.com"))));
await t("öğrenci ders saatini değiştiremez", assertFails(setDoc(doc(ali, "settings/schedule"), { days: ALL, startMin: 0, endMin: 1439 })));
await t("hoca ders saatini yazar", assertSucceeds(setDoc(doc(hoca, "settings/schedule"), { days: [1, 2, 3, 4, 5], startMin: 1130, endMin: 1320 })));
await t("geçersiz ders saati olmaz", assertFails(setDoc(doc(hoca, "settings/schedule"), { days: [1], startMin: 900, endMin: 800 })));
await setSchedule({ days: ALL, startMin: 0, endMin: 1439 });
await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), "settings/schedule")));
const inDefault = dow <= 5 && nowMin >= 1115 && nowMin <= 1320;
await t("ayar yoksa varsayılan saat geçerli (hafta içi 18:35–22:00)", (inDefault ? assertSucceeds : assertFails)(setDoc(doc(ctx("mert", "Mert", "m@x.com"), id("mert")), rec("mert", "Mert", "m@x.com"))));
await setSchedule({ days: ALL, startMin: 0, endMin: 1439 });
await t("öğrenci ders saatini okur", assertSucceeds(getDoc(doc(ali, "settings/schedule"))));

await t("öğrenci kaydını değiştiremez", assertFails(updateDoc(doc(ali, id("ali")), { status: "approved" })));
await t("öğrenci kaydını silemez", assertFails(deleteDoc(doc(ali, id("ali")))));
await t("öğrenci kendi kaydını okur", assertSucceeds(getDoc(doc(ali, id("ali")))));
await t("öğrenci kendi geçmişini listeler", assertSucceeds(getDocs(query(collection(ali, "attendance"), where("uid", "==", "ali")))));
await t("öğrenci başkasının geçmişini listeleyemez", assertFails(getDocs(query(collection(ali, "attendance"), where("uid", "==", "ayse")))));
await t("öğrenci başkasınınkini okuyamaz", assertFails(getDoc(doc(ayse, id("ali")))));
await t("öğrenci yoklamayı kapatamaz", assertFails(setDoc(doc(ali, `sessions/${today}`), { open: false })));
await t("hoca listeyi görür", assertSucceeds(getDocs(query(collection(hoca, "attendance"), where("date", "==", today)))));
await t("hoca onaylar", assertSucceeds(updateDoc(doc(hoca, id("ali")), { status: "approved", decidedAt: serverTimestamp(), decidedBy: "hoca" })));
await t("hoca giriş saatini değiştiremez", assertFails(updateDoc(doc(hoca, id("ali")), { checkedInAt: serverTimestamp() })));
await t("hoca yoklamayı kapatır", assertSucceeds(setDoc(doc(hoca, `sessions/${today}`), { open: false })));
await t("kapandıktan sonra giriş yok", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com"))));
await t("hoca yeniden açar", assertSucceeds(setDoc(doc(hoca, `sessions/${today}`), { open: true })));
await t("açılınca giriş olur", assertSucceeds(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com"))));
await t("Google fotoğrafı kabul edilir", assertSucceeds(setDoc(doc(ctx("can", "Can", "can@x.com"), id("can")), rec("can", "Can", "can@x.com", { photo: "https://lh3.googleusercontent.com/a/abc=s96-c" }))));
await t("başka siteden fotoğraf olmaz", assertFails(setDoc(doc(ctx("ece", "Ece", "ece@x.com"), id("ece")), rec("ece", "Ece", "ece@x.com", { photo: "https://kotu.site/resim.png" }))));
const jpeg = "data:image/jpeg;base64," + "A".repeat(40000);
await t("öğrenci kendi fotoğrafını yükler", assertSucceeds(setDoc(doc(ali, "profiles/ali"), { photo: jpeg, updatedAt: serverTimestamp() })));
await t("başkasının fotoğrafını değiştiremez", assertFails(setDoc(doc(ali, "profiles/ayse"), { photo: jpeg, updatedAt: serverTimestamp() })));
await t("çok büyük fotoğraf olmaz", assertFails(setDoc(doc(ali, "profiles/ali"), { photo: "data:image/jpeg;base64," + "A".repeat(210000), updatedAt: serverTimestamp() })));
await t("resim olmayan veri olmaz", assertFails(setDoc(doc(ali, "profiles/ali"), { photo: "merhaba", updatedAt: serverTimestamp() })));
await t("hoca öğrencinin fotoğrafını görür", assertSucceeds(getDoc(doc(hoca, "profiles/ali"))));
await t("başka öğrenci fotoğrafı göremez", assertFails(getDoc(doc(ayse, "profiles/ali"))));
await t("öğrenci fotoğrafını kaldırır", assertSucceeds(deleteDoc(doc(ali, "profiles/ali"))));
console.log(`\n${pass} geçti, ${fail} kaldı`);
await env.cleanup();
process.exit(fail ? 1 : 0);
