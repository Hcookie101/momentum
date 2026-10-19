import Chat from "@/app/ui/chat";
import Calendar from "@/app/ui/calender";
export default function Schedule(){
    return(
        // Desktop: calendar + chat side by side. Phones: the calendar keeps
        // its own height and the chat docks below it — the page scrolls
        // instead of squeezing a 310px panel beside an 8-column grid.
        <div className="flex min-h-[calc(100vh-40px)] flex-col lg:h-[calc(100vh-40px)] lg:flex-row">
            <div className="min-w-0 flex-1">
                <Calendar/>
            </div>
            <Chat/>
        </div>
    );
}