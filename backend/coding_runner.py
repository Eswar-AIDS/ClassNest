import ast
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from fastapi import HTTPException

RUN_TIMEOUT_SECONDS = 3
MAX_OUTPUT_CHARS = 12000
WORKER_PATH = Path(__file__).resolve().parent / "coding_worker.py"
TEST_CASE_FORMAT_ERROR = (
    "Invalid test case format. Use either:\n"
    "Input: square(3)\n"
    "Expected: 9\n"
    "or\n"
    "square(3) -> 9"
)
BLOCKED_MODULES = {"os", "sys", "subprocess", "pathlib", "shutil", "socket", "requests"}
BLOCKED_CALLS = {
    "open", "eval", "exec", "compile", "__import__", "input",
    "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr",
    "breakpoint", "help", "exit", "quit",
}


def limit_output(value: str | None):
    value = value or ""
    if len(value) <= MAX_OUTPUT_CHARS:
        return value
    return value[:MAX_OUTPUT_CHARS] + f"\n... output truncated to {MAX_OUTPUT_CHARS} characters ..."


class SafetyValidator(ast.NodeVisitor):
    def visit_Import(self, node):
        modules = ", ".join(alias.name for alias in node.names)
        raise ValueError(f"Blocked unsafe code pattern: import {modules}")

    def visit_ImportFrom(self, node):
        raise ValueError(f"Blocked unsafe code pattern: import from {node.module or ''}")

    def visit_While(self, node):
        if isinstance(node.test, ast.Constant) and node.test.value is True:
            raise ValueError("Blocked unsafe code pattern: while True")
        self.generic_visit(node)

    def visit_Name(self, node):
        if node.id in BLOCKED_MODULES or node.id in BLOCKED_CALLS or node.id.startswith("__"):
            raise ValueError(f"Blocked unsafe code pattern: {node.id}")
        self.generic_visit(node)

    def visit_Attribute(self, node):
        if node.attr.startswith("__"):
            raise ValueError("Blocked unsafe code pattern: dunder attribute access")
        self.generic_visit(node)

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id in BLOCKED_CALLS:
            raise ValueError(f"Blocked unsafe code pattern: {node.func.id}(")
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
    lines = [line.strip() for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    cases = []
    current = None
    collecting_expected = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        lowered = stripped.casefold()
        if "->" in stripped and not lowered.startswith(("input:", "expected:", "output:")):
            expression, expected = stripped.split("->", 1)
            expression = expression.strip()
            expected = expected.strip()
            if not expression or not expected:
                raise HTTPException(400, TEST_CASE_FORMAT_ERROR)
            if current and current.get("input"):
                cases.append(current)
                current = None
            cases.append({"input": expression, "expected": expected})
            collecting_expected = False
            continue
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
        else:
            raise HTTPException(400, TEST_CASE_FORMAT_ERROR)
    if current and current.get("input"):
        cases.append(current)
    if not cases:
        raise HTTPException(400, TEST_CASE_FORMAT_ERROR)
    for case in cases:
        if not case["expected"]:
            raise HTTPException(400, TEST_CASE_FORMAT_ERROR)
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
            "success": False, "stdout": "", "stderr": limit_output(completed.stderr.strip() or "RuntimeError: runner failed"),
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
    result["stdout"] = limit_output(result.get("stdout"))
    result["stderr"] = limit_output(result.get("stderr"))
    for case in result.get("test_case_results", []):
        case["stdout"] = limit_output(case.get("stdout"))
        if case.get("error"):
            case["error"] = limit_output(case.get("error"))
    return result


def run_python_script(code: str):
    started = time.perf_counter()
    elapsed_ms = lambda: int((time.perf_counter() - started) * 1000)
    try:
        syntax_error = validate_source(code)
    except HTTPException as error:
        return {
            "status": "error",
            "stdout": "",
            "stderr": str(error.detail),
            "execution_time_ms": elapsed_ms(),
        }
    if syntax_error:
        result = syntax_error_result(syntax_error, elapsed_ms())
        return {
            "status": "error",
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "execution_time_ms": result["execution_time_ms"],
        }

    # TODO: For production, replace this development runner with a containerized
    # sandbox or Judge0-style isolated execution service.
    with tempfile.TemporaryDirectory(prefix="classnest-code-") as directory:
        script_path = Path(directory) / "main.py"
        script_path.write_text(code, encoding="utf-8")
        command = [sys.executable, "-I", "-S", str(script_path)]
        creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        try:
            completed = subprocess.run(
                command,
                cwd=directory,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=RUN_TIMEOUT_SECONDS,
                shell=False,
                creationflags=creation_flags,
            )
        except subprocess.TimeoutExpired:
            return {
                "status": "timeout",
                "stdout": "",
                "stderr": "Execution timed out.",
                "execution_time_ms": RUN_TIMEOUT_SECONDS * 1000,
            }
    return {
        "status": "completed" if completed.returncode == 0 else "error",
        "stdout": limit_output(completed.stdout),
        "stderr": limit_output(completed.stderr),
        "execution_time_ms": elapsed_ms(),
    }
