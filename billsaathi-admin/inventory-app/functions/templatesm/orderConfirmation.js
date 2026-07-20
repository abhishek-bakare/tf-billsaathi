/**
 * Generates the HTML for Order Confirmation
 * @param {Object} orderData - The full order object from Firestore
 * @param {String} orderId - The document ID
 * @returns {String} HTML String
 */
exports.getHtml = (orderData, orderId) => {
    const itemsList = orderData.items ? orderData.items.map(item => 
        `<li style="padding: 5px 0; border-bottom: 1px solid #eee;">
            <strong>${item.name}</strong> 
            <br/> 
            <span style="color: #666; font-size: 12px;">${item.color}/${item.size} x ${item.qty}</span>
            <span style="float: right;">₹${item.price}</span>
        </li>`
    ).join('') : '<li>Items list unavailable</li>';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
            .header { background-color: #f8f9fa; padding: 15px; text-align: center; border-bottom: 1px solid #ddd; }
            .content { padding: 20px 0; }
            .footer { text-align: center; font-size: 12px; color: #888; margin-top: 20px; }
            .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Order Confirmed!</h2>
              <p>Order #${orderId.slice(0, 8).toUpperCase()}</p>
            </div>
            <div class="content">
              <p>Hi ${orderData.customerName || 'Customer'},</p>
              <p>Thank you for shopping with Drushya Store. We have received your order and are getting it ready!</p>
              
              <h3>Order Summary</h3>
              <ul style="list-style: none; padding: 0;">
                ${itemsList}
              </ul>
              
              <div class="total">
                Total Paid: ₹${orderData.grandTotal}
              </div>
              
              <p style="margin-top: 20px;"><strong>Shipping Address:</strong><br/>
              ${orderData.shippingAddress}</p>
            </div>
            <div class="footer">
              <p>We will notify you when your item is shipped.</p>
              <p>Drushya Store Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
};