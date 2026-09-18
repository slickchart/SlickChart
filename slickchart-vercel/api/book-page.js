// PUBLIC: serves slickchart.app/book/<slug> — a branded page where anyone can book with a specific
// provider. No login: the people using it are usually not clients yet, which is the point. It is the
// link a provider puts on her website and in her Instagram bio.
//
// Mirrors api/consult-page.js in shape and styling deliberately — same slug system, same brand
// lookup, same no-login shell — so the two public pages look like one product.
import { dbEnabled, getKVValue } from '../lib/db.js';
import { getProviderBySlug } from '../lib/consult.js';
import { getBookingConfig, getServices, getHours, openDayKeys, toMins, DAY_KEYS, serviceMins, serviceDeposit } from '../lib/booking.js';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// JSON.stringify escapes quotes but NOT `<`, so a business name containing `</script>` would break
// out of the inline script. Escape the terminator so provider-controlled text can never inject.
function jsStr(s) { return JSON.stringify(String(s == null ? '' : s)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e'); }
function hex(c, fb) { c = String(c == null ? '' : c).trim(); if (/^#?[0-9a-fA-F]{6}$/.test(c)) return c[0] === '#' ? c : ('#' + c); if (/^#?[0-9a-fA-F]{3}$/.test(c)) { const x = c.replace('#', ''); return '#' + x[0] + x[0] + x[1] + x[1] + x[2] + x[2]; } return fb; }
function normUrl(u) { u = String(u || '').trim(); if (!u) return ''; return /^https?:\/\//i.test(u) ? u : ('https://' + u); }
function initialsOf(n) { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
function pretty(t) { const m = toMins(t); if (m == null) return ''; const h = Math.floor(m / 60), mi = m % 60; const ap = h < 12 ? 'am' : 'pm'; let hh = h % 12; if (hh === 0) hh = 12; return hh + (mi ? ':' + String(mi).padStart(2, '0') : '') + ap; }

function shell(inner, o) {
  o = o || {};
  const accent = o.accent || '#2BC7AC';
  const title = esc(o.title || 'Book an appointment');
  const ogDesc = esc(o.ogDesc || 'Book an appointment.');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="theme-color" content="${esc(accent)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${ogDesc}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${ogDesc}">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root{--accent:${esc(accent)};}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f0eb;color:#1a1a1a;display:flex;justify-content:center;min-height:100vh;}
.wrap{width:100%;max-width:460px;padding:28px 22px 56px;}
.brandrow{display:flex;align-items:center;gap:11px;margin-bottom:22px;}
.avatar{width:46px;height:46px;border-radius:13px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;flex-shrink:0;}
.biz{font-size:17px;font-weight:700;line-height:1.2;}
.web{font-size:12px;color:#8a7a6c;margin-top:2px;}
.web a{color:var(--accent);text-decoration:none;}
h1{font-size:23px;font-weight:700;line-height:1.25;margin-bottom:8px;}
.sub{font-size:14px;color:#6b5d52;line-height:1.6;margin-bottom:22px;}
label{display:block;font-size:12px;font-weight:600;color:#5a4a3a;margin:0 0 6px;}
.f{width:100%;background:#fff;border:1.5px solid #e8ddd3;border-radius:12px;padding:13px 14px;font-size:16px;color:#1a1a1a;font-family:inherit;margin-bottom:16px;outline:none;}
.f:focus{border-color:var(--accent);}
textarea.f{height:90px;resize:none;line-height:1.5;}
.btn{width:100%;background:var(--accent);color:#fff;border:none;border-radius:12px;padding:15px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;}
.btn:disabled{opacity:.55;cursor:default;}
.err{background:#fdecec;border:1px solid #f3c6c6;color:#a33;border-radius:10px;padding:10px 13px;font-size:13px;margin-bottom:16px;display:none;}
.hours{background:#fff;border:1.5px solid #e8ddd3;border-radius:12px;padding:12px 14px;margin-bottom:20px;font-size:13px;color:#6b5d52;line-height:1.7;}
.hours b{color:#1a1a1a;font-weight:600;}
.slots{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;min-height:20px;}
.slot{border:1.5px solid #e8ddd3;background:#fff;border-radius:999px;padding:9px 15px;font-size:15px;cursor:pointer;font-family:inherit;color:#1a1a1a;}
.slot[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700;}
.muted{font-size:13px;color:#8a7a6c;line-height:1.6;margin-bottom:16px;}
.foot{margin-top:26px;text-align:center;font-size:11px;color:#6b5d52;line-height:1.6;}
.done{text-align:center;padding:40px 10px;}
.done .ic{width:64px;height:64px;border-radius:18px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 18px;}
.done h2{font-size:21px;font-weight:700;margin-bottom:8px;}
.done p{font-size:14px;color:#6b5d52;line-height:1.6;}
@media (prefers-color-scheme:dark){body{background:#141210;color:#f0ebe4;}.f,.hours,.slot{background:#1e1b18;border-color:#332e28;color:#f0ebe4;}.sub,.done p,.foot,.hours,.muted{color:#b3a596;}.hours b{color:#f0ebe4;}.err{background:#2a1414;border-color:#5a2a2a;color:#e8a0a0;}}
</style></head><body><div class="wrap">${inner}</div></body></html>`;
}

function notActive() {
  return shell(`<div class="done"><div class="ic" style="background:#c9bdb0;">🔗</div><h2>Booking link not active</h2><p>This booking link isn’t set up (yet), or the address is mistyped. Please double-check the link and try again.</p></div>`, { title: 'Booking' });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  if (!dbEnabled() || !slug) { res.status(404).send(notActive()); return; }

  let prov = null, biz = {}, brand = {};
  try {
    prov = await getProviderBySlug(slug);
    if (!prov) { res.status(404).send(notActive()); return; }
    try { const raw = await getKVValue(prov.id, 'sc_bizinfo'); if (raw) biz = JSON.parse(raw) || {}; } catch (e) { biz = {}; }
    try { const raw = await getKVValue(prov.id, 'sc_brand_colors'); if (raw) brand = JSON.parse(raw) || {}; } catch (e) { brand = {}; }

    const cfg = await getBookingConfig(prov.id);
    if (!cfg.on) { res.status(404).send(notActive()); return; }
    const hours = await getHours(prov.id);
    if (!hours) { res.status(404).send(notActive()); return; }
    const services = await getServices(prov.id, cfg);
    const openDays = openDayKeys(hours);

    const accent = hex(brand.primary, '#2BC7AC');
    const bizName = String(biz.name || prov.name || 'Book an appointment').trim();
    const site = normUrl(biz.website);
    const DAY_LABEL = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
    const hoursHtml = DAY_KEYS.filter(d => hours[d] && hours[d].open)
      .map(d => `<div><b>${DAY_LABEL[d]}</b> · ${esc(pretty(hours[d].start))} – ${esc(pretty(hours[d].end))}</div>`).join('') || '<div>Hours on request</div>';

    const inner = `
  <div class="brandrow">
    <div class="avatar">${esc(initialsOf(bizName))}</div>
    <div><div class="biz">${esc(bizName)}</div>${site ? `<div class="web"><a href="${esc(site)}" target="_blank" rel="noopener">${esc(site.replace(/^https?:\/\//, ''))}</a></div>` : ''}</div>
  </div>
  <div id="form">
    <h1>Book an appointment</h1>
    <p class="sub">${cfg.mode === 'instant'
      ? 'Pick a time that works and it’s yours — you’ll get a confirmation by email.'
      : 'Tell them when suits you. They’ll confirm, or suggest another time if that one’s taken.'}${cfg.note ? ' ' + esc(cfg.note) : ''}</p>
    <div class="err" id="err"></div>
    <label for="f-name">Your name</label><input class="f" id="f-name" autocomplete="name">
    <label for="f-email">Email</label><input class="f" id="f-email" type="email" autocomplete="email" inputmode="email">
    <label for="f-phone">Phone${cfg.requirePhone ? '' : ' (optional)'}</label><input class="f" id="f-phone" type="tel" autocomplete="tel" inputmode="tel">
    <label for="f-svc">What for</label>
    <select class="f" id="f-svc" onchange="onSvc()">${services.map(sv => {
      const mins = serviceMins(sv, cfg), dep = serviceDeposit(sv, cfg);
      const bits = [mins + ' min']; if (dep > 0) bits.push('$' + dep + ' deposit');
      return `<option value="${esc(sv.name)}">${esc(sv.name)} \u00b7 ${esc(bits.join(' \u00b7 '))}</option>`;
    }).join('')}</select>
    <div id="depnote" class="muted" style="display:none;margin:-8px 0 14px;"></div>
    <label for="f-date">Day</label><input class="f" id="f-date" type="date">
    <div id="timewrap">
      <label for="f-time">Time</label>
      <div class="slots" id="slots"></div>
      <input class="f" id="f-time" type="time" style="display:none;">
    </div>
    <div class="hours"><div style="margin-bottom:5px;"><b>Their hours</b></div>${hoursHtml}</div>
    <label for="f-note">Anything they should know (optional)</label>
    <textarea class="f" id="f-note" placeholder="First time, something you're working on, a question…"></textarea>
    <button class="btn" id="go" type="button">Request this time</button>
  </div>
  <div class="foot">Powered by SlickChart</div>`;

    const boot = `<script>
var SLUG=${jsStr(slug)}, MODE=${jsStr(cfg.mode)}, OPEN=${JSON.stringify(openDays)},
    HORIZON=${cfg.horizonDays}, ACCENT=${jsStr(accent)}, DONEIC='\\u2713';
// name → {mins, deposit}, so the page can say what each one costs in time and money up front.
var SVC=${JSON.stringify(services.reduce((m, sv) => { m[sv.name] = { mins: serviceMins(sv, cfg), dep: serviceDeposit(sv, cfg) }; return m; }, {}))};
var DKEY=['sun','mon','tue','wed','thu','fri','sat'];
var picked='', slotsFor='';
function $(id){return document.getElementById(id);}
// Anything that came back over the wire gets escaped before it touches innerHTML.
function eh(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function show(m){var e=$('err');e.textContent=m;e.style.display=m?'block':'none';if(m)window.scrollTo({top:0,behavior:'smooth'});}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// First day she is actually open, so the date field never opens on a day that cannot be booked.
function firstOpen(){var d=new Date();d.setHours(12,0,0,0);for(var i=0;i<=HORIZON;i++){if(OPEN.indexOf(DKEY[d.getDay()])>=0)return iso(d);d.setDate(d.getDate()+1);}return iso(new Date());}
function setupDate(){
  var el=$('f-date'); var t=new Date(); t.setHours(12,0,0,0);
  el.min=iso(t); var max=new Date(t); max.setDate(max.getDate()+HORIZON); el.max=iso(max);
  el.value=firstOpen(); el.addEventListener('change',onDate); onDate();
}
// A different service can be a different length, so the open times change with it.
function onSvc(){
  var s=SVC[$('f-svc').value]||{};
  var d=$('depnote');
  if(d){ d.style.display=(s.dep>0)?'':'none';
    if(s.dep>0)d.textContent='This one needs a $'+s.dep+' deposit. You\\u2019ll get a link to pay it as soon as you book.'; }
  onDate();
}
function onDate(){
  var v=$('f-date').value; picked='';
  var d=v?new Date(v+'T12:00:00'):null;
  if(!d||isNaN(d)||OPEN.indexOf(DKEY[d.getDay()])<0){ $('slots').innerHTML='<div class="muted">They\\u2019re closed that day \\u2014 please pick another.</div>'; $('f-time').style.display='none'; return; }
  if(MODE==='instant')loadSlots(v); else freeTime();
}
// Request mode: any time inside her hours, she decides.
function freeTime(){ $('slots').innerHTML=''; var t=$('f-time'); t.style.display=''; }
function loadSlots(v){
  slotsFor=v+'|'+$('f-svc').value;
  $('f-time').style.display='none';
  $('slots').innerHTML='<div class="muted">Finding open times\\u2026</div>';
  fetch('/api/book-slots?slug='+encodeURIComponent(SLUG)+'&date='+encodeURIComponent(v)+'&service='+encodeURIComponent($('f-svc').value))
    .then(function(r){return r.json();}).then(function(j){
      if(slotsFor!==v+'|'+$('f-svc').value)return;   // a later day or service was picked while this was in flight
      // The server could not see the whole calendar, so it will not promise a slot is free.
      // Fall back to asking, rather than offering a time that might already be taken.
      if(j&&j.unknown){ MODE='request'; $('go').textContent='Request this time'; freeTime(); return; }
      var s=(j&&j.slots)||[];
      if(!s.length){ $('slots').innerHTML='<div class="muted">Nothing open that day \\u2014 try another.</div>'; return; }
      $('slots').innerHTML=s.map(function(t){return '<button type="button" class="slot" aria-pressed="false" data-t="'+t.replace(/"/g,'')+'">'+t+'</button>';}).join('');
      Array.prototype.forEach.call($('slots').querySelectorAll('.slot'),function(b){
        b.addEventListener('click',function(){
          picked=b.getAttribute('data-t');
          Array.prototype.forEach.call($('slots').querySelectorAll('.slot'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
        });
      });
    }).catch(function(){ MODE='request'; freeTime(); });
}
function timeValue(){
  if(MODE==='instant')return picked;
  var v=$('f-time').value; if(!v)return '';
  var p=v.split(':'),h=parseInt(p[0],10),mi=p[1]; var ap=h<12?'AM':'PM',hh=h%12; if(hh===0)hh=12;
  return hh+':'+mi+' '+ap;
}
$('go').addEventListener('click',function(){
  show('');
  var name=$('f-name').value.trim(), email=$('f-email').value.trim(), phone=$('f-phone').value.trim();
  if(!name)return show('Please add your name.');
  if(!email||email.indexOf('@')<0)return show('Please add a valid email.');
  ${cfg.requirePhone ? "if(!phone)return show('Please add a phone number.');" : ''}
  var t=timeValue();
  if(!$('f-date').value||!t)return show(MODE==='instant'?'Please pick a time.':'Please pick a day and time.');
  var b=$('go'); b.disabled=true; b.textContent='Sending\\u2026';
  fetch('/api/book-request',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({slug:SLUG,name:name,email:email,phone:phone,service:$('f-svc').value,
      date:$('f-date').value,time:t,note:$('f-note').value.trim()})})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
    .then(function(x){
      if(!x.ok||!x.j.ok){
        b.disabled=false; b.textContent=MODE==='instant'?'Book this time':'Request this time';
        if(x.j&&x.j.code==='taken'&&MODE==='instant'){ show(x.j.error); loadSlots($('f-date').value); return; }
        return show((x.j&&x.j.error)||'Something went wrong. Please try again.');
      }
      var durl=String(x.j.depositUrl||''); if(durl.slice(0,8)!=='https://')durl='';
      var dep=durl?('<div style="margin-top:20px;"><p style="font-size:14px;color:#6b5d52;line-height:1.6;margin-bottom:12px;">'
        +eh(x.j.depositLabel||'A deposit is needed to hold this appointment.')+'</p>'
        +'<a class="btn" style="display:block;text-decoration:none;text-align:center;" href="'+eh(durl)+'">Pay the deposit</a></div>'):'';
      document.querySelector('.wrap').innerHTML='<div class="done"><div class="ic">'+DONEIC+'</div><h2>'
        +(x.j.confirmed?'You\\u2019re booked':'Request sent')+'</h2><p>'
        +(x.j.confirmed
          ? 'Your appointment is set for <b>'+eh(x.j.when)+'</b>. Check your email for the details.'
          : 'They\\u2019ll confirm <b>'+eh(x.j.when)+'</b>, or suggest another time if that one\\u2019s taken. Watch your email.')
        +'</p>'+dep+'</div>';
      window.scrollTo(0,0);
    })
    .catch(function(){ b.disabled=false; b.textContent=MODE==='instant'?'Book this time':'Request this time'; show('Couldn\\u2019t reach the server. Please try again.'); });
});
if(MODE==='instant')$('go').textContent='Book this time';
setupDate();
onSvc();
</script>`;

    res.status(200).send(shell(inner + boot, {
      accent, title: 'Book with ' + bizName,
      ogDesc: (cfg.mode === 'instant' ? 'Pick a time and book instantly.' : 'Request an appointment.') + ' ' + bizName
    }));
  } catch (e) {
    console.error('[book-page] failed:', e && e.stack || e);
    res.status(500).send(notActive());
  }
}
