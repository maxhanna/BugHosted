"""The client's small voice format: mono 48 kHz Ogg/Opus at 40 kbit/s.

The D2R extract records every NPC and hero line as a lossless 44.1 kHz FLAC —
about 36 MB across the voice folders, which is far too much to stream behind the
loading cel. The skill and impact importers already solve this with PyAV and
libopus (``pip install av``, no ffmpeg binary needed); the three voice importers
share the same take here, so a spoken line costs a few kilobytes instead of a
few hundred.

Nothing but these encoders feeds ``audio/voice``.
"""

from __future__ import annotations

from pathlib import Path

import av
from av.audio.resampler import AudioResampler

ENCODED_SUFFIX = ".ogg"
ENCODED_CODEC = "libopus"
ENCODED_SAMPLE_RATE = 48_000
ENCODED_BIT_RATE = 40_000


def encode_take(origin: Path, target: Path) -> None:
    """Re-encodes one recorded take to mono 48 kHz Ogg/Opus."""
    target.parent.mkdir(parents=True, exist_ok=True)
    with av.open(str(origin)) as recording:
        stream = recording.streams.audio[0]
        resampler = AudioResampler(format="fltp", layout="mono", rate=ENCODED_SAMPLE_RATE)
        with av.open(str(target), "w", format="ogg") as output:
            encoded = output.add_stream(ENCODED_CODEC, rate=ENCODED_SAMPLE_RATE)
            encoded.layout = "mono"
            encoded.bit_rate = ENCODED_BIT_RATE
            for frame in recording.decode(stream):
                for resampled in resampler.resample(frame):
                    for packet in encoded.encode(resampled):
                        output.mux(packet)
            for packet in encoded.encode(None):
                output.mux(packet)


def build_take(origin: Path, target: Path) -> None:
    """Encodes ``origin`` unless its Ogg/Opus copy is already up to date."""
    if target.exists() and target.stat().st_mtime >= origin.stat().st_mtime:
        return
    encode_take(origin, target)


def drop_stale_flacs(folder: Path) -> int:
    """Deletes lossless leftovers once their Ogg/Opus copy exists."""
    removed = 0
    for stale in folder.rglob("*.flac"):
        if (stale.parent / (stale.stem + ENCODED_SUFFIX)).exists():
            stale.unlink()
            removed += 1
    return removed
