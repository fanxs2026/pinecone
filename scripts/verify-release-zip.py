"""发布包校验（审计用）：结构 / 分隔符 / 关键文件 / 版本 / 环境标记 / 前端地址污染。

用法: python scripts/_verify_release_zip.py <zip1> [zip2 ...]
"""
import sys
import zipfile

REQUIRED = [
    "apps/backend/dist/main.js",
    "apps/frontend/server.js",
    "db/schema.sql",
    "db/patches/20261102_due_dates_and_saved_views.sql",
    "db/patches/20261126_uuid_alignment_and_fkeys.sql",
    "bin/patch-db.js",
    "setup-db.bat",
    ".env",
    "VERSION.txt",
]


def check(path):
    print("=" * 70)
    print(path)
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        # 包内是扁平结构：.env / apps / db 直接位于 zip 根（解压即客户目录）
        top = "" if "apps/backend/dist/main.js" in set(names) else names[0].split("/")[0]
        join = lambda rel: rel if not top else "%s/%s" % (top, rel)
        print("  条目数: %d | 顶层目录: %s" % (len(names), top or "(zip 根)"))

        bad_sep = [n for n in names if "\\" in n]
        print("  反斜杠条目: %d %s" % (len(bad_sep), "OK" if not bad_sep else bad_sep[:3]))

        missing = []
        for rel in REQUIRED:
            full = join(rel)
            if full not in names:
                missing.append(rel)
        print("  关键文件缺失: %d %s" % (len(missing), "OK" if not missing else missing))

        # 交付包不允许带 sourcemap / 类型声明（会暴露源码结构）
        aux = [n for n in names if n.endswith(".map") or n.endswith(".d.ts")]
        print("  sourcemap/d.ts 残留: %d %s" % (len(aux), "OK" if not aux else aux[:3]))

        # .env 标记
        try:
            env = z.read(join(".env")).decode("utf-8", "replace")
            keys = {}
            for line in env.splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    keys[k.strip()] = v.strip()
            print("  PINE_EDITION=%s | REGISTRATION_MODE=%s | HTTPS_ENABLED=%s"
                  % (keys.get("PINE_EDITION"), keys.get("REGISTRATION_MODE"), keys.get("HTTPS_ENABLED")))
            print("  PINE_LICENSE_KEY=%s | TRUST_PROXY=%s | CORS_ALLOW_SAME_HOST=%s"
                  % ("empty" if not keys.get("PINE_LICENSE_KEY") else "SET",
                     keys.get("TRUST_PROXY"), keys.get("CORS_ALLOW_SAME_HOST")))
            if "CHANGE_ME" in env:
                print("  [WARN] .env 仍含 CHANGE_ME 占位符（首启会被 setup 流程替换，属预期）")
        except KeyError:
            print("  [FAIL] 读不到 .env")

        # 版本
        try:
            import json
            pkg = json.loads(z.read(join("apps/backend/package.json")).decode("utf-8", "replace"))
            print("  backend package.json version=%s" % pkg.get("version"))
        except Exception as e:
            print("  [WARN] 读 package.json 失败: %s" % e)

        # 前端产物是否残留硬编码 localhost
        hits = 0
        for n in names:
            if "/apps/frontend/" in n and n.endswith(".js") and "/.next/static/" in n:
                data = z.read(n)
                if b"localhost:3000/api" in data:
                    hits += 1
                    if hits <= 3:
                        print("  [FAIL] 硬编码地址: %s" % n)
        print("  前端硬编码 localhost:3000/api: %d %s" % (hits, "OK" if hits == 0 else "污染!"))

        # 版本一致性：zip 名 / VERSION.txt / 包内 package.json 必须同源
        import re
        m = re.search(r"-(\d+\.\d+\.\d+)-win", path)
        zipver = m.group(1) if m else None
        try:
            vtxt = z.read(join("VERSION.txt")).decode("utf-8", "replace")
            vfile = dict(l.split("=", 1) for l in vtxt.splitlines() if "=" in l).get("version")
        except Exception:
            vfile = None
        try:
            import json
            pkgver = json.loads(z.read(join("apps/backend/package.json")).decode("utf-8", "replace")).get("version")
        except Exception:
            pkgver = None
        ver_ok = zipver and zipver == vfile == pkgver
        print("  版本一致性: zip=%s VERSION.txt=%s package.json=%s %s"
              % (zipver, vfile, pkgver, "OK" if ver_ok else "MISMATCH"))

        # 版本标记（edition）与企业模块
        edition = "enterprise" if keys.get("PINE_EDITION") == "enterprise" else "community"
        mods = {n.split("/")[4] for n in names
                if n.startswith(join("apps/backend/dist/modules/")) and n.count("/") > 4}
        need_ee = ["license", "scim", "audit", "ai", "api-tokens", "okr", "trash"]
        if edition == "enterprise":
            lack = [m0 for m0 in need_ee if m0 not in mods]
            ee_ok = not lack
            print("  企业模块: %d 个 | 缺失 %s" % (len(mods), lack or "无"))
        else:
            extra = [m0 for m0 in need_ee if m0 in mods]
            ee_ok = not extra
            print("  社区版模块数: %d | 不应存在的企业模块 %s" % (len(mods), extra or "无"))
        return len(missing) == 0 and not bad_sep and hits == 0 and ver_ok and ee_ok and not aux


if __name__ == "__main__":
    ok = True
    for p in sys.argv[1:]:
        ok = check(p) and ok
    print("=" * 70)
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)
