import type { Metadata } from "next";
import { CtaBand, PageHero, Steps } from "@/components/site/marketing";
import { FlowDiagram } from "@/components/site/FlowDiagram";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Connect your business information, let Zotomic analyze it, and receive clear insights and actions every week.",
};

const STEPS = [
  {
    title: "Connect your data",
    text: "Add products and orders manually, import a CSV, or connect your Facebook Page. All optional, all skippable.",
  },
  {
    title: "Zotomic analyzes it",
    text: "Deterministic calculations turn raw numbers into revenue, profit, returns and trends — compared to the period before.",
  },
  {
    title: "You get insights & actions",
    text: "A weekly report tells you what changed, why it matters, and what to do next. Ask the assistant to dig deeper.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From data to decision, every week"
        subtitle="Zotomic is built around one loop: See what happened, understand why, act on it."
      />
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Steps items={STEPS} />
      </div>
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <FlowDiagram />
      </div>
      <CtaBand />
    </>
  );
}
