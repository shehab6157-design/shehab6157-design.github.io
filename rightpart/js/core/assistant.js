// "Ask": answers a worker's question from the company's own data (parts and their codes, steps,
// BOMs, engineering changes, integrity findings). Every answer is built from records and lists
// its sources, so it can never invent a torque value or a part number. It works offline.
// Questions it cannot match get the closest search results, and can be passed to the optional
// AI (backend/supabase/functions/ask) together with the records retrieved here.
// Pure module: no DOM.

import { search, resolveCode, stepParts, whereUsed, torqueText, otherCodes, normCode, CODE_TYPES, qtyNumber } from './model.js';
import { decodeDesignation, summarizeDecoded } from './decode.js';
import { findLookalikes, compareParts, shortDifference } from './lookalike.js';
import { sizeLabel, isFastener, CATEGORY_PLURALS } from './dims.js';
import { t, lower, listJoin } from './i18n.js';
import { CATEGORY_LABELS } from './dims.js';

const CATEGORY_LABEL = (c) => CATEGORY_LABELS[c] || c;

// Question words. English, Hebrew and Arabic first, then every language the interface ships in.
// Short words are matched as whole words (W), so "как" (how) does not fire inside "какой" (which).
// (\b only works for Latin letters in JavaScript.)
const W = (...ws) => ws.map((w) => `(?<![\\p{L}\\p{M}])${w}(?![\\p{L}\\p{M}])`).join('|');
const re = (base, ...more) => new RegExp([base.source, ...more].filter(Boolean).join('|'), 'iu');
const KW = {
  help: re(/^(help|hi|hello|hey|start|menu|what can you do\??|\?)$|^(שלום|עזרה|היי|مرحبا|مساعدة|اهلا|أهلا)$/,
    '^(привет|помощь|помогите|привіт|допомога|hola|ayuda|olá|ola|ajuda|bonjour|aide|hallo|hilfe|ciao|aiuto|cześć|czesc|pomoc|salut|ajutor|merhaba|yardım|yardim|你好|帮助|帮忙|xin chào|giúp|giúp đỡ|สวัสดี|ช่วย|ช่วยด้วย|नमस्ते|मदद|kumusta|tulong|halo|bantuan|ሰላም|እርዳታ)[!?.]?$'),
  torque: re(/\btorque\b|\bhow (tight|hard)\b|\d\s?n\s?[·.]?\s?m\b|\bnm\b|מומנט|عزم/,
    'момент', 'затяж', 'затягу', 'крутн', '\\bapriete', '\\baperto', W('couple'), 'serrage', 'drehmoment', 'anzugs', '\\bcoppia', 'serraggio', 'dokręc', 'dokrec', '\\bcuplu', 'strânger', '\\btork', 'sıkma', '扭矩', '力矩', 'lực siết', 'mô-men', 'mô men', 'แรงบิด', 'टॉर्क', 'बलाघूर्ण', '\\bhigpit', '\\btorsi', 'ቶርክ'),
  tool: re(/\btools?\b|\bbits?\b|\bkeys?\b|\bdrivers?\b|\bspanner\b|\bwrench\b|\ballen\b|\bscrewdriver\b|כלי|מפתח|ביט|מברג|أداة|ادوات|أدوات|مفك|مفتاح/,
    'инструмент', 'отвёртк', 'отвертк', W('ключ', 'бита', 'біта'), 'інструмент', 'викрутк', 'herramient', 'destornillador', W('llave', 'punta'), 'ferramenta', W('chave'), '\\boutil', 'tournevis', W('clé', 'cle', 'embout'), 'werkzeug', 'schraubendreher', 'schlüssel', 'utensil', 'attrezz', 'cacciavite', W('chiave'), 'narzędzi', 'narzedzi', 'wkrętak', 'śrubokręt', W('klucz'), 'unealt', W('sculă', 'scule'), 'șurubelniț', 'surubelnit', W('cheie', 'cheia'), W('alet'), 'tornavida', 'anahtar', '工具', '螺丝刀', '扳手', '批头', 'dụng cụ', 'tua vít', 'cờ lê', 'เครื่องมือ', 'ไขควง', 'ประแจ', 'औज़ार', 'औजार', 'पेचकस', 'रिंच', 'उपकरण', 'kasangkapan', 'distornilyador', W('obeng', 'alat'), 'መሣሪያ', 'መሳሪያ'),
  howMany: re(/\bhow many\b|\bquantity\b|\bqty\b|\bnumber of\b|כמה|كم /,
    'сколько', 'скільки', 'cuánt', '\\bcuant', '\\bquant', 'combien', 'wie viele', '\\banzahl', W('ile'), W('câte', 'câți', 'cate', 'cati'), W('kaç', 'kac', 'adet'), '多少', '几个', '数量', 'bao nhiêu', W('mấy'), 'กี่', 'จำนวน', 'कितने', 'कितना', 'कितनी', W('ilan', 'ilang'), 'berapa', '\\bjumlah', 'ስንት'),
  where: re(/\bwhere\b|\bwhich steps?\b.*\b(use|uses|used)\b|איפה|היכן|באיזה שלב|أين|وين|في أي خطوة/,
    W('где', 'де', 'dónde', 'donde', 'onde', 'où', 'wo', 'dove', 'gdzie', 'unde', 'nerede', 'nerde', 'saan'), 'в каком шаге', 'на якому кроці', '哪里', '在哪', 'ở đâu', 'ที่ไหน', 'कहाँ', 'कहां', 'di mana', 'dimana', 'የት'),
  meaning: re(/\bwhat does\b|\bmeaning\b|\bmean\b|\bexplain\b|\bdecode\b|\bstand for\b|מה פירוש|מה זה אומר|ماذا يعني|معنى|اشرح/,
    'значит', 'означает', 'расшифр', 'означає', 'розшифр', 'significa', 'signifie', 'veut dire', 'bedeutet', 'znaczy', 'oznacza', 'înseamnă', 'inseamna', 'ne demek', 'anlamı', 'anlami', '什么意思', '含义', 'nghĩa là', 'có nghĩa', 'หมายถึง', 'แปลว่า', 'मतलब', 'अर्थ', 'ibig sabihin', 'artinya', 'apa arti', 'ትርጉም', 'ምን ማለት'),
  diff: re(/\bdifference\b|\bdiffer\b|\bvs\.?\b|\bversus\b|\bsame as\b|\bconfuse\b|\bcompare\b|\bmix(ed)? up\b|ההבדל|הבדל|להתבלבל|الفرق|فرق|يختلف/,
    'разниц', 'отлича', 'перепута', 'різниц', 'відрізня', 'сплута', 'diferenc', 'diferença', 'distingu', 'confund', 'différence', 'difference', 'confond', 'unterschied', 'verwechs', 'differenza', 'różnic', 'roznic', 'pomyl', 'diferenț', 'diferent', W('fark', 'farkı', 'farki'), 'karıştır', 'karistir', '区别', '差别', '不同', '混淆', 'khác nhau', 'khác biệt', 'nhầm', 'ต่างกัน', 'ความแตกต่าง', 'สับสน', 'अंतर', 'फर्क', 'फ़र्क', 'pagkakaiba', 'kaibahan', 'perbedaan', W('beda'), 'ልዩነት'),
  how: re(/\bhow (do|to|should|can)\b|\binstructions?\b|\bprocedure\b|\bassemble\b|\binstall\b|\bput together\b|איך|כיצד|להרכיב|הוראות|كيف|طريقة|تركيب|خطوات/,
    W('как', 'як', 'cómo', 'como', 'comment', 'wie', 'come', 'jak', 'cum', 'nasıl', 'nasil', 'paano', 'cara', 'bagaimana'), 'инструкц', 'собрат', 'інструкц', 'зібрат', 'instruccion', 'montar', 'ensambl', 'instruç', 'instruction', 'monter', 'assembl', 'anleitung', 'montier', 'istruzion', 'instrukc', 'zamontow', 'instrucțiun', 'instructiun', 'asambl', 'talimat', 'montaj', '怎么', '如何', '安装', 'làm sao', 'thế nào', 'cách lắp', 'อย่างไร', 'ยังไง', 'วิธี', 'कैसे', 'निर्देश', 'tagubilin', 'ikabit', '\\bpasang', '\\brakit', 'እንዴት', 'መመሪያ'),
  why: re(/\bwhy\b|\breason\b|\bpurpose\b|\bwhat (is it|does it) (for|do)\b|למה|מדוע|بشو|لماذا|ليش|ليه/,
    'почему', 'зачем', 'чому', 'навіщо', 'por qué', 'por que', 'porquê', 'para qué', 'pourquoi', 'warum', '\\bwozu', 'perché', 'perche', 'dlaczego', 'po co', 'de ce', W('neden', 'niye', 'niçin'), '为什么', '為什麼', '为何', 'tại sao', 'vì sao', 'ทำไม', 'क्यों', W('bakit'), 'mengapa', 'kenapa', 'ለምን'),
  next: re(/\bnext\b|\bafter (this|that|step)\b|\bthen what\b|הבא|אחרי|التالي|بعد/,
    'следующ', 'дальше', 'наступн', W('далі'), 'siguiente', 'después', 'despues', 'próximo', 'proximo', W('depois'), 'suivant', 'ensuite', 'nächste', 'naechste', 'danach', 'prossimo', 'successiv', W('dopo'), 'następn', 'nastepn', W('potem'), 'următor', 'urmator', 'sonraki', '下一步', '然后', '之后', 'tiếp theo', 'sau đó', 'ถัดไป', 'ต่อไป', 'अगला', 'अगले', 'बाद में', 'susunod', 'berikutnya', 'selanjutnya', 'ቀጣይ', 'ቀጥሎ'),
  problems: re(/\bproblems?\b|\bissues?\b|\berrors?\b|\bmistakes?\b|\bconflicts?\b|\bwrong\b|\bintegrity\b|\banything (wrong|off)\b|בעיות|בעיה|שגיאה|טעות|مشاكل|مشكلة|خطأ|غلط/,
    'проблем', 'ошибк', 'помилк', '\\bproblem', 'problème', 'probleme', '\\berror', '\\berro\\b', 'erreur', 'fehler', 'errore', 'błąd', 'blad', 'eroare', 'greșeal', 'greseal', 'sorun', W('hata'), '问题', '错误', 'vấn đề', W('lỗi'), 'ปัญหา', 'ผิดพลาด', 'समस्या', 'गलती', 'ग़लती', 'त्रुटि', W('mali'), 'masalah', 'kesalahan', 'ችግር', 'ስህተት'),
  identify: re(/\bi (found|have|picked)\b|\bloose\b|\bwhat is this\b|\bidentify\b|\bwhich one is\b|מצאתי|יש לי בורג|وجدت|لقيت|ما هذا|شو هاد/,
    'нашёл', 'нашел', 'нашла', 'что это', 'знайшов', 'знайшла', 'що це', 'encontré', 'encontre', 'qué es esto', 'encontrei', 'achei', 'o que é isso', "j'ai trouvé", 'trouvé', "c'est quoi", 'gefunden', 'was ist das', 'ho trovato', "cos'è questo", 'znalazłem', 'znalazlem', 'znalazłam', 'co to jest', 'am găsit', 'am gasit', 'ce este asta', 'buldum', 'bu ne', '我找到', '这是什么', '捡到', 'tìm thấy', 'cái này là gì', 'เจอ', 'นี่คืออะไร', 'मिला', 'यह क्या है', 'nakita ko', 'ano ito', 'menemukan', 'ini apa', 'አገኘሁ', 'ይህ ምንድን'),
  safety: re(/\bsafety\b|\bsafe\b|\besd\b|\bstatic\b|\bearth(ing)?\b|\bground(ing)?\b|\bcritical\b|\bdanger(ous)?\b|בטיחות|הארקה|סטטי|سلامة|تأريض|أرضي|كهرباء ساكنة/,
    'безопасн', 'статическ', 'заземл', 'безпек', 'статичн', 'seguridad', 'estátic', 'estatic', 'segurança', 'seguranca', 'sécurité', 'securite', 'statique', 'sicherheit', 'statisch', 'erdung', 'sicurezza', 'messa a terra', 'bezpieczeńst', 'bezpieczenst', 'statyczn', 'uziemien', 'siguranț', 'siguranta', 'împământ', 'impamant', 'güvenlik', 'guvenlik', 'statik', 'topraklama', '安全', '静电', '接地', 'an toàn', 'tĩnh điện', 'nối đất', 'ความปลอดภัย', 'ไฟฟ้าสถิต', 'สายดิน', 'सुरक्षा', 'स्थैतिक', 'अर्थिंग', 'kaligtasan', 'keselamatan', 'keamanan', 'statis', 'ደህንነት'),
  which: re(/\b(which|what)\b.*\b(screws?|bolts?|parts?|washers?|nuts?|standoffs?|spacers?|use|need|fit|goes|go)\b|\bwhat (do|should) i (use|need|fit)\b|איזה|איזו|אילו|מה צריך|מה להשתמש|أي برغي|اي برغي|أي قطعة|ما البرغي|شو البرغي|ماذا أستخدم|شو بدي|ايش/,
    W('какой', 'какая', 'какие', 'каких', 'який', 'яка', 'які', 'яких', 'cuál', 'cual', 'cuáles', 'qual', 'quais', 'quel', 'quelle', 'quels', 'quelles', 'welche', 'welcher', 'welches', 'welchen', 'quale', 'quali', 'który', 'która', 'które', 'ktory', 'ktora', 'ktore', 'care', 'hangi', 'alin', 'aling', 'alinsunod'), 'qué tornillo', 'que tornillo', 'qué pieza', 'que pieza', 'ce șurub', 'ce surub', '哪个', '哪种', '用什么', 'cái nào', 'loại nào', 'vít nào', 'อันไหน', 'ตัวไหน', 'ใช้อะไร', 'कौन सा', 'कौनसा', 'कौन सी', 'कौन से', 'yang mana', 'የትኛው', 'የትኞቹ'),
  whatIs: re(/\bwhat(?:'s| is)\b|\bwho makes\b|מה זה|ما هو|ما هي|شو هو/,
    'что такое', 'що таке', 'qué es', 'que es', 'o que é', "qu'est-ce", "c'est quoi", 'was ist', "cos'è", "cos'e", 'che cos', 'co to', 'ce este', 'nedir', '是什么', 'là gì', 'คืออะไร', 'क्या है', 'ano ang', 'apa itu', 'ምንድን ነው', 'ምንድነው'),
};
const CATEGORY_WORDS = [
  ['screw', re(/\bscrews?\b|\bbolts?\b|בורג|ברגים|برغي|براغي|مسمار/, 'винт', 'болт', 'шуруп', 'гвинт', 'tornillo', '\\bperno', 'parafuso', W('vis'), 'boulon', 'schraube', W('vite', 'viti'), 'bullone', 'śrub', 'srub', 'șurub', 'surub', W('vida', 'vidayı'), 'cıvata', 'civata', '螺丝', '螺钉', '螺栓', W('vít'), 'bu lông', 'สกรู', 'पेंच', 'स्क्रू', 'turnilyo', 'tornilyo', 'sekrup', W('baut'), 'ብሎን', 'ቡሎን')],
  ['nut', re(/\bnuts?\b|\bnyloc\b|אום|אומים|صامولة|صواميل/, 'гайк', 'tuerca', W('porca', 'porcas'), 'écrou', 'ecrou', W('mutter', 'muttern'), W('dado', 'dadi'), 'nakrętk', 'nakretk', 'piuliț', 'piulit', W('somun'), '螺母', 'đai ốc', W('ê cu'), 'แป้นเกลียว', 'नट', 'tuerka', W('mur')) ],
  ['washer', re(/\bwashers?\b|דסקית|דסקיות|وردة|حلقة|ورد/, 'шайб', 'arandela', 'arruela', 'anilha', 'rondelle', 'scheibe', 'rondella', 'podkładk', 'podkladk', 'șaib', 'saib', W('pul', 'pulu'), '垫圈', '垫片', 'long đen', 'vòng đệm', 'แหวนรอง', 'वॉशर', 'वाशर', 'ring plat')],
  ['standoff', re(/\bstand-?offs?\b|\bspacers?\b|ספייסר|מרווח|فاصل/, 'стойк', 'проставк', 'стійк', 'separador', 'espaciador', 'espaçador', 'espacador', 'entretoise', 'abstandsbolzen', 'distanzbolzen', 'distanzial', 'dystans', 'distanțier', 'distantier', 'mesafe', '铜柱', '隔离柱', 'trụ đồng', 'cọc đồng', 'เสารอง', 'स्टैंडऑफ')],
];
// "step 3" in every language, and the languages that put the number first ("3. adım", "第3步", "3-й шаг").
// Step words take any ending ("шаге", "kroku", "pasul"), so declined forms work too.
const STEP_RE = /(?:(?:\bstep|\bstage|שלב|خطوة|шаг|этап|крок|кроц|\bpaso|\betapa|\bpasso|étape|\betape|\bschritt|\bfase|\bkrok|\bpas|adım|\badim|bước|ขั้นตอนที่|ขั้นที่|ขั้นตอน|चरण|\bhakbang|\blangkah|ደረጃ)[\p{L}\p{M}]*|\bs|第)\s*(?:no\.?|number|#|מס'?|№|nr\.?|n[º°o]\.?|số)?\s*(\d{1,3})(?!\s*(?:mm|x|×))/iu;
const STEP_RE_AFTER = /(?<![\d.,])(\d{1,3})\s*(?:\.\s*(?:adım|adim)|步|-?(?:й|ий|ый|ой|ій)\s+(?:шаг|этап|крок)|\.\s*(?:schritt|krok|étape|lépés))/iu;
const GENERIC = new Set('the a an and or of to for in on at by with from this that these those it its is are be do does did i me my we our you your step steps part parts screw screws bolt nut washer fit fitting mount install connect use used need needs which what how why where when there here into onto device console demo new old put goes go get set check make please can should would could will about any all one two three four five six'.split(' '));

const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];

function findDevice(index, q, ctx) {
  const devs = [...index.devices.values()];
  if (!devs.length) return null;
  const nq = normCode(q);
  const byId = devs.find((d) => nq.includes(normCode(d.id)));
  if (byId) return byId;
  const qw = new Set(words(q).filter((w) => w.length >= 3 && !GENERIC.has(w)));
  let best = null, bestN = 0;
  for (const d of devs) {
    const n = words(d.name).filter((w) => w.length >= 3 && !GENERIC.has(w) && qw.has(w)).length;
    if (n > bestN) { best = d; bestN = n; }
  }
  if (best) return best;
  if (ctx?.deviceId && index.devices.get(ctx.deviceId)) return index.devices.get(ctx.deviceId);
  return devs.length === 1 ? devs[0] : null;
}

function findStep(dev, q, ctx) {
  if (!dev) return null;
  const steps = dev.instructions?.steps || [];
  const m = q.match(STEP_RE) || q.match(STEP_RE_AFTER);
  if (m) {
    const n = parseInt(m[1], 10);
    const byNo = steps[n - 1];
    const byId = steps.find((s) => normCode(s.id) === normCode(`S${n}`));
    const s = byNo || byId;
    if (s) return { step: s, no: steps.indexOf(s) + 1, how: 'number' };
  }
  const qw = new Set(words(q).filter((w) => w.length >= 3 && !GENERIC.has(w)));
  let best = null, bestScore = 0;
  steps.forEach((s, i) => {
    const t = words(s.title).filter((w) => !GENERIC.has(w));
    const body = words(`${s.summary || ''}`).filter((w) => !GENERIC.has(w));
    const score = t.filter((w) => qw.has(w)).length * 2 + body.filter((w) => qw.has(w)).length * 0.5;
    if (score > bestScore) { best = { step: s, no: i + 1, how: 'title' }; bestScore = score; }
  });
  if (best && bestScore >= 2) return best;
  // A BOM position ("front bezel") points at the step whose title names it.
  for (const line of dev.bom?.lines || []) {
    const lw = words(line.where).filter((w) => w.length >= 4 && !GENERIC.has(w));
    if (lw.length && lw.every((w) => qw.has(w))) {
      const i = steps.findIndex((s) => lw.every((w) => words(`${s.title} ${s.summary}`).includes(w)));
      if (i >= 0) return { step: steps[i], no: i + 1, how: 'position' };
    }
  }
  if (ctx?.stepId && ctx.deviceId === dev.id) {
    const i = steps.findIndex((s) => s.id === ctx.stepId);
    if (i >= 0) return { step: steps[i], no: i + 1, how: 'context' };
  }
  return null;
}

/** Codes mentioned in the question: single tokens and pairs ("ISO 7380"), resolved through every alias. */
function findCodes(index, q) {
  const toks = q.split(/[\s,;?!()"']+/).map((t) => t.replace(/[.:]+$/, '')).filter((t) => t.length >= 3);
  const found = [];
  const seen = new Set();
  const consider = (t) => {
    if (!/\d/.test(t)) return;
    const r = resolveCode(index, t);
    if (r.status === 'unknown') return;
    const key = r.status === 'unique' ? r.part.id : `amb:${r.norm}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ token: t, resolution: r });
  };
  toks.forEach((t, i) => { consider(t); if (toks[i + 1]) consider(`${t} ${toks[i + 1]}`); });
  return found;
}

function categoryOf(q) {
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(q)) return cat;
  return null;
}

const partRef = (p) => ({ label: `${p.id} · ${p.name}`, href: `#/part/${encodeURIComponent(p.id)}` });
const stepRef = (dev, st, no) => ({ label: t('{device}, step {n}: {title}', { device: dev.name, n: no, title: st.title }), href: `#/guide/${encodeURIComponent(dev.id)}/${encodeURIComponent(st.id)}?mode=learn` });
const checkRef = () => ({ label: t('Integrity check'), href: '#/audit' });
/** "100-0233 (M3 × 8)": a part code with its size. */
const ps = (p) => (sizeLabel(p) ? `${p.id} (${sizeLabel(p)})` : p.id);
const askEngineer = () => t('no torque value is recorded. Ask your engineer; do not tighten by feel.');

function stepFindings(audit, dev, st) {
  return (audit.byStep.get(`${dev.id}/${st.id}`) || []).filter((f) => f.severity !== 'info');
}

function substitutionLine(audit, dev, st, index) {
  const f = stepFindings(audit, dev, st).find((x) => x.check === 'likely-substitution');
  if (!f) return null;
  const bomPart = index.parts.get(f.parts[0]);
  const stepPart = index.parts.get(f.parts[1]);
  return { level: 'bad', text: t('Stop: the instructions say {fitted}, but BOM rev {rev} asks for {wanted} here. Ask your supervisor or engineer before fitting.', { fitted: ps(stepPart), rev: dev.bom?.rev || '?', wanted: ps(bomPart) }), finding: f };
}

function partItem(index, sp, extra = {}) {
  const p = sp.part;
  const looks = isFastener(p) ? findLookalikes(index.partList, p).filter((l) => l.score >= 0.75 && !l.duplicate).slice(0, 2) : [];
  return {
    kind: 'part', part: p, qty: sp.qty, torque: torqueText(sp.torque),
    codes: otherCodes(p).slice(0, 3).map((a) => a.code),
    warnings: looks.map((l) => t("Don't confuse with {part}: {diff}.", { part: ps(l.part), diff: shortDifference(p, l.part) })),
    note: sp.ref?.note || '',
    ...extra,
  };
}

// ---------- Handlers ----------
function answerWhich(ctx, cat) {
  const { index, audit, dev, step } = ctx;
  const st = step.step;
  let sps = stepParts(index, st).filter((x) => x.part);
  if (cat) { const f = sps.filter((x) => x.part.category === cat); if (f.length) sps = f; }
  const sub = substitutionLine(audit, dev, st, index);
  const disputed = sub?.finding.parts[1];
  const items = sps.map((sp) => partItem(index, sp, { flag: sp.part.id === disputed }));
  if (sub) {
    const bomPart = index.parts.get(sub.finding.parts[0]);
    const inStep = sps.find((sp) => sp.part.id === disputed);
    items.push(partItem(index, { part: bomPart, qty: inStep?.qty ?? null, torque: bomPart.torque }, { note: t('What BOM rev {rev} asks for', { rev: dev.bom?.rev || '?' }), bom: true }));
  }
  return {
    intent: 'which',
    text: [cat && sps.length && CATEGORY_PLURALS[cat]
      ? t('Step {n}, “{title}”, uses these {kind}:', { n: step.no, title: st.title, kind: CATEGORY_PLURALS[cat] })
      : t('Step {n}, “{title}”, uses:', { n: step.no, title: st.title })],
    lines: sub ? [sub] : [],
    items,
    sources: [stepRef(dev, st, step.no), ...(sub ? [checkRef()] : [])],
    followUps: [t('How do I do step {n}?', { n: step.no }), t('Torque for step {n}?', { n: step.no }), t('What comes after step {n}?', { n: step.no })],
  };
}

function answerHow(ctx) {
  const { index, audit, dev, step } = ctx;
  const st = step.step;
  const sub = substitutionLine(audit, dev, st, index);
  const lines = [];
  if (sub) lines.push(sub);
  for (const w of st.warnings || []) lines.push({ level: w.level === 'warning' ? 'bad' : 'warn', text: w.text });
  return {
    intent: 'how',
    text: [[t('Step {n}: {title}.', { n: step.no, title: st.title }), st.summary || ''].filter(Boolean).join(' ')],
    lines,
    list: st.instructions || [],
    checks: st.checks || [],
    items: stepParts(index, st).filter((x) => x.part).map((sp) => partItem(index, sp, { flag: sub?.finding.parts[1] === sp.part.id })),
    tools: st.tools || [],
    why: st.why || '',
    sources: [stepRef(dev, st, step.no)],
    followUps: [t('What comes after step {n}?', { n: step.no }), t('Why step {n}?', { n: step.no })],
  };
}

function answerTorque(ctx, parts) {
  const { index, dev, step } = ctx;
  const out = [];
  const sources = [];
  if (step && (!parts.length || parts.every((p) => stepParts(index, step.step).some((x) => x.part?.id === p.id)))) {
    const sps = stepParts(index, step.step).filter((x) => x.part && (!parts.length || parts.some((p) => p.id === x.part.id)) && x.part.category !== 'washer' && isFastener(x.part));
    for (const sp of sps) out.push(sp.torque ? `${ps(sp.part)}: ${torqueText(sp.torque)}${sp.part.tool ? ` (${sp.part.tool})` : ''}.` : `${ps(sp.part)}: ${askEngineer()}`);
    sources.push(stepRef(dev, step.step, step.no));
    if (!out.length) out.push(t('Step {n} has no screws or nuts that need a torque value.', { n: step.no }));
    return { intent: 'torque', text: [t('Torque in step {n}, “{title}”:', { n: step.no, title: step.step.title })], list: out, sources, followUps: [t('Which tool for step {n}?', { n: step.no })] };
  }
  for (const p of parts) {
    const uses = whereUsed(index, p.id).flatMap((u) => u.steps.map((s) => ({ dev: u.device, s })));
    const perStep = uses.map(({ dev: d, s }) => {
      const st = d.instructions.steps.find((x) => x.id === s.stepId);
      const ref = st?.parts.find((r) => resolveCode(index, r.code).part?.id === p.id);
      return { d, st, no: s.stepNo, t: ref?.torque || p.torque };
    });
    const values = new Set(perStep.map((x) => torqueText(x.t)).filter(Boolean));
    if (!p.torque && !values.size) out.push(`${ps(p)}: ${askEngineer()}`);
    else if (values.size > 1) perStep.forEach((x) => out.push(t('{id} in step {n} ({title}): {torque}.', { id: p.id, n: x.no, title: x.st.title, torque: torqueText(x.t) || t('not recorded') })));
    else out.push(`${ps(p)}: ${[...values][0] || torqueText(p.torque)}${p.tool ? `, ${p.tool}` : ''}.`);
    sources.push(partRef(p));
  }
  return { intent: 'torque', text: [parts.length > 1 ? t('Torque values:') : t('Torque:')], list: out, sources };
}

function answerTool(ctx, parts) {
  const { index, dev, step } = ctx;
  if (step && !parts.length) {
    const st = step.step;
    const extra = stepParts(index, st).filter((x) => x.part?.tool).map((x) => `${x.part.id}: ${x.part.tool}`);
    return { intent: 'tool', text: [t('Tools for step {n}, “{title}”:', { n: step.no, title: st.title })], list: [...(st.tools || []), ...extra], sources: [stepRef(dev, st, step.no)] };
  }
  const list = parts.map((p) => `${ps(p)}: ${p.tool || (p.spec?.driveSize ? t('{size} bit or key', { size: p.spec.driveSize }) : t('no tool recorded'))}`);
  return { intent: 'tool', text: [t('Tools:')], list, sources: parts.map(partRef) };
}

function answerHowMany(ctx, parts) {
  const { index, dev, step } = ctx;
  if (!parts.length && step) return answerWhich(ctx, ctx.cat);
  const list = [];
  const sources = [];
  for (const p of parts) {
    const u = whereUsed(index, p.id).filter((x) => !dev || x.device.id === dev.id);
    if (step) {
      const sp = stepParts(index, step.step).find((x) => x.part?.id === p.id);
      list.push(sp ? t('Step {n} fits {qty} × {part}.', { n: step.no, qty: sp.qty, part: ps(p) }) : t('Step {n} does not use {id}.', { n: step.no, id: p.id }));
    }
    for (const x of u) {
      const inSteps = x.steps.reduce((n, s) => n + (qtyNumber(s.qty) ?? 0), 0);
      const inBom = x.bom.reduce((n, b) => n + (qtyNumber(b.qty) ?? 0), 0);
      const detail = x.steps.map((s) => t('step {n}: {qty}', { n: s.stepNo, qty: s.qty })).join(', ') || t('none');
      list.push([t('{device}: {steps} in the steps ({detail}), {bom} in the BOM.', { device: x.device.name, steps: inSteps, detail, bom: inBom }), inSteps !== inBom && x.bom.length ? t('These do not agree: check the integrity findings.') : ''].filter(Boolean).join(' '));
    }
    if (!u.length) list.push(t('{id} is not used in any device.', { id: p.id }));
    sources.push(partRef(p));
  }
  return { intent: 'howMany', text: [t('Quantities:')], list, sources };
}

function answerWhere(ctx, parts) {
  const { index } = ctx;
  const list = [];
  for (const p of parts) {
    const u = whereUsed(index, p.id);
    if (!u.length) { list.push(t('{id} is not used in any device.', { id: ps(p) })); continue; }
    for (const x of u) {
      const st = x.steps.length ? x.steps.map((s) => t('step {n} ({qty}×)', { n: s.stepNo, qty: s.qty })).join(', ') : t('no step fits it');
      const bom = x.bom.length ? (x.bom[0].where ? t('BOM item {items} ({where})', { items: x.bom.map((b) => b.item).join(', '), where: x.bom[0].where }) : t('BOM item {items}', { items: x.bom.map((b) => b.item).join(', ') })) : t('not in the BOM');
      list.push(`${x.device.name}: ${st}; ${bom}.`);
    }
  }
  return { intent: 'where', text: [parts.length === 1 ? t('{part} is used here:', { part: ps(parts[0]) }) : t('Where these parts are used:')], list, items: parts.map((p) => ({ kind: 'part', part: p })), sources: parts.map(partRef) };
}

function answerWhatIs(ctx, codes) {
  const { index } = ctx;
  const out = { intent: 'whatIs', text: [], lines: [], items: [], sources: [] };
  for (const c of codes) {
    const r = c.resolution;
    if (r.status === 'ambiguous') {
      out.lines.push({ level: 'bad', text: t('Stop: {code} points to {n} different parts ({ids}). Do not use this code until it is fixed: scan another code on the label.', { code: c.token, n: r.matches.length, ids: listJoin(r.matches.map((m) => m.part.id)) }) });
      r.matches.forEach((m) => out.items.push({ kind: 'part', part: m.part }));
      out.sources.push(checkRef());
      continue;
    }
    const p = r.part;
    const type = CODE_TYPES[r.alias.type] ? lower(CODE_TYPES[r.alias.type]) : r.alias.type;
    out.text.push(r.alias.type === 'internal' ? t('{id} is {name}.', { id: p.id, name: p.name })
      : r.alias.source ? t('{code} is the {type} ({source}) of {id}: {name}.', { code: c.token, type, source: r.alias.source, id: p.id, name: p.name })
        : t('{code} is the {type} of {id}: {name}.', { code: c.token, type, id: p.id, name: p.name }));
    if (r.legacy) out.lines.push({ level: 'warn', text: t('{code} is an old code. Use {id}, and ask for documents and labels with the old code to be updated.', { code: c.token, id: p.id }) });
    if (p.status === 'obsolete') out.lines.push({ level: 'bad', text: p.replacedBy ? t('{id} is retired: use {by}.', { id: p.id, by: p.replacedBy }) : t('{id} is retired.', { id: p.id }) });
    if (p.details?.function) out.text.push(p.details.function);
    out.items.push(partItem(index, { part: p, qty: null, torque: p.torque }));
    out.sources.push(partRef(p));
  }
  out.followUps = codes.filter((c) => c.resolution.part).slice(0, 1).flatMap((c) => [t('Where is {id} used?', { id: c.resolution.part.id }), t('Torque for {id}?', { id: c.resolution.part.id }), t('What is {id} easy to confuse with?', { id: c.resolution.part.id })]);
  return out;
}

function answerDiff(ctx, parts) {
  const { index } = ctx;
  if (parts.length >= 2) {
    const [a, b] = parts;
    const c = compareParts(a, b);
    const list = c.diffs.length ? c.diffs.map((d) => d.text) : [a.category !== b.category ? t('{a} is a {ka}, {b} is a {kb}.', { a: a.id, ka: lower(CATEGORY_LABEL(a.category)), b: b.id, kb: lower(CATEGORY_LABEL(b.category)) }) : t('Their recorded specs are identical: they may be the same part under two codes. Tell your engineer.')];
    return { intent: 'diff', text: [t('{a} compared with {b}:', { a: ps(a), b: ps(b) })], list, items: [{ kind: 'part', part: a }, { kind: 'part', part: b }], tip: t('Lay the part on the true-scale drawing (part page, "Actual size") or use the gauge on the Identify page to be sure.'), sources: [partRef(a), partRef(b)] };
  }
  const p = parts[0];
  const looks = findLookalikes(index.partList, p).slice(0, 4);
  if (!looks.length) return { intent: 'diff', text: [t('Nothing in the library looks like {part}.', { part: ps(p) })], sources: [partRef(p)] };
  return { intent: 'diff', text: [t('{part} is easy to confuse with:', { part: ps(p) })], list: looks.map((l) => `${ps(l.part)}: ${l.duplicate ? t('identical spec (probably a duplicate record)') : shortDifference(p, l.part)}.`), items: looks.map((l) => ({ kind: 'part', part: l.part })), sources: [partRef(p)] };
}

function answerMeaning(ctx, dec) {
  const { index } = ctx;
  const matches = search(index, ctx.q, { limit: 5 }).results.filter((r) => r.reasons.some((x) => x.kind === 'spec'));
  return {
    intent: 'meaning',
    text: [t('{code} reads as: {meaning}.', { code: dec.parts.map((p) => p.token).join(' '), meaning: summarizeDecoded(dec) })],
    list: dec.parts.map((p) => `${p.token}: ${p.meaning}`),
    items: matches.slice(0, 3).map((r) => ({ kind: 'part', part: r.part })),
    sources: matches.slice(0, 3).map((r) => partRef(r.part)),
    followUps: [t('How do I measure a screw?')],
  };
}

function answerIdentify(ctx, dec) {
  const { index } = ctx;
  const res = search(index, ctx.q, { limit: 6 }).results.filter((r) => r.reasons.some((x) => x.kind === 'spec' || x.kind === 'near'));
  if (!res.length) return { intent: 'identify', text: [t('Tell me what you can see or measure: head shape, drive, thread size and length (for example "button head, hex, M3, 10 mm"). Or measure it on the screen on the Identify page.')], sources: [{ label: t('Identify page'), href: '#/identify' }] };
  return {
    intent: 'identify',
    text: [dec ? t('Parts that match {what}:', { what: summarizeDecoded(dec) }) : t('Parts that match:')],
    items: res.slice(0, 4).map((r) => ({ kind: 'part', part: r.part, note: r.reasons[0].text })),
    tip: t('A size read by eye can be 1 or 2 mm off: lay the part on its true-scale drawing or use the gauge before fitting it.'),
    sources: [{ label: t('Measure on the Identify page'), href: '#/identify?tab=measure' }],
  };
}

function answerWhy(ctx, parts) {
  const { dev, step } = ctx;
  if (parts.length) {
    const p = parts[0];
    const d = p.details || {};
    const text = [d.function, d.why].filter(Boolean);
    return { intent: 'why', text: text.length ? text : [t('Nobody has written down why {id} was chosen yet. Ask your engineer, and ask them to add it.', { id: p.id })], lines: d.ifWrong ? [{ level: 'warn', text: t('If the wrong part is fitted: {what}', { what: d.ifWrong }) }] : [], sources: [partRef(p)] };
  }
  const st = step.step;
  return { intent: 'why', text: [st.why || t('Step {n} has no explanation yet. Ask your engineer.', { n: step.no })], sources: [stepRef(dev, st, step.no)] };
}

function answerNext(ctx) {
  const { dev, step, index } = ctx;
  const steps = dev.instructions.steps;
  const nxt = steps[step.no];
  if (!nxt) return { intent: 'next', text: [t('Step {n} is the last step of the {device}.', { n: step.no, device: dev.name })], sources: [stepRef(dev, step.step, step.no)] };
  const sps = stepParts(index, nxt).filter((x) => x.part);
  return { intent: 'next', text: [[t('After step {n} comes step {next}: {title}.', { n: step.no, next: step.no + 1, title: nxt.title }), nxt.summary || ''].filter(Boolean).join(' ')], list: sps.map((x) => `${x.qty === 'A/R' ? t('As required') : x.qty + ' ×'} ${ps(x.part)} ${x.part.name}`), sources: [stepRef(dev, nxt, step.no + 1)], followUps: [t('How do I do step {n}?', { n: step.no + 1 })] };
}

function answerProblems(ctx, parts) {
  const { audit, dev, step } = ctx;
  let list = audit.findings.filter((f) => f.severity !== 'info');
  if (step) list = list.filter((f) => f.steps.some((s) => s.stepId === step.step.id && s.deviceId === dev.id));
  else if (parts.length) list = list.filter((f) => parts.some((p) => f.parts.includes(p.id)));
  else if (dev) list = list.filter((f) => !f.deviceId || f.deviceId === dev.id);
  if (!list.length) return { intent: 'problems', text: [step ? t('No open problems in step {n}.', { n: step.no }) : parts.length ? t('No open problems for {ids}.', { ids: parts.map((p) => p.id).join(', ') }) : t('No open problems.')], sources: [checkRef()] };
  return { intent: 'problems', text: [step ? t('{n, plural, one {# problem found in step {step}:} other {# problems found in step {step}:}}', { n: list.length, step: step.no }) : t('{n, plural, one {# problem found:} other {# problems found:}}', { n: list.length })], findings: list.slice(0, 6), sources: [checkRef()] };
}

function answerSafety(ctx) {
  const { dev } = ctx;
  const steps = dev.instructions?.steps || [];
  const crit = steps.map((s, i) => ({ s, no: i + 1 })).filter(({ s }) => s.critical || s.esd || (s.warnings || []).some((w) => w.level === 'warning'));
  return {
    intent: 'safety',
    text: [crit.length ? t('Safety in the {device}:', { device: dev.name }) : t('No step of the {device} is marked safety-critical or static-sensitive.', { device: dev.name })],
    list: crit.map(({ s, no }) => `${t('Step {n}, {title}:', { n: no, title: s.title })} ${[s.critical ? t('safety critical') : '', s.esd ? t('static-sensitive (wear the wrist strap)') : '', ...(s.warnings || []).filter((w) => w.level === 'warning').map((w) => w.text)].filter(Boolean).join('; ')}.`),
    sources: crit.map(({ s, no }) => stepRef(dev, s, no)),
  };
}

function answerHelp(ctx) {
  const { index, dev } = ctx;
  const steps = dev?.instructions?.steps || [];
  const cust = index.partList.flatMap((p) => (p.aliases || []).filter((a) => a.type === 'customer').map((a) => a.code))[0];
  const screw = index.partList.find((p) => p.category === 'screw' && index.usage.has(p.id));
  const ex = [
    steps[0] && t('Which screw goes in step {n}?', { n: Math.min(steps.length, 3) }),
    steps[0] && t('How do I do step {n}?', { n: 1 }),
    screw && t('Torque for {id}?', { id: screw.id }),
    cust && t('What is {code}?', { code: cust }),
    screw && t('What is {id} easy to confuse with?', { id: screw.id }),
    t('What does {code} mean?', { code: 'ISO 7380 M3x8 A2' }),
    dev && t('What problems are there?'),
    t('I found a button head screw M3 10 mm, what is it?'),
  ].filter(Boolean);
  return { intent: 'help', text: [dev
    ? t("I answer from the {device} and this company's parts, codes, steps, BOMs and integrity check. Every answer shows where it comes from. Ask in your own language; part numbers work in any language.", { device: dev.name })
    : t("I answer from this company's parts, codes, steps, BOMs and integrity check. Every answer shows where it comes from. Ask in your own language; part numbers work in any language.")], followUps: ex.slice(0, 6) };
}

function fallback(ctx) {
  const { index, q } = ctx;
  const res = search(index, q, { limit: 4 }).results;
  return {
    intent: 'fallback',
    confidence: 'low',
    text: res.length ? [t('I could not find a direct answer in the data. These parts match your words:')] : [t("I could not find this in the company's data. Try a part code, a step number or a size (like M3x8), or ask your supervisor.")],
    items: res.map((r) => ({ kind: 'part', part: r.part, note: r.reasons[0]?.text })),
    canAskAI: true,
    followUps: ['help'],
  };
}

// "this" / "it", for a question asked on a part's page.
const THIS = re(/\b(this|it)\b|זה|הזה|هذا|هذه/, W('это', 'этот', 'эта', 'эту', 'цей', 'це', 'цю', 'este', 'esta', 'esto', 'isto', 'isso', 'ceci', 'cette', 'dieser', 'diese', 'dieses', 'questo', 'questa', 'ten', 'tego', 'ta', 'tej', 'acest', 'aceasta', 'asta', 'bu', 'bunu', 'ito', 'ini'), '这个', '這個', 'cái này', 'อันนี้', 'ตัวนี้', 'यह', 'इस', 'ይህ', 'ይሄ');

/** A question rather than a code: a question mark in any script, or a question word at the start. */
export function looksLikeQuestion(q) {
  const s = String(q || '').trim();
  if (/[?？؟;]$|^¿/.test(s) && s.length > 1) return true;
  return QSTART.test(s) || /哪|什么|怎么|如何|为什么|多少|吗|呢|ไหน|อะไร|อย่างไร|ยังไง|ทำไม|กี่/.test(s);
}
const QSTART = new RegExp(`^(?:how|what|which|why|where|when|can|do|is|does|show|tell|כמה|מה|איזה|למה|איפה|كم|ما|ماذا|أي|لماذا|أين|${['как', 'какой', 'какая', 'какие', 'что', 'где', 'почему', 'сколько', 'зачем', 'як', 'який', 'яка', 'що', 'де', 'чому', 'скільки', 'cómo', 'como', 'qué', 'que', 'cuál', 'cual', 'dónde', 'donde', 'por qué', 'cuánto', 'cuántos', 'qual', 'onde', 'quanto', 'quantos', 'comment', 'quel', 'quelle', 'pourquoi', 'combien', 'où', 'wie', 'was', 'welche', 'welcher', 'warum', 'wo', 'come', 'cosa', 'quale', 'perché', 'dove', 'quanti', 'jak', 'co', 'który', 'która', 'które', 'dlaczego', 'gdzie', 'ile', 'cum', 'ce', 'care', 'de ce', 'unde', 'câte', 'nasıl', 'ne', 'hangi', 'neden', 'nerede', 'kaç', 'bao nhiêu', 'tại sao', 'làm sao', 'cái nào', 'paano', 'ano', 'alin', 'bakit', 'saan', 'ilan', 'bagaimana', 'apa', 'yang mana', 'mengapa', 'kenapa', 'di mana', 'berapa'].join('|')})(?![\\p{L}])|^(?:怎么|如何|哪个|为什么|什么|多少|几)|(?:吗|呢|ไหม|มั้ย|อะไร|อย่างไร|ยังไง|ทำไม|ที่ไหน)$|^(?:कैसे|क्या|कौन|क्यों|कहाँ|कितने|कितना)|^(?:እንዴት|ምን|የትኛው|ለምን|የት|ስንት)`, 'iu');

/**
 * Answer a question. ctx: { deviceId, stepId, partId } from the page the person is on.
 * Returns { intent, text[], lines[{level,text}], list[], checks[], tools[], items[], findings[], why, tip, sources[{label,href}], followUps[], canAskAI, confidence }
 */
export function answer(index, audit, question, pageCtx = {}) {
  const q = String(question || '').trim();
  const dev = findDevice(index, q, pageCtx);
  const step = findStep(dev, q, pageCtx);
  const codes = findCodes(index, q);
  const parts = codes.filter((c) => c.resolution.status === 'unique').map((c) => c.resolution.part);
  if (!parts.length && pageCtx.partId && THIS.test(q) && index.parts.get(pageCtx.partId)) parts.push(index.parts.get(pageCtx.partId));
  const dec = decodeDesignation(q);
  const cat = categoryOf(q);
  const ctx = { index, audit, dev, step, q, cat };
  const is = (k) => KW[k].test(q);
  let a;
  if (!q || is('help')) a = answerHelp(ctx);
  else if (codes.some((c) => c.resolution.status === 'ambiguous') && !parts.length) a = answerWhatIs(ctx, codes);
  else if (is('diff') && parts.length) a = answerDiff(ctx, parts);
  else if (is('torque') && (parts.length || step)) a = answerTorque(ctx, parts);
  else if (is('tool') && (parts.length || step)) a = answerTool(ctx, parts);
  else if (is('howMany') && (parts.length || step)) a = answerHowMany(ctx, parts);
  else if (is('where') && parts.length) a = answerWhere(ctx, parts);
  else if (is('problems')) a = answerProblems(ctx, parts);
  else if (is('identify') && !parts.length) a = answerIdentify(ctx, dec);
  else if (is('why') && (parts.length || step)) a = answerWhy(ctx, parts);
  else if (is('next') && step && dev) a = answerNext(ctx);
  else if (is('meaning') && dec && !parts.length) a = answerMeaning(ctx, dec);
  else if (is('safety') && dev && !parts.length && !step) a = answerSafety(ctx);
  else if (step && (is('how') || (!is('which') && !cat && !parts.length && step.how !== 'context'))) a = answerHow(ctx);
  else if (step && (is('which') || cat || is('howMany'))) a = answerWhich(ctx, cat);
  else if (parts.length) a = codes.length ? answerWhatIs(ctx, codes) : answerWhere(ctx, parts);
  else if (dec && (dec.thread || dec.head)) a = (is('identify') || dec.length != null) ? answerIdentify(ctx, dec) : answerMeaning(ctx, dec);
  else if (dev && is('safety')) a = answerSafety(ctx);
  else if (dev && (is('which') || is('how')) && !step) {
    const steps = dev.instructions?.steps || [];
    a = { intent: 'pickStep', text: [t('Which step of the {device}? It has {n} steps:', { device: dev.name, n: steps.length })], followUps: steps.slice(0, 12).map((s, i) => (is('how') ? t('How do I do step {n}? ({title})', { n: i + 1, title: s.title }) : t('Which parts for step {n}? ({title})', { n: i + 1, title: s.title }))) };
  } else a = fallback(ctx);
  // A step read from a PDF and not reviewed yet: say so with every answer about it.
  const st = step?.step;
  const stepIntents = ['which', 'how', 'torque', 'tool', 'howMany', 'why', 'next', 'problems', 'safety'];
  if (st?.draft && stepIntents.includes(a.intent)) {
    const file = st.source?.file || t('a PDF');
    a.lines = [{ level: 'warn', text: st.source?.page ? t('Step {n} is a draft read from {file}, page {page}, and not reviewed yet. Check it against the released document.', { n: step.no, file, page: st.source.page }) : t('Step {n} is a draft read from {file} and not reviewed yet. Check it against the released document.', { n: step.no, file }) }, ...(a.lines || [])];
  }
  return {
    lines: [], list: [], checks: [], tools: [], items: [], findings: [], sources: [], followUps: [], confidence: 'high', canAskAI: false,
    ...a,
    context: { deviceId: dev?.id || null, stepId: step?.step.id || null, stepNo: step?.no || null, partIds: parts.map((p) => p.id) },
  };
}

/**
 * Records to send to the optional AI for a question it should answer: the parts, steps, BOM lines,
 * changes and findings that relate to it. Ids match what the AI must cite.
 */
export function retrieveRecords(index, audit, question, pageCtx = {}, limit = 40) {
  const a = answer(index, audit, question, pageCtx);
  const dev = a.context.deviceId ? index.devices.get(a.context.deviceId) : null;
  const out = new Map();
  const addPart = (p) => {
    if (!p || out.has(`part:${p.id}`) || out.size >= limit) return;
    out.set(`part:${p.id}`, { id: `part:${p.id}`, type: 'part', name: p.name, category: p.category, designation: p.designation, spec: p.spec, codes: (p.aliases || []).map((x) => `${x.type}:${x.code}`), torque: torqueText(p.torque), tool: p.tool, status: p.status, details: p.details });
  };
  const addStep = (d, st, no) => {
    if (!st || out.has(`step:${d.id}/${st.id}`) || out.size >= limit) return;
    out.set(`step:${d.id}/${st.id}`, { id: `step:${d.id}/${st.id}`, type: 'step', device: d.name, number: no, title: st.title, summary: st.summary, parts: (st.parts || []).map((r) => `${r.qty} x ${r.code}${r.torque ? ` @ ${r.torque.value} N·m` : ''}`), tools: st.tools, instructions: st.instructions, checks: st.checks, warnings: st.warnings, why: st.why, critical: !!st.critical, esd: !!st.esd, ...(st.draft ? { draft: `read automatically from ${st.source?.file || 'a PDF'}, not reviewed by an engineer` } : {}) });
    for (const sp of stepParts(index, st)) addPart(sp.part);
  };
  a.context.partIds.forEach((id) => addPart(index.parts.get(id)));
  for (const it of a.items || []) addPart(it.part);
  if (dev && a.context.stepId) { const i = dev.instructions.steps.findIndex((s) => s.id === a.context.stepId); addStep(dev, dev.instructions.steps[i], i + 1); }
  for (const r of search(index, question, { limit: 8 }).results) addPart(r.part);
  if (dev) {
    for (const line of dev.bom?.lines || []) {
      const r = resolveCode(index, line.code);
      if (r.part && out.has(`part:${r.part.id}`) && out.size < limit) out.set(`bom:${dev.id}/${line.item}`, { id: `bom:${dev.id}/${line.item}`, type: 'bom-line', device: dev.name, bomRev: dev.bom.rev, item: line.item, code: line.code, part: r.part.id, qty: line.qty, where: line.where });
    }
    for (const c of dev.changes || []) if (out.size < limit) out.set(`change:${c.eco}`, { id: `change:${c.eco}`, type: 'engineering-change', rev: c.rev, date: c.date, text: c.text, parts: c.parts });
    if (!a.context.stepId && out.size < limit / 2) (dev.instructions?.steps || []).forEach((st, i) => addStep(dev, st, i + 1));
  }
  for (const f of audit.findings) {
    if (out.size >= limit) break;
    if (f.parts.some((id) => out.has(`part:${id}`)) || f.steps.some((s) => out.has(`step:${s.deviceId}/${s.stepId}`))) out.set(`finding:${f.check}:${f.parts.join(',')}`, { id: `finding:${f.check}:${f.parts.join(',')}`, type: 'integrity-finding', severity: f.severity, title: f.title, detail: f.detail, whatToDo: f.suggestion });
  }
  return [...out.values()];
}
