/** Whole-line scene-break markers: "* * *", "***", "#", "# # #", "~~~", "---", "•••", "⁂", "§". */
const SCENE_BREAK = /^\s*(?:(?:\*\s*){3,}|(?:#\s*){1,3}|(?:~\s*){3,}|(?:-\s*){3,}|(?:•\s*){3,}|⁂|§)\s*$/u;

export function isSceneBreakLine(line: string): boolean {
  return SCENE_BREAK.test(line);
}
