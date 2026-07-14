import { useEffect, useRef } from "react";

import Phaser from "phaser";

import { BattleScene } from "./BattleScene";
import type { ConnectionStatus } from "./network";

interface GameCanvasProps {
  roomCode: string;
  onStatus: (status: ConnectionStatus, detail: string, playerCount?: number) => void;
}

export const GameCanvas = ({ roomCode, onStatus }: GameCanvasProps) => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      backgroundColor: "#102d27",
      width: "100%",
      height: "100%",
      physics: { default: "arcade", arcade: { debug: false } },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, pixelArt: false },
      scene: [new BattleScene(roomCode, onStatus)]
    });
    return () => game.destroy(true);
  }, [roomCode, onStatus]);

  return <div className="game-canvas" ref={host} />;
};
