import json
import os
import sys
import subprocess

def find_working_python():
    """
    If running under a Python interpreter that lacks faster-whisper (such as a system
    Python 3.14 on Windows), search for other local venvs or Python installations that do.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    candidates = [
        os.environ.get("PYTHON_PATH"),
        os.path.join(project_root, ".venv", "Scripts", "python.exe"),
        os.path.join(project_root, ".venv", "bin", "python"),
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
        # Avoid infinite re-spawning loop on the current interpreter
        if cand == sys.executable:
            continue
        try:
            res = subprocess.run(
                [cand, "-c", "import faster_whisper"],
                capture_output=True,
                timeout=5
            )
            if res.returncode == 0:
                return cand
        except Exception:
            continue
    return None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.isfile(audio_path):
        print(json.dumps({"error": "Audio file not found"}))
        sys.exit(1)

    WhisperModel = None
    use_openai_whisper = False

    try:
        from faster_whisper import WhisperModel as FWWhipserModel
        WhisperModel = FWWhipserModel
    except Exception:
        # Check if another Python interpreter in the workspace or system has faster_whisper
        alt_python = find_working_python()
        if alt_python:
            try:
                proc = subprocess.run(
                    [alt_python, os.path.abspath(__file__)] + sys.argv[1:],
                    capture_output=True,
                    text=True,
                    encoding="utf-8"
                )
                if proc.stdout:
                    print(proc.stdout.strip())
                elif proc.stderr:
                    print(json.dumps({"error": proc.stderr.strip()}))
                sys.exit(proc.returncode)
            except Exception as e:
                pass

        # Try standard openai whisper if installed
        try:
            import whisper
            use_openai_whisper = True
        except Exception:
            pass

    if WhisperModel is None and not use_openai_whisper:
        print(json.dumps({
            "error": "faster-whisper is not installed. Run 'pip install -r python/requirements.txt' to enable AI transcription.",
            "segments": []
        }))
        sys.exit(1)

    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")

        model_size = os.environ.get("WHISPER_MODEL", "base")
        rows = []
        detected_language = None

        if WhisperModel is not None:
            # Resilient compute type fallback for cloud/Render CPUs
            model = None
            for compute_type in ["int8", "default", "float32"]:
                try:
                    model = WhisperModel(model_size, device="cpu", compute_type=compute_type)
                    break
                except Exception:
                    continue

            if model is None:
                model = WhisperModel(model_size, device="cpu")

            segments, info = model.transcribe(
                audio_path,
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=400),
                word_timestamps=True,
            )
            detected_language = getattr(info, "language", None)

            for segment in segments:
                text = (segment.text or "").strip()
                if not text:
                    continue

                words = []
                if hasattr(segment, "words") and segment.words:
                    for w in segment.words:
                        words.append({
                            "word": w.word.strip(),
                            "start": round(float(w.start), 2),
                            "end": round(float(w.end), 2)
                        })

                rows.append({
                    "start": round(float(segment.start), 2),
                    "end": round(float(segment.end), 2),
                    "text": text,
                    "words": words
                })

        elif use_openai_whisper:
            import whisper
            whisper_model = whisper.load_model(model_size)
            result = whisper_model.transcribe(audio_path, word_timestamps=True)
            detected_language = result.get("language")

            for segment in result.get("segments", []):
                text = (segment.get("text") or "").strip()
                if not text:
                    continue

                words = []
                for w in segment.get("words", []):
                    words.append({
                        "word": (w.get("word") or "").strip(),
                        "start": round(float(w.get("start", 0)), 2),
                        "end": round(float(w.get("end", 0)), 2)
                    })

                rows.append({
                    "start": round(float(segment.get("start", 0)), 2),
                    "end": round(float(segment.get("end", 0)), 2),
                    "text": text,
                    "words": words
                })

        print(json.dumps({
            "success": True,
            "language": detected_language,
            "segments": rows
        }, ensure_ascii=False))

    except Exception as exc:
        print(json.dumps({"error": str(exc), "segments": []}))
        sys.exit(1)

if __name__ == "__main__":
    main()