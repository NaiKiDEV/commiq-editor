import type { EventDef } from "../../../shared/repo-tycoon-types";

export const EVENTS: EventDef[] = [
  {
    id: "dependabot-wave",
    title: "Dependabot PR wave",
    description: "47 version bumps land at once. Rubber-stamp them.",
    emoji: "🤖",
    weight: 3,
    effects: [{ type: "grant_resource", resource: "commits", amount: 50 }],
  },
  {
    id: "so-viral",
    title: "Stack Overflow answer goes viral",
    description: "Someone linked your repo as the solution. Traffic spikes.",
    emoji: "⭐",
    weight: 2,
    effects: [{ type: "grant_resource", resource: "stars", amount: 60 }],
  },
  {
    id: "burnout",
    title: "Maintainer burnout",
    description: "You need a break. LoC rate halved for 30s.",
    emoji: "🫠",
    weight: 2,
    effects: [{ type: "tick_rate_mult", resource: "loc", mult: 0.5 }],
    durationSec: 30,
  },
  {
    id: "conference-talk",
    title: "Conference CFP accepted",
    description: "Talk drops, community grows.",
    emoji: "🎤",
    weight: 1,
    effects: [{ type: "grant_resource", resource: "contributors", amount: 3 }],
  },
  {
    id: "npm-spike",
    title: "npm download spike",
    description: "A popular framework listed you as a peer dependency.",
    emoji: "📈",
    weight: 2,
    effects: [{ type: "grant_resource", resource: "stars", amount: 120 }],
  },
  {
    id: "security-cve",
    title: "CVE disclosed",
    description:
      "A security researcher found an RCE. Patch is out, but trust takes a hit for 45s.",
    emoji: "🔒",
    weight: 2,
    effects: [{ type: "tick_rate_mult", resource: "loc", mult: 0.4 }],
    durationSec: 45,
  },
  {
    id: "hacktoberfest",
    title: "Hacktoberfest wave",
    description:
      "October arrives. Spam PRs and genuine fixes in equal measure.",
    emoji: "🎃",
    weight: 1,
    effects: [
      { type: "grant_resource", resource: "commits", amount: 120 },
      { type: "grant_resource", resource: "contributors", amount: 4 },
    ],
  },
  {
    id: "reddit-viral",
    title: "Reddit r/programming post",
    description: '"Came for the drama, stayed for the library."',
    emoji: "🔴",
    weight: 2,
    effects: [{ type: "grant_resource", resource: "stars", amount: 200 }],
  },
  {
    id: "prod-incident",
    title: "Production incident",
    description:
      "Someone was using you in prod. Their pager went off at 3am. Sorry.",
    emoji: "🚨",
    weight: 2,
    effects: [{ type: "tick_rate_mult", resource: "loc", mult: 0.35 }],
    durationSec: 20,
  },
  {
    id: "feature-freeze",
    title: "Quality sprint",
    description: "Team locks in for a 40s polish sprint. PRs land better.",
    emoji: "❄️",
    weight: 2,
    effects: [
      { type: "conversion_ratio_mult", from: "prs", to: "stars", mult: 2.5 },
    ],
    durationSec: 40,
  },
  {
    id: "good-first-issues",
    title: "Good First Issues blitz",
    description: "You labeled 20 easy issues. New contributors pour in for 60s.",
    emoji: "🌱",
    weight: 2,
    effects: [
      { type: "grant_resource", resource: "contributors", amount: 3 },
      { type: "flat_add_per_sec", resource: "loc", amount: 8 },
    ],
    durationSec: 60,
  },
  {
    id: "framework-shoutout",
    title: "Framework shoutout",
    description: "A popular framework's maintainer tweeted about you.",
    emoji: "🔊",
    weight: 1,
    effects: [{ type: "grant_resource", resource: "stars", amount: 400 }],
  },
  {
    id: "oss-grant",
    title: "Open source grant",
    description: "Applied for an NGI grant six months ago. It came through.",
    emoji: "💰",
    weight: 1,
    effects: [
      { type: "grant_resource", resource: "stars", amount: 600 },
      { type: "grant_resource", resource: "contributors", amount: 3 },
    ],
  },
  {
    id: "major-refactor",
    title: "Major refactor in progress",
    description: "Giant internal rewrite. 35s of slower output, better foundation.",
    emoji: "🏗️",
    weight: 2,
    effects: [{ type: "tick_rate_mult", resource: "loc", mult: 0.6 }],
    durationSec: 35,
  },
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e]),
);