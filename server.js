  import express from 'express';
  import dotenv from 'dotenv';
  import fetch from 'node-fetch';
  import multer from 'multer';
  import { v4 as uuidv4 } from 'uuid';
  import path from 'path';
  import fs from 'fs';
  import archiver from 'archiver';
  import puppeteer from 'puppeteer';

  dotenv.config();
  const app = express();
  const PORT = process.env.PORT || 3000;
  const __dirname = path.resolve();
  const PUBLIC_DIR = path.join(__dirname, 'public');
  const OUTPUTS_DIR = path.join(PUBLIC_DIR, 'outputs');
  const TEMPLATES_DIR = path.join(__dirname, 'templates');
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve static frontend
  app.use(express.static(PUBLIC_DIR));

  // Multer for photo uploads (optional future use)
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, path.join(PUBLIC_DIR, 'uploads'));
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, uuidv4() + ext);
    }
  });
  fs.mkdirSync(path.join(PUBLIC_DIR, 'uploads'), { recursive: true });
  const upload = multer({ storage });

  // Utility: LLM Chat (OpenAI-compatible). Returns string.
  async function chatLLM(system, user, temperature = 0.7, max_tokens = 600) {
    const base = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    const key = process.env.LLM_API_KEY || '';
    const model = process.env.LLM_MODEL || 'gpt-4o-mini';
    if (!key) {
      // Fallback mock output
      return `MOCK: ${user.slice(0, 140)} ...`;
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    if (!res.ok) {
      const t = await res.text();
      console.error('LLM error:', t);
      return 'Gagal memanggil LLM. Coba cek API key / limit.';
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return content.trim();
  }

  function priceToIDR(p) {
    try {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(p || 0));
    } catch {
      return `Rp ${p}`;
    }
  }

  const SYSTEM_COPYWRITER = `Kamu adalah copywriter UMKM Indonesia. Tulis dalam bahasa Indonesia yang natural. 
  Patuhi aturan: hindari klaim medis, jangan berlebihan, gunakan CTA jelas, masukkan nomor/tautan WhatsApp jika disediakan.`;

  const PLATFORM_GUIDES = {
    instagram: { name: 'Instagram', words: '120-180 kata', hashtags: 6 },
    facebook:  { name: 'Facebook',  words: '120-180 kata', hashtags: 3 },
    whatsapp:  { name: 'WhatsApp',  words: '30-60 kata',  hashtags: 0 },
    tiktok:    { name: 'TikTok',    words: '30-80 kata',  hashtags: 5 },
    threads:   { name: 'Threads',   words: '60-120 kata', hashtags: 4 },
    marketplace: { name: 'Marketplace', words: '60-120 kata', hashtags: 0 }
  };

  // === Endpoint: Generate Captions ===
  app.post('/api/generate/caption', async (req, res) => {
    try {
      const { product, shop, tone = 'Kasual & Ramah', platforms = ['instagram','whatsapp'], wa_text_cta = true, locale = 'id-ID' } = req.body;
      if (!product?.name) return res.status(400).json({ error: 'Nama produk wajib diisi' });

      const basePrompt = (plat) => {
        const guide = PLATFORM_GUIDES[plat] || PLATFORM_GUIDES.instagram;
        const waLink = shop?.whatsapp_e164 ? `https://wa.me/${shop.whatsapp_e164}?text=${encodeURIComponent(`Halo ${shop?.name||''}, saya mau pesan ${product?.name}`)}` : '';
        const price = priceToIDR(product?.price || product?.price_idr);
        return `Buat 3 variasi caption untuk ${guide.name} (${guide.words}).
Gaya bahasa: ${tone}.
Produk: ${product?.name} (${product?.category||'-'}), harga ${price}.
Manfaat utama: ${product?.benefits||'-'}.
Audiens: ${product?.audience||'-'}.
Brand/Toko: ${shop?.name||'-'} di alamat ${shop?.address||'-'}.
Gunakan struktur: Hook singkat → Manfaat → Harga/Promo → CTA.
${wa_text_cta && shop?.whatsapp_e164 ? `Sertakan CTA: "Chat WhatsApp" dengan tautan ${waLink}.` : ''}
Hashtag lokal relevan ${guide.hashtags>0?guide.hashtags:0} buah. Kembalikan dalam JSON array berisi objek {caption, hashtags}.
`
      };

      const outputs = {};
      for (const plat of platforms) {
        const content = await chatLLM(SYSTEM_COPYWRITER, basePrompt(plat), 0.8, 700);
        // Try to parse JSON; if fails, wrap as single item
        let parsed;
        try { parsed = JSON.parse(content); }
        catch { parsed = [{ caption: content, hashtags: [] }]; }
        outputs[plat] = parsed;
      }
      res.json({ ok: true, outputs });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Server error on caption' });
    }
  });

  // HTML template generator for posters
  function buildPosterHTML({ theme = 'Minimalis & Bersih', colors = ['#0B2447','#FFD700'], product, shop }) {
    const [bg, acc] = colors;
    const harga = priceToIDR(product?.price || product?.price_idr);
    const benefitOne = (product?.benefits || '').split(/[\.\n]/)[0] || '';
    const wa = shop?.whatsapp_e164 ? `https://wa.me/${shop.whatsapp_e164}?text=${encodeURIComponent('Halo '+(shop?.name||'')+', saya mau pesan '+(product?.name||''))}` : '#';
    const productPhoto = (product?.photo_url || '').trim();
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  @font-face{font-family:Inter;src:url('https://fonts.gstatic.com/s/inter/v13/UcCO3Fwr0xkFhNr3S2Y.ttf') format('truetype');font-display:swap;}
  body{margin:0;font-family:Inter,ui-sans-serif,system-ui;}
  .shadow-soft{box-shadow:0 20px 40px rgba(0,0,0,.25)}
</style>
</head>
<body class="w-full h-full" style="background:${bg}">
  <div class="flex flex-col w-full h-full p-10 text-white">
    <div class="text-5xl font-extrabold tracking-tight">${shop?.name || 'Brand Kamu'}</div>
    <div class="mt-2 opacity-90">${shop?.address || ''}</div>
    <div class="grid grid-cols-5 gap-8 mt-10 items-start">
      <div class="col-span-3">
        <div class="rounded-3xl overflow-hidden shadow-soft bg-white/5 border border-white/10 p-8">
          <div class="text-4xl font-extrabold">${product?.name || 'Nama Produk'}</div>
          <div class="mt-2 opacity-90">${benefitOne}</div>
          <div class="mt-6 text-3xl font-black" style="color:${acc}">${harga}</div>
          <a href="${wa}" class="inline-block mt-6 px-6 py-3 rounded-xl font-semibold bg-white text-black hover:opacity-90 transition">Chat WhatsApp</a>
        </div>
      </div>
      <div class="col-span-2">
        <div class="rounded-3xl overflow-hidden bg-white/10 border border-white/10 aspect-[1/1] flex items-center justify-center">
          ${productPhoto ? `<img src="${productPhoto}" class="w-full h-full object-cover" />` : `<div class="text-white/70 p-6 text-center">Foto Produk<br/><span class="text-sm">(unggah via halaman utama)</span></div>`}
        </div>
        <div class="mt-4 text-sm opacity-70">Tema: ${theme}</div>
      </div>
    </div>
    <div class="mt-auto flex items-center gap-2 text-sm opacity-80">
      <div class="w-2 h-2 rounded-full" style="background:${acc}"></div>
      <div>${shop?.google_maps_url ? shop.google_maps_url : ''}</div>
    </div>
  </div>
</body>
</html>`;
  }

  function ratioToSize(ratio) {
    // Use high-res bases
    switch (ratio) {
      case '1:1': return { w: 1080, h: 1080 };
      case '4:5': return { w: 1080, h: 1350 };
      case '9:16': return { w: 1080, h: 1920 };
      case '16:9': return { w: 1920, h: 1080 };
      default: return { w: 1080, h: 1080 };
    }
  }

  async function getBrowser() {
    // Allow using system Chrome if env provided
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: execPath || undefined,
      args: ['--no-sandbox','--disable-setuid-sandbox']
    });
    return browser;
  }

  // === Endpoint: Generate Poster ===
  app.post('/api/generate/poster', async (req, res) => {
    try {
      const { product, shop, theme = 'Minimalis & Bersih', dominant_colors = ['#0B2447','#FFD700'], aspect_ratios = ['1:1'] } = req.body;
      const html = buildPosterHTML({ theme, colors: dominant_colors, product, shop });

      const outFiles = [];
      const browser = await getBrowser();
      const page = await browser.newPage();

      for (const ratio of aspect_ratios) {
        const { w, h } = ratioToSize(ratio);
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const file = path.join(OUTPUTS_DIR, `poster-${uuidv4()}-${ratio.replace(':','x')}.png`);
        await page.screenshot({ path: file, type: 'png' });
        outFiles.push('/outputs/' + path.basename(file));
      }
      await browser.close();
      res.json({ ok: true, files: outFiles });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Gagal render poster. Pastikan Puppeteer/Chrome terpasang.' });
    }
  });

  // === Endpoint: Schedule Plan (7-day) ===
  app.post('/api/schedule/plan', async (req, res) => {
    try {
      const { product, shop, platforms = ['instagram','whatsapp'], days = 7, tone = 'Kasual & Ramah' } = req.body;
      const items = [];
      const today = new Date();
      for (let i=0; i<days; i++) {
        const d = new Date(today.getTime() + i*24*60*60*1000);
        const dateLabel = d.toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'short' });
        const idea = [
          'Foto produk + testimoni',
          'Manfaat utama (carousel)',
          'Behind the scene pembuatan',
          'Harga & promo bundling',
          'FAQ singkat',
          'UGC pelanggan',
          'Tips pakai/menyajikan'
        ][i % 7];
        const caption = `${product?.name||'Produk'} — ${idea}. Gaya: ${tone}. CTA: Chat WhatsApp.`;
        items.push({ date: dateLabel, platforms, idea, caption });
      }
      res.json({ ok: true, plan: items });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Gagal membuat rencana.' });
    }
  });

  // === Export ZIP: captions + plan + images (paths passed via query) ===
  app.post('/api/export/zip', async (req, res) => {
    try {
      const { captions, plan, files } = req.body; // captions: object, plan: array, files: ['/outputs/..']
      const zipName = `larisin-${uuidv4()}.zip`;
      const zipPath = path.join(OUTPUTS_DIR, zipName);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(output);

      // Captions
      archive.append(JSON.stringify(captions, null, 2), { name: 'captions.json' });
      // Plan
      archive.append(JSON.stringify(plan, null, 2), { name: 'plan.json' });
      // Human-readable captions
      let human = '';
      if (captions && typeof captions === 'object') {
        Object.keys(captions).forEach(k => {
          human += `\n==== ${k.toUpperCase()} ====\n`;
          (captions[k]||[]).forEach((v, i) => {
            human += `\n[Varian ${i+1}]\n${v.caption}\n# ${Array.isArray(v.hashtags)?v.hashtags.join(' '):''}\n`;
          });
        });
      }
      archive.append(human, { name: 'captions.txt' });
      // Files
      for (const p of (files||[])) {
        const abs = path.join(PUBLIC_DIR, p.replace(/^\//,''));
        if (fs.existsSync(abs)) archive.file(abs, { name: `assets/${path.basename(abs)}` });
      }
      await archive.finalize();
      output.on('close', () => {
        res.json({ ok: true, url: '/outputs/' + zipName });
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Gagal membuat ZIP' });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 LARISin MVP running at http://localhost:${PORT}`);
  });
