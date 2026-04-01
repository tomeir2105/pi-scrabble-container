import { Suspense } from "react";
import GameClient from "@/components/GameClient";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <GameClient view="entry" />
    </Suspense>
  );
}
