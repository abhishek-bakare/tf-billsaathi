import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateBill = (orderData) => {
  const doc = new jsPDF();

  // --- COMPANY HEADER ---
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(41, 128, 185); // Professional Blue
  doc.text("TAX INVOICE", 195, 20, null, null, "right");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text("Drushya Store", 14, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("123, Fashion Street, Shirdi", 14, 26);
  doc.text("Maharashtra, India - 423109", 14, 31);
  doc.text("GSTIN: 27ABCDE1234F1Z5", 14, 36);
  doc.text("Email: support@drushyastore.com", 14, 41);

  // --- SEPARATOR ---
  doc.setDrawColor(200);
  doc.line(14, 48, 196, 48);

  // --- INVOICE META ---
  const invoiceNo = orderData.id ? orderData.id.slice(0, 8).toUpperCase() : 'NEW';
  const invoiceDate = orderData.date?.seconds 
    ? new Date(orderData.date.seconds * 1000).toLocaleDateString('en-IN')
    : new Date().toLocaleDateString('en-IN');

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice Details:", 14, 58);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Invoice No:`, 14, 64);   doc.text(invoiceNo, 40, 64);
  doc.text(`Date:`, 14, 69);         doc.text(invoiceDate, 40, 69);
  doc.text(`Payment Mode:`, 14, 74); doc.text(orderData.paymentMethod || 'Cash', 40, 74);

  // --- BILL TO / SHIP TO ---
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", 120, 58);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(orderData.customerName || "Walk-in Customer", 120, 64);
  doc.text(`Phone: ${orderData.customerMobile || 'N/A'}`, 120, 69);
  
  // Wrap Address
  const address = orderData.shippingAddress || "Store Pickup";
  const splitAddress = doc.splitTextToSize(address, 75);
  doc.text(splitAddress, 120, 74);

  // --- ITEM TABLE ---
  const tableColumn = ["#", "Item Description", "HSN", "Qty", "Price", "GST", "Total"];
  const tableRows = [];

  if (orderData.items) {
      orderData.items.forEach((item, index) => {
        const baseTotal = Number(item.price) * item.qty;
        const gstRate = item.gst || 0;
        // If price is inclusive, back-calculate base? 
        // For simplicity assuming price stored is Selling Price.
        
        tableRows.push([
          index + 1,
          `${item.name}\n${item.color}/${item.size}`,
          item.hsn || '-',
          item.qty,
          Number(item.price).toFixed(2),
          `${gstRate}%`,
          (Number(item.price) * item.qty).toFixed(2)
        ]);
      });
  }

  autoTable(doc, {
    startY: 95,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 60 },
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'center' },
        6: { halign: 'right', fontStyle: 'bold' }
    },
    styles: { fontSize: 9, cellPadding: 3, valign: 'middle' }
  });

  // --- CALCULATIONS ---
  const finalY = doc.lastAutoTable.finalY + 10;
  let currentY = finalY;

  const subtotal = Number(orderData.subtotal || orderData.grandTotal); // Fallback
  const discount = Number(orderData.discount || 0);
  const shipping = Number(orderData.shipping || 0);
  const credit = Number(orderData.creditUsed || 0);
  const grandTotal = Number(orderData.grandTotal || 0);
  const paid = Number(orderData.paidAmount || 0);
  const due = Number(orderData.dueAmount || 0);

  // Right Aligned Totals
  const rightX = 195;
  const labelX = 140;

  doc.setFontSize(9);
  doc.text("Subtotal:", labelX, currentY);
  doc.text(`Rs. ${subtotal.toFixed(2)}`, rightX, currentY, null, null, "right");
  currentY += 5;

  if (discount > 0) {
    doc.setTextColor(22, 163, 74); // Green
    doc.text("Discount:", labelX, currentY);
    doc.text(`- Rs. ${discount.toFixed(2)}`, rightX, currentY, null, null, "right");
    doc.setTextColor(0);
    currentY += 5;
  }

  if (shipping > 0) {
    doc.text("Shipping:", labelX, currentY);
    doc.text(`Rs. ${shipping.toFixed(2)}`, rightX, currentY, null, null, "right");
    currentY += 5;
  }

  // Divider
  doc.setDrawColor(200);
  doc.line(labelX, currentY, rightX, currentY);
  currentY += 5;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Grand Total:", labelX, currentY);
  doc.text(`Rs. ${grandTotal.toFixed(2)}`, rightX, currentY, null, null, "right");
  currentY += 6;

  if (credit > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Wallet Used:", labelX, currentY);
      doc.text(`- Rs. ${credit.toFixed(2)}`, rightX, currentY, null, null, "right");
      currentY += 5;
  }

  // Final Pay Status
  currentY += 5;
  doc.setFontSize(10);
  if (due > 0) {
      doc.setTextColor(220, 38, 38); // Red
      doc.text(`Balance Due: Rs. ${due.toFixed(2)}`, rightX, currentY, null, null, "right");
  } else {
      doc.setTextColor(22, 163, 74); // Green
      doc.text("PAID IN FULL", rightX, currentY, null, null, "right");
  }

  // --- FOOTER ---
  const pageHeight = doc.internal.pageSize.height;
  const footerY = pageHeight - 30;

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  doc.text("Terms & Conditions:", 14, footerY);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("1. Goods once sold will not be taken back unless defective.", 14, footerY + 5);
  doc.text("2. Subject to Shirdi jurisdiction only.", 14, footerY + 9);
  doc.text("3. This is a computer generated invoice.", 14, footerY + 13);

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text("Authorized Signatory", 195, footerY, null, null, "right");
  doc.text("Drushya Store", 195, footerY + 15, null, null, "right");

  doc.save(`Invoice_${invoiceNo}.pdf`);
};