export default function Logo({ light = false }) {
  return (
    <span
      className={`flex items-center gap-2.5 text-lg font-bold ${light ? "text-white" : "text-ink"}`}
    >
      <span
        className="h-6 w-6 rounded-full border-[5px] border-[#7b6cf6] border-t-transparent"
        aria-hidden="true"
      />
      AccessFlow
    </span>
  );
}
