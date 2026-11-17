// PUBLIC (no login): slickchart.app/booking/manage?m=<token> — "Change or cancel" for someone who
// booked through a provider's public link. The link is in their confirmation email.
//
//   GET  ?m=…                      the page
//   GET  ?m=…&slots=1&date=YYYY-MM-DD   open times that day (instant mode), same as /api/book-slots
//   POST { m, action:'cancel'|'move', date, time }
//
// ISOLATION (CLAUDE.md §0): the token opens ONE booking (lib/booking-manage: HMAC over the provider id
// and event id, provider read from the event row). Nothing here takes a provider, client or booking id
// from the request. The page shows only that booking's treatment and time, which the person already
// had in their email, and the business's own public details.
//
// What a change does: it is recorded as a `booking_change` event for her account. Her app picks it up
// on its next poll (_clientBookingChanges) and closes the old entry in Booking Requests and on her
// calendar; a move becomes a new entry, booked if the time was open (instant mode) or a request she
// confirms. Her Square booking is cancelled or moved here and now, with her own connection. She gets a
// push and (if she has it on) an email; the person gets an email.
import crypto from 'crypto';
import { dbEnabled, sql, getKVValue } from '../lib/db.js';
import { readBrand, brandVars, brandRowHtml, esc, jsonForScript } from '../lib/public-brand.js';
import { getBookingConfig, getHours, openSlots, openDayKeys, isoDay, toMins } from '../lib/booking.js';
import { bookingFromToken, currentState, checkNewTime, changeWindowOpen, squareApply, manageUrl } from '../lib/booking-manage.js';
import { logEventOnce } from '../lib/clients.js';
import { getSlugForProvider } from '../lib/consult.js';
import { sendEmail, trustedOrigin, bookingChangeGuestEmail, bookingChangeProviderEmail } from '../lib/email.js';
import { alertProvider } from '../lib/booking-alerts.js';
import { shell } from './book-page.js';

const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now); _hits.set(key, arr);
  if (_hits.size > 5000) { for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; } }
  return true;
}
function ipOf(req) { return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || 'ip'; }
function jsStr(s) { return JSON.stringify(String(s == null ? '' : s)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e'); }
function labelOf(date) {
  try { return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return date; }
}
function hoursText(h) {
  h = Number(h) || 0;
  if (h >= 24 && h % 24 === 0) return (h / 24) + (h === 24 ? ' day' : ' days');
  return h + (h === 1 ? ' hour' : ' hours');
}

function notFound() {
  return shell(`<div class="done"><div class="ic" style="background:#c9bdb0;">🔗</div><h2>Link not found</h2><p>This change or cancel link isn’t valid. Please use the link in your confirmation email, or reply to that email to reach the business.</p></div>`, { title: 'Your appointment' });
}

async function bizOf(providerId) {
  let biz = {};
  try { const raw = await getKVValue(providerId, 'sc_bizinfo'); if (raw) biz = JSON.parse(raw) || {}; } catch (e) {}
  let prov = null;
  try { const q = sql(); const r = await q`SELECT id, name, email FROM providers WHERE id = ${providerId}`; prov = r[0] || null; } catch (e) {}
  return { biz, prov };
}
async function personOf(bk) {
  try {
    const q = sql();
    const r = await q`SELECT name, email, phone FROM clients WHERE id = ${bk.clientId} AND provider_id = ${bk.providerId} LIMIT 1`;
    return r[0] || {};
  } catch (e) { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbEnabled()) { res.status(404).send(notFound()); return; }
  const isPost = req.method === 'POST';
  if (!isPost && req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const src = isPost ? (req.body || {}) : (req.query || {});
  const m = String(src.m || '').slice(0, 220);
  const ip = ipOf(req);
  if (!burstOk('bm:' + ip, isPost ? 10 : 60, 60000)) {
    if (isPost || src.slots) { res.status(429).json({ error: 'Too many tries. Please wait a minute.' }); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.status(429).send(notFound()); return;
  }

  let bk = null;
  try { bk = await bookingFromToken(m); } catch (e) { bk = null; }
  if (!bk) {
    if (isPost || src.slots) { res.status(404).json({ error: 'This link is not valid.' }); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.status(404).send(notFound()); return;
  }

  try {
    const cfg = await getBookingConfig(bk.providerId);
    const st = await currentState(bk);
    const win = await changeWindowOpen(bk.providerId, cfg, st);
    const canChange = win.open && (st.status === 'pending' || st.status === 'confirmed');

    // ── open times for one day (instant mode) ──
    if (!isPost && src.slots) {
      const date = isoDay(src.date);
      if (!date || !canChange) { res.status(200).json({ ok: true, slots: [] }); return; }
      if (cfg.mode !== 'instant') { res.status(200).json({ ok: true, mode: 'request', slots: [] }); return; }
      const slots = await openSlots(bk.providerId, date, cfg, await getHours(bk.providerId), st.treatment);
      if (slots === null) { res.status(200).json({ ok: true, mode: 'request', unknown: true, slots: [] }); return; }
      res.status(200).json({ ok: true, mode: 'instant', slots });
      return;
    }

    const { biz, prov } = await bizOf(bk.providerId);
    const bizName = String(biz.name || (prov && prov.name) || 'Your appointment').trim();

    // ── the page ──
    if (!isPost) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const brand = await readBrand(bk.providerId, prov && prov.name);
      const when = (st.dateLabel || labelOf(st.date)) + (st.time ? ' at ' + st.time : '');
      const contact = [biz.phone ? 'call or text ' + esc(biz.phone) : '', 'reply to your confirmation email'].filter(Boolean).join(', or ');
      let slug = ''; try { slug = await getSlugForProvider(bk.providerId); } catch (e) {}
      const again = (slug && cfg.on) ? `<a class="btn" style="display:block;text-decoration:none;text-align:center;margin-top:20px;" href="/book/${encodeURIComponent(slug)}">Book another time</a>` : '';
      const card = `<div class="hours" id="appt"><div style="margin-bottom:4px;"><b>${esc(st.treatment || 'Appointment')}</b></div><div>${esc(when)}</div>
        <div style="margin-top:6px;font-size:12px;">${st.status === 'confirmed' ? 'Booked' : st.status === 'pending' ? `Waiting for ${esc(bizName)} to confirm` : st.status === 'cancelled' ? 'Cancelled' : 'Not accepted'}</div></div>`;
      let inner = brandRowHtml(Object.assign({}, brand, { name: bizName }));
      if (st.status === 'cancelled') {
        inner += `<div class="done"><div class="ic" style="background:#c9bdb0;">✕</div><h2>This appointment is cancelled</h2><p>${esc(st.treatment || 'Your appointment')} on ${esc(when)} is cancelled.</p>${again}</div>`;
      } else if (st.status === 'declined') {
        inner += `<div class="done"><div class="ic" style="background:#c9bdb0;">!</div><h2>This request was not accepted</h2><p>To find another time, ${contact}.</p>${again}</div>`;
      } else if (!win.open) {
        const why = win.why === 'past' ? 'This appointment time has passed.'
          : win.why === 'late' ? `It is less than ${esc(hoursText(cfg.changeHours))} before your appointment, so it can’t be changed online.`
          : `${esc(bizName)} handles changes personally.`;
        inner += `<h1>Your appointment</h1>${card}<p class="sub">${why} To change or cancel, please ${contact}.</p>`;
      } else {
        const openDays = openDayKeys((await getHours(bk.providerId)) || {});
        inner += `<div id="main"><h1>Your appointment</h1>${card}
          <div class="err" id="err"></div>
          <div id="pick" style="display:none;">
            <label for="f-date">New day</label><input class="f" id="f-date" type="date">
            <label for="f-time">New time</label>
            <div class="slots" id="slots"></div>
            <input class="f" id="f-time" type="time" style="display:none;">
            <button class="btn" id="go-move" type="button">${cfg.mode === 'instant' ? 'Move to this time' : 'Request this time'}</button>
            <p class="muted" id="move-note" style="margin-top:10px;">${cfg.mode === 'instant' ? '' : `${esc(bizName)} will confirm the new time.${st.status === 'confirmed' ? ' Your current time is released when you send this.' : ''}`}</p>
          </div>
          <div id="actions">
            <button class="btn" id="btn-move" type="button">Pick a new time</button>
            <button class="share" id="btn-cancel" type="button">Cancel appointment</button>
          </div>
          <div id="confirm-cancel" style="display:none;">
            <p class="sub">Cancel ${esc(st.treatment || 'your appointment')} on ${esc(when)}?</p>
            <button class="btn" id="go-cancel" type="button">Yes, cancel it</button>
            <button class="share" id="keep" type="button">Keep my appointment</button>
          </div>
          ${cfg.changeHours ? `<p class="muted" style="margin-top:18px;">Changes can be made online up to ${esc(hoursText(cfg.changeHours))} before your appointment.</p>` : ''}
        </div>`;
        inner += `<script>
var M=${jsStr(m)}, MODE=${jsStr(cfg.mode)}, OPEN=${jsonForScript(openDays)}, HORIZON=${cfg.horizonDays}, LEAD=${Math.max(0, parseInt(cfg.leadHours, 10) || 0)}, BIZ=${jsStr(bizName)};
var DKEY=['sun','mon','tue','wed','thu','fri','sat'], picked='', slotsFor='';
function $(id){return document.getElementById(id);}
function eh(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function show(m){var e=$('err');e.textContent=m;e.style.display=m?'block':'none';}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function tooSoon(d){var e=new Date(d);e.setHours(23,59,0,0);return e.getTime()<Date.now()+LEAD*3600000;}
function firstOpen(){var d=new Date();d.setHours(12,0,0,0);for(var i=0;i<=HORIZON;i++){if(OPEN.indexOf(DKEY[d.getDay()])>=0&&!tooSoon(d))return iso(d);d.setDate(d.getDate()+1);}return iso(new Date());}
function done(title,body){ $('main').innerHTML='<div class="done"><div class="ic">\\u2713</div><h2>'+eh(title)+'</h2><p>'+body+'</p></div>'; window.scrollTo(0,0); }
$('btn-move').onclick=function(){ show(''); $('actions').style.display='none'; $('pick').style.display=''; var el=$('f-date'); var t=new Date(); t.setHours(12,0,0,0); el.min=iso(t); var mx=new Date(t); mx.setDate(mx.getDate()+HORIZON); el.max=iso(mx); if(!el.value)el.value=firstOpen(); el.onchange=onDate; onDate(); };
$('btn-cancel').onclick=function(){ show(''); $('actions').style.display='none'; $('confirm-cancel').style.display=''; };
$('keep').onclick=function(){ $('confirm-cancel').style.display='none'; $('actions').style.display=''; };
function onDate(){
  var v=$('f-date').value; picked='';
  var d=v?new Date(v+'T12:00:00'):null;
  if(!d||isNaN(d)||OPEN.indexOf(DKEY[d.getDay()])<0){ $('slots').innerHTML='<div class="muted">They\\u2019re closed that day. Please pick another.</div>'; $('f-time').style.display='none'; return; }
  if(tooSoon(d)){ $('slots').innerHTML='<div class="muted">That day is too soon. Please pick a later day.</div>'; $('f-time').style.display='none'; return; }
  if(MODE==='instant')loadSlots(v); else { $('slots').innerHTML=''; $('f-time').style.display=''; }
}
function loadSlots(v){
  slotsFor=v; $('f-time').style.display='none'; $('slots').innerHTML='<div class="muted">Finding open times\\u2026</div>';
  fetch('/booking/manage?slots=1&m='+encodeURIComponent(M)+'&date='+encodeURIComponent(v)).then(function(r){return r.json();}).then(function(j){
    if(slotsFor!==v)return;
    if(j&&j.unknown){ MODE='request'; $('go-move').textContent='Request this time'; $('move-note').textContent=BIZ+' will confirm the new time.'; $('slots').innerHTML=''; $('f-time').style.display=''; return; }
    var s=(j&&j.slots)||[];
    if(!s.length){ $('slots').innerHTML='<div class="muted">Nothing open that day. Try another.</div>'; return; }
    $('slots').innerHTML=s.map(function(t){return '<button type="button" class="slot" aria-pressed="false" data-t="'+eh(t)+'">'+eh(t)+'</button>';}).join('');
    Array.prototype.forEach.call($('slots').querySelectorAll('.slot'),function(b){ b.onclick=function(){ picked=b.getAttribute('data-t'); Array.prototype.forEach.call($('slots').querySelectorAll('.slot'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false');}); }; });
  }).catch(function(){ MODE='request'; $('slots').innerHTML=''; $('f-time').style.display=''; });
}
function timeValue(){
  if(MODE==='instant')return picked;
  var v=$('f-time').value; if(!v)return '';
  var p=v.split(':'),h=parseInt(p[0],10),mi=p[1]; var ap=h<12?'AM':'PM',hh=h%12; if(hh===0)hh=12; return hh+':'+mi+' '+ap;
}
function send(body,btn,label,ok){
  btn.disabled=true; btn.textContent='Sending\\u2026'; show('');
  fetch('/booking/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({m:M},body))})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
    .then(function(x){
      if(!x.ok||!x.j.ok){ btn.disabled=false; btn.textContent=label; if(x.j&&x.j.code==='taken'&&MODE==='instant')loadSlots($('f-date').value); return show((x.j&&x.j.error)||'Something went wrong. Please try again.'); }
      ok(x.j);
    }).catch(function(){ btn.disabled=false; btn.textContent=label; show('Couldn\\u2019t reach the server. Please try again.'); });
}
$('go-cancel').onclick=function(){ send({action:'cancel'},$('go-cancel'),'Yes, cancel it',function(j){ done('Appointment cancelled','You\\u2019ll get an email to confirm it. '+eh(BIZ)+' has been told.'); }); };
$('go-move').onclick=function(){
  var t=timeValue(); if(!$('f-date').value||!t)return show('Please pick a day and a time.');
  var lbl=$('go-move').textContent;
  send({action:'move',date:$('f-date').value,time:t},$('go-move'),lbl,function(j){
    done(j.confirmed?'Appointment moved':'Request sent', j.confirmed?('You\\u2019re now booked for <b>'+eh(j.when)+'</b>. Check your email for the details.'):(eh(BIZ)+' will confirm <b>'+eh(j.when)+'</b>, or suggest another time. Watch your email.'));
  });
};
</script>`;
      }
      inner += `<div class="foot">Powered by SlickChart · Your details are shared only with ${esc(bizName)}.</div>`;
      res.status(200).send(shell(inner, { accent: brand.accent, vars: brandVars(brand), title: 'Your appointment with ' + bizName, ogDesc: 'Change or cancel your appointment.' }));
      return;
    }

    // ── a change ──
    const action = src.action === 'cancel' ? 'cancel' : src.action === 'move' ? 'move' : '';
    if (!action) { res.status(400).json({ error: 'Bad request' }); return; }
    if (st.status === 'cancelled') { res.status(409).json({ error: 'This appointment is already cancelled.', code: 'cancelled' }); return; }
    if (st.status === 'declined') { res.status(409).json({ error: 'This request was not accepted, so there is nothing to change.', code: 'declined' }); return; }
    if (!win.open) {
      const msg = win.why === 'late' ? ('It is less than ' + hoursText(cfg.changeHours) + ' before your appointment. Please contact ' + bizName + ' to change it.')
        : win.why === 'past' ? 'This appointment time has passed.' : ('Please contact ' + bizName + ' to change this appointment.');
      res.status(409).json({ error: msg, code: 'closed' }); return;
    }

    const person = await personOf(bk);
    const who = String(person.name || (bk.payload && bk.payload.client) || 'A client').trim();
    const prevWhen = (st.dateLabel || labelOf(st.date)) + (st.time ? ' at ' + st.time : '');
    let date = st.date, time = st.time, confirmed = false, sq = { done: false, why: '' };

    if (action === 'move') {
      date = isoDay(src.date); time = String(src.time || '').trim().slice(0, 20);
      if (!date || toMins(time) == null) { res.status(400).json({ error: 'Please pick a day and a time.' }); return; }
      if (date === st.date && toMins(time) === toMins(st.time)) { res.status(409).json({ error: 'That is the time you already have.' }); return; }
      const chk = await checkNewTime(bk.providerId, cfg, { date, time, mins: st.dur || 60, treatment: st.treatment });
      if (!chk.ok) { res.status(409).json({ error: chk.error, code: chk.code }); return; }
      confirmed = !!chk.confirmed;
      // Her Square: a booked appointment moves there too. A move she has to confirm releases the old
      // time in Square now (the page said so); her app books the new one when she confirms it.
      if (st.status === 'confirmed') sq = await squareApply(bk.providerId, st, person.email, confirmed ? 'move' : 'cancel', chk.atMs);
    } else if (st.status === 'confirmed') {
      sq = await squareApply(bk.providerId, st, person.email, 'cancel');
    }
    const dateLabel = labelOf(date);
    const when = dateLabel + ' at ' + time;

    const idem = 'chg' + crypto.createHash('sha256').update([bk.id, st.lastChangeId || '-', action, date, time].join('|')).digest('hex').slice(0, 24);
    const logged = await logEventOnce(bk.providerId, bk.clientId, 'booking_change', {
      ref: bk.id, prevId: st.lastChangeId || bk.id, action,
      date, time, dateLabel, dur: st.dur || 60, prevDate: st.date, prevTime: st.time, prevDateLabel: st.dateLabel,
      treatment: st.treatment, client: who, prevStatus: st.status, confirmed: action === 'move' ? confirmed : false,
      squareDone: !!sq.done, squareWhy: sq.done ? undefined : (sq.why || undefined),
      squareBookingId: (action === 'move' && confirmed && sq.done && sq.squareBookingId) ? sq.squareBookingId : undefined
    }, idem);
    const firstTime = !!(logged && logged.inserted);

    if (firstTime) {
      // What she has to do in Square herself, if anything. Only when there was a Square booking to
      // change (it was booked) and we could not change it.
      // (A move that Square refused: her app books the new time like any instant booking, so what is
      // left for her is the old one.)
      const sqNote = (st.status === 'confirmed' && !sq.done && sq.why && sq.why !== 'no square' && sq.why !== 'not in Square')
        ? 'Please cancel the old time in Square too, it could not be changed automatically.'
        : '';
      try {
        await alertProvider(bk.providerId, {
          event: action === 'cancel' ? 'cancelled' : 'changed',
          titleAs: action === 'move' && !confirmed ? 'change_request' : undefined,
          who,
          detail: (action === 'cancel' ? [st.treatment, prevWhen] : [st.treatment, 'now ' + when, 'was ' + prevWhen]).filter(Boolean).join(', ') + (sqNote ? '. ' + sqNote : ''),
          url: action === 'move' && !confirmed ? '/slickchart?n=booking' : '/slickchart?n=calendar',
          tag: 'client-' + bk.clientId, kind: action === 'move' && !confirmed ? 'booking' : 'calendar',
          clientId: String(bk.clientId), itemId: String(logged.id || ''),
          key: 'chg:' + String(logged.id || '')
        });
      } catch (e) { console.error('[book-manage] push failed:', e && e.message); }
      const origin = trustedOrigin();
      if (cfg.emailGuest !== false && person.email) {
        try {
          const e = bookingChangeGuestEmail({ bizName, name: who, action, when: action === 'cancel' ? prevWhen : when, treatment: st.treatment, confirmed, manageUrl: manageUrl(origin, bk.providerId, bk.id) });
          await sendEmail({ to: person.email, replyTo: (prov && prov.email) || undefined, subject: e.subject, html: e.html, text: e.text });
        } catch (e) { console.error('[book-manage] guest email failed:', e && e.message); }
      }
      if (cfg.emailMe !== false && prov && prov.email) {
        try {
          const e = bookingChangeProviderEmail({ name: who, email: person.email, phone: person.phone, action, when: action === 'cancel' ? prevWhen : when, prevWhen, treatment: st.treatment, confirmed, squareNote: sqNote, link: origin + '/slickchart' });
          await sendEmail({ to: prov.email, replyTo: person.email || undefined, subject: e.subject, html: e.html, text: e.text });
        } catch (e) { console.error('[book-manage] provider email failed:', e && e.message); }
      }
    }
    res.status(200).json({ ok: true, action, confirmed, when: action === 'cancel' ? prevWhen : when });
  } catch (e) {
    console.error('[book-manage] failed:', e && e.stack || e);
    if (isPost || src.slots) { res.status(500).json({ error: 'Something went wrong. Please try again.' }); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.status(500).send(notFound());
  }
}
