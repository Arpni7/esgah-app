const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

async function askGemini(prompt, attempt = 1) {
  const r = await fetch(GEMINI_URL, {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    method: 'POST',
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await r.json();
  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    const isOverloaded = /high demand|overloaded|503/i.test(msg);
    if (isOverloaded && attempt < 3) {
      await new Promise(res => setTimeout(res, attempt * 1500));
      return askGemini(prompt, attempt + 1);
    }
    throw new Error(`Gemini API error: ${msg}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    throw new Error(`Gemini returned no text. Raw response: ${JSON.stringify(data)}`);
  }
  return text.replace(/```json|```/g, '').trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!GEMINI_KEY) {
      console.error('listen.js error: GEMINI_API_KEY is missing');
      return res.status(500).json({ error: 'GEMINI_API_KEY غير موجود — تأكد من ملف .env وأعد تشغيل vercel dev' });
    }
    const { transcript, newChunk, lang } = req.body || {};
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'transcript is required' });
    }

    const prompt = `أنت مساعد يحلل خطبة أو درساً إسلامياً.
النص الكامل الملتقط حتى الآن (قد يحتوي أخطاء تفريغ صوتي بسيطة):
"""${transcript}"""

المقطع الأحدث فقط الذي يجب ترجمته إلى ${lang || 'الإنجليزية'}:
"""${newChunk || transcript.slice(-400)}"""

مهامك:
1. لخص أهم أفكار الخطبة إجمالاً حتى الآن في 3 إلى 5 نقاط قصيرة بالعربية.
2. ترجم المقطع الأحدث فقط إلى اللغة المطلوبة.
3. استخرج فقط الآيات القرآنية والأحاديث النبوية المذكورة فعلياً (بنصها أو بمعناها) داخل النص الكامل أعلاه — لا تخترع أو تضف أي آية أو حديث لم يُذكر صراحة. اكتب كل واحدة بنصها كما وردت إن أمكن، مع ذكر السورة ورقم الآية للقرآن، أو تخريج مختصر للحديث إن كان معروفاً ومحدداً بثقة، وإلا فاتركه بدون تخريج. إن لم توجد أي آية أو حديث مذكور، أرجع مصفوفة فارغة.

أعد JSON فقط بدون أي نص إضافي بالشكل:
{"summary": ["نقطة 1", "نقطة 2"], "translation": "نص الترجمة", "quranHadith": [{"text": "نص الآية أو الحديث", "reference": "المصدر إن وجد أو نص فارغ"}]}`;

    const clean = await askGemini(prompt);
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('listen.js error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
