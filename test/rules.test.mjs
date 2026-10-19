import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "demo-derstayim",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "teachers/hoca"), { name: "Hoca" }));

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const ali = env.authenticatedContext("ali", { name: "Ali", email: "ali@x.com" }).firestore();
const ayse = env.authenticatedContext("ayse", { name: "Ayşe", email: "ayse@x.com" }).firestore();
const hoca = env.authenticatedContext("hoca", { name: "Hoca", email: "h@x.com" }).firestore();
const rec = (uid, name, email, extra = {}) => ({ uid, name, email, classId: "Texas", date: today, checkedInAt: serverTimestamp(), status: "pending", ...extra });
const id = (uid, d = today) => `attendance/${d}_Texas_${uid}`;
let pass = 0, fail = 0;
const t = async (label, p) => { try { await p; pass++; console.log("OK  ", label); } catch (e) { fail++; console.log("FAIL", label, e.message); } };

await t("öğrenci kendi adına bugün giriş yapar", assertSucceeds(setDoc(doc(ali, id("ali")), rec("ali", "Ali", "ali@x.com"))));
await t("ikinci kez giriş yapamaz", assertFails(setDoc(doc(ali, id("ali")), rec("ali", "Ali", "ali@x.com"))));
await t("başkası adına giriş yapamaz", assertFails(setDoc(doc(ali, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com"))));
await t("başka isim yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ali", "ayse@x.com"))));
await t("geçmiş güne ekleyemez", assertFails(setDoc(doc(ayse, id("ayse", "2026-01-01")), rec("ayse", "Ayşe", "ayse@x.com", { date: "2026-01-01" }))));
await t("saati kendisi yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com", { checkedInAt: Timestamp.fromDate(new Date("2026-01-01")) }))));
await t("kendini onaylı yazamaz", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com", { status: "approved" }))));
await t("öğrenci kaydını değiştiremez", assertFails(updateDoc(doc(ali, id("ali")), { status: "approved" })));
await t("öğrenci kaydını silemez", assertFails(deleteDoc(doc(ali, id("ali")))));
await t("öğrenci kendi kaydını okur", assertSucceeds(getDoc(doc(ali, id("ali")))));
await t("öğrenci başkasınınkini okuyamaz", assertFails(getDoc(doc(ayse, id("ali")))));
await t("öğrenci yoklamayı kapatamaz", assertFails(setDoc(doc(ali, `sessions/${today}_Texas`), { open: false })));
await t("hoca listeyi görür", assertSucceeds(getDocs(query(collection(hoca, "attendance"), where("date", "==", today), where("classId", "==", "Texas")))));
await t("hoca onaylar", assertSucceeds(updateDoc(doc(hoca, id("ali")), { status: "approved", decidedAt: serverTimestamp(), decidedBy: "hoca" })));
await t("hoca giriş saatini değiştiremez", assertFails(updateDoc(doc(hoca, id("ali")), { checkedInAt: serverTimestamp() })));
await t("hoca yoklamayı kapatır", assertSucceeds(setDoc(doc(hoca, `sessions/${today}_Texas`), { open: false })));
await t("kapandıktan sonra giriş yok", assertFails(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com"))));
await t("hoca yeniden açar", assertSucceeds(setDoc(doc(hoca, `sessions/${today}_Texas`), { open: true })));
await t("açılınca giriş olur", assertSucceeds(setDoc(doc(ayse, id("ayse")), rec("ayse", "Ayşe", "ayse@x.com"))));
console.log(`\n${pass} geçti, ${fail} kaldı`);
await env.cleanup();
process.exit(fail ? 1 : 0);
