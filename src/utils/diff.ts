// Word-level diff (LCS) used to highlight what a rewrite added. Small inputs only;
// prompts are a few hundred tokens, so an O(n·m) table is fine.

export interface DiffOp {
  type: 'same' | 'add' | 'del';
  text: string;
}

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Whitespace runs compare equal to each other so reflowed text does not light up. */
function key(token: string): string {
  return /^\s+$/.test(token) ? ' ' : token;
}

export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return [{ type: 'same', text: after }];

  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        key(a[i]!) === key(b[j]!)
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]!) === key(b[j]!)) {
      push('same', b[j]!);
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) {
      push('del', a[i]!);
      i++;
    } else {
      push('add', b[j]!);
      j++;
    }
  }
  while (i < n) push('del', a[i++]!);
  while (j < m) push('add', b[j++]!);
  return ops;
}

/** Share of the rewritten text that is new, 0..1. */
export function addedShare(ops: DiffOp[]): number {
  let added = 0;
  let total = 0;
  for (const op of ops) {
    if (op.type === 'del') continue;
    total += op.text.length;
    if (op.type === 'add') added += op.text.length;
  }
  return total === 0 ? 0 : added / total;
}
