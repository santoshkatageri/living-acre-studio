/*  The walk cycle.

    The cycle is driven by the ground he covers, not by the clock: two strides to
    a cycle, so his feet keep pace with his speed whatever that speed is. The
    amplitude eases in while he has a route and out when he stops, which is what
    stops him snapping between standing and striding.

    Angles are radians about the hip or shoulder; `bob` is feet of rise. */

export interface Pose {
  /** Front leg swing: + is forward. The back leg is the negative of it. */
  legSwing: number;
  /** Arm swing, opposite the leg on the same side. */
  armSwing: number;
  /** How far the body rises on the stride. */
  bob: number;
  /** The staff's lean, which trails the arm. */
  staffAngle: number;
  /** A little lift and lean of the whole body over the cycle. */
  lean: number;
}

export const REST_POSE: Pose = { legSwing: 0, armSwing: 0, bob: 0, staffAngle: 0, lean: 0 };

const TAU = Math.PI * 2;

/** Add the ground covered to the phase, wrapping into 0..1. */
export function advancePhase(phase: number, coveredFt: number, strideFt: number): number {
  if (strideFt <= 0) return phase;
  const next = phase + coveredFt / strideFt;
  return ((next % 1) + 1) % 1;
}

/** Ease the amplitude towards its goal (0 standing, 1 walking). */
export function easeAmplitude(current: number, goal: number, dt: number, ratePerS: number): number {
  const clamped = Math.min(Math.max(goal, 0), 1);
  const k = 1 - Math.exp(-Math.max(ratePerS, 0.001) * Math.max(dt, 0));
  return current + (clamped - current) * k;
}

/** The pose at a phase of the cycle, scaled by how much he is walking. */
export function gaitPose(phase: number, amplitude: number): Pose {
  const swing = Math.sin(phase * TAU);
  const lift = Math.abs(Math.cos(phase * TAU));
  const a = Math.min(Math.max(amplitude, 0), 1);
  return {
    legSwing: swing * 0.52 * a,
    armSwing: -swing * 0.34 * a,
    bob: lift * 0.075 * a,
    staffAngle: swing * 0.12 * a,
    lean: 0.03 * a,
  };
}

/** Which way he faces, turning towards a heading rather than snapping to it. */
export function easeFacing(currentRad: number, goalRad: number, dt: number, ratePerS: number): number {
  let delta = ((goalRad - currentRad + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (Math.abs(delta) > Math.PI) delta -= Math.sign(delta) * TAU;
  const k = 1 - Math.exp(-Math.max(ratePerS, 0.001) * Math.max(dt, 0));
  return currentRad + delta * k;
}
