// POST /api/waitlist  { email, name?, profession? }  → join the post-250 waitlist
// GET  /api/waitlist                                  → owner-only: { count, items }
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

function claims(req){ const s=process.env.SESSION_SECRET||''; const h=req.headers['authorization']||''; const t=h.startsWith('Bearer ')?h.slice(7):''; return (s&&t?verifyToken(t,s):null)||{}; }

async function ensureWaitlist(q){
  await q`CREATE TABLE IF NOT EXISTS waitlist (
    id serial PRIMARY KEY,
    email text UNIQUE,
    name text,
    profession text,
    created_at timestamptz DEFAULT now()
  )`;
}

export default async function handler(req, res){
  if(!dbEnabled()){ res.status(200).json({ ok:true, skipped:true }); return; }
  const q = sql();
  try{
    await ensureProvidersTable();
    await ensureWaitlist(q);

    if(req.method === 'POST'){
      const b = req.body || {};
      const email = String(b.email||'').trim().toLowerCase().slice(0,200);
      if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ res.status(400).json({ error:'Please enter a valid email.' }); return; }
      const name = String(b.name||'').trim().slice(0,120) || null;
      const profession = String(b.profession||'').trim().slice(0,120) || null;
      await q`INSERT INTO waitlist (email, name, profession) VALUES (${email}, ${name}, ${profession})
        ON CONFLICT (email) DO UPDATE SET name=COALESCE(EXCLUDED.name, waitlist.name), profession=COALESCE(EXCLUDED.profession, waitlist.profession)`;
      const c = (await q`SELECT count(*)::int AS n FROM waitlist`)[0];
      res.status(200).json({ ok:true, count:(c&&c.n)||0 });
      return;
    }

    if(req.method === 'GET'){
      const owner=(process.env.OWNER_EMAIL||'').trim().toLowerCase();
      const p=claims(req);
      let you=p.e?String(p.e).toLowerCase():null;
      if(!you && p.u){ try{ const r=await q`SELECT email FROM providers WHERE id=${p.u}`; you=(r[0]&&r[0].email)?String(r[0].email).toLowerCase():null; }catch(e){} }
      if(!owner || you!==owner){ res.status(403).json({ error:'Owner only' }); return; }
      const rows = await q`SELECT email, name, profession, extract(epoch from created_at)*1000 AS ts FROM waitlist ORDER BY created_at DESC LIMIT 1000`;
      res.status(200).json({ ok:true, count:rows.length, items: rows.map(r=>({ email:r.email, name:r.name, profession:r.profession, ts:Math.round(Number(r.ts)) })) });
      return;
    }
    res.status(405).json({ error:'Method not allowed' });
  }catch(e){ res.status(500).json({ error:e.message }); }
}
