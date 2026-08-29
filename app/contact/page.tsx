"use client";

import { motion } from "framer-motion";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const PLANS = [
  { value: "", label: "Select a plan..." },
  { value: "regular", label: "Regular — 1,000 BDT" },
  { value: "vip", label: "VIP — 10,000 BDT" },
  { value: "platinum", label: "Platinum — Custom" },
  { value: "consultation", label: "Free Consultation" },
];

function ContactForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    plan: "",
    business: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  useEffect(() => {
    const plan = searchParams.get("plan") ?? "";
    setForm((f) => ({ ...f, plan }));
  }, [searchParams]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16"
      >
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-black mb-2">Message Received!</h2>
        <p className="text-[var(--muted)]">
          We&apos;ll get back to you within 24 hours. Check your email for a
          confirmation.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold mb-1.5">
            Your Name *
          </label>
          <input
            name="name"
            required
            value={form.name}
            onChange={handleChange}
            placeholder="Ahmed Rahman"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5">
            Email Address *
          </label>
          <input
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold mb-1.5">
            Phone / WhatsApp
          </label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="+880 1xxx xxxxxx"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5">
            Interested Plan *
          </label>
          <select
            name="plan"
            required
            value={form.plan}
            onChange={handleChange}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
          >
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5">
          Your Business Name
        </label>
        <input
          name="business"
          value={form.business}
          onChange={handleChange}
          placeholder="My Awesome Shop"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5">
          Tell us about your project *
        </label>
        <textarea
          name="message"
          required
          value={form.message}
          onChange={handleChange}
          rows={4}
          placeholder="What kind of website do you need? What does your business do? Any specific features?"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all resize-none"
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-500 text-center -mb-2">
          Something went wrong. Please email us directly at hello@zotomic.com
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="gradient-btn text-white font-bold w-full py-3.5 rounded-xl text-sm disabled:opacity-70"
      >
        {status === "sending" ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}

export default function ContactPage() {
  return (
    <div className="pt-24 pb-24 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="inline-block text-xs font-bold uppercase tracking-widest gradient-text mb-3"
          >
            Contact
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl sm:text-6xl font-black mb-4"
          >
            Let&apos;s <span className="gradient-text">Work Together</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-[var(--muted)] text-lg"
          >
            Fill out the form and we&apos;ll reply within 24 hours.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Info */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            {[
              {
                icon: "📧",
                title: "Email",
                value: "hello@zotomic.com",
                href: "mailto:hello@zotomic.com",
              },
              {
                icon: "💬",
                title: "WhatsApp",
                value: "Message us",
                href: "#",
              },
              {
                icon: "🕐",
                title: "Response time",
                value: "Within 24 hours",
                href: null,
              },
              {
                icon: "📍",
                title: "Location",
                value: "Bangladesh",
                href: null,
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 flex items-center gap-4"
              >
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="text-xs text-[var(--muted)] font-semibold uppercase tracking-wide">
                    {item.title}
                  </p>
                  {item.href ? (
                    <a
                      href={item.href}
                      className="text-sm font-medium hover:text-purple-600 transition-colors"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <p className="text-sm font-medium">{item.value}</p>
                  )}
                </div>
              </div>
            ))}
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-3xl p-8"
          >
            <Suspense fallback={<div className="text-sm text-[var(--muted)]">Loading...</div>}>
              <ContactForm />
            </Suspense>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
