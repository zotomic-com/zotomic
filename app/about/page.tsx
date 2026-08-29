"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const PHASES = [
  {
    phase: "Phase 1",
    title: "Launch & Sell",
    status: "active",
    description:
      "Landing page live. Actively accepting Regular, VIP, and Platinum clients. Manual delivery with personal attention.",
  },
  {
    phase: "Phase 2",
    title: "Deliver & Grow",
    status: "upcoming",
    description:
      "Deliver all client websites. Build a library of proven templates. Hire support staff as order volume grows.",
  },
  {
    phase: "Phase 3",
    title: "Automate & Scale",
    status: "future",
    description:
      "AI-powered website generation from templates. SaaS dashboard for clients. Multi-language support. Expanding into new markets.",
  },
];

const VALUES = [
  { icon: "🎯", title: "Quality First", desc: "We never ship something we wouldn't be proud to put our name on." },
  { icon: "⚡", title: "Speed Matters", desc: "Fast sites, fast delivery. Every day counts in business." },
  { icon: "🤝", title: "Real Partnership", desc: "We treat every client's business like our own." },
  { icon: "🌱", title: "Built to Grow", desc: "Everything we build is scalable from day one." },
];

export default function AboutPage() {
  return (
    <div className="pt-24 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-20">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="inline-block text-xs font-bold uppercase tracking-widest gradient-text mb-3"
          >
            About Us
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl sm:text-6xl font-black mb-5"
          >
            We&apos;re Building{" "}
            <span className="gradient-text">What&apos;s Next</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-[var(--muted)] text-lg max-w-2xl mx-auto leading-relaxed"
          >
            Zotomic was founded with one goal: give small businesses in
            Bangladesh access to world-class websites and AI automation at
            prices that actually make sense.
          </motion.p>
        </div>

        {/* Mission */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-10 mb-16 text-center"
        >
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="text-2xl font-black mb-3">Our Mission</h2>
          <p className="text-[var(--muted)] leading-relaxed max-w-2xl mx-auto">
            To democratise access to modern web technology and AI automation
            for every small business — so they can compete, grow, and win
            regardless of their budget.
          </p>
        </motion.div>

        {/* Values */}
        <div className="mb-16">
          <h2 className="text-3xl font-black text-center mb-8">
            Our <span className="gradient-text">Values</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {VALUES.map((v, i) => (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 flex items-start gap-4 card-hover"
              >
                <span className="text-2xl">{v.icon}</span>
                <div>
                  <h3 className="font-bold mb-1">{v.title}</h3>
                  <p className="text-sm text-[var(--muted)]">{v.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Roadmap */}
        <div className="mb-16">
          <h2 className="text-3xl font-black text-center mb-8">
            Our <span className="gradient-text">Roadmap</span>
          </h2>
          <div className="space-y-4">
            {PHASES.map((p, i) => (
              <motion.div
                key={p.phase}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-5 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6"
              >
                <div className="shrink-0">
                  <div
                    className={`w-3 h-3 rounded-full mt-1.5 ${
                      p.status === "active"
                        ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                        : p.status === "upcoming"
                        ? "bg-yellow-400"
                        : "bg-[var(--border)]"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest gradient-text mb-1">
                    {p.phase}
                  </div>
                  <h3 className="font-bold text-lg mb-1">{p.title}</h3>
                  <p className="text-sm text-[var(--muted)]">{p.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-3xl font-black mb-3">
            Want to be part of this?
          </h2>
          <p className="text-[var(--muted)] mb-6">
            Early clients get the best prices. Slots are limited.
          </p>
          <Link
            href="/contact"
            className="gradient-btn text-white font-bold px-10 py-3.5 rounded-xl inline-block"
          >
            Get in Touch
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
