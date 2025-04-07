const PDFDocument = require('pdfkit-table');
const fs = require('fs');

const doc = new PDFDocument({ margin: 30 }); // Crea el documento PDF con un margen de 30
const output = './data/invoices/test_invoice.pdf'; // Ruta de salida para el archivo PDF

doc.pipe(fs.createWriteStream(output)); // Ruta de salida para el archivo PDF

// Función para imprimir títulos y valores estilizados
function printTitleAndValue(doc, title, value, x, y) {
    doc
      .fontSize(10) // Cambiar el tamaño de la fuente de los títulos
      .fillColor('gray') // Cambiar el color de la fuente de los títulos
      .font('Helvetica-Bold') // Cambiar el estilo de la fuente (negrita)
      .text(title, x, y, { continued: true });
    doc
      .fillColor('#000080') // Cambiar el color de la fuente de los valores (azul oscuro)
      .text(value, { align: 'left' });
}

// Encabezado principal
doc
  .fontSize(24) // Cambiar el tamaño de la fuente del encabezado
  .font('Helvetica-Bold') // Cambiar el estilo de la fuente del encabezado
  .fillColor('#000080') // Cambiar el color de la fuente del encabezado (azul oscuro)
  .text('Factura', { align: 'left' });

doc
  .fontSize(10) // Cambiar el tamaño de la fuente para el bloque de texto
  .fillColor('gray') // Cambiar el color de la fuente para el bloque de texto
  .font('Helvetica-Bold') // Cambiar el estilo de la fuente para el bloque de texto
  .text('AURIDAL, S.L.\nAvda. de Madrid, 25-Nave C8\n28500 Arganda del Rey (MADRID)\nB-84603646', { align: 'right' });

// Número de factura y fecha
printTitleAndValue(doc, 'Número: ', '1762024', 30, 90);
printTitleAndValue(doc, 'Fecha: ', '24/10/2024', 30, 110);

// Información del cliente
printTitleAndValue(doc, 'Cliente: ', 'CELIA COBOS DE CASTRO', 30, 140);
printTitleAndValue(doc, 'Domicilio: ', 'c/ Manuela Silvela, s/n', 30, 155);
printTitleAndValue(doc, 'Ciudad: ', '47014 VALLADOLID', 30, 170);
printTitleAndValue(doc, 'NIF/CIF: ', '71174737H', 30, 185);

// Filas de productos y totales
const productRows = [
    ['128', '33156', '6,00', '4,95 €', '29,70 €', '21,00%', '35,94 €'],
    ['128', '33148', '6,00', '4,95 €', '29,70 €', '21,00%', '35,94 €'],
    ['128', '33152', '9,80', '4,95 €', '48,51 €', '21,00%', '58,70 €'],
    ['128', '33130', '12,00', '4,95 €', '59,40 €', '21,00%', '71,87 €'],
    ['151', '23048', '12,00', '4,95 €', '53,28 €', '21,00%', '64,47 €'],
    ['151', '23055', '12,00', '4,95 €', '59,40 €', '21,00%', '71,87 €'],
];
const totalRows = [
    ['', '', '', '', 'Subtotal', '', '279,99 €'],
    ['', '', '', '', 'Descuento', '', '0,00 €'],
    ['', '', '', '', 'Base Imponible', '', '279,99 €'],
    ['', '', '', '', 'I.V.A. 21,00%', '', '58,80 €'],
    ['', '', '', '', 'Portes', '', '16,45 €'],
    ['', '', '', '', 'I.V.A. Portes 21,00%', '', '3,45 €'],
    ['', '', '', '', 'Recargo equivalencia', '', '0,00 €'],
    ['', '', '', '', 'TOTAL FACTURA', '', '358,69 €'],
];

// Combinar las filas en una sola tabla
const tableRows = [...productRows, ...totalRows];

// Estilo general para la tabla
doc.fillColor('gray'); // Establecer color gris como color por defecto para toda la tabla
doc.table(
    {
      headers: ['Concepto', 'Descripción', 'Unidades', 'Precio Un.', 'Subtotal', '% IVA', 'Total'], // Cambiar el encabezado de la tabla
      rows: tableRows,
    },
    {
      width: doc.page.width - 60, // Ajustar el ancho de la tabla
      x: 30, // Posición en el eje X de la tabla
      y: 220, // Posición en el eje Y de la tabla
      columnSpacing: 5, // Espaciado entre columnas
      padding: 5, // Espaciado interno de las celdas
      borderColor: '#D3D3D3', // Cambiar el color del borde de la tabla
      headerBorder: ['L', 'T', 'B', 'R'], // Definir los bordes de los encabezados de la tabla
      prepareRow: (row, i) => {
        if (i < productRows.length) {
          doc.font('Helvetica-Bold').fillColor('black'); // Aplicar fuente en negrita y color negro a las filas de productos
        }
      },
    }
);

// Pie de página estilizado
doc.moveDown(1.5);
doc
  .fontSize(10) // Cambiar el tamaño de la fuente del pie de página
  .fillColor('black') // Cambiar el color de la fuente del pie de página
  .text('Cuenta bancaria:', 30, doc.y)
  .text('IBAN ES98 0182 7609 4602 0153 0236', { indent: 20 }) // Indentación del texto
  .moveDown(0.5)
  .text('Correo electrónico:', 30, doc.y)
  .text('marcosauridal@gmail.com', { indent: 20 })
  .moveDown(0.5)
  .text('Teléfono contacto:', 30, doc.y)
  .text('608.364.400 Giacinto', { indent: 20 });

doc.end(); // Finaliza la creación del documento PDF

console.log(`PDF generado: ${output}`);


