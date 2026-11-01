#!/usr/bin/env python3
"""Face and turban for the farmer.

Everything on the face is placed *against a computed skin surface* rather than
guessed at, so the eyes, brows, nose and moustache sit on the head instead of
floating off it — which is what a pile of hand-placed primitives looks like.
"""

# The three masses that make the head. Each is (radii, centre); their front
# surfaces are combined below to answer "where is the skin at (x, z)?".
SKULL = ((0.090, 0.096, 0.110), (0.0, 0.0, HEAD_Z))
JAW = ((0.074, 0.082, 0.062), (0.0, -0.004, HEAD_Z - 0.058))
CHIN = ((0.032, 0.028, 0.024), (0.0, -0.060, HEAD_Z - 0.106))

EYE_Z = HEAD_Z + 0.008
BROW_Z = HEAD_Z + 0.036
NOSE_Z = HEAD_Z - 0.034
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
    hits = [shape_y(shape, x, z) for shape in (SKULL, JAW, CHIN)]
    hits = [hit for hit in hits if hit is not None]
    front = min(hits) if hits else -0.07
    return front - out


def build_head():
    """A young man's face: warm skin, big brown eyes under a heavy brow, a
    handlebar moustache, and a jaw broad enough to read as grown-up."""
    register(ellipsoid("head_skull", SKULL[0], SKULL[1], 16, 22, squash_bottom=0.88),
             "skin", HEAD_BONES, rigid=True)
    register(ellipsoid("head_jaw", JAW[0], JAW[1], 12, 18, squash_bottom=0.88),
             "skin", HEAD_BONES, rigid=True)
    register(ellipsoid("head_chin", CHIN[0], CHIN[1], 8, 12), "skin", HEAD_BONES, rigid=True)
    # Neck: short and thick, sunk into the collar.
    register(tube("neck", (0, 0, NECK_Z - 0.10), (0, 0.004, CHIN_Z - 0.012), 0.058, 0.052, 14),
             "skin", {"neck": 0.85, "head": 0.45, "chest": 0.2})
    # Ears, tucked against the skull and behind the jaw line.
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        register(ellipsoid(f"ear_{label}", (0.011, 0.022, 0.029),
                           (side * 0.086, 0.006, HEAD_Z - 0.010), 8, 10), "skin", HEAD_BONES, rigid=True)
        register(ellipsoid(f"ear_inner_{label}", (0.006, 0.012, 0.016),
                           (side * 0.090, 0.004, HEAD_Z - 0.012), 6, 8),
                 "skin_deep", HEAD_BONES, rigid=True)

    # Eyes. A flattened lens on the skin, not a bead: the sclera is shallow in
    # y so nothing bulges past the cheek, and a lash line caps it.
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        x = side * 0.038
        surface = face_y(x, EYE_Z)
        register(ellipsoid(f"eye_socket_{label}", (0.030, 0.012, 0.030),
                           (x, surface + 0.008, EYE_Z + 0.002), 10, 14),
                 "skin_deep", HEAD_BONES, rigid=True)
        register(ellipsoid(f"eye_white_{label}", (0.023, 0.007, 0.026),
                           (x, surface + 0.0025, EYE_Z), 10, 16),
                 "eye_white", HEAD_BONES, rigid=True)
        register(ellipsoid(f"iris_{label}", (0.0135, 0.004, 0.0140),
                           (x, surface + 0.0005, EYE_Z - 0.001), 10, 14),
                 "iris", HEAD_BONES, rigid=True)
        register(ellipsoid(f"pupil_{label}", (0.0068, 0.003, 0.0072),
                           (x, surface - 0.0010, EYE_Z - 0.001), 8, 12),
                 "pupil", HEAD_BONES, rigid=True)
        register(ellipsoid(f"gleam_{label}", (0.0032, 0.002, 0.0032),
                           (x - side * 0.005, surface - 0.0026, EYE_Z + 0.007), 6, 8),
                 "gleam", HEAD_BONES, rigid=True)
        # Upper lash line, following the eye's top arc.
        lash = band(f"lash_{label}",
                    [(x - side * 0.023, surface - 0.001, EYE_Z + 0.004),
                     (x - side * 0.013, surface - 0.005, EYE_Z + 0.017),
                     (x + side * 0.002, surface - 0.006, EYE_Z + 0.022),
                     (x + side * 0.016, surface - 0.004, EYE_Z + 0.014),
                     (x + side * 0.024, surface - 0.001, EYE_Z + 0.001)],
                    0.009, 0.007, up=(0, -1, 0))
        register(lash, "hair", HEAD_BONES, rigid=True)
        # Brow: thick and dark, angled up towards the temple.
        brow_x = side * 0.040
        brow_surface = face_y(brow_x, BROW_Z)
        brow = band(f"brow_{label}",
                    [(side * 0.010, face_y(side * 0.010, BROW_Z + 0.004) - 0.003, BROW_Z - 0.006),
                     (side * 0.030, brow_surface - 0.004, BROW_Z),
                     (side * 0.050, face_y(side * 0.050, BROW_Z + 0.006) - 0.003, BROW_Z + 0.006),
                     (side * 0.064, face_y(side * 0.064, BROW_Z - 0.002) - 0.001, BROW_Z - 0.002)],
                    0.019, 0.010, up=(0, -1, 0))
        register(brow, "hair", HEAD_BONES, rigid=True)

    # Nose: a bridge off the brow, a rounded tip, and two small wings.
    register(tube("nose_bridge", (0, face_y(0, HEAD_Z + 0.018) + 0.006, HEAD_Z + 0.018),
                  (0, face_y(0, NOSE_Z) - 0.008, NOSE_Z), 0.010, 0.017, 8),
             "skin", HEAD_BONES, rigid=True)
    register(ellipsoid("nose_tip", (0.019, 0.020, 0.017), (0, face_y(0, NOSE_Z) - 0.011, NOSE_Z), 8, 12),
             "skin", HEAD_BONES, rigid=True)
    for side in (1, -1):
        register(ellipsoid(f"nostril_{'L' if side > 0 else 'R'}", (0.009, 0.011, 0.010),
                           (side * 0.017, face_y(side * 0.017, NOSE_Z - 0.008) - 0.008, NOSE_Z - 0.009), 6, 8),
                 "skin", HEAD_BONES, rigid=True)

    # The moustache: one handlebar sweeping across the lip, tips curling up.
    register(ellipsoid("moustache_core", (0.021, 0.014, 0.013),
                       (0, face_y(0, MOUTH_Z + 0.012) - 0.007, MOUTH_Z + 0.013), 8, 12),
             "hair", HEAD_BONES, rigid=True)
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        mid_x, tip_x = side * 0.040, side * 0.055
        mid = tube(f"moustache_mid_{label}",
                   (side * 0.008, face_y(side * 0.008, MOUTH_Z + 0.014) - 0.008, MOUTH_Z + 0.013),
                   (mid_x, face_y(mid_x, MOUTH_Z + 0.013) - 0.006, MOUTH_Z + 0.012),
                   0.015, 0.011, 10)
        register(mid, "hair", HEAD_BONES, rigid=True)
        tip = tube(f"moustache_tip_{label}",
                   (mid_x, face_y(mid_x, MOUTH_Z + 0.013) - 0.006, MOUTH_Z + 0.012),
                   (tip_x, face_y(tip_x, MOUTH_Z + 0.026) - 0.003, MOUTH_Z + 0.026),
                   0.011, 0.004, 8)
        register(tip, "hair", HEAD_BONES, rigid=True)

    # Mouth: a thin, closed smile.
    smile = band("mouth",
                 [(-0.022, face_y(-0.022, MOUTH_Z) - 0.002, MOUTH_Z + 0.003),
                  (-0.010, face_y(-0.010, MOUTH_Z) - 0.003, MOUTH_Z),
                  (0.010, face_y(0.010, MOUTH_Z) - 0.003, MOUTH_Z),
                  (0.022, face_y(0.022, MOUTH_Z) - 0.002, MOUTH_Z + 0.003)],
                 0.006, 0.005, up=(0, -1, 0))
    register(smile, "mouth", HEAD_BONES, rigid=True)
    # Lower lip, so the mouth is not a scratch.
    register(ellipsoid("lip_lower", (0.017, 0.008, 0.006),
                       (0, face_y(0, MOUTH_Z - 0.010) - 0.002, MOUTH_Z - 0.010), 6, 10),
             "mouth", HEAD_BONES, rigid=True)

    build_turban()


TURBAN_BOTTOM = HEAD_Z + 0.043
TURBAN_TOP = HEAD_Z + 0.172


def build_turban():
    """A red pagdi: one band of cloth wound three and a half times, a crown, a
    knot at the front and a tail down the back."""
    bottom, top = TURBAN_BOTTOM, TURBAN_TOP

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
    register(ellipsoid("turban_top_knot", (0.028, 0.026, 0.018), (0.008, -0.012, top + 0.006), 8, 12),
             "turban_fold", {"head": 1.0}, rigid=True)

    # A tail of cloth falling behind his neck: the fold that says "turban".
    tail = band("turban_tail",
                [(0.048, 0.074, top - 0.024), (0.066, 0.092, bottom + 0.040),
                 (0.058, 0.100, bottom - 0.030), (0.040, 0.096, bottom - 0.076)],
                0.050, 0.013, up=(1, 0, 0))
    register(tail, "turban_fold", {"head": 0.85, "neck": 0.15}, rigid=True)
    tail_tip = band("turban_tail_tip",
                    [(0.040, 0.096, bottom - 0.072), (0.028, 0.088, bottom - 0.110),
                     (0.014, 0.078, bottom - 0.134)],
                    0.042, 0.011, up=(1, 0, 0))
    register(tail_tip, "turban", {"head": 0.6, "neck": 0.3, "chest": 0.1}, rigid=True)
