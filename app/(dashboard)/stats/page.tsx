import Chat from "@/app/ui/chat";

export default function Stats() {
  return (
    <div className="flex h-[calc(100vh-40px)]">
      <div className="flex-1 bg-[#E4E0D8]"></div>
      <Chat />
    </div>
  );
}
