// The story: five missions from Mara, the fixer who runs Porto Verde's night trade.
// Each mission is a list of steps; a step completes when its condition holds, and the
// mission pays out in cash when its last step completes. World code owns the simulation;
// this file owns the story data and the step logic.
import { MISSION_REWARDS } from './config.js';

export const CONTACT = 'Mara';

// Step types: goto (reach a marker), pickup (reach and hold E near it), drive (reach in a car),
// kill (defeat every goon), chase (wreck the bank van), escape (reach the marker with wanted).
export const MISSIONS = [
  {
    id: 1,
    title: 'The Package',
    intro: 'Mara: "A package is waiting at the Marina kiosk. Bring it to Old Town. No questions."',
    steps: [
      { type: 'goto', place: 'marinaPickup', text: 'Pick up the package at the Marina kiosk' },
      { type: 'goto', place: 'oldTownDrop', text: 'Deliver the package to Old Town Plaza' },
    ],
  },
  {
    id: 2,
    title: 'Getaway Driver',
    intro: 'Mara: "The heat is on. Steal a car and lose the cops — bring it to the hideout in one piece."',
    steps: [
      { type: 'drive', place: 'hideout', text: 'Steal a car (E) and drive it to the hideout', wanted: 2 },
    ],
  },
  {
    id: 3,
    title: 'Dockside',
    intro: 'Mara: "Rival crew took our dock. Clear them out — pistol out, eyes open."',
    steps: [
      { type: 'goto', place: 'docks', text: 'Head to the Docks' },
      { type: 'kill', place: 'docks', text: 'Clear out the rival crew', goons: 4 },
    ],
  },
  {
    id: 4,
    title: 'The Van Job',
    intro: 'Mara: "A bank van is running the Uptown route. Wreck it, grab the cash, don\'t get caught."',
    steps: [
      { type: 'chase', place: 'uptownBank', text: 'Chase the bank van and wreck it', van: true },
      { type: 'pickup', place: 'uptownBank', text: 'Grab the cash from the wreck' },
    ],
  },
  {
    id: 5,
    title: 'The Big One',
    intro: 'Mara: "Last job. Hit the Uptown Bank, then run for the Marina — every cop in Porto Verde will be on you."',
    steps: [
      { type: 'goto', place: 'uptownBank', text: 'Reach the Uptown Bank' },
      { type: 'pickup', place: 'uptownBank', text: 'Grab the bank cash', wanted: 4 },
      { type: 'escape', place: 'marinaPickup', text: 'Escape to the Marina and lose the cops' },
    ],
  },
];

export function missionCount() {
  return MISSIONS.length;
}

export function missionReward(index) {
  return MISSION_REWARDS[index] ?? 0;
}

/** The marker position for the current step, in world coordinates. */
export function stepTarget(mission, stepIndex, city) {
  const step = mission.steps[stepIndex];
  if (!step) return null;
  const place = city.places[step.place];
  return place ? { x: place.x, y: place.y, name: place.name } : null;
}

export function stepText(mission, stepIndex) {
  const step = mission.steps[stepIndex];
  return step ? step.text : '';
}

/** Distance that counts as "reached" for a goto/drive/pickup step. */
export function stepRadius(step) {
  return step && step.type === 'drive' ? 90 : 70;
}
