// Baca data KTP dari foto memakai AI.
// Kunci disimpan di Vercel: Settings > Environment Variables.
// ANTHROPIC_API_KEY (Claude, berbayar) dipakai lebih dulu bila ada; kalau tidak, GEMINI_API_KEY (Google, gratis).
const SUPABASE_URL = "https://tmepqhwuplutbnzlyihp.supabase.co";
const SUPABASE_KEY = "sb_publishable_XaXeoIxoBGts7Gzjq_OA0Q_ap64Lzs3";
const PERINTAH = "Baca foto KTP Indonesia ini. Jawab HANYA dengan satu objek JSON tanpa teks lain, dengan kunci: nama, nik (16 angka), tempat_lahir, tanggal_lahir (format YYYY-MM-DD), jenis_kelamin (Laki-laki atau Perempuan), alamat (jalan atau dusun saja, tanpa RT/RW), rt (angka), rw (angka), kecamatan, kelurahan_desa, kabupaten (tulis lengkap, misalnya Kabupaten Bogor atau Kota Bandung), agama (Islam, Kristen, Katolik, Hindu, Buddha, atau Konghucu), status_perkawinan (Belum kawin, Kawin, Cerai hidup, atau Cerai mati), pekerjaan, kewarganegaraan (WNI atau WNA). Jika sebuah isian tidak terbaca atau gambar bukan KTP, isi string kosong. Jangan menebak.";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metode tidak didukung" });
  const bersih = (v) => String(v || "").trim().replace(/^["']|["']$/g, "");
  const key = bersih(process.env.ANTHROPIC_API_KEY), gkey = bersih(process.env.GEMINI_API_KEY);
  if (!key && !gkey) return res.status(500).json({ ok: false, error: "Kunci pembaca KTP (GEMINI_API_KEY) belum dipasang di Vercel" });

  // Hanya pengguna yang sudah login di aplikasi yang boleh memakai.
  const auth = req.headers.authorization || "";
  const cek = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: auth } });
  if (!cek.ok) return res.status(401).json({ ok: false, error: "Sesi login tidak valid, silakan login ulang" });

  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (!b.image) return res.status(400).json({ ok: false, error: "Foto KTP tidak ada" });

  const mime = /^image\/(jpeg|png|webp|heic|heif)$/.test(b.mime) ? b.mime : "image/jpeg";
  if (!key || /hei[cf]/.test(mime)) {
    if (!gkey) return res.status(400).json({ ok: false, error: "Foto HEIC belum bisa dibaca, simpan ulang sebagai JPG" });
    return gemini(gkey, String(b.image), mime, res);
  }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.KTP_MODEL || "claude-haiku-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mime, data: String(b.image) } },
          { type: "text", text: PERINTAH }
        ] }]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (j.error && j.error.message) || ("HTTP " + r.status);
      const saldo = /credit|balance|billing/i.test(m);
      return res.status(502).json({ ok: false, error: saldo ? "Saldo layanan pembaca KTP habis, isi ulang di console.anthropic.com" : r.status == 401 ? "Kunci ANTHROPIC_API_KEY salah" : "Layanan pembaca KTP menolak: " + m });
    }
    return kirimData(res, (j.content || []).map((c) => c.text || "").join(""));
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Tidak bisa menghubungi layanan pembaca KTP" });
  }
};

function kirimData(res, teks) {
  const a = teks.indexOf("{"), z = teks.lastIndexOf("}");
  let data = null;
  try { data = JSON.parse(teks.slice(a, z + 1)); } catch (e) {}
  if (!data) return res.status(422).json({ ok: false, error: "KTP tidak terbaca, coba foto yang lebih jelas" });
  return res.status(200).json({ ok: true, data });
}

async function gemini(gkey, image, mime, res) {
  // Coba beberapa nama model: kalau satu sudah dipensiunkan Google (404), pakai berikutnya.
  const daftar = [process.env.KTP_GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean);
  let pesan = "";
  for (const model of daftar) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": gkey, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: image } }, { text: PERINTAH }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" }
        })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        return kirimData(res, parts.map((p) => p.text || "").join(""));
      }
      const m = (j.error && j.error.message) || ("HTTP " + r.status);
      if (r.status == 404) { pesan = m; continue; }
      if (r.status == 429) return res.status(502).json({ ok: false, error: "Batas gratis pembaca KTP habis untuk sementara, coba lagi beberapa menit lagi" });
      if (/API key|API_KEY/i.test(m)) return res.status(502).json({ ok: false, error: "Kunci GEMINI_API_KEY ditolak Google (" + m.slice(0, 140) + ")" });
      return res.status(502).json({ ok: false, error: "Layanan pembaca KTP menolak (" + r.status + "): " + m.slice(0, 160) });
    } catch (e) {
      pesan = "Tidak bisa menghubungi layanan pembaca KTP";
    }
  }
  return res.status(502).json({ ok: false, error: "Model pembaca KTP tidak tersedia: " + pesan.slice(0, 160) });
}

module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
