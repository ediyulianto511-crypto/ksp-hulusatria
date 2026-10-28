// Kirim gambar struk ke WhatsApp anggota lewat Fonnte.
// Token Fonnte disimpan di Vercel: Settings > Environment Variables > FONNTE_TOKEN.
const SUPABASE_URL = "https://tmepqhwuplutbnzlyihp.supabase.co";
const SUPABASE_KEY = "sb_publishable_XaXeoIxoBGts7Gzjq_OA0Q_ap64Lzs3";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metode tidak didukung" });
  const token = process.env.FONNTE_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: "Token Fonnte belum dipasang di Vercel" });

  // Hanya pengguna yang sudah login di aplikasi yang boleh mengirim.
  const auth = req.headers.authorization || "";
  const cek = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: auth } });
  if (!cek.ok) return res.status(401).json({ ok: false, error: "Sesi login tidak valid, silakan login ulang" });

  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const target = String(b.target || "").replace(/[^0-9]/g, "");
  if (target.length < 9 || !b.image) return res.status(400).json({ ok: false, error: "Data struk tidak lengkap" });

  const fd = new FormData();
  fd.append("target", target);
  fd.append("message", String(b.caption || "").slice(0, 1000));
  fd.append("countryCode", "62");
  fd.append("file", new Blob([Buffer.from(b.image, "base64")], { type: "image/png" }), String(b.nama || "struk.png"));

  try {
    const r = await fetch("https://api.fonnte.com/send", { method: "POST", headers: { Authorization: token }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === false) return res.status(502).json({ ok: false, error: j.reason || j.detail || "Fonnte menolak pengiriman" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Tidak bisa menghubungi Fonnte" });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
