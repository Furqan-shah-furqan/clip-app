import os
import sys
import json
from pathlib import Path

from faster_whisper import WhisperModel


def format_vtt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0

    total_ms = int(round(seconds * 1000))
    hours = total_ms // 3600000
    minutes = (total_ms % 3600000) // 60000
    secs = (total_ms % 60000) // 1000
    ms = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def write_vtt(segments, output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")

        for i, segment in enumerate(segments, start=1):
            text = (segment.text or "").strip()
            if not text:
                continue

            start = format_vtt_time(segment.start)
            end = format_vtt_time(segment.end)

            f.write(f"{i}\n")
            f.write(f"{start} --> {end}\n")
            f.write(f"{text}\n\n")


def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: python preview_captions.py <input_media_path> <output_dir> [model_size]"
        }))
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    model_size = sys.argv[3] if len(sys.argv) > 3 else "small"

    input_file = Path(input_path)
    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)

    if not input_file.exists():
      print(json.dumps({
          "success": False,
          "error": f"Input file not found: {input_path}"
      }))
      sys.exit(1)

    vtt_name = f"{input_file.stem}_preview_captions.vtt"
    vtt_path = output_dir_path / vtt_name

    try:
        model = WhisperModel(model_size, device="auto", compute_type="int8")

        segments, info = model.transcribe(
            str(input_file),
            vad_filter=True,
            beam_size=1,
            word_timestamps=False
        )

        # segments is a generator; materialize it once
        segments_list = list(segments)
        write_vtt(segments_list, str(vtt_path))

        print(json.dumps({
            "success": True,
            "fileName": vtt_name,
            "filePath": str(vtt_path),
            "language": getattr(info, "language", None),
            "duration": getattr(info, "duration", None)
        }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()