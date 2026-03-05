/**
 * DriverSelector component
 *
 * Shows a grid of driver cards.  Clicking a card selects/deselects that driver.
 */

const TIRE_COLORS = {
  SOFT: "#e8002d",
  MEDIUM: "#ffd700",
  HARD: "#c0c0c0",
  INTER: "#39b54a",
  WET: "#0067ff",
  UNKNOWN: "#888888",
};

export default function DriverSelector({ drivers, selected, onSelect }) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="text-gray-400 text-sm py-4 text-center">
        No driver data available yet…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {drivers.map((d) => {
        const isSelected = selected === d.driver_number;
        const tireColor =
          TIRE_COLORS[d.tire_compound?.toUpperCase()] || TIRE_COLORS.UNKNOWN;

        return (
          <button
            key={d.driver_number}
            onClick={() => onSelect(isSelected ? null : d.driver_number)}
            className={`rounded-lg p-3 text-left transition-all border-2 ${
              isSelected
                ? "border-f1red bg-f1gray shadow-lg shadow-red-900/40"
                : "border-gray-700 bg-f1gray hover:border-gray-500"
            }`}
          >
            {/* Position badge */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-gray-400">
                P{d.position || "–"}
              </span>
              {/* Tire indicator */}
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: tireColor }}
                title={`${d.tire_compound} – ${d.tire_age} laps`}
              />
            </div>

            {/* Driver number */}
            <div className="text-2xl font-black text-white leading-none">
              {d.driver_number}
            </div>

            {/* Driver code */}
            <div className="text-xs font-semibold text-f1red mt-1 tracking-widest uppercase">
              {d.driver_code || "—"}
            </div>

            {/* Last lap */}
            <div className="text-xs text-gray-400 mt-1">
              {d.last_lap ? `${Number(d.last_lap).toFixed(3)}s` : "–"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
