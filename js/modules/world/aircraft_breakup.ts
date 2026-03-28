// @ts-check

export const AIRCRAFT_BREAKUP_PIECES = [
  {
    id: 'fuselage_front',
    sourceNodeNames: ['fuselage'],
    collider: { type: 'cuboid', halfExtents: [2.4, 2.2, 6.8] },
    massFraction: 0.22,
    localImpulse: [0, 3.0, -10.0],
    angularImpulse: [0.6, 0.15, 0.05],
    clearance: 0.9,
    fxProfile: 'fire'
  },
  {
    id: 'fuselage_rear',
    sourceNodeNames: ['fuselage_001'],
    collider: { type: 'cuboid', halfExtents: [2.1, 2.1, 6.2] },
    massFraction: 0.17,
    localImpulse: [0, 2.4, 7.0],
    angularImpulse: [-0.35, -0.1, 0.08],
    clearance: 0.8,
    fxProfile: 'smoke'
  },
  {
    id: 'left_wing_inner',
    sourceNodeNames: ['winginbd'],
    collider: { type: 'cuboid', halfExtents: [4.8, 0.35, 2.6] },
    massFraction: 0.08,
    localImpulse: [-7.0, 1.6, -1.5],
    angularImpulse: [0.15, 0.05, 1.2],
    clearance: 0.3,
    fxProfile: 'smoke'
  },
  {
    id: 'right_wing_inner',
    sourceNodeNames: ['winginbd_001'],
    collider: { type: 'cuboid', halfExtents: [4.8, 0.35, 2.6] },
    massFraction: 0.08,
    localImpulse: [7.0, 1.6, -1.5],
    angularImpulse: [-0.15, -0.05, -1.2],
    clearance: 0.3,
    fxProfile: 'smoke'
  },
  {
    id: 'left_wing_outer',
    sourceNodeNames: ['obwing', 'lhaileron'],
    collider: { type: 'cuboid', halfExtents: [4.9, 0.28, 2.1] },
    massFraction: 0.06,
    localImpulse: [-8.2, 2.1, 2.0],
    angularImpulse: [0.1, 0.05, 1.4],
    clearance: 0.25,
    fxProfile: 'smoke'
  },
  {
    id: 'right_wing_outer',
    sourceNodeNames: ['obwing_001', 'rhaileron'],
    collider: { type: 'cuboid', halfExtents: [4.9, 0.28, 2.1] },
    massFraction: 0.06,
    localImpulse: [8.2, 2.1, 2.0],
    angularImpulse: [-0.1, -0.05, -1.4],
    clearance: 0.25,
    fxProfile: 'smoke'
  },
  {
    id: 'left_tailplane',
    sourceNodeNames: ['lhstab', 'lhelevator'],
    collider: { type: 'cuboid', halfExtents: [3.8, 0.28, 1.7] },
    massFraction: 0.04,
    localImpulse: [-3.4, 2.1, 10.0],
    angularImpulse: [0.18, 0.08, 0.9],
    clearance: 0.22,
    fxProfile: 'smoke'
  },
  {
    id: 'right_tailplane',
    sourceNodeNames: ['rhstab', 'rhelevator'],
    collider: { type: 'cuboid', halfExtents: [3.8, 0.28, 1.7] },
    massFraction: 0.04,
    localImpulse: [3.4, 2.1, 10.0],
    angularImpulse: [-0.18, -0.08, -0.9],
    clearance: 0.22,
    fxProfile: 'smoke'
  },
  {
    id: 'vertical_tail',
    sourceNodeNames: ['vstab', 'vstable', 'rudder'],
    collider: { type: 'cuboid', halfExtents: [1.4, 2.8, 2.0] },
    massFraction: 0.05,
    localImpulse: [0, 4.5, 11.0],
    angularImpulse: [0.7, 0.1, 0.0],
    clearance: 0.35,
    fxProfile: 'fire'
  },
  {
    id: 'left_engine',
    sourceNodeNames: ['engcore', 'engnose', 'fan', 'tailpipe'],
    collider: { type: 'capsule', radius: 0.95, halfHeight: 1.7 },
    massFraction: 0.06,
    localImpulse: [-4.5, 2.6, -3.4],
    angularImpulse: [0.1, 0.45, 0.2],
    clearance: 0.3,
    fxProfile: 'fire'
  },
  {
    id: 'right_engine',
    sourceNodeNames: ['engcore_001', 'engnose_001', 'engnose_003', 'fan2', 'no2engfancase', 'tailpipe_001', 'no2reverser'],
    collider: { type: 'capsule', radius: 0.95, halfHeight: 1.7 },
    massFraction: 0.06,
    localImpulse: [4.5, 2.6, -3.4],
    angularImpulse: [-0.1, -0.45, -0.2],
    clearance: 0.3,
    fxProfile: 'fire'
  },
  {
    id: 'nose_gear',
    sourceNodeNames: ['gear_nose'],
    collider: { type: 'cuboid', halfExtents: [0.6, 1.1, 0.8] },
    massFraction: 0.02,
    localImpulse: [0, 3.2, -7.0],
    angularImpulse: [1.1, 0.2, 0.3],
    clearance: 0.2,
    fxProfile: 'smoke'
  },
  {
    id: 'left_main_gear',
    sourceNodeNames: ['gear_main_lh'],
    collider: { type: 'cuboid', halfExtents: [0.9, 1.0, 0.9] },
    massFraction: 0.03,
    localImpulse: [-2.5, 2.8, -1.2],
    angularImpulse: [0.8, 0.1, 0.7],
    clearance: 0.2,
    fxProfile: 'smoke'
  },
  {
    id: 'right_main_gear',
    sourceNodeNames: ['gear_main_rh'],
    collider: { type: 'cuboid', halfExtents: [0.9, 1.0, 0.9] },
    massFraction: 0.03,
    localImpulse: [2.5, 2.8, -1.2],
    angularImpulse: [-0.8, -0.1, -0.7],
    clearance: 0.2,
    fxProfile: 'smoke'
  }
];
