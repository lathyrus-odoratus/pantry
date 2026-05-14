// Tabletop dice notation: `[N]d{2|3|4|6|8|10|12|20|100}[±K]`.
// N defaults to 1; modifier K is optional, bounded to |999|. N is capped at
// 20 so a chat-line dice spam doesn't generate a wall of numbers.

const ALLOWED_SIDES = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100]);
const MAX_COUNT = 20;
const MAX_MODIFIER = 999;

export type Dice = {
  count: number;
  sides: number;
  modifier: number;
};

export type RollResult = {
  rolls: number[];
  total: number;
};

const EXPR_RE = /^(\d+)?d(\d+)(?:([+-])(\d+))?$/i;

export function parseDiceExpression(input: string): Dice | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = EXPR_RE.exec(trimmed);
  if (!m) return null;
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2]!, 10);
  const sign = m[3] === "-" ? -1 : 1;
  const magnitude = m[4] ? parseInt(m[4], 10) : 0;
  const modifier = sign * magnitude;
  if (count < 1 || count > MAX_COUNT) return null;
  if (!ALLOWED_SIDES.has(sides)) return null;
  if (Math.abs(modifier) > MAX_MODIFIER) return null;
  return { count, sides, modifier };
}

export function rollDice(d: Dice): RollResult {
  const rolls: number[] = [];
  let sum = 0;
  for (let i = 0; i < d.count; i++) {
    const r = 1 + Math.floor(Math.random() * d.sides);
    rolls.push(r);
    sum += r;
  }
  return { rolls, total: sum + d.modifier };
}

function formatExpression(d: Dice): string {
  const countPart = d.count === 1 ? "" : String(d.count);
  const modifierPart =
    d.modifier === 0
      ? ""
      : d.modifier > 0
        ? `+${d.modifier}`
        : `${d.modifier}`;
  return `${countPart}d${d.sides}${modifierPart}`;
}

export function formatRoll(
  authorLabel: string,
  d: Dice,
  r: RollResult,
): string {
  const expr = formatExpression(d);
  if (d.count === 1 && d.modifier === 0) {
    return `🎲 ${authorLabel} rolled ${expr} → ${r.rolls[0]}`;
  }
  const rollsPart = d.count === 1 ? `${r.rolls[0]}` : `[${r.rolls.join(", ")}]`;
  if (d.modifier === 0) {
    return `🎲 ${authorLabel} rolled ${expr} → ${rollsPart} = ${r.total}`;
  }
  const modSign = d.modifier > 0 ? "+" : "-";
  const modAbs = Math.abs(d.modifier);
  return `🎲 ${authorLabel} rolled ${expr} → ${rollsPart} ${modSign} ${modAbs} = ${r.total}`;
}
