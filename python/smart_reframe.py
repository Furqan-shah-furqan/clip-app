import os
import sys
import json
import shutil
import tempfile
import subprocess
from pathlib import Path

import cv2


def get_ffmpeg_cmd():
    bin_ffmpeg = Path(__file__).resolve().parent.parent / "bin" / "ffmpeg.exe"
    if bin_ffmpeg.exists():
        return str(bin_ffmpeg)
    return shutil.which("ffmpeg") or "ffmpeg"


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


def get_target_size(aspect_ratio: str):
    if aspect_ratio == "9:16":
        return 720, 1280
    if aspect_ratio == "1:1":
        return 720, 720
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


def detect_largest_face(face_cascade, profile_cascade, frame):
    h, w = frame.shape[:2]
    if w <= 0 or h <= 0:
        return None

    detect_w = min(360, w)
    scale = detect_w / float(w)
    detect_h = max(1, int(h * scale))

    small = cv2.resize(frame, (detect_w, detect_h), interpolation=cv2.INTER_LINEAR)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.10,
        minNeighbors=4,
        minSize=(36, 36)
    )

    if (faces is None or len(faces) == 0) and profile_cascade is not None:
        # Check profile (right)
        p_faces = profile_cascade.detectMultiScale(
            gray,
            scaleFactor=1.10,
            minNeighbors=4,
            minSize=(36, 36)
        )
        if p_faces is not None and len(p_faces) > 0:
            faces = p_faces
        else:
            # Check profile (left, by flipping horizontally)
            flipped = cv2.flip(gray, 1)
            flip_faces = profile_cascade.detectMultiScale(
                flipped,
                scaleFactor=1.10,
                minNeighbors=4,
                minSize=(36, 36)
            )
            if flip_faces is not None and len(flip_faces) > 0:
                faces = [(detect_w - (fx + fw), fy, fw, fh) for (fx, fy, fw, fh) in flip_faces]

    if faces is None or len(faces) == 0:
        return None

    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    x, y, fw, fh = faces[0]

    inv_scale = 1.0 / scale
    x = int(x * inv_scale)
    y = int(y * inv_scale)
    fw = int(fw * inv_scale)
    fh = int(fh * inv_scale)

    return {
        "x": x,
        "y": y,
        "w": fw,
        "h": fh,
        "cx": int(x + fw / 2),
        "cy": int(y + fh / 2)
    }


def trim_clip(input_path: str, start_time: str, end_time: str, trimmed_path: str):
    start_seconds = parse_time_to_seconds(start_time)
    end_seconds = parse_time_to_seconds(end_time)
    duration = max(end_seconds - start_seconds, 1)

    cmd = [
        get_ffmpeg_cmd(), "-y",
        "-ss", str(start_seconds),
        "-i", input_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-c:a", "aac",
        "-movflags", "+faststart",
        trimmed_path
    ]
    run_cmd(cmd)


def smart_reframe_video(trimmed_path: str, final_output: str, aspect_ratio: str):
    cap = cv2.VideoCapture(trimmed_path)
    if not cap.isOpened():
        raise RuntimeError("Could not open trimmed clip")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if src_w <= 0 or src_h <= 0:
        cap.release()
        raise RuntimeError("Invalid clip dimensions")

    target_w, target_h = get_target_size(aspect_ratio)
    crop_w, crop_h = get_crop_size(src_w, src_h, aspect_ratio)

    silent_path = str(Path(final_output).with_name(Path(final_output).stem + "_silent.mp4"))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(silent_path, fourcc, fps, (target_w, target_h))

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    profile_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_profileface.xml"
    )
    if profile_cascade.empty():
        profile_cascade = None

    if face_cascade.empty() and profile_cascade is None:
        cap.release()
        writer.release()
        raise RuntimeError("Could not load OpenCV face detector")

    stable_cx = src_w // 2
    stable_cy = src_h // 2

    smoothing = 0.88
    dead_zone_x = max(16, int(src_w * 0.012))
    dead_zone_y = max(16, int(src_h * 0.012))
    face_miss_count = 0

    frame_index = 0
    last_detected_face = None
    detection_interval = 8

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame_index += 1

        should_detect = (frame_index % detection_interval == 0) or (last_detected_face is None)

        if should_detect:
            face = detect_largest_face(face_cascade, profile_cascade, frame)
            if face:
                last_detected_face = face
                face_miss_count = 0
            else:
                face_miss_count += 1
                if face_miss_count > 12:
                    last_detected_face = None
        else:
            face = last_detected_face

        if face:
            desired_cx = face["cx"]
            desired_cy = face["cy"] - int(face["h"] * 0.10)
        else:
            desired_cx = stable_cx
            desired_cy = stable_cy

        dx = desired_cx - stable_cx
        dy = desired_cy - stable_cy

        if abs(dx) < dead_zone_x:
            desired_cx = stable_cx
        if abs(dy) < dead_zone_y:
            desired_cy = stable_cy

        stable_cx = int(stable_cx * smoothing + desired_cx * (1.0 - smoothing))
        stable_cy = int(stable_cy * smoothing + desired_cy * (1.0 - smoothing))

        x1 = clamp(stable_cx - crop_w // 2, 0, src_w - crop_w)
        y1 = clamp(stable_cy - crop_h // 2, 0, src_h - crop_h)

        if aspect_ratio == "9:16":
            y1 = clamp(y1 - int(crop_h * 0.08), 0, src_h - crop_h)

        crop = frame[y1:y1 + crop_h, x1:x1 + crop_w]
        if crop.size == 0:
            crop = frame

        resized = cv2.resize(crop, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        writer.write(resized)

    cap.release()
    writer.release()

    mux_cmd = [
        get_ffmpeg_cmd(), "-y",
        "-i", silent_path,
        "-i", trimmed_path,
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "24",
        "-c:a", "aac",
        "-shortest",
        "-movflags", "+faststart",
        final_output
    ]
    run_cmd(mux_cmd)

    if os.path.exists(silent_path):
        os.remove(silent_path)


def main():
    if len(sys.argv) < 6:
        print(json.dumps({"success": False, "error": "Missing args"}))
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    start_time = sys.argv[3]
    end_time = sys.argv[4]
    aspect_ratio = sys.argv[5]

    os.makedirs(output_dir, exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix="smartreframe_", dir=output_dir)

    try:
        trimmed_path = os.path.join(work_dir, "trimmed.mp4")
        file_name = f"smart_clip_{Path(work_dir).name}.mp4"
        final_output = os.path.join(output_dir, file_name)

        trim_clip(input_path, start_time, end_time, trimmed_path)
        smart_reframe_video(trimmed_path, final_output, aspect_ratio)

        print(json.dumps({
            "success": True,
            "fileName": os.path.basename(final_output),
            "outputPath": str(Path(final_output).resolve())
        }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()