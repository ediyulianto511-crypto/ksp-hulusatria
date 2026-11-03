// Baca data KTP dari foto memakai Claude (Anthropic).
// Kunci disimpan di Vercel: Settings > Environment Variables > ANTHROPIC_API_KEY.
const SUPABASE_URL = "https://tmepqhwuplutbnzlyihp.supabase.co";
const SUPABASE_KEY = "sb_publishable_XaXeoIxoBGts7Gzjq_OA0Q_ap64Lzs3";
const PERINTAH = "Baca foto KTP Indonesia ini. Jawab HANYA dengan satu objek JSON tanpa teks lain, dengan kunci: nama, nik (16 angka), tempat_lahir, tanggal_lahir (format YYYY-MM-DD), jenis_kelamin (Laki-laki atau Perempuan), alamat (jalan atau dusun saja, tanpa RT/RW), rt (angka), rw (angka), kecamatan, kelurahan_desa, kabupaten (tulis lengkap, misalnya Kabupaten Bogor atau Kota Bandung), agama (Islam, Kristen, Katolik, Hindu, Buddha, atau Konghucu), status_perkawinan (Belum kawin, Kawin, Cerai hidup, atau Cerai mati), pekerjaan, kewarganegaraan (WNI atau WNA). Jika sebuah isian tidak terbaca atau gambar bukan KTP, isi string kosong. Jangan menebak.";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metode tidak didukung" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: "Kunci ANTHROPIC_API_KEY belum dipasang di Vercel" });

  // Hanya pengguna yang sudah login di aplikasi yang boleh memakai.
  const auth = req.headers.authorization || "";
  const cek = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: auth } });
  if (!cek.ok) return res.status(401).json({ ok: false, error: "Sesi login tidak valid, silakan login ulang" });

  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (!b.image) return res.status(400).json({ ok: false, error: "Foto KTP tidak ada" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.KTP_MODEL || "claude-haiku-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: String(b.image) } },
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
    const teks = (j.content || []).map((c) => c.text || "").join("");
    const a = teks.indexOf("{"), z = teks.lastIndexOf("}");
    let data = null;
    try { data = JSON.parse(teks.slice(a, z + 1)); } catch (e) {}
    if (!data) return res.status(422).json({ ok: false, error: "KTP tidak terbaca, coba foto yang lebih jelas" });
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Tidak bisa menghubungi layanan pembaca KTP" });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
