"""Synthesize narration lines with Piper.

Reads a JSON list of {"key", "text"} objects from stdin and writes <out>/<key>.wav
for each one, loading the voice only once. Run with the Python that has piper-tts.

Usage: python narrate.py <voice.onnx> <out_dir> < lines.json
"""

import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig


def main() -> None:
    model, out_dir = sys.argv[1], Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(model)
    config = SynthesisConfig(length_scale=0.95, noise_scale=0.6, noise_w_scale=0.7)
    lines = json.load(sys.stdin)
    for i, line in enumerate(lines, 1):
        path = out_dir / f"{line['key']}.wav"
        with wave.open(str(path), "wb") as wav:
            voice.synthesize_wav(line["text"], wav, syn_config=config)
        print(f"[{i}/{len(lines)}] {line['key']}", flush=True)


if __name__ == "__main__":
    main()
