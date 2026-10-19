import ExtensionLinks from "./extension-links";
import DeleteBrowsingData from "./delete-browsing-data";
import SendFeedback from "./send-feedback";

export const metadata = {
  title: "Settings · Momentum",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-[28px] font-medium tracking-tight">Settings</h1>
      <div className="mt-6 space-y-6">
        <ExtensionLinks />
        <SendFeedback />
        <DeleteBrowsingData />
        <p className="text-[13px] leading-relaxed text-[#8a8780]">
          The extension only ever saves the <em>domain</em> and <em>seconds</em>{" "}
          per visit — never full URLs, page contents, or form data. Read the{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-[#1D2525]">
            privacy policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
