"use client";
import { PlanHome } from "./plan-home";
import { useAppNavigation } from "./app-shell";

export function HomeScreen() {
  const { navigate } = useAppNavigation();
  return (
    <PlanHome
      create={() => navigate("/plans/")}
    />
  );
}
