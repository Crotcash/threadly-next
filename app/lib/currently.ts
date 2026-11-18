
export function formatMaloti(amount: number): string {
  return `M ${amount.toLocaleString("en-LS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
