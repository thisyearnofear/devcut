"""Content-addressed fingerprint of a release payload.

Used by deploy-local.sh (locally AND on the server via stdin) to decide
which services actually changed and therefore need a PM2 reload. Skips
volatile paths (.venv, .env, logs…) so restarts are driven by real
payload differences only.

Usage: python3 dirhash.py <dir-or-file> [<dir-or-file> …]
Prints one sha256 hex digest for the combined input.
"""
import hashlib
import os
import sys

SKIP_DIRS = {".venv", "__pycache__", ".git", "logs", "exports", ".cache"}
SKIP_FILES = {".DS_Store", ".env", "Thumbs.db"}

h = hashlib.sha256()
for target in sys.argv[1:]:
    if os.path.isfile(target):
        h.update(os.path.basename(target).encode())
        with open(target, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        continue
    if not os.path.isdir(target):
        continue
    for root, dirs, files in os.walk(target, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            if name in SKIP_FILES:
                continue
            p = os.path.join(root, name)
            if os.path.islink(p):
                continue
            h.update(os.path.relpath(p, target).encode())
            with open(p, "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    h.update(chunk)
print(h.hexdigest())
