import Chat from "@/app/ui/chat";
import DatePicker from "@/app/ui/date-picker";

export default function Stats() {
  return (
    <div className="flex h-[calc(100vh-40px)]">
      <div className="flex-1 flex flex-col min-w-0">
        <DatePicker />
        <div className="flex-1 min-h-0 bg-[#C9C6C0] overflow-y-auto grid gap-4 grid-cols-2 grid-rows-[220px_160px_160px_180px_180px] [grid-template-areas:'a_a'_'b_c'_'b_d'_'e_f'_'e_f'] p-4">
          <div className="[grid-area:a] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]">
            <h1 className="text-4xl  text-center pt-2">
              Total time spent on task:{" "}
            </h1>
            <h1 className="text-9xl text-center pt-2">00h00m</h1>
          </div>
          <div className="[grid-area:b] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]">
            <h1 className="p-4 text-center">Websites used: </h1>
            <div className="grid grid-cols-2 w-full">
              <p className="p-4 justify-self-start self-center">www.google.com</p>
              <p className="text-2xl p-4 justify-self-end self-center">00h06m</p>
            </div>
            <div className="grid grid-cols-2 w-full">
              <p className="p-4  justify-self-start self-center">www.youtube.com</p>
              <p className="text-2xl p-4 justify-self-end self-center">20h59m</p>
            </div>
            <div className="grid grid-cols-2 w-full">
              <p className="p-4 justify-self-start self-center">www.reddit.com</p>
              <p className="text-2xl p-4 justify-self-end self-center">01h30m</p>
            </div>
          </div>
          <div className="[grid-area:c] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]">
            <h1 className="p-4 text-center text-xl">Average Focus Score</h1>
            <h1 className="text-center text-6xl">0.0/10.0</h1>
          </div>
          <div className="[grid-area:d] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]">
            <h1 className="p-4 text-center text-xl">Tasks Completed Today</h1>
            <h1 className="text-center text-6xl">5 Tasks</h1>
          </div>
          <div className="[grid-area:e] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]">
            <h1 className="p-4 text-center text-xl">Time spent in each category</h1>
          </div>
          <div className="[grid-area:f] rounded-xl border border-[#b8b5ae] bg-[#E4E0D8]">
            <h1 className="p-4 text-center text-xl">Time Spent on Task in past week</h1>
          </div>
        </div>
      </div>
      <Chat />
    </div>
  );
}
