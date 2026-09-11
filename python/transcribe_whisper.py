import json
import os
import sys
import subprocess

try:
    from env_setup import ensure_runtime
    ensure_runtime(["faster_whisper"])
except ImportError:
    pass

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