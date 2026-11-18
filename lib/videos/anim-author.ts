/**
 * AI ANIMATION PROGRAMMER (server-only).
 *
 * When a storyboard scene needs an action the engine doesn't know, Gemini
 * writes a keyframe animation (see lib/videos/anim-dsl.ts — the skill doc),
 * and every animation is DEBUGGED with validateAnimDef() before it may render.
 * Failed animations get one automatic repair pass with the exact problems.
 *
 * write-once-verify-once: usable anims are saved to the anim_library table as
 * "pending" and render the current video; only admin approval turns them into
 * permanent library entries (see /admin/services/anims).
 *
 * Plan gate: free plans only ever use APPROVED library animations — they
 * never trigger Gemini authoring. Paid plans and admins can author new ones.
 */
import "server-only";
import { geminiJson } from "./storyboard";
import { ANIM_SPEC, KNOWN_ACTION_WORDS, sceneHasKnownAction, validateAnimDef, slugify, type AnimDef, type ParsedScene } from "./anim-dsl";

export interface SceneAnim {
  slug: string;
  keywords: string[];
  loop: boolean;
  cycle?: number;
  frames: { u: number; pose: Record<string, unknown> }[];
  /** which scene (by index in the storyboard text) this anim was written for */
  sceneIndex: number;
}

function authorPrompt(scene: ParsedScene, characterName: string, extra: string): string {
  return `${ANIM_SPEC}

## YOUR TASK
Write ONE animation for this storyboard scene:

Scene title: "${scene.title}"
Visual action: "${scene.visual}"
Main character: "${characterName}" (a stick figure)

${extra}

Return ONLY the JSON animation definition (slug, keywords, loop, cycle, frames). The "keywords" must include the action phrases a storyboard Visual line would use for this motion (3-6 phrases). Output ONLY the JSON object, no markdown.`;
}

/** Extract validated AnimDef objects from a Gemini reply. */
function extractAnims(parsed: unknown): AnimDef[] {
  const arr = (parsed as { anim?: unknown; animation?: unknown })?.anim ?? (parsed as { animation?: unknown })?.animation ?? parsed;
  const list = Array.isArray(arr) ? arr : [arr];
  return list.filter((d) => d && typeof d === "object" && Array.isArray((d as AnimDef).frames)) as AnimDef[];
}

/**
 * Resolve custom animations for storyboard scenes the engine can't act out.
 * Returns anims ready to hand to the engine (engine matches them to scenes by
 * keywords), plus a report of what was authored / rejected.
 */
export async function authorAnims(input: {
  scenes: ParsedScene[];
  characterName?: string;
  /** plan gate: authoring only for paid plans and admins */
  canAuthor: boolean;
}): Promise<{ anims: SceneAnim[]; authored: number; rejected: string[] }> {
  const characterName = (input.characterName || "the main character").slice(0, 24);

  // 1. which scenes need a custom animation?
  const gaps = input.scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.visual && !sceneHasKnownAction(`${s.title} ${s.visual}`))
    .slice(0, 4); // cap the Gemini cost per video
  if (!gaps.length) return { anims: [], authored: 0, rejected: [] };

  if (!input.canAuthor) {
    // free plan: fall back to the engine's built-in actions (current behavior)
    return { anims: [], authored: 0, rejected: [] };
  }

  // 2. one Gemini call writes ALL missing animations (batched = one quota hit)
  const batchPrompt = `${ANIM_SPEC}

## YOUR TASK
Write ONE animation per storyboard scene listed below (a professional animation pass — the same quality bar as a game studio's keyframe work).

Main character: "${characterName}"

SCENES:
${gaps.map(({ s }, n) => `${n + 1}. title: "${s.title}" | visual: "${s.visual}"`).join("\n")}

Return ONLY JSON in this exact shape:
{ "anims": [ { "slug": "...", "keywords": ["..."], "loop": false, "cycle": null, "frames": [ { "u": 0, "pose": { ... } } ] } ] }
One entry per scene, in order. Output ONLY the JSON object, no markdown.`;

  const first = await geminiJson([{ text: batchPrompt }], 8192);
  if ("error" in first) return { anims: [], authored: 0, rejected: gaps.map((g) => g.s.visual) };

  // 3. DEBUG every animation before it may render
  const rejected: string[] = [];
  const anims: SceneAnim[] = [];
  let draft = extractAnims(first.parsed);
  const problemsByIndex: string[] = [];
  draft.forEach((d, n) => problemsByIndex.push(...validateAnimDef(d).map((p) => `anim ${n + 1}: ${p}`)));
  if (draft.length < gaps.length) problemsByIndex.push(`only ${draft.length} anims for ${gaps.length} scenes — write one per scene.`);

  // 4. one repair pass with the exact debug output
  if (problemsByIndex.length) {
    const repair = await geminiJson(
      [
        { text: batchPrompt },
        {
          text: `Your animations failed the pre-render debugger. Fix ONLY these problems and return the corrected JSON:\n- ${problemsByIndex.join("\n- ")}\n\nPrevious draft:\n${JSON.stringify(
            draft.slice(0, 4).map((d) => ({ ...d, frames: d.frames.slice(0, 8) })),
          )}`,
        },
      ],
      8192,
    );
    if (!("error" in repair)) {
      const fixed = extractAnims(repair.parsed);
      const fixedProblems: string[] = [];
      fixed.forEach((d, n) => fixedProblems.push(...validateAnimDef(d).map((p) => `anim ${n + 1}: ${p}`)));
      if (fixed.length && fixedProblems.length <= problemsByIndex.length) {
        draft = fixed;
        problemsByIndex.length = 0;
        fixedProblems.forEach((p) => problemsByIndex.push(p));
      }
    }
  }

  // 5. keep the clean ones; report the rest as rejected (they fall back to
  //    the engine's built-in actions this render — nothing broken ships)
  const seenSlugs = new Set<string>();
  draft.slice(0, gaps.length).forEach((d, n) => {
    const problems = validateAnimDef(d);
    const visual = gaps[n]?.s.visual ?? "";
    if (problems.length) {
      rejected.push(`${visual} (${problems[0]})`);
      return;
    }
    if (seenSlugs.has(d.slug)) return;
    seenSlugs.add(d.slug);
    anims.push({
      slug: d.slug,
      keywords: (d.keywords ?? []).map((k) => String(k).toLowerCase().slice(0, 40)),
      loop: !!d.loop,
      cycle: d.loop ? d.cycle : undefined,
      frames: d.frames.map((f) => ({ u: f.u, pose: f.pose })),
      sceneIndex: gaps[n].i,
    });
  });
  if (!anims.length && !rejected.length) rejected.push(...gaps.map((g) => g.s.visual));

  return { anims, authored: anims.length, rejected };
}

/** Ensure the slug is unique against a set of already used slugs. */
export function uniqueSlug(base: string, used: Set<string>): string {
  let slug = slugify(base);
  let n = 2;
  while (used.has(slug)) slug = `${slugify(base)}-${n++}`;
  return slug;
}

export { KNOWN_ACTION_WORDS };
