"""Generate the stickman race voice lines with the Fish Audio TTS API.

Usage:  FISH_API_KEY=sk-... python3 race_voice/generate.py [clip ...]
With no clip names, every clip is generated.
"""
import json
import os
import sys
import urllib.error
import urllib.request

VOICES = {
    "ANNOUNCER": "90e65eaaf50e4470b8e6d43ee6afd7d5",  # Super Smash Bros. 4/Ultimate Announcer
    "WINNER": "52e0660e03fe4f9a8d2336f67cab5440",     # ALEX_CHIKNA
    "LOSER": "b605ba21a5994bc29c620e487b65884f",      # Tired guy
}

CLIPS = {
    "countdown": ("ANNOUNCER", "Three... two... one... GO!"),
    "tooslow": ("WINNER", "Too slooow!"),
    "walking": ("WINNER", "Y'all were walking?!"),
    "cough": ("LOSER", "*cough* *cough*... bro what."),
}

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def tts(text, voice_id):
    body = json.dumps({"text": text, "reference_id": voice_id, "format": "mp3", "mp3_bitrate": 128}).encode()
    req = urllib.request.Request(
        "https://api.fish.audio/v1/tts",
        data=body,
        headers={
            "Authorization": f"Bearer {os.environ['FISH_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def main(names):
    for name in names or CLIPS:
        role, text = CLIPS[name]
        try:
            audio = tts(text, VOICES[role])
        except urllib.error.HTTPError as e:
            print(f"{name}: HTTP {e.code} {e.read().decode(errors='replace')}")
            sys.exit(2 if e.code == 402 else 1)
        path = os.path.join(OUT_DIR, f"{name}.mp3")
        with open(path, "wb") as f:
            f.write(audio)
        print(f"{name}.mp3: {len(audio)} bytes ({role})")


if __name__ == "__main__":
    main(sys.argv[1:])
