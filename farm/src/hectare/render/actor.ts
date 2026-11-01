import * as THREE from "three";

import type { Pose } from "../gait";
import { REST_POSE } from "../gait";
import type { FarmerLook } from "../world";

import type { ActorMotion, FarmerClip } from "./farmer-motion";
import { blendFor, dueForLookAround, isStanding } from "./farmer-motion";
import { loadFarmerModel, type FarmerModel } from "./farmer-model";

/*  The farmer.

    He used to be eighteen boxes and a sphere. He is now a character: a rigged,
    animated model authored in Blender — red turban, cream kurta, white dhoti,
    green stole, sandals — loaded from `public/models/farmer.glb`.

    What matters for the rest of the app is that this file still is an `Actor`:
    `sync` puts him somewhere, `setFacing` turns him, `animate` takes the app's
    `Pose`. The difference is that the pose is now a *phase* for the rig's own
    walk cycle: the clip is scrubbed by the ground he covers, exactly as the
    analytic cycle was, so his feet do not skate.

    The model loads asynchronously; until it arrives, and if it fails, the group
    is simply empty. Nothing else in the farm waits for it. */

export interface Actor {
  mesh: THREE.Group;
  marker: THREE.Mesh;
  /** Resolves when the rigged model is in the scene (or has failed to load). */
  whenReady: Promise<void>;
  sync(xFt: number, yFt: number): void;
  setFacing(radians: number): void;
  animate(pose: Pose, motion?: ActorMotion): void;
  /** Play a clip once — a gesture, feeding the cattle, watering. */
  playOnce(clip: FarmerClip): void;
  /** Clip lengths in seconds, once the model has loaded. */
  durations: Partial<Record<FarmerClip, number>>;
  setTargetMarker(target: { x: number; y: number } | null): void;
  dispose(): void;
}

export function createFarmer(look: FarmerLook): Actor {
  const group = new THREE.Group();
  group.name = "farmer";

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

  const durations: Partial<Record<FarmerClip, number>> = {};
  let model: FarmerModel | null = null;
  let facing = 0;
  let standingSeconds = 0;
  let lookArounds = 0;
  let oneShot: { clip: FarmerClip; remaining: number } | null = null;
  let lastTime = typeof performance !== "undefined" ? performance.now() : 0;

  const whenReady = loadFarmerModel(look.heightFt)
    .then((loaded) => {
      model = loaded;
      for (const [name, action] of Object.entries(loaded.actions)) {
        if (action) durations[name as FarmerClip] = action.getClip().duration;
      }
      group.add(loaded.root);
      apply(REST_POSE, undefined, 0);
    })
    .catch((error: unknown) => {
      // A missing model should be loud in the console but quiet in the farm.
      console.warn(`The farmer's model did not load from ${look.heightFt} ft of Blender:`, error);
    });

  const setWeight = (clip: FarmerClip, weight: number): void => {
    model?.actions[clip]?.setEffectiveWeight(weight);
  };

  const playOnce = (clip: FarmerClip): void => {
    const action = model?.actions[clip];
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.paused = false;
    action.play();
    oneShot = { clip, remaining: action.getClip().duration };
  };

  const apply = (pose: Pose, motion: ActorMotion | undefined, dt: number): void => {
    if (!model) return;
    const blend = blendFor(motion, look.speedFtPerSec);

    if (oneShot) {
      oneShot.remaining -= dt;
      if (oneShot.remaining > 0) {
        setWeight("Idle", 0);
        setWeight("Walk", 0);
        setWeight("Run", 0);
        setWeight(oneShot.clip, 1);
        return;
      }
      setWeight(oneShot.clip, 0);
      oneShot = null;
    }

    const standing = isStanding(pose, motion);
    standingSeconds = standing ? standingSeconds + dt : 0;
    if (!standing) lookArounds = 0;

    // Standing around he looks about now and then, rather than freezing.
    if (standing && dueForLookAround(standingSeconds, lookArounds)) {
      lookArounds += 1;
      playOnce("LookAround");
      return;
    }

    setWeight("Idle", blend.idle);
    setWeight("Walk", blend.walk);
    setWeight("Run", blend.run);

    // Scrub the cycle by the phase the app computed from ground covered: the
    // feet stay planted whatever the walking speed is.
    for (const clip of ["Walk", "Run"] as const) {
      const action = model.actions[clip];
      if (!action) continue;
      action.paused = true;
      const duration = action.getClip().duration;
      action.time = blend.phase * duration;
    }
  };

  const tick = (): number => {
    const now = typeof performance !== "undefined" ? performance.now() : lastTime;
    const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
    lastTime = now;
    return dt;
  };

  return {
    mesh: group,
    marker,
    whenReady,
    durations,
    sync(xFt, yFt) {
      group.position.set(xFt, 0, yFt);
    },
    setFacing(radians) {
      facing = radians;
      group.rotation.y = radians;
    },
    animate(pose, motion) {
      const dt = tick();
      apply(pose, motion, dt);
      model?.mixer.update(dt);
    },
    playOnce,
    setTargetMarker(target) {
      if (!target) {
        marker.visible = false;
        return;
      }
      marker.position.set(target.x, 0, target.y);
      marker.visible = true;
    },
    dispose() {
      model?.dispose();
      model = null;
      marker.geometry.dispose();
      const material = marker.material;
      if (Array.isArray(material)) material.forEach((one) => one.dispose());
      else material.dispose();
      void facing;
      group.clear();
    },
  };
}

export type { ActorMotion, FarmerClip };
