// Günün kelimesi: her gün sıradaki kelime gösterilir. İstediğiniz gibi ekleyip çıkarabilirsiniz.
export const WORDS = [
  ["punctual", "dakik", "She is always punctual for class."],
  ["attend", "katılmak", "I attend English lessons twice a week."],
  ["present", "burada, mevcut", "Teacher: Ali? — Present!"],
  ["absent", "gelmemiş, yok", "Nobody was absent today."],
  ["on time", "zamanında", "We started the lesson on time."],
  ["homework", "ödev", "Did you finish your homework?"],
  ["fluent", "akıcı", "Practice every day to become fluent."],
  ["practice", "pratik yapmak", "Let's practice speaking together."],
  ["improve", "geliştirmek", "My English is improving fast."],
  ["confident", "kendinden emin", "I feel confident when I speak now."],
  ["curious", "meraklı", "Stay curious and keep asking questions."],
  ["progress", "ilerleme", "You've made great progress this month."],
  ["achieve", "başarmak", "You can achieve anything with effort."],
  ["effort", "çaba", "Every small effort counts."],
  ["goal", "hedef", "My goal is to study abroad."],
  ["abroad", "yurt dışı", "She wants to live abroad one day."],
  ["schedule", "program", "What's your schedule this week?"],
  ["remember", "hatırlamak", "Remember to bring your notebook."],
  ["brilliant", "harika", "That was a brilliant answer!"],
  ["keep going", "devam et", "Don't stop — keep going!"],
  ["challenge", "zorluk, meydan okuma", "Grammar is a challenge, but a fun one."],
  ["opportunity", "fırsat", "Every lesson is an opportunity to learn."],
  ["knowledge", "bilgi", "Knowledge grows when you share it."],
  ["patience", "sabır", "Learning a language takes patience."],
  ["motivation", "motivasyon", "Music is my motivation to learn English."],
  ["succeed", "başarılı olmak", "If you work hard, you will succeed."],
  ["journey", "yolculuk", "Learning English is a long journey."],
  ["vocabulary", "kelime bilgisi", "Read books to grow your vocabulary."],
  ["mistake", "hata", "Mistakes help us learn."],
  ["enjoy", "keyfini çıkarmak", "Enjoy the lesson!"],
];

export function wordOfTheDay(date) {
  const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  return WORDS[day % WORDS.length];
}
