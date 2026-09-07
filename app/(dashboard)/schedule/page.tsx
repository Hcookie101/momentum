import Chat from "@/app/ui/chat";
import Calendar from "@/app/ui/calender";
export default function Schedule(){
    return(
        <div className="flex h-[calc(100vh-40px)]">
            <div className="flex-1">
                <Calendar/>
            </div>
            <Chat/>
        </div>
    );
}