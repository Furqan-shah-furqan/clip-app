import json
import os
import sys

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.isfile(audio_path):
        print(json.dumps({"error": "Audio file not found"}))
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(json.dumps({"error": f"faster-whisper is not installed: {exc}"}))
        sys.exit(1)

    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")

        model_size = os.environ.get("WHISPER_MODEL", "small")
        model = WhisperModel(model_size, device="cpu", compute_type="int8")

        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            word_timestamps=False,
        )

        rows = []
        for segment in segments:
            text = (segment.text or "").strip()
            if not text:
                continue

            rows.append({
                "start": round(float(segment.start), 2),
                "end": round(float(segment.end), 2),
                "text": text,
            })

        print(json.dumps({
            "success": True,
            "language": getattr(info, "language", None),
            "segments": rows
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

if __name__ == "__main__":
    main()