const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const PORT = process.env.PORT || 3000;

// --- WELCOME ROUTE ---
app.get('/', (req, res) => {
  res.send('The Food Collective Backend is Online and Healthy! 🚀');
});

app.post('/api/create-order', async (req, res) => {
  try {
    // 1. Get the list of vendors from the request
    const { order, customer, vendorNotifications } = req.body;

    console.log("Received Order:", order.transactionRef);

    // Format the Item List for the Admin/Customer Email
    const itemListHtml = order.items.map(item => 
      `<li><strong>${item.quantity}x</strong> ${item.name} (ZMW ${item.price}) - <em>${item.vendor.name}</em></li>`
    ).join('');

    // --- EMAIL 1: VENDOR / BUSINESS OWNER (ADMIN) ---
    const adminMsg = {
      to: process.env.BUSINESS_OWNER_EMAIL ? process.env.BUSINESS_OWNER_EMAIL.split(',') : [],
      from: process.env.SENDER_EMAIL, // Must be verified in SendGrid
      subject: `New Order Alert! #${order.transactionRef}`,
      html: `
        <h2>New Order Received</h2>
        <p><strong>Ref:</strong> ${order.transactionRef}</p>
        <p><strong>Customer:</strong> ${customer.name} (${customer.phone})</p>
        <p><strong>Total:</strong> ZMW ${order.total}</p>
        <h3>Items to Fulfill:</h3>
        <ul>${itemListHtml}</ul>
      `,
    };

    // --- EMAIL 2: CUSTOMER RECEIPT ---
    const customerMsg = {
      to: customer.email,
      from: process.env.SENDER_EMAIL,
      subject: `Order Confirmation - The Food Collective`,
      html: `
        <h1>Thank you for your order!</h1>
        <p>Hi ${customer.name},</p>
        <p>We have received your payment via Mobile Money.</p>
        <p><strong>Order Ref:</strong> ${order.transactionRef}</p>
        <h3>Your Basket:</h3>
        <ul>${itemListHtml}</ul>
        <p><strong>Total Paid:</strong> ZMW ${order.total}</p>
        <hr/>
        <p>The Food Collective</p>
      `,
    };

    // --- EMAIL 3: INDIVIDUAL VENDOR NOTIFICATIONS ---
    // Loop through vendors and send them emails if provided
    const vendorPromises = [];
    
    if (vendorNotifications && vendorNotifications.length > 0) {
        console.log(`Processing ${vendorNotifications.length} vendor notifications...`);
        
        for (const vendor of vendorNotifications) {
            // Filter items specific to this vendor
            const vendorItems = order.items.filter(item => item.vendor.name === vendor.name);
            const vendorItemsHtml = vendorItems.map(item => 
                `<li><strong>${item.quantity}x</strong> ${item.name}</li>`
            ).join('');

            const msg = {
                to: vendor.email,
                from: process.env.SENDER_EMAIL,
                subject: `New Order for ${vendor.name} - #${order.id.slice(-6)}`,
                html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h2>New Order Received</h2>
                    <p>Hello <strong>${vendor.name}</strong>,</p>
                    <p>You have sold items in a new order from <strong>The Food Collective</strong>.</p>
                    
                    <div style="background: #f9f9f9; padding: 15px; margin: 20px 0;">
                    <strong>Customer:</strong> ${customer.name}<br/>
                    <strong>Delivery Method:</strong> ${order.deliveryMethod}
                    </div>

                    <h3>Items to Prepare:</h3>
                    <ul>
                    ${vendorItemsHtml}
                    </ul>

                    <p>Please have these ready for dispatch.</p>
                </div>
                `,
            };
            
            // Add to promises array to handle errors individually or collectively
            vendorPromises.push(
                sgMail.send(msg)
                    .then(() => console.log(`✅ Email sent to vendor: ${vendor.email}`))
                    .catch(err => console.error(`❌ Failed to email vendor ${vendor.email}:`, err))
            );
        }
    }

    // Send the main emails
    await sgMail.send(adminMsg);
    await sgMail.send(customerMsg);
    
    // Wait for vendor emails to finish
    await Promise.all(vendorPromises);

    res.status(200).json({ success: true, message: 'Emails sent successfully' });

  } catch (error) {
    console.error('Email Error:', error);
    if (error.response) {
      console.error(error.response.body);
    }
    res.status(500).json({ success: false, error: 'Failed to send emails' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
