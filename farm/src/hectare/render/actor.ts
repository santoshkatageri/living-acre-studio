import * as THREE from "three";

import type { Pose } from "../gait";
import { REST_POSE } from "../gait";
import type { FarmerLook } from "../world";

/*  The farmer: silver hair and a white headband, a blue-grey kurta with rolled
    cuffs, a salmon dhoti, bare feet, a dark moustache and a long staff — the
    reference sheet, in boxes and spheres.

    Every limb hangs off a pivot at the hip or the shoulder, so a pose is a set of
    rotations and the walk cycle is the only thing that writes them. */

export interface Actor {
  mesh: THREE.Group;
  marker: THREE.Mesh;
  sync(xFt: number, yFt: number): void;
  setFacing(radians: number): void;
  animate(pose: Pose): void;
  setTargetMarker(target: { x: number; y: number } | null): void;
  dispose(): void;
}

function material(colour: string, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness, metalness: 0 });
}

export function createFarmer(look: FarmerLook): Actor {
  const H = look.heightFt;
  const group = new THREE.Group();
  group.name = "farmer";

  const body = new THREE.Group();
  body.name = "farmer:body";
  group.add(body);

  const skin = material(look.skin, 0.85);
  const kurta = material(look.kurta);
  const dhoti = material(look.dhoti);
  const hair = material(look.hair, 0.7);
  const headband = material(look.headband, 0.6);
  const staffMat = material(look.staff, 0.95);

  const hipY = H * 0.48;
  const shoulderY = H * 0.79;

  // Legs: a dhoti-coloured limb hanging from a pivot at the hip.
  const legLength = H * 0.46;
  const legGeometry = new THREE.BoxGeometry(H * 0.13, legLength, H * 0.15);
  legGeometry.translate(0, -legLength / 2, 0);
  const makeLeg = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * H * 0.075, hipY, 0);
    const leg = new THREE.Mesh(legGeometry, dhoti);
    leg.castShadow = true;
    pivot.add(leg);
    body.add(pivot);
    return pivot;
  };
  const legFront = makeLeg(-1);
  const legBack = makeLeg(1);

  // The kurta: a tapering box, wider at the shoulder.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(H * 0.34, H * 0.34, H * 0.24), kurta);
  torso.position.y = hipY + H * 0.16;
  torso.castShadow = true;
  body.add(torso);

  // A dhoti wrap at the waist, so the legs read as cloth rather than two sticks.
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(H * 0.36, H * 0.12, H * 0.28), dhoti);
  wrap.position.y = hipY + H * 0.02;
  wrap.castShadow = true;
  body.add(wrap);

  // The shoulder cloth: one band across the chest.
  const sash = new THREE.Mesh(new THREE.BoxGeometry(H * 0.36, H * 0.05, H * 0.26), material(look.sash));
  sash.position.y = hipY + H * 0.24;
  sash.rotation.z = 0.16;
  body.add(sash);

  // Arms, pivoting at the shoulder.
  const armLength = H * 0.36;
  const armGeometry = new THREE.BoxGeometry(H * 0.085, armLength, H * 0.095);
  armGeometry.translate(0, -armLength / 2, 0);
  const makeArm = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * H * 0.19, shoulderY, 0);
    const arm = new THREE.Mesh(armGeometry, kurta);
    arm.castShadow = true;
    pivot.add(arm);
    body.add(pivot);
    return pivot;
  };
  const armFront = makeArm(-1);
  const armBack = makeArm(1);

  // Head, hair, headband, moustache.
  const head = new THREE.Mesh(new THREE.SphereGeometry(H * 0.105, 16, 12), skin);
  head.position.y = H * 0.9;
  head.castShadow = true;
  body.add(head);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(H * 0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
  hairCap.position.y = H * 0.907;
  body.add(hairCap);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.111, H * 0.111, H * 0.035, 16, 1, true), headband);
  band.position.y = H * 0.935;
  body.add(band);

  const moustache = new THREE.Mesh(new THREE.BoxGeometry(H * 0.09, H * 0.018, H * 0.02), material(look.moustache, 1));
  moustache.position.set(0, H * 0.874, H * 0.096);
  body.add(moustache);

  // The staff: long, in the front hand, planted as he walks.
  const staffLength = H * 0.95;
  const staffPivot = new THREE.Group();
  staffPivot.name = "farmer:staff";
  staffPivot.position.set(-H * 0.2, shoulderY - armLength * 0.85, H * 0.06);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.012, H * 0.012, staffLength, 6), staffMat);
  staff.position.y = -staffLength * 0.34;
  staff.castShadow = true;
  staffPivot.add(staff);
  body.add(staffPivot);

  // Where a click will send him.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.12;
  marker.visible = false;
  marker.name = "farmer:target";
  group.add(marker);

  let facing = 0;

  const apply = (pose: Pose): void => {
    legFront.rotation.x = pose.legSwing;
    legBack.rotation.x = -pose.legSwing;
    armFront.rotation.x = -pose.armSwing;
    armBack.rotation.x = pose.armSwing;
    staffPivot.rotation.x = pose.staffAngle - pose.armSwing * 0.4;
    torso.rotation.x = pose.lean;
    head.rotation.x = -pose.lean * 0.6;
    body.position.y = pose.bob;
  };
  apply(REST_POSE);

  return {
    mesh: group,
    marker,
    sync(xFt, yFt) {
      group.position.set(xFt, 0, yFt);
    },
    setFacing(radians) {
      facing = radians;
      group.rotation.y = radians;
    },
    animate(pose) {
      apply(pose);
    },
    setTargetMarker(target) {
      if (!target) {
        marker.visible = false;
        return;
      }
      marker.position.set(target.x, 0.12, target.y);
      marker.visible = true;
    },
    dispose() {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const entry = object.material;
        if (Array.isArray(entry)) entry.forEach((one) => one.dispose());
        else entry.dispose();
      });
      void facing;
      group.clear();
    },
  };
}
