import ast
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from fastapi import HTTPException

RUN_TIMEOUT_SECONDS = 3
WORKER_PATH = Path(__file__).resolve().parent / "coding_worker.py"
BLOCKED_MODULES = {"os", "sys", "subprocess", "pathlib", "shutil", "socket", "requests"}
BLOCKED_CALLS = {
    "open", "eval", "exec", "compile", "__import__", "input",
    "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr",
    "breakpoint", "help", "exit", "quit",
}


class SafetyValidator(ast.NodeVisitor):
    def visit_Import(self, node):
        modules = ", ".join(alias.name for alias in node.names)
        raise ValueError(f"Imports are not allowed: {modules}")

    def visit_ImportFrom(self, node):
        raise ValueError(f"Imports are not allowed: {node.module or ''}")

    def visit_Name(self, node):
        if node.id in BLOCKED_MODULES or node.id in BLOCKED_CALLS or node.id.startswith("__"):
            raise ValueError(f"Use of '{node.id}' is not allowed")
        self.generic_visit(node)

    def visit_Attribute(self, node):
        if node.attr.startswith("__"):
            raise ValueError("Dunder attribute access is not allowed")
        self.generic_visit(node)

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id in BLOCKED_CALLS:
            raise ValueError(f"Use of '{node.func.id}' is not allowed")
        self.generic_visit(node)


def syntax_error_result(error: SyntaxError, elapsed_ms: int = 0):
    error_type = "IndentationError" if isinstance(error, IndentationError) else "SyntaxError"
    if error_type == "IndentationError":
        message = "IndentationError: check spaces/tabs and block indentation."
    else:
        message = "SyntaxError"
    if error.lineno:
        message += f" Line {error.lineno}: {error.msg}"
    return {
        "success": False, "stdout": "", "stderr": message,
        "error_type": error_type, "test_case_results": [],
        "execution_time_ms": elapsed_ms,
    }


def validate_source(source: str, mode: str = "exec"):
    try:
        tree = ast.parse(source, mode=mode)
    except (SyntaxError, IndentationError) as error:
        return error
    try:
        SafetyValidator().visit(tree)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return None


def parse_visible_test_cases(raw: str | None) -> list[dict]:
    if not raw or not raw.strip():
        return []
    lines = raw.replace("\r\n", "\n").split("\n")
    cases = []
    current = None
    collecting_expected = False
    for line in lines:
        stripped = line.strip()
        lowered = stripped.casefold()
        if lowered.startswith("input:"):
            if current and current.get("input"):
                cases.append(current)
            current = {"input": stripped.split(":", 1)[1].strip(), "expected": ""}
            collecting_expected = False
        elif current and (lowered.startswith("expected:") or lowered.startswith("output:")):
            current["expected"] = stripped.split(":", 1)[1].strip()
            collecting_expected = True
        elif current and stripped:
            key = "expected" if collecting_expected else "input"
            current[key] = f"{current[key]}\n{stripped}".strip()
    if current and current.get("input"):
        cases.append(current)
    if not cases:
        raise HTTPException(400, "Visible test cases must use Input: and Expected: lines")
    for case in cases:
        if not case["expected"]:
            raise HTTPException(400, "Every visible test case must include Expected: output")
        error = validate_source(case["input"], mode="eval")
        if error:
            raise HTTPException(400, f"Invalid visible test expression: {error.msg}")
    return cases


def run_python_code(code: str, visible_test_cases: str | None):
    started = time.perf_counter()
    syntax_error = validate_source(code)
    if syntax_error:
        return syntax_error_result(syntax_error, int((time.perf_counter() - started) * 1000))
    cases = parse_visible_test_cases(visible_test_cases)
    request = {"code": code, "test_cases": cases}

    # DEVELOPMENT ONLY: a subprocess timeout is not a production-grade sandbox.
    # Production execution must use Docker, Firecracker, or an equivalent isolated runner.
    with tempfile.TemporaryDirectory(prefix="classnest-code-") as directory:
        request_path = Path(directory) / "request.json"
        request_path.write_text(json.dumps(request), encoding="utf-8")
        command = [sys.executable, "-I", "-S", str(WORKER_PATH), str(request_path)]
        creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        try:
            completed = subprocess.run(
                command, cwd=directory, stdin=subprocess.DEVNULL,
                capture_output=True, text=True, timeout=RUN_TIMEOUT_SECONDS,
                shell=False, creationflags=creation_flags,
            )
        except subprocess.TimeoutExpired:
            return {
                "success": False, "stdout": "",
                "stderr": "TimeoutError: code exceeded the 3 second execution limit.",
                "error_type": "TimeoutError", "test_case_results": [],
                "execution_time_ms": RUN_TIMEOUT_SECONDS * 1000,
            }
    elapsed = int((time.perf_counter() - started) * 1000)
    if completed.returncode != 0:
        return {
            "success": False, "stdout": "", "stderr": completed.stderr.strip() or "RuntimeError: runner failed",
            "error_type": "RuntimeError", "test_case_results": [], "execution_time_ms": elapsed,
        }
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {
            "success": False, "stdout": "", "stderr": "RuntimeError: invalid runner response",
            "error_type": "RuntimeError", "test_case_results": [], "execution_time_ms": elapsed,
        }
    result["execution_time_ms"] = elapsed
    return result
