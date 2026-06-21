"""Internal worker for the development-only coding subprocess."""
import ast
import contextlib
import io
import json
import sys

SAFE_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "enumerate": enumerate, "filter": filter, "float": float, "int": int,
    "len": len, "list": list, "map": map, "max": max, "min": min,
    "pow": pow, "print": print, "range": range, "reversed": reversed,
    "round": round, "set": set, "sorted": sorted, "str": str, "sum": sum,
    "tuple": tuple, "zip": zip, "Exception": Exception,
    "ValueError": ValueError, "TypeError": TypeError, "RuntimeError": RuntimeError,
}


def display(value):
    return repr(value) if isinstance(value, (str, bytes)) else str(value)


def expected_value(value):
    try:
        return ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return value


def error_details(error):
    error_type = type(error).__name__
    message = f"{error_type}: {error}"
    if isinstance(error, IndentationError):
        message = "IndentationError: check spaces/tabs and block indentation."
    elif isinstance(error, SyntaxError) and error.lineno:
        message = f"SyntaxError: line {error.lineno}: {error.msg}"
    return error_type, message


def main():
    request = json.loads(open(sys.argv[1], encoding="utf-8").read())
    namespace = {"__builtins__": SAFE_BUILTINS}
    output = io.StringIO()
    results = []
    try:
        with contextlib.redirect_stdout(output):
            exec(compile(request["code"], "submission.py", "exec"), namespace, namespace)
    except BaseException as error:
        error_type, message = error_details(error)
        return {"success": False, "stdout": output.getvalue(), "stderr": message, "error_type": error_type, "test_case_results": []}

    overall_error = None
    for index, case in enumerate(request["test_cases"], start=1):
        case_output = io.StringIO()
        actual = None
        passed = False
        error_message = None
        try:
            with contextlib.redirect_stdout(case_output):
                actual_value = eval(compile(case["input"], f"visible_case_{index}", "eval"), namespace, namespace)
            actual = display(actual_value)
            passed = actual_value == expected_value(case["expected"])
        except BaseException as error:
            error_type, error_message = error_details(error)
            overall_error = overall_error or (error_type, error_message)
        results.append({
            "index": index, "input": case["input"], "expected": case["expected"],
            "actual": actual, "passed": passed, "stdout": case_output.getvalue(),
            "error": error_message,
        })
    combined_stdout = output.getvalue() + "".join(item["stdout"] for item in results)
    return {
        "success": all(item["passed"] for item in results),
        "stdout": combined_stdout, "stderr": overall_error[1] if overall_error else "",
        "error_type": overall_error[0] if overall_error else None,
        "test_case_results": results,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except BaseException as error:
        print(json.dumps({"success": False, "stdout": "", "stderr": "RuntimeError: runner failed", "error_type": "RuntimeError", "test_case_results": []}))
