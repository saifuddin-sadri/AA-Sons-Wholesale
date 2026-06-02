const nodemailer = require('nodemailer');

/**
 * Send Email Notification via Brevo SMTP (Nodemailer)
 */
async function sendEmail(to, subject, html) {
  try {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.ADMIN_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || 'A.A. & Sons';

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error('SMTP credentials missing in .env (SMTP_HOST, SMTP_USER, SMTP_PASS)');
      return;
    }
    if (!to) {
      console.error('Recipient email is missing');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: to,
      subject: subject,
      html: html
    });

    console.log(`✅ Email sent to ${to} (messageId: ${info.messageId})`);
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.log('\n--- 📧 EMAIL CONTENT THAT FAILED TO SEND ---');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('\nHTML Content:');
    console.log(html);
    console.log('--------------------------------------------\n');
  }
}

const Notification = require('../models/Notification');

/**
 * Create an internal notification for the Admin Panel
 */
async function createAdminNotification(data) {
  try {
    await Notification.create(data);
    console.log(`Internal notification created: ${data.title}`);
  } catch (error) {
    console.error('Error creating internal notification:', error.message);
  }
}

/**
 * Notify Admin of New Order
 */
async function notifyNewOrder(order) {
  const subject = `New Order Received: ${order.orderNumber}`;
  const html = `
    <h2>New Order Notification</h2>
    <p><strong>Order Number:</strong> ${order.orderNumber}</p>
    <p><strong>Total Amount:</strong> ₹${order.total}</p>
    <p><strong>Customer:</strong> ${order.shippingAddress.name} (${order.shippingAddress.phone})</p>
    <p><strong>Items:</strong></p>
    <ul>
      ${order.items.map(item => `<li>${item.name} x ${item.quantity} - ₹${item.price * item.quantity}</li>`).join('')}
    </ul>
    <p>Check the admin dashboard for details.</p>
  `;

  // 1. Send Email
  await sendEmail(process.env.ADMIN_EMAIL, subject, html);

  // 2. Create Internal Notification
  await createAdminNotification({
    title: 'New Order Received',
    message: `Order #${order.orderNumber} placed by ${order.shippingAddress.name} for ₹${order.total}`,
    type: 'order',
    link: 'orders', // Frontend logic will handle this
    metadata: { orderId: order._id }
  });
}

/**
 * Notify Customer of Order Status Change
 */
async function notifyOrderStatusUpdate(order) {
  const customerEmail = order.shippingAddress.email || (order.user && order.user.email);

  if (customerEmail) {
    const subject = `Update on your Order ${order.orderNumber}`;
    const html = `
      <div style="font-family: sans-serif; color: #333;">
        <h2>Hello ${order.shippingAddress.name},</h2>
        <p>The status of your order <strong>${order.orderNumber}</strong> has been updated.</p>
        <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; border-left: 5px solid #d4af37;">
          <p><strong>New Status:</strong> <span style="text-transform: capitalize;">${order.status}</span></p>
        </div>
        <p>Thank you for shopping with A.A. & Sons!</p>
      </div>
    `;
    await sendEmail(customerEmail, subject, html);
  }

  // Always create internal notification for admin
  await createAdminNotification({
    title: 'Order Status Updated',
    message: `Order #${order.orderNumber} status changed to ${order.status}`,
    type: 'status',
    link: 'orders',
    metadata: { orderId: order._id }
  });
}

/**
 * Notify Admin of Low Stock
 */
async function notifyLowStock(product, variant = null) {
  const stock = variant ? variant.stock : product.stock;
  const name = variant ? `${product.name} (${variant.color || ''} ${variant.size || ''})` : product.name;
  
  await createAdminNotification({
    title: stock <= 0 ? 'Out of Stock Alert' : 'Low Stock Alert',
    message: `${name} is ${stock <= 0 ? 'out of stock' : `running low (${stock} units left)`}`,
    type: 'stock',
    link: 'inventory',
    metadata: { productId: product._id }
  });
}

/**
 * Notify Admin of Payment Proof Submission
 */
async function notifyPaymentProof(order) {
  await createAdminNotification({
    title: 'Payment Proof Submitted',
    message: `Payment proof received for Order #${order.orderNumber}. Please verify.`,
    type: 'order',
    link: 'orders',
    metadata: { orderId: order._id }
  });
}

async function notifyOrderTrackingUpdate(order) {
  const customerEmail = order.shippingAddress.email || (order.user && order.user.email);
  if (!customerEmail) return;

  const subject = `Tracking Details for your Order ${order.orderNumber}`;
  const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
      <h2 style="color: #1B5E4B; text-align: center;">Order Shipped!</h2>
      <p>Hello <strong>${order.shippingAddress.name}</strong>,</p>
      <p>Great news! Your order <strong>${order.orderNumber}</strong> has been shipped and is on its way to you.</p>
      
      <div style="background: #F9F5EF; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #C8873A;">
        <h3 style="margin-top: 0; color: #C8873A;">Tracking Details</h3>
        <p style="margin: 5px 0;"><strong>Delivery Company:</strong> ${order.tracking.company}</p>
        <p style="margin: 5px 0;"><strong>Tracking ID:</strong> ${order.tracking.id}</p>
        ${order.tracking.phone ? `<p style="margin: 5px 0;"><strong>Company Contact:</strong> ${order.tracking.phone}</p>` : ''}
        
        <div style="text-align: center; margin-top: 20px;">
          <a href="${order.tracking.url}" style="background: #1B5E4B; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Track Your Order</a>
        </div>
      </div>
      
      <p>If the button above doesn't work, you can copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #666; font-size: 0.9rem;">${order.tracking.url}</p>
      
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 0.85rem; color: #888; text-align: center;">Thank you for shopping with A.A. & Sons!</p>
    </div>
  `;

  await sendEmail(customerEmail, subject, html);
}

module.exports = {
  sendEmail,
  notifyNewOrder,
  notifyOrderStatusUpdate,
  notifyOrderTrackingUpdate,
  notifyLowStock,
  notifyPaymentProof,
  createAdminNotification
};
