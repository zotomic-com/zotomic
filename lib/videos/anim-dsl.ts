/**
 * Zotomic stick-figure ANIMATION DSL — the "training file" (skill) for the AI
 * animation programmer, plus the validator that debugs every AI-written
 * animation BEFORE it is allowed to render.
 *
 * Three exports matter:
 *  - ANIM_SPEC           → pasted into the Gemini author prompt (the skill doc)
 *  - validateAnimDef()   → the pre-render debugger (schema + geometry checks)
 *  - scene parser helpers→ detect which storyboard scenes need a custom anim
 *
 * The DSL itself is interpreted by mkservice/scripts/stickman.js (interpAnim).
 */
import "server-only";

/* ── the engine's built-in action vocabulary (mirror of stickman.js) ─────── */

export const KNOWN_ACTION_WORDS = new Set([
  // write
  "write", "writes", "writing", "wrote", "novel", "notebook", "scribble", "scribbles", "scribbling",
  "pencil", "pen", "desk", "essay", "notes", "type", "typing", "keyboard",
  // cook
  "cook", "cooks", "cooked", "cooking", "whisk", "whisking", "eggs", "kitchen", "food", "meal",
  "sandwich", "chef", "recipe", "stomach", "sizzle",
  // dance
  "dance", "dances", "danced", "dancing", "polka", "lo-fi", "beats",
  // run
  "run", "runs", "ran", "running", "sprint", "sprints", "sprinting", "rush", "flee", "flees",
  "chase", "chases", "chasing", "hurry", "hurries", "hurrying", "frantic", "frantically", "fast", "quick",
  // jump
  "jump", "jumps", "jumped", "jumping", "leap", "leaps", "leaped", "leaping", "hop", "hops", "hopping",
  "bounce", "bounces", "bouncing", "dive", "dives", "diving",
  // fall
  "fall", "falls", "fell", "falling", "trip", "trips", "slip", "slips", "slipped", "slipping",
  "drop", "drops", "dropped", "dropping", "crash", "crashes", "crashing", "tumble", "tumbles",
  "tumbling", "face-plant", "faceplant", "thud",
  // celebrate
  "win", "wins", "won", "winning", "celebrate", "celebrates", "celebrated", "celebrating",
  "celebration", "triumph", "triumphant", "success", "succeeds", "proud", "hooray", "hurray",
  "finally", "victory", "nailed it", "cheer", "cheers", "cheering",
  // think
  "think", "thinks", "thinking", "thought", "wonder", "wonders", "wondering", "why", "how", "maybe",
  "idea", "ideas", "question", "imagine", "imagines", "imagining", "what if", "suppose", "science", "research",
  // wave
  "hello", "hi", "hey", "wave", "waves", "waved", "waving", "greet", "greets", "greeting", "bye",
  "goodbye", "welcome", "meets", "meet",
  // point
  "look", "looks", "looked", "looking", "see", "sees", "saw", "seen", "watch", "watches", "watching",
  "notice", "notices", "point", "points", "pointing", "spot", "spots", "spotted", "appear", "appears",
  "eyes widen",
  // walk
  "walk", "walks", "walked", "walking", "step", "steps", "go", "went", "gone", "move", "moves",
  "moving", "travel", "travels", "traveling", "journey", "away",
  // cry
  "cry", "cries", "crying", "sob", "sobs", "sobbing", "tear", "tears", "tearful", "weep", "weeps",
  "weeping", "sad", "heartbroken", "upset", "depressed", "heart breaks", "heartbreak",
  // laugh
  "laugh", "laughs", "laughing", "giggle", "giggles", "giggling", "hilarious", "cracks up", "can't stop laughing",
  // eat
  "eat", "eats", "eating", "ate", "bite", "bites", "biting", "munch", "munching", "snack", "snacks",
  "taste", "tastes", "tasting", "hungry", "burger", "pizza",
  // drink
  "drink", "drinks", "drinking", "drank", "sip", "sips", "sipped", "sipping", "coffee", "tea", "juice",
  "lemonade", "soda", "thirsty", "gulps",
  // open
  "open", "opens", "opened", "opening", "unwrap", "unwraps", "unwrapping", "unbox", "lid", "reveal",
  "reveals", "revealed", "rips open", "tears open",
  // knock
  "knock", "knocks", "knocking", "knocked", "doorbell", "raps",
  // throw
  "throw", "throws", "threw", "throwing", "toss", "tosses", "tossing", "hurl", "hurls", "launch", "launches",
  // catch
  "catch", "catches", "caught", "catching", "grab", "grabs", "grabbing", "snatch", "snatches",
  "receive", "receives", "holds up",
  // carry
  "carry", "carries", "carrying", "carried", "hold", "holds", "holding", "hug", "hugs", "hugging",
  "cradle", "cradles", "embrace", "embraces",
  // push
  "push", "pushes", "pushing", "shove", "shoves", "pull", "pulls", "pulling", "drag", "drags", "dragging", "haul", "hauls",
  // climb
  "climb", "climbs", "climbing", "climbed", "scale", "scales", "stairs", "ladder", "mountain", "hill",
  // swim
  "swim", "swims", "swimming", "swam", "pool", "ocean", "sea", "beach", "waves at the beach",
  // sit
  "sit", "sits", "sitting", "sat", "sit down", "sits down", "sits at", "settle", "settles",
  // lie
  "lie", "lies", "lay", "lying", "sleep", "sleeps", "sleeping", "asleep", "nap", "naps", "napping",
  "bedtime", "snores", "snoring", "goes to bed", "goes to sleep",
  // bow
  "bow", "bows", "bowing", "bowed", "thank you", "thanks", "grateful", "gratitude",
  // stretch
  "stretch", "stretches", "stretching", "yawn", "yawns", "yawning", "wake up", "wakes up", "waking up",
  "gets up", "morning routine",
  // deliberate put-down
  "puts down", "put down", "put it down", "puts it down", "sets down", "set down", "sets it down",
  "set it down", "places", "placed", "placing",
]);

/** True when the scene text already maps to a built-in engine action. */
export function sceneHasKnownAction(text: string): boolean {
  const t = ` ${String(text).toLowerCase().replace(/[^a-z0-9 '-]/g, " ")} `;
  for (const k of KNOWN_ACTION_WORDS) {
    if (new RegExp(`\\b${k.replace(/[^a-z0-9 ']/g, ".")}\\b`, "i").test(t)) return true;
  }
  return false;
}

/* ── the skill document (sent to Gemini) ─────────────────────────────────── */

export const ANIM_SPEC = `You are a SENIOR ANIMATION PROGRAMMER for Zotomic's stick-figure video engine. You write character animations as KEYFRAME POSE DATA in a strict JSON DSL. Animations must look physically plausible and readable at small size.

## Coordinate system
- The figure's HIP is the origin (0,0). Positive Y is DOWN toward the ground; negative Y is up.
- The character stands about 230px tall: hip at y=0, shoulders at y=-62, head center at y=-98, standing FEET at y=+80.
- Angles are RADIANS. 0 = limb pointing straight DOWN. Positive angle swings the limb FORWARD (toward +x, the character's right/front). Negative swings it BACKWARD.

## Pose schema (all keys optional, defaults = standing pose)
{
  "lean": 0,        // torso lean, radians (-0.3 backward … 0.6 hunched forward)
  "rot": 0,         // whole-body rotation: 0 upright, ±1.5 lying flat, ±3.1 upside down
  "lift": 0,        // whole body raised off the ground in px (positive = airborne, -30 … +120)
  "head": 0,        // head tilt, radians (-0.5 up … 0.5 down/chin tucked)
  "sx": 1, "sy": 1, // squash & stretch (0.6 … 1.4)
  "armL": [-0.4, -0.25],  // [shoulderAngle, elbowBend] LEFT arm
  "armR": [0.4, 0.25],    // RIGHT arm (elbowBend is RELATIVE, added to shoulderAngle)
  "legL": [-0.12, -0.05], // [hipAngle, kneeBend] LEFT leg (kneeBend RELATIVE)
  "legR": [0.12, 0.05],   // RIGHT leg
  "mood": "smile",  // smile | grin | flat | sad | o (shocked) | think | talk | sleep
  "prop": "",       // optional scene prop forced into view: desk, bed, tree, couch, box, door, window, table, chair, car, ball, tv, plant, cup, book, phone, plate
  "holdIt": false,  // true = the mentioned object (gift box/ball/book/plate/cup/phone) is held IN the hands this keyframe
  "away": false,    // true = the held object has left the scene (thrown/opened)
  "seated": false,  // true = sitting/lying — hips attach to a seat prop (chair/couch/bed) or floor
  "fx": ""          // "" | "impact" (impact dust at the feet)
}

Arm/leg reach: upper arm 34 + forearm 32 = 66 max from the shoulder; thigh 40 + shin 40 = 80 max from the hip.

## Animation definition (what you output)
{ "slug": "ride-bike",              // kebab-case, unique, 2-4 words
  "keywords": ["rides a bike", "bikes", "cycling"],  // phrases the storyboard visual may use
  "loop": true,                     // true = cycle repeats every "cycle" seconds through the scene
  "cycle": 1.4,                     // seconds per loop (only when loop=true)
  "frames": [                       // 3-12 keyframes, u from 0 to 1
    { "u": 0.0, "pose": { "legL": [0.5, -0.9], "legR": [-0.4, 0.35], "lean": 0.12, "mood": "smile" } },
    { "u": 0.5, "pose": { "legL": [-0.4, 0.35], "legR": [0.5, -0.9], "lean": 0.12, "mood": "smile" } },
    { "u": 1.0, "pose": { "legL": [0.5, -0.9], "legR": [-0.4, 0.35], "lean": 0.12, "mood": "smile" } }
  ] }

## PROFESSIONAL RULES (breaking any = rejected)
1. PHYSICS: a standing character keeps both feet within y=+30…+95 (near the ground, hip at 0). Feet NEVER float above y=+20 unless the whole body is airborne (lift>30) or seated. Feet NEVER go below y=+110.
2. SMOOTHNESS: between consecutive keyframes, no joint may jump more than 1.8 radians. Big moves are broken into intermediate keyframes.
3. LOOPS: when loop=true, the LAST frame's pose must flow into the FIRST frame's pose (same smoothness rule) — cycle seamlessly.
4. READABILITY: exaggerate. Small screen, thick lines — a "pedaling" leg sweep of ±0.5 rad reads as nothing; use ±0.9+.
5. ONE action per animation, acting from the standing position (or seated pose when the scene says sit).
6. Use mood to sell the emotion. Use holdIt:true only when the scene text says the character carries/holds/throws/catches/eats/drinks the object.
7. NEVER invent keys, moods or props outside the lists above. Angles finite numbers only.

## Debugging worked example — REJECTED first draft
{ "frames": [ { "u": 0, "pose": { "legL": [1.2, -2.4], "legR": [-1.2, 2.4] } } ] }
Debug notes: kneeBend -2.4 rad = shin folded through the thigh (impossible); single keyframe = no motion; missing foot data check: foot y = 40*cos(1.2) + 40*cos(1.2-2.4) = 14.5 + 14.5 = 29 → feet floating at +29 while lift=0 → float violation. FIX: bend knees max ±1.3 rad, add intermediate frames, feet at +60…+90 mid-motion.`;

/* ── the pre-render debugger ─────────────────────────────────────────────── */

export interface AnimFrame {
  u: number;
  pose: Record<string, unknown>;
}
export interface AnimDef {
  slug: string;
  keywords: string[];
  loop: boolean;
  cycle?: number;
  frames: AnimFrame[];
}

const NUMERIC_POSE_KEYS = ["lean", "rot", "lift", "head", "sx", "sy"] as const;
const JOINT_KEYS = ["armL", "armR", "legL", "legR"] as const;
const MOODS = new Set(["smile", "grin", "flat", "sad", "o", "think", "talk", "sleep"]);
const PROPS = new Set([
  "desk", "bed", "tree", "couch", "box", "door", "window", "table", "chair",
  "car", "ball", "tv", "plant", "cup", "book", "phone", "plate",
]);
const POSE_KEYS = new Set([...NUMERIC_POSE_KEYS, ...JOINT_KEYS, "mood", "prop", "holdIt", "away", "seated", "fx"]);

const seg2 = (a1: number, a2: number, l1: number, l2: number): [number, number] => [
  Math.sin(a1) * l1 + Math.sin(a1 + a2) * l2,
  Math.cos(a1) * l1 + Math.cos(a1 + a2) * l2,
];

/** Compute every problem with an AI-written anim definition. Empty array = valid. */
export function validateAnimDef(def: unknown): string[] {
  const problems: string[] = [];
  if (!def || typeof def !== "object") return ["definition is not an object."];
  const d = def as Partial<AnimDef> & Record<string, unknown>;

  if (typeof d.slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug) || d.slug.length > 40) {
    problems.push("slug must be kebab-case, 2-40 chars.");
  }
  if (!Array.isArray(d.keywords) || d.keywords.length < 1 || d.keywords.length > 8) {
    problems.push("needs 1-8 keywords.");
  } else if (d.keywords.some((k) => typeof k !== "string" || k.length < 3 || k.length > 40)) {
    problems.push("each keyword must be 3-40 chars.");
  }
  if (typeof d.loop !== "boolean") problems.push("loop must be true or false.");
  if (d.loop && (typeof d.cycle !== "number" || !(d.cycle >= 0.4) || !(d.cycle <= 4))) {
    problems.push("loop=true needs cycle between 0.4 and 4 seconds.");
  }
  if (!Array.isArray(d.frames) || d.frames.length < 3 || d.frames.length > 14) {
    problems.push("needs 3-14 keyframes.");
    return problems; // can't check geometry without frames
  }

  let prevU = -1;
  let prevJoints: Record<string, number[]> | null = null;
  let prevNum: Record<string, number> = {};
  for (let i = 0; i < d.frames.length; i++) {
    const f = d.frames[i] as Partial<AnimFrame> & Record<string, unknown>;
    if (typeof f.u !== "number" || !Number.isFinite(f.u) || f.u <= prevU || f.u > 1) {
      problems.push(`frame ${i}: u must increase and stay within 0…1.`);
      continue;
    }
    prevU = f.u;
    if (!f.pose || typeof f.pose !== "object") {
      problems.push(`frame ${i}: missing pose.`);
      continue;
    }
    const pose = f.pose as Record<string, unknown>;

    for (const k of Object.keys(pose)) {
      if (!POSE_KEYS.has(k)) problems.push(`frame ${i}: unknown pose key "${k}".`);
    }
    for (const k of NUMERIC_POSE_KEYS) {
      const v = pose[k];
      if (v === undefined) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) { problems.push(`frame ${i}: ${k} must be a finite number.`); continue; }
      const lim: Record<string, [number, number]> = {
        lean: [-0.6, 1.2], rot: [-3.2, 3.2], lift: [-120, 160], head: [-0.6, 0.6], sx: [0.5, 1.6], sy: [0.5, 1.6],
      };
      const [lo, hi] = lim[k];
      if (v < lo || v > hi) problems.push(`frame ${i}: ${k}=${v} outside ${lo}…${hi}.`);
    }
    const joints: Record<string, number[]> = {};
    for (const k of JOINT_KEYS) {
      const v = pose[k];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
        problems.push(`frame ${i}: ${k} must be [angle, bend] finite numbers.`);
        continue;
      }
      if (Math.abs(v[0]) > 3.4 || Math.abs(v[1]) > 3.4) {
        problems.push(`frame ${i}: ${k} angles beyond ±3.4 rad — a joint folded through itself.`);
        continue;
      }
      joints[k] = v;
    }
    const mood = pose.mood;
    if (mood !== undefined && !MOODS.has(String(mood))) problems.push(`frame ${i}: unknown mood "${mood}".`);
    const prop = pose.prop;
    if (prop !== undefined && prop !== "" && !PROPS.has(String(prop))) problems.push(`frame ${i}: unknown prop "${prop}".`);
    for (const k of ["holdIt", "away", "seated"]) {
      const v = pose[k];
      if (v !== undefined && typeof v !== "boolean") problems.push(`frame ${i}: ${k} must be boolean.`);
    }
    if (pose.fx !== undefined && pose.fx !== "" && pose.fx !== "impact") problems.push(`frame ${i}: fx must be "" or "impact".`);

    // geometry: feet and hands where a body can put them
    const rot = typeof pose.rot === "number" ? pose.rot : 0;
    const seated = pose.seated === true;
    const lift = typeof pose.lift === "number" ? pose.lift : 0;
    for (const side of ["legL", "legR"] as const) {
      const v = joints[side];
      if (!v) continue;
      const [fx, fy] = seg2(v[0], v[1], 40, 40);
      if (Math.abs(rot) < 0.7 && !seated) {
        if (fy < 20 && lift <= 30) problems.push(`frame ${i}: ${side} foot floats at y=${fy.toFixed(0)} (feet must reach the ground y≈30…95 when standing).`);
        if (fy > 120) problems.push(`frame ${i}: ${side} foot pushes through the floor (y=${fy.toFixed(0)}).`);
      }
      if (Math.abs(fx) > 130) problems.push(`frame ${i}: ${side} foot stretches ${fx.toFixed(0)}px sideways — beyond leg reach.`);
    }
    for (const side of ["armL", "armR"] as const) {
      const v = joints[side];
      if (!v) continue;
      const [hx, hy] = seg2(v[0], v[1], 34, 32);
      if (Math.abs(hx) > 120 || hy < -140 || hy > 130) {
        problems.push(`frame ${i}: ${side} hand beyond arm reach (x=${hx.toFixed(0)}, y=${hy.toFixed(0)}).`);
      }
    }

    // smoothness vs the previous frame
    if (prevJoints) {
      for (const k of JOINT_KEYS) {
        const a = prevJoints[k];
        const b = joints[k];
        if (!a || !b) continue;
        for (let j = 0; j < 2; j++) {
          if (Math.abs(b[j] - a[j]) > 1.8) {
            problems.push(`frame ${i}: ${k}[${j}] jumps ${(b[j] - a[j]).toFixed(2)} rad from the previous frame (max 1.8) — teleporting limb.`);
          }
        }
      }
      for (const k of ["lean", "rot", "head"] as const) {
        if (prevNum[k] !== undefined && typeof pose[k] === "number") {
          if (Math.abs((pose[k] as number) - prevNum[k]) > 1.2) {
            problems.push(`frame ${i}: ${k} jumps ${((pose[k] as number) - prevNum[k]).toFixed(2)} rad — teleporting body.`);
          }
        }
      }
      if (prevNum.lift !== undefined && typeof pose.lift === "number") {
        if (Math.abs((pose.lift as number) - prevNum.lift) > 60) {
          problems.push(`frame ${i}: lift jumps ${(pose.lift as number) - prevNum.lift}px — teleporting body.`);
        }
      }
    }
    prevJoints = joints;
    prevNum = {};
    for (const k of NUMERIC_POSE_KEYS) {
      if (typeof pose[k] === "number") prevNum[k] = pose[k] as number;
    }
  }

  if (Array.isArray(d.frames) && d.frames.length >= 2) {
    const f0 = d.frames[0] as AnimFrame;
    if (f0.u !== 0) problems.push("first keyframe must be at u=0.");
    const fl = d.frames[d.frames.length - 1] as AnimFrame;
    if (fl.u !== 1) problems.push("last keyframe must be at u=1.");
  }
  // loop continuity: last pose must flow into the first
  if (d.loop && Array.isArray(d.frames) && d.frames.length >= 2) {
    const p0 = (d.frames[0].pose ?? {}) as Record<string, number[]>;
    const pl = (d.frames[d.frames.length - 1].pose ?? {}) as Record<string, number[]>;
    for (const k of JOINT_KEYS) {
      if (!Array.isArray(p0[k]) || !Array.isArray(pl[k])) continue;
      for (let j = 0; j < 2; j++) {
        if (Math.abs(pl[k][j] - p0[k][j]) > 1.0) {
          problems.push(`loop does not close: ${k}[${j}] differs by ${(pl[k][j] - p0[k][j]).toFixed(2)} rad between last and first frame.`);
        }
      }
    }
  }
  return problems;
}

export function slugify(text: string): string {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "anim"
  );
}

/* ── storyboard text parser (finds the scenes needing custom anims) ──────── */

export interface ParsedScene {
  title: string;
  visual: string;
  startClock: string;
}

/** Light parser for the storyboard text format ("0:00 - 0:08 | Title" + Visual line). */
export function parseStoryboardText(text: string): ParsedScene[] {
  const out: ParsedScene[] = [];
  const lines = String(text).split(/\r?\n/);
  let cur: ParsedScene | null = null;
  for (const line of lines) {
    const head = /^\s*(\d{1,2}:\d{2})\s*-\s*\d{1,2}:\d{2}\s*\|\s*(.+?)\s*$/.exec(line);
    if (head) {
      if (cur) out.push(cur);
      cur = { startClock: head[1], title: head[2], visual: "" };
      continue;
    }
    const vis = /^\s*Visual\s*:\s*(.+?)\s*$/i.exec(line);
    if (vis && cur) cur.visual = vis[1];
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.visual);
}
