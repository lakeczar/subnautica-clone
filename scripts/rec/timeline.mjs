// REC-1 owner timeline page: one self-contained HTML with the video, the
// frame-time chart, the memory curve and the event markers, synchronised:
// playing moves the cursor, clicking a chart or an event seeks the video.
// The data is inlined; the video (one or more independently decodable segment
// files, played in turn) is inlined too when it is small (≤ 32 MiB in all),
// otherwise the page plays the files in recording/ beside it.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SERIES, INK, PACE } from "./charts.mjs";
import { videoSegments } from "./analyse.mjs";

const INLINE_VIDEO = 32 * 1024 * 1024;

export function timelineHtml(r, a) {
  const h = r.header, t0 = a.t0, s = (pt) => +((pt - t0) / 1000).toFixed(2);
  // Frame times: the worst gap per 100 ms (every long frame survives the reduction).
  const fr = [];
  for (const f of r.frames) {
    if (!(f.gap > 0) || f.t < t0) continue;
    const x = Math.round(s(f.t) * 10) / 10;
    if (fr.length && fr.at(-1)[0] === x) fr.at(-1)[1] = Math.max(fr.at(-1)[1], f.gap); else fr.push([x, +f.gap.toFixed(1)]);
  }
  const mem = [["tab (renderer RSS)", a.series.tab], ["JS heap", a.series.heap], [a.series.vram.length ? "VRAM (this browser)" : "GPU in use (whole GPU)", a.series.vram.length ? a.series.vram : a.series.gpuUsed], ["streamed world, GPU estimate", a.series.resident]]
    .filter(([, xs]) => xs.length).map(([label, xs]) => ({ label, pts: xs.map((p) => [s(p.t), p.v]) }));
  const attention = new Map(a.attention.map((e) => [e.t, e]));
  // The measured window only (the load before it is one line in story.md).
  const events = r.events.filter((e) => e.t >= t0 && !["action", "long-task", "session"].includes(e.kind) && !(e.kind === "save" && e.detail?.ok && !e.detail?.manual))
    .map((e) => ({ s: s(e.t), k: e.kind, x: e.text.slice(0, 160), tick: e.tick ?? null, a: attention.get(e.t)?.id ?? null, strip: attention.get(e.t)?.strip ?? null }));
  const spans = a.pacing.spans.map((p) => [s(p.from), s(p.to), p.cls]);
  const segs = videoSegments(h).filter((x) => existsSync(path.join(r.rec, x.file)));
  const bytes = segs.reduce((n, x) => n + statSync(path.join(r.rec, x.file)).size, 0);
  const inline = bytes <= INLINE_VIDEO;
  const videos = segs.map((x) => ({ src: inline ? `data:video/webm;base64,${readFileSync(path.join(r.rec, x.file)).toString("base64")}` : `recording/${x.file}`,
    start: (x.start - t0) / 1000, end: x.end != null ? (x.end - t0) / 1000 : null }));
  const hasVideo = videos.length > 0;
  const data = { fr, mem, events, spans, videos, end: +a.durationS.toFixed(1), colors: SERIES, pace: PACE, ink: INK };
  const title = `${h.machine?.label ?? ""} · ${h.gpuDevice?.name ?? h.gpu?.renderer ?? ""} · ${(h.commit ?? h.build?.commit ?? "").slice(0, 10)} · ${a.verdict.status}`;
  return `<!doctype html><html lang=en><meta charset=utf-8><title>Siltwake run timeline · ${esc(title)}</title>
<style>
:root{--surface:${INK.surface};--ink:${INK.primary};--ink2:${INK.secondary};--muted:${INK.muted};--grid:${INK.grid}}
body{margin:0;font:13px/1.4 system-ui,sans-serif;background:var(--surface);color:var(--ink)}
header{padding:10px 16px;border-bottom:1px solid var(--grid)} header b{font-size:15px}
main{display:grid;grid-template-columns:minmax(480px,1fr) 380px;gap:12px;padding:12px 16px}
video{width:100%;background:#000;aspect-ratio:16/9} .novideo{display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;background:#111;color:#aaa}
canvas{width:100%;display:block;cursor:crosshair;border:1px solid var(--grid);margin-top:8px}
#ev{height:calc(100vh - 120px);overflow:auto;border:1px solid var(--grid)} #ev div{padding:3px 8px;border-bottom:1px solid var(--grid);cursor:pointer}
#ev div:hover,#ev div.on{background:#eef3fa} #ev i{color:var(--muted);font-style:normal;margin-right:6px} #ev b{font-weight:600;margin-right:4px}
.f{margin:6px 0} .f label{margin-right:8px;color:var(--ink2)} #tip{position:fixed;pointer-events:none;background:#fff;border:1px solid var(--grid);padding:3px 6px;font-size:12px;display:none}
.legend span{margin-right:12px;color:var(--ink2)} .legend i{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:4px}
</style>
<header><b>Run timeline</b> · ${esc(title)} · ${esc(h.run?.startedAt ?? h.startedAt ?? "")}</header>
<main><section>
${hasVideo ? `<video id=v controls preload=metadata></video>` : `<div class=novideo>No video in this run (an exclusive performance run keeps snapshots only)</div>`}
<div class=legend id=lf></div><canvas id=cf data-h=180></canvas>
<div class=legend id=lm></div><canvas id=cm data-h=150></canvas>
<div class=legend id=lp></div><canvas id=cp data-h=40></canvas>
</section><aside><div class=f id=filters></div><div id=ev></div></aside></main><div id=tip></div>
<script>
const D=${JSON.stringify(data)};
const V=document.getElementById("v"), tip=document.getElementById("tip");
let cursor=0;
const fmt=s=>s>=60?Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0"):s.toFixed(1)+"s";
// Fixed logical sizes (R1-F3): the backing store follows CSS size × DPR and is never read back as a size.
function setup(c){const h=+c.dataset.h,w=c.clientWidth||c.getBoundingClientRect().width,dpr=devicePixelRatio||1;c.style.height=h+"px";const bw=Math.round(w*dpr),bh=Math.round(h*dpr);if(c.width!==bw)c.width=bw;if(c.height!==bh)c.height=bh;const x=c.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);return{x,w,h}}
const L=44,R=10;
function axes(g,top,unit){const{x,w,h}=g;x.fillStyle=D.ink.surface;x.fillRect(0,0,w,h);x.strokeStyle=D.ink.grid;x.fillStyle=D.ink.muted;x.font="11px system-ui";for(let i=0;i<=4;i++){const v=top*i/4,y=h-14-(h-24)*v/top;x.beginPath();x.moveTo(L,y);x.lineTo(w-R,y);x.stroke();x.fillText(Math.round(v)+unit,2,y+4)}}
const X=(g,s)=>L+(g.w-L-R)*s/Math.max(1,D.end), Y=(g,top,v)=>g.h-14-(g.h-24)*Math.min(v,top)/top;
function drawFrames(){const g=setup(document.getElementById("cf")),top=Math.min(250,Math.max(50,...D.fr.map(p=>p[1]))*1.05);axes(g,top," ms");const x=g.x;
 x.strokeStyle="#c62f2f";x.setLineDash([4,3]);x.beginPath();x.moveTo(L,Y(g,top,33));x.lineTo(g.w-R,Y(g,top,33));x.stroke();x.setLineDash([]);
 x.strokeStyle=D.colors[0];x.lineWidth=1.5;x.beginPath();D.fr.forEach((p,i)=>{const px=X(g,p[0]),py=Y(g,top,p[1]);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();
 x.fillStyle=D.ink.primary;x.font="10px system-ui";for(const e of D.events) if(e.a){const px=X(g,e.s);x.fillRect(px-0.5,g.h-14,1,6);if(e.k==="long-frame"||e.k==="hold"||e.k==="error")x.fillText(e.a,px-8,12)}
 cursorLine(g);document.getElementById("lf").innerHTML='<span><i style="background:'+D.colors[0]+'"></i>frame time (worst per 100 ms)</span><span><i style="background:#c62f2f"></i>33 ms</span>'}
function drawMem(){const g=setup(document.getElementById("cm")),all=D.mem.flatMap(m=>m.pts.map(p=>p[1])),top=(all.length?Math.max(...all):100)*1.1;axes(g,top,"");const x=g.x;
 D.mem.forEach((m,i)=>{x.strokeStyle=D.colors[i];x.lineWidth=2;x.beginPath();m.pts.forEach((p,j)=>{const px=X(g,p[0]),py=Y(g,top,p[1]);j?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()});
 cursorLine(g);document.getElementById("lm").innerHTML="Memory (MiB): "+D.mem.map((m,i)=>'<span><i style="background:'+D.colors[i]+'"></i>'+m.label+"</span>").join("")}
function drawPace(){const g=setup(document.getElementById("cp")),x=g.x;x.fillStyle=D.ink.surface;x.fillRect(0,0,g.w,g.h);for(const [a,b,c] of D.spans){x.fillStyle=D.pace[c];x.fillRect(X(g,a),4,Math.max(0.5,X(g,b)-X(g,a)),20)}
 cursorLine(g);document.getElementById("lp").innerHTML="Activity: "+Object.entries(D.pace).map(([k,c])=>'<span><i style="background:'+c+'"></i>'+k+"</span>").join("")}
function cursorLine(g){g.x.strokeStyle=D.ink.primary;g.x.lineWidth=1;g.x.beginPath();g.x.moveTo(X(g,cursor),0);g.x.lineTo(X(g,cursor),g.h);g.x.stroke()}
function draw(){drawFrames();drawMem();drawPace()}
// Segments play in turn; a seek loads the one that holds the moment.
let segI=-1;
function segFor(s){let i=-1;D.videos.forEach((v,k)=>{if(v.start<=s)i=k});return Math.max(0,i)}
function load(i,at){if(!V||!D.videos[i])return;if(segI!==i){segI=i;V.src=D.videos[i].src}const go=()=>{V.currentTime=Math.max(0,at)};V.readyState>=1?go():V.addEventListener("loadedmetadata",go,{once:true})}
function seek(s){cursor=Math.max(0,s);if(V&&D.videos.length){const i=segFor(s);load(i,s-D.videos[i].start)}draw();highlight()}
for(const id of ["cf","cm","cp"]){const c=document.getElementById(id);
 c.addEventListener("click",e=>{const r=c.getBoundingClientRect();seek((e.clientX-r.left-L)/(r.width-L-R)*D.end)});
 c.addEventListener("mousemove",e=>{const r=c.getBoundingClientRect(),s=(e.clientX-r.left-L)/(r.width-L-R)*D.end;const f=D.fr.reduce((b,p)=>Math.abs(p[0]-s)<Math.abs(b[0]-s)?p:b,D.fr[0]||[0,0]);
  const near=D.events.filter(ev=>Math.abs(ev.s-s)<D.end/200).slice(0,3).map(ev=>ev.k+": "+ev.x).join("<br>");tip.style.display="block";tip.style.left=e.clientX+12+"px";tip.style.top=e.clientY+12+"px";tip.innerHTML=fmt(s)+" · frame "+f[1]+" ms"+(near?"<br>"+near:"")});
 c.addEventListener("mouseleave",()=>tip.style.display="none")}
const kinds=[...new Set(D.events.map(e=>e.k))],shown=new Set(kinds.filter(k=>k!=="notice"&&k!=="long-frame"));
// Long frames: only those that head an attention entry (the rest of a burst is in the chart).
const listed=e=>shown.has(e.k)||(e.k==="long-frame"&&e.a);
document.getElementById("filters").innerHTML=kinds.map(k=>'<label><input type=checkbox data-k="'+k+'" '+(shown.has(k)?"checked":"")+"> "+k+"</label>").join("");
document.getElementById("filters").addEventListener("change",e=>{const k=e.target.dataset.k;e.target.checked?shown.add(k):shown.delete(k);list()});
function list(){document.getElementById("ev").innerHTML=D.events.filter(listed).map((e,i)=>'<div data-s="'+e.s+'"><i>'+fmt(e.s)+(e.tick!=null?" t"+e.tick:"")+"</i><b>"+(e.a?e.a+" ":"")+e.k+"</b>"+e.x.replace(/</g,"&lt;")+"</div>").join("")}
document.getElementById("ev").addEventListener("click",e=>{const d=e.target.closest("div[data-s]");if(d)seek(+d.dataset.s)});
function highlight(){let best=null;for(const d of document.querySelectorAll("#ev div")){d.classList.remove("on");if(+d.dataset.s<=cursor)best=d}if(best){best.classList.add("on")}}
if(V){V.addEventListener("timeupdate",()=>{if(segI>=0){cursor=V.currentTime+D.videos[segI].start;draw();highlight()}});
 V.addEventListener("ended",()=>{if(segI+1<D.videos.length){load(segI+1,0);V.play()}});load(0,0)}
addEventListener("resize",draw);list();draw();
</script></html>`;
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
