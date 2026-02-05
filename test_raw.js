const RawPrinter = require('./src/utils/rawPrinter');

async function test() {
    console.log("Testing RawPrinter...");
    const dummyData = Buffer.from([0x1B, 0x40, 0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x0A, 0x1D, 0x56, 0x00]); // Reset, "Hello", Cut
    try {
        // Use a generic name or one that might exist
        const printerName = "POS-58"; // Adjust if needed
        console.log(`Sending dummy data to ${printerName}...`);
        await RawPrinter.printRaw(printerName, dummyData);
        console.log("✓ Success!");
    } catch (err) {
        console.error("✗ Failed:", err);
    }
}

test();
