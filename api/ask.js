const dataset = require('../data/dataset.json');

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
      console.error('ask.js error: GEMINI_API_KEY is missing');
      return res.status(500).json({ error: 'GEMINI_API_KEY غير موجود — تأكد من ملف .env وأعد تشغيل vercel dev' });
    }
    const { question } = req.body || {};
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }

    const index = dataset.map(d => ({ title: d.title, keywords: d.keywords }));
    const prompt = `لديك قاعدة معرفة فقهية محدودة التالية (JSON):
${JSON.stringify(index)}

مهمتك فقط: حدد أقرب عنوان مسألة من هذه القائمة يطابق سؤال المستخدم التالي دلالياً، أو أرجع null إن لم توجد مطابقة معقولة. لا تجب عن السؤال بنفسك ولا تستخدم أي معرفة خارج القائمة.
سؤال المستخدم: "${question}"

أعد فقط JSON بدون أي نص إضافي بالشكل: {"title": "..."} أو {"title": null}`;

    const clean = await askGemini(prompt);
    const parsed = JSON.parse(clean);

    const matched = parsed.title ? dataset.find(d => d.title === parsed.title) || null : null;
    return res.status(200).json({ matched });
  } catch (err) {
    console.error('ask.js error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
