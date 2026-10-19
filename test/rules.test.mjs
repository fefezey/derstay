import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp, collection, query, where, getDocs,
} from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "demo-derstayim",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });

// Türkiye saatine göre bugün, haftanın günü ve dakika
const TZ = "Europe/Istanbul";
const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const dow = DOW[new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })];
const [hh, mm] = new Date().toLocaleTimeString("en-GB", { timeZone: TZ }).split(":").map(Number);
const nowMin = hh * 60 + mm;
const ALL = [1, 2, 3, 4, 5, 6, 7];
// Şu an olmayan bir saat aralığı
const away = nowMin > 120 ? { startMin: 0, endMin: 60 } : { startMin: 1300, endMin: 1400 };

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "teachers/hoca"), { name: "Hoca" });
  await setDoc(doc(db, "lessons/ders1"), { name: "General English", teacherId: "hoca", teacherName: "Hoca", days: ALL, startMin: 0, endMin: 1439 });
  await setDoc(doc(db, "lessons/saatdisi"), { name: "Speaking Club", teacherId: "hoca", teacherName: "Hoca", days: ALL, ...away });
  await setDoc(doc(db, "lessons/baskagun"), { name: "Intermediate", teacherId: "hoca", teacherName: "Hoca", days: ALL.filter((d) => d !== dow), startMin: 0, endMin: 1439 });
});

const ctx = (uid, name, extra = {}) =>
  env.authenticatedContext(uid, { name, email: `${uid}@x.com`, email_verified: true, ...extra }).firestore();
const ali = ctx("ali", "Ali");
const ayse = ctx("ayse", "Ayşe");
const hoca = ctx("hoca", "Hoca");
const rec = (uid, name, extra = {}) => ({
  uid, name, email: `${uid}@x.com`, photo: "", date: today, lessonId: "ders1", lessonName: "General English",
  checkedInAt: serverTimestamp(), status: "pending", ...extra,
});
const id = (uid, lesson = "ders1", d = today) => `attendance/${d}_${lesson}_${uid}`;
const sid = (lesson = "ders1") => `sessions/${today}_${lesson}`;

let pass = 0, fail = 0;
const t = async (label, p) => {
  try { await p; pass++; console.log("OK  ", label); } catch (e) { fail++; console.log("FAIL", label, e.message); }
};

// Öğrenci girişi
await t("öğrenci kendi adına derse giriş yapar", assertSucceeds(setDoc(doc(ali, id("ali")), rec("ali", "Ali"))));
await t("aynı derse ikinci kez giriş yapamaz", assertFails(setDoc(doc(ali, id("ali")), rec("ali", "Ali"))));
await t("başkası adına giriş yapamaz", assertFails(setDoc(doc(ali, id("ayse")), rec("ayse", "Ayşe"))));
await t("başka isim yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ali"))));
await t("geçmiş güne ekleyemez", assertFails(setDoc(doc(ayse, id("ayse", "ders1", "2026-01-01")), rec("ayse", "Ayşe", { date: "2026-01-01" }))));
await t("saati kendisi yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", { checkedInAt: Timestamp.fromDate(new Date("2026-01-01")) }))));
await t("kendini onaylı yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", { status: "approved" }))));
await t("ders adını değiştiremez", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", { lessonName: "Başka ders" }))));
await t("ders saati dışında giriş yapamaz", assertFails(setDoc(doc(ayse, id("ayse", "saatdisi")), rec("ayse", "Ayşe", { lessonId: "saatdisi", lessonName: "Speaking Club" }))));
await t("dersin olmadığı gün giriş yapamaz", assertFails(setDoc(doc(ayse, id("ayse", "baskagun")), rec("ayse", "Ayşe", { lessonId: "baskagun", lessonName: "Intermediate" }))));
await t("olmayan derse giriş yapamaz", assertFails(setDoc(doc(ayse, id("ayse", "yok")), rec("ayse", "Ayşe", { lessonId: "yok", lessonName: "Yok" }))));
const dogrulanmamis = ctx("deniz", "Deniz", { email_verified: false });
await t("e-postası doğrulanmamış hesap giriş yapamaz", assertFails(setDoc(doc(dogrulanmamis, id("deniz")), rec("deniz", "Deniz"))));
await t("Google fotoğrafı kabul edilir", assertSucceeds(setDoc(doc(ctx("can", "Can"), id("can")), rec("can", "Can", { photo: "https://lh3.googleusercontent.com/a/abc=s96-c" }))));
await t("başka siteden fotoğraf olmaz", assertFails(setDoc(doc(ctx("ece", "Ece"), id("ece")), rec("ece", "Ece", { photo: "https://kotu.site/resim.png" }))));

// Öğrencinin kayıtları
await t("öğrenci kaydını değiştiremez", assertFails(updateDoc(doc(ali, id("ali")), { status: "approved" })));
await t("öğrenci kaydını silemez", assertFails(deleteDoc(doc(ali, id("ali")))));
await t("öğrenci kendi kaydını okur", assertSucceeds(getDoc(doc(ali, id("ali")))));
await t("öğrenci başkasınınkini okuyamaz", assertFails(getDoc(doc(ayse, id("ali")))));
await t("öğrenci kendi geçmişini listeler", assertSucceeds(getDocs(query(collection(ali, "attendance"), where("uid", "==", "ali")))));
await t("öğrenci herkesin kaydını listeleyemez", assertFails(getDocs(query(collection(ali, "attendance"), where("date", "==", today)))));
await t("öğrenci yoklamayı kapatamaz", assertFails(setDoc(doc(ali, sid()), { open: false })));

// Dersler
const lesson = { name: "Yeni Ders", teacherId: "hoca", teacherName: "Hoca", days: [1, 3], startMin: 600, endMin: 690 };
await t("öğrenci ders ekleyemez", assertFails(setDoc(doc(ali, "lessons/x1"), { ...lesson, teacherId: "ali" })));
await t("hoca ders ekler", assertSucceeds(setDoc(doc(hoca, "lessons/x2"), lesson)));
await t("bitişi başlangıçtan önce ders olmaz", assertFails(setDoc(doc(hoca, "lessons/x3"), { ...lesson, startMin: 700, endMin: 600 })));
await t("öğrenci ders programını görür", assertSucceeds(getDocs(collection(ali, "lessons"))));

// Hoca
await t("hoca ders listesini görür", assertSucceeds(getDocs(query(collection(hoca, "attendance"), where("date", "==", today), where("lessonId", "==", "ders1")))));
await t("hoca onaylar", assertSucceeds(updateDoc(doc(hoca, id("ali")), { status: "approved", decidedAt: serverTimestamp(), decidedBy: "hoca" })));
await t("hoca giriş saatini değiştiremez", assertFails(updateDoc(doc(hoca, id("ali")), { checkedInAt: serverTimestamp() })));
await t("hoca yoklamayı kapatır", assertSucceeds(setDoc(doc(hoca, sid()), { open: false })));
await t("kapandıktan sonra giriş yok", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe"))));
await t("hoca yeniden açar", assertSucceeds(setDoc(doc(hoca, sid()), { open: true })));
await t("açılınca giriş olur", assertSucceeds(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe"))));

console.log(`\n${pass} geçti, ${fail} kaldı`);
await env.cleanup();
process.exit(fail ? 1 : 0);
