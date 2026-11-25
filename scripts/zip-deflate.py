"""Deflate-compressed zip writer for portable release packages.

Why this exists (vs scripts/zip-release.py):
  zip-release.py uses ZIP_STORED (no compression) because its payload is Docker
  image tars that are already compressed. A portable package is plain files
  (JS / exe / json), so it MUST be deflated to hit the size budget.

Fixes both Windows zip pitfalls at once:
  - entry names always use POSIX '/' (Compress-Archive writes '\\' -> Linux unzip
    collapses the tree)
  - external_attr carries unix mode 755 for .sh so shell scripts stay executable

Usage:
  python zip-deflate.py <stage-dir> <output.zip> [level]
"""
import os
import sys
import zipfile

if len(sys.argv) < 3:
    sys.exit("usage: zip-deflate.py <stage-dir> <output.zip> [level=9]")

stage, out = sys.argv[1], sys.argv[2]
level = int(sys.argv[3]) if len(sys.argv) > 3 else 9

if not os.path.isdir(stage):
    sys.exit("stage dir not found: " + stage)

if os.path.exists(out):
    os.remove(out)

files = []
for root, dirs, names in os.walk(stage):
    dirs.sort()
    for name in sorted(names):
        full = os.path.join(root, name)
        rel = os.path.relpath(full, stage).replace("\\", "/")
        files.append((full, rel))

raw = sum(os.path.getsize(f) for f, _ in files)

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
    for full, rel in files:
        zi = zipfile.ZipInfo.from_file(full, rel)
        mode = 0o755 if rel.endswith(".sh") else 0o644
        zi.external_attr = (mode << 16) | 0o600
        zi.compress_type = zipfile.ZIP_DEFLATED
        with open(full, "rb") as src:
            data = src.read()
        # ZipFile.open() has no compresslevel kwarg; writestr() does.
        zf.writestr(zi, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=level)

zsize = os.path.getsize(out)
mb = lambda x: "%.1f MB" % (x / 1048576.0)
print("[zip-deflate] entries=%d  raw=%s -> zip=%s  (%.0f%%)"
      % (len(files), mb(raw), mb(zsize), zsize * 100.0 / max(raw, 1)))
