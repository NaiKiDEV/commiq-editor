import type { UpgradeDef } from "../../../shared/repo-tycoon-types";

export const UPGRADES: UpgradeDef[] = [
  // ─── TOOLING ───────────────────────────────────────────────────────────────
  {
    id: "editor",
    category: "tooling",
    name: "Editor",
    emoji: "⌨️",
    flavorText: "Whatever you type the code into.",
    tiers: [
      {
        level: 1,
        name: "Vim",
        cost: { resource: "stars", amount: 3 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 2 }],
        description: "hjkl your way to 2× LoC/sec.",
      },
      {
        level: 2,
        name: "VSCode",
        cost: { resource: "stars", amount: 35 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 2.5 }],
        description: "IntelliSense and 40 000 extensions. 2.5× on top.",
      },
      {
        level: 3,
        name: "Cursor",
        cost: { resource: "stars", amount: 800 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 2 }],
        description: "AI autocompletes the boring parts. 2× on top.",
      },
      {
        level: 4,
        name: "Multi-Agent IDE",
        cost: { resource: "stars", amount: 30_000 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 2.5 }],
        description:
          "Five LLMs argue about your indentation in real time. 2.5× on top.",
      },
      {
        level: 5,
        name: "Bespoke LLM Forge",
        cost: { resource: "stars", amount: 800_000 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 3 }],
        description:
          "Fine-tuned on your own codebase. Knows your bad habits. 3× on top.",
      },
    ],
  },
  {
    id: "package-manager",
    category: "tooling",
    name: "Package Manager",
    emoji: "📦",
    flavorText: "node_modules weighs more than the observable universe.",
    tiers: [
      {
        level: 1,
        name: "npm",
        cost: { resource: "stars", amount: 5 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 1 }],
        description: "+1 LoC/sec. At least it installs things eventually.",
      },
      {
        level: 2,
        name: "Yarn",
        cost: { resource: "stars", amount: 55 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 4 }],
        description: "+4 LoC/sec. Workspaces and a lock file you can read.",
      },
      {
        level: 3,
        name: "pnpm",
        cost: { resource: "stars", amount: 1_500 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 15 }],
        description: "+15 LoC/sec. Symlinked, fast, pedantic about peer deps.",
      },
      {
        level: 4,
        name: "Bun",
        cost: { resource: "stars", amount: 60_000 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 45 }],
        description: "+45 LoC/sec. Blazing fast. Rewrote it in Zig.",
      },
    ],
  },
  {
    id: "ai-assistant",
    category: "tooling",
    name: "AI Assistant",
    emoji: "🤖",
    flavorText: "Finish my sentence. No, the other sentence.",
    tiers: [
      {
        level: 1,
        name: "GitHub Copilot",
        cost: { resource: "stars", amount: 20 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 1.8 }],
        description: "Tab-complete your way to glory. 1.8× LoC/sec.",
      },
      {
        level: 2,
        name: "Claude Code",
        cost: { resource: "stars", amount: 400 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 2 }],
        description: "Explains, refactors, implements. 2× LoC/sec on top.",
      },
      {
        level: 3,
        name: "Agentic Pipeline",
        cost: { resource: "stars", amount: 8_000 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 2 }],
        description: "Opens PRs while you sleep. 2× LoC/sec on top.",
      },
      {
        level: 4,
        name: "Autonomous Fleet",
        cost: { resource: "stars", amount: 350_000 },
        effects: [{ type: "tick_rate_mult", resource: "loc", mult: 3 }],
        description:
          "A hundred agents pair-programming in parallel. 4× LoC/sec on top.",
      },
    ],
  },
  // ─── TEAM ──────────────────────────────────────────────────────────────────
  {
    id: "team",
    category: "team",
    name: "Developers",
    emoji: "👥",
    flavorText: "Warm bodies that type code.",
    tiers: [
      {
        level: 1,
        name: "Junior Dev",
        cost: { resource: "stars", amount: 8 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 2 }],
        description: "+2 LoC/sec. Will ask a lot of questions.",
      },
      {
        level: 2,
        name: "Senior Dev",
        cost: { resource: "stars", amount: 200 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 8 }],
        description: "+8 LoC/sec. Will complain about the architecture.",
      },
      {
        level: 3,
        name: "10× Engineer",
        cost: { resource: "stars", amount: 3_500 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 30 }],
        description: "+30 LoC/sec. Opinions as strong as the output.",
      },
      {
        level: 4,
        name: "Staff Engineers",
        cost: { resource: "stars", amount: 60_000 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 100 }],
        description:
          "+100 LoC/sec. Now requires an RFC to change a variable name.",
      },
      {
        level: 5,
        name: "VP of Engineering",
        cost: { resource: "stars", amount: 1_200_000 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 350 }],
        description:
          "+350 LoC/sec. Also introduced quarterly planning. Sorry.",
      },
    ],
  },
  {
    id: "contractors",
    category: "team",
    name: "Contractors",
    emoji: "🧑‍💼",
    flavorText: "Ship fast, invoice faster.",
    tiers: [
      {
        level: 1,
        name: "Freelancer",
        cost: { resource: "stars", amount: 18 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 3 }],
        description:
          "+3 LoC/sec. Disappears after the first milestone. Classic.",
      },
      {
        level: 2,
        name: "Agency",
        cost: { resource: "stars", amount: 400 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 12 }],
        description:
          "+12 LoC/sec. Comes with a PM who sends updates about updates.",
      },
      {
        level: 3,
        name: "Offshore Squad",
        cost: { resource: "stars", amount: 6_000 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 45 }],
        description:
          "+45 LoC/sec. Async-first, thorough comments, ships while you sleep.",
      },
      {
        level: 4,
        name: "Distributed Dev Shop",
        cost: { resource: "stars", amount: 130_000 },
        effects: [{ type: "flat_add_per_sec", resource: "loc", amount: 150 }],
        description: "+150 LoC/sec. Three timezones. Zero meetings.",
      },
    ],
  },
  {
    id: "oss-program",
    category: "team",
    name: "OSS Program",
    emoji: "🤝",
    flavorText: "Turn users into contributors.",
    tiers: [
      {
        level: 1,
        name: "CONTRIBUTING.md",
        cost: { resource: "stars", amount: 30 },
        effects: [
          { type: "grant_resource", resource: "contributors", amount: 2 },
          { type: "flat_add_per_sec", resource: "loc", amount: 1 },
        ],
        description: "A polite guide. +2 contributors, +1 LoC/sec.",
      },
      {
        level: 2,
        name: "Good First Issues",
        cost: { resource: "stars", amount: 600 },
        effects: [
          { type: "grant_resource", resource: "contributors", amount: 5 },
          { type: "flat_add_per_sec", resource: "loc", amount: 5 },
        ],
        description:
          "Labels that actually work. +5 contributors, +5 LoC/sec.",
      },
      {
        level: 3,
        name: "Summer of Code",
        cost: { resource: "stars", amount: 10_000 },
        effects: [
          { type: "grant_resource", resource: "contributors", amount: 12 },
          { type: "flat_add_per_sec", resource: "loc", amount: 20 },
        ],
        description:
          "Paid interns from around the world. +12 contributors, +20 LoC/sec.",
      },
      {
        level: 4,
        name: "Foundation Grant",
        cost: { resource: "stars", amount: 400_000 },
        effects: [
          { type: "grant_resource", resource: "contributors", amount: 30 },
          { type: "flat_add_per_sec", resource: "loc", amount: 60 },
        ],
        description:
          "Nonprofit status and corporate backing. +30 contributors, +60 LoC/sec.",
      },
    ],
  },
  // ─── CI/CD ─────────────────────────────────────────────────────────────────
  {
    id: "cicd",
    category: "cicd",
    name: "CI/CD",
    emoji: "🔁",
    flavorText: "Automates the boring ship.",
    tiers: [
      {
        level: 1,
        name: "Jenkins",
        cost: { resource: "stars", amount: 15 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 1.33,
          },
        ],
        description: "Plugins everywhere. 25% fewer commits per PR.",
      },
      {
        level: 2,
        name: "GitHub Actions",
        cost: { resource: "stars", amount: 300 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 1.5,
          },
        ],
        description:
          "YAML as far as the eye can see. 50% fewer commits per PR.",
      },
      {
        level: 3,
        name: "Self-hosted Runners",
        cost: { resource: "stars", amount: 4_000 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 1.66,
          },
        ],
        description: "Big iron. 66% fewer commits per PR.",
      },
      {
        level: 4,
        name: "Turborepo / Nx",
        cost: { resource: "stars", amount: 80_000 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 2,
          },
        ],
        description:
          "Incremental builds, remote cache. 2× fewer commits per PR.",
      },
      {
        level: 5,
        name: "Bazel Monorepo",
        cost: { resource: "stars", amount: 1_500_000 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 2.5,
          },
        ],
        description:
          "Google-grade build system. 2.5× fewer commits per PR. Config takes a week.",
      },
    ],
  },
  {
    id: "test-suite",
    category: "cicd",
    name: "Test Suite",
    emoji: "🧪",
    flavorText: "Green means go.",
    tiers: [
      {
        level: 1,
        name: "Unit Tests",
        cost: { resource: "stars", amount: 25 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.25,
          },
        ],
        description: "Confidence at the function level. 1.25× stars per PR.",
      },
      {
        level: 2,
        name: "Integration Tests",
        cost: { resource: "stars", amount: 500 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.4,
          },
        ],
        description:
          "Services actually talk to each other. 1.4× stars per PR.",
      },
      {
        level: 3,
        name: "E2E Tests",
        cost: { resource: "stars", amount: 7_000 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.6,
          },
        ],
        description:
          "Playwright clicks through the whole app. 1.6× stars per PR.",
      },
      {
        level: 4,
        name: "Mutation Testing",
        cost: { resource: "stars", amount: 250_000 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 2,
          },
        ],
        description:
          "Stryker mutates your code; your tests must notice. 2× stars per PR.",
      },
    ],
  },
  {
    id: "deploy-pipeline",
    category: "cicd",
    name: "Deployment",
    emoji: "🚀",
    flavorText: "Getting it to the people.",
    tiers: [
      {
        level: 1,
        name: "Heroku",
        cost: { resource: "stars", amount: 40 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 1.2,
          },
        ],
        description: "git push heroku main. 1.2× fewer commits per PR.",
      },
      {
        level: 2,
        name: "Docker + VPS",
        cost: { resource: "stars", amount: 800 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 1.4,
          },
        ],
        description: "Containers all the way down. 1.4× fewer commits per PR.",
      },
      {
        level: 3,
        name: "Kubernetes",
        cost: { resource: "stars", amount: 12_000 },
        effects: [
          {
            type: "conversion_threshold_div",
            from: "commits",
            to: "prs",
            div: 1.6,
          },
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.3,
          },
        ],
        description:
          "Blue-green deploys, zero downtime. 1.6× fewer commits/PR, 1.3× stars.",
      },
      {
        level: 4,
        name: "Edge Functions",
        cost: { resource: "stars", amount: 500_000 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.8,
          },
        ],
        description:
          "Runs at the network edge; users notice the speed. 1.8× stars per PR.",
      },
    ],
  },
  // ─── COMMUNITY ─────────────────────────────────────────────────────────────
  {
    id: "community",
    category: "community",
    name: "Documentation",
    emoji: "📖",
    flavorText: "People who actually use the thing.",
    tiers: [
      {
        level: 1,
        name: "README",
        cost: { resource: "stars", amount: 12 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.5,
          },
        ],
        description: "Minimum viable explanation. 1.5× stars per PR.",
      },
      {
        level: 2,
        name: "Docs Site",
        cost: { resource: "stars", amount: 140 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.33,
          },
          { type: "grant_resource", resource: "contributors", amount: 2 },
        ],
        description: "Real docs. 1.33× more stars per PR, +2 contributors.",
      },
      {
        level: 3,
        name: "Discord Server",
        cost: { resource: "stars", amount: 2_500 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.5,
          },
          { type: "grant_resource", resource: "contributors", amount: 5 },
        ],
        description:
          "A community hub with drama. 1.5× stars per PR, +5 contributors.",
      },
      {
        level: 4,
        name: "Video Tutorials",
        cost: { resource: "stars", amount: 50_000 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 2,
          },
          { type: "grant_resource", resource: "contributors", amount: 10 },
        ],
        description:
          '"Let me screenshare real quick." 2× stars per PR, +10 contributors.',
      },
      {
        level: 5,
        name: "Interactive Playground",
        cost: { resource: "stars", amount: 1_000_000 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 2.5,
          },
          { type: "grant_resource", resource: "contributors", amount: 25 },
        ],
        description:
          "Run in the browser, no install. 2.5× stars per PR, +25 contributors.",
      },
    ],
  },
  {
    id: "social",
    category: "community",
    name: "Social Media",
    emoji: "📣",
    flavorText: "Shout into the void, get stars back.",
    tiers: [
      {
        level: 1,
        name: "Dev.to Blog",
        cost: { resource: "stars", amount: 22 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.3,
          },
        ],
        description:
          "Long-form posts with syntax highlighting. 1.3× stars per PR.",
      },
      {
        level: 2,
        name: "Twitter/X Thread",
        cost: { resource: "stars", amount: 500 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.5,
          },
          { type: "event_chance_mult", mult: 1.2 },
        ],
        description:
          "1/🧵 release announcements. 1.5× stars, 1.2× event chance.",
      },
      {
        level: 3,
        name: "YouTube Channel",
        cost: { resource: "stars", amount: 7_000 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.8,
          },
          { type: "event_chance_mult", mult: 1.3 },
        ],
        description:
          "Deep-dive tutorials, algorithm breakdowns. 1.8× stars, 1.3× event chance.",
      },
      {
        level: 4,
        name: "Tech Podcast",
        cost: { resource: "stars", amount: 200_000 },
        effects: [
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 2.2,
          },
          { type: "event_chance_mult", mult: 1.5 },
        ],
        description:
          "Launched a 200-episode backlog. 2.2× stars, 1.5× event chance.",
      },
    ],
  },
  {
    id: "funding",
    category: "community",
    name: "Funding",
    emoji: "💎",
    flavorText: "Someone's paying for the dream.",
    tiers: [
      {
        level: 1,
        name: "OpenCollective",
        cost: { resource: "stars", amount: 120 },
        effects: [
          { type: "grant_resource", resource: "sponsors", amount: 1 },
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.2,
          },
        ],
        description: "+1 sponsor, 1.2× stars per PR.",
      },
      {
        level: 2,
        name: "GitHub Sponsors",
        cost: { resource: "stars", amount: 2_000 },
        effects: [
          { type: "grant_resource", resource: "sponsors", amount: 2 },
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.4,
          },
        ],
        description: "+2 sponsors, 1.4× stars per PR.",
      },
      {
        level: 3,
        name: "VC Seed Round",
        cost: { resource: "stars", amount: 30_000 },
        effects: [
          { type: "grant_resource", resource: "sponsors", amount: 5 },
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 1.8,
          },
          { type: "tick_rate_mult", resource: "loc", mult: 2 },
        ],
        description:
          "+5 sponsors, 1.8× stars, 2× LoC. They want 10× growth, though.",
      },
      {
        level: 4,
        name: "Series A",
        cost: { resource: "stars", amount: 600_000 },
        effects: [
          { type: "grant_resource", resource: "sponsors", amount: 10 },
          {
            type: "conversion_ratio_mult",
            from: "prs",
            to: "stars",
            mult: 2.5,
          },
          { type: "tick_rate_mult", resource: "loc", mult: 2 },
        ],
        description: "+10 sponsors, 2.5× stars, 2× LoC. Now you have a board.",
      },
    ],
  },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);
