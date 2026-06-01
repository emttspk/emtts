export default function PostageArticleTable({ rows }: { rows: Array<{ serviceCode: string; weightGrams: number; postageAmount: number }> }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead><tr><th>Service</th><th>Weight(g)</th><th>Postage</th></tr></thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={`${row.serviceCode}-${idx}`} className="border-t">
            <td>{row.serviceCode}</td><td>{row.weightGrams}</td><td>Rs. {row.postageAmount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
