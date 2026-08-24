import type { Expr } from "./index";

/** Safety ceiling against pathologically deep nesting from malformed input. */
export const MAX_DEPTH = 15;

type CodeExpr = Extract<Expr, { kind: "code" }>;

export interface CodeLeafWithParent {
  parent: Expr | null;
  leaf: CodeExpr;
}

/**
 * Walks an {@link Expr} tree and collects every `code` leaf with the node that
 * directly contains it. Top-level codes carry `parent: null`. Descends through
 * `and`, `or`, `soft`, and `flattened.subExpr`; `literal` and `flattened` text
 * carry no codes. Stops descending past {@link MAX_DEPTH} levels.
 */
export function walkCodeLeaves(expr: Expr | null): CodeLeafWithParent[] {
  const out: CodeLeafWithParent[] = [];
  if (!expr) return out;
  const visit = (node: Expr, parent: Expr | null, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    switch (node.kind) {
      case "code":
        out.push({ parent, leaf: node });
        return;
      case "literal":
        return;
      case "and":
      case "or":
        for (const child of node.children) visit(child, node, depth + 1);
        return;
      case "flattened":
        if (node.subExpr) visit(node.subExpr, node, depth + 1);
        return;
      case "soft":
        visit(node.child, node, depth + 1);
        return;
    }
  };
  visit(expr, null, 0);
  return out;
}
