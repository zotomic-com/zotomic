/**
 * Minimal typings for `unicode2ascii` (no bundled .d.ts).
 * It converts between Bengali Unicode and Bijoy ANSI / SutonnyMJ text.
 */
declare module "unicode2ascii" {
  export function ConvertToASCII(font: "bijoy", text: string): string;
  export function ConvertToUnicode(font: "bijoy", text: string): string;
}
