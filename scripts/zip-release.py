"""把 stage 目录打成发布 zip（供 scripts/release-images.sh 调用）。

为什么需要它：
  - Windows 的 Compress-Archive 会把条目路径写成反斜杠（docker\\postgres\\...），
    Linux unzip 时反斜杠被当作普通字符，目录结构塌陷；
  - 7z 的 -tzip 虽然写 POSIX '/'，但不写 unix 权限位（external_attr=0），
    .sh 解压后没有执行权限。
  Python 的 zipfile 两个问题都能解决。

用法：python zip-release.py <stage-dir> <output.zip>
"""
import os
import sys
import zipfile

if len(sys.argv) != 3:
    sys.exit("usage: zip-release.py <stage-dir> <output.zip>")

stage, out = sys.argv[1], sys.argv[2]
if not os.path.isdir(stage):
    sys.exit(f"stage dir not found: {stage}")

entries = []
for root, dirs, files in os.walk(stage):
    dirs.sort()
    for name in sorted(files):
        full = os.path.join(root, name)
        entries.append((full, os.path.relpath(full, stage).replace("\\", "/")))

if os.path.exists(out):
    os.remove(out)

with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED, allowZip64=True) as zf:
    for full, rel in entries:
        zi = zipfile.ZipInfo.from_file(full, rel)
        mode = 0o755 if rel.endswith(".sh") else 0o644
        zi.external_attr = (mode << 16) | 0o600
        zi.compress_type = zipfile.ZIP_STORED
        with open(full, "rb") as src, zf.open(zi, "w") as dst:
            while True:
                buf = src.read(8 * 1024 * 1024)
                if not buf:
                    break
                dst.write(buf)

print(f"[zip-release] {out} ({len(entries)} entries)")
for full, rel in entries:
    print(f"  {os.path.getsize(full):>12}  {rel}")
