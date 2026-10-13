import Icon from "./Icon";
import { card, iconBubble } from "../utils/ui";

export default function StatCard({ icon, label, value, note }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <span className={iconBubble}>
          <Icon name={icon} />
        </span>
        <div>
          <p className="font-semibold">{label}</p>
          {note && <p className="text-[13px] text-muted">{note}</p>}
        </div>
      </div>
      <p className="mt-3.5 text-3xl font-bold">{value}</p>
    </div>
  );
}
