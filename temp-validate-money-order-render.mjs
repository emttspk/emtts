import { moneyOrderHtml } from './apps/api/dist/templates/labels.js';

const orders = [
  {
    mo_number: 'MOS24079999',
    TrackingID: 'VPL999000001',
    trackingNumber: 'VPL999000001',
    amount: '1500',
    amountRs: 1500,
    issueDate: '27-03-26',
    consigneeName: 'Receiver Benchmark',
    consigneeAddress: 'Benchmark Street, Lahore',
    consigneePhone: '03009990001',
    shipperName: 'Sender Benchmark',
    shipperAddress: 'Benchmark Road, Karachi',
    shipperPhone: '03119990001',
    CollectAmount: '1500',
    shipmentType: 'VPL'
  }
];

const html = moneyOrderHtml(orders);
const result = {
  hasBenchmarkPages: html.includes('<div class="page">'),
  pageCount: (html.match(/<div class="page">/g) || []).length,
  hasCardLayout: html.includes('mo-card'),
  hasBenchmarkMarker: html.includes('Free Bulk Dispatch &amp; Tracking'),
  sampleLength: html.length
};
console.log(JSON.stringify(result));
