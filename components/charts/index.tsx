"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const loading = () => <Skeleton className="h-[240px] w-full" />;

export const LineChart = dynamic(() => import("./line-chart"), { ssr: false, loading });
export const BarChart = dynamic(() => import("./bar-chart"), { ssr: false, loading });
export const DonutChart = dynamic(() => import("./donut-chart"), { ssr: false, loading });
