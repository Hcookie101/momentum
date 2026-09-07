"use client";

import { useState } from "react";

export default function Chat() {
  const [message, setMessage] = useState("");
  return (
    <div className="flex h-[calc(100vh-40px)] w-[310px] flex-col bg-[#1D2525]">
      <div className="flex-1"></div>
      <div className="p-3 relative">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="resize-none w-full px-4 pb-10 pt-4 h-[98px] rounded-lg bg-[#1D2525] text-white border-1 border-[#E4E0D8] placeholder:text-[#E4E0D8] placeholder:font-light"
          placeholder="Ask anything..."
        ></textarea>
        <button
          className="absolute right-6 top-5 text-[28px] text-[#E4E0D8] transition-transform hover:translate-x-1"
          onClick={() => {
            console.log(message);
            setMessage("");
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
