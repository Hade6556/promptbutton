// Dash in 3D: the same ghost as dash.ts, drawn by one fragment shader as a soft solid (a signed
// distance field: a head, two lobes at its lower left and two thought dots that ride with the body and keep their distance from it).
// It faces right, as drawn. A Dash that changes sides faces left when the pointer is on its left: the eyes stay where
// they are, on the middle line of its box, and the body moves over to their other side.
// No library. A mood is a list of numbers; changing mood eases every number to its new value, so
// nothing ever snaps. Hop, shake and arrive are short moves added on top.
// The camera has no perspective, so the shape never distorts, and the canvas is larger than the
// layout box, so no move is clipped. dash.ts falls back to the SVG when WebGL 2 is missing.
import type { Mood, Move } from './dash';

const VIEW = 6.4; // world units across the canvas; the head's radius is 1
/** How much larger the canvas is than the layout box, so a hop or a drifting bubble is never cut off. */
export const BLEED = 2.254;

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform mat3 uRot; uniform vec3 uOff; uniform vec2 uScale;
uniform vec4 uB1; uniform vec4 uB2; uniform float uTail; uniform vec2 uRoll; uniform vec2 uLobes; uniform float uFace; uniform mat3 uPaint;
uniform vec4 uEyeW; uniform vec4 uEye; uniform float uLid;
uniform float uGlow; uniform float uFlow; uniform float uAlpha;
out vec4 o;
const float VIEW = ${VIEW.toFixed(1)};
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
}`;

// Everything a mood sets. Angles are radians; positions are in head radii.
type Pose = {
  yaw: number; pitch: number; roll: number; sx: number; sy: number; scale: number;
  open: number; joy: number; shut: number; worry: number; eyeL: number; eyeR: number; gx: number; gy: number;
  // How far the lids are up: 1 wide open, 0.45 drooping.
  lid: number;
  glow: number; flow: number; bob: number;
  // Where the two thought dots are, each from 0 to 1: one popped up beside the head, both circling above it, both rising like breath.
  perk: number; orbit: number; rise: number;
  // The body: where it leans (lx, ly), how the tail is held (tail, up is positive) and wags, how deeply it breathes, how far it rocks.
  lx: number; ly: number; tail: number; wag: number; wagHz: number; breath: number; sway: number;
};
const REST: Pose = {
  yaw: 0.41, pitch: 0, roll: 0, sx: 1, sy: 1, scale: 1, open: 1, joy: 0, shut: 0, worry: 0, eyeL: 1, eyeR: 1, gx: 0, gy: 0,
  lid: 1, glow: 1, flow: 0, bob: 1, perk: 0, orbit: 0, rise: 0,
  lx: 0, ly: 0, tail: 0, wag: 0.07, wagHz: 1.7, breath: 0, sway: 0,
};
// Each mood holds the body differently, so it reads without the eyes:
// idle floats upright with a lazy tail; watching leans in low with the tail raised and still; thinking stands tall and rocks,
// tail swishing; curious tips the other way and rises, tail curled up; done hops and wags; oops sags with a limp, trembling
// tail; sleepy sinks a little with heavy lids and a slow breath; asleep spreads flat, slumps and breathes slowly.
const POSES: Record<Mood, Partial<Pose>> = {
  idle: {},
  watching: { yaw: 0.5, pitch: 0.3, roll: -0.14, sx: 1.04, sy: 0.97, lx: 0.12, ly: -0.05, tail: 0.32, wag: 0, gy: -0.05, bob: 0.5 },
  thinking: { yaw: 0.22, pitch: -0.24, sx: 0.97, sy: 1.04, sway: 1, tail: 0.1, wag: 0.13, wagHz: 3.6, gx: -0.04, gy: 0.05, flow: 1.5, orbit: 1, bob: 0.6 },
  curious: { yaw: 0.34, roll: 0.17, scale: 1.05, sx: 0.96, sy: 1.06, ly: 0.07, tail: 0.6, wag: 0.04, wagHz: 2.4, eyeL: 0.86, eyeR: 1.16, gx: 0.02, gy: 0.04, perk: 1, bob: 0.6 },
  done: { open: 0, joy: 1, sy: 1.03, ly: 0.03, tail: 0.3, wag: 0.1, wagHz: 4, glow: 1.25 },
  oops: { open: 0, worry: 1, sx: 1.07, sy: 0.89, ly: -0.08, pitch: 0.1, gy: -0.03, tail: -0.45, wag: 0.03, wagHz: 16, glow: 0.55, bob: 0.3 },
  sleepy: { lid: 0.45, sx: 1.04, sy: 0.94, ly: -0.05, pitch: 0.09, gy: -0.03, tail: -0.1, wag: 0.03, wagHz: 1.1, breath: 0.7, glow: 0.8, bob: 0.4 },
  asleep: { open: 0, shut: 1, sx: 1.09, sy: 0.87, roll: 0.1, ly: -0.1, pitch: 0.14, yaw: 0.36, gy: -0.03, tail: -0.18, wag: 0, breath: 1, glow: 0.5, rise: 1, bob: 0.15 },
};

// One-off moves and how long each takes, in seconds. Each starts and ends at rest, so it can be laid over any pose.
//   blink    two quick blinks                 stretch  up tall, tail raised, and back down
//   look     a glance to one side, then the other        yawn  eyes squeezed, head tipped back
//   puff     the two drops rise once, like a "z"         startle  a small jump with wide eyes: woken up
const MOVES: Record<Move, number> = { blink: 0.5, stretch: 1.5, look: 2.6, yawn: 1.9, puff: 3.2, startle: 0.5 };
// Fast asleep nothing moves quickly, so the picture is redrawn this many times a second instead of on every frame.
const ASLEEP_FPS = 15;

// The two thought dots at home: x, y, radius, and how much of the tail tip's swing each one rides.
const DOTS = [[-1.4, -0.74, 0.09, 1], [-1.05, -1.08, 0.105, 0.6]] as const;
// The tail's tip, measured from the tail's root (the same numbers as in the shader).
const TIP = [-0.401, -0.204] as const;
// Facing. Dash changes sides once the pointer is this far past its middle, measured as look() gives it
// (0.05 is about 2% of the window's width), and keeps its side while the pointer is nearer than that, so it cannot flicker
// between the two.
const FACE_DEAD = 0.05;
// Changing sides takes FACE_TIME seconds, slow at both ends and quickest in the middle. FACE_SOFT rounds off a change of
// mind part-way (a higher number follows more closely) and adds about 2 / FACE_SOFT seconds of settling.
const FACE_TIME = 0.85, FACE_SOFT = 14;
// The lobes of the two sides overlap for this share of the change, so the body is never a bare ball on the way.
const FACE_OVERLAP = 0.7;
// Where the eyes are drawn, measured to the right of the head's middle in head radii, for a head turned, tilted and
// nodded by these angles, whose eyes glance `glance` to the side. (0.1225 and 0.964: how high and how far forward the eyes sit.)
const eyesAt = (turn: number, tilt: number, nod: number, glance: number) =>
  Math.cos(tilt) * ((0.1225 * Math.sin(nod) + 0.964 * Math.cos(nod)) * Math.sin(turn) + glance * Math.cos(turn))
  - Math.sin(tilt) * (0.1225 * Math.cos(nod) - 0.964 * Math.sin(nod));
// How far right of the head's middle the eyes are at rest. A Dash that changes sides is placed with its eyes on the
// middle line of its box, so that it takes up the same room facing either way.
const EYES_HOME = eyesAt(REST.yaw, REST.roll, REST.pitch, REST.gx);
const ramp = (from: number, to: number, x: number) => { const k = Math.min(1, Math.max(0, (x - from) / (to - from))); return k * k * (3 - 2 * k); };
export interface Dash3D {
  canvas: HTMLCanvasElement;
  setMood(mood: Mood): void;
  /** `size` scales the height: 1 is the hop for a finished prompt. */
  hop(size?: number): void;
  /** A one-off move over the current pose (see MOVES). A new one replaces the one in progress. */
  play(move: Move): void;
  shake(): void;
  arrive(): void;
  /** Where the pointer is, each from -1 to 1 (right and up), or null to look ahead. */
  look(target: [number, number] | null): void;
  destroy(): void;
  /** Called if the browser takes the WebGL context away. */
  onLost: (() => void) | null;
}

/**
 * A 3D Dash drawing into a canvas of `css` CSS pixels square, or null when WebGL 2 is not available.
 * With `sides` it faces whichever side the pointer is on, and is placed with its eyes on the middle line of its box.
 * Without, it always faces right and sits where the flat drawing does.
 */
export function createDash3D(css: number, mood: Mood, sides = false): Dash3D | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram()!;
  if (!vs || !fs) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (name: string) => gl.getUniformLocation(prog, name);
  const u = { res: U('uRes'), rot: U('uRot'), off: U('uOff'), scale: U('uScale'), b1: U('uB1'), b2: U('uB2'), tail: U('uTail'), roll: U('uRoll'), lobes: U('uLobes'), face: U('uFace'), paint: U('uPaint'), eyeW: U('uEyeW'), eye: U('uEye'), lid: U('uLid'), glow: U('uGlow'), flow: U('uFlow'), alpha: U('uAlpha') };

  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(css * ratio);
  canvas.width = canvas.height = px;
  canvas.style.cssText = `position:absolute;left:50%;top:50%;width:${css}px;height:${css}px;transform:translate(-50%,-50%);pointer-events:none`;
  gl.viewport(0, 0, px, px);
  gl.uniform2f(u.res, px, px);

  const now: Pose = { ...REST, ...POSES[mood] };
  let goal: Pose = { ...now };
  let current = mood;
  // How far each dot placement has taken over, from 0 to 1. These follow the pose a touch more slowly, so a change starts gently.
  const path = { perk: now.perk, orbit: now.orbit, rise: now.rise };
  let gaze: [number, number] | null = null;
  const look = { x: 0, y: 0 };
  // Where the head's middle is at rest, right of the box's middle: where the flat drawing has it, or with the eyes on the middle line.
  const home = sides ? -EYES_HOME : 0.19;
  // Which side Dash is to face (1 is right, as drawn; -1 is left), and how far over it is: 0 facing right, 1 facing left.
  let side = 1, swing = 0, turned = 0;
  let flow = 0, wagAt = 0, cheer = -1, nap = 0, clock = 0, lid = 1, blinkAt = 1.5 + Math.random() * 2, blink = -1;
  let hop = -1, hopSize = 1, shake = -1, arrive = -1, pop = -1;
  let act: { move: Move; at: number; blinks: number } | null = null;
  let raf = 0, slow = 0, last = 0, visible = true, alive = true;

  const frame = (ms: number) => {
    raf = 0;
    if (!alive) return;
    const dt = last ? Math.min(0.05, (ms - last) / 1000) : 0.016;
    last = ms;
    clock += dt;
    const ease = 1 - Math.exp(-dt * 9);
    for (const key of Object.keys(now) as (keyof Pose)[]) now[key] += (goal[key] - now[key]) * ease;
    flow += dt * now.flow;
    // Out of thinking, the colours settle back to where the drawing has them.
    if (goal.flow === 0) flow -= (flow - Math.round(flow / (Math.PI * 2)) * Math.PI * 2) * (1 - Math.exp(-dt * 2.5));
    // A burst of wagging when a prompt is ready, fading over a second and a half.
    let party = 0;
    if (cheer >= 0) { cheer += dt / 1.5; party = Math.pow(1 - Math.min(cheer, 1), 2); if (cheer >= 1) cheer = -1; }
    wagAt += dt * (now.wagHz + party * 9);
    const wag = Math.sin(wagAt) * (now.wag + party * 0.2);

    // The eyes drift towards the pointer while idle, and the head turns a little with them.
    const follows = current === 'idle' && gaze;
    const lookEase = 1 - Math.exp(-dt * 7);
    look.x += ((follows ? gaze![0] : 0) - look.x) * lookEase;
    look.y += ((follows ? gaze![1] : 0) - look.y) * lookEase;
    // Dash faces the side the pointer is on, in every mood but asleep. Everything below is worked out as if it faced
    // right, with the pointer's x counted from its own front (lookX), and is put on the other side at the end.
    if (sides && gaze && current !== 'asleep') { if (gaze[0] > FACE_DEAD) side = 1; else if (gaze[0] < -FACE_DEAD) side = -1; }
    const over = side < 0 ? 1 : 0;
    swing += Math.max(-dt / FACE_TIME, Math.min(dt / FACE_TIME, over - swing));
    turned += (0.5 - 0.5 * Math.cos(Math.PI * swing) - turned) * (1 - Math.exp(-dt * FACE_SOFT));
    if (swing === over && Math.abs(turned - over) < 1e-4) turned = over;
    // face runs from 1 (facing right) to -1 (facing left).
    const face = 1 - 2 * turned;
    // A Dash that changes sides follows the pointer with its head only on the side it faces: a pointer behind it starts
    // the change of sides instead.
    const lookX = sides ? Math.max(0, look.x * face) : look.x;
    // The dots shrink away while the lobes change sides and grow back beside the new tail, so they never cross the body.
    // (Below nothing: a dot of no size would still leave a speck, so on the way its radius goes under zero.)
    const tuck = ramp(0.6, 1, Math.abs(Math.cos(turned * Math.PI)));

    // Blinking, for the moods whose eyes are open.
    if (blink < 0 && clock > blinkAt && now.open > 0.9) blink = 0;
    if (blink >= 0) {
      blink += dt / 0.16;
      lid = 1 - Math.sin(Math.min(blink, 1) * Math.PI) * 0.94;
      if (blink >= 1) { blink = -1; lid = 1; blinkAt = clock + 2.2 + Math.random() * 3.8; }
    }

    // Short moves laid over the pose. Each starts and ends at rest, so it can begin at any moment.
    let ox = now.lx + lookX * 0.05 + Math.sin(clock * 1.8) * 0.07 * now.sway, oy = now.ly + Math.sin(clock * 1.7) * 0.034 * now.bob, roll = now.roll - lookX * 0.04, alpha = 1;
    const breathe = Math.sin(clock * 1.7 + 0.6) * 0.012 * now.bob + Math.sin(clock * 1.1) * 0.035 * now.breath;
    let sx = now.sx * (1 - breathe * 0.6), sy = now.sy * (1 + breathe);
    if (current === 'thinking') roll += Math.sin(clock * 3.6) * 0.045 * (goal.flow > 0 ? Math.min(1, now.flow / 1.3) : 0);
    if (hop >= 0) {
      hop += dt / 0.66;
      const k = Math.min(hop, 1), rise = Math.max(0, (k - 0.1) / 0.9);
      oy += (rise < 0.6 ? 0.42 * Math.sin((rise / 0.6) * Math.PI) : 0.06 * Math.sin(((rise - 0.6) / 0.4) * Math.PI)) * hopSize;
      const squash = 1 - 0.12 * hopSize * Math.sin(k * Math.PI * 3) * (1 - k);
      sy *= squash; sx /= Math.sqrt(squash);
      if (hop >= 1) hop = -1;
    }
    if (shake >= 0) {
      shake += dt / 0.45;
      const k = Math.min(shake, 1), wave = Math.sin(k * Math.PI * 6) * (1 - k);
      ox += wave * 0.1; roll += wave * 0.07;
      if (shake >= 1) shake = -1;
    }
    if (arrive >= 0) {
      arrive += dt / 0.9;
      const k = Math.min(arrive, 1), out = 1 - Math.pow(1 - k, 3), back = Math.sin(k * Math.PI) * 0.22 * (1 - k);
      // It fades in as it nears its place, so it is never seen at the canvas's edge.
      ox += -1.5 * (1 - out) + back;
      sx *= 1 + 0.2 * (1 - out); sy /= Math.sqrt(1 + 0.2 * (1 - out));
      const a = Math.min(1, Math.max(0, (k - 0.12) / 0.38)); alpha = a * a * (3 - 2 * a);
      if (arrive >= 1) arrive = -1;
    }
    // The one-off moves. Each adds to the pose by an amount that is nothing at its start and at its end.
    let turn = 0, peek = 0, nod = 0, tailUp = 0, squeeze = 0, wide = 0, puff = 0;
    if (act) {
      act.at += dt / MOVES[act.move];
      const k = Math.min(act.at, 1), arc = Math.sin(k * Math.PI);
      if (act.move === 'blink') {
        if (blink < 0 && act.blinks < 2 && k >= act.blinks * 0.5) { blink = 0; act.blinks++; }
      } else if (act.move === 'stretch') {
        const s = arc * arc;
        sy *= 1 + 0.13 * s; sx *= 1 - 0.07 * s; oy += 0.08 * s; nod = -0.12 * s; tailUp = 0.5 * s;
      } else if (act.move === 'look') {
        const sweep = Math.sin(k * Math.PI * 2) * arc; // one way, then the other
        turn = sweep * 0.5; peek = sweep * 0.07;
      } else if (act.move === 'yawn') {
        const s = ramp(0, 0.3, k) * (1 - ramp(0.72, 1, k));
        squeeze = 0.85 * s; nod = -0.22 * s; sy *= 1 + 0.08 * s; sx *= 1 - 0.04 * s;
      } else if (act.move === 'puff') {
        puff = ramp(0, 0.15, k) * (1 - ramp(0.8, 1, k));
      } else {
        const s = (1 - k) * (1 - k); // startle: sharp at first, gone by the end
        oy += 0.2 * Math.sin(Math.min(1, k * 2) * Math.PI); ox += Math.sin(k * Math.PI * 8) * 0.03 * s;
        sy *= 1 + 0.1 * arc; sx *= 1 - 0.05 * arc; wide = 0.3 * s;
      }
      if (act.at >= 1) act = null;
    }
    let spread = 1;
    if (pop >= 0) { pop += dt / 0.5; spread = 1 + 0.2 * Math.sin(Math.min(pop, 1) * Math.PI); if (pop >= 1) pop = -1; }

    // Facing left is the mirror image of the same pose about the middle line of the box, which is where the eyes rest.
    // On the way there the eyes stay on that line and nothing turns round: the head slides across behind them (its face
    // turning on it by the little that keeps them still), every lean and tilt changes sides, and the lobes change sides
    // in the shader.
    const yawB = now.yaw + lookX * 0.3 + turn, pitch = now.pitch - look.y * 0.18 + nod, glanceB = now.gx + lookX * 0.06 + peek, rollB = roll;
    const yaw = yawB * face, glance = glanceB * face;
    roll *= face;
    const cy = Math.cos(yaw), sY = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const offY = -0.06 + oy - (1 - sy) * 1.0, scaleX = sx * now.scale, scaleY = sy * now.scale;
    // Where the eyes are facing right, and so where the head's middle must be for them to pass straight to their mirror
    // image. At rest that is no move at all; a mood that leans or turns the head moves them by twice that lean.
    const eyesR = home + ox + scaleX * eyesAt(yawB, rollB, pitch, glanceB);
    const offX = turned ? eyesR * face - scaleX * eyesAt(yaw, roll, pitch, glance) : home + ox;
    // World from local = Rz(roll) * Ry(yaw) * Rx(pitch), written column by column for WebGL.
    const m = [
      cr * cy, sr * cy, -sY,
      cr * sY * sp - sr * cp, sr * sY * sp + cr * cp, cy * sp,
      cr * sY * cp + sr * sp, sr * sY * cp - cr * sp, cy * cp,
    ];
    gl.uniformMatrix3fv(u.rot, false, m);
    // Where the lobes' colour is looked up: the head as it is held, without the turn.
    const cb = Math.cos(yawB), sb = Math.sin(yawB);
    gl.uniformMatrix3fv(u.paint, false, [cb, 0, -sb, sb * sp, cp, cb * sp, sb * cp, -sp, cb * cp]);
    gl.uniform3f(u.off, offX, offY, 0);
    gl.uniform2f(u.scale, scaleX, scaleY);
    // The two thought dots are placed in the body's own space and carried through the same tilt, squash, lean, hop and
    // shake as the body, in the same frame: nothing chases anything, so they cannot lag or drift off. At home they ride
    // the tail's tip as it swings, which keeps their gap to it. When a mood wants them elsewhere (one beside the head,
    // both circling above it, both rising like breath) a dot shrinks away where it is and grows where it is going,
    // so it never crosses the body on the way.
    const lift = now.tail + wag + lookX * 0.14 - look.y * 0.08 + tailUp;
    const tc = Math.cos(-lift), ts = Math.sin(-lift);
    const tipX = tc * TIP[0] - ts * TIP[1] - TIP[0], tipY = ts * TIP[0] + tc * TIP[1] - TIP[1];
    for (const key of ['perk', 'orbit', 'rise'] as const) path[key] += ((key === 'rise' ? Math.max(now.rise, puff) : now[key]) - path[key]) * (1 - Math.exp(-dt * 6));
    if (current === 'asleep' || puff > 0) nap += dt;
    DOTS.forEach(([homeX, homeY, size, ride], i) => {
      let x = homeX * spread + tipX * ride, y = homeY * spread + tipY * ride, z = 0, r = size * now.scale;
      const move = (w: number, toX: number, toY: number, toZ: number) => {
        r *= 1 - Math.sin(Math.PI * Math.min(1, Math.max(0, w)));
        if (w > 0.5) { x = toX; y = toY; z = toZ; }
      };
      if (i === 1) move(path.perk, -1.18, 0.98, 0);
      const a = clock * 2.1 + i * Math.PI;
      move(path.orbit, 0.1 + Math.cos(a) * 0.62, 1.4 + Math.sin(a) * 0.14, Math.sin(a) * 0.5);
      const k = (nap * 0.28 + i * 0.5) % 1;
      move(path.rise, 0.72 + i * 0.22 + Math.sin(k * 5) * 0.06, 1.12 + k * 0.62, 0);
      if (path.rise > 0.5) r *= Math.sin(k * Math.PI) * 1.05;
      // The dots change sides with the lobes, while they are out of sight.
      const tx = turned > 0.5 ? -x : x;
      gl.uniform4f(i ? u.b2 : u.b1, offX + scaleX * (cr * tx - sr * y), offY + scaleY * (sr * tx + cr * y), z, Math.max(0.001, r) * tuck - (1 - tuck) * 0.15);
    });
    // The tail answers a turn of the head by swinging in the picture plane, so it never leaves the outline.
    gl.uniform1f(u.tail, -lift);
    gl.uniform2f(u.roll, cr, sr);
    gl.uniform2f(u.lobes, 1 - ramp(1 - FACE_OVERLAP, 1, turned), ramp(0, FACE_OVERLAP, turned));
    gl.uniform1f(u.face, face);
    gl.uniform4f(u.eyeW, now.open, now.joy, now.shut, now.worry);
    gl.uniform4f(u.eye, now.eyeL * (1 + wide), now.eyeR * (1 + wide), glance, now.gy + look.y * 0.05);
    gl.uniform1f(u.lid, lid * now.lid * (1 - squeeze));
    gl.uniform1f(u.glow, now.glow);
    gl.uniform1f(u.flow, flow);
    gl.uniform1f(u.alpha, alpha);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!visible) return;
    // Fast asleep and settled, the next picture can wait: only a slow breath and the rising drops are moving.
    const settled = current === 'asleep' && !act && hop < 0 && shake < 0 && arrive < 0 && pop < 0 && now.shut > 0.99 && swing === over;
    if (settled) slow = window.setTimeout(() => { slow = 0; if (alive && visible && !raf) raf = requestAnimationFrame(frame); }, 1000 / ASLEEP_FPS - 16);
    else raf = requestAnimationFrame(frame);
  };
  const wake = () => { if (alive && visible && !raf && !slow) { last = 0; raf = requestAnimationFrame(frame); } };
  /** Something changed: draw now instead of waiting out the slow rate. */
  const stir = () => { if (!slow) return; window.clearTimeout(slow); slow = 0; if (alive && visible && !raf) raf = requestAnimationFrame(frame); };
  const seen = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting) && !document.hidden; wake(); });
  seen.observe(canvas);
  const onHidden = () => { visible = !document.hidden; wake(); };
  document.addEventListener('visibilitychange', onHidden);
  const api: Dash3D = {
    canvas,
    onLost: null,
    setMood(next) {
      if (next === current) return;
      stir();
      current = next;
      goal = { ...REST, ...POSES[next] };
      if (next === 'asleep' && path.rise < 0.02) nap = 0;
      if (next === 'done') { hop = 0; pop = 0; cheer = 0; }
      if (next === 'oops') shake = 0;
    },
    hop: (size = 1) => { hop = 0; hopSize = size; stir(); },
    play: (move) => { act = { move, at: 0, blinks: 0 }; stir(); },
    shake: () => { shake = 0; },
    arrive: () => { arrive = 0; },
    look: (target) => { gaze = target; },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(slow);
      seen.disconnect();
      document.removeEventListener('visibilitychange', onHidden);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
  canvas.addEventListener('webglcontextlost', () => { if (alive) api.onLost?.(); });
  wake();
  return api;
}
