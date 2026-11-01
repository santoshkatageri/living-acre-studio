#!/usr/bin/env python3
"""Make a downloaded Chromium start on a bare box.

`puppeteer`'s Chromium links against the NSS and X11 client libraries. A slim
container has none of them, and installing them needs root and a network path
this project does not use. Headless Chromium with SwiftShader never *calls* most
of those entry points — it only needs the symbols to resolve at load time.

So: build empty shared objects that export exactly the symbols the binary asks
for, correct version tags included, and put them on `LD_LIBRARY_PATH`. Chromium
then starts, renders WebGL in software, and `verify-farmer.mjs` can screenshot
the character in the running app.

This is a development convenience. On a machine with the real libraries
installed, nothing here is needed and nothing here runs.

    python scripts/character/chromium_shim.py /tmp/arena-chromium-libs
    LD_LIBRARY_PATH=/tmp/arena-chromium-libs node scripts/character/verify-farmer.mjs
"""

from __future__ import annotations

import collections
import os
import re
import subprocess
import sys

# The namespaces Chromium's NSS calls come from, plus the X11/GL prefixes that
# `bpy_shim.py` already knows about.
NSS_PREFIX = re.compile(r"^(NSS_|_NSS|PR_|PL_|CERT_|PK11_|SEC|VFY_)")
X11_PREFIX = re.compile(r"^_?(gl|egl|GL|EGL|X|Xi|xkb|drm|gbm|XF86)")

# The stubs are shipped under the sonames Chromium actually looks for.
LIBS = ["libnss3.so", "libnssutil3.so", "libnspr4.so", "libsmime3.so", "libssl3.so"]
X11_LIBS = [
    "libGL.so.1", "libGLX.so.0", "libOpenGL.so.0", "libXrender.so.1", "libXxf86vm.so.1",
    "libXfixes.so.3", "libXi.so.6", "libxkbcommon.so.0", "libSM.so.6", "libICE.so.6",
    "libdrm.so.2", "libgbm.so.1", "libasound.so.2",
]

# Version tags must appear oldest first, and an anonymous block cannot be mixed
# with named ones, hence the named base tag.
VERSION_ORDER = ["NSS_UNIT", "NSS_3.2", "NSS_3.3", "NSS_3.4", "NSS_3.6", "NSS_3.9.2",
                 "NSS_3.12", "NSS_3.15", "NSS_3.30", "NSS_3.35", "NSS_3.40", "NSS_3.45",
                 "NSS_3.55", "NSS_3.60", "NSS_3.70", "NSS_3.80", "NSSUTIL_3.12.3",
                 "NSSUTIL_3.20", "NSSUTIL_3.30", "NSSUTIL_3.40", "NSSUTIL_3.50"]


def find_binary() -> str:
    for candidate in ("/tmp/chromium", os.environ.get("CHROMIUM_BINARY", "")):
        if candidate and os.path.exists(candidate):
            return candidate
    raise SystemExit("chromium_shim: no Chromium binary; run verify-farmer.mjs once to unpack it")


def undefined(binary: str) -> list[str]:
    out = subprocess.run(
        ["nm", "-D", "--undefined-only", binary], capture_output=True, text=True, check=False
    ).stdout
    return [line.split()[-1] for line in out.splitlines() if line.split()]


def build_nss(directory: str, symbols: list[str]) -> int:
    tagged: dict[str, set[str]] = collections.defaultdict(set)
    for name in symbols:
        if not NSS_PREFIX.match(name):
            continue
        base, _, version = name.partition("@")
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", base):
            tagged[version or "NSS_UNIT"].add(base)
    if not tagged:
        return 0

    source = ["#include <stddef.h>",
              "/* Stubs: symbols Chromium resolves but never calls before it has a",
              "   certificate database. SECSuccess is 0, so NULL is the safe return;",
              "   the version check is the one caller that must say yes. */"]
    for names in tagged.values():
        for name in sorted(names):
            body = "(void *)1" if name == "NSS_VersionCheck" else "NULL"
            source.append(f"void *{name}(void) {{ return {body}; }}")
    stubs = os.path.join(directory, "nss_stubs.c")
    with open(stubs, "w") as handle:
        handle.write("\n".join(source) + "\n")

    script = []
    for tag in VERSION_ORDER:
        if tag not in tagged:
            continue
        script += [f"{tag} {{", "  global:", "    " + "; ".join(sorted(tagged[tag])) + ";",
                   "  local: *;", "};"]
    version_map = os.path.join(directory, "nss.map")
    with open(version_map, "w") as handle:
        handle.write("\n".join(script) + "\n")

    for lib in LIBS:
        subprocess.run(["gcc", "-shared", "-fPIC", "-w", "-o", os.path.join(directory, lib), stubs,
                        f"-Wl,--version-script={version_map}", f"-Wl,-soname,{lib}"], check=False)
    return sum(len(names) for names in tagged.values())


def build_x11(directory: str, symbols: list[str]) -> int:
    names = sorted({name.split("@")[0] for name in symbols
                    if X11_PREFIX.match(name) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*",
                                                              name.split("@")[0])})
    if not names:
        return 0
    source = os.path.join(directory, "x11_stubs.c")
    with open(source, "w") as handle:
        handle.write("#include <stddef.h>\n")
        handle.write("".join(f"void *{name}(void) {{ return NULL; }}\n" for name in names))
    for lib in X11_LIBS:
        subprocess.run(["gcc", "-shared", "-fPIC", "-w", "-o", os.path.join(directory, lib), source,
                        f"-Wl,-soname,{lib}"], check=False)
    return len(names)


def main() -> int:
    directory = sys.argv[1] if len(sys.argv) > 1 else "/tmp/arena-chromium-libs"
    os.makedirs(directory, exist_ok=True)
    symbols = undefined(find_binary())
    nss = build_nss(directory, symbols)
    x11 = build_x11(directory, symbols)
    print(f"chromium_shim: {nss} NSS and {x11} X11/GL symbols in {directory}")
    if not nss and not x11:
        print("chromium_shim: nothing was missing — the real libraries are present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
