export function formatMoney(value: number | null, currency: "USD" | "INR") {
  if (value === null) return "—";
  const symbol = currency === "INR" ? "₹" : "$";
  const sign = value < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
