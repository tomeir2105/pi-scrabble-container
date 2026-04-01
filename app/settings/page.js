import { Suspense } from "react";
import GameClient from "@/components/GameClient";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <GameClient view="settings" />
    </Suspense>
  );
}
