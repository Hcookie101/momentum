"use client";

import { useState } from "react";

export default function Chat() {
  const [message, setMessage] = useState("");
  return (
    <div className="flex h-[calc(100vh-40px)] w-[310px] flex-col bg-[#1D2525]">
      <div className="flex-1"></div>
      <div className="p-3">
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="resize-none w-full px-4 pt-3.5 pb-11 h-[98px] rounded-lg bg-[#1D2525] text-white border-1 border-[#E4E0D8] placeholder:text-[#E4E0D8] placeholder:font-light"
            placeholder="Ask anything..."
          ></textarea>
          <button
            className="absolute bottom-2 right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-[#E4E0D8] transition-all hover:translate-x-0.5 hover:bg-white/10"
            onClick={() => {
              console.log(message);
              setMessage("");
            }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
