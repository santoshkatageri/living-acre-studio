#!/usr/bin/env python3
"""Run the farmer build with Blender, whichever way it is installed.

Blender is a hard requirement for the source file (``farmer.blend``) and the
GLB, but it is not something `npm install` can bring in. Two ways to have it:

*  **Full Blender** — ``blender --background --python scripts/character/build_farmer.py``
   works as-is, and this wrapper will call the binary if it is on PATH.
*  **The ``bpy`` module** — ``pip install bpy`` (Python 3.11) gives Blender as an
   importable module. On a headless Linux box bpy still expects the X11/GL
   client libraries, which a container often has not got. ``bpy_shim.py`` next
   to this file builds empty stand-ins for them; that is enough for background
   mode, which never opens a window or touches the GPU.

Usage:

    python scripts/character/run_blender.py [--out public/models] [--no-render]

The GLB it writes is what the app loads; the .blend next to it is the source.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build_farmer.py")
SHIM = os.path.join(HERE, "bpy_shim.py")


def main() -> int:
    args = sys.argv[1:]
    out = "public/models"
    if "--out" in args:
        out = args[args.index("--out") + 1]

    blender = shutil.which("blender")
    if blender:
        command = [blender, "--background", "--python", BUILD, "--", "--out", out]
        return subprocess.call(command, cwd=os.path.dirname(os.path.dirname(HERE)))

    # Fall back to the Python module.
    env = dict(os.environ)
    lib_dir = os.environ.get("BPY_STUB_LIBS", "/tmp/arena-bpy-libs")
    if subprocess.call([sys.executable, SHIM, lib_dir]) == 0:
        env["LD_LIBRARY_PATH"] = lib_dir + (":" + env["LD_LIBRARY_PATH"] if env.get("LD_LIBRARY_PATH") else "")
    sys.path.insert(0, HERE)
    # build_farmer.py reads argv the same way bpy would.
    sys.argv = [BUILD, "--", "--out", out]
    env.setdefault("FARMER_RENDER", "1")
    os.environ.update(env)
    import runpy  # noqa: PLC0415 - imported here so the shim is set up first

    runpy.run_path(BUILD, run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
