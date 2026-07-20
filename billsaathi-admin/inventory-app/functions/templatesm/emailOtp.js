/**
 * Generates the HTML for Email OTP
 * @param {String} name - Customer Name
 * @param {String} otp - The 6-digit code
 * @returns {String} HTML String
 */
exports.getHtml = (name, otp) => {
    return `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <div style="max-width: 400px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; text-align: center;">
            <h2 style="color: #2563eb;">Verify Your Email</h2>
            <p>Hi ${name},</p>
            <p>Use the following One-Time Password (OTP) to complete your registration with Drushya Store.</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #111827; border-radius: 8px;">
              ${otp}
            </div>
            
            <p style="font-size: 12px; color: #666;">This code is valid for 10 minutes. Do not share it with anyone.</p>
          </div>
        </body>
      </html>
    `;
};