"""Papyrus formula evaluation service."""

from __future__ import annotations

import ast
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

ResolveRefCallable = Callable[[str], Awaitable[Any]]


async def evaluate_formula_expression(
    *,
    db: AsyncSession,
    entity_id: UUID,
    expression: str,
    rendered_refs: dict[str, Any] | None = None,
    resolve_ref: ResolveRefCallable,
) -> Any:
    """Evaluate a safe subset of Papyrus formula expressions.

    The service stays intentionally conservative and only supports a controlled
    subset of operators and spreadsheet-like functions.
    """

    rendered_refs = rendered_refs or {}
    runtime = _FormulaRuntime(
        db=db,
        entity_id=entity_id,
        rendered_refs=rendered_refs,
        resolve_ref=resolve_ref,
    )
    tree = ast.parse(expression, mode="eval")
    return await runtime.eval(tree.body)


class _FormulaRuntime:
    def __init__(
        self,
        *,
        db: AsyncSession,
        entity_id: UUID,
        rendered_refs: dict[str, Any],
        resolve_ref: ResolveRefCallable,
    ) -> None:
        self.db = db
        self.entity_id = entity_id
        self.rendered_refs = rendered_refs
        self.resolve_ref = resolve_ref

    async def eval(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            return node.value

        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -(await self.eval(node.operand))

        if isinstance(node, ast.BoolOp):
            values = [await self.eval(value) for value in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
            raise ValueError("Unsupported boolean operator")

        if isinstance(node, ast.BinOp):
            left = await self.eval(node.left)
            right = await self.eval(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.Mod):
                return left % right
            raise ValueError("Unsupported binary operator")

        if isinstance(node, ast.Compare) and len(node.ops) == 1 and len(node.comparators) == 1:
            left = await self.eval(node.left)
            right = await self.eval(node.comparators[0])
            op = node.ops[0]
            if isinstance(op, ast.Eq):
                return left == right
            if isinstance(op, ast.NotEq):
                return left != right
            if isinstance(op, ast.Gt):
                return left > right
            if isinstance(op, ast.GtE):
                return left >= right
            if isinstance(op, ast.Lt):
                return left < right
            if isinstance(op, ast.LtE):
                return left <= right
            raise ValueError("Unsupported comparison operator")

        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            func_name = node.func.id.upper()
            args = [await self.eval(arg) for arg in node.args]
            return await self._call(func_name, args)

        raise ValueError("Unsupported formula expression")

    async def _call(self, func_name: str, args: list[Any]) -> Any:
        if func_name == "SUM":
            values = _flatten(args)
            return sum(v for v in values if isinstance(v, (int, float)))
        if func_name == "MIN":
            values = [v for v in _flatten(args) if isinstance(v, (int, float))]
            return min(values) if values else None
        if func_name == "MAX":
            values = [v for v in _flatten(args) if isinstance(v, (int, float))]
            return max(values) if values else None
        if func_name == "AVG":
            values = [v for v in _flatten(args) if isinstance(v, (int, float))]
            return (sum(values) / len(values)) if values else None
        if func_name == "COUNT":
            values = _flatten(args)
            return len([v for v in values if v is not None])
        if func_name == "ABS":
            return abs(args[0])
        if func_name == "ROUND":
            if len(args) == 1:
                return round(args[0])
            return round(args[0], int(args[1]))
        if func_name == "IF":
            if len(args) < 2:
                raise ValueError("IF expects at least 2 arguments")
            return args[1] if args[0] else (args[2] if len(args) > 2 else None)
        if func_name == "COALESCE":
            for arg in args:
                if arg not in (None, ""):
                    return arg
            return None
        if func_name == "REF":
            ref = args[0]
            if not isinstance(ref, str):
                raise ValueError("REF expects a string URI")
            return await self._resolve_formula_ref(ref)
        raise ValueError(f"Unsupported function {func_name}")

    async def _resolve_formula_ref(self, ref: str) -> Any:
        if ref not in self.rendered_refs:
            self.rendered_refs[ref] = await self.resolve_ref(ref)
        return self.rendered_refs[ref]


def _flatten(values: list[Any]) -> list[Any]:
    flattened: list[Any] = []
    for value in values:
        if isinstance(value, list):
            flattened.extend(_flatten(value))
        else:
            flattened.append(value)
    return flattened
