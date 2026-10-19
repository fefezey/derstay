// Firebase projesi: dersstayim
export const firebaseConfig = {
  apiKey: "AIzaSyDRMDONr8kwuwOY_BQZtthDUu9DvK8zs3g",
  authDomain: "dersstayim.firebaseapp.com",
  projectId: "dersstayim",
  appId: "1:864859948912:web:de0ae2cae8e43856d4b1b5",
};

// Ders saatleri: hafta içi (1 = Pazartesi … 5 = Cuma) her gün 18:50–22:00.
// Değiştirirseniz firestore.rules'taki classNow() varsayılanını da değiştirin
// (ya da Firestore'a settings/schedule belgesi ekleyin). Yoklama 15 dk önce açılır.
export const SCHEDULE = { days: [1, 2, 3, 4, 5], startMin: 18 * 60 + 50, endMin: 22 * 60 };
