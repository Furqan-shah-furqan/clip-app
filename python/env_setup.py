import os
import sys
import shutil
import subprocess
from pathlib import Path

def setup_environment():
    """
    Prepend local bin directory (FFmpeg, ffprobe, yt-dlp) to PATH and configure UTF-8 output.
    """
    project_root = Path(__file__).resolve().parent.parent
    bin_dir = project_root / "bin"
    if bin_dir.exists():
        bin_str = str(bin_dir)
        current_path = os.environ.get("PATH", "")
        if bin_str not in current_path:
            os.environ["PATH"] = bin_str + os.pathsep + current_path

    # Support explicit FFMPEG_PATH if provided
    ffmpeg_env = os.environ.get("FFMPEG_PATH")
    if ffmpeg_env and os.path.isfile(ffmpeg_env):
        ffmpeg_dir = str(Path(ffmpeg_env).parent)
        current_path = os.environ.get("PATH", "")
        if ffmpeg_dir not in current_path:
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path

    # Ensure UTF-8 stdout / stderr
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if hasattr(sys.stderr, "reconfigure"):
        try:
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

def get_ffmpeg_cmd():
    """
    Find the best available ffmpeg binary across Windows, Docker, and Linux.
    """
    if os.environ.get("FFMPEG_PATH") and (shutil.which(os.environ["FFMPEG_PATH"]) or os.path.isfile(os.environ["FFMPEG_PATH"])):
        return os.environ["FFMPEG_PATH"]

    project_root = Path(__file__).resolve().parent.parent
    win_bin = project_root / "bin" / "ffmpeg.exe"
    if win_bin.exists():
        return str(win_bin)

    linux_bin = project_root / "bin" / "ffmpeg"
    if linux_bin.exists():
        return str(linux_bin)

    return shutil.which("ffmpeg") or "ffmpeg"

def _has_site_packages_module(cand_path, module_name):
    """
    Quick filesystem check for a module in a virtualenv or python install directory.
    """
    try:
        p = Path(cand_path).resolve()
        base = p.parent.parent  # e.g. .venv or Python311
        for sp in [base / "Lib" / "site-packages", base / "lib" / "site-packages"]:
            if (sp / module_name).is_dir() or (sp / f"{module_name}.py").is_file():
                return True
        for sub in base.glob("lib/python*/site-packages"):
            if (sub / module_name).is_dir() or (sub / f"{module_name}.py").is_file():
                return True
    except Exception:
        pass
    return False

def find_working_python(required_modules=None):
    """
    Search candidate Python interpreters for one that has all required modules installed.
    """
    if required_modules is None:
        required_modules = ["faster_whisper"]

    project_root = Path(__file__).resolve().parent.parent
    candidates = [
        os.environ.get("PYTHON_PATH"),
        str(project_root / ".venv" / "Scripts" / "python.exe"),
        str(project_root / ".venv" / "bin" / "python"),
        "/app/.venv/bin/python",
        r"C:\Users\xpert computers\AppData\Local\Programs\Python\Python311\python.exe",
        r"C:\Users\xpert computers\AppData\Local\Programs\Python\Python312\python.exe",
        "python3",
        "python"
    ]

    for cand in candidates:
        if not cand:
            continue
        if os.path.isabs(cand) and not os.path.isfile(cand):
            continue
        if cand == sys.executable:
            continue

        # Fast filesystem check for virtualenvs
        if os.path.isabs(cand) and os.path.isfile(cand):
            if all(_has_site_packages_module(cand, m) for m in required_modules):
                return cand

        # Fallback to subprocess verification with reasonable timeout
        try:
            import_check = "; ".join(f"import {m}" for m in required_modules)
            res = subprocess.run(
                [cand, "-c", import_check],
                capture_output=True,
                timeout=25
            )
            if res.returncode == 0:
                return cand
        except Exception:
            continue

    return None

def ensure_runtime(required_modules=None):
    """
    If running under an interpreter missing any required module (e.g. system Python 3.14 on Windows),
    transparently re-execute the current script with a working Python interpreter.
    """
    setup_environment()

    if not required_modules:
        return

    missing = []
    for mod in required_modules:
        try:
            __import__(mod)
        except Exception:
            missing.append(mod)

    if not missing:
        return

    alt_python = find_working_python(required_modules)
    if alt_python:
        try:
            proc = subprocess.run(
                [alt_python, os.path.abspath(sys.argv[0])] + sys.argv[1:],
                check=False
            )
            sys.exit(proc.returncode)
        except Exception:
            pass
