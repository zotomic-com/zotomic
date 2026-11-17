/** Stick-figure cast — ids/colors mirror the engine's stickman.js.
 *  Shared by the video generator client and the AI storyboard writer. */
export interface CastMember {
  id: string;
  name: string;
  color: string;
  accessory: string;
}

export const CHARACTERS: CastMember[] = [
  { id: "spike", name: "Spike", color: "#1f2937", accessory: "none" },
  { id: "ruby", name: "Ruby", color: "#e11d48", accessory: "bow" },
  { id: "max", name: "Max", color: "#2563eb", accessory: "cap" },
  { id: "luna", name: "Luna", color: "#7c3aed", accessory: "ponytail" },
  { id: "ace", name: "Ace", color: "#059669", accessory: "headphones" },
  { id: "bella", name: "Bella", color: "#db2777", accessory: "glasses" },
  { id: "rocky", name: "Rocky", color: "#ea580c", accessory: "beanie" },
  { id: "zara", name: "Zara", color: "#0d9488", accessory: "bun" },
  { id: "nova", name: "Nova", color: "#f97316", accessory: "messy" },
  { id: "kai", name: "Kai", color: "#4f46e5", accessory: "curly" },
  { id: "mia", name: "Mia", color: "#ec4899", accessory: "bangs" },
  { id: "otto", name: "Otto", color: "#0ea5e9", accessory: "flat" },
];
