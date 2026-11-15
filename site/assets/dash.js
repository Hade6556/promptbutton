var D=["idle","watching","thinking","curious","done","oops","asleep"],b="M114 44C150 44 176 71 176 106C176 142 150 168 114 168C101 168 93 165 85 160C79 156 75 165 66 160C57 155 63 146 54 141C46 137 39 144 33 135C27 126 40 121 44 113C48 104 46 95 52 84C62 60 85 44 114 44Z",C=[[29,152,5.5],[50,172,6.5]],L=[[124,100,10,15.5],[153,98,9,14.5]],z=[[78,118,34,"#ff9fb0"],[124,142,32,"#ffc24a"],[160,118,28,"#ffe3a3"]],g="#141419",G=`
.dash{display:block;width:100%;height:auto;overflow:visible}
.dash .d-all,.dash .d-pose,.dash .d-body{transform-box:fill-box;transform-origin:50% 100%}
.dash .d-pose{transition:transform .32s cubic-bezier(.3,1.4,.5,1)}
.dash .d-body{animation:d-breathe 3.4s ease-in-out infinite}
.dash .d-eyes{transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.dash .d-eye{transform-box:fill-box;transform-origin:50% 55%;transition:transform .12s ease-out}
.dash.is-blink .d-eye{transform:scaleY(.08)}
.dash .d-open,.dash .d-joy,.dash .d-shut,.dash .d-worry,.dash .d-z{transition:opacity .15s}
.dash .d-joy,.dash .d-shut,.dash .d-worry,.dash .d-z{opacity:0}
.dash .d-drip{transform-box:fill-box;transform-origin:50% 50%;transition:transform .3s}
.dash .d-shimmer{transform-box:fill-box;transform-origin:50% 50%}
.dash.is-hop .d-all{animation:d-hop .62s cubic-bezier(.3,.7,.3,1)}
.dash.is-shake .d-all{animation:d-shake .45s ease-in-out}
.dash.is-arrive .d-all{animation:d-arrive .9s cubic-bezier(.2,.9,.25,1)}
.dash[data-mood=watching] .d-pose{transform:rotate(5deg) translateY(1px)}
.dash[data-mood=watching] .d-eyes{transform:translate(2px,7px)!important}
.dash[data-mood=thinking] .d-shimmer{animation:d-swirl 2.4s linear infinite}
.dash[data-mood=thinking] .d-body{animation:d-sway 1.6s ease-in-out infinite}
.dash[data-mood=thinking] .d-eyes{transform:translate(-5px,-6px)!important}
.dash[data-mood=curious] .d-pose{transform:rotate(-8deg)}
.dash[data-mood=curious] .d-eyes{transform:translate(3px,-4px)!important}
.dash[data-mood=curious]:not(.is-blink) .d-eye:first-child{transform:scale(.86)}
.dash[data-mood=curious]:not(.is-blink) .d-eye:last-child{transform:scale(1.16)}
.dash[data-mood=done] .d-joy{opacity:1}
.dash[data-mood=done] .d-open{opacity:0}
.dash[data-mood=done] .d-eyes{transform:none!important}
.dash[data-mood=oops] .d-worry{opacity:1}
.dash[data-mood=oops] .d-open{opacity:0}
.dash[data-mood=oops] .d-eyes{transform:translate(0,3px)!important}
.dash[data-mood=oops] .d-drip{transform:translateY(5px)}
.dash[data-mood=oops] .d-pose{transform:scale(1.03,.95)}
.dash[data-mood=asleep] .d-shut,.dash[data-mood=asleep] .d-z{opacity:1}
.dash[data-mood=asleep] .d-open{opacity:0}
.dash[data-mood=asleep] .d-body{animation-duration:5.2s}
.dash[data-mood=asleep] .d-eyes{transform:translate(0,3px)!important}
.dash[data-mood=asleep] .d-pose{transform:scale(1.02,.96)}
@keyframes d-breathe{50%{transform:scale(1.015,.975)}}
@keyframes d-sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes d-swirl{to{transform:rotate(360deg)}}
@keyframes d-hop{0%{transform:scale(1.08,.86)}30%{transform:translateY(-11%) scale(.94,1.08)}55%{transform:translateY(0) scale(1.07,.9)}75%{transform:translateY(-2.5%) scale(.99,1.02)}100%{transform:none}}
@keyframes d-shake{0%,100%{transform:none}20%{transform:translateX(-4%) rotate(-3deg)}45%{transform:translateX(4%) rotate(3deg)}70%{transform:translateX(-2%) rotate(-1.5deg)}}
@keyframes d-arrive{0%{transform:translateX(-170%) skewX(16deg) scale(1.12,.9);opacity:0}25%{opacity:1}62%{transform:translateX(7%) skewX(-7deg) scale(.95,1.05)}82%{transform:translateX(-2%) skewX(2deg)}100%{transform:none}}
@media (prefers-reduced-motion:reduce){.dash,.dash *{animation:none!important;transition:none!important}}`,H=0;function M({tile:i=!0,simple:e=!1,mood:n="idle",label:l="Dash, the First Try mascot"}={}){let d=`dash${H++}`,c=e?1.22:1,m=([o,r,a,h],t)=>{let k=($,S)=>`<path class="${S}" d="M${o-a} ${r+3*$}Q${o} ${r-a*1.15*$} ${o+a} ${r+3*$}" fill="none" stroke="${g}" stroke-width="${e?9:5}" stroke-linecap="round"/>`,x=t?1:-1,E=`<g class="d-worry"><ellipse cx="${o}" cy="${r+4}" rx="${a*(e?.8:.62)}" ry="${h*(e?.72:.6)}" fill="${g}"/><path d="M${o-a*.9} ${r-h*.62-x*3}L${o+a*.9} ${r-h*.62+x*3}" stroke="${g}" stroke-width="${e?7:4}" stroke-linecap="round"/></g>`;return`<g class="d-eye"><ellipse class="d-open" cx="${o}" cy="${r}" rx="${a*c}" ry="${h*c}" transform="rotate(-4 ${o} ${r})" fill="${g}"/>${k(1,"d-joy")}${k(-1,"d-shut")}${E}</g>`},s=o=>e?"":C.map(([r,a,h])=>`<circle ${o?'class="d-drip" ':""}cx="${r}" cy="${a}" r="${h}"/>`).join(""),f=l?`role="img" aria-label="${l}"`:'aria-hidden="true"',u=i==="square"?`<rect width="200" height="200" fill="url(#${d}t)"/>`:i?`<rect width="200" height="200" rx="46" fill="url(#${d}t)"/><rect x="1" y="1" width="198" height="198" rx="45" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>`:"";return`<svg xmlns="http://www.w3.org/2000/svg" class="dash" data-mood="${n}" viewBox="${i?"0 0 200 200":"14 20 176 164"}" ${f}>
<defs><linearGradient id="${d}t" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#1d2748"/><stop offset="1" stop-color="#0b1020"/></linearGradient>
<filter id="${d}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
<clipPath id="${d}c"><path d="${b}"/></clipPath></defs>
${u}
<g class="d-all"><g class="d-pose"><g class="d-body">
${e?"":`<g fill="#000" opacity=".4" transform="translate(5 8)"><path d="${b}"/>${s(!1)}</g>`}
<g fill="#fff"><path d="${b}"/>${s(!0)}</g>
<g clip-path="url(#${d}c)"><g class="d-shimmer" filter="url(#${d}b)" opacity=".78">${z.map(([o,r,a,h])=>`<circle cx="${o}" cy="${r}" r="${a}" fill="${h}"/>`).join("")}</g></g>
<g class="d-eyes">${L.map(m).join("")}</g>
<g class="d-z" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M168 46h12l-12 13h12"/><path d="M152 30h8l-8 9h8" opacity=".7"/></g>
</g></g></g></svg>`}var j={idle:"d-open",watching:"d-open",thinking:"d-open",curious:"d-open",done:"d-joy",oops:"d-worry",asleep:"d-shut"};function T(i={}){let e=i.mood??"idle",n=M(i).replace(' class="dash"',"");for(let c of["d-open","d-joy","d-shut","d-worry"])c!==j[e]&&(n=n.replaceAll(`class="${c}"`,`class="${c}" display="none"`));e!=="asleep"&&(n=n.replace('class="d-z"','class="d-z" display="none"'));let l={curious:"rotate(-8 105 168)",watching:"rotate(5 105 168)"},d={watching:"translate(2 7)",thinking:"translate(-5 -6)",curious:"translate(3 -4)",oops:"translate(0 3)",asleep:"translate(0 3)"};return l[e]&&(n=n.replace('class="d-pose"',`class="d-pose" transform="${l[e]}"`)),d[e]&&(n=n.replace('class="d-eyes"',`class="d-eyes" transform="${d[e]}"`)),n}var p=new Set,y=null,w=!1;function v(i){y={x:i.clientX,y:i.clientY},!w&&(w=!0,requestAnimationFrame(()=>{if(w=!1,!!y)for(let{svg:e,eyes:n}of p){let l=e.getBoundingClientRect(),d=(y.x-(l.left+l.width/2))/window.innerWidth,c=(y.y-(l.top+l.height/2))/window.innerHeight,m=s=>Math.max(-1,Math.min(1,s*2.4));n.style.transform=`translate(${(m(d)*7).toFixed(1)}px,${(m(c)*5).toFixed(1)}px)`}}))}function X(i,{size:e=96,follow:n=!0,arrive:l=!1,...d}={}){let c=typeof i=="string"?document.querySelector(i):i;if(!c)throw new Error("createDash: no such element");if(!document.getElementById("dash-css")){let t=document.createElement("style");t.id="dash-css",t.textContent=G,document.head.append(t)}let m=document.createElement("span");m.style.cssText=`display:inline-block;width:${e}px;line-height:0;vertical-align:middle`,m.innerHTML=M({simple:e<=32,...d}),c.append(m);let s=m.firstElementChild,f={svg:s,eyes:s.querySelector(".d-eyes")},u=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??!1,o=0,r=!0,a=t=>{u||(s.classList.remove("is-hop","is-shake","is-arrive"),s.getBoundingClientRect(),s.classList.add(t))};s.addEventListener("animationend",t=>{t.target.classList.contains("d-all")&&s.classList.remove("is-hop","is-shake","is-arrive")});let h=()=>{if(!r)return;let t=s.dataset.mood;t!=="done"&&t!=="asleep"&&t!=="oops"&&(s.classList.add("is-blink"),window.setTimeout(()=>s.classList.remove("is-blink"),130)),o=window.setTimeout(h,2200+Math.random()*3800)};return u||(o=window.setTimeout(h,1200+Math.random()*2e3),n&&(p.size||window.addEventListener("pointermove",v,{passive:!0}),p.add(f)),l&&a("is-arrive")),{el:m,setMood(t){!D.includes(t)||s.dataset.mood===t||(s.dataset.mood=t,t==="done"&&a("is-hop"),t==="oops"&&a("is-shake"))},hop:()=>a("is-hop"),arrive:()=>a("is-arrive"),destroy(){r=!1,window.clearTimeout(o),p.delete(f),p.size||window.removeEventListener("pointermove",v),m.remove()}}}export{G as DASH_CSS,D as MOODS,X as createDash,M as dashSVG,T as stillSVG};
