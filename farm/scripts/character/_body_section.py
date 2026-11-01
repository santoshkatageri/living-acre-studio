TORSO_BONES = {"hips": 0.5, "spine": 0.7, "chest": 0.9}
HEAD_BONES = {"head": 1.0}
FOREARM_L = {"forearm.L": 0.8, "hand.L": 0.4, "upper_arm.L": 0.3}
FOREARM_R = {"forearm.R": 0.8, "hand.R": 0.4, "upper_arm.R": 0.3}

#  The kurta's silhouette, shared by everything that has to sit on its surface:
#  the stole, the placket, the dhoti's waist.  (z, radius) from hem to collar.
KURTA_PROFILE = [
    (0.845, 0.152), (0.900, 0.161), (0.990, 0.170), (1.070, 0.172),
    (1.150, 0.178), (1.240, 0.185), (1.330, 0.189), (1.395, 0.174),
    (1.435, 0.130),
]
KURTA_DEPTH = 0.74  # how much shallower the body is than it is wide


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


def build_head():
    """The face: big warm eyes under a heavy brow, a handlebar moustache, a jaw
    that is narrow enough to be friendly and wide enough to be a grown man."""
    skull_top = HEAD_Z + 0.112
    # Skull: a rounded box of a head, slightly deeper than wide.
    register(ellipsoid("head_skull", (0.097, 0.101, 0.112), (0, 0, HEAD_Z), 16, 20, squash_bottom=0.9),
             "skin", HEAD_BONES, rigid=True)
    # Brow ridge and cheekbones, so the face is not a ball.
    register(ellipsoid("head_brow", (0.088, 0.085, 0.030), (0, -0.020, HEAD_Z + 0.040), 8, 16),
             "skin", HEAD_BONES, rigid=True)
    # Jaw: narrower at the chin, wide at the cheeks — the adult read.
    register(ellipsoid("head_jaw", (0.079, 0.086, 0.068), (0, -0.004, HEAD_Z - 0.062), 12, 16, squash_bottom=0.86),
             "skin", HEAD_BONES, rigid=True)
    for side in (1, -1):
        register(ellipsoid(f"cheek_{'L' if side > 0 else 'R'}", (0.038, 0.034, 0.026),
                           (side * 0.052, -0.062, HEAD_Z - 0.028), 8, 12), "skin", HEAD_BONES, rigid=True)
    # Neck: short and thick, sunk into the collar.
    register(tube("neck", (0, 0, NECK_Z - 0.10), (0, 0.004, CHIN_Z - 0.012), 0.058, 0.052, 14),
             "skin", {"neck": 0.85, "head": 0.45, "chest": 0.2})
    # Ears.
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        register(ellipsoid(f"ear_{label}", (0.014, 0.026, 0.032),
                           (side * 0.094, 0.008, HEAD_Z - 0.014), 8, 10), "skin", HEAD_BONES, rigid=True)
        register(ellipsoid(f"ear_inner_{label}", (0.008, 0.015, 0.019),
                           (side * 0.100, 0.006, HEAD_Z - 0.016), 6, 8), "skin_deep", HEAD_BONES, rigid=True)
    # Sideburns, the sliver of hair the turban leaves showing.
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        register(ellipsoid(f"sideburn_{label}", (0.011, 0.030, 0.034),
                           (side * 0.086, -0.024, HEAD_Z + 0.012), 8, 10), "hair", HEAD_BONES, rigid=True)

    # Nose: a bridge and a rounded tip, not a ball.
    register(tube("nose_bridge", (0, -0.086, HEAD_Z + 0.030), (0, -0.098, HEAD_Z - 0.010), 0.013, 0.019, 8),
             "skin", HEAD_BONES, rigid=True)
    register(ellipsoid("nose_tip", (0.021, 0.022, 0.019), (0, -0.101, HEAD_Z - 0.018), 8, 12),
             "skin", HEAD_BONES, rigid=True)
    for side in (1, -1):
        register(ellipsoid(f"nostril_{'L' if side > 0 else 'R'}", (0.011, 0.013, 0.011),
                           (side * 0.019, -0.094, HEAD_Z - 0.026), 6, 8), "skin", HEAD_BONES, rigid=True)

    # Eyes: large and warm, but seated in the skull — the sclera is capped by a
    # lid so the eyeball does not bulge like a bead.
    eye_z = HEAD_Z + 0.014
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        x = side * 0.041
        eye_y = -0.081
        register(ellipsoid(f"eye_white_{label}", (0.025, 0.021, 0.026), (x, eye_y, eye_z), 12, 16),
                 "eye_white", HEAD_BONES, rigid=True)
        register(ellipsoid(f"iris_{label}", (0.0145, 0.011, 0.0150), (x, eye_y - 0.0135, eye_z - 0.001), 10, 14),
                 "iris", HEAD_BONES, rigid=True)
        register(ellipsoid(f"pupil_{label}", (0.0072, 0.007, 0.0076), (x, eye_y - 0.0185, eye_z - 0.001), 8, 12),
                 "pupil", HEAD_BONES, rigid=True)
        register(ellipsoid(f"gleam_{label}", (0.0034, 0.003, 0.0034),
                           (x - side * 0.005, eye_y - 0.0215, eye_z + 0.007), 6, 8),
                 "gleam", HEAD_BONES, rigid=True)
        # Upper lid: a skin-coloured shell that covers the top of the eyeball.
        lid = band(f"eyelid_{label}",
                   [(x - side * 0.026, eye_y - 0.004, eye_z + 0.004),
                    (x - side * 0.012, eye_y - 0.014, eye_z + 0.019),
                    (x, eye_y - 0.016, eye_z + 0.023),
                    (x + side * 0.013, eye_y - 0.014, eye_z + 0.019),
                    (x + side * 0.026, eye_y - 0.004, eye_z + 0.004)],
                   0.016, 0.010, up=(0, -1, 0))
        register(lid, "skin", HEAD_BONES, rigid=True)
        # Brow: thick, dark, and angled so he looks good-humoured.
        brow = rounded_box(f"brow_{label}", (0.050, 0.017, 0.013),
                           (x, -0.090, eye_z + 0.030), 0.005, rotation=(0, side * -0.16, 0))
        register(brow, "hair", HEAD_BONES, rigid=True)

    # The moustache: one continuous handlebar, its tips curling up.
    register(ellipsoid("moustache_core", (0.023, 0.019, 0.014), (0, -0.092, HEAD_Z - 0.050), 8, 12),
             "hair", HEAD_BONES, rigid=True)
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        mid = tube(f"moustache_mid_{label}", (side * 0.012, -0.093, HEAD_Z - 0.052),
                   (side * 0.046, -0.086, HEAD_Z - 0.048), 0.017, 0.013, 10)
        register(mid, "hair", HEAD_BONES, rigid=True)
        tip = tube(f"moustache_tip_{label}", (side * 0.044, -0.086, HEAD_Z - 0.048),
                   (side * 0.058, -0.077, HEAD_Z - 0.031), 0.013, 0.005, 8)
        register(tip, "hair", HEAD_BONES, rigid=True)
        register(ellipsoid(f"moustache_curl_{label}", (0.010, 0.010, 0.009),
                           (side * 0.058, -0.077, HEAD_Z - 0.030), 6, 8), "hair", HEAD_BONES, rigid=True)

    # Mouth: a small, closed, friendly smile tucked under the moustache.
    smile = band("mouth", [(-0.024, -0.093, HEAD_Z - 0.070), (-0.012, -0.097, HEAD_Z - 0.074),
                           (0.012, -0.097, HEAD_Z - 0.074), (0.024, -0.093, HEAD_Z - 0.070)],
                 0.008, 0.006, up=(0, -1, 0))
    register(smile, "mouth", HEAD_BONES, rigid=True)
    register(ellipsoid("chin", (0.030, 0.028, 0.020), (0, -0.086, HEAD_Z - 0.098), 8, 12),
             "skin", HEAD_BONES, rigid=True)
    assert skull_top > HEAD_Z
    build_turban()


def build_turban():
    """A red pagdi: one band of cloth wound four times, a crown, and a knotted
    tail at the back — layered, with the folds the brief asks for."""
    bottom, top = HEAD_Z + 0.016, HEAD_Z + 0.148

    def radius(t: float) -> float:
        # Wide above the brow, fuller at the second turn, tapering to the crown.
        return 0.101 + 0.012 * math.sin(math.pi * t) - 0.030 * t ** 1.6

    turns = 3.6
    # Alternate the two reds turn by turn, so the winding reads even in shade.
    bands = 8
    per_turn = turns / bands
    for index in range(bands):
        start = index * per_turn / turns
        end = (index + 1) * per_turn / turns
        z0 = bottom + (top - bottom) * start
        z1 = bottom + (top - bottom) * end

        def local(t, z0=z0, z1=z1, start=start, end=end):
            return radius(start + (end - start) * t)

        band_mesh = coil(f"turban_wind_{index}", 0.45, z0, z1, local, 0.022, 0.017,
                         steps_per_turn=16, phase=2 * math.pi * turns * start)
        register(band_mesh, "turban" if index % 2 == 0 else "turban_fold", {"head": 1.0}, rigid=True)

    # The crown, closing the top of the winding.
    register(ellipsoid("turban_crown", (0.072, 0.070, 0.038), (0, 0, top - 0.012), 10, 18),
             "turban", {"head": 1.0}, rigid=True)
    register(ellipsoid("turban_top_knot", (0.030, 0.030, 0.020), (0.010, -0.014, top + 0.008), 8, 12),
             "turban_fold", {"head": 1.0}, rigid=True)

    # A tail of cloth falling behind his neck: the fold that says "turban".
    tail = band("turban_tail",
                [(0.052, 0.078, top - 0.026), (0.070, 0.096, bottom + 0.052),
                 (0.062, 0.104, bottom - 0.020), (0.042, 0.100, bottom - 0.070)],
                0.052, 0.014, up=(1, 0, 0))
    register(tail, "turban_fold", {"head": 0.85, "neck": 0.15}, rigid=True)
    tail_tip = band("turban_tail_tip",
                    [(0.042, 0.100, bottom - 0.066), (0.030, 0.092, bottom - 0.106),
                     (0.016, 0.082, bottom - 0.132)],
                    0.044, 0.012, up=(1, 0, 0))
    register(tail_tip, "turban", {"head": 0.6, "neck": 0.3, "chest": 0.1}, rigid=True)


def build_body():
    """Kurta (cream), dhoti (white), and the stole (green)."""
    # Kurta: A-line, from mid-thigh to the collar, with a soft shoulder line.
    kurta = lathe("kurta", KURTA_PROFILE, segments=24, pleats=9, pleat_depth=0.014,
                  squash=(1.0, KURTA_DEPTH))
    register(kurta, "kurta", TORSO_BONES)
    # Collar: a narrow stand around the neck.
    register(lathe("kurta_collar", [(1.418, 0.076), (1.452, 0.070), (1.472, 0.062)],
                   segments=20, squash=(1.0, 0.94)), "kurta_shade", {"chest": 0.7, "neck": 0.6})
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
    # Shoulders, so the kurta is not a tube.
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        register(ellipsoid(f"kurta_shoulder_{label}", (0.070, 0.072, 0.058),
                           (side * 0.152, 0, 1.372), 10, 14),
                 "kurta", {"chest": 1.0, f"shoulder.{label}": 0.35})

    # Dhoti: white, wrapped, with real volume and pleats, to mid-calf.
    dhoti = lathe("dhoti",
                  [(0.300, 0.132), (0.360, 0.138), (0.440, 0.150), (0.540, 0.163),
                   (0.660, 0.175), (0.780, 0.181), (0.880, 0.175), (0.960, 0.168),
                   (1.015, 0.162)],
                  segments=32, pleats=15, pleat_depth=0.042, squash=(1.0, 0.80))
    register(dhoti, "dhoti", {"hips": 0.9, "thigh.L": 0.45, "thigh.R": 0.45})
    # The pressed folds down the front: narrow panels standing off the cloth.
    for index, x_hit in enumerate((-0.072, -0.036, 0.0, 0.036, 0.072)):
        path = []
        for z, spread in ((1.000, 0.55), (0.860, 0.75), (0.700, 0.95), (0.520, 1.0), (0.330, 1.0)):
            radius = 0.170 if z > 0.78 else 0.178
            x = x_hit * spread
            inside = math.sqrt(max(0.0, 1.0 - (x / radius) ** 2))
            path.append((x, -(radius * 0.80 * inside) - 0.006, z))
        pleat = band(f"dhoti_fold_{index}", path, 0.030, 0.011, up=(0, -1, 0))
        register(pleat, "dhoti" if index % 2 == 0 else "dhoti_shade",
                 {"hips": 0.85, "thigh.L": 0.35, "thigh.R": 0.35})
    # The waist sash holding it up, plus the tucked end hanging at the left hip.
    register(lathe("dhoti_sash", [(0.982, 0.174), (1.020, 0.181), (1.058, 0.171)],
                   segments=26, pleats=7, pleat_depth=0.022, squash=(1.0, 0.78)),
             "dhoti_shade", {"hips": 1.0})
    tuck = band("dhoti_tuck",
                [(0.090, -0.112, 1.040), (0.116, -0.120, 0.960), (0.124, -0.128, 0.860),
                 (0.118, -0.126, 0.760)],
                0.048, 0.012, up=(0, -1, 0))
    register(tuck, "dhoti", {"hips": 1.0})

    # Stole: round the neck, over both shoulders, hanging down the chest.
    register(lathe("scarf_ring", [(1.432, 0.079), (1.462, 0.086), (1.492, 0.079)],
                   segments=22, pleats=6, pleat_depth=0.03, squash=(1.0, 0.92)),
             "scarf", {"neck": 0.9, "chest": 0.3})
    register(ellipsoid("scarf_knot", (0.026, 0.022, 0.024), (0.046, -0.062, 1.440), 8, 12),
             "scarf_dark", {"chest": 1.0, "neck": 0.3}, rigid=True)
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        path = []
        for z, x in ((1.430, 0.052), (1.380, 0.086), (1.320, 0.098), (1.240, 0.100),
                     (1.150, 0.096), (1.070, 0.088)):
            path.append((side * x, kurta_surface(x, z, 0.012), z))
        tail = band(f"scarf_tail_{label}", path, 0.074, 0.013, up=(0, -1, 0))
        register(tail, "scarf" if side > 0 else "scarf_dark", {"chest": 0.85, "spine": 0.35})
    # The long end down his back.
    back = band("scarf_back",
                [(0.044, 0.070, 1.440), (0.062, 0.104, 1.370), (0.064, 0.126, 1.270),
                 (0.052, 0.132, 1.170), (0.036, 0.128, 1.080)],
                0.066, 0.012, up=(0, 1, 0))
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
                       [(1.158, 0.058), (1.230, 0.062), (1.300, 0.066), (1.352, 0.058)],
                       segments=16)
        sleeve.data.transform(Matrix.Translation((x + side * 0.004, 0, 0)))
        register(sleeve, "kurta", {f"upper_arm.{label}": 1.0, "chest": 0.35})
        cuff = lathe(f"sleeve_cuff_{label}", [(1.150, 0.062), (1.168, 0.064), (1.184, 0.060)],
                     segments=16)
        cuff.data.transform(Matrix.Translation((x + side * 0.004, 0, 0)))
        register(cuff, "kurta_shade", {f"upper_arm.{label}": 1.0})
        # Bare forearm below the rolled cuff.
        register(tube(f"forearm_{label}", (x + side * 0.006, 0, 1.160), (x + side * 0.020, 0, 0.902),
                      0.041, 0.031, 12), "skin", {f"forearm.{label}": 1.0, f"upper_arm.{label}": 0.25})
        # Palm, fingers and thumb: a hand, not a paddle.
        palm = rounded_box(f"hand_{label}", (0.026, 0.052, 0.070),
                           (x + side * 0.022, -0.004, 0.868), 0.012)
        register(palm, "skin", {f"hand.{label}": 1.0}, rigid=True)
        for finger in range(4):
            fx = (finger - 1.5) * 0.014
            start = (x + side * 0.022 + fx, -0.020, 0.836)
            end = (x + side * 0.024 + fx * 1.1, -0.030, 0.792)
            register(tube(f"finger_{label}_{finger}", start, end, 0.0085, 0.0065, 8),
                     "skin", {f"hand.{label}": 1.0}, rigid=True)
        register(tube(f"thumb_{label}", (x + side * 0.008, -0.016, 0.872),
                      (x + side * 0.004, -0.040, 0.840), 0.012, 0.008, 8),
                 "skin", {f"hand.{label}": 1.0}, rigid=True)


def build_legs():
    for side in (1, -1):
        label = "L" if side > 0 else "R"
        x = side * HIP_X
        # Only the calf shows below the dhoti; the rest is inside the cloth.
        register(lathe(f"thigh_{label}", [(0.400, 0.058), (0.560, 0.066), (0.720, 0.072), (0.900, 0.074)],
                       segments=14), "skin", {f"thigh.{label}": 1.0}
                 ) if False else None
        calf = lathe(f"shin_{label}",
                     [(0.095, 0.040), (0.150, 0.046), (0.220, 0.054), (0.290, 0.057),
                      (0.360, 0.055), (0.440, 0.052)],
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
                     [(0.008, 0.044), (0.014, 0.050), (0.022, 0.050), (0.030, 0.044)],
                     segments=16, squash=(1.0, 2.16))
        sole.data.transform(Matrix.Translation((x, -0.038, 0)))
        register(sole, "sole", {f"foot.{label}": 1.0}, rigid=True)
        strap = band(f"sandal_strap_{label}",
                     [(x - 0.040, -0.086, 0.034), (x - 0.020, -0.074, 0.070),
                      (x, -0.070, 0.078), (x + 0.020, -0.074, 0.070), (x + 0.040, -0.086, 0.034)],
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
