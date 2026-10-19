# 🟡 Derstayım

**Ders + Stay (kalmak).**

İngilizcede *stay*, “kalmak” veya “bulunmak” anlamına gelir. Derstayım, Türkçedeki “Dersteyim” ifadesinden ilham alan bir kelime oyunudur.

## 📚 Proje Hakkında

Kurslarda yoklamanın unutulması veya sonradan doldurulması, öğrencilerin derse gerçekten katılıp katılmadığını belirsiz hâle getirebilir.

**Derstayım**, bu sorunu basit bir dijital yoklama sistemiyle çözmeyi hedefler. Öğrenciler kendi telefonlarından yoklama verir, öğretmen ise katılım kayıtlarını canlı olarak görüntüler ve tek dokunuşla onaylar veya reddeder.

Daha az uğraş, daha güvenilir yoklama. 🎯

## ✨ Temel Özellikler

- 📅 Ders programı: hoca dersleri gün ve saatleriyle ekler (ör. General English, Pzt–Cum 10:00–11:30)
- 📱 Öğrenci için tek dokunuşla yoklama: o saatteki ders kendiliğinden "Aktif Ders" olarak çıkar
- 🔐 Google veya e-posta/şifre ile giriş (e-posta hesabı doğrulanmadan yoklama verilemez)
- 🕒 Sunucu saatine göre kayıt
- ✅ Hoca onayı, canlı liste, öğrenci arama, toplu onay
- 📊 Öğrenci için yoklama geçmişi ve katılım oranı

## ⚙️ Nasıl Çalışır

1. Hoca **Dersler** sekmesinden dersleri ekler (ad, başlangıç–bitiş saati, günler).
2. Öğrenci Google ya da e-posta ile girer. Ders saatinde Ana Sayfa'da o ders **Aktif Ders** olarak görünür.
3. Öğrenci **Geldim**'e basar; giriş saati sunucu saatiyle kaydedilir ve "Geldin!" ekranı çıkar.
4. Hoca **Ders Detayı**'nda listeyi canlı görür: ✓ / ✕ ya da **Hepsini onayla**.
5. Hoca **Yoklamayı kapat** deyince o derse kimse giriş yapamaz.

Yoklama ders başlamadan **15 dakika önce** açılır, ders bitince kendiliğinden kapanır.

Teknoloji: düz HTML/CSS/JS + Firebase (Authentication, Firestore, Hosting). Sunucu kurulumu yok, ücretsiz kotada çalışır.

## 🔒 Kurallar (`firestore.rules`)

| Kural | Nasıl sağlanıyor |
|---|---|
| Sadece kendi adına | Kayıttaki `uid` ve isim girişteki hesapla aynı olmak zorunda |
| Sadece bugün ve ders saatinde | Tarih, gün ve saat sunucu saatinden (Türkiye, UTC+3) hesaplanır; ders o gün ve o saatte olmalı |
| Saat değiştirilemez | `checkedInAt` sunucu saatine eşit olmak zorunda |
| Doğrulanmış hesap | E-posta ile kayıt olanlar e-postalarını doğrulamadan yoklama veremez |
| Kendi kaydını değiştiremez/silemez | Güncelleme sadece hocada, silme kimsede yok |
| Onay/ret ve ders ekleme sadece hocada | `teachers` koleksiyonunda olan kişi |
| Yoklama kapanınca giriş yok | `sessions/{tarih_ders}.open == false` ise reddedilir |
| Derse bir kez giriş | Belge kimliği `tarih_ders_uid` |

Kurallar Google sunucusunda çalışır; tarayıcıyı kurcalamak işe yaramaz.

## 🗂️ Proje Yapısı

```
public/            Uygulama (index.html, app.js, style.css, icons.js, config.js)
firestore.rules    Güvenlik kuralları
test/              Kural testleri (Firebase emülatörü ile)
docs/              Ekran görüntüleri
```

## 🛠️ Geliştirme

```
npm install
npm test        # 32 kural testi (Java gerekir)
npm run dev     # http://localhost:5000 – emülatörle yerel deneme
```

## 🚀 Yayına Alma (bir kerelik, ~15 dk)

1. https://console.firebase.google.com → **Proje oluştur**.
2. **Authentication → Sign-in method**: **Google**'ı ve **Email/Password**'ü açın.
3. **Firestore Database → Veritabanı oluştur** (bölge: `eur3`).
4. **Proje ayarları → Web uygulaması ekle** → değerleri `public/config.js`'e yapıştırın.
5. `npx firebase login` → `npm run deploy` (proje `.firebaserc`'de tanımlı: `dersstayim`)
   Adres: `https://PROJE-ID.web.app` (QR kod yapıp sınıf kapısına asın).
6. **Hocayı tanımlayın:** Hoca siteye bir kez girsin. Konsolda **Authentication → Users**'tan UID'sini kopyalayın; **Firestore**'da `teachers` koleksiyonuna bu UID ile bir belge ekleyin (alan: `name`). Sayfa yenilenince hoca ekranı açılır.
7. **Dersleri ekleyin:** Hoca **Dersler → Yeni ders** ile ders programını girer.

🚧 **Proje geliştirme aşamasındadır.**

**Derstayım — Geldim, kaydoldum, dersteyim!** 🟡
