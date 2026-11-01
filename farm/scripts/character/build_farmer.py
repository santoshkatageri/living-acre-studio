"""Build the Living Acre farmer in Blender, and export the game asset.

Run with Blender (or the `bpy` module) in background mode:

    blender --background --python scripts/character/build_farmer.py -- --out public/models
    python scripts/character/run_blender.py            # same thing, using bpy

What it makes
-------------
*  ``farmer.blend``      — the editable source, with the rig and all actions
*  ``farmer.glb``        — the browser asset: one skinned mesh, 24 bones, 9 clips
*  turnaround renders    — front / side / back / three-quarter, plus a face close-up

Conventions (they matter for the app)
-------------------------------------
*  Units are METRES; the character is 1.72 m tall. The app scales by FT_PER_M
   (3.28084) to get 5.64 ft, the same convention as ``canon.identity.farmer``.
*  The character faces **-Y** in Blender. Blender's +Y maps to three.js -Z on
   export, so in the game he faces **+Z** — which is what ``headingVector`` and
   ``Actor.setFacing`` already assume.
*  +X is his left. The solver builds left limbs at +X.

The proportions are stylised but adult: a 1:6.9 head, wide friendly eyes, short
sturdy legs, broad shoulders. Nothing about it is childlike: the shoulders are
1.5 head-widths wide, the neck is thick, and the facial features sit low on the
skull the way an adult's do.
"""

from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

# --------------------------------------------------------------------------- #
#  Colour: the palette is written as sRGB hex (what the design asks for) and
#  converted to linear, because that is what glTF stores in baseColorFactor.
# --------------------------------------------------------------------------- #


def srgb(hex_colour: str) -> tuple[float, float, float, float]:
    value = hex_colour.lstrip("#")
    out = []
    for index in (0, 2, 4):
        channel = int(value[index : index + 2], 16) / 255.0
        out.append(channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


PALETTE = {
    "skin": ("#C0855A", 0.68),
    "skin_deep": ("#A5673F", 0.7),
    "turban": ("#B4382C", 0.72),
    "turban_fold": ("#8B2A21", 0.75),
    "kurta": ("#EDE1C6", 0.95),
    "kurta_shade": ("#DBCDAF", 0.95),
    "dhoti": ("#EFE9DB", 0.95),
    "dhoti_shade": ("#DED6C4", 0.95),
    "scarf": ("#3E7A4C", 0.8),
    "scarf_dark": ("#2F5F3B", 0.82),
    "hair": ("#241A16", 0.7),
    "eye_white": ("#FFFDF8", 0.5),
    "iris": ("#6B4423", 0.3),
    "pupil": ("#120D0A", 0.25),
    "gleam": ("#FFFFFF", 0.15),
    "leather": ("#6B4A2F", 0.6),
    "sole": ("#4A3220", 0.75),
    "mouth": ("#7B4034", 0.6),
    "brass": ("#C08A3E", 0.32),
}

MATERIALS: dict[str, bpy.types.Material] = {}


def material(name: str) -> bpy.types.Material:
    if name in MATERIALS:
        return MATERIALS[name]
    hex_colour, roughness = PALETTE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(hex_colour)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if name == "gleam":
        bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
        bsdf.inputs["Emission Strength"].default_value = 0.35
    if name in ("eye_white", "iris", "pupil"):
        bsdf.inputs["Specular IOR Level"].default_value = 0.6
    MATERIALS[name] = mat
    return mat


# --------------------------------------------------------------------------- #
#  Mesh helpers. Everything is built from a handful of primitives, so the whole
#  character stays low-poly and every part is a known group of vertices (which
#  is how the skin weights are assigned without a heat solver).
# --------------------------------------------------------------------------- #

PARTS: list[dict] = []


def register(obj: bpy.types.Object, material_name: str, bones: dict[str, float], rigid: bool = False) -> None:
    """Keep a part and say which bones may move it.

    ``bones`` maps a bone name to a base weight; a vertex's final weight is that
    base scaled by a falloff on its distance to the bone segment, which keeps
    joints smooth without Blender's heat solver (it needs a UI context).
    """
    obj.data.materials.append(material(material_name))
    for poly in obj.data.polygons:
        poly.use_smooth = True
    PARTS.append({"object": obj, "bones": bones, "rigid": rigid})


def new_mesh(name: str, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def lathe(name: str, profile, segments: int = 20, pleats: int = 0, pleat_depth: float = 0.0,
          centre=(0.0, 0.0), squash=(1.0, 1.0), phase: float = 0.0, pleat_bell=None):
    """Revolve a (z, radius) profile into a closed shell.

    ``pleats`` ripples the radius around the ring, which is what gives the dhoti
    and the turban their cloth folds; ``squash`` makes the section an ellipse so
    the body is deeper than it is wide (or the other way round).
    """
    verts, faces = [], []
    rings = len(profile)
    for ring_index, (z, radius) in enumerate(profile):
        depth = pleat_depth
        if pleat_bell is not None and pleats:
            # Full folds below the bell, none above it: cloth under a shirt.
            low, high = pleat_bell
            depth = pleat_depth * min(max((high - z) / max(high - low, 1e-6), 0.0), 1.0)
        for step in range(segments):
            angle = 2 * math.pi * step / segments + phase
            fold = 1.0 + depth * math.sin(pleats * angle) if pleats else 1.0
            r = radius * fold
            verts.append((centre[0] + math.cos(angle) * r * squash[0],
                          centre[1] + math.sin(angle) * r * squash[1],
                          z))
    for ring_index in range(rings - 1):
        for step in range(segments):
            a = ring_index * segments + step
            b = ring_index * segments + (step + 1) % segments
            c = (ring_index + 1) * segments + (step + 1) % segments
            d = (ring_index + 1) * segments + step
            faces.append((a, b, c, d))
    # Close the ends with fans.
    bottom = len(verts)
    verts.append((centre[0], centre[1], profile[0][0]))
    top = len(verts)
    verts.append((centre[0], centre[1], profile[-1][0]))
    for step in range(segments):
        faces.append((bottom, (step + 1) % segments, step))
        base = (rings - 1) * segments
        faces.append((top, base + step, base + (step + 1) % segments))
    return new_mesh(name, verts, faces)


def ellipsoid(name: str, radius, centre, rings: int = 12, segments: int = 16, squash_bottom: float = 1.0):
    """A UV sphere with independent radii, optionally pinched at the bottom."""
    rx, ry, rz = radius
    verts, faces = [], []
    for ring in range(rings + 1):
        phi = math.pi * ring / rings
        z = math.cos(phi)
        scale = 1.0
        if z < 0:
            scale = 1.0 + (squash_bottom - 1.0) * (-z)
        for step in range(segments):
            theta = 2 * math.pi * step / segments
            verts.append((centre[0] + math.sin(phi) * math.cos(theta) * rx * scale,
                          centre[1] + math.sin(phi) * math.sin(theta) * ry * scale,
                          centre[2] + z * rz))
    for ring in range(rings):
        for step in range(segments):
            a = ring * segments + step
            b = ring * segments + (step + 1) % segments
            c = (ring + 1) * segments + (step + 1) % segments
            d = (ring + 1) * segments + step
            faces.append((a, b, c, d))
    return new_mesh(name, verts, faces)


def tube(name: str, start, end, radius_start: float, radius_end: float, segments: int = 12, cap: bool = True):
    """A tapered cylinder between two points: limbs, fingers, straps."""
    a = Vector(start)
    b = Vector(end)
    axis = (b - a).normalized()
    # Any two vectors perpendicular to the axis will do for the cross-section.
    helper = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(helper).normalized()
    v = axis.cross(u).normalized()
    verts, faces = [], []
    for centre, radius in ((a, radius_start), (b, radius_end)):
        for step in range(segments):
            angle = 2 * math.pi * step / segments
            verts.append(tuple(centre + u * (math.cos(angle) * radius) + v * (math.sin(angle) * radius)))
    for step in range(segments):
        a0 = step
        b0 = (step + 1) % segments
        faces.append((a0, b0, segments + b0, segments + a0))
    if cap:
        centre_a = len(verts)
        verts.append(tuple(a))
        centre_b = len(verts)
        verts.append(tuple(b))
        for step in range(segments):
            faces.append((centre_a, (step + 1) % segments, step))
            faces.append((centre_b, segments + step, segments + (step + 1) % segments))
    return new_mesh(name, verts, faces)


def band(name: str, path, width, thickness: float, up=(0, 0, 1)):
    """Sweep a rectangular section along a path: the scarf, the sandal straps.

    ``path`` is a list of (x, y, z) points; the section is widened along the
    local side direction and thickened along the local normal, so it drapes.
    """
    points = [Vector(p) for p in path]
    widths = list(width) if isinstance(width, (list, tuple)) else [width] * len(points)
    verts, faces = [], []
    up_vector = Vector(up).normalized()
    for index, point in enumerate(points):
        if index == 0:
            tangent = (points[1] - points[0]).normalized()
        elif index == len(points) - 1:
            tangent = (points[-1] - points[-2]).normalized()
        else:
            tangent = (points[index + 1] - points[index - 1]).normalized()
        side = tangent.cross(up_vector)
        if side.length < 1e-5:
            side = tangent.cross(Vector((1, 0, 0)))
        side.normalize()
        normal = side.cross(tangent).normalized()
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(tuple(point + side * (sx * widths[index] / 2) + normal * (sz * thickness / 2)))
    for index in range(len(points) - 1):
        base = index * 4
        nxt = (index + 1) * 4
        for edge in range(4):
            a = base + edge
            b = base + (edge + 1) % 4
            c = nxt + (edge + 1) % 4
            d = nxt + edge
            faces.append((a, b, c, d))
    faces.append((0, 1, 2, 3))
    last = (len(points) - 1) * 4
    faces.append((last + 3, last + 2, last + 1, last))
    return new_mesh(name, verts, faces)


def rounded_box(name: str, size, centre, bevel: float = 0.0, rotation=(0, 0, 0)):
    """A box, optionally bevelled: soles, hands, the moustache's core."""
    sx, sy, sz = size
    verts, faces = [], []
    corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
               (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
    for cx, cy, cz in corners:
        verts.append((centre[0] + cx * sx / 2, centre[1] + cy * sy / 2, centre[2] + cz * sz / 2))
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    obj = new_mesh(name, verts, faces)
    if bevel > 0:
        modifier = obj.modifiers.new("bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
        apply_modifiers(obj)
    if any(rotation):
        obj.rotation_euler = Euler(rotation)
        apply_transform(obj)
    return obj


def mirror_x(obj, suffix="_R"):
    """Every limb is built on +X (his left); this makes the other one."""
    mirror = obj.copy()
    mirror.data = obj.data.copy()
    mirror.name = obj.name.replace("_L", suffix)
    bpy.context.collection.objects.link(mirror)
    for vertex in mirror.data.vertices:
        vertex.co.x *= -1
    for poly in mirror.data.polygons:
        poly.flip()
    return mirror


def apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.clear()
    obj.data = mesh


def apply_transform(obj):
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)


# --------------------------------------------------------------------------- #
#  The skeleton. Heights in metres from the ground; the rig is a plain humanoid
#  so any animation tool (and the app's own gait code) can drive it.
# --------------------------------------------------------------------------- #

HEIGHT = 1.72
HIP_Z = 0.92
KNEE_Z = 0.48
ANKLE_Z = 0.088
WAIST_Z = 1.03
CHEST_Z = 1.28
SHOULDER_Z = 1.415
NECK_Z = 1.465
CHIN_Z = 1.505
HEAD_Z = 1.605
HIP_X = 0.095
SHOULDER_X = 0.185

BONES = [
    # name, head, tail, parent
    ("root", (0, 0, 0), (0, 0, 0.12), None),
    ("hips", (0, 0, HIP_Z), (0, 0, WAIST_Z), "root"),
    ("spine", (0, 0, WAIST_Z), (0, 0, CHEST_Z), "hips"),
    ("chest", (0, 0, CHEST_Z), (0, 0, SHOULDER_Z), "spine"),
    ("neck", (0, 0, SHOULDER_Z), (0, 0, NECK_Z + 0.02), "chest"),
    ("head", (0, 0, NECK_Z + 0.02), (0, 0, 1.73), "neck"),
    ("shoulder.L", (0.045, 0, SHOULDER_Z - 0.01), (SHOULDER_X, 0, SHOULDER_Z - 0.02), "chest"),
    ("upper_arm.L", (SHOULDER_X, 0, SHOULDER_Z - 0.02), (SHOULDER_X + 0.02, 0, SHOULDER_Z - 0.30), "shoulder.L"),
    ("forearm.L", (SHOULDER_X + 0.02, 0, SHOULDER_Z - 0.30), (SHOULDER_X + 0.03, 0, SHOULDER_Z - 0.56), "upper_arm.L"),
    ("hand.L", (SHOULDER_X + 0.03, 0, SHOULDER_Z - 0.56), (SHOULDER_X + 0.035, 0, SHOULDER_Z - 0.70), "forearm.L"),
    ("shoulder.R", (-0.045, 0, SHOULDER_Z - 0.01), (-SHOULDER_X, 0, SHOULDER_Z - 0.02), "chest"),
    ("upper_arm.R", (-SHOULDER_X, 0, SHOULDER_Z - 0.02), (-SHOULDER_X - 0.02, 0, SHOULDER_Z - 0.30), "shoulder.R"),
    ("forearm.R", (-SHOULDER_X - 0.02, 0, SHOULDER_Z - 0.30), (-SHOULDER_X - 0.03, 0, SHOULDER_Z - 0.56), "upper_arm.R"),
    ("hand.R", (-SHOULDER_X - 0.03, 0, SHOULDER_Z - 0.56), (-SHOULDER_X - 0.035, 0, SHOULDER_Z - 0.70), "forearm.R"),
    ("thigh.L", (HIP_X, 0, HIP_Z), (HIP_X, 0, KNEE_Z), "hips"),
    ("shin.L", (HIP_X, 0, KNEE_Z), (HIP_X, 0, ANKLE_Z), "thigh.L"),
    ("foot.L", (HIP_X, 0, ANKLE_Z), (HIP_X, -0.17, 0.045), "shin.L"),
    ("thigh.R", (-HIP_X, 0, HIP_Z), (-HIP_X, 0, KNEE_Z), "hips"),
    ("shin.R", (-HIP_X, 0, KNEE_Z), (-HIP_X, 0, ANKLE_Z), "thigh.R"),
    ("foot.R", (-HIP_X, 0, ANKLE_Z), (-HIP_X, -0.17, 0.045), "shin.R"),
    # Cloth bones, so the turban and the stole can swing a little.
    ("turban", (0, 0, 1.70), (0, 0, 1.83), "head"),
    ("scarf_front", (0.06, -0.10, 1.36), (0.055, -0.12, 1.06), "chest"),
]


def build_armature():
    armature = bpy.data.armatures.new("FarmerRig")
    rig = bpy.data.objects.new("FarmerRig", armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for name, head, tail, parent in BONES:
        bone = armature.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = True
        if parent:
            bone.parent = created[parent]
            bone.use_connect = False
        created[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
    return rig


# --------------------------------------------------------------------------- #
#  The character. Each block builds one region and registers which bones may
#  influence it.
# --------------------------------------------------------------------------- #

TORSO_BONES = {"hips": 0.5, "spine": 0.7, "chest": 0.9}
HEAD_BONES = {"head": 1.0}
FOREARM_L = {"forearm.L": 0.8, "hand.L": 0.4, "upper_arm.L": 0.3}
FOREARM_R = {"forearm.R": 0.8, "hand.R": 0.4, "upper_arm.R": 0.3}

#  The kurta's silhouette, shared by everything that has to sit on its surface:
#  the stole, the placket, the dhoti's waist.  (z, radius) from hem to collar.
KURTA_PROFILE = [
    (0.744, 0.155), (0.752, 0.163), (0.772, 0.160), (0.900, 0.161),
    (0.990, 0.170), (1.070, 0.172), (1.150, 0.178), (1.240, 0.185),
    (1.330, 0.189), (1.395, 0.174), (1.435, 0.130),
]
KURTA_DEPTH = 0.74  # how much shallower the body is than it is wide

#  The dhoti is tucked in above the kurta's hem, so it narrows where nobody can
#  see it and only flares below the shirt. Its folds use the same profile.
DHOTI_PROFILE = [
    (0.300, 0.132), (0.360, 0.140), (0.440, 0.152), (0.540, 0.166),
    (0.640, 0.176), (0.706, 0.174), (0.742, 0.158), (0.800, 0.150),
    (0.880, 0.148), (0.950, 0.150), (0.990, 0.152),
]
DHOTI_DEPTH = 0.80


def profile_radius(profile, z: float) -> float:
    if z <= profile[0][0]:
        return profile[0][1]
    if z >= profile[-1][0]:
        return profile[-1][1]
    for (z0, r0), (z1, r1) in zip(profile, profile[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return profile[-1][1]


def dhoti_front(x: float, z: float, out: float = 0.0) -> float:
    """The y of the front of the dhoti at (x, z), pushed out by ``out``."""
    radius = profile_radius(DHOTI_PROFILE, z)
    inside = math.sqrt(max(0.0, 1.0 - (x / radius) ** 2)) if radius > 0 else 0.0
    return -(radius * DHOTI_DEPTH * inside) - out


def kurta_radius(z: float) -> float:
    if z <= KURTA_PROFILE[0][0]:
        return KURTA_PROFILE[0][1]
    if z >= KURTA_PROFILE[-1][0]:
        return KURTA_PROFILE[-1][1]
    for (z0, r0), (z1, r1) in zip(KURTA_PROFILE, KURTA_PROFILE[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return r0 + (r1 - r0) * t
    return KURTA_PROFILE[-1][1]


def kurta_surface(x: float, z: float, out: float = 0.0) -> float:
    """The y of the *front* of the kurta at (x, z), pushed out by ``out``."""
    radius = kurta_radius(z)
    depth = radius * KURTA_DEPTH
    inside = math.sqrt(max(0.0, 1.0 - (x / radius) ** 2)) if radius > 0 else 0.0
    return -(depth * inside) - out


def coil(name: str, turns: float, z_bottom: float, z_top: float, radius, half_height: float,
         half_thick: float, steps_per_turn: int = 18, phase: float = 0.0, squash_y: float = 0.94):
    """Wind a band of cloth around an axis: the turban.

    A stack of flat rings reads as a pile of doughnuts; a single coiled band
    that steps inwards as it rises reads as cloth because every turn overlaps
    the one below it and the edges stay visible.
    """
    steps = max(8, int(turns * steps_per_turn))
    section = [(0.0, 1.0), (0.72, 0.7), (1.0, 0.0), (0.72, -0.7), (0.0, -1.0), (-0.72, -0.7), (-1.0, 0.0), (-0.72, 0.7)]
    verts, faces = [], []
    for index in range(steps + 1):
        t = index / steps
        angle = 2 * math.pi * turns * t + phase
        z = z_bottom + (z_top - z_bottom) * t
        r = radius(t)
        centre = Vector((math.cos(angle) * r, math.sin(angle) * r * squash_y, z))
        radial = Vector((math.cos(angle), math.sin(angle) * squash_y, 0.0)).normalized()
        up = Vector((0.0, 0.0, 1.0))
        for u, v in section:
            verts.append(tuple(centre + up * (u * half_height) + radial * (v * half_thick)))
    ring = len(section)
    for index in range(steps):
        for corner in range(ring):
            a = index * ring + corner
            b = index * ring + (corner + 1) % ring
            c = (index + 1) * ring + (corner + 1) % ring
            d = (index + 1) * ring + corner
            faces.append((a, b, c, d))
    faces.append(tuple(range(ring - 1, -1, -1)))
    last = steps * ring
    faces.append(tuple(last + corner for corner in range(ring)))
    return new_mesh(name, verts, faces)


# The three masses that make the head. Each is (radii, centre); their front
# surfaces are combined below to answer "where is the skin at (x, z)?".
SKULL = ((0.090, 0.096, 0.110), (0.0, 0.0, HEAD_Z))
JAW = ((0.066, 0.076, 0.060), (0.0, -0.002, HEAD_Z - 0.048))
CHIN = None

EYE_Z = HEAD_Z + 0.008
BROW_Z = HEAD_Z + 0.031
NOSE_Z = HEAD_Z - 0.024
MOUTH_Z = HEAD_Z - 0.060


def shape_y(shape, x: float, z: float):
    (rx, ry, rz), (cx, cy, cz) = shape
    a = (x - cx) / rx
    b = (z - cz) / rz
    k = 1.0 - a * a - b * b
    if k <= 0.0:
        return None
    return cy - ry * math.sqrt(k)


def face_y(x: float, z: float, out: float = 0.0) -> float:
    """The y of the front of the skin at (x, z), pushed out by ``out``."""
    hits = [shape_y(shape, x, z) for shape in (SKULL, JAW) if shape]
    hits = [hit for hit in hits if hit is not None]
    front = min(hits) if hits else -0.07
    return front - out


def loft(name: str, rings, segments: int = 12):
    """A stack of elliptical rings closed at both ends: noses, crowns, knots."""
    verts, faces = [], []
    for z, cy, rx, ry, cx in rings:
        for step in range(segments):
            angle = 2 * math.pi * step / segments
            verts.append((cx + math.cos(angle) * rx, cy + math.sin(angle) * ry, z))
    for index in range(len(rings) - 1):
        for step in range(segments):
            a = index * segments + step
            b = index * segments + (step + 1) % segments
            c = (index + 1) * segments + (step + 1) % segments
            d = (index + 1) * segments + step
            faces.append((a, b, c, d))
    bottom = len(verts)
    verts.append((rings[0][4], rings[0][1], rings[0][0]))
    top = len(verts)
    verts.append((rings[-1][4], rings[-1][1], rings[-1][0]))
    for step in range(segments):
        faces.append((bottom, (step + 1) % segments, step))
        base = (len(rings) - 1) * segments
        faces.append((top, base + step, base + (step + 1) % segments))
    return new_mesh(name, verts, faces)


def build_head():
    """A young man's face: warm skin, big brown eyes under a heavy brow, a
    handlebar moustache, and a jaw broad enough to read as grown-up."""
    register(ellipsoid("head_skull", SKULL[0], SKULL[1], 16, 22, squash_bottom=0.88),
             "skin", HEAD_BONES, rigid=True)
    register(ellipsoid("head_jaw", JAW[0], JAW[1], 12, 18, squash_bottom=0.94),
             "skin", HEAD_BONES, rigid=True)
    # The back of the skull carries a little hair above the neck.
    register(ellipsoid("hair_back", (0.086, 0.070, 0.075), (0, 0.030, HEAD_Z + 0.006), 12, 16),
             "hair", HEAD_BONES, rigid=True)
    # Neck: short and thick, sunk into the collar.
    register(tube("neck", (0, 0, NECK_Z - 0.10), (0, 0.004, CHIN_Z - 0.012), 0.058, 0.052, 14),
             "skin", {"neck": 0.85, "head": 0.45, "chest": 0.2})
    # Ears, tucked against the skull and behind the jaw line.
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        register(ellipsoid(f"ear_{label}", (0.010, 0.019, 0.026),
                           (side * 0.084, 0.010, HEAD_Z - 0.014), 8, 10), "skin", HEAD_BONES, rigid=True)
        register(ellipsoid(f"ear_inner_{label}", (0.005, 0.010, 0.014),
                           (side * 0.081, 0.010, HEAD_Z - 0.016), 6, 8),
                 "skin_deep", HEAD_BONES, rigid=True)

    # Eyes. A shallow lens lying on the skin, capped by a lid: nothing bulges
    # past the cheek the way a full sphere does.
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        x = side * 0.038
        surface = face_y(x, EYE_Z)
        centre_y = surface + 0.0032
        front = centre_y - 0.0075
        register(ellipsoid(f"eye_white_{label}", (0.0196, 0.0078, 0.0212), (x, centre_y, EYE_Z), 10, 16),
                 "eye_white", HEAD_BONES, rigid=True)
        register(ellipsoid(f"iris_{label}", (0.0130, 0.0022, 0.0135), (x, front - 0.0008, EYE_Z - 0.001), 10, 14),
                 "iris", HEAD_BONES, rigid=True)
        register(ellipsoid(f"pupil_{label}", (0.0066, 0.0018, 0.0070), (x, front - 0.0020, EYE_Z - 0.001), 8, 12),
                 "pupil", HEAD_BONES, rigid=True)
        register(ellipsoid(f"gleam_{label}", (0.0030, 0.0014, 0.0030),
                           (x - side * 0.0045, front - 0.0032, EYE_Z + 0.006), 6, 8),
                 "gleam", HEAD_BONES, rigid=True)
        # Lash line: the dark upper rim that gives the eye its shape.
        lash = band(f"lash_{label}",
                    [(x - side * 0.019, front - 0.001, EYE_Z + 0.002),
                     (x - side * 0.010, front - 0.002, EYE_Z + 0.012),
                     (x + side * 0.003, front - 0.003, EYE_Z + 0.015),
                     (x + side * 0.015, front - 0.002, EYE_Z + 0.009),
                     (x + side * 0.020, front - 0.001, EYE_Z + 0.001)],
                    0.0034, 0.0038, up=(0, -1, 0))
        register(lash, "hair", HEAD_BONES, rigid=True)
        # Brow: thick, dark, angled up towards the temple.
        brow = band(f"brow_{label}",
                    [(side * 0.013, face_y(side * 0.013, BROW_Z + 0.002) - 0.002, BROW_Z + 0.002),
                     (side * 0.027, face_y(side * 0.027, BROW_Z + 0.001) - 0.003, BROW_Z + 0.001),
                     (side * 0.040, face_y(side * 0.040, BROW_Z - 0.003) - 0.003, BROW_Z - 0.003),
                     (side * 0.052, face_y(side * 0.052, BROW_Z - 0.007) - 0.002, BROW_Z - 0.007),
                     (side * 0.061, face_y(side * 0.061, BROW_Z - 0.013) - 0.0015, BROW_Z - 0.013)],
                    0.013, 0.008, up=(0, -1, 0))
        register(brow, "hair", HEAD_BONES, rigid=True)

    # Nose: one lofted wedge from the brow to the wings, not a ball on the lip.
    nose_rings = []
    for z, rx, ry, drop in ((HEAD_Z + 0.028, 0.0095, 0.0090, -0.002),
                            (HEAD_Z + 0.004, 0.0105, 0.0110, 0.006),
                            (NOSE_Z + 0.010, 0.0125, 0.0135, 0.011),
                            (NOSE_Z - 0.002, 0.0155, 0.0145, 0.015),
                            (NOSE_Z - 0.011, 0.0135, 0.0105, 0.011)):
        nose_rings.append((z, face_y(0, z) - drop, rx, ry, 0.0))
    register(loft("nose", nose_rings, 12), "skin", HEAD_BONES, rigid=True)

    # The moustache: one handlebar sweeping across the lip, tips curling up.
    register(ellipsoid("moustache_core", (0.022, 0.014, 0.012),
                       (0, face_y(0, MOUTH_Z + 0.022) - 0.007, MOUTH_Z + 0.023), 8, 12),
             "hair", HEAD_BONES, rigid=True)
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        mid_x, tip_x = side * 0.043, side * 0.062
        mid = tube(f"moustache_mid_{label}",
                   (side * 0.008, face_y(side * 0.008, MOUTH_Z + 0.024) - 0.008, MOUTH_Z + 0.024),
                   (mid_x, face_y(mid_x, MOUTH_Z + 0.022) - 0.006, MOUTH_Z + 0.022),
                   0.0145, 0.0105, 10)
        register(mid, "hair", HEAD_BONES, rigid=True)
        tip = tube(f"moustache_tip_{label}",
                   (mid_x - side * 0.004, face_y(mid_x, MOUTH_Z + 0.022) - 0.007, MOUTH_Z + 0.022),
                   (tip_x, face_y(tip_x, MOUTH_Z + 0.036) - 0.003, MOUTH_Z + 0.036),
                   0.0115, 0.0035, 8)
        register(tip, "hair", HEAD_BONES, rigid=True)

    # Mouth: a thin, closed smile.
    smile = band("mouth",
                 [(-0.024, face_y(-0.024, MOUTH_Z + 0.004) - 0.002, MOUTH_Z + 0.004),
                  (-0.013, face_y(-0.013, MOUTH_Z) - 0.003, MOUTH_Z - 0.001),
                  (0.0, face_y(0, MOUTH_Z) - 0.003, MOUTH_Z - 0.002),
                  (0.013, face_y(0.013, MOUTH_Z) - 0.003, MOUTH_Z - 0.001),
                  (0.024, face_y(0.024, MOUTH_Z + 0.004) - 0.002, MOUTH_Z + 0.004)],
                 0.0055, 0.0045, up=(0, -1, 0))
    register(smile, "mouth", HEAD_BONES, rigid=True)
    # Lower lip, so the mouth is not a scratch.


    build_turban()


TURBAN_BOTTOM = HEAD_Z + 0.043
TURBAN_TOP = HEAD_Z + 0.148


def build_turban():
    """A red pagdi: one band of cloth wound three and a half times, a crown, a
    knot at the front and a tail down the back."""
    bottom, top = TURBAN_BOTTOM, TURBAN_TOP
    first_part = len(PARTS)

    def radius(t: float) -> float:
        # Full above the brow, a slight bulge at the second turn, tapering in.
        return 0.099 + 0.010 * math.sin(math.pi * t) - 0.028 * t ** 1.7

    turns = 3.4
    segments = 9
    span = turns / segments
    for index in range(segments):
        start = index / segments
        end = (index + 1) / segments
        z0 = bottom + (top - bottom) * start
        z1 = bottom + (top - bottom) * end

        def local(t, start=start, end=end):
            return radius(start + (end - start) * t)

        band_mesh = coil(f"turban_wind_{index}", span, z0, z1, local, 0.021, 0.016,
                         steps_per_turn=18, phase=2 * math.pi * turns * start)
        register(band_mesh, "turban" if index % 2 == 0 else "turban_fold", {"head": 1.0}, rigid=True)

    # Crown, closing the winding, plus the tucked end on top.
    register(ellipsoid("turban_crown", (0.070, 0.068, 0.036), (0, 0, top - 0.010), 10, 18),
             "turban", {"head": 1.0}, rigid=True)
    register(ellipsoid("turban_top_knot", (0.030, 0.028, 0.019), (0.010, -0.010, top + 0.007), 8, 12),
             "turban_fold", {"head": 1.0}, rigid=True)
    ring = lathe("turban_ring", [(top + 0.002, 0.017), (top + 0.010, 0.020), (top + 0.018, 0.017)],
                 segments=14)
    ring.data.transform(Matrix.Translation((0.010, -0.010, 0)))
    register(ring, "brass", {"head": 1.0}, rigid=True)
    register(band("turban_ring_pin",
                  [(0.016, -0.026, top + 0.008), (0.040, -0.038, top + 0.016),
                   (0.050, -0.032, top + 0.006)],
                  0.0045, 0.0035, up=(0, 1, 0)), "brass", {"head": 1.0}, rigid=True)

    # A tail of cloth falling behind his neck: the fold that says "turban".
    tail = band("turban_tail",
                [(0.050, 0.078, top - 0.020), (0.070, 0.096, bottom + 0.046),
                 (0.066, 0.104, bottom - 0.020), (0.050, 0.100, bottom - 0.070)],
                (0.056, 0.062, 0.066, 0.058), 0.013, up=(0, 1, 0))
    register(tail, "turban_fold", {"head": 0.85, "neck": 0.15}, rigid=True)
    tail_tip = band("turban_tail_tip",
                    [(0.050, 0.100, bottom - 0.068), (0.040, 0.094, bottom - 0.108),
                     (0.024, 0.086, bottom - 0.136)],
                    (0.056, 0.050, 0.030), 0.011, up=(0, 1, 0))
    register(tail_tip, "turban", {"head": 0.6, "neck": 0.3, "chest": 0.1}, rigid=True)

    # Tip the whole thing forward a few degrees: a turban sits low over the
    # brow and rides up at the back, which is what stops it reading as a helmet.
    pivot = Vector((0, 0, HEAD_Z + 0.070))
    tilt = (Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(7), 4, "X")
            @ Matrix.Translation(-pivot))
    for part in PARTS[first_part:]:
        part["object"].data.transform(tilt)


def build_body():
    """Kurta (cream), dhoti (white), and the stole (green)."""
    # Kurta: A-line, from mid-thigh to the collar, with a soft shoulder line.
    kurta = lathe("kurta", KURTA_PROFILE, segments=28, pleats=9, pleat_depth=0.010,
                  squash=(1.0, KURTA_DEPTH))
    register(kurta, "kurta", TORSO_BONES)
    # Collar: a narrow stand around the neck.
    register(lathe("kurta_collar", [(1.410, 0.074), (1.448, 0.068), (1.468, 0.060)],
                   segments=20, squash=(1.0, 0.94)), "kurta_shade", {"chest": 0.7, "neck": 0.6})
    # The shoulder yoke: one wide, shallow mass across the top of the chest so
    # the sleeves grow out of the kurta instead of being pinned on.
    register(ellipsoid("kurta_yoke", (0.198, 0.140, 0.078), (0, 0, 1.362), 12, 20),
             "kurta", {"chest": 1.0})
    # Placket: the buttoned seam down the chest, on the surface.
    placket = band("kurta_placket",
                   [(0, kurta_surface(0, 1.404, 0.004), 1.404),
                    (0, kurta_surface(0, 1.300, 0.006), 1.300),
                    (0, kurta_surface(0, 1.180, 0.006), 1.180)],
                   0.034, 0.008, up=(0, -1, 0))
    register(placket, "kurta_shade", TORSO_BONES)
    for index, z in enumerate((1.360, 1.300, 1.240, 1.180)):
        register(ellipsoid(f"button_{index}", (0.007, 0.005, 0.007),
                           (0, kurta_surface(0, z, 0.010), z), 6, 8),
                 "kurta_shade", TORSO_BONES, rigid=True)
    # Dhoti: white, wrapped, with real volume and pleats, to mid-calf.
    dhoti = lathe("dhoti", DHOTI_PROFILE, segments=32, pleats=15, pleat_depth=0.042,
                  squash=(1.0, DHOTI_DEPTH), pleat_bell=(0.590, 0.712))
    register(dhoti, "dhoti", {"hips": 0.9, "thigh.L": 0.45, "thigh.R": 0.45})
    # The pressed folds down the front: narrow panels standing off the cloth.
    for index, x_hit in enumerate((-0.072, -0.036, 0.0, 0.036, 0.072)):
        path = []
        for z, spread in ((0.742, 0.42), (0.680, 0.62), (0.590, 0.82), (0.470, 1.0), (0.340, 1.0)):
            path.append((x_hit * spread, dhoti_front(x_hit * spread, z, 0.005), z))
        pleat = band(f"dhoti_fold_{index}", path, (0.024, 0.028, 0.030, 0.032, 0.030), 0.011,
                     up=(0, -1, 0))
        register(pleat, "dhoti" if index % 2 == 0 else "dhoti_shade",
                 {"hips": 0.85, "thigh.L": 0.35, "thigh.R": 0.35})
    # The tucked end where the dhoti is knotted, hanging at his left hip.
    tuck = band("dhoti_tuck",
                [(0.096, -0.104, 0.760), (0.120, -0.116, 0.700), (0.128, -0.126, 0.620),
                 (0.120, -0.124, 0.540)],
                0.044, 0.012, up=(0, -1, 0))
    register(tuck, "dhoti", {"hips": 1.0})

    # Stole: round the neck, over both shoulders, hanging down the chest.
    register(lathe("scarf_ring", [(1.428, 0.078), (1.452, 0.082), (1.474, 0.076)],
                   segments=22, pleats=6, pleat_depth=0.025, squash=(1.0, 0.92)),
             "scarf", {"neck": 0.9, "chest": 0.3})
    register(ellipsoid("scarf_knot", (0.024, 0.020, 0.022), (0.044, -0.058, 1.432), 8, 12),
             "scarf_dark", {"chest": 1.0, "neck": 0.3}, rigid=True)
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        path = []
        for z, x in ((1.418, 0.048), (1.372, 0.080), (1.310, 0.094), (1.220, 0.098),
                     (1.140, 0.096), (1.060, 0.092), (1.020, 0.088), (0.995, 0.086)):
            path.append((side * x, kurta_surface(x, z, 0.012), z))
        widths = (0.044, 0.062, 0.068, 0.070, 0.068, 0.064, 0.048, 0.026)
        tail = band(f"scarf_tail_{label}", path, widths, 0.013, up=(0, -1, 0))
        register(tail, "scarf" if side > 0 else "scarf_dark", {"chest": 0.85, "spine": 0.35})
    # The long end down his back.
    back = band("scarf_back",
                [(0.040, 0.062, 1.442), (0.058, 0.098, 1.372), (0.066, 0.122, 1.280),
                 (0.062, 0.130, 1.180), (0.056, 0.128, 1.090), (0.050, 0.126, 1.030)],
                (0.046, 0.064, 0.070, 0.072, 0.068, 0.048), 0.012, up=(0, 1, 0))
    register(back, "scarf_dark", {"chest": 0.85, "spine": 0.3})


def build_arms():
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        x = side * SHOULDER_X
        # Upper arm under the sleeve, so the sleeve is never empty at the cuff.
        register(tube(f"upper_arm_{label}", (x, 0, 1.330), (x + side * 0.010, 0, 1.150),
                      0.048, 0.042, 12), "skin", {f"upper_arm.{label}": 1.0, "chest": 0.2})
        # Sleeve: the kurta's short sleeve, rolled at the cuff.
        sleeve = lathe(f"kurta_sleeve_{label}",
                       [(1.150, 0.058), (1.210, 0.062), (1.268, 0.066),
                        (1.320, 0.068), (1.360, 0.068), (1.392, 0.058),
                        (1.408, 0.030)],
                       segments=16)
        sleeve.data.transform(Matrix.Translation((x + side * 0.004, 0, 0)))
        register(sleeve, "kurta", {f"upper_arm.{label}": 1.0, "chest": 0.35})
        cuff = lathe(f"sleeve_cuff_{label}", [(1.150, 0.062), (1.168, 0.064), (1.184, 0.060)],
                     segments=16)
        cuff.data.transform(Matrix.Translation((x + side * 0.004, 0, 0)))
        register(cuff, "kurta_shade", {f"upper_arm.{label}": 1.0})
        # Bare forearm below the rolled cuff.
        register(tube(f"forearm_{label}", (x + side * 0.004, 0, 1.175), (x + side * 0.018, 0, 0.898),
                      0.042, 0.031, 12), "skin", {f"forearm.{label}": 1.0, f"upper_arm.{label}": 0.25})
        # Palm, fingers and thumb: a hand, not a paddle.
        palm = rounded_box(f"hand_{label}", (0.028, 0.056, 0.076),
                           (x + side * 0.022, -0.004, 0.862), 0.013)
        register(palm, "skin", {f"hand.{label}": 1.0}, rigid=True)
        for finger in range(4):
            fx = (finger - 1.5) * 0.016
            start = (x + side * 0.022 + fx, -0.026, 0.824)
            end = (x + side * 0.024 + fx * 1.12, -0.040, 0.770)
            register(tube(f"finger_{label}_{finger}", start, end, 0.0078, 0.0060, 8),
                     "skin", {f"hand.{label}": 1.0}, rigid=True)
        register(tube(f"thumb_{label}", (x + side * 0.010, -0.026, 0.884),
                      (x + side * 0.008, -0.040, 0.842), 0.011, 0.0075, 8),
                 "skin", {f"hand.{label}": 1.0}, rigid=True)


def build_legs():
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        x = side * HIP_X
        # Only the calf shows below the dhoti; the rest is inside the cloth.
        calf = lathe(f"shin_{label}",
                     [(0.095, 0.043), (0.150, 0.050), (0.220, 0.058), (0.290, 0.062),
                      (0.360, 0.060), (0.440, 0.056)],
                     segments=14)
        calf.data.transform(Matrix.Translation((x, 0, 0)))
        register(calf, "skin", {f"shin.{label}": 1.0, f"thigh.{label}": 0.25, f"foot.{label}": 0.15})
        # Foot: rounded at the heel, tapering to the toes, pointing -Y.
        foot = ellipsoid(f"foot_{label}", (0.040, 0.098, 0.036), (x, -0.040, 0.062), 10, 14)
        register(foot, "skin", {f"foot.{label}": 1.0}, rigid=True)
        register(ellipsoid(f"heel_{label}", (0.036, 0.040, 0.036), (x, 0.024, 0.058), 8, 12),
                 "skin", {f"foot.{label}": 1.0}, rigid=True)
        for toe in range(5):
            tx = (toe - 2) * 0.014
            register(ellipsoid(f"toe_{label}_{toe}", (0.0072, 0.013, 0.0085),
                               (x + tx, -0.118 + abs(tx) * 0.30, 0.030), 6, 8),
                     "skin", {f"foot.{label}": 1.0}, rigid=True)
        # Sandal: a leather sole and two straps.
        sole = lathe(f"sandal_sole_{label}",
                     [(0.006, 0.040), (0.012, 0.047), (0.020, 0.047), (0.028, 0.040)],
                     segments=16, squash=(1.0, 2.28))
        sole.data.transform(Matrix.Translation((x, -0.046, 0)))
        register(sole, "sole", {f"foot.{label}": 1.0}, rigid=True)
        strap = band(f"sandal_strap_{label}",
                     [(x - 0.040, -0.096, 0.030), (x - 0.020, -0.084, 0.068),
                      (x, -0.080, 0.076), (x + 0.020, -0.084, 0.068), (x + 0.040, -0.096, 0.030)],
                     0.024, 0.009, up=(0, -1, 0))
        register(strap, "leather", {f"foot.{label}": 1.0}, rigid=True)
        back_strap = band(f"sandal_back_{label}",
                          [(x - 0.034, 0.026, 0.030), (x - 0.024, 0.010, 0.062),
                           (x + 0.024, 0.010, 0.062), (x + 0.034, 0.026, 0.030)],
                          0.020, 0.008, up=(0, 1, 0))
        register(back_strap, "leather", {f"foot.{label}": 1.0}, rigid=True)
        diagonal = band(f"sandal_diag_{label}",
                        [(x - 0.034, -0.070, 0.040), (x + 0.010, -0.030, 0.062),
                         (x + 0.030, 0.014, 0.044)],
                        0.016, 0.007, up=(0, -1, 0))
        register(diagonal, "leather", {f"foot.{label}": 1.0}, rigid=True)


# --------------------------------------------------------------------------- #
#  Skinning: distance-weighted assignment to the bones each part declares.
# --------------------------------------------------------------------------- #


def bone_segments(rig) -> dict[str, tuple[Vector, Vector]]:
    return {bone.name: (bone.head_local.copy(), bone.tail_local.copy()) for bone in rig.data.bones}


def distance_to_segment(point: Vector, a: Vector, b: Vector) -> float:
    ab = b - a
    if ab.length_squared < 1e-9:
        return (point - a).length
    t = max(0.0, min(1.0, (point - a).dot(ab) / ab.length_squared))
    return (point - (a + ab * t)).length


def skin(parts, rig):
    """Weight every part while the parts are still separate objects.

    Vertex groups survive a join and are merged by name, and doing it this way
    means a vertex can never be attributed to the wrong part's bones.
    """
    segments = bone_segments(rig)
    for part in parts:
        obj = part["object"]
        bones = part["bones"]
        groups: dict[str, bpy.types.VertexGroup] = {}

        def group(name: str, _obj=obj):
            if name not in groups:
                groups[name] = _obj.vertex_groups.new(name=name)
            return groups[name]

        for vertex in obj.data.vertices:
            point = vertex.co.copy()
            if part["rigid"] or len(bones) == 1:
                name = next(iter(bones))
                weight = 1.0
                assignments = [(name, weight)]
            else:
                raw = []
                for name, base in bones.items():
                    a, b = segments[name]
                    distance = distance_to_segment(point, a, b)
                    raw.append((name, base / (distance + 0.02) ** 2.5))
                raw.sort(key=lambda item: item[1], reverse=True)
                raw = raw[:3]
                total = sum(value for _, value in raw)
                assignments = [(name, value / total) for name, value in raw if total > 0]
            for name, weight in assignments:
                group(name, obj).add([vertex.index], weight, "REPLACE")


def join_parts(parts, name="Farmer"):
    objects = [part["object"] for part in parts]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    joined.data.name = name
    return joined


# --------------------------------------------------------------------------- #
#  Animation. Each clip is a dict: bone -> [(frame, (rx, ry, rz) degrees)].
#  Poses are written in degrees because that is how a person thinks about them.
# --------------------------------------------------------------------------- #


def degrees(rx=0.0, ry=0.0, rz=0.0):
    return Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ").to_quaternion()


CLIPS = {
    # Standing. Breathing, a little weight shift, and the head never dead still.
    "Idle": {
        "length": 96,
        "loop": True,
        "tracks": {
            "chest": [(0, (0, 0, 0)), (24, (1.6, 0, 0.8)), (48, (0, 0, 0)), (72, (-1.2, 0, -0.8)), (96, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (30, (-1.5, 4, 0)), (60, (1, -3, 0)), (96, (0, 0, 0))],
            "upper_arm.L": [(0, (0, 0, 6)), (48, (0, 0, 8)), (96, (0, 0, 6))],
            "upper_arm.R": [(0, (0, 0, -6)), (48, (0, 0, -8)), (96, (0, 0, -6))],
            "spine": [(0, (0, 0, 0)), (48, (0.8, 0, 0)), (96, (0, 0, 0))],
        },
    },
    # Walking: the cycle the app drives by ground covered. 32 frames at 30 fps.
    "Walk": {
        "length": 32,
        "loop": True,
        "tracks": {
            "thigh.L": [(0, (26, 0, 0)), (8, (0, 0, 0)), (16, (-24, 0, 0)), (24, (0, 0, 0)), (32, (26, 0, 0))],
            "shin.L": [(0, (-6, 0, 0)), (8, (-26, 0, 0)), (16, (-4, 0, 0)), (24, (-2, 0, 0)), (32, (-6, 0, 0))],
            "thigh.R": [(0, (-24, 0, 0)), (8, (0, 0, 0)), (16, (26, 0, 0)), (24, (0, 0, 0)), (32, (-24, 0, 0))],
            "shin.R": [(0, (-4, 0, 0)), (8, (-2, 0, 0)), (16, (-6, 0, 0)), (24, (-26, 0, 0)), (32, (-4, 0, 0))],
            "foot.L": [(0, (8, 0, 0)), (8, (-6, 0, 0)), (16, (4, 0, 0)), (24, (10, 0, 0)), (32, (8, 0, 0))],
            "foot.R": [(0, (4, 0, 0)), (8, (10, 0, 0)), (16, (8, 0, 0)), (24, (-6, 0, 0)), (32, (4, 0, 0))],
            "upper_arm.L": [(0, (-20, 0, 5)), (16, (20, 0, 5)), (32, (-20, 0, 5))],
            "upper_arm.R": [(0, (20, 0, -5)), (16, (-20, 0, -5)), (32, (20, 0, -5))],
            "forearm.L": [(0, (-16, 0, 0)), (16, (-8, 0, 0)), (32, (-16, 0, 0))],
            "forearm.R": [(0, (-8, 0, 0)), (16, (-16, 0, 0)), (32, (-8, 0, 0))],
            "hips": [(0, (0, 0, 4)), (8, (0, 0, 0)), (16, (0, 0, -4)), (24, (0, 0, 0)), (32, (0, 0, 4))],
            "chest": [(0, (2, 0, -3)), (16, (2, 0, 3)), (32, (2, 0, -3))],
            "head": [(0, (-2, 0, 0)), (16, (-2, 0, 0)), (32, (-2, 0, 0))],
        },
    },
    # Running: longer stride, forward lean, arms pumping.
    "Run": {
        "length": 22,
        "loop": True,
        "tracks": {
            "thigh.L": [(0, (44, 0, 0)), (6, (6, 0, 0)), (11, (-38, 0, 0)), (17, (4, 0, 0)), (22, (44, 0, 0))],
            "shin.L": [(0, (-30, 0, 0)), (6, (-46, 0, 0)), (11, (-10, 0, 0)), (17, (-14, 0, 0)), (22, (-30, 0, 0))],
            "thigh.R": [(0, (-38, 0, 0)), (6, (4, 0, 0)), (11, (44, 0, 0)), (17, (6, 0, 0)), (22, (-38, 0, 0))],
            "shin.R": [(0, (-10, 0, 0)), (6, (-14, 0, 0)), (11, (-30, 0, 0)), (17, (-46, 0, 0)), (22, (-10, 0, 0))],
            "upper_arm.L": [(0, (-46, 0, 8)), (11, (34, 0, 8)), (22, (-46, 0, 8))],
            "upper_arm.R": [(0, (34, 0, -8)), (11, (-46, 0, -8)), (22, (34, 0, -8))],
            "forearm.L": [(0, (-70, 0, 0)), (11, (-50, 0, 0)), (22, (-70, 0, 0))],
            "forearm.R": [(0, (-50, 0, 0)), (11, (-70, 0, 0)), (22, (-50, 0, 0))],
            "spine": [(0, (10, 0, 0)), (11, (12, 0, 0)), (22, (10, 0, 0))],
            "chest": [(0, (6, 0, -6)), (11, (6, 0, 6)), (22, (6, 0, -6))],
            "head": [(0, (-12, 0, 0)), (22, (-12, 0, 0))],
            "hips": [(0, (0, 0, 6)), (11, (0, 0, -6)), (22, (0, 0, 6))],
        },
    },
    # Looking around: slow head turns, a little shoulder follow.
    "LookAround": {
        "length": 150,
        "loop": False,
        "tracks": {
            "head": [(0, (0, 0, 0)), (25, (4, 34, 0)), (55, (4, 34, 0)), (85, (-6, -30, 0)),
                     (115, (-6, -30, 0)), (150, (0, 0, 0))],
            "neck": [(0, (0, 0, 0)), (25, (2, 14, 0)), (85, (-2, -12, 0)), (150, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (25, (0, 6, 0)), (85, (0, -6, 0)), (150, (0, 0, 0))],
        },
    },
    # Bending down: hips back, knees bent, spine folded, arms hanging.
    "BendDown": {
        "length": 70,
        "loop": False,
        "tracks": {
            "hips": [(0, (0, 0, 0)), (20, (28, 0, 0)), (48, (30, 0, 0)), (70, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (20, (26, 0, 0)), (48, (28, 0, 0)), (70, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (20, (12, 0, 0)), (48, (14, 0, 0)), (70, (0, 0, 0))],
            "thigh.L": [(0, (0, 0, 0)), (20, (-34, 0, 0)), (48, (-36, 0, 0)), (70, (0, 0, 0))],
            "thigh.R": [(0, (0, 0, 0)), (20, (-34, 0, 0)), (48, (-36, 0, 0)), (70, (0, 0, 0))],
            "shin.L": [(0, (0, 0, 0)), (20, (36, 0, 0)), (48, (38, 0, 0)), (70, (0, 0, 0))],
            "shin.R": [(0, (0, 0, 0)), (20, (36, 0, 0)), (48, (38, 0, 0)), (70, (0, 0, 0))],
            "upper_arm.L": [(0, (0, 0, 4)), (20, (-26, 0, 4)), (48, (-30, 0, 4)), (70, (0, 0, 4))],
            "upper_arm.R": [(0, (0, 0, -4)), (20, (-26, 0, -4)), (48, (-30, 0, -4)), (70, (0, 0, -4))],
            "head": [(0, (0, 0, 0)), (20, (18, 0, 0)), (48, (20, 0, 0)), (70, (0, 0, 0))],
        },
    },
    # Picking something up: bend, reach, close the hand, stand with it.
    "PickUp": {
        "length": 96,
        "loop": False,
        "tracks": {
            "hips": [(0, (0, 0, 0)), (28, (30, 0, 0)), (52, (30, 0, 0)), (96, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (28, (28, 0, 0)), (52, (26, 0, 0)), (96, (0, 0, 0))],
            "thigh.L": [(0, (0, 0, 0)), (28, (-38, 0, 0)), (52, (-38, 0, 0)), (96, (0, 0, 0))],
            "thigh.R": [(0, (0, 0, 0)), (28, (-38, 0, 0)), (52, (-38, 0, 0)), (96, (0, 0, 0))],
            "shin.L": [(0, (0, 0, 0)), (28, (42, 0, 0)), (52, (42, 0, 0)), (96, (0, 0, 0))],
            "shin.R": [(0, (0, 0, 0)), (28, (42, 0, 0)), (52, (42, 0, 0)), (96, (0, 0, 0))],
            "upper_arm.R": [(0, (0, 0, -4)), (28, (-58, 0, -6)), (52, (-58, 0, -6)), (70, (-40, 0, -6)), (96, (0, 0, -4))],
            "forearm.R": [(0, (0, 0, 0)), (28, (-26, 0, 0)), (52, (-30, 0, 0)), (70, (-60, 0, 0)), (96, (0, 0, 0))],
            "hand.R": [(0, (0, 0, 0)), (46, (0, 0, 0)), (56, (-40, 0, 0)), (96, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (28, (20, 0, 0)), (96, (0, 0, 0))],
        },
    },
    # Feeding the cattle: hold the basket, step the arm forward, tip, return.
    "FeedCattle": {
        "length": 110,
        "loop": False,
        "tracks": {
            "chest": [(0, (0, 0, 0)), (30, (6, 0, -8)), (70, (8, 0, -10)), (110, (0, 0, 0))],
            "upper_arm.L": [(0, (0, 0, 6)), (30, (-46, 0, 12)), (70, (-54, 0, 14)), (110, (0, 0, 6))],
            "forearm.L": [(0, (0, 0, 0)), (30, (-50, 0, 0)), (70, (-54, 0, 0)), (110, (0, 0, 0))],
            "hand.L": [(0, (0, 0, 0)), (55, (0, 0, 0)), (66, (-24, 0, 0)), (110, (0, 0, 0))],
            "upper_arm.R": [(0, (0, 0, -6)), (30, (-10, 0, -16)), (110, (0, 0, -6))],
            "spine": [(0, (0, 0, 0)), (30, (4, 0, 0)), (110, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (30, (4, 0, 10)), (110, (0, 0, 0))],
        },
    },
    # Watering the crops: a wide swing of the arm, as if casting a pot of water.
    "WaterCrops": {
        "length": 90,
        "loop": True,
        "tracks": {
            "upper_arm.R": [(0, (-30, 0, -20)), (30, (-70, 0, -34)), (60, (-20, 0, -12)), (90, (-30, 0, -20))],
            "forearm.R": [(0, (-30, 0, 0)), (30, (-20, 0, 0)), (60, (-40, 0, 0)), (90, (-30, 0, 0))],
            "hand.R": [(0, (0, 0, 0)), (30, (20, 0, 0)), (60, (-16, 0, 0)), (90, (0, 0, 0))],
            "spine": [(0, (2, 0, 4)), (45, (4, 0, -4)), (90, (2, 0, 4))],
            "chest": [(0, (0, 0, 6)), (45, (0, 0, -6)), (90, (0, 0, 6))],
            "head": [(0, (6, 0, 0)), (90, (6, 0, 0))],
        },
    },
    # A greeting: right hand up, a wave, down again.
    "Gesture": {
        "length": 72,
        "loop": False,
        "tracks": {
            "upper_arm.R": [(0, (0, 0, -6)), (18, (-96, 0, -22)), (44, (-96, 0, -22)), (72, (0, 0, -6))],
            "forearm.R": [(0, (0, 0, 0)), (18, (-30, 0, 0)), (30, (-24, 0, 0)), (44, (-34, 0, 0)), (72, (0, 0, 0))],
            "hand.R": [(0, (0, 0, 0)), (24, (0, 0, 18)), (36, (0, 0, -18)), (48, (0, 0, 14)), (72, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (18, (0, -6, 0)), (72, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (18, (0, 0, 4)), (72, (0, 0, 0))],
        },
    },
}


def build_actions(rig):
    rig.animation_data_create()
    actions = {}
    for name, clip in CLIPS.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        for bone_name, keys in clip["tracks"].items():
            pose_bone = rig.pose.bones[bone_name]
            for frame, angles in keys:
                pose_bone.rotation_quaternion = degrees(*angles)
                pose_bone.keyframe_insert("rotation_quaternion", frame=frame)
        # Make every curve cycle cleanly, so a loop does not hitch.
        for curve in action.fcurves:
            curve.extrapolation = "LINEAR"
            if clip["loop"]:
                for keyframe in curve.keyframe_points:
                    keyframe.interpolation = "BEZIER"
                    keyframe.handle_left_type = "AUTO_CLAMPED"
                    keyframe.handle_right_type = "AUTO_CLAMPED"
        action.frame_range  # force evaluation
        actions[name] = action
    rig.animation_data.action = actions["Idle"]
    scene = bpy.context.scene
    scene.frame_start = 0
    scene.frame_end = 96
    return actions


# --------------------------------------------------------------------------- #
#  Scene, render and export.
# --------------------------------------------------------------------------- #


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 28
    scene.cycles.use_denoising = True
    scene.render.film_transparent = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 860
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 90
    # AgX (the 4.x default) rolls the reds of the turban off into salmon and
    # greys the blacks; Standard keeps the palette the brief asks for.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.15
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs[0].default_value = srgb("#DCE3DA")
    background.inputs[1].default_value = 0.72

    # Soft key + rim, the warm earthy light of the farm at nine in the morning.
    key = bpy.data.lights.new("key", "AREA")
    key.energy = 210
    key.size = 2.2
    key.color = (1.0, 0.95, 0.86)
    key_obj = bpy.data.objects.new("key", key)
    key_obj.location = (1.6, -2.0, 2.6)
    key_obj.rotation_euler = Euler((math.radians(52), 0, math.radians(38)))
    bpy.context.collection.objects.link(key_obj)

    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 40
    fill.size = 3.0
    fill.color = (0.86, 0.92, 1.0)
    fill_obj = bpy.data.objects.new("fill", fill)
    fill_obj.location = (-2.0, -1.4, 1.8)
    fill_obj.rotation_euler = Euler((math.radians(70), 0, math.radians(-52)))
    bpy.context.collection.objects.link(fill_obj)

    rim = bpy.data.lights.new("rim", "AREA")
    rim.energy = 130
    rim.size = 1.6
    rim.color = (1.0, 0.9, 0.8)
    rim_obj = bpy.data.objects.new("rim", rim)
    rim_obj.location = (-0.6, 2.4, 2.4)
    rim_obj.rotation_euler = Euler((math.radians(115), 0, math.radians(-160)))
    bpy.context.collection.objects.link(rim_obj)

    # A soft ground, only for the renders (it is not exported into the asset).
    ground_mesh = new_mesh("render_ground", [(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [(0, 1, 2, 3)])
    ground_mesh.data.materials.append(material("dhoti_shade"))
    ground_mesh.hide_render = False
    return scene


def render_views(out_dir: str, prefix: str = "farmer") -> list[str]:
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("cam")
    camera_data.lens = 85
    camera = bpy.data.objects.new("cam", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    target = Vector((0, 0, 0.92))
    distance = 4.2
    written = []
    views = {
        "front": 0,
        "three-quarter": 35,
        "side": 90,
        "back": 180,
    }
    for name, angle in views.items():
        radians = math.radians(angle)
        # The character faces -Y, so the camera for "front" sits at -Y.
        camera.location = (math.sin(radians) * distance, -math.cos(radians) * distance, 1.30)
        direction = target - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(out_dir, f"{prefix}-{name}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written.append(path)
    # Face close-up.
    camera.location = (0.16, -0.85, 1.66)
    camera_data.lens = 110
    direction = Vector((0, 0, 1.60)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x = 620
    scene.render.resolution_y = 620
    path = os.path.join(out_dir, f"{prefix}-face.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    written.append(path)
    return written


def main():
    argv = sys.argv
    out_dir = "public/models"
    if "--" in argv:
        args = argv[argv.index("--") + 1 :]
        for index, arg in enumerate(args):
            if arg == "--out" and index + 1 < len(args):
                out_dir = args[index + 1]
    os.makedirs(out_dir, exist_ok=True)
    render_dir = os.path.join(out_dir, "..", "..", "reports", "character")
    render_dir = os.path.abspath(render_dir)
    os.makedirs(render_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)

    rig = build_armature()
    build_head()
    build_body()
    build_arms()
    build_legs()

    parts = PARTS
    if os.environ.get("FARMER_DEBUG"):
        for part in parts:
            xs = [v.co.x for v in part["object"].data.vertices]
            zs = [v.co.z for v in part["object"].data.vertices]
            print(f"[part] {part['object'].name:24s} x {min(xs):+.3f}..{max(xs):+.3f} "
                  f"z {min(zs):.3f}..{max(zs):.3f} bones={sorted(part['bones'])}")
    skin(parts, rig)
    farmer = join_parts(parts)

    # Bind: armature modifier + parent, then check the vertex groups line up.
    modifier = farmer.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    farmer.parent = rig

    actions = build_actions(rig)

    # A single skinned mesh, so the GLB has one draw call for the body.
    triangles = sum(len(poly.vertices) - 2 for poly in farmer.data.polygons)
    print(f"[farmer] vertices={len(farmer.data.vertices)} triangles={triangles} "
          f"bones={len(rig.data.bones)} actions={len(actions)}")

    scene = setup_scene()
    scene.render.fps = 30

    blend_path = os.path.join(out_dir, "..", "..", "assets", "character", "farmer.blend")
    blend_path = os.path.abspath(blend_path)
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("[farmer] saved", blend_path)

    # Renders before the export, while the render ground and lights are still in
    # the file; the exporter below only takes the rig and the mesh.
    if os.environ.get("FARMER_RENDER", "1") == "1":
        for path in render_views(render_dir):
            print("[farmer] rendered", path, os.path.getsize(path), "bytes")

    # Export only the character.
    for obj in bpy.data.objects:
        obj.select_set(obj in (farmer, rig))
    bpy.context.view_layer.objects.active = rig
    glb_path = os.path.join(out_dir, "farmer.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_bake_animation=True,
        export_nla_strips=False,
        export_frame_range=False,
        export_force_sampling=True,
        export_skins=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    print("[farmer] exported", glb_path, os.path.getsize(glb_path), "bytes")


if __name__ == "__main__":
    main()
