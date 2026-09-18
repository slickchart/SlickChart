export function page({eyebrow, head1, head2, sub, chip}){
return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#050F10;color:#EAF6F4;font-family:"Liberation Sans","DejaVu Sans",sans-serif;position:relative}
/* the opal, as a soft light source behind the type — same four stops as the site */
.glow{position:absolute;inset:0;
  background:
    radial-gradient(760px 420px at 88% -12%, rgba(30,143,206,.34), transparent 62%),
    radial-gradient(680px 460px at 6% 108%, rgba(127,227,162,.20), transparent 60%),
    radial-gradient(520px 320px at 62% 46%, rgba(25,184,191,.13), transparent 66%);}
.frame{position:absolute;inset:0;padding:64px 76px;display:flex;flex-direction:column;justify-content:space-between}
.eyebrow{display:flex;align-items:center;gap:13px;font-size:20px;font-weight:700;letter-spacing:.17em;color:#A2BEB9;text-transform:uppercase}
.dot{width:12px;height:12px;border-radius:50%;background:linear-gradient(135deg,#19b8bf,#6fdca6);flex:none}
h1{font-family:"Bitstream Charter","DejaVu Serif",Georgia,serif;font-weight:700;
  font-size:66px;line-height:1.1;letter-spacing:-.016em;max-width:1046px}
h1 em{font-style:normal;background:linear-gradient(135deg,#1E8FCE 0%,#19B8BF 34%,#2BC19A 66%,#7FE3A2 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.sub{margin-top:24px;font-size:28px;line-height:1.5;color:#A2BEB9;max-width:1010px}
.row{display:flex;align-items:center;justify-content:space-between;gap:24px}
.chip{display:inline-flex;align-items:center;font-size:23px;font-weight:700;color:#03201E;
  background:linear-gradient(135deg,#19b8bf 0%,#2bc7a2 52%,#6fdca6 100%);
  padding:15px 28px;border-radius:999px;letter-spacing:.005em}
.site{font-size:23px;font-weight:600;color:#6E8A85;letter-spacing:.01em}
.bar{position:absolute;left:0;right:0;bottom:0;height:9px;
  background:linear-gradient(90deg,#1E8FCE 0%,#19B8BF 34%,#2BC19A 66%,#7FE3A2 100%)}
</style></head><body>
<div class="glow"></div>
<div class="frame">
  <div class="eyebrow"><span class="dot"></span>${eyebrow}</div>
  <div>
    <h1>${head1} <em>${head2}</em></h1>
    <div class="sub">${sub}</div>
  </div>
  <div class="row"><span class="chip">${chip}</span><span class="site">slickchart.app</span></div>
</div>
<div class="bar"></div>
</body></html>`;}
