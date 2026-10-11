import ExtensionLinks from "./extension-links";

export const metadata = {
  title: "Settings · Momentum",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[28px] font-medium tracking-tight">Settings</h1>
      <div className="mt-6">
        <ExtensionLinks />
      </div>
    </div>
  );
}
