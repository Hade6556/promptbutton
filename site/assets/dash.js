var At=`#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`,St=`#version 300 es
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
}`,Z={yaw:.41,pitch:0,roll:0,sx:1,sy:1,scale:1,open:1,joy:0,shut:0,worry:0,eyeL:1,eyeR:1,gx:0,gy:0,lid:1,glow:1,flow:0,bob:1,perk:0,orbit:0,rise:0,lx:0,ly:0,tail:0,wag:.07,wagHz:1.7,breath:0,sway:0},ct={idle:{},watching:{yaw:.5,pitch:.3,roll:-.14,sx:1.04,sy:.97,lx:.12,ly:-.05,tail:.32,wag:0,gy:-.05,bob:.5},thinking:{yaw:.22,pitch:-.24,sx:.97,sy:1.04,sway:1,tail:.1,wag:.13,wagHz:3.6,gx:-.04,gy:.05,flow:1.5,orbit:1,bob:.6},curious:{yaw:.34,roll:.17,scale:1.05,sx:.96,sy:1.06,ly:.07,tail:.6,wag:.04,wagHz:2.4,eyeL:.86,eyeR:1.16,gx:.02,gy:.04,perk:1,bob:.6},done:{open:0,joy:1,sy:1.03,ly:.03,tail:.3,wag:.1,wagHz:4,glow:1.25},oops:{open:0,worry:1,sx:1.07,sy:.89,ly:-.08,pitch:.1,gy:-.03,tail:-.45,wag:.03,wagHz:16,glow:.55,bob:.3},sleepy:{lid:.45,sx:1.04,sy:.94,ly:-.05,pitch:.09,gy:-.03,tail:-.1,wag:.03,wagHz:1.1,breath:.7,glow:.8,bob:.4},asleep:{open:0,shut:1,sx:1.09,sy:.87,roll:.1,ly:-.1,pitch:.14,yaw:.36,gy:-.03,tail:-.18,wag:0,breath:1,glow:.5,rise:1,bob:.15}},Pt={blink:.5,stretch:1.5,look:2.6,yawn:1.9,puff:3.2,startle:.5},Rt=15,Tt=[[-1.4,-.74,.09,1],[-1.05,-1.08,.105,.6]],Q=[-.401,-.204],ht=.05,mt=.85,Lt=14,ut=.7,Be=(h,r,l,i)=>Math.cos(r)*((.1225*Math.sin(l)+.964*Math.cos(l))*Math.sin(h)+i*Math.cos(h))-Math.sin(r)*(.1225*Math.cos(l)-.964*Math.sin(l)),Dt=Be(Z.yaw,Z.roll,Z.pitch,Z.gx),_=(h,r,l)=>{let i=Math.min(1,Math.max(0,(l-h)/(r-h)));return i*i*(3-2*i)};function ft(h,r,l=!1){let i=document.createElement("canvas"),e=i.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,powerPreference:"low-power"});if(!e)return null;let u=(f,p)=>{let X=e.createShader(f);return e.shaderSource(X,p),e.compileShader(X),e.getShaderParameter(X,e.COMPILE_STATUS)?X:null},$=u(e.VERTEX_SHADER,At),c=u(e.FRAGMENT_SHADER,St),k=e.createProgram();if(!$||!c||(e.attachShader(k,$),e.attachShader(k,c),e.linkProgram(k),!e.getProgramParameter(k,e.LINK_STATUS)))return null;e.useProgram(k),e.bindBuffer(e.ARRAY_BUFFER,e.createBuffer()),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);let B=e.getAttribLocation(k,"a");e.enableVertexAttribArray(B),e.vertexAttribPointer(B,2,e.FLOAT,!1,0,0);let s=f=>e.getUniformLocation(k,f),a={res:s("uRes"),rot:s("uRot"),off:s("uOff"),scale:s("uScale"),b1:s("uB1"),b2:s("uB2"),tail:s("uTail"),roll:s("uRoll"),lobes:s("uLobes"),face:s("uFace"),paint:s("uPaint"),eyeW:s("uEyeW"),eye:s("uEye"),lid:s("uLid"),glow:s("uGlow"),flow:s("uFlow"),alpha:s("uAlpha")},d=Math.min(2,window.devicePixelRatio||1),b=Math.round(h*d);i.width=i.height=b,i.style.cssText=`position:absolute;left:50%;top:50%;width:${h}px;height:${h}px;transform:translate(-50%,-50%);pointer-events:none`,e.viewport(0,0,b,b),e.uniform2f(a.res,b,b);let t={...Z,...ct[r]},z={...t},v=r,E={perk:t.perk,orbit:t.orbit,rise:t.rise},o=null,x={x:0,y:0},w=l?-Dt:.19,M=1,te=0,A=0,ae=0,Oe=0,V=-1,be=0,S=0,ve=1,Ge=1.5+Math.random()*2,P=-1,T=-1,we=1,L=-1,C=-1,H=-1,g=null,R=0,O=0,de=0,Y=!0,j=!0,ce=f=>{if(R=0,!j)return;let p=de?Math.min(.05,(f-de)/1e3):.016;de=f,S+=p;let X=1-Math.exp(-p*9);for(let n of Object.keys(t))t[n]+=(z[n]-t[n])*X;ae+=p*t.flow,z.flow===0&&(ae-=(ae-Math.round(ae/(Math.PI*2))*Math.PI*2)*(1-Math.exp(-p*2.5)));let Me=0;V>=0&&(V+=p/1.5,Me=Math.pow(1-Math.min(V,1),2),V>=1&&(V=-1)),Oe+=p*(t.wagHz+Me*9);let vt=Math.sin(Oe)*(t.wag+Me*.2),Ye=v==="idle"&&o,je=1-Math.exp(-p*7);x.x+=((Ye?o[0]:0)-x.x)*je,x.y+=((Ye?o[1]:0)-x.y)*je,l&&o&&v!=="asleep"&&(o[0]>ht?M=1:o[0]<-ht&&(M=-1));let oe=M<0?1:0;te+=Math.max(-p/mt,Math.min(p/mt,oe-te)),A+=(.5-.5*Math.cos(Math.PI*te)-A)*(1-Math.exp(-p*Lt)),te===oe&&Math.abs(A-oe)<1e-4&&(A=oe);let U=1-2*A,se=l?Math.max(0,x.x*U):x.x,Xe=_(.6,1,Math.abs(Math.cos(A*Math.PI)));P<0&&S>Ge&&t.open>.9&&(P=0),P>=0&&(P+=p/.16,ve=1-Math.sin(Math.min(P,1)*Math.PI)*.94,P>=1&&(P=-1,ve=1,Ge=S+2.2+Math.random()*3.8));let ne=t.lx+se*.05+Math.sin(S*1.8)*.07*t.sway,he=t.ly+Math.sin(S*1.7)*.034*t.bob,G=t.roll-se*.04,Ue=1,Ne=Math.sin(S*1.7+.6)*.012*t.bob+Math.sin(S*1.1)*.035*t.breath,N=t.sx*(1-Ne*.6),W=t.sy*(1+Ne);if(v==="thinking"&&(G+=Math.sin(S*3.6)*.045*(z.flow>0?Math.min(1,t.flow/1.3):0)),T>=0){T+=p/.66;let n=Math.min(T,1),y=Math.max(0,(n-.1)/.9);he+=(y<.6?.42*Math.sin(y/.6*Math.PI):.06*Math.sin((y-.6)/.4*Math.PI))*we;let m=1-.12*we*Math.sin(n*Math.PI*3)*(1-n);W*=m,N/=Math.sqrt(m),T>=1&&(T=-1)}if(L>=0){L+=p/.45;let n=Math.min(L,1),y=Math.sin(n*Math.PI*6)*(1-n);ne+=y*.1,G+=y*.07,L>=1&&(L=-1)}if(C>=0){C+=p/.9;let n=Math.min(C,1),y=1-Math.pow(1-n,3),m=Math.sin(n*Math.PI)*.22*(1-n);ne+=-1.5*(1-y)+m,N*=1+.2*(1-y),W/=Math.sqrt(1+.2*(1-y));let K=Math.min(1,Math.max(0,(n-.12)/.38));Ue=K*K*(3-2*K),C>=1&&(C=-1)}let Ke=0,Qe=0,ke=0,Ze=0,Je=0,Ee=0,$e=0;if(g){g.at+=p/Pt[g.move];let n=Math.min(g.at,1),y=Math.sin(n*Math.PI);if(g.move==="blink")P<0&&g.blinks<2&&n>=g.blinks*.5&&(P=0,g.blinks++);else if(g.move==="stretch"){let m=y*y;W*=1+.13*m,N*=1-.07*m,he+=.08*m,ke=-.12*m,Ze=.5*m}else if(g.move==="look"){let m=Math.sin(n*Math.PI*2)*y;Ke=m*.5,Qe=m*.07}else if(g.move==="yawn"){let m=_(0,.3,n)*(1-_(.72,1,n));Je=.85*m,ke=-.22*m,W*=1+.08*m,N*=1-.04*m}else if(g.move==="puff")$e=_(0,.15,n)*(1-_(.8,1,n));else{let m=(1-n)*(1-n);he+=.2*Math.sin(Math.min(1,n*2)*Math.PI),ne+=Math.sin(n*Math.PI*8)*.03*m,W*=1+.1*y,N*=1-.05*y,Ee=.3*m}g.at>=1&&(g=null)}let ze=1;H>=0&&(H+=p/.5,ze=1+.2*Math.sin(Math.min(H,1)*Math.PI),H>=1&&(H=-1));let me=t.yaw+se*.3+Ke,ue=t.pitch-x.y*.18+ke,et=t.gx+se*.06+Qe,wt=G,Ae=me*U,tt=et*U;G*=U;let fe=Math.cos(Ae),re=Math.sin(Ae),D=Math.cos(ue),F=Math.sin(ue),I=Math.cos(G),q=Math.sin(G),at=-.06+he-(1-W)*1,pe=N*t.scale,ot=W*t.scale,gt=w+ne+pe*Be(me,wt,ue,et),st=A?gt*U-pe*Be(Ae,G,ue,tt):w+ne,xt=[I*fe,q*fe,-re,I*re*F-q*D,q*re*F+I*D,fe*F,I*re*D+q*F,q*re*D-I*F,fe*D];e.uniformMatrix3fv(a.rot,!1,xt);let Se=Math.cos(me),Pe=Math.sin(me);e.uniformMatrix3fv(a.paint,!1,[Se,0,-Pe,Pe*F,D,Se*F,Pe*D,-F,Se*D]),e.uniform3f(a.off,st,at,0),e.uniform2f(a.scale,pe,ot);let Re=t.tail+vt+se*.14-x.y*.08+Ze,nt=Math.cos(-Re),rt=Math.sin(-Re),Mt=nt*Q[0]-rt*Q[1]-Q[0],kt=rt*Q[0]+nt*Q[1]-Q[1];for(let n of["perk","orbit","rise"])E[n]+=((n==="rise"?Math.max(t.rise,$e):t[n])-E[n])*(1-Math.exp(-p*6));if((v==="asleep"||$e>0)&&(be+=p),Tt.forEach(([n,y,m,K],ie)=>{let Te=n*ze+Mt*K,Le=y*ze+kt*K,it=0,De=m*t.scale,Fe=(dt,Et,$t,zt)=>{De*=1-Math.sin(Math.PI*Math.min(1,Math.max(0,dt))),dt>.5&&(Te=Et,Le=$t,it=zt)};ie===1&&Fe(E.perk,-1.18,.98,0);let Ie=S*2.1+ie*Math.PI;Fe(E.orbit,.1+Math.cos(Ie)*.62,1.4+Math.sin(Ie)*.14,Math.sin(Ie)*.5);let qe=(be*.28+ie*.5)%1;Fe(E.rise,.72+ie*.22+Math.sin(qe*5)*.06,1.12+qe*.62,0),E.rise>.5&&(De*=Math.sin(qe*Math.PI)*1.05);let lt=A>.5?-Te:Te;e.uniform4f(ie?a.b2:a.b1,st+pe*(I*lt-q*Le),at+ot*(q*lt+I*Le),it,Math.max(.001,De)*Xe-(1-Xe)*.15)}),e.uniform1f(a.tail,-Re),e.uniform2f(a.roll,I,q),e.uniform2f(a.lobes,1-_(1-ut,1,A),_(0,ut,A)),e.uniform1f(a.face,U),e.uniform4f(a.eyeW,t.open,t.joy,t.shut,t.worry),e.uniform4f(a.eye,t.eyeL*(1+Ee),t.eyeR*(1+Ee),tt,t.gy+x.y*.05),e.uniform1f(a.lid,ve*t.lid*(1-Je)),e.uniform1f(a.glow,t.glow),e.uniform1f(a.flow,ae),e.uniform1f(a.alpha,Ue),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.drawArrays(e.TRIANGLES,0,3),!Y)return;v==="asleep"&&!g&&T<0&&L<0&&C<0&&H<0&&t.shut>.99&&te===oe?O=window.setTimeout(()=>{O=0,j&&Y&&!R&&(R=requestAnimationFrame(ce))},1e3/Rt-16):R=requestAnimationFrame(ce)},ge=()=>{j&&Y&&!R&&!O&&(de=0,R=requestAnimationFrame(ce))},xe=()=>{O&&(window.clearTimeout(O),O=0,j&&Y&&!R&&(R=requestAnimationFrame(ce)))},We=new IntersectionObserver(([f])=>{Y=!!f?.isIntersecting&&!document.hidden,ge()});We.observe(i);let _e=()=>{Y=!document.hidden,ge()};document.addEventListener("visibilitychange",_e);let Ve={canvas:i,onLost:null,setMood(f){f!==v&&(xe(),v=f,z={...Z,...ct[f]},f==="asleep"&&E.rise<.02&&(be=0),f==="done"&&(T=0,H=0,V=0),f==="oops"&&(L=0))},hop:(f=1)=>{T=0,we=f,xe()},play:f=>{g={move:f,at:0,blinks:0},xe()},shake:()=>{L=0},arrive:()=>{C=0},look:f=>{o=f},destroy(){j=!1,cancelAnimationFrame(R),window.clearTimeout(O),We.disconnect(),document.removeEventListener("visibilitychange",_e),e.getExtension("WEBGL_lose_context")?.loseContext(),i.remove()}};return i.addEventListener("webglcontextlost",()=>{j&&Ve.onLost?.()}),ge(),Ve}var pt=["idle","watching","thinking","curious","done","oops","sleepy","asleep"],Ce="M114 44C150 44 176 71 176 106C176 142 150 168 114 168C101 168 93 165 85 160C79 156 75 165 66 160C57 155 63 146 54 141C46 137 39 144 33 135C27 126 40 121 44 113C48 104 46 95 52 84C62 60 85 44 114 44Z",It=[[29,152,5.5],[50,172,6.5]],qt=[[124,100,10,15.5],[153,98,9,14.5]],Bt=[[78,118,34,"#ff9fb0"],[124,142,32,"#ffc24a"],[160,118,28,"#ffe3a3"]],ye="#141419",Ct=`
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
.dash[data-mood=sleepy]:not(.is-blink) .d-eye{transform:scaleY(.45)}
.dash[data-mood=sleepy] .d-eyes{transform:translate(0,4px)!important}
.dash[data-mood=sleepy] .d-pose{transform:scale(1.03,.95)}
.dash[data-mood=sleepy] .d-body{animation-duration:4.4s}
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
@media (prefers-reduced-motion:reduce){.dash,.dash *{animation:none!important;transition:none!important}}`,Ht=0;function bt({tile:h=!0,simple:r=!1,mood:l="idle",label:i="Dash, the First Try mascot"}={}){let e=`dash${Ht++}`,u=r?1.22:1,$=([s,a,d,b],t)=>{let z=(o,x)=>`<path class="${x}" d="M${s-d} ${a+3*o}Q${s} ${a-d*1.15*o} ${s+d} ${a+3*o}" fill="none" stroke="${ye}" stroke-width="${r?9:5}" stroke-linecap="round"/>`,v=t?1:-1,E=`<g class="d-worry"><ellipse cx="${s}" cy="${a+4}" rx="${d*(r?.8:.62)}" ry="${b*(r?.72:.6)}" fill="${ye}"/><path d="M${s-d*.9} ${a-b*.62-v*3}L${s+d*.9} ${a-b*.62+v*3}" stroke="${ye}" stroke-width="${r?7:4}" stroke-linecap="round"/></g>`;return`<g class="d-eye"><ellipse class="d-open" cx="${s}" cy="${a}" rx="${d*u}" ry="${b*u}" transform="rotate(-4 ${s} ${a})" fill="${ye}"/>${z(1,"d-joy")}${z(-1,"d-shut")}${E}</g>`},c=s=>r?"":It.map(([a,d,b])=>`<circle ${s?'class="d-drip" ':""}cx="${a}" cy="${d}" r="${b}"/>`).join(""),k=i?`role="img" aria-label="${i}"`:'aria-hidden="true"',B=h==="square"?`<rect width="200" height="200" fill="url(#${e}t)"/>`:h?`<rect width="200" height="200" rx="46" fill="url(#${e}t)"/><rect x="1" y="1" width="198" height="198" rx="45" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>`:"";return`<svg xmlns="http://www.w3.org/2000/svg" class="dash" data-mood="${l}" viewBox="${h?"0 0 200 200":"14 20 176 164"}" ${k}>
<defs><linearGradient id="${e}t" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#1d2748"/><stop offset="1" stop-color="#0b1020"/></linearGradient>
<filter id="${e}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
<clipPath id="${e}c"><path d="${Ce}"/></clipPath></defs>
${B}
<g class="d-all"><g class="d-pose"><g class="d-body">
${r?"":`<g fill="#000" opacity=".4" transform="translate(5 8)"><path d="${Ce}"/>${c(!1)}</g>`}
<g fill="#fff"><path d="${Ce}"/>${c(!0)}</g>
<g clip-path="url(#${e}c)"><g class="d-shimmer" filter="url(#${e}b)" opacity=".78">${Bt.map(([s,a,d,b])=>`<circle cx="${s}" cy="${a}" r="${d}" fill="${b}"/>`).join("")}</g></g>
<g class="d-eyes">${qt.map($).join("")}</g>
<g class="d-z" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M168 46h12l-12 13h12"/><path d="M152 30h8l-8 9h8" opacity=".7"/></g>
</g></g></g></svg>`}var Ot={idle:"d-open",watching:"d-open",thinking:"d-open",curious:"d-open",done:"d-joy",oops:"d-worry",sleepy:"d-open",asleep:"d-shut"};function Yt(h={}){let r=h.mood??"idle",l=bt(h).replace(' class="dash"',"");for(let u of["d-open","d-joy","d-shut","d-worry"])u!==Ot[r]&&(l=l.replaceAll(`class="${u}"`,`class="${u}" display="none"`));r!=="asleep"&&(l=l.replace('class="d-z"','class="d-z" display="none"'));let i={curious:"rotate(-8 105 168)",watching:"rotate(5 105 168)"},e={watching:"translate(2 7)",thinking:"translate(-5 -6)",curious:"translate(3 -4)",oops:"translate(0 3)",sleepy:"translate(0 4)",asleep:"translate(0 3)"};return i[r]&&(l=l.replace('class="d-pose"',`class="d-pose" transform="${i[r]}"`)),e[r]&&(l=l.replace('class="d-eyes"',`class="d-eyes" transform="${e[r]}"`)),l}var le=new Set,ee=new Set,J=null,He=!1;function yt(h){J={x:h.clientX,y:h.clientY},!He&&(He=!0,requestAnimationFrame(()=>{if(He=!1,!!J){for(let{svg:r,eyes:l}of le){let i=r.getBoundingClientRect(),e=(J.x-(i.left+i.width/2))/window.innerWidth,u=(J.y-(i.top+i.height/2))/window.innerHeight,$=c=>Math.max(-1,Math.min(1,c*2.4));l.style.transform=`translate(${($(e)*7).toFixed(1)}px,${($(u)*5).toFixed(1)}px)`}for(let{box:r,dash:l}of ee){let i=r.getBoundingClientRect(),e=u=>Math.max(-1,Math.min(1,u*2.4));l.look([e((J.x-(i.left+i.width/2))/window.innerWidth),-e((J.y-(i.top+i.height/2))/window.innerHeight)])}}}))}function Gt(h,{size:r=96,follow:l=!0,arrive:i=!1,render:e="auto",...u}={}){let $=typeof h=="string"?document.querySelector(h):h;if(!$)throw new Error("createDash: no such element");if(!document.getElementById("dash-css")){let o=document.createElement("style");o.id="dash-css",o.textContent=Ct,document.head.append(o)}let c=document.createElement("span");c.style.cssText=`display:inline-block;width:${r}px;line-height:0;vertical-align:middle`,$.append(c);let k=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??!1,B=()=>{!le.size&&!ee.size&&window.addEventListener("pointermove",yt,{passive:!0})},s=()=>{!le.size&&!ee.size&&window.removeEventListener("pointermove",yt)},a=e==="auto"&&!u.tile&&u.tile!==void 0&&r>32&&!k?ft(Math.round(r*2.254),u.mood??"idle",l&&(window.matchMedia?.("(hover: hover)").matches??!1)):null;if(a){let o=u.label??"Dash, the First Try mascot";c.style.cssText+=`;position:relative;height:${Math.round(r*164/176)}px`,o?(c.setAttribute("role","img"),c.setAttribute("aria-label",o)):c.setAttribute("aria-hidden","true"),c.dataset.mood=u.mood??"idle",c.dataset.render="3d",c.append(a.canvas);let x={box:c,dash:a};l&&(B(),ee.add(x)),i&&a.arrive();let w=null;return a.onLost=()=>{ee.delete(x),s(),a.destroy();let M=c.dataset.mood??"idle";c.remove(),w=Gt($,{size:r,follow:l,render:"svg",...u,mood:M})},{get el(){return w?w.el:c},setMood(M){if(w)return w.setMood(M);pt.includes(M)&&(c.dataset.mood=M,a.setMood(M))},hop:M=>w?w.hop():a.hop(M),play:M=>w?w.play(M):a.play(M),arrive:()=>w?w.arrive():a.arrive(),destroy(){if(w)return w.destroy();ee.delete(x),s(),a.destroy(),c.remove()}}}c.innerHTML=bt({simple:r<=32,...u});let d=c.firstElementChild,b={svg:d,eyes:d.querySelector(".d-eyes")},t=0,z=!0,v=o=>{k||(d.classList.remove("is-hop","is-shake","is-arrive"),d.getBoundingClientRect(),d.classList.add(o))};d.addEventListener("animationend",o=>{o.target.classList.contains("d-all")&&d.classList.remove("is-hop","is-shake","is-arrive")});let E=()=>{if(!z)return;let o=d.dataset.mood;o!=="done"&&o!=="asleep"&&o!=="oops"&&(d.classList.add("is-blink"),window.setTimeout(()=>d.classList.remove("is-blink"),130)),t=window.setTimeout(E,2200+Math.random()*3800)};return k||(t=window.setTimeout(E,1200+Math.random()*2e3),l&&(B(),le.add(b)),i&&v("is-arrive")),{el:c,setMood(o){!pt.includes(o)||d.dataset.mood===o||(d.dataset.mood=o,o==="done"&&v("is-hop"),o==="oops"&&v("is-shake"))},hop:()=>v("is-hop"),play(o){k||(o==="startle"?v("is-hop"):o==="blink"&&(d.classList.add("is-blink"),window.setTimeout(()=>d.classList.remove("is-blink"),130)))},arrive:()=>v("is-arrive"),destroy(){z=!1,window.clearTimeout(t),le.delete(b),s(),c.remove()}}}export{Ct as DASH_CSS,pt as MOODS,Gt as createDash,bt as dashSVG,Yt as stillSVG};
