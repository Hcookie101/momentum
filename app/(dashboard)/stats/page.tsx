import Chat from "@/app/ui/chat";

export default function Stats() {
  return (
    <div className="flex h-[calc(100vh-40px)] ">
      <div className="flex-1 bg-[#C9C6C0] h-full overflow-y-auto grid gap-4 grid-cols-2 grid-rows-[220px_160px_160px_180px_180px] [grid-template-areas:'a_a'_'b_c'_'b_d'_'e_f'_'e_f'] p-4">
        <div className="[grid-area:a] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]"></div>
        <div className="[grid-area:b] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]"></div>
        <div className="[grid-area:c] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]"></div>
        <div className="[grid-area:d] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]"></div>
        <div className="[grid-area:e] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]"></div>
        <div className="[grid-area:f] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]"></div>
      </div>
      <Chat />
    </div>
  );
}
