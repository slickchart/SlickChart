// PUBLIC: serves slickchart.com/consult/<slug> — a branded page where a prospect can request a
// virtual consult from a specific provider. Resolves the slug to a provider, pulls their business
// name / website / brand color from their synced settings, and renders a self-contained form that
// posts to /api/consult-request. No client login required (these are new leads, not clients yet).
import { dbEnabled, getKVValue } from '../lib/db.js';
import { getProviderBySlug } from '../lib/consult.js';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// JSON.stringify escapes quotes/backslashes but NOT `<`, so a value containing `</script>`
// would break out of the inline <script>. Escape the script-terminator + line separators so a
// provider-controlled business name can never inject markup into a prospect's page.
function jsStr(s) { return JSON.stringify(String(s == null ? '' : s)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e'); }
function hex(c, fb) { c = String(c == null ? '' : c).trim(); if (/^#?[0-9a-fA-F]{6}$/.test(c)) return c[0] === '#' ? c : ('#' + c); if (/^#?[0-9a-fA-F]{3}$/.test(c)) { const x = c.replace('#', ''); return '#' + x[0] + x[0] + x[1] + x[1] + x[2] + x[2]; } return fb; }
function normUrl(u) { u = String(u || '').trim(); if (!u) return ''; return /^https?:\/\//i.test(u) ? u : ('https://' + u); }

function shell(inner, opts) {
  const o = opts || {};
  const accent = o.accent || '#C8A882';
  const title = esc(o.title || 'Virtual consult');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="theme-color" content="${esc(accent)}">
<meta name="robots" content="noindex">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root{--accent:${esc(accent)};}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f0eb;color:#1a1a1a;display:flex;justify-content:center;min-height:100vh;padding:0;}
.wrap{width:100%;max-width:460px;padding:28px 22px 56px;}
.brandrow{display:flex;align-items:center;gap:11px;margin-bottom:22px;}
.avatar{width:46px;height:46px;border-radius:13px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;flex-shrink:0;}
.biz{font-size:17px;font-weight:700;line-height:1.2;}
.web{font-size:12px;color:#8a7a6c;margin-top:2px;}
.web a{color:var(--accent);text-decoration:none;}
h1{font-size:23px;font-weight:700;line-height:1.25;margin-bottom:8px;}
.sub{font-size:14px;color:#6b5d52;line-height:1.6;margin-bottom:22px;}
label{display:block;font-size:12px;font-weight:600;color:#5a4a3a;margin:0 0 6px;}
.f{width:100%;background:#fff;border:1.5px solid #e8ddd3;border-radius:12px;padding:13px 14px;font-size:15px;color:#1a1a1a;font-family:inherit;margin-bottom:16px;outline:none;}
.f:focus{border-color:var(--accent);}
textarea.f{height:110px;resize:none;line-height:1.5;}
.btn{width:100%;background:var(--accent);color:#fff;border:none;border-radius:12px;padding:15px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;}
.btn:disabled{opacity:.55;cursor:default;}
.err{background:#fdecec;border:1px solid #f3c6c6;color:#a33;border-radius:10px;padding:10px 13px;font-size:13px;margin-bottom:16px;display:none;}
.foot{margin-top:26px;text-align:center;font-size:11px;color:#6b5d52;line-height:1.6;}
.done{text-align:center;padding:40px 10px;}
.done .ic{width:64px;height:64px;border-radius:18px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 18px;}
.done h2{font-size:21px;font-weight:700;margin-bottom:8px;}
.done p{font-size:14px;color:#6b5d52;line-height:1.6;}
@media (prefers-color-scheme:dark){body{background:#141210;color:#f0ebe4;}.f{background:#1e1b18;border-color:#332e28;color:#f0ebe4;}.sub,.done p,.foot{color:#b3a596;}.err{background:#2a1414;border-color:#5a2a2a;color:#e8a0a0;}}
</style></head><body><div class="wrap">${inner}</div></body></html>`;
}

function notFoundPage() {
  return shell(`<div class="done"><div class="ic" style="background:#c9bdb0;">🔗</div><h2>Link not active</h2><p>This consult link isn’t set up (yet), or the address is mistyped. Please double-check the link your provider shared with you.</p></div>`, { title: 'Consult link' });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  if (!dbEnabled() || !slug) { res.status(404).send(notFoundPage()); return; }

  let prov = null, biz = {}, brand = {};
  try {
    prov = await getProviderBySlug(slug);
    if (prov) {
      try { const raw = await getKVValue(prov.id, 'sc_bizinfo'); if (raw) biz = JSON.parse(raw) || {}; } catch (e) { biz = {}; }
      try { const raw = await getKVValue(prov.id, 'sc_brand_colors'); if (raw) brand = JSON.parse(raw) || {}; } catch (e) { brand = {}; }
    }
  } catch (e) { res.status(500).send(notFoundPage()); return; }
  if (!prov) { res.status(404).send(notFoundPage()); return; }

  const bizName = String(biz.name || prov.name || 'Virtual consult').slice(0, 80);
  const website = normUrl(biz.website || '');
  const webLabel = String(biz.website || '').replace(/^https?:\/\//i, '');
  const accent = hex(brand.primary, '#C8A882');
  const initial = (bizName.trim()[0] || '✦').toUpperCase();

  const inner = `
  <div class="brandrow">
    <div class="avatar">${esc(initial)}</div>
    <div><div class="biz">${esc(bizName)}</div>${website ? `<div class="web"><a href="${esc(website)}" target="_blank" rel="noopener nofollow">${esc(webLabel)}</a></div>` : ''}</div>
  </div>
  <div id="form-view">
    <h1>Request a virtual consult</h1>
    <div class="sub">Share a bit about what you’re hoping for and ${esc(bizName)} will follow up to set up your consult.</div>
    <div class="err" id="err"></div>
    <label for="c-name">Your name</label>
    <input class="f" id="c-name" type="text" autocomplete="name" placeholder="First and last name">
    <label for="c-email">Email</label>
    <input class="f" id="c-email" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com">
    <label for="c-phone">Phone <span style="font-weight:400;color:#a99;">(optional)</span></label>
    <input class="f" id="c-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(555) 123-4567">
    <label for="c-msg">What are you hoping for?</label>
    <textarea class="f" id="c-msg" placeholder="Your goals, any concerns, and anything you'd like them to know…"></textarea>
    <button class="btn" id="c-send" onclick="submitConsult()">Send request</button>
  </div>
  <div id="done-view" style="display:none;"></div>
  <div class="foot">Powered by SlickChart · Your details are shared only with ${esc(bizName)}.</div>
  <script>
  var SLUG=${jsStr(slug)}, BIZ=${jsStr(bizName)};
  function _v(id){var e=document.getElementById(id);return e?e.value.trim():'';}
  function _err(m){var e=document.getElementById('err');if(!e)return;if(m){e.textContent=m;e.style.display='block';}else{e.style.display='none';}}
  function submitConsult(){
    _err('');
    var name=_v('c-name'), email=_v('c-email'), phone=_v('c-phone'), message=_v('c-msg');
    if(!name){_err('Please add your name.');return;}
    if(!/.+@.+\\..+/.test(email)){_err('Please add a valid email.');return;}
    if(!message){_err('Please tell them a little about what you\\u2019re looking for.');return;}
    var btn=document.getElementById('c-send'); if(btn){btn.disabled=true;btn.textContent='Sending…';}
    fetch('/api/consult-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:SLUG,name:name,email:email,phone:phone,message:message})})
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
      .then(function(res){
        if(res.ok&&res.j&&res.j.ok){
          document.getElementById('form-view').style.display='none';
          var d=document.getElementById('done-view');
          d.innerHTML='<div class="done"><div class="ic">✓</div><h2>Request sent!</h2><p id="done-msg"></p></div>';
          var _dm=document.getElementById('done-msg');
          if(_dm)_dm.textContent='Thanks, '+name+'. '+BIZ+' will reach out soon to set up your virtual consult.';
          d.style.display='block';
          window.scrollTo(0,0);
        } else {
          _err((res.j&&res.j.error)||'Something went wrong — please try again.');
          if(btn){btn.disabled=false;btn.textContent='Send request';}
        }
      })
      .catch(function(){ _err('Could not send — please check your connection and try again.'); if(btn){btn.disabled=false;btn.textContent='Send request';} });
  }
  </script>`;

  res.status(200).send(shell(inner, { accent, title: 'Consult · ' + bizName }));
}
