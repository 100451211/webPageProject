const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit-table');

function generateInvoicePDF(user, cart, invoiceNumber) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30 });
        const filePath = path.join(__dirname, `../data/invoices/invoice_${user.name}_${user.cif}_${invoiceNumber}.pdf`);
        const writeStream = fs.createWriteStream(filePath);

        doc.pipe(writeStream);

        // Header with custom style
        doc
            .fontSize(24)
            .font('Helvetica-Bold')
            .fillColor('#000080')
            .text('Factura', { align: 'left' });

        // Company details
        doc
            .fontSize(10)
            .fillColor('gray')
            .font('Helvetica-Bold')
            .text('AURIDAL, S.L.\nAvda. de Madrid, 25-Nave C8\n28500 Arganda del Rey (MADRID)\nB-84603646', { align: 'right' });

        // Invoice number and date
        printTitleAndValue(doc, 'Número: ', invoiceNumber.toString(), 30, 90);
        printTitleAndValue(doc, 'Fecha: ', new Date().toLocaleDateString(), 30, 110);

        // User details
        printTitleAndValue(doc, 'Cliente: ', `${user.name} ${user.surname}`, 30, 140);
        printTitleAndValue(doc, 'Domicilio: ', `${user.street}, ${user.street_num || 's/n'}`, 30, 155);
        printTitleAndValue(doc, 'Ciudad: ', `${user.postal_code} ${user.city}`, 30, 170);
        printTitleAndValue(doc, 'NIF/CIF: ', user.cif, 30, 185);

        // Prepare product table
        const tableRows = cart.map((item) => {
            const [concepto, descripcion] = item.productId.split('-');
            const quantity = item.quantity;
            const price = item.price;
            const itemSubtotal = quantity * price;
            const iva = 0.21 * itemSubtotal;
            const total = itemSubtotal + iva;

            return [
                concepto,
                descripcion,
                quantity,
                `${price.toFixed(2)} €`,
                `${itemSubtotal.toFixed(2)} €`,
                '21%',
                `${total.toFixed(2)} €`
            ];
        });

        // Add summary rows for totals
        let subtotal = tableRows.reduce((sum, row) => sum + parseFloat(row[4]), 0);
        const ivaTotal = subtotal * 0.21;
        const totalAmount = subtotal + ivaTotal;

        const totalRows = [
            ['', '', '', '', 'Subtotal', '', `${subtotal.toFixed(2)} €`],
            ['', '', '', '', 'I.V.A. 21%', '', `${ivaTotal.toFixed(2)} €`],
            ['', '', '', '', 'TOTAL FACTURA', '', `${totalAmount.toFixed(2)} €`]
        ];

        const allRows = [...tableRows, ...totalRows];

        // Table style
        doc.fillColor('gray');
        doc.table(
            {
                headers: ['Concepto', 'Descripción', 'Unidades', 'Precio Un.', 'Subtotal', '% IVA', 'Total'],
                rows: allRows,
            },
            {
                width: doc.page.width - 60,
                x: 30,
                y: 220,
                columnSpacing: 5,
                padding: 5,
                borderColor: '#D3D3D3',
                headerBorder: ['L', 'T', 'B', 'R'],
                prepareRow: (row, i) => {
                    if (i < tableRows.length) {
                        doc.font('Helvetica-Bold').fillColor('black');
                    }
                }
            }
        );

        // Footer
        doc.moveDown(1.5);
        const footerY = doc.y; // Capture the current y-coordinate for alignment

        // "Cuenta bancaria" column
        doc
            .fontSize(10)
            .fillColor('black')
            .text('Cuenta bancaria:', 30, footerY)
            .text('IBAN ES98 0182 7609 4602 0153 0236', 30, footerY + 12, { continued: true });

        // "Correo electrónico" column
        doc
            .text('Correo electrónico:', 250, footerY)
            .text('marcosauridal@gmail.com', 250, footerY + 12, { continued: true });

        // "Teléfono" column
        doc
            .text('Teléfono:', 470, footerY)
            .text('608.364.400 Giacinto', 470, footerY + 12);
        doc.end();

        writeStream.on('finish', () => {
            resolve(filePath);
        });

        writeStream.on('error', (error) => {
            reject(error);
        });
    });
}

// Helper function to print titles and values
function printTitleAndValue(doc, title, value, x, y) {
    doc
        .fontSize(10)
        .fillColor('gray')
        .font('Helvetica-Bold')
        .text(title, x, y, { continued: true });
    doc
        .fillColor('#000080')
        .text(value, { align: 'left' });
}




// OAuth2 setup for sending emails via Gmail
const oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);

oAuth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
});

async function sendInvoiceEmail(user, filePath) {
    try {
        const accessToken = await oAuth2Client.getAccessToken();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.EMAIL_USER,
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                refreshToken: process.env.REFRESH_TOKEN,
                accessToken: accessToken.token,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: [user.email, process.env.EMAIL_USER],
            subject: `Factura de AURIDAL S.L.`,
            text: `Adjuntamos la factura de su compra. Gracias por su pedido.`,
            attachments: [
                {
                    filename: `invoice_${user.name}_${user.surname}.pdf`,
                    path: filePath,
                },
            ],
        };

        await transporter.sendMail(mailOptions);
        console.log(`Invoice sent to ${user.email}`);
    } catch (error) {
        console.error('Error sending invoice email:', error);
    }
}

// Ensure both functions are exported
module.exports = {
    generateInvoicePDF,
    sendInvoiceEmail
};

