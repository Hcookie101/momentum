import Chat from "@/app/ui/chat";
import Calendar from "@/app/ui/calender";
export default function Schedule(){
    return(
        // Desktop: calendar + chat side by side. Phones: the calendar keeps
        // its own height and the chat docks below it — the page scrolls
        // instead of squeezing a 310px panel beside an 8-column grid.
        <div className="flex min-h-[calc(100vh-40px)] flex-col lg:h-[calc(100vh-40px)] lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col">
                {/* Page title band — matches the Goals/Obligations header so
                    every dashboard route keeps exactly one h1. */}
                <h1 className="border-b border-[#b8b5ae] px-3 pb-3 pt-4 font-serif text-[24px] font-medium leading-tight text-[#1D2525] sm:px-6">
                    Schedule
                </h1>
                <div className="min-h-0 flex-1">
                    <Calendar/>
                </div>
            </div>
            <Chat/>
        </div>
    );
}