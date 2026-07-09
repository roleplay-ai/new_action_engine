
import React from 'react';
import { ActionCard, League } from './types.ts';

export const ACTION_DECK: ActionCard[] = [
  {
    id: 'a1',
    theme: 'Accountability',
    title: 'End your next meeting by summarizing key takeaways and explicitly asking if anything was unclear',
    how: 'In the last 2 minutes, state: "Here is what I heard as our core decisions... does anyone have a different understanding or feels something is missing?"',
    why: 'Ambiguity is the enemy of action. Explicit summaries prevent misalignment and wasted effort.',
    points: 5,
    timeEstimate: '5 mins',
  },
  {
    id: 'a2',
    theme: 'Collaboration',
    title: 'Recognize and reward teams that achieve creative solutions or innovations through collaboration.',
    how: 'Send a quick shoutout in your shared channel specifically highlighting HOW two people or teams worked together to solve a complex problem.',
    why: 'What gets measured gets managed; what gets celebrated gets repeated.',
    points: 5,
    timeEstimate: '2 mins',
  },
  {
    id: 'a3',
    theme: 'Feedback',
    title: 'Ask for a "1% Improvement" Tip at the end of a project sync',
    how: 'Ask: "What is one thing we could do 1% better in our next sprint to make your life easier?"',
    why: 'Small continuous adjustments are more sustainable than large-scale overhauls.',
    points: 5,
    timeEstimate: '3 mins',
  },
  {
    id: 'a4',
    theme: 'Connection',
    title: 'Set time to connect with family or friends',
    how: 'Block 30 minutes in your personal calendar this week specifically for a call or visit with someone you haven\'t spoken to in over a month.',
    why: 'Social health directly impacts professional cognitive endurance.',
    points: 5,
    timeEstimate: '30 mins',
  },
  {
    id: 'a5',
    theme: 'Coaching',
    title: 'Connect your team member with a mentor in your network',
    how: 'Identify one growth area for a direct report and introduce them via email to someone in your network who excels in that area.',
    why: 'Expanding a team\'s network is the highest leverage coaching action a leader can take.',
    points: 5,
    timeEstimate: '10 mins',
  },
  {
    id: 'a6',
    theme: 'Collaboration',
    title: 'In your next project meeting, clearly define and document each team member\'s roles and responsibilities.',
    how: 'Create a simple RACI matrix or bulleted list during the call and share it immediately after.',
    why: 'Role clarity reduces friction and prevents duplicated effort.',
    points: 5,
    timeEstimate: '15 mins',
  }
];

export const POINT_VALUES = {
  READ: 1,
  ACCEPT: 3,
  HONESTY_SKIP: 1,
  CALENDAR_SYNC: 2,
  SUCCESS: 5,
  START_HABIT: 7,
  CEMENTED_HABIT: 10,
  WEEKLY_STREAK: 10,
  INACTION_DEDUCTION: -1,
};

export const getLeague = (points: number): League => {
  if (points >= 200) return League.Diamond;
  if (points >= 100) return League.Gold;
  if (points >= 50) return League.Silver;
  if (points >= 25) return League.Bronze;
  return League.Starter;
};

export const LEAGUE_COLORS: Record<League, string> = {
  [League.Starter]: '#94a3b8',
  [League.Bronze]: '#cd7f32',
  [League.Silver]: '#c0c0c0',
  [League.Gold]: '#ffd700',
  [League.Diamond]: '#b9f2ff',
};
