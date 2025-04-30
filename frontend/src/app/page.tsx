"use client";

import { createWsProvider } from "@/lib/websocket-provider/websocket-data-provider";
import { use, useEffect, useState } from "react";

const wsProvider = createWsProvider("ws://localhost:8080/ws/pvs");
export default function Home() {
  const [value, setValue] = useState(0);
  useEffect(() => {
    wsProvider.subscribe<number>("AI_1", (msg) => {
      console.log(msg);
      setValue(msg.value);
    });
    return () => wsProvider.unsubscribe("AI_1");
  }, []);
  return <div>{value}</div>;
}
