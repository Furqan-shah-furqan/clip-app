import os
import sys
import json
import math
import shutil
import tempfile
import subprocess
from pathlib import Path

import cv2
import numpy as np
from faster_whisper import WhisperModel


def run_cmd(cmd):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Command failed")
    return result


def parse_time_to_seconds(time_str: str) -> float:
    parts = [float(p) for p in str(time_str).split(":")]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return float(parts[0])


def seconds_to_srt_time(seconds: float) -> str:
    ms = int(round((seconds - int(seconds)) * 1000))
    total = int(seconds)
    s = total % 60
    m = (total // 60) % 60
    h = total // 3600
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def get_target_size(aspect_ratio: str):
    if aspect_ratio == "9:16":
        return 1080, 1920
    if aspect_ratio == "1:1":
        return 1080, 1080
    return 1280, 720


def get_crop_size(src_w: int, src_h: int, aspect_ratio: str):
    if aspect_ratio == "9:16":
        target_ratio = 9 / 16
    elif aspect_ratio == "1:1":
        target_ratio = 1.0
    else:
        target_ratio = 16 / 9

    src_ratio = src_w / src_h

    if src_ratio > target_ratio:
        crop_h = src_h
        crop_w = int(crop_h * target_ratio)
    else:
        crop_w = src_w
        crop_h = int(crop_w / target_ratio)

    crop_w = min(crop_w, src_w)
    crop_h = min(crop_h, src_h)
    return crop_w, crop_h


def clamp(v, lo, hi):
    return max(lo, min(v, hi))


def detect_largest_face(face_cascade, frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60)
    )
    if len(faces) == 0:
        return None

    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    x, y, w, h = faces[0]
    return {
        "x": int(x),
        "y": int(y),
        "w": int(w),
        "h": int(h),
        "cx": int(x + w / 2),
        "cy": int(y + h / 2),
    }


def smart_reframe_video(input_path: str, output_path: str, aspect_ratio: str):
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError("Could not open trimmed video")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    target_w, target_h = get_target_size(aspect_ratio)
    crop_w, crop_h = get_crop_size(src_w, src_h, aspect_ratio)

    tmp_writer_path = str(Path(output_path).with_suffix(".silent.mp4"))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_writer_path, fourcc, fps, (target_w, target_h))

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    if face_cascade.empty():
        raise RuntimeError("OpenCV Haar cascade could not be loaded")

    prev_cx = src_w // 2
    prev_cy = src_h // 2
    smooth = 0.82

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        face = detect_largest_face(face_cascade, frame)

        if face is not None:
            desired_cx = face["cx"]
            desired_cy = face["cy"] - int(face["h"] * 0.10)
        else:
            desired_cx = prev_cx
            desired_cy = prev_cy

        prev_cx = int(prev_cx * smooth + desired_cx * (1.0 - smooth))
        prev_cy = int(prev_cy * smooth + desired_cy * (1.0 - smooth))

        x1 = clamp(prev_cx - crop_w // 2, 0, src_w - crop_w)
        y1 = clamp(prev_cy - crop_h // 2, 0, src_h - crop_h)

        # slight top bias for portrait clips
        if aspect_ratio == "9:16":
            y1 = clamp(y1 - int(crop_h * 0.08), 0, src_h - crop_h)

        crop = frame[y1:y1 + crop_h, x1:x1 + crop_w]
        if crop.size == 0:
            crop = frame

        resized = cv2.resize(crop, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        writer.write(resized)

    cap.release()
    writer.release()
    return tmp_writer_path


def transcribe_to_srt(input_path: str, srt_path: str, model_size: str = "small"):
    model = WhisperModel(model_size, device="auto", compute_type="int8")
    segments, _info = model.transcribe(
        input_path,
        vad_filter=True,
        word_timestamps=False
    )

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(segments, start=1):
            text = (segment.text or "").strip()
            if not text:
                continue
            f.write(f"{i}\n")
            f.write(f"{seconds_to_srt_time(segment.start)} --> {seconds_to_srt_time(segment.end)}\n")
            f.write(text + "\n\n")


def burn_subtitles_and_mux_audio(
    silent_video: str,
    source_with_audio: str,
    subtitle_path: str,
    output_path: str
):
    sub_path = subtitle_path.replace("\\", "/").replace(":", "\\:")
    vf = (
        f"subtitles='{sub_path}':"
        "force_style='"
        "FontName=Arial,"
        "FontSize=18,"
        "PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H00000000,"
        "BackColour=&H66000000,"
        "Bold=1,"
        "Outline=2,"
        "Shadow=1,"
        "Alignment=2,"
        "MarginV=40'"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", silent_video,
        "-i", source_with_audio,
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-shortest",
        output_path
    ]
    run_cmd(cmd)


def trim_clip(input_path: str, start_time: str, end_time: str, trimmed_path: str):
    start_seconds = parse_time_to_seconds(start_time)
    end_seconds = parse_time_to_seconds(end_time)
    duration = max(end_seconds - start_seconds, 1)

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_seconds),
        "-i", input_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "aac",
        "-movflags", "+faststart",
        trimmed_path
    ]
    run_cmd(cmd)


def main():
    if len(sys.argv) < 6:
        print(json.dumps({"error": "Missing args"}))
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    start_time = sys.argv[3]
    end_time = sys.argv[4]
    aspect_ratio = sys.argv[5]
    whisper_model = sys.argv[6] if len(sys.argv) > 6 else "small"

    output_dir = str(Path(output_dir).resolve())
    os.makedirs(output_dir, exist_ok=True)

    work_dir = tempfile.mkdtemp(prefix="smartclip_", dir=output_dir)
    try:
        trimmed_path = os.path.join(work_dir, "trimmed.mp4")
        silent_reframed_path = os.path.join(work_dir, "reframed_silent.mp4")

        final_name = f"smart_clip_{int(Path(work_dir).stat().st_mtime_ns)}.mp4"
        srt_name = f"smart_clip_{int(Path(work_dir).stat().st_mtime_ns)}.srt"

        final_output = os.path.join(output_dir, final_name)
        subtitle_output = os.path.join(output_dir, srt_name)

        trim_clip(input_path, start_time, end_time, trimmed_path)
        silent_written = smart_reframe_video(trimmed_path, silent_reframed_path, aspect_ratio)
        transcribe_to_srt(trimmed_path, subtitle_output, whisper_model)
        burn_subtitles_and_mux_audio(silent_written, trimmed_path, subtitle_output, final_output)

        print(json.dumps({
            "success": True,
            "outputPath": final_output,
            "subtitlePath": subtitle_output,
            "fileName": os.path.basename(final_output),
            "subtitleFile": os.path.basename(subtitle_output)
        }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)
    finally:
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    main()