var yt=`#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`,bt=`#version 300 es
precision highp float;
uniform vec2 uRes; uniform mat3 uRot; uniform vec3 uOff; uniform vec2 uScale;
uniform vec4 uB1; uniform vec4 uB2; uniform float uTail; uniform vec2 uRoll; uniform vec2 uLobes; uniform float uFace; uniform mat3 uPaint;
uniform vec4 uEyeW; uniform vec4 uEye; uniform float uLid;
uniform float uGlow; uniform float uFlow; uniform float uAlpha;
out vec4 o;
const float VIEW = ${6.4.toFixed(1)};
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
vec3 local(vec3 p){ vec3 q = p - uOff; q.xy /= uScale; return q * uRot; }
// A cone with rounded ends, from a (radius r1) to b (radius r2).
float cone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a, pa = p - a; float l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1.0 / l2;
  float y = dot(pa, ba), z = y - l2; vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
// The flat drawing's outline: a round head and two lobes at its lower left, the tail and a smaller one under it.
// Both lobes are the same solid, a cone with a wide root buried in the head and a rounded tip of the same size,
// laid out on the drawing's own measurements. They lie flat in the picture plane and follow the body's tilt,
// squash and lean, but not the head's turn: the face turns on the head while the lobes stay on its outline.
// uTail is the angle the tail is held at; the smaller lobe follows it a little.
float shape(vec3 t){
  float d = length(t) - 1.0;
  float c = cos(uTail), s = sin(uTail), ch = cos(uTail * 0.3), sh = sin(uTail * 0.3);
  vec2 r1 = vec2(-0.825, -0.22), r2 = vec2(-0.538, -0.554);
  float tail = cone(t, vec3(r1, 0.0), vec3(r1 + mat2(c, s, -s, c) * vec2(-0.401, -0.204), 0.0), 0.319, 0.115);
  float lobe = cone(t, vec3(r2, 0.0), vec3(r2 + mat2(ch, sh, -sh, ch) * vec2(-0.212, -0.212), 0.0), 0.322, 0.11);
  d = smin(d, tail, 0.22);
  d = smin(d, lobe, 0.07);
  return d;
}
// uLobes is how much of the lobes is there: as drawn, on the left (x), and as their mirror image on the right (y).
// To face the other way one pair sinks into the head while the other grows out of it. Nothing turns round.
float body(vec3 b){
  vec3 t = vec3(uRoll.x * b.x + uRoll.y * b.y, uRoll.x * b.y - uRoll.y * b.x, b.z);
  float d = shape(t);
  if (uLobes.y > 0.0) {
    float head = length(t) - 1.0;
    d = head + min(uLobes.x * (d - head), uLobes.y * (shape(vec3(-t.x, t.yz)) - head));
  }
  return d * min(uScale.x, uScale.y);
}
float map(vec3 p){
  vec3 b = p - uOff; b.xy /= uScale;
  float d = body(b);
  d = min(d, length(p - uB1.xyz) - uB1.w);
  d = min(d, length(p - uB2.xyz) - uB2.w);
  return d;
}
vec3 normalAt(vec3 p){
  vec2 e = vec2(0.004, -0.004);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
// One eye in face coordinates: an oval that a lid can close, a happy arc, a sleeping arc, or a small worried eye under a brow.
float eye(vec2 f, vec2 c, float size, float side, float aa){
  vec2 e = (f - c) / size; e = vec2(e.x * 0.9976 + e.y * 0.0698 * uFace, e.y * 0.9976 - e.x * 0.0698 * uFace); aa /= size;
  float open = (length(e / vec2(0.165, 0.255 * max(uLid, 0.07))) - 1.0) * 0.165;
  float m = uEyeW.x * smoothstep(aa, -aa, open);
  float up = abs(length(e - vec2(0.0, -0.10)) - 0.19) - 0.042;
  m += uEyeW.y * smoothstep(aa, -aa, up) * smoothstep(-0.05, 0.0, e.y);
  float down = abs(length(e - vec2(0.0, 0.12)) - 0.19) - 0.042;
  m += uEyeW.z * smoothstep(aa, -aa, down) * smoothstep(0.02, -0.03, e.y);
  float small = (length((e - vec2(0.0, -0.05)) / vec2(0.105, 0.15)) - 1.0) * 0.105;
  vec2 a = vec2(-0.15, 0.21 + side * 0.05), b = vec2(0.15, 0.21 - side * 0.05), pa = e - a, ba = b - a;
  float brow = length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - 0.034;
  m += uEyeW.w * max(smoothstep(aa, -aa, small), smoothstep(aa, -aa, brow));
  return clamp(m, 0.0, 1.0);
}
// The warm shimmer: three soft pools of colour, placed where the flat drawing has them. They swirl only while thinking.
vec3 tint(vec3 q){
  float ca = cos(uFlow), sa = sin(uFlow); vec2 r = q.xy - vec2(0.05, -0.2); vec3 g = vec3(vec2(ca * r.x - sa * r.y, sa * r.x + ca * r.y) + vec2(0.05, -0.2), q.z);
  vec3 c = vec3(1.0), k;
  k = g - vec3(-0.848, -0.19, 0.495); k.z *= 0.5; c = mix(c, vec3(1.0, 0.62, 0.69), 0.62 * exp(-dot(k, k) / 0.30));
  k = g - vec3(-0.172, -0.58, 0.797); k.z *= 0.5; c = mix(c, vec3(1.0, 0.76, 0.29), 0.66 * exp(-dot(k, k) / 0.27));
  k = g - vec3(0.421, -0.19, 0.887); k.z *= 0.5; c = mix(c, vec3(1.0, 0.89, 0.64), 0.60 * exp(-dot(k, k) / 0.22));
  return c;
}
bool march(vec2 uv, out vec3 p, out vec3 pn, out float near){
  vec3 ro = vec3(uv, 3.0); float t = 0.0; near = 1e3; p = ro; pn = ro;
  for (int i = 0; i < 56; i++) {
    p = ro + vec3(0.0, 0.0, -t);
    float d = map(p);
    if (d < near) { near = d; pn = p; }
    if (d < 0.0015) return true;
    t += d * 0.85;
    if (t > 6.0) break;
  }
  return false;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.x * VIEW;
  float px = VIEW / uRes.x;
  vec3 p, pn; float near;
  bool hit = march(uv, p, pn, near);
  float cover = hit ? 1.0 : 1.0 - smoothstep(0.0, px * 1.5, near);
  vec3 col = vec3(0.0);
  if (cover > 0.0) {
    vec3 s = hit ? p : pn, n = normalAt(s), q = local(s);
    // Facing left (uFace is -1, and 1 facing right), the colours and the face are the drawing's mirror image. On the way
    // over the head shows a blend of the two. The lobes keep the colour they have at rest, whichever side they are on.
    float w = 0.5 + 0.5 * uFace;
    vec3 c = mix(tint(vec3(-q.x, q.yz)), tint(q), w);
    vec3 b = s - uOff; b.xy /= uScale;
    vec3 t = vec3(uRoll.x * b.x + uRoll.y * b.y, uRoll.x * b.y - uRoll.y * b.x, b.z);
    c = mix(c, tint(vec3(-abs(t.x), t.yz) * uPaint), smoothstep(0.0, 0.18, length(t) - 1.0));
    // Almost flat light, as in the drawing: a faint cool tone on the underside is all that says "solid".
    float lit = smoothstep(-0.55, 0.75, dot(n, normalize(vec3(-0.45, 0.72, 0.58))));
    c *= mix(vec3(0.91, 0.90, 0.96), vec3(1.0), lit);
    c += (vec3(1.0) - c) * 0.12 * pow(1.0 - max(n.z, 0.0), 3.0);
    c *= 0.9 + 0.1 * min(uGlow, 1.0);
    // The face is painted on the head only, where it turns towards the viewer.
    if (q.z > 0.0 && abs(length(q) - 1.0) < 0.1) {
      float aa = px * 1.3;
      // The far eye is drawn a little higher and smaller. Which eye that is changes over with the side Dash faces.
      float m = eye(q.xy, vec2(-0.235, mix(0.135, 0.11, w)) + uEye.zw, mix(uEye.y * 0.95, uEye.x, w), -1.0, aa)
        + eye(q.xy, vec2(0.235, mix(0.11, 0.135, w)) + uEye.zw, mix(uEye.x, uEye.y * 0.95, w), 1.0, aa);
      c = mix(c, vec3(0.078, 0.078, 0.098), clamp(m, 0.0, 1.0) * smoothstep(0.05, 0.3, q.z));
    }
    col = c;
  }
  // The drawing's shadow: the same outline, dark, set down and to the right.
  float shade = 0.0;
  if (!hit && near < 0.19) {
    vec3 a, b; float n2;
    shade = (march(uv - vec2(0.081, -0.129), a, b, n2) ? 1.0 : 1.0 - smoothstep(0.0, px * 1.5, n2)) * 0.4;
  }
  // A glow appears only when a prompt is ready. It fades out before the canvas's edge, wherever the body and dots are.
  float halo = hit ? 0.0 : exp(-max(near, 0.0) * 4.2) * 0.6 * max(uGlow - 1.0, 0.0) * clamp(1.0 - near / 0.55, 0.0, 1.0) * smoothstep(0.0, 0.3, 0.5 * VIEW - max(abs(uv.x), abs(uv.y)));
  float under = max(shade, halo);
  vec3 rgb = col * cover + vec3(1.0, 0.93, 0.84) * halo * (1.0 - shade / 0.4 * 0.9) * (1.0 - cover);
  float alpha = cover + under * (1.0 - cover);
  o = vec4(rgb, alpha) * uAlpha;
}`,V={yaw:.41,pitch:0,roll:0,sx:1,sy:1,scale:1,open:1,joy:0,shut:0,worry:0,eyeL:1,eyeR:1,gx:0,gy:0,glow:1,flow:0,bob:1,perk:0,orbit:0,rise:0,lx:0,ly:0,tail:0,wag:.07,wagHz:1.7,breath:0,sway:0},Je={idle:{},watching:{yaw:.5,pitch:.3,roll:-.14,sx:1.04,sy:.97,lx:.12,ly:-.05,tail:.32,wag:0,gy:-.05,bob:.5},thinking:{yaw:.22,pitch:-.24,sx:.97,sy:1.04,sway:1,tail:.1,wag:.13,wagHz:3.6,gx:-.04,gy:.05,flow:1.5,orbit:1,bob:.6},curious:{yaw:.34,roll:.17,scale:1.05,sx:.96,sy:1.06,ly:.07,tail:.6,wag:.04,wagHz:2.4,eyeL:.86,eyeR:1.16,gx:.02,gy:.04,perk:1,bob:.6},done:{open:0,joy:1,sy:1.03,ly:.03,tail:.3,wag:.1,wagHz:4,glow:1.25},oops:{open:0,worry:1,sx:1.07,sy:.89,ly:-.08,pitch:.1,gy:-.03,tail:-.45,wag:.03,wagHz:16,glow:.55,bob:.3},asleep:{open:0,shut:1,sx:1.09,sy:.87,roll:.1,ly:-.1,pitch:.14,yaw:.36,gy:-.03,tail:-.18,wag:0,breath:1,glow:.5,rise:1,bob:.15}},vt=[[-1.4,-.74,.09,1],[-1.05,-1.08,.105,.6]],_=[-.401,-.204],et=.05,tt=.85,gt=14,at=.7,ze=(c,s,i,n)=>Math.cos(s)*((.1225*Math.sin(i)+.964*Math.cos(i))*Math.sin(c)+n*Math.cos(c))-Math.sin(s)*(.1225*Math.cos(i)-.964*Math.sin(i)),wt=ze(V.yaw,V.roll,V.pitch,V.gx),Re=(c,s,i)=>{let n=Math.min(1,Math.max(0,(i-c)/(s-c)));return n*n*(3-2*n)};function ot(c,s,i=!1){let n=document.createElement("canvas"),e=n.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,powerPreference:"low-power"});if(!e)return null;let h=(p,u)=>{let H=e.createShader(p);return e.shaderSource(H,u),e.compileShader(H),e.getShaderParameter(H,e.COMPILE_STATUS)?H:null},M=h(e.VERTEX_SHADER,yt),l=h(e.FRAGMENT_SHADER,bt),g=e.createProgram();if(!M||!l||(e.attachShader(g,M),e.attachShader(g,l),e.linkProgram(g),!e.getProgramParameter(g,e.LINK_STATUS)))return null;e.useProgram(g),e.bindBuffer(e.ARRAY_BUFFER,e.createBuffer()),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);let L=e.getAttribLocation(g,"a");e.enableVertexAttribArray(L),e.vertexAttribPointer(L,2,e.FLOAT,!1,0,0);let o=p=>e.getUniformLocation(g,p),a={res:o("uRes"),rot:o("uRot"),off:o("uOff"),scale:o("uScale"),b1:o("uB1"),b2:o("uB2"),tail:o("uTail"),roll:o("uRoll"),lobes:o("uLobes"),face:o("uFace"),paint:o("uPaint"),eyeW:o("uEyeW"),eye:o("uEye"),lid:o("uLid"),glow:o("uGlow"),flow:o("uFlow"),alpha:o("uAlpha")},d=Math.min(2,window.devicePixelRatio||1),f=Math.round(c*d);n.width=n.height=f,n.style.cssText=`position:absolute;left:50%;top:50%;width:${c}px;height:${c}px;transform:translate(-50%,-50%);pointer-events:none`,e.viewport(0,0,f,f),e.uniform2f(a.res,f,f);let t={...V,...Je[s]},k={...t},y=s,w={perk:t.perk,orbit:t.orbit,rise:t.rise},r=null,b={x:0,y:0},v=i?-wt:.19,E=1,J=0,$=0,Y=0,Le=0,q=-1,he=0,A=0,me=1,Pe=1.5+Math.random()*2,P=-1,D=-1,F=-1,B=-1,C=-1,U=0,ee=0,te=!0,ae=!0,De=p=>{if(U=0,!ae)return;let u=ee?Math.min(.05,(p-ee)/1e3):.016;ee=p,A+=u;let H=1-Math.exp(-u*9);for(let m of Object.keys(t))t[m]+=(k[m]-t[m])*H;Y+=u*t.flow,k.flow===0&&(Y-=(Y-Math.round(Y/(Math.PI*2))*Math.PI*2)*(1-Math.exp(-u*2.5)));let fe=0;q>=0&&(q+=u/1.5,fe=Math.pow(1-Math.min(q,1),2),q>=1&&(q=-1)),Le+=u*(t.wagHz+fe*9);let it=Math.sin(Le)*(t.wag+fe*.2),Be=y==="idle"&&r,Ce=1-Math.exp(-u*7);b.x+=((Be?r[0]:0)-b.x)*Ce,b.y+=((Be?r[1]:0)-b.y)*Ce,i&&r&&y!=="asleep"&&(r[0]>et?E=1:r[0]<-et&&(E=-1));let oe=E<0?1:0;J+=Math.max(-u/tt,Math.min(u/tt,oe-J)),$+=(.5-.5*Math.cos(Math.PI*J)-$)*(1-Math.exp(-u*gt)),J===oe&&Math.abs($-oe)<1e-4&&($=oe);let O=1-2*$,N=i?Math.max(0,b.x*O):b.x,He=Re(.6,1,Math.abs(Math.cos($*Math.PI)));P<0&&A>Pe&&t.open>.9&&(P=0),P>=0&&(P+=u/.16,me=1-Math.sin(Math.min(P,1)*Math.PI)*.94,P>=1&&(P=-1,me=1,Pe=A+2.2+Math.random()*3.8));let se=t.lx+N*.05+Math.sin(A*1.8)*.07*t.sway,Oe=t.ly+Math.sin(A*1.7)*.034*t.bob,I=t.roll-N*.04,Ge=1,We=Math.sin(A*1.7+.6)*.012*t.bob+Math.sin(A*1.1)*.035*t.breath,pe=t.sx*(1-We*.6),ne=t.sy*(1+We);if(y==="thinking"&&(I+=Math.sin(A*3.6)*.045*(k.flow>0?Math.min(1,t.flow/1.3):0)),D>=0){D+=u/.66;let m=Math.min(D,1),x=Math.max(0,(m-.1)/.9);Oe+=x<.6?.42*Math.sin(x/.6*Math.PI):.06*Math.sin((x-.6)/.4*Math.PI);let G=1-.12*Math.sin(m*Math.PI*3)*(1-m);ne*=G,pe/=Math.sqrt(G),D>=1&&(D=-1)}if(F>=0){F+=u/.45;let m=Math.min(F,1),x=Math.sin(m*Math.PI*6)*(1-m);se+=x*.1,I+=x*.07,F>=1&&(F=-1)}if(B>=0){B+=u/.9;let m=Math.min(B,1),x=1-Math.pow(1-m,3),G=Math.sin(m*Math.PI)*.22*(1-m);se+=-1.5*(1-x)+G,pe*=1+.2*(1-x),ne/=Math.sqrt(1+.2*(1-x));let W=Math.min(1,Math.max(0,(m-.12)/.38));Ge=W*W*(3-2*W),B>=1&&(B=-1)}let ye=1;C>=0&&(C+=u/.5,ye=1+.2*Math.sin(Math.min(C,1)*Math.PI),C>=1&&(C=-1));let re=t.yaw+N*.3,ie=t.pitch-b.y*.18,_e=t.gx+N*.06,lt=I,be=re*O,Ve=_e*O;I*=O;let le=Math.cos(be),K=Math.sin(be),R=Math.cos(ie),z=Math.sin(ie),S=Math.cos(I),T=Math.sin(I),je=-.06+Oe-(1-ne)*1,de=pe*t.scale,Xe=ne*t.scale,dt=v+se+de*ze(re,lt,ie,_e),Ye=$?dt*O-de*ze(be,I,ie,Ve):v+se,ct=[S*le,T*le,-K,S*K*z-T*R,T*K*z+S*R,le*z,S*K*R+T*z,T*K*R-S*z,le*R];e.uniformMatrix3fv(a.rot,!1,ct);let ve=Math.cos(re),ge=Math.sin(re);e.uniformMatrix3fv(a.paint,!1,[ve,0,-ge,ge*z,R,ve*z,ge*R,-z,ve*R]),e.uniform3f(a.off,Ye,je,0),e.uniform2f(a.scale,de,Xe);let we=t.tail+it+N*.14-b.y*.08,Ue=Math.cos(-we),Ne=Math.sin(-we),ht=Ue*_[0]-Ne*_[1]-_[0],mt=Ne*_[0]+Ue*_[1]-_[1];for(let m of["perk","orbit","rise"])w[m]+=(t[m]-w[m])*(1-Math.exp(-u*6));y==="asleep"&&(he+=u),vt.forEach(([m,x,G,W],Q)=>{let xe=m*ye+ht*W,Me=x*ye+mt*W,Ke=0,ke=G*t.scale,Ee=(Ze,ut,ft,pt)=>{ke*=1-Math.sin(Math.PI*Math.min(1,Math.max(0,Ze))),Ze>.5&&(xe=ut,Me=ft,Ke=pt)};Q===1&&Ee(w.perk,-1.18,.98,0);let $e=A*2.1+Q*Math.PI;Ee(w.orbit,.1+Math.cos($e)*.62,1.4+Math.sin($e)*.14,Math.sin($e)*.5);let Ae=(he*.28+Q*.5)%1;Ee(w.rise,.72+Q*.22+Math.sin(Ae*5)*.06,1.12+Ae*.62,0),w.rise>.5&&(ke*=Math.sin(Ae*Math.PI)*1.05);let Qe=$>.5?-xe:xe;e.uniform4f(Q?a.b2:a.b1,Ye+de*(S*Qe-T*Me),je+Xe*(T*Qe+S*Me),Ke,Math.max(.001,ke)*He-(1-He)*.15)}),e.uniform1f(a.tail,-we),e.uniform2f(a.roll,S,T),e.uniform2f(a.lobes,1-Re(1-at,1,$),Re(0,at,$)),e.uniform1f(a.face,O),e.uniform4f(a.eyeW,t.open,t.joy,t.shut,t.worry),e.uniform4f(a.eye,t.eyeL,t.eyeR,Ve,t.gy+b.y*.05),e.uniform1f(a.lid,me),e.uniform1f(a.glow,t.glow),e.uniform1f(a.flow,Y),e.uniform1f(a.alpha,Ge),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.drawArrays(e.TRIANGLES,0,3),te&&(U=requestAnimationFrame(De))},ue=()=>{ae&&te&&!U&&(ee=0,U=requestAnimationFrame(De))},Fe=new IntersectionObserver(([p])=>{te=!!p?.isIntersecting&&!document.hidden,ue()});Fe.observe(n);let Ie=()=>{te=!document.hidden,ue()};document.addEventListener("visibilitychange",Ie);let qe={canvas:n,onLost:null,setMood(p){p!==y&&(y=p,k={...V,...Je[p]},p==="asleep"&&w.rise<.02&&(he=0),p==="done"&&(D=0,C=0,q=0),p==="oops"&&(F=0))},hop:()=>{D=0},shake:()=>{F=0},arrive:()=>{B=0},look:p=>{r=p},destroy(){ae=!1,cancelAnimationFrame(U),Fe.disconnect(),document.removeEventListener("visibilitychange",Ie),e.getExtension("WEBGL_lose_context")?.loseContext(),n.remove()}};return n.addEventListener("webglcontextlost",()=>{ae&&qe.onLost?.()}),ue(),qe}var st=["idle","watching","thinking","curious","done","oops","asleep"],Se="M114 44C150 44 176 71 176 106C176 142 150 168 114 168C101 168 93 165 85 160C79 156 75 165 66 160C57 155 63 146 54 141C46 137 39 144 33 135C27 126 40 121 44 113C48 104 46 95 52 84C62 60 85 44 114 44Z",Mt=[[29,152,5.5],[50,172,6.5]],kt=[[124,100,10,15.5],[153,98,9,14.5]],Et=[[78,118,34,"#ff9fb0"],[124,142,32,"#ffc24a"],[160,118,28,"#ffe3a3"]],ce="#141419",$t=`
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
@media (prefers-reduced-motion:reduce){.dash,.dash *{animation:none!important;transition:none!important}}`,At=0;function rt({tile:c=!0,simple:s=!1,mood:i="idle",label:n="Dash, the First Try mascot"}={}){let e=`dash${At++}`,h=s?1.22:1,M=([o,a,d,f],t)=>{let k=(r,b)=>`<path class="${b}" d="M${o-d} ${a+3*r}Q${o} ${a-d*1.15*r} ${o+d} ${a+3*r}" fill="none" stroke="${ce}" stroke-width="${s?9:5}" stroke-linecap="round"/>`,y=t?1:-1,w=`<g class="d-worry"><ellipse cx="${o}" cy="${a+4}" rx="${d*(s?.8:.62)}" ry="${f*(s?.72:.6)}" fill="${ce}"/><path d="M${o-d*.9} ${a-f*.62-y*3}L${o+d*.9} ${a-f*.62+y*3}" stroke="${ce}" stroke-width="${s?7:4}" stroke-linecap="round"/></g>`;return`<g class="d-eye"><ellipse class="d-open" cx="${o}" cy="${a}" rx="${d*h}" ry="${f*h}" transform="rotate(-4 ${o} ${a})" fill="${ce}"/>${k(1,"d-joy")}${k(-1,"d-shut")}${w}</g>`},l=o=>s?"":Mt.map(([a,d,f])=>`<circle ${o?'class="d-drip" ':""}cx="${a}" cy="${d}" r="${f}"/>`).join(""),g=n?`role="img" aria-label="${n}"`:'aria-hidden="true"',L=c==="square"?`<rect width="200" height="200" fill="url(#${e}t)"/>`:c?`<rect width="200" height="200" rx="46" fill="url(#${e}t)"/><rect x="1" y="1" width="198" height="198" rx="45" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>`:"";return`<svg xmlns="http://www.w3.org/2000/svg" class="dash" data-mood="${i}" viewBox="${c?"0 0 200 200":"14 20 176 164"}" ${g}>
<defs><linearGradient id="${e}t" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#1d2748"/><stop offset="1" stop-color="#0b1020"/></linearGradient>
<filter id="${e}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
<clipPath id="${e}c"><path d="${Se}"/></clipPath></defs>
${L}
<g class="d-all"><g class="d-pose"><g class="d-body">
${s?"":`<g fill="#000" opacity=".4" transform="translate(5 8)"><path d="${Se}"/>${l(!1)}</g>`}
<g fill="#fff"><path d="${Se}"/>${l(!0)}</g>
<g clip-path="url(#${e}c)"><g class="d-shimmer" filter="url(#${e}b)" opacity=".78">${Et.map(([o,a,d,f])=>`<circle cx="${o}" cy="${a}" r="${d}" fill="${f}"/>`).join("")}</g></g>
<g class="d-eyes">${kt.map(M).join("")}</g>
<g class="d-z" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M168 46h12l-12 13h12"/><path d="M152 30h8l-8 9h8" opacity=".7"/></g>
</g></g></g></svg>`}var Rt={idle:"d-open",watching:"d-open",thinking:"d-open",curious:"d-open",done:"d-joy",oops:"d-worry",asleep:"d-shut"};function Lt(c={}){let s=c.mood??"idle",i=rt(c).replace(' class="dash"',"");for(let h of["d-open","d-joy","d-shut","d-worry"])h!==Rt[s]&&(i=i.replaceAll(`class="${h}"`,`class="${h}" display="none"`));s!=="asleep"&&(i=i.replace('class="d-z"','class="d-z" display="none"'));let n={curious:"rotate(-8 105 168)",watching:"rotate(5 105 168)"},e={watching:"translate(2 7)",thinking:"translate(-5 -6)",curious:"translate(3 -4)",oops:"translate(0 3)",asleep:"translate(0 3)"};return n[s]&&(i=i.replace('class="d-pose"',`class="d-pose" transform="${n[s]}"`)),e[s]&&(i=i.replace('class="d-eyes"',`class="d-eyes" transform="${e[s]}"`)),i}var Z=new Set,X=new Set,j=null,Te=!1;function nt(c){j={x:c.clientX,y:c.clientY},!Te&&(Te=!0,requestAnimationFrame(()=>{if(Te=!1,!!j){for(let{svg:s,eyes:i}of Z){let n=s.getBoundingClientRect(),e=(j.x-(n.left+n.width/2))/window.innerWidth,h=(j.y-(n.top+n.height/2))/window.innerHeight,M=l=>Math.max(-1,Math.min(1,l*2.4));i.style.transform=`translate(${(M(e)*7).toFixed(1)}px,${(M(h)*5).toFixed(1)}px)`}for(let{box:s,dash:i}of X){let n=s.getBoundingClientRect(),e=h=>Math.max(-1,Math.min(1,h*2.4));i.look([e((j.x-(n.left+n.width/2))/window.innerWidth),-e((j.y-(n.top+n.height/2))/window.innerHeight)])}}}))}function zt(c,{size:s=96,follow:i=!0,arrive:n=!1,render:e="auto",...h}={}){let M=typeof c=="string"?document.querySelector(c):c;if(!M)throw new Error("createDash: no such element");if(!document.getElementById("dash-css")){let r=document.createElement("style");r.id="dash-css",r.textContent=$t,document.head.append(r)}let l=document.createElement("span");l.style.cssText=`display:inline-block;width:${s}px;line-height:0;vertical-align:middle`,M.append(l);let g=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??!1,L=()=>{!Z.size&&!X.size&&window.addEventListener("pointermove",nt,{passive:!0})},o=()=>{!Z.size&&!X.size&&window.removeEventListener("pointermove",nt)},a=e==="auto"&&!h.tile&&h.tile!==void 0&&s>32&&!g?ot(Math.round(s*2.254),h.mood??"idle",i&&(window.matchMedia?.("(hover: hover)").matches??!1)):null;if(a){let r=h.label??"Dash, the First Try mascot";l.style.cssText+=`;position:relative;height:${Math.round(s*164/176)}px`,r?(l.setAttribute("role","img"),l.setAttribute("aria-label",r)):l.setAttribute("aria-hidden","true"),l.dataset.mood=h.mood??"idle",l.dataset.render="3d",l.append(a.canvas);let b={box:l,dash:a};i&&(L(),X.add(b)),n&&a.arrive();let v=null;return a.onLost=()=>{X.delete(b),o(),a.destroy();let E=l.dataset.mood??"idle";l.remove(),v=zt(M,{size:s,follow:i,render:"svg",...h,mood:E})},{get el(){return v?v.el:l},setMood(E){if(v)return v.setMood(E);st.includes(E)&&(l.dataset.mood=E,a.setMood(E))},hop:()=>v?v.hop():a.hop(),arrive:()=>v?v.arrive():a.arrive(),destroy(){if(v)return v.destroy();X.delete(b),o(),a.destroy(),l.remove()}}}l.innerHTML=rt({simple:s<=32,...h});let d=l.firstElementChild,f={svg:d,eyes:d.querySelector(".d-eyes")},t=0,k=!0,y=r=>{g||(d.classList.remove("is-hop","is-shake","is-arrive"),d.getBoundingClientRect(),d.classList.add(r))};d.addEventListener("animationend",r=>{r.target.classList.contains("d-all")&&d.classList.remove("is-hop","is-shake","is-arrive")});let w=()=>{if(!k)return;let r=d.dataset.mood;r!=="done"&&r!=="asleep"&&r!=="oops"&&(d.classList.add("is-blink"),window.setTimeout(()=>d.classList.remove("is-blink"),130)),t=window.setTimeout(w,2200+Math.random()*3800)};return g||(t=window.setTimeout(w,1200+Math.random()*2e3),i&&(L(),Z.add(f)),n&&y("is-arrive")),{el:l,setMood(r){!st.includes(r)||d.dataset.mood===r||(d.dataset.mood=r,r==="done"&&y("is-hop"),r==="oops"&&y("is-shake"))},hop:()=>y("is-hop"),arrive:()=>y("is-arrive"),destroy(){k=!1,window.clearTimeout(t),Z.delete(f),o(),l.remove()}}}export{$t as DASH_CSS,st as MOODS,zt as createDash,rt as dashSVG,Lt as stillSVG};
