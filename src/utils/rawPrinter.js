const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Utility to send raw ESC/POS data to a Windows printer using PowerShell and Win32 API.
 * This avoids the need for the native 'printer' module.
 */
const RawPrinter = {
    /**
     * Sends raw bytes to a Windows printer
     * @param {string} printerName - Name of the printer as seen in Windows
     * @param {Buffer} data - ESC/POS command buffer
     * @returns {Promise<void>}
     */
    printRaw: (printerName, data) => {
        return new Promise((resolve, reject) => {
            if (os.platform() !== 'win32') {
                return reject(new Error('RawPrinter only supports Windows platform'));
            }

            // Create a temporary file for the binary data
            const tempFile = path.join(os.tmpdir(), `print_job_${Date.now()}.bin`);
            fs.writeFileSync(tempFile, data);

            // Create a temporary script file
            const tempScriptFile = path.join(os.tmpdir(), `print_script_${Date.now()}.ps1`);

            // PowerShell script using P/Invoke to call Win32 Spooler API
            const psScript = `
$data = [System.IO.File]::ReadAllBytes("${tempFile.replace(/\\/g, '/')}");
$printerName = "${printerName}";

$definition = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;

        di.pDocName = "MangoPOS Print Job";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    Int32 dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    EndPagePrinter(hPrinter);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@

try {
    Add-Type -TypeDefinition $definition -ErrorAction SilentlyContinue
} catch {}

$result = [RawPrinterHelper]::SendBytesToPrinter($printerName, $data)
if ($result) { exit 0 } else { exit 1 }
`;

            fs.writeFileSync(tempScriptFile, psScript, { encoding: 'utf8' });

            exec(`powershell -ExecutionPolicy Bypass -File "${tempScriptFile}"`, (error, stdout, stderr) => {
                // Cleanup temp files
                try { fs.unlinkSync(tempFile); } catch (e) { }
                try { fs.unlinkSync(tempScriptFile); } catch (e) { }

                if (error) {
                    console.error('PowerShell Raw Print Error:', stderr || stdout);
                    return reject(new Error(`Failed to print to ${printerName}: ${stderr || stdout || error.message}`));
                }
                resolve();
            });
        });
    },

    /**
     * Checks if a Windows printer is available (not offline or errored)
     * @param {string} printerName - Name of the printer
     * @returns {Promise<boolean>}
     */
    isPrinterAvailable: (printerName) => {
        return new Promise((resolve) => {
            if (os.platform() !== 'win32') return resolve(true);

            // Command to check if printer exists and get its status
            // Note: We avoid -ExpandProperty because it fails if property is null/missing
            const command = `powershell -Command "Get-Printer -Name '${printerName}' | Select-Object Name, PrinterStatus, WorkOffline | ConvertTo-Json"`;

            exec(command, (error, stdout) => {
                if (error) {
                    // Printer likely not found
                    console.error(`Printer '${printerName}' not found or inaccessible:`, error.message);
                    return resolve(false);
                }

                try {
                    const statusInfo = JSON.parse(stdout);

                    // Logic for availability:
                    // 1. If we can't get statusInfo, assume unavailable
                    if (!statusInfo) return resolve(false);

                    // 2. Check for explicit offline status in properties
                    const isWorkOffline = statusInfo.WorkOffline === true;
                    // PrinterStatus: 0=Normal, or string 'Normal'
                    const isStatusNormal = statusInfo.PrinterStatus === 0 ||
                        statusInfo.PrinterStatus === 'Normal' ||
                        !statusInfo.PrinterStatus; // If null, assume OK if found

                    // We are available if not explicitly working offline OR if status is normal
                    // Some drivers don't report WorkOffline correctly, so we trust PrinterStatus more
                    resolve(!isWorkOffline || isStatusNormal);
                } catch (e) {
                    // If JSON parse fails, at least the printer was found by Get-Printer
                    console.warn(`Could not parse status for '${printerName}', assuming available:`, e.message);
                    resolve(true);
                }
            });
        });
    }
};

module.exports = RawPrinter;
