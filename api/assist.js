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
  if (!text) throw new Error(`Gemini returned no text. Raw response: ${JSON.stringify(data)}`);
  return text.trim();
}

function entryContext(entry) {
  let ctx = `عنوان المسألة: ${entry.title}\nالأدلة: ${entry.evidences.join(' | ')}\n`;
  if (entry.views) {
    ctx += `رأي الحنفية: ${entry.views.hanafi}\nرأي المالكية: ${entry.views.maliki}\nرأي الشافعية: ${entry.views.shafii}\nرأي الحنابلة: ${entry.views.hanbali}\nالراجح: ${entry.rajih}\n`;
  } else {
    ctx += `فتوى الشيخ ${entry.scholar || ''}: ${entry.rajih}\n`;
  }
  return ctx;
}

function historyText(history) {
  return (history || []).map(h => `${h.role === 'user' ? 'المستخدم' : 'المساعد'}: ${h.content}`).join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!GEMINI_KEY) {
      console.error('assist.js error: GEMINI_API_KEY is missing');
      return res.status(500).json({ error: 'GEMINI_API_KEY غير موجود — تأكد من ملف .env وأعد تشغيل vercel dev' });
    }
    const { mode, title, history = [], message = '' } = req.body || {};
    const entry = dataset.find(d => d.title === title);
    if (!entry) return res.status(400).json({ error: 'issue not found in dataset' });
    const ctx = entryContext(entry);
    const hist = historyText(history);

    let prompt;
    if (mode === 'chat') {
      prompt = `أنت مساعد فقهي يحاور المستخدم حول المسألة التالية بناءً على المعطيات الموثقة فقط:
${ctx}
سجل المحادثة السابق:
${hist}

سؤال المستخدم الجديد: "${message}"

أجب بأسلوب حواري طبيعي مباشر (نص عادي بدون JSON)، مستنداً فقط للمعطيات أعلاه. إن سأل عن شيء خارج نطاقها، وضّح بأمانة أن هذا خارج قاعدة المعرفة المتاحة هنا وينصح بمراجعة أهل العلم. اجعل ردك مختصراً (٣-٥ أسطر).`;
    } else if (mode === 'challenge') {
      if (!history.length) {
        prompt = `أنت شخص متشكك تطرح اعتراضاً واقعياً محترماً (لا هجومياً) على الحكم الشرعي التالي، وكأنك تتحدث مباشرة مع من يدافع عنه:
${ctx}
اطرح اعتراضاً واحداً مختصراً (سطرين كحد أقصى)، نص عادي بدون JSON.`;
      } else {
        prompt = `أنت شخص متشكك تحاور من يدافع عن الحكم الشرعي التالي:
${ctx}
سجل الحوار:
${hist}

رد المستخدم الأخير: "${message}"

قيّم رده بجملة واحدة قصيرة (هل كان مقنعاً؟)، ثم إما اطرح اعتراضاً تالياً مختلفاً إن رأيت مجالاً لذلك، أو أنهِ الحوار بعبارة تشجيعية موجزة إن كان رده مقنعاً بما فيه الكفاية. الرد الكلي ٣-٤ أسطر كحد أقصى، نص عادي بدون JSON.`;
      }
    } else if (mode === 'simplify_child') {
      prompt = `بسّط الحكم الشرعي التالي بأسلوب قصة قصيرة جداً ولغة بسيطة تناسب طفلاً بين ٨-١٢ سنة:
${ctx}
اكتب ٤-٦ جمل فقط، نص عادي بدون JSON.`;
    } else if (mode === 'simplify_new') {
      prompt = `اشرح الحكم الشرعي التالي بلغة بسيطة جداً بدون مصطلحات فقهية معقدة، تناسب شخصاً دخل الإسلام حديثاً، مع خلفية مختصرة عن الحكمة منه:
${ctx}
اكتب ٥-٧ جمل بلغة ودودة وسهلة، نص عادي بدون JSON.`;
    } else if (mode === 'action_plan') {
      prompt = `بناءً على الحكم الشرعي التالي، اكتب خطة عملية من ٣ إلى ٤ خطوات واضحة ومحددة تساعد شخصاً على تطبيق هذا الحكم فعلياً في حياته اليومية:
${ctx}
أعد فقط قائمة الخطوات، كل خطوة على سطر مستقل مرقّم، نص عادي بدون JSON.`;
    } else {
      return res.status(400).json({ error: 'unknown mode' });
    }

    const reply = await askGemini(prompt);
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('assist.js error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
