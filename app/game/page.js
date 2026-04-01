import { Suspense } from "react";
import GameClient from "@/components/GameClient";

export default function GamePage() {
  return (
    <Suspense fallback={null}>
      <GameClient view="game" />
    </Suspense>
  );
}
