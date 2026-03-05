/**
 * LiveTiming component
 *
 * Full-detail timing table for all drivers.
 */

const TIRE_COLORS = {
  SOFT: "text-red-400",
  MEDIUM: "text-yellow-400",
  HARD: "text-gray-300",
  INTER: "text-green-400",
  WET: "text-blue-400",
};

function fmt(val, decimals = 3) {
  if (val === null || val === undefined) return "–";
  return Number(val).toFixed(decimals);
}

export default function LiveTiming({ drivers }) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="text-gray-400 text-sm py-6 text-center">
        Waiting for live timing data…
      </div>
    );
  }

  const sorted = [...drivers].sort(
    (a, b) => (a.position || 99) - (b.position || 99)
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
            <th className="py-2 pr-4 text-left">Pos</th>
            <th className="py-2 pr-4 text-left">Driver</th>
            <th className="py-2 pr-4 text-right">Last Lap</th>
            <th className="py-2 pr-4 text-right">S1</th>
            <th className="py-2 pr-4 text-right">S2</th>
            <th className="py-2 pr-4 text-right">S3</th>
            <th className="py-2 pr-4 text-center">Tyre</th>
            <th className="py-2 pr-4 text-right">Age</th>
            <th className="py-2 pr-4 text-center">DRS</th>
            <th className="py-2 text-right">Gap</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => {
            const tireClass =
              TIRE_COLORS[d.tire_compound?.toUpperCase()] || "text-gray-400";
            return (
              <tr
                key={d.driver_number}
                className="border-b border-gray-800 hover:bg-f1gray transition-colors"
              >
                <td className="py-2 pr-4 font-bold text-white">
                  {d.position || "–"}
                </td>
                <td className="py-2 pr-4">
                  <span className="font-black text-white">
                    {d.driver_number}
                  </span>
                  <span className="ml-2 text-xs text-f1red font-semibold tracking-widest uppercase">
                    {d.driver_code}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {fmt(d.last_lap)}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-purple-300">
                  {fmt(d.sector_1)}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-purple-300">
                  {fmt(d.sector_2)}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-purple-300">
                  {fmt(d.sector_3)}
                </td>
                <td className={`py-2 pr-4 text-center font-bold ${tireClass}`}>
                  {d.tire_compound ? d.tire_compound.charAt(0) : "–"}
                </td>
                <td className="py-2 pr-4 text-right text-gray-300">
                  {d.tire_age ?? "–"}
                </td>
                <td className="py-2 pr-4 text-center">
                  {d.drs_active ? (
                    <span className="text-green-400 font-bold text-xs">ON</span>
                  ) : (
                    <span className="text-gray-600 text-xs">–</span>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-gray-300">
                  {d.gap_to_car_ahead !== null && d.gap_to_car_ahead !== undefined
                    ? `+${fmt(d.gap_to_car_ahead)}`
                    : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
