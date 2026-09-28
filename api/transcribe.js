const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

async function askGeminiWithMedia(prompt, mimeType, base64Data, attempt = 1) {
  const r = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: prompt },
        ],
      }],
    }),
  });
  const data = await r.json();
  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    const isOverloaded = /high demand|overloaded|503/i.test(msg);
    if (isOverloaded && attempt < 3) {
      await new Promise(res => setTimeout(res, attempt * 1500));
      return askGeminiWithMedia(prompt, mimeType, base64Data, attempt + 1);
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
      console.error('transcribe.js error: GEMINI_API_KEY is missing');
      return res.status(500).json({ error: 'GEMINI_API_KEY غير موجود — تأكد من ملف .env وأعد تشغيل vercel dev' });
    }
    const { mimeType, data: base64Data, lang } = req.body || {};
    if (!mimeType || !base64Data) {
      return res.status(400).json({ error: 'mimeType and data are required' });
    }

    const prompt = `هذا ملف وسائط (صوت أو فيديو أو صورة) لخطبة أو درس إسلامي أو مقتطف مكتوب.
مهامك:
1. فرّغ الكلام المسموع أو النص المكتوب/المصوَّر بدقة إلى نص عربي كامل.
2. لخص أهم الأفكار في 3 إلى 5 نقاط قصيرة بالعربية.
3. ترجم ملخصاً موجزاً (فقرة واحدة) إلى ${lang || 'الإنجليزية'}.
4. استخرج فقط الآيات القرآنية والأحاديث النبوية المذكورة فعلياً داخل المادة — لا تخترع أو تضف أي آية أو حديث لم يُذكر صراحة. اكتب كل واحدة بنصها كما وردت، مع ذكر السورة ورقم الآية للقرآن، أو تخريج مختصر للحديث إن كان معروفاً بثقة، وإلا اتركه بدون تخريج. إن لم توجد، أرجع مصفوفة فارغة.

أعد JSON فقط بدون أي نص إضافي بالشكل:
{"transcript": "النص الكامل المفرّغ", "summary": ["نقطة 1", "نقطة 2"], "translation": "الترجمة الموجزة", "quranHadith": [{"text": "نص الآية أو الحديث", "reference": "المصدر إن وجد"}]}`;

    const clean = await askGeminiWithMedia(prompt, mimeType, base64Data);
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('transcribe.js error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Vercel: allow a larger request body for media uploads (platform hard cap still applies, ~4.5MB)
module.exports.config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};
