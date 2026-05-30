import Card from "../Card";

type BreakdownRow = {
  rowNumber: number;
  serviceCode: string;
  senderCity: string;
  receiverCity: string;
  result: {
    articleCategory: string;
    postalProduct: string;
    weightGrams: number | null;
    chargeableWeightGrams: number | null;
    postageAmount: number | null;
    matchedSlab: string | null;
    warnings: string[];
    errors: string[];
  };
};

export default function PostageBreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  return (
    <Card className="border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Per Article Postage Breakdown</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-600">
              <th className="px-3 py-2 font-semibold">Row</th>
              <th className="px-3 py-2 font-semibold">Service</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-3 py-2 font-semibold">Actual (g)</th>
              <th className="px-3 py-2 font-semibold">Chargeable (g)</th>
              <th className="px-3 py-2 font-semibold">Postage</th>
              <th className="px-3 py-2 font-semibold">Matched Slab</th>
              <th className="px-3 py-2 font-semibold">Warnings</th>
              <th className="px-3 py-2 font-semibold">Errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber} className="border-t border-slate-100 align-top text-slate-700">
                <td className="px-3 py-2 font-medium">{row.rowNumber}</td>
                <td className="px-3 py-2">{row.serviceCode || "-"}</td>
                <td className="px-3 py-2">{row.result.articleCategory || "-"}</td>
                <td className="px-3 py-2">{row.result.postalProduct || "-"}</td>
                <td className="px-3 py-2">{row.result.weightGrams ?? "-"}</td>
                <td className="px-3 py-2">{row.result.chargeableWeightGrams ?? "-"}</td>
                <td className="px-3 py-2">{row.result.postageAmount === null ? "-" : `Rs. ${row.result.postageAmount}`}</td>
                <td className="px-3 py-2">{row.result.matchedSlab || "-"}</td>
                <td className="px-3 py-2">{row.result.warnings.length}</td>
                <td className="px-3 py-2">{row.result.errors.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
