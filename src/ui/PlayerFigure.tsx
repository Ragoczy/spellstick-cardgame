// Placeholder player art: one flat pictogram per field position, like sports-event pictograms.
// Every shape is filled with currentColor, so CSS sets the color (an element class, see
// styles.css "Element colors"). All four poses share one viewBox and one set of body
// proportions, so they line up on cards.
//
// Each pose is a skeleton: where the hips are, how far the body leans, and the angle of each
// arm and leg segment. Angles are in degrees from straight down: 0 points down, 90 points
// forward (right, toward the goal being attacked), 180 points up, -90 points back.
// Every body part is a filled shape with round ends, so tweaking a pose is just changing a number.

import type { Area } from '../engine';

/** The engine's position names: the goalie, then the three field rows. */
export type FigurePosition = Area | 'goal';

type Pt = [number, number];
/** An arm or leg: upper segment angle, lower segment angle. */
type Limb = [number, number];

interface Pose {
  /** Center of the hips. */
  hip: Pt;
  /** Torso angle from upright. Positive leans forward. */
  lean: number;
  /** Extra head tilt on top of the lean (optional). */
  headTilt?: number;
  arms: [Limb, Limb];
  legs: [Limb, Limb];
  /** The spellstick: held in one hand, pointing along an angle. */
  stick: { hand: 0 | 1; angle: number; length: number; behindHand: number; bigHead?: boolean };
}

// ---- Body proportions (shared by every pose) ----
export const FIGURE_VIEWBOX = 100;
const HEAD_R = 7;
/** Hip to shoulder. The torso is wider at the shoulders than at the hips. */
const TORSO = 22;
const SHOULDER_R = 7.5;
const HIP_R = 6;
/** Shoulder to the center of the head. The gap gives the pictogram's floating head. */
const NECK = 16.5;
const UPPER_ARM = 12;
const FOREARM = 12;
const ARM_R = 3.8;
const THIGH = 15.5;
const SHIN = 15.5;
const LEG_R = 4.6;
const STICK_R = 1.8;

const POSES: Record<FigurePosition, Pose> = {
  // Mid-strike: lunging forward, both hands driving the stick toward the goal.
  forward: {
    hip: [33, 64],
    lean: 34,
    arms: [[105, 120], [70, 105]],
    legs: [[60, 5], [-40, -68]],
    stick: { hand: 0, angle: 125, length: 20, behindHand: 9 },
  },
  // Running, mid-stride: front arm pumping, stick carried upright behind the head.
  midfield: {
    hip: [51, 62],
    lean: 14,
    arms: [[50, 115], [-60, 170]],
    legs: [[60, 0], [-30, -100]],
    stick: { hand: 1, angle: 188, length: 14, behindHand: 10 },
  },
  // Braced, facing the attacker: low, wide stance, arms out, stick held across to block.
  defense: {
    hip: [44, 66],
    lean: 0,
    arms: [[55, 85], [-55, -85]],
    legs: [[60, 8], [-60, -8]],
    stick: { hand: 1, angle: 90, length: 46, behindHand: 7 },
  },
  // Diving across the goal, arms at full stretch, the big goalie stick out in front.
  goal: {
    hip: [42, 66],
    lean: 52,
    headTilt: -20,
    arms: [[160, 150], [145, 140]],
    legs: [[-70, -40], [-105, -105]],
    stick: { hand: 0, angle: 140, length: 8, behindHand: 4, bigHead: true },
  },
};

// ---- Geometry ----

/** Unit vector for an angle measured from straight down, positive toward forward. */
function dir(degrees: number): Pt {
  const r = (degrees * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
}

function step(from: Pt, degrees: number, length: number): Pt {
  const [dx, dy] = dir(degrees);
  return [from[0] + dx * length, from[1] + dy * length];
}

/**
 * One body part: a round end of radius ra at a, a round end of radius rb at b, and the straight
 * sides between them. A circle when a and b are the same point.
 */
export interface Part { a: Pt; ra: number; b: Pt; rb: number }

const n = (v: number) => Math.round(v * 10) / 10;

/** SVG path data for a part. */
function partPath({ a, ra, b, rb }: Part): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  if (d <= Math.abs(ra - rb)) {
    // One end swallows the other: just the bigger circle.
    const [c, r] = ra >= rb ? [a, ra] : [b, rb];
    return `M${n(c[0] - r)} ${n(c[1])}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  }
  // The sides touch both circles: tilt the side normals by the difference in radius.
  const ux = dx / d;
  const uy = dy / d;
  const sin = (ra - rb) / d;
  const cos = Math.sqrt(1 - sin * sin);
  const n1: Pt = [-uy * cos + ux * sin, ux * cos + uy * sin];
  const n2: Pt = [uy * cos + ux * sin, -ux * cos + uy * sin];
  const at = (c: Pt, r: number, v: Pt) => `${n(c[0] + v[0] * r)} ${n(c[1] + v[1] * r)}`;
  // The far end's arc is more than half a circle when it is the bigger end, and the near end's when it is.
  const bigB = rb > ra ? 1 : 0;
  const bigA = ra > rb ? 1 : 0;
  return `M${at(a, ra, n1)}L${at(b, rb, n1)}A${rb} ${rb} 0 ${bigB} 0 ${at(b, rb, n2)}`
    + `L${at(a, ra, n2)}A${ra} ${ra} 0 ${bigA} 0 ${at(a, ra, n1)}Z`;
}

/** Every body part for a pose, head first. */
export function figureParts(position: FigurePosition): Part[] {
  const pose = POSES[position];
  const torsoAngle = 180 - pose.lean;
  const shoulder = step(pose.hip, torsoAngle, TORSO);
  const head = step(shoulder, torsoAngle + (pose.headTilt ?? 0), NECK);
  const parts: Part[] = [
    { a: head, ra: HEAD_R, b: head, rb: HEAD_R },
    { a: pose.hip, ra: HIP_R, b: shoulder, rb: SHOULDER_R },
  ];
  const limb = (a: Pt, b: Pt, r: number) => parts.push({ a, ra: r, b, rb: r });
  const hands: Pt[] = [];
  for (const [upper, lower] of pose.arms) {
    const elbow = step(shoulder, upper, UPPER_ARM);
    const hand = step(elbow, lower, FOREARM);
    limb(shoulder, elbow, ARM_R);
    limb(elbow, hand, ARM_R);
    hands.push(hand);
  }
  for (const [upper, lower] of pose.legs) {
    const knee = step(pose.hip, upper, THIGH);
    const foot = step(knee, lower, SHIN);
    limb(pose.hip, knee, LEG_R);
    limb(knee, foot, LEG_R);
  }
  // The stick: a shaft, then a head that widens toward its end, like a lacrosse stick.
  const { hand, angle, length, behindHand, bigHead } = pose.stick;
  const butt = step(hands[hand]!, angle + 180, behindHand);
  const tip = step(hands[hand]!, angle, length);
  limb(butt, tip, STICK_R);
  const headLength = bigHead ? 18 : 14;
  const headWidth = bigHead ? 6 : 4;
  parts.push({ a: tip, ra: STICK_R + 0.6, b: step(tip, angle, headLength - headWidth), rb: headWidth });
  return parts;
}

export interface PlayerFigureProps {
  position: FigurePosition;
  /** An element id from the card data ("fire"), or null for no element (grey). */
  element: string | null;
  injured?: boolean;
  className?: string;
  title?: string;
}

/** A player pictogram, colored by element through the el-* classes in styles.css. */
export function PlayerFigure({ position, element, injured, className, title }: PlayerFigureProps) {
  const classes = ['figure', `figure-${position}`, element ? `el-${element}` : 'el-none', injured ? 'injured' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <svg className={classes} viewBox={`0 0 ${FIGURE_VIEWBOX} ${FIGURE_VIEWBOX}`} fill="currentColor" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {figureParts(position).map((part, i) => <path key={i} d={partPath(part)} />)}
    </svg>
  );
}
